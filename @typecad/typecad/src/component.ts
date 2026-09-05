import { randomUUID } from 'node:crypto';
import { Pin } from './pin.js';
import chalk from 'chalk';
import { ReferenceCounter } from './utils/reference_counter.js';
import { IVia } from './pcb/pcb_interfaces.js';
import { deterministicUUID } from './utils/deterministic_id.js';
import { ComponentError } from './utils/errors.js';
import { displayName, formatSourceError } from './utils/error_reporter.js';
import logger from './utils/logging.js';
import { inspectSource } from './utils/source_inspector.js';
import { getCallSite } from './utils/stack_trace.js';
import { validateFinite } from './utils/numeric_validation.js';
import { LIBRARY_SEPARATOR } from './utils/constants.js';
import { parseTextOrPositioning, parseFab } from './pcb/component_text.js';
import type {
  TextOrPositioning,
  TextPositioning,
  TextWithPositioning,
  TextEntry,
  FabEntry,
  FabLayout,
} from './pcb/component_text.js';
import type { ITextPositioning } from './pcb/pcb_interfaces.js';
import { loadFootprintLib } from './pcb/component_footprint_loader.js';
import { loadSymbolLib } from './renderers/component_symbol_loader.js';
import { getFootprintBounds } from './pcb/footprint_bounds.js';
import { isPlacementValue, coercePlacementInput, type PlacementNumber, type PlacementInput } from './placement.js';

const defaultCounter = new ReferenceCounter();

export type { TextOrPositioning, TextPositioning, TextWithPositioning, TextEntry, FabEntry, FabLayout };
export { parseTextOrPositioning };

/**
 * Maps KiCAD symbol pin names to board framework pin names.
 *
 * Attach this to an MCU {@link Component} via the `typehal` property so that
 * `pcb.contract()` can produce a firmware-friendly JSON manifest. Without it,
 * the contract will only contain raw KiCAD pin names (e.g. `"PB5"`) which
 * firmware code cannot meaningfully use.
 *
 * @example
 * ```ts
 * const mcu = new Component({
 *   symbol: 'MCU_Microchip_ATmega:ATmega328P-PU',
 *   footprint: 'Package_DIP:DIP-28_W7.62mm',
 *   reference: 'U1',
 *   typehal: {
 *     'PB5': 'D13',
 *     'PB4': 'D12',
 *     'PB3': 'D11',
 *     'PB2': 'D10',
 *     'PD2': 'D2',
 *     'PC4': 'A4',
 *     'PC5': 'A5',
 *   },
 * });
 *
 * const pcb = new PCB('uno_shield');
 * // ... add nets, components ...
 * pcb.create(mcu, led, sensor);
 * pcb.contract({ mcu });
 * ```
 */

export interface SourceInfo {
  file: string;
  line: number;
  variable?: string;
  params?: Record<string, unknown>;
  isThis?: boolean;
}

export interface ComponentInit {
  footprint?: string;
  reference?: string;
  prefix?: string;
  value?: string;
  via?: boolean;
  viaData?: IVia;
  uuid?: string;
  pcb?: { x: number | PlacementNumber; y: number | PlacementNumber; rotation?: number; side?: 'front' | 'back' };
  sch?: { x: number; y: number; rotation?: number };
  simulation?: { include: boolean; model?: string };
  symbol?: string;
  sourceInfo?: SourceInfo;
  typehal?: Record<string, string>;
  datasheet?: string;
  description?: string;
  voltage?: string;
  wattage?: string;
  mpn?: string;
  dnp?: boolean;
  fab?: TextPositioning | TextWithPositioning;
  text?: TextEntry[];
  referenceLayout?: ITextPositioning;
  valueLayout?: ITextPositioning;
  fabLayout?: FabLayout;
}

/** @deprecated Use `ComponentInit` instead. */
export type IComponent = ComponentInit;

