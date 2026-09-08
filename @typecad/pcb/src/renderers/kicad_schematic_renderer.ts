import { Pin } from '../pin.js';
import { serialize, s, sym, yes, no } from '../sexpr/index.js';
import { UUID } from 'node:crypto';
import { SymbolLibraryManager } from '../symbol_library_manager.js';
import {
  logError,
  logWarning,
  displayName,
  GRID_UNIT_MM,
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
} from './schematic_visualizer_types.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { renderLabel } from './schematic_templates.js';
import { reportError } from '../utils/error_reporter.js';
import { DEFAULT_NET_PREFIX } from '../utils/constants.js';
import { deterministicUUID, stableIndex } from '../utils/deterministic_id.js';

interface RenderableSymbol {
  symbol?: string;
  reference: string;
  value: string;
  footprint?: string;
  sch: { x: number; y: number; rotation?: number };
  sourceInfo?: { file: string; line: number; variable?: string };
}

export class KiCADSchematic {
  lib_symbols: string[] = [];
  symbols: string[] = [];
  wires: string[] = [];
  labels: string[] = [];
  sheetname: string = '';
  #uuid: UUID | null = null;
  private symbolManager: SymbolLibraryManager;
  #pwrCounter = 0;
  #flgCounter = 0;
  #powerNetEntries: Map<string, { firstPinX: number; firstPinY: number }> = new Map();

  constructor(symbolManager: SymbolLibraryManager) {
    this.symbolManager = symbolManager;
  }

  /**
   * Derived from the sheet name so the same design always renders to
   * byte-identical output. Computed lazily because sheetname is assigned
   * after construction.
   */
  get uuid(): UUID {
    if (this.#uuid === null) {
      this.#uuid = deterministicUUID('sheet', this.sheetname) as UUID;
    }
    return this.#uuid;
  }

  update(component: RenderableSymbol): string | null {
    if (!component.symbol) {
      reportError('Component has no symbol defined.', component);
      return null;
    }

    if (!component.sch) {
      component.sch = { x: 0, y: 0, rotation: 0 };
      logWarning(
        `Component ${displayName(component)} missing schematic placement data (sch). Initializing to x=0, y=0 for potential random placement.`,
      );
    } else {
      if (component.sch.x === null || component.sch.x === undefined) {
        logWarning(
          `Component ${displayName(component)} missing sch.x. Initializing to 0 for potential random placement.`,
        );
        component.sch.x = 0;
      }
      if (component.sch.y === null || component.sch.y === undefined) {
        logWarning(
          `Component ${displayName(component)} missing sch.y. Initializing to 0 for potential random placement.`,
        );
        component.sch.y = 0;
      }
      if (component.sch.rotation === null || component.sch.rotation === undefined) {
        logWarning(`Component ${displayName(component)} missing sch.rotation. Defaulting to 0.`);
        component.sch.rotation = 0;
      }
    }

    if (component.sch.x === 0 && component.sch.y === 0) {
      logWarning(`Component ${displayName(component)} has coordinates (0,0). Placing deterministically.`);
      const maxX = Math.max(0, Math.ceil(PAGE_WIDTH_MM / GRID_UNIT_MM) - 1);
      const maxY = Math.max(0, Math.ceil(PAGE_HEIGHT_MM / GRID_UNIT_MM) - 1);
      // Stable per component identity: the same unplaced component lands on
      // the same cell every build, so output stays byte-identical.
      const seed = `${component.reference || component.value || 'anon'}`;
      const randXGrid = stableIndex(`x:${seed}`, maxX + 1);
      const randYGrid = stableIndex(`y:${seed}`, maxY + 1);
      component.sch.x = randXGrid * GRID_UNIT_MM;
      component.sch.y = randYGrid * GRID_UNIT_MM;
    }

    const symbolDef = this.symbolManager.getSymbolDefinition(component.symbol);
    if (!symbolDef) {
      logError(`Cannot update component ${displayName(component)}: Symbol ${component.symbol} definition not found.`);
      return null;
    }
    if (!this.lib_symbols.includes(symbolDef.serializedLibEntry)) {
      this.lib_symbols.push(symbolDef.serializedLibEntry);
    }

    const x = GRID_UNIT_MM * Math.round(component.sch.x / GRID_UNIT_MM);
    const y = GRID_UNIT_MM * Math.round(component.sch.y / GRID_UNIT_MM);
    component.sch.x = x;
    component.sch.y = y;

    const parts: unknown[] = [];
    parts.push(s('lib_id', component.symbol));
    parts.push(s('at', x, y, component.sch.rotation ?? 0));

    const propertiesToAdd = ['Reference', 'Value', 'Footprint'];
    const textOffsetY = 5.08;
    propertiesToAdd.forEach((propName) => {
      const key = propName.toLowerCase() as keyof RenderableSymbol;
      const propVal = component[key];
      if (propVal !== undefined && (typeof propVal === 'string' || typeof propVal === 'number')) {
        const propX = x;
        const propY = y + textOffsetY;
        parts.push(
          s(
            'property',
            propName,
            String(propVal),
            s('at', propX, propY, component.sch?.rotation ?? 0),
            s('effects', s('font', s('size', 1.27, 1.27)), s('hide', propName === 'Reference' ? no() : yes())),
          ),
        );
      }
    });

    if (component.reference) {
      parts.push(
        s(
          'instances',
          s('project', this.sheetname, s('path', `/${this.uuid}`, s('reference', component.reference), s('unit', 1))),
        ),
      );
    } else {
      logWarning(`Component ${displayName(component)} is missing a reference designator. Skipping instances entry.`);
    }

    return `(symbol ${parts.map((p) => serialize(p as Parameters<typeof serialize>[0])).join(' ')})`;
  }

