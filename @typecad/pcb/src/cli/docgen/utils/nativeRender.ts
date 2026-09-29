// Docgen's image pipeline on top of the shared native board renderer
// (board_layer_images.ts): plot a board with typeCAD's own gerber writers
// and render layer/drill-map SVGs in-process — no kicad-cli. Kept as the
// docgen-flavored entry point (unique per-image id prefixes, drill map).

import { renderBoardDrillMapSvg, renderBoardLayerSvg } from '../../../board_layer_images.js';

/**
 * Render one layer-combination image (`![{F.Cu,F.Mask}](…)`): plot the board
 * natively, parse the named layers, theme them, and composite one SVG.
 * Back-side combinations mirror, matching kicad-cli's `--mirror` behavior.
 */
export function renderNativeLayerSvg(
  pcbFilePath: string,
  layerNames: string[],
  themeName: string | undefined,
  idPrefix: string,
): string {
  return renderBoardLayerSvg(pcbFilePath, layerNames, { themeName, idPrefix });
}

/**
 * Render the drill map image (`![{Drill}](…)`): natively plotted Excellon
 * holes over the board outline (Edge.Cuts), like KiCad's drill map.
 */
export function renderNativeDrillSvg(pcbFilePath: string, idPrefix: string): string {
  return renderBoardDrillMapSvg(pcbFilePath, { idPrefix });
}
