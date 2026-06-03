import type { Component } from './component.js';
import type { PCB } from './pcb/pcb.js';
import { getPcbState } from './pcb/pcb.js';
import { getFootprintBounds } from './pcb/footprint_bounds.js';

const DEFAULT_PLACEMENT_GAP = 2;

/**
 * A deferred placement value that is resolved by the Component constructor
 * using the component's own footprint bounds. This enables edge-to-edge
 * spacing without manually specifying the target footprint.
 *
 * You typically don't construct this directly — it is returned by placement
 * functions like {@link below}, {@link above}, {@link rightOf}, {@link leftOf},
 * and {@link BoardBounds.fromLeft}.
 */
export class PlacementValue {
    private readonly _resolve: (targetBounds: { width: number; height: number } | null) => number;

    constructor(resolve: (targetBounds: { width: number; height: number } | null) => number) {
        this._resolve = resolve;
    }

    /** @internal */
    resolveWithFootprint(footprint: string): number {
        return this._resolve(getFootprintBounds(footprint));
    }
}

/**
 * Returns `true` if the value is a {@link PlacementValue} instance.
 *
 * @param value - Any value to check.
 */
export function isPlacementValue(value: unknown): value is PlacementValue {
    return value instanceof PlacementValue;
}

/** A number or a deferred {@link PlacementValue} that resolves to a number. */
export type PlacementNumber = number | PlacementValue;

/**
 * Returned by directional placement functions ({@link below}, {@link above},
 * {@link rightOf}, {@link leftOf}). Call `.by()` to specify the gap.
 *
 * @example
 * ```ts
 * const r2 = new Resistor({ pcb: { x: 10, y: below(r1).by(3) } });
 * ```
 */
export interface PlacementBuilder {
    /**
     * Specify the gap in millimeters from the source component's edge to the
     * target component's edge (edge-to-edge). Returns a number or a
     * {@link PlacementValue} that the Component constructor resolves
     * automatically.
     *
     * When no `target` is provided, a {@link PlacementValue} is returned that
     * resolves using the new component's own footprint — so the gap is
     * edge-to-edge with no extra work.
     *
     * When a `target` is provided (a {@link Component} or footprint string
     * like `"Capacitor_SMD:C_0603_1608Metric"`), a plain number is returned
     * immediately.
     *
     * @param gap - Edge-to-edge gap in mm. Defaults to `2`.
     * @param target - Optional target component or footprint string for explicit bounds lookup.
     *
     * @example
     * ```ts
     * // Automatic — resolves using the new component's own footprint
     * new Capacitor({ pcb: { y: below(r1).by(3) } });
     *
     * // Explicit target component
     * new Capacitor({ pcb: { y: below(r1).by(3, someOtherCap) } });
     *
     * // Default 2mm gap
     * new Capacitor({ pcb: { y: below(r1).by() } });
     * ```
     */
    by(gap?: number, target?: Component | string): PlacementNumber;
}

/**
 * Board boundary dimensions derived from `pcb.outline()` calls.
 * Returned by {@link board}.
 *
 * All coordinates are in millimeters. `top`/`bottom` follow KiCad's
 * coordinate system where Y increases downward.
 */
export interface BoardBounds {
    /** Center point of the board outline. */
    readonly center: { x: number; y: number };
    /** Minimum Y of the board edge (top edge). */
    readonly top: number;
    /** Maximum Y of the board edge (bottom edge). */
    readonly bottom: number;
    /** Minimum X of the board edge (left edge). */
    readonly left: number;
    /** Maximum X of the board edge (right edge). */
    readonly right: number;
    /** Board width in mm (right − left). */
    readonly width: number;
    /** Board height in mm (bottom − top). */
    readonly height: number;
    /** Top-left corner coordinates. */
    readonly topLeft: { x: number; y: number };
    /** Top-right corner coordinates. */
    readonly topRight: { x: number; y: number };
    /** Bottom-left corner coordinates. */
    readonly bottomLeft: { x: number; y: number };
    /** Bottom-right corner coordinates. */
    readonly bottomRight: { x: number; y: number };
    /**
     * Returns a placement value for the X coordinate that positions a
     * component's courtyard `margin` mm from the left board edge (edge-to-edge).
     *
     * @param margin - Gap from board edge to component courtyard in mm. Defaults to `2`.
     *
     * @example
     * ```ts
     * const b = board(pcb);
     * const j1 = new Component({ footprint: '...', pcb: {
     *   x: b.fromLeft(5),
     *   y: b.center.y,
     * }});
     * ```
     */
    fromLeft(margin?: number): PlacementValue;
    /**
     * Returns a placement value for the X coordinate that positions a
     * component's courtyard `margin` mm from the right board edge (edge-to-edge).
     *
     * @param margin - Gap from board edge to component courtyard in mm. Defaults to `2`.
     *
     * @example
     * ```ts
     * const b = board(pcb);
     * const tp = new Component({ footprint: '...', pcb: {
     *   x: b.fromRight(1),
     *   y: b.fromTop(1),
     * }});
     * ```
     */
    fromRight(margin?: number): PlacementValue;
    /**
     * Returns a placement value for the Y coordinate that positions a
     * component's courtyard `margin` mm from the top board edge (edge-to-edge).
     *
     * @param margin - Gap from board edge to component courtyard in mm. Defaults to `2`.
     */
    fromTop(margin?: number): PlacementValue;
    /**
     * Returns a placement value for the Y coordinate that positions a
     * component's courtyard `margin` mm from the bottom board edge (edge-to-edge).
     *
     * @param margin - Gap from board edge to component courtyard in mm. Defaults to `2`.
     */
    fromBottom(margin?: number): PlacementValue;
}

