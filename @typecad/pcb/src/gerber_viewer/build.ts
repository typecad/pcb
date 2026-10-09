import fs from 'node:fs';
import path from 'node:path';
import { isList, nameOf, parse } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { PKG_VERSION } from '../gerber_export/writer_utils.js';
import { refreshPadsManifestFromBoard } from '../pcb/pcb_pads_writer.js';
import { fillZone } from '../pcb/pcb_zone_fill_engine.js';
import { SNode } from '../sexpr/index.js';
import { detectLayer, finalizeAndSortLayers, type LayerInfo } from './detect_layer.js';
import { rotatePoint } from './gerber/geometry.js';
import { parseExcellon } from './gerber/parse_excellon.js';
import { parseGerber } from './gerber/parse_gerber.js';
import type { DrillImage, GerberImage, Point } from './gerber/types.js';
import { computeDrcMarkers, computeFabReport, type DrcMarker, type FabReport } from './report.js';
import { DEFAULT_PCBA_THEME, PCBA_THEME_LABELS, PCBA_THEMES, type PcbaTheme } from './render/theme.js';
import { discoverNetlist, parseNetlistComponents } from './netlist.js';
import { computeLayerBounds, renderSvg, type RenderLayer } from './render/svg.js';
import { renderPcbaSvg } from './render/pcba.js';
import { extractComponents } from './render/components.js';
import type { NetlistComponent } from './render/components.js';
import { buildViewerHtml, splitSvg, type ViewerOptions } from './render/viewer_html.js';

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

// KiCad's inner-copper plot extensions: In1_Cu.g1 … In30_Cu.g30 — numbered,
// so they cannot sit in the static list. Anything .g1–.30 IS a gerber
// (fabrication sets don't use numeric extensions for anything else).
const INNER_COPPER_EXT = /^\.g(?:3[0]|[12][0-9]|[1-9])$/;

/** Does this extension name a gerber file (allowlist or inner copper)? */
export function isGerberExtension(ext: string): boolean {
  return GERBER_EXTENSIONS.includes(ext) || INNER_COPPER_EXT.test(ext);
}

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
        if (isGerberExtension(ext) || DRILL_EXTENSIONS.includes(ext)) {
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
 * The board-name prefix shared by the file names ("" when there is none) —
 * the viewer page's title. Accepts the raw prefix only when every name
 * continues with a separator ("board-F_Cu.gtl" / "board.drl" share
 * "board" cleanly).
 */
function commonBoardPrefix(names: string[]): string {
  if (names.length < 2) return '';
  let prefix = names[0]!;
  for (const name of names) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  const boundaryAfterPrefix = names.every((n) => n.length === prefix.length || /[-_. ]/.test(n[prefix.length]!));
  if (!boundaryAfterPrefix) {
    const cut = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('_'), prefix.lastIndexOf(' '));
    prefix = cut > 0 ? prefix.slice(0, cut + 1) : '';
  }
  return prefix.length < 3 ? '' : prefix;
}

/**
 * The sidebar lists LAYERS, not files: drop the board-name prefix and the
 * extension from the display name ("mod-ec-F_Cu.gtl" -> "F_Cu",
 * "typecad_project-Edge_Cuts.gm1" -> "Edge_Cuts"). The layer token after
 * the last board separator wins; a stem carrying no recognizable token
 * (a drill file named for the board) falls back to its detected kind. The
 * full file name stays available as the row's tooltip.
 */
function layerDisplayName(info: LayerInfo): string {
  const stem = info.name.replace(/\.[^.]+$/, '');
  const token = /(?:(?<=^)|(?<=[-_. ]))((?:F|B|In\d+)[-_ ].*|Edge[_ -]?Cuts|Margin|Adhesive|Courtyard|User[_ ]?\d+.*)$/i.exec(
    stem,
  );
  if (token) return token[1]!;
  switch (info.kind) {
    case 'drill':
      return info.drillPlated === false ? 'NPTH Drill' : 'Drill';
    case 'edge':
      return 'Edge.Cuts';
    default:
      return stem;
  }
}

export interface ViewerBuildOptions {
  title?: string;
  background?: string;
  /** KiCad netlist (.net) path — fills in pad→net for highlighting/probing. */
  netlistPath?: string;
  /** kicad-cli DRC report (<board>_drc.json) path — renders violation markers. */
  drcReportPath?: string;
  /** board stackup (<board>_stackup.json) path — feeds the thermal model's geometry. */
  stackupPath?: string;
  /** board rules (<board>_rules.json) path — the layout view's trace-width floor. */
  rulesPath?: string;
  /** Views whose SVG renders are NOT computed at page build: the page ships
   *  empty groups that fill on first switch (host bridge or fetch — see the
   *  page's deferred-view loader). The layout/gerber stack — the default
   *  view — always renders eagerly. */
  deferViews?: ViewerViewPart[];
}

/** A pcba-family view that can render on demand instead of at page build. */
export type ViewerViewPart = 'pcba' | 'blueprint' | 'schematic';

/** A declared board zone, mapped into the gerber (y-up) frame. The layout
 *  view renders its boundary like KiCad's canvas overlay: gerbers carry
 *  only the FILLED copper, so a zone that fills to nothing (a keepout, a
 *  pour outside Edge.Cuts) would otherwise be invisible in the viewer. */