export class Component {
  /** Creation counter used as a deterministic disambiguator in UUID fallbacks. */
  static #instanceCounter = 0;
  readonly #instanceIndex = ++Component.#instanceCounter;
  #ref: string = '';
  #prefix: string = '';
  #refLocked: boolean = false;
  #committed: boolean = false;
  #footprint: string = '';
  #value: string = '';
  #datasheet: string = '';
  #description: string = '';
  #voltage: string = '';
  #wattage: string = '';
  #mpn: string = '';
  #symbol: string = '';
  #pcb: { x: number; y: number; rotation?: number; side?: 'front' | 'back' } = {
    x: 0,
    y: 0,
    rotation: 0,
    side: 'front',
  };
  /** Raw placement expressions from the last assignment, for create()-time re-resolution. */
  #pcbSource: { x?: PlacementNumber; y?: PlacementNumber } | undefined = undefined;
  /** Snapshot of resolved coordinates at assignment time — detects manual moves. */
  #pcbSnapshot: { x: number; y: number } | undefined = undefined;
  /**
   * Board position. Assignment accepts deferred placement values (e.g.
   * `board(pcb).fromTop(5)`, `below(r1).by(3)`) alongside plain numbers —
   * they resolve against the component's footprint immediately, so reads
   * always see numbers. Deferred expressions are re-resolved at `create()`
   * against final positions; manually moving a component afterwards wins.
   */
  get pcb(): { x: number; y: number; rotation?: number; side?: 'front' | 'back' } {
    return this.#pcb;
  }
  set pcb(value: { x: PlacementInput; y: PlacementInput; rotation?: number; side?: 'front' | 'back' }) {
    const rawX = coercePlacementInput(value.x, 'x');
    const rawY = coercePlacementInput(value.y, 'y');
    // The component's own rotation shapes its occupied box — the placement
    // expression needs it for correct edge-to-edge resolution.
    const rotation = value.rotation ?? this.#pcb.rotation ?? 0;
    const x = isPlacementValue(rawX) ? rawX.resolveWithFootprint(this.#footprint, rotation) : rawX;
    const y = isPlacementValue(rawY) ? rawY.resolveWithFootprint(this.#footprint, rotation) : rawY;
    validateFinite(x, 'pcb.x');
    validateFinite(y, 'pcb.y');
    if (value.rotation !== undefined) validateFinite(value.rotation, 'pcb.rotation');
    this.#pcb = { ...value, x, y };
    this.#pcbSource = isPlacementValue(rawX) || isPlacementValue(rawY) ? { x: rawX, y: rawY } : undefined;
    this.#pcbSnapshot = { x, y };
  }
  /**
   * Re-resolve deferred placement expressions (e.g. `below(r1).by(3)`)
   * against current state. An axis that was manually moved since assignment
   * is frozen — the manual value wins permanently. Returns whether anything
   * changed.
   * @internal
   */
  _refreshPlacement(): boolean {
    const source = this.#pcbSource;
    const snapshot = this.#pcbSnapshot;
    if (!source || !snapshot) return false;
    let changed = false;
    const next = { ...this.#pcb };
    const rotation = this.#pcb.rotation ?? 0;
    if (isPlacementValue(source.x) && this.#pcb.x === snapshot.x) {
      const x = source.x.resolveWithFootprint(this.#footprint, rotation);
      if (x !== this.#pcb.x) {
        next.x = x;
        changed = true;
      }
    } else if (isPlacementValue(source.x)) {
      source.x = undefined; // manual move detected — freeze this axis
    }
    if (isPlacementValue(source.y) && this.#pcb.y === snapshot.y) {
      const y = source.y.resolveWithFootprint(this.#footprint, rotation);
      if (y !== this.#pcb.y) {
        next.y = y;
        changed = true;
      }
    } else if (isPlacementValue(source.y)) {
      source.y = undefined; // manual move detected — freeze this axis
    }
    if (changed) {
      validateFinite(next.x, 'pcb.x');
      validateFinite(next.y, 'pcb.y');
      this.#pcb = next;
      this.#pcbSnapshot = { x: next.x, y: next.y };
    }
    return changed;
  }
  dnp: boolean = false;
  via: boolean = false;
  viaData: IVia | undefined = undefined;
  simulation: { include: boolean; model?: string } = { include: false };
  sch: { x: number; y: number; rotation?: number } = { x: 0, y: 0, rotation: 0 };
  /** @internal */
  groups: string[] = [];
  /** @internal */
  sourceInfo?: SourceInfo;
  typehal?: Record<string, string>;
  text: TextEntry[] = [];
  fab: FabEntry | undefined = undefined;
  referenceLayout: ITextPositioning | undefined = undefined;
  valueLayout: ITextPositioning | undefined = undefined;
  #fabLayout: FabLayout | undefined = undefined;
  get fabLayout(): FabLayout | undefined {
    return this.#fabLayout;
  }
  set fabLayout(value: FabLayout | undefined) {
    this.#fabLayout = value;
    if (value) {
      this.fab = {
        text: value.text || '${REFERENCE}',
        x: value.x,
        y: value.y,
        rotation: value.rotation,
        layer: value.layer,
        width: value.width,
        height: value.height,
        fontSize: value.fontSize,
        thickness: value.thickness,
        bold: value.bold,
        italic: value.italic,
        justify: value.justify,
        show: value.show,
      };
    } else {
      this.fab = undefined;
    }
  }
  /** @internal */
  valueFootprint?: import('./pcb/pcb_interfaces.js').ITextPositioning;
  /** @internal */
  pins: Pin[] = [];
  #pinMap: Map<string, Pin> = new Map();
  #footprint_file?: string = '';
  #symbol_file?: string = '';
  #isInitialized: boolean = false;
  #uuid: string = '';
  #bounds?: { width: number; height: number } | null;

  get footprint(): string {
    return this.#footprint;
  }
  set footprint(value: string) {
    if (this.#committed && value !== this.#footprint) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing footprint on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#footprint = value;
    this.#bounds = undefined;
  }

  /**
   * The bounding box of this component's footprint in mm, derived from
   * pad positions and graphical elements in the `.kicad_mod` file.
   *
   * Lazily computed on first access and cached. Returns `null` if the
   * footprint cannot be resolved (e.g., missing library).
   *
   * Used internally by placement functions ({@link below}, {@link above},
   * {@link rightOf}, {@link leftOf}) for size-aware, edge-to-edge spacing.
   */
  get bounds(): { width: number; height: number } | null {
    if (this.#bounds === undefined) {
      this.#bounds = getFootprintBounds(this.#footprint);
    }
    return this.#bounds;
  }

  get value(): string {
    return this.#value;
  }
  set value(v: string) {
    if (this.#committed && v !== this.#value) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing value on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#value = v;
  }

  get datasheet(): string {
    return this.#datasheet;
  }
  set datasheet(v: string) {
    if (this.#committed && v !== this.#datasheet) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing datasheet on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#datasheet = v;
  }

  get description(): string {
    return this.#description;
  }
  set description(v: string) {
    if (this.#committed && v !== this.#description) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing description on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#description = v;
  }

  get voltage(): string {
    return this.#voltage;
  }
  set voltage(v: string) {
    if (this.#committed && v !== this.#voltage) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing voltage on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#voltage = v;
  }

  get wattage(): string {
    return this.#wattage;
  }
  set wattage(v: string) {
    if (this.#committed && v !== this.#wattage) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing wattage on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#wattage = v;
  }

  get mpn(): string {
    return this.#mpn;
  }
  set mpn(v: string) {
    if (this.#committed && v !== this.#mpn) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing mpn on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#mpn = v;
  }

  get symbol(): string {
    return this.#symbol;
  }
  set symbol(v: string) {
    if (this.#committed && v !== this.#symbol) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  Changing symbol on "${displayName(this)}" after it was added to a schematic/PCB. Changes may not take effect.`,
        ),
      );
    }
    this.#symbol = v;
  }

  get reference(): string {
    if (!this.#ref && this.#isInitialized) {
      this.#ref = defaultCounter.getNextReference(this.#prefix || this.#inferPrefix());
      this.#refLocked = true;
    }
    return this.#ref;
  }

  set reference(value: string) {
    this.#ref = value;
    this.#refLocked = true;
    if (value && this.#isInitialized) {
      if (!/\d/.test(value)) {
        logger.warn(
          chalk.whiteBright.bgYellow(
            `\u26A0\uFE0F  reference="${value}" for ${displayName(this)} has no number suffix. KiCad requires references like "R1", "C2", "U3".`,
          ),
        );
      }
      defaultCounter.setReference(value);
    }
  }

  set prefix(value: string) {
    if (this.#refLocked) {
      const refPrefix = this.#ref.match(/^[A-Za-z]+/)?.[0] ?? '';
      if (refPrefix && refPrefix !== value) {
        logger.warn(
          chalk.whiteBright.bgYellow(
            `\u26A0\uFE0F  prefix="${value}" conflicts with reference="${this.#ref}" for ${displayName(this)}. Set prefix before reference.`,
          ),
        );
      } else {
        logger.warn(
          chalk.whiteBright.bgYellow(
            `\u26A0\uFE0F  prefix="${value}" has no effect \u2014 reference is already set to "${this.#ref}" for ${displayName(this)}.`,
          ),
        );
      }
      return;
    }
    this.#prefix = value;
  }

  constructor(footprint: string | ComponentInit) {
    this.captureSourceInfo();
    if (typeof footprint !== 'string') {
      const init = footprint as Partial<ComponentInit>;
      const fp = init.footprint ?? '';
      if (fp && !fp.includes(LIBRARY_SEPARATOR)) {
        const err = new ComponentError(
          formatSourceError(
            `[${fp}] Footprint must be in format "library${LIBRARY_SEPARATOR}footprint"`,
            this.sourceInfo,
          ),
        );
        err.stack = err.message;
        throw err;
      }
      this.#footprint = fp;
      this.#applyInit(init);
      this.#isInitialized = true;
      if (init.reference) defaultCounter.setReference(init.reference);
      return;
    }
    if (footprint && !footprint.includes(LIBRARY_SEPARATOR)) {
      const err = new ComponentError(
        formatSourceError(
          `[${footprint}] Footprint must be in format "library${LIBRARY_SEPARATOR}footprint" (e.g., "Resistor_SMD${LIBRARY_SEPARATOR}R_0603_1608Metric")`,
          this.sourceInfo,
        ),
      );
      err.stack = err.message;
      throw err;
    }
    this.#footprint = footprint;
    this.#isInitialized = true;
  }

  #applyInit(init: ComponentInit): void {
    if (init.prefix) this.#prefix = init.prefix;
    if (init.reference) this.#ref = init.reference;
    if (init.value !== undefined) this.#value = init.value;
    if (init.symbol) this.#symbol = init.symbol;
    if (init.datasheet) this.#datasheet = init.datasheet;
    if (init.description) this.#description = init.description;
    if (init.voltage) this.#voltage = init.voltage;
    if (init.wattage) this.#wattage = init.wattage;
    if (init.mpn) this.#mpn = init.mpn;
    if (init.dnp !== undefined) this.dnp = init.dnp;
    if (init.pcb) {
      // The pcb setter resolves deferred placement values and validates.
      this.pcb = init.pcb;
    }
    if (init.sch) this.sch = init.sch;
    if (init.via) this.via = init.via;
    if (init.viaData) this.viaData = init.viaData;
    if (init.simulation) this.simulation = { include: init.simulation.include, model: init.simulation.model ?? '' };
    if (init.uuid) this.#uuid = init.uuid;
    if (init.fab) this.fab = parseFab(init.fab);
    if (init.text) this.text = init.text;
    if (init.referenceLayout) this.referenceLayout = init.referenceLayout;
    if (init.valueLayout) this.valueLayout = init.valueLayout;
    if (init.fabLayout) this.fabLayout = init.fabLayout;
    if (init.typehal) this.typehal = init.typehal;
    if (init.sourceInfo) this.sourceInfo = init.sourceInfo;
  }

  static via(at: { x: number; y: number }, options?: { size?: number; drill?: number }): Component {
    // Geometry-derived: two vias at the same spot with the same geometry are
    // the same via, so identical designs produce identical output.
    const viaUuid = deterministicUUID('via', at.x, at.y, options?.size ?? 0.8, options?.drill ?? 0.4);
    return Component._create({
      via: true,
      prefix: 'V',
      uuid: viaUuid,
      footprint: '',
      pcb: { x: at.x, y: at.y, rotation: 0, side: 'front' },
      viaData: {
        uuid: viaUuid,
        at,
        size: options?.size ?? 0.8,
        drill: options?.drill ?? 0.4,
        layers: ['F.Cu', 'B.Cu'],
      },
    });
  }

  /** @internal */
  static _create(init: ComponentInit): Component {
    const c = new Component(init.footprint ?? '');
    c.#applyInit(init);
    return c;
  }

  private captureSourceInfo(): void {
    const callSite = this.getCallSiteForInstantiation();
    if (callSite) {
      this.sourceInfo = {
        file: callSite.file,
        line: callSite.line,
        variable: undefined,
        params: undefined,
        isThis: undefined,
      };
      try {
        const inspection = inspectSource(callSite.file, callSite.line);
        if (inspection.variable) {
          this.sourceInfo.variable = inspection.variable;
          this.sourceInfo.params = inspection.params;
          this.sourceInfo.isThis = inspection.isThis;
        }
      } catch (e: unknown) {
        logger.debug('Source inspection failed:', String(e));
      }
    }
  }

  /** @internal */
  registerReference(counter: ReferenceCounter): boolean {
    // Idempotent: a component already registered once (e.g. by a Package
    // constructor) keeps its reference when create() registers it again.
    // Distinct components with colliding references still rename below.
    if (this.#committed) return true;

    const ref = this.reference;
    if (!counter.setReference(ref)) {
      const newRef = counter.getNextReference(this.#prefix || this.#inferPrefix());
      logger.warn(chalk.whiteBright.bgYellow(`\u{1F6A9}  renaming ${displayName(this)} to ${newRef}`));
      this.#ref = newRef;
    }
    if (!this.#footprint && !this.via) {
      logger.warn(
        chalk.whiteBright.bgYellow(
          `\u26A0\uFE0F  "${displayName(this)}" has no footprint. It will not appear in the output.`,
        ),
      );
    }
    this.#committed = true;
    return true;
  }

  #inferPrefix(): string {
    const fp = this.#footprint;
    if (!fp) return 'U';
    const parts = fp.split(LIBRARY_SEPARATOR);
    const name = parts[parts.length - 1] || parts[0];
    const match = name.match(/^([A-Za-z]+)/);
    if (match) {
      const prefix = match[1].charAt(0).toUpperCase();
      if (['R', 'C', 'L', 'D', 'Q', 'U', 'J', 'F', 'T', 'Y', 'S', 'K'].includes(prefix)) {
        return prefix;
      }
    }
    return 'U';
  }

  private getCallSiteForInstantiation(): { file: string; line: number; column: number; function: string } | null {
    const callSite = getCallSite();
    if (!callSite) {
      return null;
    }

    return {
      ...callSite,
      function: callSite.function || 'anonymous',
    };
  }

  get uuid(): string {
    if (this.#uuid === '' && this.#isInitialized) {
      // Deterministic when the component has identity: identical designs
      // render to byte-identical output. Creation order (instance index)
      // is itself deterministic for a given program, so the sourceInfo
      // fallback stays stable too.
      if (this.reference) {
        this.#uuid = deterministicUUID('component', this.reference);
      } else if (this.sourceInfo?.file) {
        this.#uuid = deterministicUUID(
          'component-src',
          this.sourceInfo.file,
          this.sourceInfo.line,
          this.sourceInfo.variable ?? '',
          this.#instanceIndex,
        );
      } else {
        this.#uuid = randomUUID();
      }
    }
    return this.#uuid;
  }

  set uuid(value: string) {
    this.#uuid = value;
  }

  /** @internal */
  get footprintFingerprint(): string {
    const str = `${this.#footprint || ''}:${this.reference || ''}`;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  pin(
    number: number | string,
    config?: { type?: Pin['type']; powerInfo?: import('./pcb/pcb_interfaces.js').IPinPowerInfo },
  ): Pin {
    if (typeof number !== 'number' && typeof number !== 'string') {
      const site = getCallSite();
      const err = new ComponentError(formatSourceError(`Pin number must be a number or a string`, site));
      err.stack = err.message;
      throw err;
    }
    const pinNumberStr = String(number);

    const existingPin = this.#pinMap.get(pinNumberStr);
    if (existingPin) {
      if (config?.type) existingPin.type = config.type;
      if (config?.powerInfo) existingPin.powerInfo = config.powerInfo;
      if (!existingPin.uuid) {
        existingPin.uuid = this.uuid;
      }
      const site = getCallSite();
      if (site) {
        existingPin.sourceFile = site.file;
        existingPin.sourceLine = site.line;
        existingPin.sourceColumn = site.column;
      }
      return existingPin;
    }

    const newPin = new Pin(this.reference, pinNumberStr, config?.type);
    newPin.owner = this;
    newPin.uuid = this.uuid;
    if (config?.powerInfo) newPin.powerInfo = config.powerInfo;
    const site = getCallSite();
    if (site) {
      newPin.sourceFile = site.file;
      newPin.sourceLine = site.line;
      newPin.sourceColumn = site.column;
    }
    this.pins.push(newPin);
    this.#pinMap.set(pinNumberStr, newPin);
    return newPin;
  }

  #isInGroup(groupName: string): boolean {
    return this.groups.includes(groupName);
  }

  /** @internal */
  getGroups(): string[] {
    return [...this.groups];
  }

  #registerPin(pin: Pin): void {
    if (this.#pinMap.has(pin.number)) return;
    this.#pinMap.set(pin.number, pin);
    if (!this.pins.includes(pin)) {
      this.pins.push(pin);
    }
  }

  /** @internal */
  footprint_lib(footprint: string): string {
    const result = loadFootprintLib(footprint, this.reference, this.value, this.#footprint_file);
    this.#footprint_file = result;
    return result;
  }

  #symbolLib(symbol: string): string {
    const result = loadSymbolLib(symbol, this.reference, this.value, this.#symbol_file);
    this.#symbol_file = result;
    return result;
  }
}
