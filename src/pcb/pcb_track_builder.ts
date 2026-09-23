import { PCB, pcbTrackSegment, pcbGetTrackData } from './pcb.js';
import { generateUuid, formatCallSite, sourceFileForMetadata } from './pcb_utils.js';
import { IVia, IGeneratedElement, IPowerInfo, ITrackDetails, IViaPowerInfo, IGrLine } from './pcb_interfaces.js';
import logger from '../utils/logging.js';
import { RoutingError } from '../utils/errors.js';
import { calculateMinTraceWidth, calculateMinViaSize as calculateMinimumViaSize } from './pcb_routing_calculations.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';
import { validateFinite, validateNonNegative } from '../utils/numeric_validation.js';

export class TrackBuilder {
  private pcb: PCB;
  private currentPosition!: { x: number; y: number };
  private currentLayer: string = 'F.Cu';
  private currentWidth: number = 0.2;
  private elements: IGeneratedElement[] = [];
  private lastOperationSuccessful: boolean = true;
  private _powerInfo?: IPowerInfo;
  private _locked: boolean = false;
  private _net?: string;
  private _deferStaging: boolean = false;
  private _debug: boolean = false;
  /** 'src/board.ts:42' of the `new TrackBuilder(...)` call — the probe
   * target for netless routes (netted ones resolve via their net instead) */
  private _sourceSite?: string;