export interface BoardZoneOutline {
  net: string | null;
  layer: string;
  keepout: boolean;
  pts: Array<{ x: number; y: number }>;
  /** zone clearance (mm) — the gap the fill engine keeps around foreign
   *  copper; drives the layout view's LIVE fill recompute. */
  clearance?: number;
  /** thermal relief gap/bridge (mm) around same-net pads (fill sub-list). */
  thermalGap?: number;
  thermalBridgeWidth?: number;
}

/** Zone outlines from a .kicad_pcb — handles both the inline and the
 *  pretty-printed (token-per-line, grouped sub-lists) writer forms. */
export function parseBoardZones(content: string): BoardZoneOutline[] {
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return [];
  }
  const out: BoardZoneOutline[] = [];
  // pcbnew ≥10 dropped (net_name …) from zones — the numeric (net N) code
  // resolves through the board's top-level net table instead
  const netNames = new Map<number, string>();
  for (const expr of Array.isArray(tree) ? tree : []) {
    if (isList(expr) && nameOf(expr[0]) === 'net' && typeof expr[1] === 'number' && typeof expr[2] === 'string')
      netNames.set(expr[1], expr[2]);
  }
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    if (nameOf(expr[0]) === 'zone') {
      let net: string | null = null;
      let netCode: number | null = null;
      let layer: string | null = null;
      let keepout = false;
      let pts: Array<{ x: number; y: number }> = [];
      let clearance: number | undefined;
      let thermalGap: number | undefined;
      let thermalBridgeWidth: number | undefined;
      const walkZone = (node: SExpr): void => {
        if (!isList(node)) return;
        const key = nameOf(node[0]);
        if (key === 'net_name' && typeof node[1] === 'string') net = node[1];
        else if (key === 'net' && typeof node[1] === 'string') net = node[1]; // pcbnew ≥10: name-based
        else if (key === 'net' && typeof node[1] === 'number') netCode = node[1];
        else if (key === 'clearance' && Number.isFinite(parseFloat(String(node[1])))) clearance = parseFloat(String(node[1]));
        else if (key === 'thermal_gap' && Number.isFinite(parseFloat(String(node[1])))) thermalGap = parseFloat(String(node[1]));
        else if (key === 'thermal_bridge_width' && Number.isFinite(parseFloat(String(node[1])))) thermalBridgeWidth = parseFloat(String(node[1]));
        else if (key === 'fill') {
          // pcbnew nests the thermal fields under (fill …); typeCAD's writer
          // emits camelCase json-ish keys in the same sub-list
          for (const child of node) {
            if (!isList(child)) continue;
            const fk = nameOf(child[0]);
            const fv = parseFloat(String(child[1]));
            if (!Number.isFinite(fv)) continue;
            if (fk === 'thermalGap' || fk === 'thermal_gap') thermalGap = fv;
            else if (fk === 'thermalBridgeWidth' || fk === 'thermal_bridge_width') thermalBridgeWidth = fv;
          }
        } else if (key === 'layers' || key === 'layer') {
          // pcbnew ≥10 writes single-layer zones as (layer "F.Cu"); older
          // boards (and typeCAD's writer) use (layers …) — take them both
          for (const child of node) {
            if (typeof child === 'string') {
              layer = child;
              break;
            }
          }
        } else if (key === 'keepout') keepout = true;
        else if (key === 'polygon' && pts.length === 0) {
          for (const child of node) {
            if (isList(child) && nameOf(child[0]) === 'pts') {
              for (const pt of child) {
                if (isList(pt) && nameOf(pt[0]) === 'xy') {
                  const x = parseFloat(String(pt[1]));
                  const y = parseFloat(String(pt[2]));
                  if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y: -y }); // gerber y-up
                }
              }
            }
          }
        }
        for (const child of node) walkZone(child);
      };
      walkZone(expr);
      if (!net && netCode !== null) net = netNames.get(netCode) ?? null;
      if (layer && pts.length >= 3)
        out.push({
          net,
          layer,
          keepout,
          pts,
          ...(clearance !== undefined ? { clearance } : {}),
          ...(thermalGap !== undefined ? { thermalGap } : {}),
          ...(thermalBridgeWidth !== undefined ? { thermalBridgeWidth } : {}),
        });
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return out;
}

/**
 * Per-zone filled copper area (mm², board ordinal order) — the same native
 * engine the export refills with. A zone whose every island is unconnected
 * (no same-net copper inside its outline) fills to NOTHING, and the viewer
 * label that says so turns "why is my pour empty" into a read.
 */
export function boardZoneFillAreas(content: string): number[] {
  let root: SNode;
  try {
    root = SNode.from(parse(content) as SExpr[]);
  } catch {
    return [];
  }
  const zones = root.children('zone');
  return zones.map((z) => {
    const layerNode = z.child('layer') ?? z.child('layers');
    const layers = layerNode
      ? layerNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    let area = 0;
    for (const layer of layers.length ? layers : ['F.Cu']) {
      try {
        const res = fillZone(root, z, layer);
        if (res) area += res.totalAreaMm2;
      } catch {
        // an unfillable zone measures as zero — the viewer says so
      }
    }
    return +area.toFixed(2);
  });
}

