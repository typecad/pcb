import fs from 'node:fs';
import path from 'node:path';
import { detectLayer, finalizeAndSortLayers, type LayerInfo } from './detect_layer.js';
import { parseExcellon } from './gerber/parse_excellon.js';
import { parseGerber } from './gerber/parse_gerber.js';
import type { DrillImage, GerberImage } from './gerber/types.js';
import { renderSvg, type RenderLayer } from './render/svg.js';
import { buildViewerHtml } from './render/viewer_html.js';

export interface ViewerBuildResult {
  svg: string;
  html: string;
  layers: LayerInfo[];
  warnings: string[];
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

/**
 * Full pipeline: read files, parse gerbers/drills, detect + order layers,
 * render the SVG and wrap it in the interactive HTML viewer.
 */
export function buildViewerFromFiles(
  paths: string[],
  options: { title?: string; background?: string } = {},
): ViewerBuildResult {
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

  const svg = renderSvg(ordered, { background: options.background });
  const html = buildViewerHtml(svg, layers, {
    title: options.title ?? (prefix.replace(/[-_. ]+$/, '') || path.basename(paths[0]!)),
  });
  return { svg, html, layers, warnings };
}
