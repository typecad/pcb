// ---------------------------------------------------------------------------
// Native board layer images: plot a .kicad_pcb with typeCAD's own
// gerber/drill writers (gerber_export) and render layer combinations as SVG
// with the gerber viewer's renderer — no kicad-cli process. Shared by the
// docgen image pipeline and gitdiff; the docgen flavor lives in
// cli/docgen/utils/nativeRender.ts.
//
// One board plots once per process: every gerber a caller might request is
// written to a temp dir keyed by board path + mtime, and each render parses
// only the layers it names.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from './sexpr/index.js';
import type { SExpr } from './sexpr/index.js';
import {
  GRAPHIC_LAYERS,
  canonicalLayerName,
  plotCopperLayersFromSource,
  plotDrillFromSource,
  plotGraphicsLayersFromSource,
  type LayerSpec,
} from './gerber_export/index.js';
import { copperLayers } from './gerber_export/copper.js';
import { refillZoneFills } from './pcb/pcb_zone_fill.js';
import { getFlatpakSafeTempDir } from './kicad.js';
import {
  detectLayer,
  finalizeAndSortLayers,
  findLayerTheme,
  layerThemeColor,
  parseExcellon,
  parseGerber,
  renderSvg,
  type LayerInfo,
  type LayerTheme,
} from './gerber_viewer/index.js';
import type { DrillImage, GerberImage } from './gerber_viewer/index.js';

interface PlottedBoard {
  /** KiCad layer id (F.Cu, F.SilkS, …) → plotted file path */
  files: Map<string, string>;
  drillFile: string;
}

const plotCache = new Map<string, { mtimeMs: number; board: PlottedBoard }>();
const plotDirs = new Set<string>();

process.on('exit', () => {
  for (const dir of plotDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort scratch cleanup
    }
  }
});

/**
 * Layer set images may name: KiCad's default emission set plus the rest of
 * the built-in user-layer range. kicad-cli resolved names like User.5
 * against KiCad's built-in layer table (rendering them empty when the board
 * carries nothing there), so callers naming those layers must keep working.
 */
const IMAGE_LAYER_SPECS: LayerSpec[] = [
  ...GRAPHIC_LAYERS,
  ...[5, 6, 7, 8, 9].map((n): LayerSpec => ({
    short: `User.${n}`,
    stem: `User_${n}`,
    extension: 'gbr',
    fileFunction: 'Other,User',
  })),
];

function plotBoard(pcbFilePath: string): PlottedBoard {
  const stat = fs.statSync(pcbFilePath);
  const cached = plotCache.get(pcbFilePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    // the cache must never outlive the files it points at (a docgen run
    // ends with its temp manager wiping scratch space) — probe first
    if (fs.existsSync(cached.board.drillFile)) return cached.board;
    plotCache.delete(pcbFilePath);
  }

  let source = fs.readFileSync(pcbFilePath, 'utf8');
  // pours go stale the moment board geometry changes — refill before
  // plotting, same as `typecad-pcb export gerbers` (fails soft: boards the
  // fill engine can't handle keep their saved fills)
  const filled = refillZoneFills(source);
  if (filled !== null) source = filled;

  const outDir = fs.mkdtempSync(path.join(getFlatpakSafeTempDir(), 'typecad-plot-'));
  plotDirs.add(outDir);
  plotCopperLayersFromSource(source, pcbFilePath, { outDir });
  plotGraphicsLayersFromSource(source, pcbFilePath, { outDir, layers: IMAGE_LAYER_SPECS });
  const root = SNode.from(parse(source) as SExpr[]);
  const drillFile = plotDrillFromSource(source, pcbFilePath, {
    outDir,
    copperLayerCount: copperLayers(root).length,
  });

  // the writers' file names are deterministic (`<board>-<layer>.<ext>`) —
  // build the layer lookup directly instead of reverse-guessing basenames
  const stem = path.basename(pcbFilePath).replace(/\.kicad_pcb$/, '');
  const files = new Map<string, string>();
  for (const cu of copperLayers(root)) {
    files.set(cu.name, path.join(outDir, `${stem}-${cu.name.replace('.', '_')}.${cu.extension}`));
  }
  for (const gl of IMAGE_LAYER_SPECS) {
    files.set(gl.short, path.join(outDir, `${stem}-${gl.stem}.${gl.extension}`));
  }

  const board: PlottedBoard = { files, drillFile };
  plotCache.set(pcbFilePath, { mtimeMs: stat.mtimeMs, board });
  return board;
}