/** Parse a KiCad netlist into a "REF.pin" -> net map (N/C pads excluded). */
function parseNetlist(content: string): Record<string, string> {  const map: Record<string, string> = {};
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
 * The pipeline's front half — collect, parse, detect/order layers, fill
 * pad→net from the netlist, compute the fab report and DRC markers, and
 * load the pcba netlist. Shared by the full page build (which renders every
 * view) and the on-demand single-part render (`--view-part`, which parses
 * only to render one deferred view).
 */
function parseViewerLayers(
  paths: string[],
  options: ViewerBuildOptions,
): {
  warnings: string[];
  ordered: RenderLayer[];
  layers: LayerInfo[];
  boardPrefix: string;
  padNets: Record<string, string>;
  report: ReturnType<typeof computeFabReport>;
  drcMarkers: DrcMarker[];
  pcbaNetlistSource?: string;
  pcbaNetlist: Record<string, NetlistComponent>;
} {
  const collected = collectGerberFiles(paths);
  const warnings: string[] = collected.warnings;
  const files = collected.files;
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
  const boardPrefix = commonBoardPrefix(ordered.map((l) => l.info.name));
  const layers: LayerInfo[] = ordered.map((l) => {
    const display = layerDisplayName(l.info);
    return {
      ...l.info,
      name: display,
      fullName: display === l.info.name ? undefined : l.info.name,
    };
  });

  // netlist: pads carry %TO.P ref/pin but no net in gerbers;
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

  // DRC markers: positions arrive in board coordinates; map them
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

  // the pcba view shares the pipeline's netlist (explicit or auto-discovered
  // sibling *.net) so footprint names drive package classification there.
  const pcbaNetlistSource = options.netlistPath ?? discoverNetlist(paths) ?? undefined;
  let pcbaNetlist: Record<string, NetlistComponent> = {};
  if (pcbaNetlistSource) {
    try {
      pcbaNetlist = parseNetlistComponents(fs.readFileSync(pcbaNetlistSource, 'utf8'));
    } catch (error) {
      // a netlist mid-rewrite (a render racing a build) must not
      // take the whole viewer down with it
      warnings.push(`could not parse netlist: ${(error as Error).message}`);
    }
  }
  return { warnings, ordered, layers, boardPrefix, padNets, report, drcMarkers, pcbaNetlistSource, pcbaNetlist };
}

/** The ids each deferred view's inner renames (mirrors the eager injection:
 *  the root svg stays the only #board, labels stay unique). */
const PART_IDS: Record<ViewerViewPart, { board: string; labels: string }> = {
  pcba: { board: 'pcba-board', labels: 'pcba-labels' },
  blueprint: { board: 'bp-board', labels: 'bp-labels' },
  schematic: { board: 'sch-board', labels: 'sch-labels' },
};

/** Render ONE pcba-family view as a mountable `<g id="view-<part>">`
 *  fragment — what `typecad-pcb viewer --view-part <name>` serves and the
 *  page injects into its empty placeholder group on first switch. The
 *  data-viewbox attribute carries the part's own viewBox so the page can
 *  union it into the root svg live (the eager build unions at build time). */
export function renderViewPart(
  paths: string[],
  part: ViewerViewPart,
  options: ViewerBuildOptions = {},
): { fragment: string; viewBox: string; warnings: string[] } {
  const { warnings, ordered, pcbaNetlist } = parseViewerLayers(paths, options);
  const svg = renderPcbaSvg(ordered, {
    theme: DEFAULT_PCBA_THEME,
    netlist: pcbaNetlist,
    style: part === 'pcba' ? undefined : part,
  }).svg;
  const { inner, viewBox } = splitSvg(svg);
  const ids = PART_IDS[part];
  const renamed = inner
    .replace('<g id="board"', `<g id="${ids.board}"`)
    .replace('<g id="labels"', `<g id="${ids.labels}"`);
  return {
    fragment: `<g id="view-${part}" data-viewbox="${viewBox}" style="display:none">${renamed}</g>`,
    viewBox,
    warnings,
  };
}

/**
 * Full pipeline: read files, parse gerbers/drills, detect + order layers,
 * render the SVG and wrap it in the interactive HTML viewer.
 */
export function buildViewerFromFiles(paths: string[], options: ViewerBuildOptions = {}): ViewerBuildResult {
  const defer = new Set(options.deferViews ?? []);
  const { warnings, ordered, layers, boardPrefix, padNets, report, drcMarkers, pcbaNetlistSource, pcbaNetlist } =
    parseViewerLayers(paths, options);

  const svg = renderSvg(ordered, { background: options.background });
  // the pcba-family renders: eager unless deferred (the page ships empty
  // groups that fill on first switch — the layout/gerber default view is
  // what every board change pays for, and these three are not it)
  const pcbaSvg = defer.has('pcba') ? undefined : renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist }).svg;
  // the blueprint view: same layers, drawing style — a third entry in the
  // switcher riding the same coordinate frame
  const blueprintSvg = defer.has('blueprint')
    ? undefined
    : renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist, style: 'blueprint' }).svg;
  // the schematic view: white paper, near-black traces, semi-transparent
  // components — the routing-focused fourth view, whose trace hover shows
  // the ngspice operating point
  const schematicSvg = defer.has('schematic')
    ? undefined
    : renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist, style: 'schematic' }).svg;
  // `typecad-pcb simulate` leaves build/<board>_op.json beside the netlist
  // (like the DRC report); absent file = no electrical readout on hover
  let netOp: ViewerOptions['netOp'] = null;
  if (pcbaNetlistSource) {
    const opPath = pcbaNetlistSource.replace(/\.net$/i, '_op.json');
    if (fs.existsSync(opPath)) {
      try {
        netOp = JSON.parse(fs.readFileSync(opPath, 'utf8')) as NonNullable<ViewerOptions['netOp']>;
      } catch {
        warnings.push(`could not parse ${path.basename(opPath)} — trace hover will show no electrical data`);
      }
    }
  }
  // the board writer leaves build/<board>_stackup.json beside the board; the
  // viewer's thermal model uses it for per-layer copper weight + dielectric
  // thickness. Explicit --stackup wins, else auto-discover next to the netlist.
  let stackup: ViewerOptions['stackup'] = null;
  const stackupSource =
    options.stackupPath ?? (pcbaNetlistSource ? pcbaNetlistSource.replace(/\.net$/i, '_stackup.json') : undefined);
  if (stackupSource && fs.existsSync(stackupSource)) {
    try {
      stackup = JSON.parse(fs.readFileSync(stackupSource, 'utf8')) as NonNullable<ViewerOptions['stackup']>;
    } catch {
      warnings.push(`could not parse ${path.basename(stackupSource)} — the thermal view falls back to 35 µm/1.6 mm defaults`);
    }
  }
  // board rules (build/<board>_rules.json): the min trace width the layout
  // view's width control floors at. Optional — no file, no floor.
  let rules: ViewerOptions['rules'] = null;
  if (options.rulesPath && fs.existsSync(options.rulesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(options.rulesPath, 'utf8')) as NonNullable<ViewerOptions['rules']>;
      if (parsed && typeof parsed === 'object' && ((parsed.minTrackWidthMm ?? 0) > 0 || parsed.netClasses)) rules = parsed;
    } catch {
      warnings.push(`could not parse ${path.basename(options.rulesPath)} — the width control runs without a floor`);
    }
  }
  // pad labels ride the same way (build/<board>_pads.json): pin numbers +
  // net names per pad, computed from the PCB object at board-write time.
  // The manifest is derived data and CAN lag the board (a KiCad-side edit
  // that flowed through sync without a full rebuild; a locked write on
  // Windows) — copper would move while the labels stayed put. Heal it from
  // the board file beside the netlist before reading.
  let padLabels: ViewerOptions['padLabels'] = null;
  if (pcbaNetlistSource) {
    const padsPath = pcbaNetlistSource.replace(/\.net$/i, '_pads.json');
    const boardBesideNetlist = pcbaNetlistSource.replace(/\.net$/i, '.kicad_pcb');
    if (fs.existsSync(boardBesideNetlist)) {
      refreshPadsManifestFromBoard(boardBesideNetlist);
    }
    if (fs.existsSync(padsPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(padsPath, 'utf8')) as { pads?: NonNullable<ViewerOptions['padLabels']> };
        padLabels = manifest.pads ?? null;
      } catch {
        warnings.push(`could not parse ${path.basename(padsPath)} — pads render without pin/net labels`);
      }
    }
  }
  // route provenance rides the same way (build/<board>_routes.json): which
  // nets a TrackBuilder hand-built vs the autorouter — the Layout view's
  // trace indication. Absent file = every trace reads as autorouted.
  let routes: ViewerOptions['routes'] = null;
  if (pcbaNetlistSource) {
    const routesPath = pcbaNetlistSource.replace(/\.net$/i, '_routes.json');
    if (fs.existsSync(routesPath)) {
      try {
        routes = JSON.parse(fs.readFileSync(routesPath, 'utf8')) as NonNullable<ViewerOptions['routes']>;
      } catch {
        warnings.push(`could not parse ${path.basename(routesPath)} — the layout view cannot tell manual from autorouted traces`);
      }
    }
  }
  // Layout-view texts: silk/fab gr_texts (the `pcb.text()` API) parsed from
  // the board file beside the netlist — their gerber stroke paths get
  // claimed by the viewer for drag + in-place value editing, and apply
  // rewrites the source `.text({ ... })` literals. The same file yields
  // each footprint's Reference/Value label anchors for independent
  // label positioning (Component referenceLayout/valueLayout on apply)
  let layoutTexts: ViewerOptions['layoutTexts'] = [];
  let boardLabels: ReturnType<typeof parseBoardLabels> = {};
  if (pcbaNetlistSource) {
    const pcbPath = pcbaNetlistSource.replace(/\.net$/i, '.kicad_pcb');
    if (fs.existsSync(pcbPath)) {
      try {
        layoutTexts = parseBoardTexts(fs.readFileSync(pcbPath, 'utf8')).map((t) => ({
          text: t.text,
          x: +t.x.toFixed(3),
          y: +t.y.toFixed(3),
          rot: +t.rot.toFixed(1),
          side: t.side,
          h: +t.h.toFixed(2),
          layerKind: t.layerKind,
          // the style block the properties panel edits (only present keys
          // travel — absent stays absent in the island too)
          ...(t.w !== undefined ? { w: +t.w.toFixed(3) } : {}),
          ...(t.thickness !== undefined ? { thickness: +t.thickness.toFixed(3) } : {}),
          ...(t.italic ? { italic: true } : {}),
          ...(t.bold ? { bold: true } : {}),
          ...(t.font !== undefined ? { font: t.font } : {}),
          ...(t.justify ? { justify: t.justify } : {}),
        }));
        boardLabels = parseBoardLabels(fs.readFileSync(pcbPath, 'utf8'));
      } catch {
        warnings.push(`could not parse ${path.basename(pcbPath)} texts — silk/fab text editing stays disabled`);
      }
    }
  }
  // Placed board artwork rides the same way (build/<board>_images.json,
  // written when the board is): the layout view draws selectable outlines
  // from it so applied images can be edited like any other object.
  let boardImages: NonNullable<ViewerOptions['boardImages']> = [];
  if (pcbaNetlistSource) {
    const imagesPath = pcbaNetlistSource.replace(/\.net$/i, '_images.json');
    if (fs.existsSync(imagesPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(imagesPath, 'utf8')) as {
          images?: NonNullable<ViewerOptions['boardImages']>;
        };
        boardImages = (manifest.images ?? []).filter(
          (im) => im && typeof im.file === 'string' && im.w > 0 && im.h > 0,
        );
      } catch {
        warnings.push(`could not parse ${path.basename(imagesPath)} — applied artwork is not editable in the layout view`);
      }
    }
  }
  // Declared zone outlines: gerbers carry only the FILLED copper, so a zone
  // that fills to nothing (a keepout, a pour outside Edge.Cuts — KiCad
  // clips pours to the outline) is invisible in the viewer while KiCad's
  // canvas shows its boundary. The layout view renders these outlines.
  let layoutBoardZones: ViewerOptions['layoutBoardZones'] = [];
  if (pcbaNetlistSource) {
    const pcbPath = pcbaNetlistSource.replace(/\.net$/i, '.kicad_pcb');
    if (fs.existsSync(pcbPath)) {
      try {
        const boardText = fs.readFileSync(pcbPath, 'utf8');
        const outlines = parseBoardZones(boardText);
        let fillAreas: number[] = [];
        try {
          fillAreas = boardZoneFillAreas(boardText);
        } catch {
          fillAreas = [];
        }
        layoutBoardZones = outlines.map((z, i) => ({
          net: z.net,
          layer: z.layer,
          keepout: z.keepout,
          pts: z.pts.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })),
          filledMm2: fillAreas[i],
          ...(z.clearance !== undefined ? { clearance: z.clearance } : {}),
          ...(z.thermalGap !== undefined ? { thermalGap: z.thermalGap } : {}),
          ...(z.thermalBridgeWidth !== undefined ? { thermalBridgeWidth: z.thermalBridgeWidth } : {}),
        }));
      } catch {
        warnings.push(`could not parse ${path.basename(pcbPath)} zones — the layout view shows no zone boundaries`);
      }
    }
  }
  // Layout-view component overlay: the pcba glyph extractor derives each
  // component's position (pad centroid), orientation (PCA of the pads) and
  // body size (footprint name via the netlist) from the gerbers themselves —
  // so the overlay works in plain browser tabs, no host needed and no nets
  // required: a fresh board with nothing connected still gets the layout
  // view. Pads' nets (for rip-up) stay optional and come from the pad→net
  // map the netlist already filled in.
  let layoutComponents: ViewerOptions['layoutComponents'] = [];
  for (const side of ['front', 'back'] as const) {
    const extracted = extractComponents(ordered, side, pcbaNetlist);
    for (const c of extracted.components) {
      const nets: string[] = [];
      for (const pad of c.pads) {
        const net = padNets[`${c.ref}.${pad.pin}`];
        if (net && !nets.includes(net)) nets.push(net);
      }
      const bw = c.bbox.maxX - c.bbox.minX;
      const bh = c.bbox.maxY - c.bbox.minY;
      const cx = c.bbox.minX + bw / 2;
      const cy = c.bbox.minY + bh / 2;
      // the overlay group hangs off the pads-bbox center and carries the
      // PCA angle as its base rotation, so outline points must ride in that
      // same local frame (relative to the center, axes un-rotated) — then
      // the drawn shape moves/rotates with the handle for free
      const toGroup = (p: Point): Point => {
        const r = rotatePoint(p, -c.angle, { x: cx, y: cy });
        return { x: r.x - cx, y: r.y - cy };
      };
      let outline: Array<{ x: number; y: number }> | null = null;
      if (c.fabContour && c.fabContour.length >= 3) {
        // exact footprint outline: the fab contour is centered on the pad
        // centroid in the part's own frame — unrotate to the gerber frame,
        // then into the group frame (chamfers and all)
        const centroid = {
          x: c.pads.reduce((s, p) => s + p.at.x, 0) / c.pads.length,
          y: c.pads.reduce((s, p) => s + p.at.y, 0) / c.pads.length,
        };
        outline = c.fabContour.map((p) =>
          toGroup(rotatePoint({ x: p.x + centroid.x, y: p.y + centroid.y }, c.angle, centroid)),
        );
      } else if (c.pads.length >= 2) {
        // no fab layer: the land pattern IS the footprint — convex hull of
        // the pad rectangles (pad w/h are gerber-frame extents, so they
        // transpose into the rotated frame like every other local shape)
        const rot = (-c.angle * Math.PI) / 180;
        const ca = Math.abs(Math.cos(rot));
        const sa = Math.abs(Math.sin(rot));
        const corners: Point[] = [];
        for (const pad of c.pads) {
          const at = toGroup(pad.at);
          const ex = (ca * pad.w + sa * pad.h) / 2;
          const ey = (sa * pad.w + ca * pad.h) / 2;
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ] as const)
            corners.push({ x: at.x + sx * ex, y: at.y + sy * ey });
        }
        outline = convexHull(corners);
      }
      // the handle's extent follows the drawn outline (falls back to the
      // footprint-name dims / pad bbox when neither outline exists)
      let ow = c.bodyDims && c.bodyDims.w > 0.05 ? c.bodyDims.w : bw;
      let oh = c.bodyDims && c.bodyDims.h > 0.05 ? c.bodyDims.h : bh;
      if (outline && outline.length >= 3) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of outline) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        ow = maxX - minX;
        oh = maxY - minY;
      }
      layoutComponents.push({
        ref: c.ref,
        x: +cx.toFixed(3),
        y: +cy.toFixed(3),
        rot: +c.angle.toFixed(1),
        // netlist value ("1k") — the layout view's in-place value editor
        value: pcbaNetlist[c.ref]?.value,
        // floor per axis so the box is never degenerate (a zero-height
        // handle makes rotation invisible)
        w: +Math.max(ow, 0.6).toFixed(2),
        h: +Math.max(oh, 0.6).toFixed(2),
        side,
        nets,
        // per-part label anchors (Reference on silk, Value on fab) —
        // independently draggable texts in the layout view; the style
        // fields ride for the properties panel
        labels: (boardLabels[c.ref] ?? []).map((lb) => ({
          kind: lb.kind,
          text: lb.text,
          x: lb.x,
          y: lb.y,
          rot: lb.rot,
          side: lb.side,
          h: lb.h,
          layerKind: lb.layerKind,
          ...(lb.w !== undefined ? { w: +lb.w.toFixed(3) } : {}),
          ...(lb.thickness !== undefined ? { thickness: +lb.thickness.toFixed(3) } : {}),
          ...(lb.italic ? { italic: true } : {}),
          ...(lb.bold ? { bold: true } : {}),
          ...(lb.font !== undefined ? { font: lb.font } : {}),
          ...(lb.justify ? { justify: lb.justify } : {}),
        })),
        // the exact footprint outline in the group's local frame — the
        // drag handle draws this polygon instead of a generic rounded box
        outline: outline && outline.length >= 3
          ? outline.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }))
          : undefined,
        // pad centers ride along (gerber frame) — sticky route endpoints on
        // apply translate any .from/.to literal that sits on one of these,
        // and the ratsnest connects each pad's net to the surviving copper
        pads: c.pads.map((pad) => ({
          x: +pad.at.x.toFixed(3),
          y: +pad.at.y.toFixed(3),
          net: padNets[`${c.ref}.${pad.pin}`],
        })),
      });
    }
  }
  // through-hole pads flash on both copper layers — the same ref extracts
  // once per side; keep the front entry so each component drags once
  const byRef = new Map<string, (typeof layoutComponents)[number]>();
  for (const comp of layoutComponents) {
    const prev = byRef.get(comp.ref);
    if (!prev || (prev.side === 'back' && comp.side === 'front')) byRef.set(comp.ref, comp);
  }
  layoutComponents = [...byRef.values()];
  if (layoutComponents.length === 0) {
    warnings.push('no X2 component attributes (%TO.P) on any copper layer — component overlay skipped');
  }
  // the pcba view's theme picker: surface colors per builtin, ordered as the
  // combo shows them. The switcher remaps these flat colors client-side, so
  // one embedded render serves every theme.
  const surface = (t: PcbaTheme) => ({
    board: t.board,
    clad: t.clad,
    maskCopper: t.maskCopper,
    copper: t.copper,
    pads: t.pads,
    silk: t.silk,
    outline: t.outline,
    hole: t.hole,
  });
  const themeOrder = [
    'green-enig',
    'red-enig',
    'blue-enig',
    'purple-enig',
    'black-hasl',
    'white-hasl',
    'yellow-hasl',
    'oshpark-after-dark',
  ];
  const pcbaThemes = themeOrder
    .filter((id) => PCBA_THEMES[id])
    .map((id) => ({ id, label: PCBA_THEME_LABELS[id] ?? id, colors: surface(PCBA_THEMES[id]!) }));
  const html = buildViewerHtml(svg, layers, {
    title: options.title ?? (boardPrefix.replace(/[-_. ]+$/, '') || path.basename(paths[0]!)),
    generatorVersion: PKG_VERSION,
    report,
    drcMarkers,
    pcbaSvg,
    blueprintSvg,
    schematicSvg,
    deferredViews: [...defer],
    netOp,
    stackup,
    rules,
    routes,
    padLabels,
    layoutComponents,
    layoutTexts,
    layoutBoardZones,
    boardImages,
    pcbaThemes,
  });
  return { svg, html, layers, warnings, report };
}