  constructor(pcb: PCB, options?: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }) {
    this.pcb = pcb;
    this._locked = options?.locked ?? false;
    this._debug = options?.debug ?? false;
    this._net = options?.net;
    this._deferStaging = options?.deferStaging ?? false;
    const site = getCallSite();
    if (site?.file) {
      const file = sourceFileForMetadata(site.file);
      if (file) this._sourceSite = `${file}:${site.line}`;
    }
  }

  /** declaration site of this builder ('file:line'), for trace probing */
  get sourceSite(): string | undefined {
    return this._sourceSite;
  }

  /** this route's polyline in board mm (y-down): start + every .to point */
  get points(): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    for (const el of this.elements) {
      if (el.type !== 'track') continue;
      const d = el.details as ITrackDetails;
      if (pts.length === 0) pts.push({ x: d.start.x, y: d.start.y });
      pts.push({ x: d.end.x, y: d.end.y });
    }
    return pts;
  }

  // positional OR object form (mirrors to()): from({x, y, layer, width})
  // and from({x, y}, layer, width) are both accepted
  from(startPos: { x: number; y: number; layer?: string; width?: number }, layer?: string, width?: number): this {
    if (!this.lastOperationSuccessful) return this;

    this.currentPosition = { x: startPos.x, y: startPos.y };
    this.currentLayer = startPos.layer ?? layer ?? this.currentLayer;
    this.currentWidth = startPos.width ?? width ?? this.currentWidth;

    return this;
  }

  powerInfo(info: IPowerInfo): this {
    this._powerInfo = {
      ...info,
      maxTempRise: info.maxTempRise ?? 10, // Default to 10 if not specified
      thickness: info.thickness ?? this.pcb.copper_thickness, // Default to PCB copper thickness if not specified
    };
    return this;
  }

  private calculateMinTrackWidth(current: number, layer: string, maxTempRise: number, thickness?: number): number {
    return calculateMinTraceWidth(current, layer, maxTempRise, thickness ?? this.pcb.copper_thickness);
  }

  // two call styles: to({x, y, layer, width}) — the object form — or the
  // positional to({x, y}, layer, width) matching from(); the positional
  // form kept hand-written chains like .to({x,y}, 'F.Cu', W) valid
  to(endPos: { x: number; y: number; layer?: string; width?: number }, layer?: string, width?: number): this {
    if (!this.lastOperationSuccessful) {
      const err = new RoutingError(formatSourceError(`Previous track operation failed`, this.getCallSite()));
      err.stack = err.message;
      throw err;
    }
    if (!this.currentPosition) {
      const err = new RoutingError(formatSourceError(`'from()' must be called before 'to()'`, this.getCallSite()));
      err.stack = err.message;
      throw err;
    }

    validateFinite(endPos.x, 'endPos.x');
    validateFinite(endPos.y, 'endPos.y');
    if (endPos.width !== undefined) validateNonNegative(endPos.width, 'endPos.width');

    const targetLayer = endPos.layer ?? layer ?? this.currentLayer;
    const targetWidth = endPos.width ?? width ?? this.currentWidth;

    // Calculate track length
    const dx = endPos.x - this.currentPosition.x;
    const dy = endPos.y - this.currentPosition.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // If power info exists, check if width is sufficient
    if (this._powerInfo) {
      const minWidth = this.calculateMinTrackWidth(
        this._powerInfo.current,
        targetLayer,
        this._powerInfo.maxTempRise!,
        this._powerInfo.thickness!,
      );

      // Round both widths to 3 decimal places for comparison
      const roundedMinWidth = Math.round(minWidth * 1000) / 1000;
      const roundedTargetWidth = Math.round(targetWidth * 1000) / 1000;
      if (roundedTargetWidth < roundedMinWidth) {
        const err = new RoutingError(
          formatSourceError(
            `Track width ${roundedTargetWidth}mm is too narrow for ${this._powerInfo.current}A current on ${targetLayer}. Minimum width should be ${roundedMinWidth.toFixed(3)}mm.`,
            this.getCallSite(),
          ),
        );
        err.stack = err.message;
        throw err;
      }
    }

    let persistentTrackUuid: string;
    let actualTrackData: IGrLine | null = null;

    if (!this._deferStaging) {
      // Normal behavior: stage the track immediately
      persistentTrackUuid = pcbTrackSegment(
        this.pcb,
        this.currentPosition,
        { x: endPos.x, y: endPos.y },
        targetWidth,
        targetLayer,
        this._locked,
        undefined,
        this._net,
      );

      // DEBUG: log that we staged a track immediately
      if (this._debug) {
        // Debug: only print when TYPECAD_DEBUG=1
        try {
          logger.debug(
            `[TrackBuilder][DEBUG] Staged track: uuid=${persistentTrackUuid}, from=(${this.currentPosition.x},${this.currentPosition.y}) -> (${endPos.x},${endPos.y}), layer=${targetLayer}, width=${targetWidth}, net=${this._net}`,
          );
        } catch (e) {
          logger.debug('[TrackBuilder][DEBUG] debug logging failed', e);
        }
      }

      // Get the actual track data from the PCB to include any preserved manual edits
      actualTrackData = pcbGetTrackData(this.pcb, persistentTrackUuid);
    } else {
      // Deferred staging: just generate a UUID but don't stage yet
      persistentTrackUuid = generateUuid();
    }

    this.elements.push({
      type: 'track',
      uuid: persistentTrackUuid,
      details: {
        start: { ...this.currentPosition },
        end: { x: endPos.x, y: endPos.y },
        width: actualTrackData ? actualTrackData.strokeWidth : targetWidth,
        layer: actualTrackData ? actualTrackData.layer : targetLayer,
        locked: actualTrackData?.locked ?? false,
        powerInfo: this._powerInfo,
      },
    });

    this.currentPosition = { x: endPos.x, y: endPos.y };
    this.currentLayer = targetLayer;
    this.currentWidth = targetWidth;
    return this;
  }

  private getCallSite(): { file: string; line: number; column: number; function: string } | null {
    const callSite = getCallSite();
    if (!callSite) {
      return null;
    }

    return {
      ...callSite,
      function: callSite.function || 'anonymous',
    };
  }

  private calculateMinViaSize(
    current: number,
    thickness?: number,
    debug: boolean = false,
  ): { size: number; drill: number } {
    const result = calculateMinimumViaSize(current, thickness ?? this.pcb.copper_thickness);

    if (debug) {
      logger.debug(`Via calculation for ${current}A:`);
      logger.debug(`  - Drill: ${result.drill.toFixed(3)}mm`);
      logger.debug(`  - Annular ring: 0.1mm`);
      logger.debug(`  - Total size: ${result.size.toFixed(3)}mm`);
    }

    return result;
  }

  via(
    params: { size?: number; drill?: number; layers?: string[]; net?: string; powerInfo?: IViaPowerInfo } = {},
  ): this {
    if (!this.lastOperationSuccessful) {
      const err = new RoutingError(formatSourceError(`Previous track operation failed`, this.getCallSite()));
      err.stack = err.message;
      throw err;
    }
    if (!this.currentPosition) {
      const err = new RoutingError(formatSourceError(`'from()' must be called before 'via()'`, this.getCallSite()));
      err.stack = err.message;
      throw err;
    }

    // the builder's net option flows to the via unless overridden per-via
    params.net = params.net ?? this._net;

    // If power info exists, calculate minimum via size
    if (params.powerInfo) {
      const minViaSize = this.calculateMinViaSize(
        params.powerInfo.current,
        params.powerInfo.thickness ?? this.pcb.copper_thickness,
        this._debug,
      );

      // Round to 3 decimal places
      const roundedSize = Math.round(minViaSize.size * 1000) / 1000;
      const roundedDrill = Math.round(minViaSize.drill * 1000) / 1000;

      if (!params.size || params.size < roundedSize) {
        params.size = roundedSize;
      }
      if (!params.drill || params.drill < roundedDrill) {
        params.drill = roundedDrill;
      }
    }

    // Fabrication floors: the IPC-2152 solve can demand a drill below any
    // fab's capability (a modest current at 35 µm plating needs ~0 mm of
    // barrel). Raise whatever is set to the board rules — never lower an
    // explicit larger choice.
    if (params.size !== undefined || params.drill !== undefined) {
      const floorDrill = this.pcb.rules.min_through_hole_diameter;
      const floorSize = Math.max(this.pcb.rules.min_via_diameter, floorDrill + 0.2);
      if (!params.drill || params.drill < floorDrill) params.drill = floorDrill;
      if (!params.size || params.size < floorSize) params.size = floorSize;
    }

    const viaComponent = this.pcb.via({
      at: this.currentPosition,
      size: params.size,
      drill: params.drill,
    });

    // Set the PCB position to match the via position
    // This is crucial because the serialization uses comp.pcb.x/y for positioning
    viaComponent.pcb.x = this.currentPosition.x;
    viaComponent.pcb.y = this.currentPosition.y;

    if (viaComponent.viaData) {
      if (params.layers && params.layers.length > 0) {
        viaComponent.viaData.layers = params.layers;
      }
      // Without an explicit span, default to a through via (F.Cu→B.Cu):
      // always valid, always cheap to manufacture, and the honest
      // default even when the track is currently on an inner layer.
      // (createVia already set this default; nothing to override.)

      if (params.net) {
        viaComponent.viaData.net = params.net;
      }

      this.pcb.place(viaComponent);

      this.elements.push({
        type: 'via',
        uuid: viaComponent.uuid!,
        details: {
          ...viaComponent.viaData,
          powerInfo: params.powerInfo,
        },
      });

      const viaActualLayers = viaComponent.viaData.layers!;
      if (viaActualLayers.length > 0) {
        if (viaActualLayers.includes(this.currentLayer) && viaActualLayers.length > 1) {
          this.currentLayer = viaActualLayers.find((l: string) => l !== this.currentLayer) || viaActualLayers[0];
        } else {
          this.currentLayer = viaActualLayers[0];
        }
      }
    } else {
      logger.warn(
        `[TrackBuilder] WARN: 'via()' creation on PCB failed or returned unexpected structure. Via not added to track elements.${formatCallSite(this.getCallSite())}`,
      );
      this.lastOperationSuccessful = false;
    }
    return this;
  }

  getElements(): IGeneratedElement[] {
    if (!this.lastOperationSuccessful) {
      logger.warn(
        `[TrackBuilder] WARN: getElements() called on a builder chain that had a failing operation. Results might be incomplete.${formatCallSite(this.getCallSite())}`,
      );
    }
    return this.elements;
  }

  get deferStaging(): boolean {
    return this._deferStaging;
  }
  get net(): string | undefined {
    return this._net;
  }
}
