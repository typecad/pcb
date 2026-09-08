/**
 * Intermediate representation shared by the Gerber/Excellon parsers and the
 * SVG renderer. All coordinates are in the file's own units (mm or in),
 * in the native Gerber frame (x right, y up).
 */

export interface Point {
  x: number;
  y: number;
}

export type Polarity = 'dark' | 'clear';

export type Units = 'mm' | 'in';

/** %FS format specification: zero-omission mode, notation, digit counts. */
export interface FormatSpec {
  /** L = leading zeros omitted, T = trailing zeros omitted. */
  zeroMode: 'L' | 'T';
  /** A = absolute, I = incremental (incremental is not supported). */
  notation: 'A' | 'I';
  integerDigits: number;
  decimalDigits: number;
}

export type ApertureHole = { diameter: number };

export type StandardTemplate =
  | { kind: 'circle'; diameter: number; hole: ApertureHole | null }
  | { kind: 'rect'; width: number; height: number; hole: ApertureHole | null }
  | { kind: 'obround'; width: number; height: number; hole: ApertureHole | null }
  | {
      kind: 'polygon';
      outerDiameter: number;
      vertices: number;
      rotation: number;
      hole: ApertureHole | null;
    };

export type ApertureTemplate = StandardTemplate | { kind: 'macro'; name: string; modifiers: number[] };

export interface Aperture {
  code: number;
  template: ApertureTemplate;
}

/** Macro primitives after arithmetic evaluation, in macro-local coordinates. */
export type MacroPrimitive =
  | { kind: 'circle'; exposure: boolean; diameter: number; center: Point }
  | {
      kind: 'vectorLine';
      exposure: boolean;
      width: number;
      from: Point;
      to: Point;
      rotation: number;
    }
  | {
      kind: 'centerLine';
      exposure: boolean;
      width: number;
      height: number;
      center: Point;
      rotation: number;
    }
  | { kind: 'outline'; exposure: boolean; points: Point[]; rotation: number }
  | {
      kind: 'polygon';
      exposure: boolean;
      outerDiameter: number;
      vertices: number;
      center: Point;
      rotation: number;
    };

/**
 * A standard aperture plus (for macro apertures) its evaluated primitives and
 * a rough bounding half-extent used for viewBox estimation.
 */
export interface EvaluatedAperture {
  template: StandardTemplate | null;
  primitives: MacroPrimitive[];
  extent: { rx: number; ry: number };
  warnings: string[];
}

export type PathSegment = { kind: 'line'; to: Point } | { kind: 'arc'; to: Point; center: Point; ccw: boolean };

export type DrawOp =
  | {
      type: 'trace';
      polarity: Polarity;
      aperture: number;
      from: Point;
      segments: PathSegment[];
      /** X2 object attribute %TO.N, when the plotter stated it. */
      net?: string;
    }
  | {
      type: 'flash';
      polarity: Polarity;
      aperture: number;
      at: Point;
      /** X2 object attributes: %TO.N net, %TO.P ref+pin, %TO.C ref. */
      net?: string;
      ref?: string;
      pin?: string;
    }
  | { type: 'region'; polarity: Polarity; contours: RegionContour[]; net?: string };

export interface RegionContour {
  start: Point;
  segments: PathSegment[];
}

export interface GerberAttributes {
  /** %TF.FileFunction, e.g. "Copper,L1,Top" or "Profile,NP". */
  fileFunction?: string;
  /** %TF.FilePolarity: "Positive" | "Negative". */
  filePolarity?: string;
  /** %TF.Part. */
  part?: string;
}

export interface GerberImage {
  sourceName: string;
  units: Units;
  format: FormatSpec;
  apertures: Map<number, Aperture>;
  macros: Map<string, { name: string; body: string[] }>;
  ops: DrawOp[];
  attributes: GerberAttributes;
  warnings: string[];
}

export interface DrillTool {
  code: number;
  diameter: number;
}

export interface DrillHole {
  tool: number;
  at: Point;
}

export interface DrillSlot {
  tool: number;
  from: Point;
  to: Point;
}

export interface DrillImage {
  sourceName: string;
  units: Units;
  tools: Map<number, DrillTool>;
  holes: DrillHole[];
  slots: DrillSlot[];
  attributes: GerberAttributes;
  warnings: string[];
}
