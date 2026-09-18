/**
 * File pipeline for the PCBA image renderer: collect gerber/drill files,
 * parse + order layers (the same path the interactive viewer takes), then
 * render one flat themed SVG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGerberFiles, sniffKind } from './build.js';
import { detectLayer, finalizeAndSortLayers, type LayerInfo } from './detect_layer.js';
import { parseExcellon } from './gerber/parse_excellon.js';
import { parseGerber } from './gerber/parse_gerber.js';
import type { GerberImage, DrillImage } from './gerber/types.js';
import { renderPcbaSvg, type PcbaRenderResult } from './render/pcba.js';
import type { NetlistComponent } from './render/components.js';
import { DEFAULT_PCBA_THEME, PCBA_THEMES, mergeTheme, type PcbaTheme } from './render/theme.js';
import type { RenderLayer } from './render/svg.js';
import { discoverNetlist, parseNetlistComponents } from './netlist.js';

export { parseNetlistComponents };

/** The @typecad/pcb package version, for stamping renders. */
function pkgVersion(): string {
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    return (JSON.parse(fs.readFileSync(pkg, 'utf8')) as { version?: string }).version ?? '0';
  } catch {
    return '0';
  }
}

export interface PcbaBuildOptions {
  /** builtin theme name (`typecad`, `green-enig`, ...) or a path to a theme .json */
  theme?: string;
  side?: 'auto' | 'front' | 'back';
  labels?: boolean;
  /** render style: 'assembled' (default) or the engineering-drawing 'blueprint' */
  style?: 'assembled' | 'blueprint' | 'schematic';
  /**
   * engineering title block (board name, date, dimensions, wordmark) below
   * the board — on by default; false renders a clean image.
   */
  titleBlock?: boolean;
  /** KiCad netlist (.net) path — ref→footprint/value metadata. When omitted,
   *  a sibling `*.net` next to the input directory is discovered (the
   *  typeCAD build layout: `build/gerbers` + `build/<board>.net`) */
  netlistPath?: string;
  /** set false to skip sibling-netlist discovery (default true) */
  discoverNetlist?: boolean;
  /** stamped into the svg root (defaults to the gerber-viewer version) */
  generator?: string;
}

export interface PcbaBuildResult extends PcbaRenderResult {
  themeName: string;
  layers: LayerInfo[];
}

/** Resolve `--theme`: a builtin name, or a JSON file merged over the defaults. */
export function loadPcbaTheme(name?: string): { theme: PcbaTheme; name: string } {
  // no --theme means the default palette; every builtin resolves by name
  if (!name) return { theme: DEFAULT_PCBA_THEME, name: 'green-enig' };
  // hasOwnProperty, not plain [] indexing: "constructor" & co. would walk
  // the prototype chain and come back as a "builtin theme"
  const builtin = Object.prototype.hasOwnProperty.call(PCBA_THEMES, name) ? PCBA_THEMES[name] : undefined;
  if (builtin) return { theme: builtin, name };
  const raw: unknown = JSON.parse(fs.readFileSync(name, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error(`theme file ${name} is not a JSON object`);
  return { theme: mergeTheme(raw as Partial<PcbaTheme>), name: path.basename(name) };
}

export function pcbaThemeNames(): string[] {
  return Object.keys(PCBA_THEMES);
}

/** Read + parse a gerber/drill set and render the flat PCBA image SVG. */
export function renderPcbaFromFiles(inputPaths: string[], options: PcbaBuildOptions = {}): PcbaBuildResult {
  const { files, warnings } = collectGerberFiles(inputPaths);
  if (files.length === 0) {
    throw new Error(`no gerber or drill files found in: ${inputPaths.join(', ')} (expected .gbr/.drl and friends)`);
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
    throw new Error(`none of the input files could be parsed: ${inputPaths.join(', ')}`);
  }

  const infos = finalizeAndSortLayers(renderLayers.map((l) => l.info));
  const byId = new Map(infos.map((i) => [i.id, i]));
  const ordered = renderLayers
    .map((l) => ({ ...l, info: byId.get(l.info.id)! }))
    .sort((a, b) => {
      if (a.info.order !== b.info.order) return a.info.order - b.info.order;
      return a.info.name.localeCompare(b.info.name);
    });

  const { theme, name: themeName } = loadPcbaTheme(options.theme);
  let netlist: Record<string, NetlistComponent> = {};
  const netlistPath = options.netlistPath ?? (options.discoverNetlist === false ? null : discoverNetlist(inputPaths));
  if (netlistPath) {
    // an explicitly requested netlist that is missing deserves a warning —
    // a typo'd --netlist would otherwise quietly render metadata-less
    if (!fs.existsSync(netlistPath)) {
      warnings.push(`netlist not found: ${netlistPath}`);
    } else {
      try {
        netlist = parseNetlistComponents(fs.readFileSync(netlistPath, 'utf8'));
      } catch (error) {
        warnings.push(`could not parse netlist: ${(error as Error).message}`);
      }
    }
  }
  const result = renderPcbaSvg(ordered, {
    theme,
    side: options.side,
    labels: options.labels,
    style: options.style,
    // the block titles itself after the board: the netlist basename, else
    // the gerber set's directory, else "board"
    titleBlock:
      options.titleBlock === false
        ? undefined
        : {
            title: netlistPath
              ? path.basename(netlistPath, '.net')
              : files.length > 0
                ? path.basename(path.dirname(files[0]!))
                : 'board',
          },
    netlist,
    generator: options.generator ?? `gerber-viewer ${pkgVersion()} pcba`,
  });
  return { ...result, warnings: [...warnings, ...result.warnings], themeName, layers: infos };
}
