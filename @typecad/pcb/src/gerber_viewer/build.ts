import fs from 'node:fs';
import path from 'node:path';
import { isList, nameOf, parse } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { detectLayer, finalizeAndSortLayers, type LayerInfo } from './detect_layer.js';
import { parseExcellon } from './gerber/parse_excellon.js';
import { parseGerber } from './gerber/parse_gerber.js';
import type { DrillImage, GerberImage } from './gerber/types.js';
import { computeDrcMarkers, computeFabReport, type DrcMarker, type FabReport } from './report.js';
import { computeLayerBounds, renderSvg, type RenderLayer } from './render/svg.js';
import { buildViewerHtml } from './render/viewer_html.js';

export interface ViewerBuildResult {
  svg: string;
  html: string;
  layers: LayerInfo[];
  warnings: string[];
  report: FabReport;
}

/** File kinds that may contain copper/silk/mask output. */
export const GERBER_EXTENSIONS = [
  '.gbr',
  '.gtp',
  '.gbp',
  '.gtl',
  '.gbl',
  '.gts',
  '.gbs',
  '.gto',
  '.gbo',
  '.gko',
  '.gm1',
  '.gml',
  '.gpi',
  '.gdo',
  '.gta',
  '.gba',
];

/** File kinds that may contain drill data. */
export const DRILL_EXTENSIONS = ['.drl', '.drd', '.xln'];

/** Sniff file content: gerber, drill, or unknown (e.g. reports, zips). */
export function sniffKind(content: string): 'gerber' | 'drill' | 'unknown' {
  if (/(^|\n)\s*M48/.test(content.slice(0, 4096))) return 'drill';
  if (/%FS|%ADD|%AM|%MO(?:MM|IN)/.test(content.slice(0, 8192))) return 'gerber';
  if (/^G90|^G05|^T\d/m.test(content.slice(0, 2048))) return 'drill';
  return 'unknown';
}

/** Expand input paths (files or directories) into parseable gerber/drill files. */
export function collectGerberFiles(inputPaths: string[]): { files: string[]; warnings: string[] } {
  const files: string[] = [];
  const warnings: string[] = [];
  for (const input of inputPaths) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      const entries = fs
        .readdirSync(input)
        .map((e) => path.join(input, e))
        .filter((p) => fs.statSync(p).isFile());
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (GERBER_EXTENSIONS.includes(ext) || DRILL_EXTENSIONS.includes(ext)) {
          files.push(entry);
        } else if (ext === '.txt') {
          // .txt drill maps are common; keep them only if they smell like Excellon
          try {
            const head = fs.readFileSync(entry, 'utf8').slice(0, 4096);
            if (sniffKind(head) === 'drill') files.push(entry);
          } catch {
            warnings.push(`could not read ${entry}`);
          }
        }
      }
    } else if (stat.isFile()) {
      files.push(input);
    } else {
      warnings.push(`skipping non-file input ${input}`);
    }
  }
  return { files, warnings };
}

/**
 * Shorten display names by dropping a shared board-name prefix
 * ("board-F_Cu.gtl" -> "F_Cu.gtl"). Returns the prefix that was stripped
 * ("" when there is none).
 */
export function stripCommonPrefix(names: string[]): { stripped: string[]; prefix: string } {
  if (names.length < 2) return { stripped: names, prefix: '' };
  let prefix = names[0]!;
  for (const name of names) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  // accept the raw prefix when every name continues with a separator
  // ("board-F_Cu.gtl" / "board.drl" share "board" cleanly)
  const boundaryAfterPrefix = names.every((n) => n.length === prefix.length || /[-_. ]/.test(n[prefix.length]!));
  if (!boundaryAfterPrefix) {
    const cut = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('_'), prefix.lastIndexOf(' '));
    prefix = cut > 0 ? prefix.slice(0, cut + 1) : '';
  }
  if (prefix.length < 3) return { stripped: names, prefix: '' };
  return {
    stripped: names.map((n) =>
      n.startsWith(prefix) && n.length > prefix.length ? n.slice(prefix.length).replace(/^[-_. ]+/, '') : n,
    ),
    prefix,
  };
}

export interface ViewerBuildOptions {
  title?: string;
  background?: string;
  /** KiCad netlist (.net) path — fills in pad→net for highlighting/probing. */
  netlistPath?: string;
  /** kicad-cli DRC report (<board>_drc.json) path — renders violation markers. */
  drcReportPath?: string;
}

/** Parse a KiCad netlist into a "REF.pin" -> net map (N/C pads excluded). */
function parseNetlist(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return map;
  }
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    if (nameOf(expr[0]) === 'net') {
      let netName = '';
      for (const child of expr) {
        if (isList(child) && nameOf(child[0]) === 'name' && typeof child[1] === 'string') {
          netName = child[1];
        }
      }
      if (netName && netName !== 'N/C') {
        for (const child of expr) {
          if (isList(child) && nameOf(child[0]) === 'node') {
            let ref = '';
            let pin = '';
            for (const field of child) {
              if (!isList(field)) continue;
              const key = nameOf(field[0]);
              if (key === 'ref' && typeof field[1] === 'string') ref = field[1];
              if (key === 'pin' && typeof field[1] === 'string') pin = field[1];
            }
            if (ref && pin) map[`${ref}.${pin}`] = netName;
          }
        }
      }
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return map;
}