/**
 * Returned by {@link sameAs}. Provides live access to a component's
 * X and Y PCB coordinates.
 *
 * @example
 * ```ts
 * const pos = sameAs(r1);
 * new Capacitor({ pcb: { x: pos.x, y: below(r1).by(3) } });
 * ```
 */
export interface SameAsResult {
    /** The component's current PCB X coordinate (live). */
    readonly x: number;
    /** The component's current PCB Y coordinate (live). */
    readonly y: number;
}

function halfHeight(component: Component): number {
    return (component.bounds?.height ?? 0) / 2;
}

function halfWidth(component: Component): number {
    return (component.bounds?.width ?? 0) / 2;
}

function resolveTargetHalfSize(target: Component | string, dimension: 'width' | 'height'): number {
    if (typeof target === 'string') {
        const bounds = getFootprintBounds(target);
        return ((dimension === 'width' ? bounds?.width : bounds?.height) ?? 0) / 2;
    }
    return ((dimension === 'width' ? target.bounds?.width : target.bounds?.height) ?? 0) / 2;
}

/**
 * Places a component below the given source component. Returns a
 * {@link PlacementBuilder} — call `.by(gap)` to specify the edge-to-edge
 * gap in mm.
 *
 * The gap is measured from the **bottom edge** of the source component's
 * bounding box to the **top edge** of the target component's bounding box.
 *
 * @param component - The reference component to place below.
 * @returns A builder with a `.by()` method.
 *
 * @example
 * ```ts
 * const r1 = new Resistor({ pcb: { x: 10, y: 10 } });
 *
 * // 3mm edge-to-edge gap, resolved automatically
 * const c1 = new Capacitor({ pcb: {
 *   x: sameAs(r1).x,
 *   y: below(r1).by(3),
 * }});
 * ```
 */
export function below(component: Component): PlacementBuilder {
    return {
        by(gap: number = DEFAULT_PLACEMENT_GAP, target?: Component | string): PlacementNumber {
            const srcEdge = component.pcb.y + halfHeight(component);
            if (target) {
                return srcEdge + gap + resolveTargetHalfSize(target, 'height');
            }
            return new PlacementValue((targetBounds) => {
                return srcEdge + gap + ((targetBounds?.height ?? 0) / 2);
            });
        }
    };
}

/**
 * Places a component above the given source component. Returns a
 * {@link PlacementBuilder} — call `.by(gap)` to specify the edge-to-edge
 * gap in mm.
 *
 * The gap is measured from the **top edge** of the source component's
 * bounding box to the **bottom edge** of the target component's bounding box.
 *
 * @param component - The reference component to place above.
 * @returns A builder with a `.by()` method.
 *
 * @example
 * ```ts
 * const led = new LED({ pcb: {
 *   x: sameAs(mcu).x,
 *   y: above(mcu).by(8),
 * }});
 * ```
 */
export function above(component: Component): PlacementBuilder {
    return {
        by(gap: number = DEFAULT_PLACEMENT_GAP, target?: Component | string): PlacementNumber {
            const srcEdge = component.pcb.y - halfHeight(component);
            if (target) {
                return srcEdge - gap - resolveTargetHalfSize(target, 'height');
            }
            return new PlacementValue((targetBounds) => {
                return srcEdge - gap - ((targetBounds?.height ?? 0) / 2);
            });
        }
    };
}

/**
 * Places a component to the right of the given source component. Returns a
 * {@link PlacementBuilder} — call `.by(gap)` to specify the edge-to-edge
 * gap in mm.
 *
 * The gap is measured from the **right edge** of the source component's
 * bounding box to the **left edge** of the target component's bounding box.
 *
 * @param component - The reference component to place to the right of.
 * @returns A builder with a `.by()` method.
 *
 * @example
 * ```ts
 * const r1 = new Resistor({ pcb: {
 *   x: rightOf(c1).by(3),
 *   y: sameAs(c1).y,
 * }});
 * ```
 */
