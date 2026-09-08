// === Code Metadata (embedded in KiCad "Code" property) ===

/**
 * Schema version 1 metadata encoded in the KiCad Code property.
 * Encoded as base64url of compact JSON, prefixed with "typecad:v1:".
 */
export interface CodeMetadata {
  /** Schema version (always 1 for this format) */
  v: 1;
  /** Component UUID — primary identity for round-trip matching */
  u: string;
  /** Variable name (null/undefined if component was created anonymously) */
  n?: string;
  /** Whether the variable is assigned as this.X (true) or a local variable (false/undefined) */
  t?: boolean;
  /** Footprint identity hash — fallback identity for anonymous components */
  h?: string;
  /** Source file path — fallback, only when variable name is missing */
  f?: string;
  /** Source line number — fallback, only when variable name is missing */
  l?: number;
}

/** Legacy Code format parsed from old boards (v=0 indicates legacy) */
export interface LegacyCodeMetadata {
  v: 0;
  u: string;
  n?: string;
  t?: boolean;
  f?: string;
  l?: number;
}

// === Intermediate Representation (IR) Types ===

export interface ReferencePropertyIR {
  x: number;
  y: number;
  rotation: number;
  layer: string;
  width: number;
  height: number;
  thickness: number;
  text?: string;
}

export interface TextLayoutIR {
  x: number;
  y: number;
  rotation?: number;
  layer?: string;
  width?: number;
  height?: number;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: 'top' | 'bottom' | 'middle';
    mirror?: boolean;
  };
  show?: boolean;
}

export interface FabLayoutIR extends TextLayoutIR {
  text?: string;
}

export interface KicadFootprintIR {
  footprintName: string;
  reference: string;
  position: { x: number; y: number; rotation: number };
  side: 'front' | 'back';
  uuid: string;
  codeMetadata: CodeMetadata | LegacyCodeMetadata | null;
  referenceProperty: ReferencePropertyIR | null;
  valueProperty: ReferencePropertyIR | null;
  referenceLayout?: TextLayoutIR;
  valueLayout?: TextLayoutIR;
  fabLayout?: FabLayoutIR;
}

export interface KicadSegmentIR {
  start: { x: number; y: number };
  end: { x: number; y: number };
  width: number;
  layer: string;
  net?: number;
}

export interface KicadTextIR {
  text: string;
  x: number;
  y: number;
  rotation: number;
  layer: string;
  fontSize?: [number, number];
  fontFace?: string;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: 'top' | 'bottom' | 'middle';
    mirror?: boolean;
  };
  hide?: boolean;
}

export interface KicadViaIR {
  at: { x: number; y: number };
  size: number;
  drill: number;
  net?: number;
}

export interface KicadNetIR {
  number: number;
  name: string;
}

export interface KicadOutlineIR {
  type: 'rect' | 'line' | 'arc' | 'circle' | 'poly';
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  center?: { x: number; y: number };
  mid?: { x: number; y: number };
  width?: number;
  height?: number;
  /** Ordered polygon vertices (gr_poly outlines only). */
  points?: { x: number; y: number }[];
}

/** A single layer in a `(setup (stackup ...))` block. */
export interface KicadStackupLayerIR {
  /** Canonical layer name, e.g. "F.Cu", "dielectric 1", "F.Mask". */
  name: string;
  type?: string;
  thickness?: number;
  material?: string;
}

/** Parsed stackup from `(setup (stackup ...))`. */
export interface KicadStackupIR {
  /** Number of copper layers (derived from layer names ending in ".Cu"). */
  copperLayerCount: number;
  /** Layers top → bottom. */
  layers: KicadStackupLayerIR[];
  copperFinish?: string;
  dielectricConstraints?: boolean;
}

/** A parsed `(zone ...)` block: a filled copper pour or a rule area. */
export interface KicadZoneIR {
  /** Copper layers the zone spans. */
  layers: string[];
  /** Net name (resolved via net_name child or the net list); null for unconnected pours. */
  netName: string | null;
  name: string | null;
  priority: number | null;
  locked: boolean;
  /** Ordered polygon vertices. */
  polygon: { x: number; y: number }[];
  /**
   * Present when the zone is a rule area. Each flag is true when that
   * category is not allowed (KiCad `not_allowed`).
   */
  keepout?: {
    tracks: boolean;
    vias: boolean;
    pads: boolean;
    copperpour: boolean;
    footprints: boolean;
  };
  /** Rule-area option: applies to footprints placed from a schematic sheet. */
  placement?: boolean;
  /** Fill block settings; undefined when the zone has no fill block. */
  fill?: {
    mode: 'solid' | 'hatched';
    thermalGap?: number;
    thermalBridgeWidth?: number;
    islandRemovalMode?: number;
    islandAreaMin?: number;
    smoothing?: 'chamfer' | 'fillet' | 'none';
    smoothingRadius?: number;
    hatchThickness?: number;
    hatchGap?: number;
    hatchOrientation?: number;
  };
  minThickness?: number;
  filledAreasThickness?: boolean;
  /** Pad connection: 'thru_hole_only' | 'full' | 'no' | null (thermal default). */
  connectPads?: string | null;
  clearance?: number;
  hatchStyle?: string;
  hatchPitch?: number;
}

/** Top-level intermediate representation of a .kicad_pcb file */
export interface KicadIR {
  version: string;
  generator: string;
  footprints: KicadFootprintIR[];
  textElements: KicadTextIR[];
  segments: KicadSegmentIR[];
  vias: KicadViaIR[];
  outlines: KicadOutlineIR[];
  nets: KicadNetIR[];
  /** Layer stackup from `(setup (stackup ...))`, or null if absent. */
  stackup: KicadStackupIR | null;
  /** Zones: filled pours and rule areas, in file order. */
  zones: KicadZoneIR[];
}

// === Change Tracking Types ===

export interface PendingChange {
  filePath: string;
  variableName: string;
  prefix: string;
  oldX: number | null;
  oldY: number | null;
  oldRotation: number | null;
  oldSide: 'front' | 'back' | null;
  newX: number;
  newY: number;
  newRotation: number;
  newSide: 'front' | 'back';
  label: string;
}

export interface PendingTextChange {
  filePath: string;
  sourceTextContent: string;
  newPcbText: string;
  lineIdx: number;
  endIdx: number;
  callText: string;
  oldX: number;
  oldY: number;
  oldRotation: number;
  newX: number;
  newY: number;
  newRotation: number;
  oldLayer: string;
  newLayer: string;
  oldFont: string | undefined;
  newFont: string | undefined;
  oldWidth: number | undefined;
  newWidth: number | undefined;
  oldHeight: number | undefined;
  newHeight: number | undefined;
  oldThickness: number | undefined;
  newThickness: number | undefined;
  oldBold: boolean;
  newBold: boolean;
  oldItalic: boolean;
  newItalic: boolean;
  oldJustify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
  newJustify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
  label: string;
  changedProps: string[];
}

export interface PendingLayoutChange {
  filePath: string;
  variableName: string;
  prefix: string;
  layoutType: 'referenceLayout' | 'valueLayout' | 'fabLayout';
  oldLayout: TextLayoutIR | null;
  newLayout: TextLayoutIR;
  label: string;
  changedProps: string[];
}

// === Matching Types ===

export type MatchConfidence = 'uuid' | 'hash' | 'variable-fallback' | 'none';

export interface SourceLocation {
  filePath: string;
  variableName?: string;
  isThis: boolean;
}

export interface MatchResult {
  irFootprint: KicadFootprintIR;
  sourceLocation: SourceLocation | null;
  matchConfidence: MatchConfidence;
}