/** <board>_drc.json -> the pcb it was run against lives beside it. */
function getPcbName(drcPath: string): string {
  const base = path.basename(drcPath).replace(/_drc\.json$/, '');
  return `${base}.kicad_pcb`;
}

/** 'F.SilkS' -> silkscreen, 'F.Fab' -> fab, anything else claims both. */
function layerKindOf(layer: string): 'silkscreen' | 'fab' | undefined {
  const l = layer.toLowerCase();
  if (l.includes('silk')) return 'silkscreen';
  if (l.includes('fab')) return 'fab';
  return undefined;
}

/**
 * Silk/fab board texts (gr_text — the `pcb.text()` API) from the
 * .kicad_pcb, mapped into the gerber (y-up) frame so the layout view can
 * claim their stroke paths and offer drag / in-place editing. The anchor
 * semantics don't matter here: claiming is radius-based around the anchor.
 */
/** The style block a gr_text/fp_text carries that maps to `pcb.text()` / Component label options. */
export interface BoardTextStyle {
  w?: number;
  thickness?: number;
  italic?: boolean;
  bold?: boolean;
  font?: string;
  justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
}

/**
 * One `(effects …)` block: font size/face/thickness/slant, justification,
 * and hide. Shared by board gr_texts, footprint Reference/Value properties,
 * and fab texts — everything the properties panel styles.
 */