/**
 * Full pipeline: read files, parse gerbers/drills, detect + order layers,
 * render the SVG and wrap it in the interactive HTML viewer.
 */
export function buildViewerFromFiles(paths: string[], options: ViewerBuildOptions = {}): ViewerBuildResult {
  const { files, warnings } = collectGerberFiles(paths);
  if (files.length === 0) {
    throw new Error(`no gerber or drill files found in: ${paths.join(', ')} (expected .gbr/.drl and friends)`);
  }

  const renderLayers: RenderLayer[] = [];
  for (const file of files) {
    const name = path.basename(file);
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (error) {
      warnings.push(`could not read ${name}: ${(error as Error).message}`);
      continue;
    }
    const kind = sniffKind(content);
    if (kind === 'unknown') {
      warnings.push(`skipping ${name}: not recognized as gerber or excellon`);
      continue;
    }
    const image: GerberImage | DrillImage =
      kind === 'gerber' ? parseGerber(content, { name }) : parseExcellon(content, { name });
    warnings.push(...image.warnings.map((w) => `${name}: ${w}`));
    renderLayers.push({ info: detectLayer(name, image), image });
  }

  if (renderLayers.length === 0) {
    throw new Error(`none of the input files could be parsed: ${paths.join(', ')}`);
  }

  const ordered = (() => {
    const infos = finalizeAndSortLayers(renderLayers.map((l) => l.info));
    const byId = new Map(infos.map((i) => [i.id, i]));
    return renderLayers
      .map((l) => ({ ...l, info: byId.get(l.info.id)! }))
      .sort((a, b) => {
        if (a.info.order !== b.info.order) return a.info.order - b.info.order;
        return a.info.name.localeCompare(b.info.name);
      });
  })();
  const names = ordered.map((l) => l.info.name);
  const { stripped, prefix } = stripCommonPrefix(names);
  const layers: LayerInfo[] = ordered.map((l, i) => ({
    ...l.info,
    name: stripped[i]!,
    fullName: stripped[i] === l.info.name ? undefined : l.info.name,
  }));

  // netlist (serve mode): pads carry %TO.P ref/pin but no net in gerbers;
  // the netlist fills that in so clicking a pad highlights its net
  let padNets: Record<string, string> = {};
  if (options.netlistPath && fs.existsSync(options.netlistPath)) {
    try {
      padNets = parseNetlist(fs.readFileSync(options.netlistPath, 'utf8'));
    } catch (error) {
      warnings.push(`could not parse netlist: ${(error as Error).message}`);
    }
  }
  if (Object.keys(padNets).length > 0) {
    for (const layer of ordered) {
      if (layer.info.kind !== 'copper') continue;
      for (const op of (layer.image as GerberImage).ops) {
        if (op.type === 'flash' && !op.net && op.ref && op.pin) {
          const net = padNets[`${op.ref}.${op.pin}`];
          if (net) op.net = net;
        }
      }
    }
  }

  const report = computeFabReport(ordered);

  // DRC markers (serve mode): positions arrive in board coordinates; map them
  // into gerber space via the edge layer vs the board file's outline bbox
  let drcMarkers: DrcMarker[] = [];
  if (options.drcReportPath && fs.existsSync(options.drcReportPath)) {
    try {
      const edgeLayer = ordered.find((l) => l.info.kind === 'edge');
      const edgeBounds = edgeLayer ? computeLayerBounds(edgeLayer) : null;
      const pcbPath = path.join(path.dirname(options.drcReportPath), getPcbName(options.drcReportPath));
      const boardOutline = fs.existsSync(pcbPath) ? parseBoardOutline(fs.readFileSync(pcbPath, 'utf8')) : null;
      drcMarkers = computeDrcMarkers(
        JSON.parse(fs.readFileSync(options.drcReportPath, 'utf8')),
        edgeBounds,
        boardOutline,
      );
    } catch (error) {
      warnings.push(`could not overlay DRC report: ${(error as Error).message}`);
    }
  }

  const svg = renderSvg(ordered, { background: options.background });
  const html = buildViewerHtml(svg, layers, {
    title: options.title ?? (prefix.replace(/[-_. ]+$/, '') || path.basename(paths[0]!)),
    report,
    drcMarkers,
  });
  return { svg, html, layers, warnings, report };
}

/** <board>_drc.json -> the pcb it was run against lives beside it. */
function getPcbName(drcPath: string): string {
  const base = path.basename(drcPath).replace(/_drc\.json$/, '');
  return `${base}.kicad_pcb`;
}

/** Edge.Cuts bbox in board coordinates from the .kicad_pcb s-expression. */
function parseBoardOutline(content: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: unknown, y: unknown): void => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const coords = (expr: SExpr[]): void => {
    for (const child of expr) {
      if (!isList(child)) continue;
      const key = nameOf(child[0]);
      if (key === 'start' || key === 'end' || key === 'mid' || key === 'center') {
        consider(child[1], child[2]);
      }
    }
  };
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    const head = nameOf(expr[0]);
    if (/^gr_(line|rect|arc|poly|circle)/.test(head)) {
      let onEdge = false;
      for (const child of expr) {
        if (isList(child) && nameOf(child[0]) === 'layer') {
          const layers = child.slice(1).map((l) => (typeof l === 'string' ? l : nameOf(l)));
          if (layers.includes('Edge.Cuts')) onEdge = true;
        }
      }
      if (onEdge) coords(expr);
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
