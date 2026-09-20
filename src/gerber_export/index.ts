// Native gerber export (Phase 1: copper layers). Reads a .kicad_pcb and
// writes copper gerbers with KiCad-compatible naming, attributes, and
// conventions — see gerber_spec/SPEC.md for the captured spec.
export { GerberWriter, type ApertureShape, type AperFunction, type Point } from './gerber_writer.js';
export {
  plotCopperLayers,
  plotCopperLayersFromSource,
  type CopperPlotOptions,
} from './copper.js';
export {
  plotGraphicsLayersFromSource,
  GRAPHIC_LAYERS,
  type GraphicsPlotOptions,
  type LayerSpec,
} from './layers.js';
export { plotDrillFromSource, type DrillOptions } from './drill.js';
export { plotJobFromSource, type JobOptions, type JobFileInfo } from './job.js';
