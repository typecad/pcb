/**
 * Flat 2D "PCBA drawing" renderer — the PcbDraw look, computed from gerbers
 * instead of the board file. The board surface is painted bottom-up purely by
 * SVG compositing (no boolean geometry):
 *
 *   substrate (board color, clipped to the stitched Edge.Cuts outline)
 *   → copper ink → pad flashes (finish color)
 *   → soldermask film (clad color) with the mask gerber's openings punched
 *     through an SVG <mask> so the underlying copper/pads/substrate show
 *   → silkscreen → drilled holes
 *   → Fritzing-inspired component glyphs (from X2 %TO.P attributes) + refdes
 *
 * Back-side renders mirror the x axis (that is what flipping a board does);
 * labels stay readable. Everything is theme colors — no lighting, no
 * perspective, one flat image.
 */
import { fmt } from '../gerber/geometry.js';
import { extractComponents, renderComponentGlyphs, type NetlistComponent } from './components.js';
import { stitchBoardOutline } from './outline.js';
import {
  computeLayerBounds,
  pathData,
  renderDrillInk,
  renderLayerInk,
  type Bounds,
  type RenderLayer,
} from './svg.js';
import { DEFAULT_PCBA_THEME, type PcbaTheme } from './theme.js';

export interface PcbaRenderOptions {
  theme?: PcbaTheme;
  /** which side to draw; 'auto' picks front, falling back to back */
  side?: 'auto' | 'front' | 'back';
  /** stamped into the svg root so a render identifies the code that made it */
  generator?: string;
  /**
   * netlist metadata per ref (footprint name + value): footprint names map
   * to package archetypes and exact body dims, values drive decorations
   * like resistor color bands
   */
  netlist?: Record<string, NetlistComponent>;
  /**
   * refdes labels: forced on/off. Unset means auto — off when the silkscreen
   * layer exists (KiCad silk already carries the refdes, and a synthetic
   * label on top doubles it), on when there is no silkscreen to read.
   */
  labels?: boolean;
}

