export { generateDiffs, type DiffOptions } from './core/diff-generator.js';
export { computeTextualDiff, computeNetlistDiff, computeBomDiff, type TextualDiff, type ChangeDescription, type NetlistDiff, type NetDiffEntry, type BomDiff, type BomDiffEntry, type BomEntry } from './core/pcb-textual-diff.js';
export { annotateLayerSvgs, type SVGAnnotation } from './core/svg-diff-annotator.js';
export { type LayerInfo } from './utils/html-generator.js';
export { allLayers, standardLayers } from './constants.js';
export { cropSvg, sanitizeSvg, getFileHash, clearCache, detectInnerCopperLayers } from './utils/file-utils.js';
