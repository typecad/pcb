import { Component } from './component.js';
import { TrackBuilder, PCB, pcbPushOffset, pcbPopOffset, pcbGetCurrentOffset } from './pcb/pcb.js';
import { Pin } from './pin.js';
import { PCB_CONSTANTS } from './pcb/pcb_routing_calculations.js';
import { validateFinite } from './utils/numeric_validation.js';
import { isComponentLike, isTrackBuilderLike } from './pcb/pcb_board_creation.js';
import { resolvePackageSourceDir, syncPackageBuildLib } from './package_files.js';
import { passiveFactory, type PassiveFactory, type PassiveSize } from './passives/index.js';
import logger from './utils/logging.js';

// The standard passive component factory shape — re-exported for API
// continuity; the concrete factories are the built-in chip passives.
export type { PassiveFactory } from './passives/index.js';

/**
 * Base options required by every Package.
 * User-defined option interfaces extend this.
 */
export interface PackageOptions {
  pcb: PCB;
  x: number;
  y: number;
  reference?: string;
  /** Name used for the PCB group. Defaults to the class name. */
  name?: string;
  /** Chip size the default `this.passives` factories bind to (default: '0603'). */
  passiveSize?: PassiveSize;
  /** Overrides the default passive factories entirely. */
  passives?: PassiveFactory;
}

/**
 * ### Package
 *
 * Abstract base class for TypeCAD hardware packages.
 *
 * A Package is a self-contained module that wraps one or more components,
 * manages their passive components, connects power, peripherals, and routing,
 * and groups them on the PCB.
 *
 * #### Usage
 * ```typescript
 * export class rd_isl9120ir extends Package<{ inputPower?: Power }> {
 *     regulator: ISL9120IRTNZ;
 *     inputCap: Component;
 *
 *     build(options) {
 *         this.regulator = new ISL9120IRTNZ(this.reference);
 *         this.regulator.pcb = { x: 150.6, y: 97.725, rotation: 0 };
 *
 *         this.inputCap = new this.passives.Capacitor({ value: '22 uF' });
 *         this.inputCap.pcb = { x: 153.67, y: 99.047, rotation: -90 };
 *
 *         this.net(this.regulator.VIN_1, this.inputCap.pin(2));
 *     }
 * }
 * ```
 *
 * All `Component` properties set on `this` inside `build()` are automatically
 * collected — no `this.components.push(...)` required.
 *
 * For tracks, use `this.add(this.track().from(...).to(...))` since track chains
 * are not stored as named properties.
 */
export abstract class Package<TOptions extends object = object> {
  /** The PCB instance this package is placed on. */
  protected readonly pcb: PCB;

  /** The passive component factory (default: 0603). */
  protected readonly passives: PassiveFactory;

  /** Optional reference designator prefix for the main IC (e.g. 'U2'). */
  protected readonly reference: string | undefined;

  /**
   * All PCB elements belonging to this package (components + track builders).
   * Populated automatically after `build()` via property reflection.
   * Use `this.add()` for tracks or any element not stored as a named property.
   */
  readonly components: (Component | TrackBuilder)[] = [];

  constructor(options: PackageOptions & TOptions) {
    this.pcb = options.pcb;
    this.passives = options.passives ?? passiveFactory(options.passiveSize);
    this.reference = options.reference;

    validateFinite(options.x, 'Package x offset');
    validateFinite(options.y, 'Package y offset');

    // Lazily sync this package's bundled KiCad symbol/footprint files into
    // the project's ./build/lib/ directory. This replaces the historical
    // npm `postinstall` copy step (which npm is deprecating). The sync
    // runs on every build, is mtime-guarded (cheap on repeat builds),
    // and silently no-ops for packages without a build/lib/ or if the
    // source directory cannot be resolved.
    try {
      const pkgDir = resolvePackageSourceDir();
      if (pkgDir) syncPackageBuildLib(pkgDir);
    } catch (e) {
      logger.debug('Package build-lib sync failed:', e instanceof Error ? e.message : String(e));
    }

    try {
      pcbPushOffset(this.pcb, options.x, options.y);
      try {
        this.build(options);
      } finally {
        this._autoCollect();
        for (const item of this.components) {
          if (isComponentLike(item)) {
            item.registerReference(this.pcb.schematic.referenceCounter);
          }
        }
        this._applyOffset();
        this.pcb.group(options.name ?? this.constructor.name, ...this.components);
      }
    } finally {
      pcbPopOffset(this.pcb);
    }
  }

  /**
   * Implement all component creation, net connections, and routing here.
   * All Component properties assigned to `this` are automatically collected.
   */
  protected abstract build(options: PackageOptions & TOptions): void;

  /**
   * Connect one or more pins to the same net.
   * Shorthand for `this.pcb.net(...)`.
   */
  protected net(...pins: Pin[]): void {
    this.pcb.net(...pins);
  }

  /**
   * Place a PCB via and automatically register it in `components`.
   */
  protected via(
    at: { x: number; y: number },
    size = PCB_CONSTANTS.DEFAULT_VIA_SIZE,
    drill = PCB_CONSTANTS.DEFAULT_VIA_DRILL,
  ): Component {
    const v = this.pcb.via({ at, size, drill });
    this.components.push(v);
    return v;
  }

  /**
   * Start a track chain. Use `this.add()` to register the completed track.
   *
   * Example:
   * ```typescript
   * this.add(this.track().from({ x: 152.05, y: 96.87 }).to({ x: 152.4, y: 96.52, layer: 'F.Cu', width: 0.2 }));
   * ```
   */
  protected track(): TrackBuilder {
    return this.pcb.track();
  }

  /**
   * Manually register one or more components or track builders.
   * Use this for tracks (which are not stored as named properties)
   * or for components inside arrays.
   */
  protected add(...items: (Component | TrackBuilder)[]): void {
    this.components.push(...items);
  }

  /**
   * After `build()` runs, walk all own enumerable properties of the subclass
   * instance. Any value that is a `Component` or `TrackBuilder` and has not
   * already been manually pushed to `this.components` is collected automatically.
   */
  private _autoCollect(): void {
    const alreadyRegistered = new Set<Component | TrackBuilder>(this.components);
    const skip = new Set(['pcb', 'components', 'passives', 'reference']);

    for (const key of Object.keys(this)) {
      if (skip.has(key)) continue;
      const value = (this as Record<string, unknown>)[key];
      if (!value || typeof value !== 'object') continue;

      if ((isComponentLike(value) || isTrackBuilderLike(value)) && !alreadyRegistered.has(value)) {
        this.components.push(value);
        alreadyRegistered.add(value);
      }
    }
  }

  /**
   * Apply the current PCB offset to all collected components' `.pcb` positions.
   * Tracks and vias already had offsets applied at creation time via PCB methods,
   * so only regular Components need adjustment.
   */
  private _applyOffset(): void {
    const offset = pcbGetCurrentOffset(this.pcb);
    if (offset.x === 0 && offset.y === 0) return;

    for (const item of this.components) {
      if (isComponentLike(item) && !item.via) {
        item.pcb.x += offset.x;
        item.pcb.y += offset.y;
      }
    }
  }
}