  getAbsolutePinCoordinates(component: RenderableSymbol, pin: Pin): [number, number] | null {
    if (!component.symbol) {
      reportError('Component has no symbol.', component);
      return null;
    }
    if (!component.sch) {
      logError(`Component ${displayName(component)} has no schematic placement data.`);
      return null;
    }
    if (pin === undefined || pin.number === undefined) {
      logError(`Pin is malformed for component ${displayName(component)}.`);
      return null;
    }

    const pinLocation = this.symbolManager.getPinLocation(component.symbol, pin.number);
    if (!pinLocation) {
      return null;
    }

    const { x: relX, y: relY } = pinLocation;
    const rotation = component.sch.rotation ?? 0;
    const compX = component.sch.x;
    const compY = component.sch.y;

    const angleRad = (rotation * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const rotatedX = relX * cosA - relY * sinA;
    const rotatedY = relX * sinA + relY * cosA;

    const absX = compX + rotatedX;
    const absY = compY - rotatedY;

    const snappedX = GRID_UNIT_MM * Math.round(absX / GRID_UNIT_MM);
    const snappedY = GRID_UNIT_MM * Math.round(absY / GRID_UNIT_MM);

    return [snappedX, snappedY];
  }

  net(node: ISchematicNode): void {
    if (node.nodes.length === 0) {
      logWarning(`Net "${node.name}" has no pins. Skipping.`);
      return;
    }

    const netName = node.name.replaceAll(' ', '_');

    for (const pinDef of node.nodes) {
      if (!pinDef.owner) {
        logWarning(`Net "${netName}", pin ${pinDef.number}: Pin has no owner. Skipping label.`);
        continue;
      }

      const absCoords = this.getAbsolutePinCoordinates(pinDef.owner, pinDef);
      if (!absCoords) {
        logWarning(
          `Net "${netName}", pin ${displayName(pinDef.owner)}:${pinDef.number}: Could not get absolute coordinates. Skipping label.`,
        );
        continue;
      }

      const labelX = absCoords[0];
      const labelY = absCoords[1];
      let label_rotation = 0;
      let justifyHorizontal = 'left';
      let justifyVertical = 'bottom';

      const pinLocation = this.symbolManager.getPinLocation(pinDef.owner!.symbol!, pinDef.number);

      if (pinLocation) {
        const pinSymbolAngle = pinLocation.angle;
        const compRotation = pinDef.owner?.sch?.rotation ?? 0;
        let effectivePinSymbolAngle = pinSymbolAngle;

        if (compRotation === 90) {
          if (pinSymbolAngle === 0) effectivePinSymbolAngle = 90;
          else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 180;
          else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 270;
          else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 0;
        } else if (compRotation === 180) {
          if (pinSymbolAngle === 0) effectivePinSymbolAngle = 180;
          else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 270;
          else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 0;
          else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 90;
        } else if (compRotation === 270) {
          if (pinSymbolAngle === 0) effectivePinSymbolAngle = 270;
          else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 0;
          else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 90;
          else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 180;
        }

        switch (effectivePinSymbolAngle) {
          case 0:
            label_rotation = 180;
            justifyHorizontal = 'right';
            justifyVertical = 'bottom';
            break;
          case 90:
            label_rotation = 270;
            justifyHorizontal = 'right';
            justifyVertical = 'bottom';
            break;
          case 180:
            label_rotation = 0;
            justifyHorizontal = 'left';
            justifyVertical = 'bottom';
            break;
          case 270:
            label_rotation = 90;
            justifyHorizontal = 'left';
            justifyVertical = 'bottom';
            break;
          default:
            logWarning(
              `Net "${netName}", pin ${displayName(pinDef.owner!)}:${pinDef.number}: Unknown effective pin angle ${effectivePinSymbolAngle}. Using default label placement.`,
            );
            break;
        }
      } else {
        logWarning(
          `Net "${netName}", pin ${displayName(pinDef.owner!)}:${pinDef.number}: Could not get pin location details. Using default label placement.`,
        );
      }

      const isPowerPin = pinDef.type === 'power_in' || pinDef.type === 'power_out';
      if (!isPowerPin) {
        this.labels.push(
          renderLabel({
            net_name: netName,
            x: labelX,
            y: labelY,
            label_rotation,
            justify_horizontal: justifyHorizontal,
            justify_vertical: justifyVertical,
            uuid: deterministicUUID('label', netName, labelX, labelY, this.labels.length),
          }),
        );
      }

      if (isPowerPin && !this.#powerNetEntries.has(netName)) {
        this.#powerNetEntries.set(netName, { firstPinX: labelX, firstPinY: labelY });
      }
    }
  }

  addPowerSymbols(): void {
    if (this.#powerNetEntries.size === 0) return;

    const pwrFlagFqn = 'power:PWR_FLAG';
    const pwrFlagDef = this.symbolManager.getSymbolDefinition(pwrFlagFqn);
    if (!pwrFlagDef) {
      logWarning('power:PWR_FLAG symbol not found in library. Skipping power flag generation.');
      return;
    }

    const PWR_FLAG_OFFSET_X = 8.89;

    for (const [netName, { firstPinX, firstPinY }] of this.#powerNetEntries) {
      // Auto-generated net names (net1, net2, ...) have no matching
      // power library symbol by construction — don't probe for one.
      // Only user-named nets (GND, +3V3, ...) get a power symbol.
      const isAutoNamedNet = new RegExp(`^${DEFAULT_NET_PREFIX}\\d+$`).test(netName);
      const powerSymbolFqn = `power:${netName}`;
      let isGndType = false;
      const powerSymbolDef = isAutoNamedNet ? null : this.symbolManager.getSymbolDefinition(powerSymbolFqn);

      if (powerSymbolDef) {
        const pinLocation = this.symbolManager.getPinLocation(powerSymbolFqn, '1');
        isGndType = pinLocation?.angle === 270;
      } else {
        if (!isAutoNamedNet) {
          logWarning(
            `Power symbol ${powerSymbolFqn} not found in library. Skipping power symbol for net "${netName}".`,
          );
        }
        isGndType = /^(gnd|ground|gn\d+)$/i.test(netName);
      }

      if (powerSymbolDef) {
        this.#pwrCounter++;
        const pwrRef = `#PWR${String(this.#pwrCounter).padStart(2, '0')}`;

        const pwrComp: RenderableSymbol = {
          symbol: powerSymbolFqn,
          reference: pwrRef,
          value: netName,
          footprint: '',
          sch: { x: firstPinX, y: firstPinY, rotation: 0 },
        };

        const symbolStr = this.update(pwrComp);
        if (symbolStr) {
          this.symbols.push(symbolStr);
        }
      }

      this.#flgCounter++;
      const flgRef = `#FLG${String(this.#flgCounter).padStart(2, '0')}`;
      const flgRotation = isGndType ? 180 : 0;
      const flgX = firstPinX + PWR_FLAG_OFFSET_X;
      const flgY = isGndType ? firstPinY - 1.27 : firstPinY;

      const flgComp: RenderableSymbol = {
        symbol: pwrFlagFqn,
        reference: flgRef,
        value: 'PWR_FLAG',
        footprint: '',
        sch: { x: flgX, y: flgY, rotation: flgRotation },
      };

      const flagStr = this.update(flgComp);
      if (flagStr) {
        this.symbols.push(flagStr);
      }

      const flgPin = new Pin(flgRef, '1');
      const flgPinCoords = this.getAbsolutePinCoordinates(flgComp, flgPin);
      if (flgPinCoords) {
        this.labels.push(
          renderLabel({
            net_name: netName,
            x: flgPinCoords[0],
            y: flgPinCoords[1],
            label_rotation: isGndType ? 0 : 270,
            justify_horizontal: isGndType ? 'left' : 'right',
            justify_vertical: 'bottom',
            uuid: deterministicUUID('pwr-label', netName, flgPinCoords[0], flgPinCoords[1], this.labels.length),
          }),
        );
      }
    }
  }
}