function buildRenderLayer(
  file: string,
  theme: LayerTheme | null,
  colorOverride?: string,
): { info: LayerInfo; image: GerberImage | DrillImage } {
  const name = path.basename(file);
  const image: GerberImage | DrillImage = name.endsWith('.drl')
    ? parseExcellon(fs.readFileSync(file, 'utf8'), { name })
    : parseGerber(fs.readFileSync(file, 'utf8'), { name });
  // every layer an image names is on-stage — detectLayer's per-kind display
  // defaults (paste/silk/mask hidden) don't apply here
  const info: LayerInfo = { ...detectLayer(name, image), defaultVisible: true };
  info.color = colorOverride ?? (theme ? (layerThemeColor(theme, info) ?? info.color) : info.color);
  return { info, image };
}

/** Painter's order (finalizeAndSortLayers): outline, copper bottom-up,
 *  silk/mask, fab — drills through the stack. */
function orderForPainting(
  layers: Array<{ info: LayerInfo; image: GerberImage | DrillImage }>,
): Array<{ info: LayerInfo; image: GerberImage | DrillImage }> {
  const infos = finalizeAndSortLayers(layers.map((l) => l.info));
  const byId = new Map(infos.map((i) => [i.id, i]));
  return layers
    .map((l) => ({ ...l, info: byId.get(l.info.id)! }))
    .sort((a, b) => a.info.order - b.info.order || a.info.name.localeCompare(b.info.name));
}

export interface BoardLayerSvgOptions {
  /** theme name resolved against the viewer's registered board themes */
  themeName?: string;
  /** unique id prefix when several renders land in one document */
  idPrefix?: string;
  /** mirror horizontally (kicad-cli --mirror parity for back-side views) */
  mirrorX?: boolean;
  /** flash pads as absolute-coordinate shapes (self-contained, diffable) */
  inlineFlashes?: boolean;
}

/**
 * Render one layer-combination image of a board: plot natively, parse the
 * named layers (GUI spellings like F.Silkscreen canonicalized), theme them,
 * and composite one SVG. Throws with the available layer list when a name
 * is unknown.
 */
export function renderBoardLayerSvg(
  pcbFilePath: string,
  layerNames: string[],
  opts: BoardLayerSvgOptions = {},
): string {
  if (layerNames.length === 0) throw new Error('No PCB layers specified for processing');

  const board = plotBoard(pcbFilePath);
  const theme = findLayerTheme(opts.themeName);
  const canonical = layerNames.map(canonicalLayerName);

  const missing = canonical.filter((l) => !board.files.has(l));
  if (missing.length > 0) {
    const known = [...board.files.keys()].sort().join(', ');
    throw new Error(`Unknown PCB layer(s): ${missing.join(', ')}. Available: ${known}`);
  }

  const layers = canonical.map((l) => buildRenderLayer(board.files.get(l)!, theme));
  return renderSvg(orderForPainting(layers), {
    // transparent canvas like kicad-cli's SVG export — the host page's
    // background shows through; static embeds bake literal colors (var()
    // ink doesn't resolve in non-browser renderers)
    background: 'transparent',
    flatColors: true,
    inlineFlashes: opts.inlineFlashes,
    idPrefix: opts.idPrefix,
    mirrorX: opts.mirrorX ?? canonical.some((l) => l.startsWith('B.')),
  });
}

/**
 * Render a drill map image: natively plotted Excellon holes over the board
 * outline (Edge.Cuts), like KiCad's drill map. Untinted by the board theme —
 * the map's subject is the holes.
 */
export function renderBoardDrillMapSvg(pcbFilePath: string, opts: { idPrefix?: string } = {}): string {
  const board = plotBoard(pcbFilePath);
  const layers: Array<{ info: LayerInfo; image: GerberImage | DrillImage }> = [
    buildRenderLayer(board.drillFile, null),
  ];
  const edge = board.files.get('Edge.Cuts');
  if (edge) layers.unshift(buildRenderLayer(edge, null, '#9aa0a6'));
  return renderSvg(orderForPainting(layers), {
    background: 'transparent',
    flatColors: true,
    idPrefix: opts.idPrefix,
  });
}
