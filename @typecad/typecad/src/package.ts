import { Component, setActiveCounter } from './component.js';
import { TrackBuilder, PCB } from './pcb/pcb.js';
import { Pin } from './pin.js';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

// The standard passive component factory shape (matches @typecad/passives/0603 and other sizes)
export type PassiveFactory = {
    Resistor: new (options?: { value?: string; [key: string]: unknown }) => Component;
    Capacitor: new (options?: { value?: string; [key: string]: unknown }) => Component;
    Inductor: new (options?: { value?: string; [key: string]: unknown }) => Component;
};

/**
 * Base options required by every Package.
 * User-defined option interfaces extend this.
 */
export interface PackageOptions {
    pcb: PCB;
    x: number;
    y: number;
    reference?: string;
    /** Name used for the PCB group. Use pcb.place() if you do not want grouping. */
    name: string;
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
export abstract class Package<TOptions extends object = {}> {
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
        this.passives = (options.passives ?? this._defaultPassives()) as PassiveFactory;
        this.reference = options.reference;

        this.pcb.pushOffset(options.x, options.y);
        // Scope component references to this PCB's schematic during build().
        setActiveCounter(this.pcb.Schematic.referenceCounter);
        try {
            this.build(options);
        } finally {
            setActiveCounter(null);
        }
        this._autoCollect();
        this.pcb.group(options.name, ...this.components);
        this.pcb.popOffset();
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
    protected via(at: { x: number; y: number }, size = 0.6, drill = 0.3): Component {
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
     * Lazily import the default passives package so that @typecad/typecad
     * does not have a hard compile-time dependency on @typecad/passives.
     */
    private _defaultPassives(): PassiveFactory {
        try {
            return _require('@typecad/passives/0603') as PassiveFactory;
        } catch {
            throw new Error(
                'Package: no passives factory provided and @typecad/passives is not installed. ' +
                'Pass a `passives` option or install @typecad/passives.'
            );
        }
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

            const isComponentOrTrackBuilder = (v: object): v is Component | TrackBuilder =>
                ('pins' in v || 'footprint' in v || 'symbol' in v) || ('from' in v && 'to' in v);

            if (isComponentOrTrackBuilder(value) && !alreadyRegistered.has(value)) {
                this.components.push(value);
                alreadyRegistered.add(value);
            }
        }
    }
}
