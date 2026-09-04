import type { Component } from './component.js';
import type { PCB } from './pcb/pcb.js';
import { getPcbState } from './pcb/pcb.js';
import { getFootprintBounds, type FootprintBox } from './pcb/footprint_bounds.js';
import logger from './utils/logging.js';

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
  private readonly _resolve: (targetBox: FootprintBox | null, rotationDeg: number) => number;

  constructor(resolve: (targetBox: FootprintBox | null, rotationDeg: number) => number) {
    this._resolve = resolve;
  }

  /** @internal */
  resolveWithFootprint(footprint: string, rotationDeg: number = 0): number {
    return this._resolve(getFootprintBounds(footprint), rotationDeg);
  }

  /**
   * A new deferred value that resolves to this value plus `n` — the nudge
   * stays live: `x: pcb.board.sameAs(r1).plus(2)` follows r1 at create().
   */
  plus(n: number): PlacementValue {
    return new PlacementValue((box, rot) => this._resolve(box, rot) + n);
  }

  /** A new deferred value that resolves to this value minus `n` (live). */
  minus(n: number): PlacementValue {
    return new PlacementValue((box, rot) => this._resolve(box, rot) - n);
  }
}

/**
 * Rotate a footprint's origin-relative box by a KiCad rotation (degrees,
 * same transform as footprint pad placement) and return the new
 * origin-relative AABB. Many footprints' origin is pin 1 or a corner, not
 * the body center — rotating the full box (not just extents) keeps the
 * physical edges where KiCad renders them.
 */