export interface PcbaRenderResult {
  svg: string;
  side: 'front' | 'back';
  /** drawn component glyphs (skipped test points/holes not counted) */
  components: number;
  warnings: string[];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layerOf(layers: RenderLayer[], kind: string, side: 'front' | 'back'): RenderLayer | undefined {
  return layers.find((l) => l.info.kind === kind && l.info.side === side);
}

/** Render a gerber layer set as one flat assembled-board SVG. */
export function renderPcbaSvg(layers: RenderLayer[], options: PcbaRenderOptions = {}): PcbaRenderResult {
  const theme = options.theme ?? DEFAULT_PCBA_THEME;
  const warnings: string[] = [];
  const units = layers[0]?.image.units ?? 'mm';
  // file units per mm-authored constant (constants shrink for inch files)
  const S = units === 'in' ? 1 / 25.4 : 1;

  let side: 'front' | 'back';
  if (options.side === 'front' || options.side === 'back') {
    side = options.side;
  } else {
    const hasFront = layers.some(
      (l) => l.info.side === 'front' && ['copper', 'mask', 'silkscreen'].includes(l.info.kind),
    );
    side = hasFront ? 'front' : 'back';
    if (!hasFront && !layers.some((l) => l.info.side === 'back')) {
      side = 'front';
      warnings.push('no front or back layers detected — rendering whatever layers were found');
    }
  }
  const mirror = side === 'back';

  const copper = layerOf(layers, 'copper', side);
  const mask = layerOf(layers, 'mask', side);
  const silk = layerOf(layers, 'silkscreen', side);
  const edge = layers.find((l) => l.info.kind === 'edge');
  const drills = layers.filter((l) => l.info.kind === 'drill');
  if (!copper) warnings.push(`no ${side} copper layer — rendering without copper/pads`);

  // ---- bounds: everything drawable, plus room for component labels ----
  const all: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const consider = (b: Bounds | null, pad = 0): void => {
    if (!b) return;
    all.minX = Math.min(all.minX, b.minX - pad);
    all.minY = Math.min(all.minY, b.minY - pad);
    all.maxX = Math.max(all.maxX, b.maxX + pad);
    all.maxY = Math.max(all.maxY, b.maxY + pad);
  };
  for (const layer of layers) consider(computeLayerBounds(layer));

  const { components, warnings: compWarnings } = extractComponents(layers, side, options.netlist);
  warnings.push(...compWarnings);
  const { glyphs, labels: compLabels, count } = renderComponentGlyphs(components, theme, { units });
  for (const comp of components) {
    if (comp.kind === 'skip') continue;
    consider(comp.bbox, 2 * S);
  }
  if (!Number.isFinite(all.minX)) {
    all.minX = 0;
    all.minY = 0;
    all.maxX = 1;
    all.maxY = 1;
  }

  const outline = stitchBoardOutline(edge ?? null, { minX: all.minX, minY: all.minY, maxX: all.maxX, maxY: all.maxY }, units);
  warnings.push(...(outline?.warnings ?? []));
  const outlinePath =
    outline && outline.contours.length > 0 ? outline.contours.map((c) => pathData(c.start, c.segments, true)).join(' ') : '';

  // ---- inks ----
  const defs: string[] = [];
  // raw copper ink is only painted in the bare-board (no mask gerber) look —
  // the mask-film branch never paints it, so don't build it (or ship its
  // aperture symbols in <defs>) there
  const copperInk =
    copper && !mask ? renderLayerInk(copper, { color: theme.copper, idPrefix: 'pcba-cu', clearColor: theme.board }) : null;
  const padsInk = copper
    ? renderLayerInk(copper, { color: theme.pads, idPrefix: 'pcba-pads', flashesOnly: true, clearColor: theme.board })
    : null;
  // inside the openings <mask>, luminance decides: openings render black
  // (hide the mask film), clear-polarity shapes render white (keep the film)
  const maskInk = mask ? renderLayerInk(mask, { color: '#000000', idPrefix: 'pcba-mask', clearColor: '#ffffff' }) : null;
  const silkInk = silk ? renderLayerInk(silk, { color: theme.silk, idPrefix: 'pcba-silk', clearColor: theme.clad }) : null;
  // copper ghosting through the mask film: the film is translucent in
  // reality, so traces/pours under it show as a darker mask tone, painted
  // over the film (still masked off at the openings)
  const maskCopperInk =
    mask && copper
      ? renderLayerInk(copper, { color: theme.maskCopper, idPrefix: 'pcba-cum', clearColor: theme.clad })
      : null;
  if (!silk) warnings.push(`no ${side} silkscreen layer — rendering without silkscreen`);
  for (const [name, ink] of [
    ['copper', copperInk],
    ['pads', padsInk],
    ['mask', maskInk],
    ['silkscreen', silkInk],
    ['copper-ghost', maskCopperInk],
  ] as const) {
    if (!ink) continue;
    for (const w of ink.warnings) warnings.push(`${name}: ${w}`);
  }

  const margin = Math.max(all.maxX - all.minX, all.maxY - all.minY) * 0.02 + 0.5 * S;

  // mask def: white everywhere, black where the mask gerber has openings
  if (maskInk) {
    defs.push(
      `<mask id="pcba-open" maskUnits="userSpaceOnUse" x="${fmt(all.minX - margin)}" y="${fmt(
        all.minY - margin,
      )}" width="${fmt(all.maxX - all.minX + 2 * margin)}" height="${fmt(all.maxY - all.minY + 2 * margin)}">`,
      `<rect x="${fmt(all.minX - margin)}" y="${fmt(all.minY - margin)}" width="${fmt(
        all.maxX - all.minX + 2 * margin,
      )}" height="${fmt(all.maxY - all.minY + 2 * margin)}" fill="#ffffff"/>`,
      `<g fill="#000000" stroke="#000000">${maskInk.body.join('')}</g>`,
      `</mask>`,
    );
    defs.push(...maskInk.defs);
  } else {
    warnings.push(`no ${side} soldermask layer — copper renders bare (no mask film)`);
  }
  if (outlinePath) {
    defs.push(`<clipPath id="pcba-clip"><path d="${outlinePath}" clip-rule="evenodd"/></clipPath>`);
  }
  for (const ink of [copperInk, padsInk, silkInk, maskCopperInk]) defs.push(...(ink?.defs ?? []));

  // ---- composite (painter's order, all inside the clip + y flip) ----
  const board: string[] = [];
  if (outlinePath) board.push(`<path d="${outlinePath}" fill="${theme.board}" fill-rule="evenodd"/>`);
  if (maskInk) {
    // with a mask film, raw copper never shows: the film hides it and its
    // openings reveal pads (finish color) on substrate — painting copper
    // here would leak the pour through the opening rings around every pad
    if (padsInk) board.push(`<g fill="${theme.pads}">${padsInk.body.join('')}</g>`);
    board.push(
      `<g mask="url(#pcba-open)"><rect x="${fmt(all.minX - margin)}" y="${fmt(all.minY - margin)}" width="${fmt(
        all.maxX - all.minX + 2 * margin,
      )}" height="${fmt(all.maxY - all.minY + 2 * margin)}" fill="${theme.clad}"/></g>`,
    );
    if (maskCopperInk) {
      board.push(`<g mask="url(#pcba-open)" fill="${theme.maskCopper}">${maskCopperInk.body.join('')}</g>`);
    }
  } else {
    // no mask gerber: bare-board look — copper and pads sit directly on the
    // substrate (this is the only place raw `copper` ink is painted)
    if (copperInk) board.push(`<g fill="${theme.copper}">${copperInk.body.join('')}</g>`);
    if (padsInk) board.push(`<g fill="${theme.pads}">${padsInk.body.join('')}</g>`);
  }
  if (silkInk) {
    // silk is the source of truth for designators — it renders wherever
    // the gerber puts it. Physically it prints on the soldermask and never
    // on exposed copper, so it rides the same openings mask as the mask
    // film; ink under component bodies is occluded by the drawn glyphs,
    // which paint after the silk.
    const keepAttr = maskInk ? ' mask="url(#pcba-open)"' : '';
    board.push(`<g fill="${theme.silk}"${keepAttr}>${silkInk.body.join('')}</g>`);
  }
  const drillBody = drills.map((d) => renderDrillInk(d, { color: theme.hole }).body.join('')).join('');
  if (drillBody) board.push(`<g fill="${theme.hole}">${drillBody}</g>`);

  const clipped = outlinePath ? `<g clip-path="url(#pcba-clip)">${board.join('')}</g>` : board.join('');

  const outlineStroke = outlinePath
    ? `<path d="${outlinePath}" fill="none" stroke="${theme.outline}" stroke-width="${fmt(outline?.strokeWidth ?? 0.1 * S)}" stroke-linejoin="round"/>`
    : '';

  const showLabels = options.labels ?? theme.labels ?? !silk;
  const labelEls = showLabels
    ? compLabels
        .map(
          (l) =>
            `<text x="${fmt(mirror ? -l.x : l.x)}" y="${fmt(-l.y)}" font-size="${fmt(l.size)}" fill="${theme.silk}" font-family="${escapeXml(
              theme.labelFont,
            )}" text-anchor="${mirror ? 'end' : 'start'}">${escapeXml(l.ref)}</text>`,
        )
        .join('')
    : '';

  const width = all.maxX - all.minX + 2 * margin;
  const height = all.maxY - all.minY + 2 * margin;
  const viewBoxX = mirror ? -(all.maxX + margin) : all.minX - margin;
  const viewBox = `${fmt(viewBoxX)} ${fmt(-all.maxY - margin)} ${fmt(width)} ${fmt(height)}`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-units="${units}"${
      options.generator ? ` data-generator="${escapeXml(options.generator)}"` : ''
    } width="100%" height="100%">`,
    defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '',
    `<g id="board" transform="scale(${mirror ? -1 : 1},-1)">`,
    clipped,
    outlineStroke,
    `<g id="components">${glyphs}</g>`,
    `</g>`,
    labelEls ? `<g id="labels">${labelEls}</g>` : '',
    `</svg>`,
  ]
    .filter(Boolean)
    .join('');

  return { svg, side, components: count, warnings };
}
