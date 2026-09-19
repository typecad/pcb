import fs from 'node:fs';
import path from 'node:path';
import { isList, nameOf, parse } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
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
import { buildViewerHtml, type ViewerOptions } from './render/viewer_html.js';

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
function stripCommonPrefix(names: string[]): { stripped: string[]; prefix: string } {
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
  /** board stackup (<board>_stackup.json) path — feeds the thermal model's geometry. */
  stackupPath?: string;
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

  const svg = renderSvg(ordered, { background: options.background });
  // the pcba view shares the pipeline's netlist (explicit or auto-discovered
  // sibling *.net) so footprint names drive package classification there.
  // Designators come from the silkscreen gerber, positioned by KiCad — the
  // knockout in the renderer is sized to keep that text whole.
  const pcbaNetlistSource = options.netlistPath ?? discoverNetlist(paths);
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
  const pcbaSvg = renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist }).svg;
  // the blueprint view: same layers, drawing style — a third entry in the
  // switcher riding the same coordinate frame
  const blueprintSvg = renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist, style: 'blueprint' }).svg;
  // the schematic view: white paper, near-black traces, semi-transparent
  // components — the routing-focused fourth view, whose trace hover shows
  // the ngspice operating point
  const schematicSvg = renderPcbaSvg(ordered, { theme: DEFAULT_PCBA_THEME, netlist: pcbaNetlist, style: 'schematic' }).svg;
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
  // rewrites the source `.text({ ... })` literals
  let layoutTexts: ViewerOptions['layoutTexts'] = [];
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
        }));
      } catch {
        warnings.push(`could not parse ${path.basename(pcbPath)} texts — silk/fab text editing stays disabled`);
      }
    }
  }
  // Layout-view component overlay: the pcba glyph extractor derives each
  // component's position (pad centroid), orientation (PCA of the pads) and
  // body size (footprint name via the netlist) from the gerbers themselves —
  // so the overlay works in plain browser tabs, no host needed. Pads' nets
  // (for rip-up) come from the pad→net map the netlist already filled in.
  let layoutComponents: ViewerOptions['layoutComponents'] = [];
  if (Object.keys(padNets).length > 0) {
    for (const side of ['front', 'back'] as const) {
      const extracted = extractComponents(ordered, side, pcbaNetlist);
      warnings.push(...extracted.warnings);
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
    'typecad',
  ];
  const pcbaThemes = themeOrder
    .filter((id) => PCBA_THEMES[id])
    .map((id) => ({ id, label: PCBA_THEME_LABELS[id] ?? id, colors: surface(PCBA_THEMES[id]!) }));
  const html = buildViewerHtml(svg, layers, {
    title: options.title ?? (prefix.replace(/[-_. ]+$/, '') || path.basename(paths[0]!)),
    report,
    drcMarkers,
    pcbaSvg,
    blueprintSvg,
    schematicSvg,
    netOp,
    stackup,
    routes,
    layoutComponents,
    layoutTexts,
    pcbaThemes,
  });
  return { svg, html, layers, warnings, report };
}

/** <board>_drc.json -> the pcb it was run against lives beside it. */
function getPcbName(drcPath: string): string {
  const base = path.basename(drcPath).replace(/_drc\.json$/, '');
  return `${base}.kicad_pcb`;
}

/**
 * Silk/fab board texts (gr_text — the `pcb.text()` API) from the
 * .kicad_pcb, mapped into the gerber (y-up) frame so the layout view can
 * claim their stroke paths and offer drag / in-place editing. The anchor
 * semantics don't matter here: claiming is radius-based around the anchor.
 */
function parseBoardTexts(
  content: string,
): Array<{ text: string; x: number; y: number; rot: number; side: 'front' | 'back'; h: number }> {
  let tree: SExpr;
  try {
    tree = parse(content);
  } catch {
    return [];
  }
  const out: Array<{ text: string; x: number; y: number; rot: number; side: 'front' | 'back'; h: number }> = [];
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
        } else if (head === 'effects') {
          for (const eff of child) {
            if (!isList(eff)) continue;
            if (nameOf(eff[0]) === 'font') {
              // (size w h) among the font's children (a face spec may come
              // first) — h drives the claim radius and the edit preview
              for (const fchild of eff) {
                if (isList(fchild) && nameOf(fchild[0]) === 'size' && typeof fchild[2] === 'number')
                  h = Math.abs(fchild[2]);
              }
            } else if (nameOf(eff[0]) === 'hide') {
              hidden = true;
            }
          }
        }
      }
      if (!hidden && text && x !== null && y !== null && side)
        out.push({ text, x, y: -y, rot, side, h });
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return out;
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