function rotatedBox(box: FootprintBox | null, rotationDeg: number): FootprintBox {
  if (!box) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  // Reduced-shape compat: a {width, height}-only box is treated as
  // origin-centered (the pre-box semantics).
  if (box.minX === undefined || box.minY === undefined || box.maxX === undefined || box.maxY === undefined) {
    const w = (box as { width?: number }).width ?? 0;
    const h = (box as { height?: number }).height ?? 0;
    box = { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2, width: w, height: h };
  }
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Occupied-box edges of a component, in board coordinates. */
function srcEdges(component: Component): { left: number; right: number; top: number; bottom: number } {
  // component.bounds delegates to the footprint cache; since bounds now
  // carry the origin-relative box, no second lookup is needed.
  const box = rotatedBox(component.bounds as FootprintBox | null, component.pcb?.rotation ?? 0);
  return {
    left: component.pcb.x + box.minX,
    right: component.pcb.x + box.maxX,
    top: component.pcb.y + box.minY,
    bottom: component.pcb.y + box.maxY,
  };
}

/** Occupied-box edges of an implicit target at a rotation, relative to its at point. */
function targetEdges(
  box: FootprintBox | null,
  rotationDeg: number,
): { left: number; right: number; top: number; bottom: number } {
  const rb = rotatedBox(box, rotationDeg);
  return { left: rb.minX, right: rb.maxX, top: rb.minY, bottom: rb.maxY };
}

/**
 * Resolve a {@link PlacementNumber} to a concrete number against a footprint.
 * Plain numbers pass through; placement values evaluate their expression
 * against the footprint's bounds (rotation-aware) at call time.
 * @internal
 */
export function resolvePlacement(value: PlacementNumber, footprint: string, rotationDeg: number = 0): number {
  return isPlacementValue(value) ? value.resolveWithFootprint(footprint, rotationDeg) : value;
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
 * Anything assignable to a `pcb` coordinate: a number, a deferred
 * {@link PlacementValue}, a directional builder (`below(r1)` — default gap),
 * or a `sameAs(c)` result (`x: sameAs(r1)` picks up r1's X).
 */
export type PlacementInput = PlacementNumber | PlacementBuilder | SameAsResult;

/**
 * Coerce a {@link PlacementInput} to a {@link PlacementNumber} for one axis.
 * Builders resolve with their default gap; `sameAs` results pick the axis.
 * Anything else fails with a targeted message instead of a cryptic
 * "must be a finite number" later — most commonly a placement helper
 * passed without being called (`y: pcb.board.fromLeft` instead of
 * `fromLeft()`).
 * @internal
 */
export function coercePlacementInput(value: PlacementInput, axis: 'x' | 'y'): PlacementNumber {
  if (typeof value === 'number' || isPlacementValue(value)) return value;
  if (value === null || value === undefined) {
    throw new RangeError(`pcb.${axis} must be a number or a placement value, got ${String(value)}`);
  }
  if (typeof value === 'function') {
    const name = (value as { name?: string }).name || 'an unnamed function';
    throw new RangeError(
      `pcb.${axis} received the function "${name}" — did you mean to call it? ` +
        `E.g. pcb.${axis}: pcb.board.${name}(margin) or .by(gap).`,
    );
  }
  if (typeof value !== 'object') {
    throw new RangeError(`pcb.${axis} must be a number or a placement value, got ${typeof value}`);
  }
  const v = value as PlacementBuilder & SameAsResult & Record<string, unknown>;
  if (typeof v.by === 'function') return v.by();
  if (axis in v) {
    const axisValue = v[axis];
    if (typeof axisValue === 'number' || isPlacementValue(axisValue)) return axisValue;
  }
  throw new RangeError(
    `pcb.${axis} received an object with no usable ${axis} value ` +
      `(keys: ${Object.keys(v).slice(0, 8).join(', ') || 'none'}). ` +
      `Expected a number, a placement value (pcb.board.fromLeft(5), pcb.board.below(r1).by(3)), ` +
      `a builder, or a sameAs result.`,
  );
}

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
  /**
   * Placement values for both axes that center the component's occupied box
   * (rotation-aware, footprint-relative) in the board — unlike
   * `center.x/y`, which centers the component's origin point. Assign the
   * pair directly to `pcb`.
   *
   * @example
   * ```ts
   * mcu.pcb = { ...pcb.board.centered() };
   * ```
   */
  centered(): { x: PlacementValue; y: PlacementValue };
  /**
   * Placement value for a coordinate below a component (courtyard
   * edge-to-edge). Call `.by(gap)` for an explicit gap, or assign the
   * builder directly for the default 2mm gap.
   */
  below(component: Component): PlacementBuilder;
  /** Placement value above a component (courtyard edge-to-edge). */
  above(component: Component): PlacementBuilder;
  /** Placement value to the right of a component (courtyard edge-to-edge). */
  rightOf(component: Component): PlacementBuilder;
  /** Placement value to the left of a component (courtyard edge-to-edge). */
  leftOf(component: Component): PlacementBuilder;
  /**
   * A component's live position for alignment: `{ x, y }` values that
   * re-read the component whenever they are resolved. Assignable directly
   * to a coordinate (`x: pcb.board.sameAs(r1)` picks r1's X).
   */
  sameAs(component: Component): SameAsResult;
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
  /** The component's PCB X coordinate (re-read whenever resolved; `.plus/.minus` chain). */
  readonly x: PlacementValue;
  /** The component's PCB Y coordinate (re-read whenever resolved; `.plus/.minus` chain). */
  readonly y: PlacementValue;
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
      return new PlacementValue((targetBox, rotationDeg) => {
        // Source position is read at resolve time so the value
        // follows a target that moves later.
        const srcBottom = srcEdges(component).bottom;
        const tgtTop =
          typeof target !== 'string' && target
            ? targetEdges(target.bounds as FootprintBox | null, target.pcb?.rotation ?? 0).top
            : targetEdges(targetBox, rotationDeg).top;
        return srcBottom + gap - tgtTop;
      });
    },
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
      return new PlacementValue((targetBox, rotationDeg) => {
        const srcTop = srcEdges(component).top;
        const tgtBottom =
          typeof target !== 'string' && target
            ? targetEdges(target.bounds as FootprintBox | null, target.pcb?.rotation ?? 0).bottom
            : targetEdges(targetBox, rotationDeg).bottom;
        return srcTop - gap - tgtBottom;
      });
    },
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
      return new PlacementValue((targetBox, rotationDeg) => {
        const srcRight = srcEdges(component).right;
        const tgtLeft =
          typeof target !== 'string' && target
            ? targetEdges(target.bounds as FootprintBox | null, target.pcb?.rotation ?? 0).left
            : targetEdges(targetBox, rotationDeg).left;
        return srcRight + gap - tgtLeft;
      });
    },
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
      return new PlacementValue((targetBox, rotationDeg) => {
        const srcLeft = srcEdges(component).left;
        const tgtRight =
          typeof target !== 'string' && target
            ? targetEdges(target.bounds as FootprintBox | null, target.pcb?.rotation ?? 0).right
            : targetEdges(targetBox, rotationDeg).right;
        return srcLeft - gap - tgtRight;
      });
    },
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
    get x(): PlacementValue {
      return new PlacementValue(() => component.pcb.x);
    },
    get y(): PlacementValue {
      return new PlacementValue(() => component.pcb.y);
    },
  };
}