function parseTextEffects(effects: SExpr[]): { h?: number; style: BoardTextStyle; hidden: boolean } {
  let h: number | undefined;
  let hidden = false;
  const style: BoardTextStyle = {};
  for (const eff of effects) {
    if (!isList(eff)) continue;
    const head = nameOf(eff[0]);
    if (head === 'font') {
      // a face spec ("KiCad Font" or an installed font) may come first;
      // (size w h) — h drives the claim radius and the edit preview.
      // italic/bold are BARE symbols in KiCad's font block — atoms, not
      // lists — while the face is a quoted string
      for (const fc of eff) {
        if (!isList(fc)) {
          const tok = nameOf(fc);
          if (tok === 'italic') style.italic = true;
          else if (tok === 'bold') style.bold = true;
          else if (typeof fc === 'string' && fc) style.font = fc;
        }
        if (isList(fc) && nameOf(fc[0]) === 'size') {
          if (typeof fc[1] === 'number') style.w = Math.abs(fc[1]);
          if (typeof fc[2] === 'number') h = Math.abs(fc[2]);
        } else if (isList(fc) && nameOf(fc[0]) === 'thickness' && typeof fc[1] === 'number') {
          style.thickness = Math.abs(fc[1]);
        }
      }
    } else if (head === 'hide') {
      hidden = true;
    } else if (head === 'justify') {
      const justify: NonNullable<BoardTextStyle['justify']> = {};
      for (let ji = 1; ji < eff.length; ji++) {
        const tok = nameOf(eff[ji]!);
        if (tok === 'left' || tok === 'right' || tok === 'center') justify.horizontal = tok;
        else if (tok === 'top' || tok === 'bottom' || tok === 'middle') justify.vertical = tok;
        else if (tok === 'mirror') justify.mirror = true;
      }
      if (justify.horizontal !== undefined || justify.vertical !== undefined || justify.mirror !== undefined)
        style.justify = justify;
    }
  }
  return { h, style, hidden };
}