export function rightOf(component: Component): PlacementBuilder {
    return {
        by(gap: number = DEFAULT_PLACEMENT_GAP, target?: Component | string): PlacementNumber {
            const srcEdge = component.pcb.x + halfWidth(component);
            if (target) {
                return srcEdge + gap + resolveTargetHalfSize(target, 'width');
            }
            return new PlacementValue((targetBounds) => {
                return srcEdge + gap + ((targetBounds?.width ?? 0) / 2);
            });
        }
    };
}

/**
 * Places a component to the left of the given source component. Returns a
 * {@link PlacementBuilder} — call `.by(gap)` to specify the edge-to-edge
 * gap in mm.
 *
 * The gap is measured from the **left edge** of the source component's
 * bounding box to the **right edge** of the target component's bounding box.
 *
 * @param component - The reference component to place to the left of.
 * @returns A builder with a `.by()` method.
 *
 * @example
 * ```ts
 * const r2 = new Resistor({ pcb: {
 *   x: leftOf(led1).by(4),
 *   y: sameAs(led1).y,
 * }});
 * ```
 */
export function leftOf(component: Component): PlacementBuilder {
    return {
        by(gap: number = DEFAULT_PLACEMENT_GAP, target?: Component | string): PlacementNumber {
            const srcEdge = component.pcb.x - halfWidth(component);
            if (target) {
                return srcEdge - gap - resolveTargetHalfSize(target, 'width');
            }
            return new PlacementValue((targetBounds) => {
                return srcEdge - gap - ((targetBounds?.width ?? 0) / 2);
            });
        }
    };
}

/**
 * Returns the X and Y PCB coordinates of a component for alignment.
 * The returned object is live — if the component moves, the values update.
 *
 * @param component - The component whose position to mirror.
 * @returns An object with `.x` and `.y` properties.
 *
 * @example
 * ```ts
 * // Place c1 directly below r1, aligned in X
 * const c1 = new Capacitor({ pcb: {
 *   x: sameAs(r1).x,
 *   y: below(r1).by(3),
 * }});
 * ```
 */
export function sameAs(component: Component): SameAsResult {
    return {
        get x(): number { return component.pcb.x; },
        get y(): number { return component.pcb.y; }
    };
}

function makeBoardBounds(left: number, right: number, top: number, bottom: number): BoardBounds {
    const width = right - left;
    const height = bottom - top;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    return {
        center: { x: centerX, y: centerY },
        top,
        bottom,
        left,
        right,
        width,
        height,
        topLeft: { x: left, y: top },
        topRight: { x: right, y: top },
        bottomLeft: { x: left, y: bottom },
        bottomRight: { x: right, y: bottom },
        fromLeft(margin: number = 2): PlacementValue {
            return new PlacementValue((tb) => left + margin + ((tb?.width ?? 0) / 2));
        },
        fromRight(margin: number = 2): PlacementValue {
            return new PlacementValue((tb) => right - margin - ((tb?.width ?? 0) / 2));
        },
        fromTop(margin: number = 2): PlacementValue {
            return new PlacementValue((tb) => top + margin + ((tb?.height ?? 0) / 2));
        },
        fromBottom(margin: number = 2): PlacementValue {
            return new PlacementValue((tb) => bottom - margin - ((tb?.height ?? 0) / 2));
        },
    };
}

/**
 * Returns the board boundary dimensions derived from the PCB's outline
 * (Edge.Cuts layer). Use this to place components relative to the board edges.
 *
 * If no outline has been defined, all properties return `0`.
 *
 * @param pcb - The PCB instance (must have had `pcb.outline()` called).
 * @returns A {@link BoardBounds} object with center, edges, corners, and `from*` methods.
 *
 * @example
 * ```ts
 * const typecad = new PCB('myboard');
 * typecad.outline(0, 0, 60, 45);
 *
 * const b = board(typecad);
 *
 * // Place MCU at board center
 * mcu.pcb = { x: b.center.x, y: b.center.y };
 *
 * // Place connector 5mm from left edge (edge-to-edge)
 * const j1 = new Component({ footprint: '...', pcb: {
 *   x: b.fromLeft(5),
 *   y: b.center.y,
 * }});
 *
 * // Place test point 1mm from top-right corner (edge-to-edge)
 * const tp = new Component({ footprint: '...', pcb: {
 *   x: b.fromRight(1),
 *   y: b.fromTop(1),
 * }});
 * ```
 */
export function board(pcb: PCB): BoardBounds {
    const bounds = getPcbState(pcb).getOutlineBounds();

    if (!bounds) {
        return makeBoardBounds(0, 0, 0, 0);
    }

    return makeBoardBounds(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
}