/**
 * Board bounds view over the PCB's outline. Geometry is re-read on every
 * access so `board(pcb)` can be called before `pcb.outline()` — the values
 * follow the final outline.
 */
function makeBoardBounds(
  readBounds: () => { left: number; right: number; top: number; bottom: number } | null,
): BoardBounds {
  const b = () => readBounds() ?? { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    get center() {
      const { left, right, top, bottom } = b();
      return { x: left + (right - left) / 2, y: top + (bottom - top) / 2 };
    },
    get top() {
      return b().top;
    },
    get bottom() {
      return b().bottom;
    },
    get left() {
      return b().left;
    },
    get right() {
      return b().right;
    },
    get width() {
      const { left, right } = b();
      return right - left;
    },
    get height() {
      const { top, bottom } = b();
      return bottom - top;
    },
    get topLeft() {
      const { left, top } = b();
      return { x: left, y: top };
    },
    get topRight() {
      const { right, top } = b();
      return { x: right, y: top };
    },
    get bottomLeft() {
      const { left, bottom } = b();
      return { x: left, y: bottom };
    },
    get bottomRight() {
      const { right, bottom } = b();
      return { x: right, y: bottom };
    },
    fromLeft(margin: number = 2): PlacementValue {
      return new PlacementValue((tb, rot) => b().left + margin - targetEdges(tb, rot).left);
    },
    fromRight(margin: number = 2): PlacementValue {
      return new PlacementValue((tb, rot) => b().right - margin - targetEdges(tb, rot).right);
    },
    fromTop(margin: number = 2): PlacementValue {
      return new PlacementValue((tb, rot) => b().top + margin - targetEdges(tb, rot).top);
    },
    fromBottom(margin: number = 2): PlacementValue {
      return new PlacementValue((tb, rot) => b().bottom - margin - targetEdges(tb, rot).bottom);
    },
    centered(): { x: PlacementValue; y: PlacementValue } {
      // Body-centering: place the occupied box's center at the board center.
      // The origin offset (box center rel at-point) shifts the anchor so the
      // body lands centered even for off-center, rotated footprints.
      return {
        x: new PlacementValue((tb, rot) => {
          const { left, right } = b();
          const boxCenterOffsetX = (targetEdges(tb, rot).left + targetEdges(tb, rot).right) / 2;
          return (left + right) / 2 - boxCenterOffsetX;
        }),
        y: new PlacementValue((tb, rot) => {
          const { top, bottom } = b();
          const boxCenterOffsetY = (targetEdges(tb, rot).top + targetEdges(tb, rot).bottom) / 2;
          return (top + bottom) / 2 - boxCenterOffsetY;
        }),
      };
    },
    // Component-relative verbs: stateless, hosted here so all placement
    // flows through the one `pcb.board` namespace.
    below: (c: Component) => below(c),
    above: (c: Component) => above(c),
    rightOf: (c: Component) => rightOf(c),
    leftOf: (c: Component) => leftOf(c),
    sameAs: (c: Component) => sameAs(c),
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
  return makeBoardBounds(() => {
    const bounds = getPcbState(pcb).getOutlineBounds();
    if (!bounds) return null;
    return { left: bounds.minX, right: bounds.maxX, top: bounds.minY, bottom: bounds.maxY };
  });
}