function parseBoardTexts(
  content: string,
): Array<{ text: string; x: number; y: number; rot: number; side: 'front' | 'back'; h: number; layerKind?: 'silkscreen' | 'fab' } & BoardTextStyle> {
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return [];
  }
  const out: Array<{ text: string; x: number; y: number; rot: number; side: 'front' | 'back'; h: number; layerKind?: 'silkscreen' | 'fab' } & BoardTextStyle> = [];
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    if (nameOf(expr[0]) === 'gr_text') {
      const text = typeof expr[1] === 'string' ? expr[1] : '';
      let x: number | null = null;
      let y: number | null = null;
      let rot = 0;
      let side: 'front' | 'back' | null = null;
      let h = 1.27;
      let hidden = false;
      let rawLayer = '';
      let style: BoardTextStyle | null = null;
      for (const child of expr) {
        if (!isList(child)) continue;
        const head = nameOf(child[0]);
        if (head === 'at') {
          if (typeof child[1] === 'number') x = child[1];
          if (typeof child[2] === 'number') y = child[2];
          if (typeof child[3] === 'number') rot = child[3];
        } else if (head === 'layer') {
          const name = String(child[1] ?? '').toLowerCase();
          if (name === 'f.silks' || name === 'f.fab') side = 'front';
          else if (name === 'b.silks' || name === 'b.fab') side = 'back';
          rawLayer = String(child[1] ?? '');
        } else if (head === 'effects') {
          const parsed = parseTextEffects(child);
          h = parsed.h ?? h;
          hidden = hidden || parsed.hidden;
          style = parsed.style;
        }
      }
      if (!hidden && text && x !== null && y !== null && side) {
        const entry: NonNullable<(typeof out)[number]> = { text, x, y: -y, rot, side, h, layerKind: layerKindOf(rawLayer) };
        if (style) Object.assign(entry, style);
        out.push(entry);
      }
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return out;
}

