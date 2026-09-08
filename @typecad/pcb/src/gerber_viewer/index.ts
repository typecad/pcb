/**
 * @typecad/gerber-viewer
 *
 * Parse KiCad/fab Gerber (RS-274X) and Excellon drill output and render it as
 * an interactive, self-contained HTML viewer (or a plain SVG). Zero runtime
 * dependencies.
 */

export { parseGerber, parseCoordinate, type ParseGerberOptions } from './gerber/parse_gerber.js';
export { parseExcellon, type ParseExcellonOptions } from './gerber/parse_excellon.js';
export {
  evalExpression,
  evaluateAperture,
  evaluateMacro,
  parseApertureTemplate,
  type MacroDefinition,
} from './gerber/apertures.js';
export { detectLayer, finalizeAndSortLayers, type LayerInfo, type LayerKind, type LayerSide } from './detect_layer.js';
export { computeLayerBounds, renderSvg, type Bounds, type RenderLayer, type RenderOptions } from './render/svg.js';
export { buildViewerHtml, type ViewerOptions } from './render/viewer_html.js';
export {
  computeDrcMarkers,
  computeFabReport,
  type CopperLayerStats,
  type DrillStat,
  type DrcMarker,
  type FabReport,
} from './report.js';
export {
  buildViewerFromFiles,
  collectGerberFiles,
  sniffKind,
  DRILL_EXTENSIONS,
  GERBER_EXTENSIONS,
  type ViewerBuildResult,
} from './build.js';
export { findBoardFile, RELOAD_CLIENT, startGerberViewerServer, type ServeHandle, type ServeOptions } from './serve.js';
export { run as runCli } from './cli.js';
export type {
  Aperture,
  ApertureHole,
  ApertureTemplate,
  DrillHole,
  DrillImage,
  DrillSlot,
  DrillTool,
  DrawOp,
  EvaluatedAperture,
  FormatSpec,
  GerberAttributes,
  GerberImage,
  MacroPrimitive,
  PathSegment,
  Point,
  Polarity,
  RegionContour,
  StandardTemplate,
  Units,
} from './gerber/types.js';