/**
 * Per-footprint Reference/Value label texts from the board file, mapped to
 * WORLD gerber coordinates: footprint at (px py prot) + R(prot)·(local).
 * The layout view drags these as independent texts; apply converts the
 * final world position back to footprint-local and writes the Component's
 * referenceLayout / valueLayout options.
 */
/** One part label (Reference/Value property or the fab ${REFERENCE} text). */
type BoardLabel = {
  kind: 'reference' | 'value' | 'fab';
  text: string;
  x: number;
  y: number;
  rot: number;
  side: 'front' | 'back';
  h: number;
  layerKind?: 'silkscreen' | 'fab';
} & BoardTextStyle;

export function parseBoardLabels(content: string): Record<string, BoardLabel[]> {
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return {};
  }
  const byRef: Record<string, BoardLabel[]> = {};
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    if (nameOf(expr[0]) === 'footprint') {
      let px = 0;
      let py = 0;
      let prot = 0;
      for (const child of expr) {
        if (isList(child) && nameOf(child[0]) === 'at') {
          if (typeof child[1] === 'number') px = child[1];
          if (typeof child[2] === 'number') py = child[2];
          if (typeof child[3] === 'number') prot = child[3];
          break;
        }
      }
      const rad = (prot * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      // the Reference property names the footprint — resolve it first so
      // both labels file under the right ref
      let refText: string | null = null;
      for (const child of expr) {
        if (!isList(child) || nameOf(child[0]) !== 'property') continue;
        if (String(child[1] ?? '') === 'Reference' && typeof child[2] === 'string') refText = child[2];
      }
      if (refText) {
        for (const child of expr) {
          if (!isList(child) || nameOf(child[0]) !== 'property') continue;
          const name = String(child[1] ?? '');
          if (name !== 'Reference' && name !== 'Value') continue;
          const text = typeof child[2] === 'string' ? child[2] : '';
        let lx = 0;
        let ly = 0;
        let lrot = 0;
        let side: 'front' | 'back' | null = null;
        let h = 1;
        let hidden = false;
        let rawLayer = '';
        let style: BoardTextStyle | null = null;
        for (const gc of child) {
          if (!isList(gc)) continue;
          const head = nameOf(gc[0]);
          if (head === 'at') {
            if (typeof gc[1] === 'number') lx = gc[1];
            if (typeof gc[2] === 'number') ly = gc[2];
            if (typeof gc[3] === 'number') lrot = gc[3];
          } else if (head === 'layer') {
            const lname = String(gc[1] ?? '').toLowerCase();
            if (lname.startsWith('f.')) side = 'front';
            else if (lname.startsWith('b.')) side = 'back';
            rawLayer = String(gc[1] ?? '');
          } else if (head === 'effects') {
            const parsed = parseTextEffects(gc);
            h = parsed.h ?? h;
            hidden = hidden || parsed.hidden;
            style = parsed.style;
          }
        }
        if (hidden || !text || !side) continue;
        const kind: 'reference' | 'value' | 'fab' = name === 'Reference' ? 'reference' : 'value';
        // child positions rotate by the footprint angle with the OPPOSITE
        // sign of naive matrix math (pad-verified: U3 at (137.6, 84.8, 90)
        // stores pad 3 at local (-1.76, 0) and plots at board (137.6, 86.56)
        // = origin + R(-90)·local), while the text's own angle is ABSOLUTE —
        // the footprint rotation never adds to it. The old R(+θ) + (lrot +
        // prot) mirrored every label of a rotated part across its origin
        // (U3's reference anchored at 134.7 instead of 140.5, 5.7mm from
        // its plotted ink — unclaimable, uncyclable, unselectable)
        const wx = px + lx * c + ly * s;
        const wy = py - lx * s + ly * c;
        const entry: BoardLabel = {
          kind,
          text,
          x: +wx.toFixed(3),
          y: -wy,
          rot: +(((lrot % 360) + 360) % 360).toFixed(1),
          side,
          h,
          layerKind: layerKindOf(rawLayer),
        };
        if (style) Object.assign(entry, style);
        (byRef[refText] = byRef[refText] ?? []).push(entry);
        }
      }
      // the ${REFERENCE} user text (small refdes on fab) is its own object —
      // the Component 'fab' option positions it, so it claims independently
      for (const child of expr) {
        if (!isList(child) || nameOf(child[0]) !== 'fp_text') continue;
        if (String(child[1] ?? '').toLowerCase() !== 'user') continue;
        if (String(child[2] ?? '') !== '${REFERENCE}') continue;
        let ulx = 0;
        let uly = 0;
        let ulrot = 0;
        let uside: 'front' | 'back' | null = null;
        let uh = 1;
        let ustyle: BoardTextStyle | null = null;
        for (const gc of child) {
          if (!isList(gc)) continue;
          const head = nameOf(gc[0]);
          if (head === 'at') {
            if (typeof gc[1] === 'number') ulx = gc[1];
            if (typeof gc[2] === 'number') uly = gc[2];
            if (typeof gc[3] === 'number') ulrot = gc[3];
          } else if (head === 'layer') {
            const lname = String(gc[1] ?? '').toLowerCase();
            if (lname.startsWith('f.')) uside = 'front';
            else if (lname.startsWith('b.')) uside = 'back';
          } else if (head === 'effects') {
            const parsed = parseTextEffects(gc);
            uh = parsed.h ?? uh;
            ustyle = parsed.style;
          }
        }
        if (!uside || !refText) continue;
        // same frame as the properties above: R(-θ) for the position, the
        // text angle absolute
        const uwx = px + ulx * c + uly * s;
        const uwy = py - ulx * s + uly * c;
        const uentry: BoardLabel = {
          kind: 'fab',
          text: refText,
          x: +uwx.toFixed(3),
          y: -uwy,
          rot: +(((ulrot % 360) + 360) % 360).toFixed(1),
          side: uside,
          h: uh,
          layerKind: 'fab',
        };
        if (ustyle) Object.assign(uentry, ustyle);
        (byRef[refText] = byRef[refText] ?? []).push(uentry);
      }
      // footprints nest nothing labelable; still recurse for embedded groups
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return byRef;
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

/**
 * Convex hull (Andrew monotone chain), collinear points dropped — the
 * land-pattern outline fallback for layout-view drag handles.
 */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
