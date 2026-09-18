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
import { contourPoints, stitchBoardOutline } from './outline.js';
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
  /**
   * render style: 'assembled' (default) is the photoreal flat composite;
   * 'blueprint' is an engineering-drawing look — blueprint paper, the board
   * and component outlines as ink strokes, pads as outlines, drills as
   * marks. 'schematic' focuses on components and traces: white paper,
   * subdued pours, near-black traces, and the PCBA component glyphs
   * rendered semi-transparent on top so the routing reads through them.
   * Neither style uses the theme's palette; each carries its own ink.
   */
  style?: 'assembled' | 'blueprint' | 'schematic';
  /**
   * draw an engineering title block in the bottom margin: board title,
   * date + dimensions + "made with typeCAD" wordmark. The branding on every
   * exported render — pass --no-title-block on the CLI for a clean image.
   */
  titleBlock?: { title: string; note?: string };
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

  const blueprint = options.style === 'blueprint';
  const schematic = options.style === 'schematic';
  const fab = layerOf(layers, 'fab', side);
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
  // room for the title block strip below the board
  const blockH = options.titleBlock ? 13 * S : 0;
  if (blockH) all.maxY += blockH + 2 * S;

  const outline = stitchBoardOutline(edge ?? null, { minX: all.minX, minY: all.minY, maxX: all.maxX, maxY: all.maxY }, units);
  warnings.push(...(outline?.warnings ?? []));
  const outlinePath =
    outline && outline.contours.length > 0 ? outline.contours.map((c) => pathData(c.start, c.segments, true)).join(' ') : '';

  // the BOARD's own extents (for the blueprint's dimension lines) — the
  // `all` bounds include label padding and the title strip; the drawing
  // must measure the outline itself, falling back to the edge layer
  let boardBox: Bounds | null = null;
  if (outline && outline.contours.length > 0) {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const c of outline.contours) {
      for (const p of contourPoints(c)) {
        x1 = Math.min(x1, p.x);
        y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x);
        y2 = Math.max(y2, p.y);
      }
    }
    boardBox = { minX: x1, minY: y1, maxX: x2, maxY: y2 };
  } else if (edge) {
    boardBox = computeLayerBounds(edge);
  }
  if (blueprint && boardBox) {
    // grow the bounds to cover every drawing annotation, so the paper
    // (sized from these bounds + margin) fully contains them: the corner
    // ticks reach gap+tick past the board on ALL four sides, the dimension
    // lines plus their text reach further above (width) and left (height)
    const tickReach = 0.8 * S + 3 * S;
    const dimReach = 4.5 * S + 1.2 * S + 2.4 * S; // line standoff + overshoot + text
    all.minX = Math.min(all.minX, boardBox.minX - dimReach);
    all.maxX = Math.max(all.maxX, boardBox.maxX + tickReach);
    all.minY = Math.min(all.minY, boardBox.minY - tickReach);
    all.maxY = Math.max(all.maxY, boardBox.maxY + dimReach);
  }

  // ---- inks ----
  const defs: string[] = [];

  // drawing-style inks: blueprint paper or the schematic's white — neither
  // uses the theme's palette. The schematic's trace ink is ONE constant so
  // future voltage color-coding can swap it per net.
  const BP_PAPER = '#1c3a5e';
  const BP_BOARD = '#24466d';
  const BP_INK = '#d9e7f6';
  const BP_INK_FAINT = '#a8bfd9';
  const SCH_PAPER = '#ffffff';
  const SCH_BOARD = '#f3f4f6';
  const SCH_TRACE = '#101010';
  const SCH_INK_FAINT = '#b6bcc4';

  let bpCopperBody = '';
  let bpFabBody = '';
  let bpPourHatch = '';

  /**
   * Explicit hatch lines across every dark-polarity pour region, clipped to
   * the region outlines (45° up-right, 0.9mm pitch). Real geometry, NOT an
   * SVG <pattern>: patterns render inconsistently across contexts (a
   * pattern fill rendered as a solid wash in exported files and as
   * arbitrary colors in third-party viewers), while clipped lines render
   * identically everywhere.
   */
  const buildPourHatch = (
    copperLayer: RenderLayer | undefined,
    clipId: string,
    hatchInk: string,
    hatchOpacity: number,
  ): { clip: string; hatch: string } => {
    if (!copperLayer) return { clip: '', hatch: '' };
    const image = copperLayer.image;
    if (!('ops' in image)) return { clip: '', hatch: '' };
    const pitch = 0.9 * S;
    const width = 0.12 * S;
    const pourPaths: string[] = [];
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const op of image.ops) {
      if (op.type !== 'region' || op.polarity === 'clear') continue;
      for (const contour of op.contours) {
        pourPaths.push(pathData(contour.start, contour.segments, true));
        for (const p of contourPoints(contour)) {
          x1 = Math.min(x1, p.x);
          y1 = Math.min(y1, p.y);
          x2 = Math.max(x2, p.x);
          y2 = Math.max(y2, p.y);
        }
      }
    }
    if (pourPaths.length === 0 || !Number.isFinite(x1)) return { clip: '', hatch: '' };
    // 45° lines (x + y = d) spanning the bbox diagonally, each drawn long
    // enough to cross the whole region
    const segs: string[] = [];
    for (let d = x1 + y1 - pitch; d <= x2 + y2 + pitch; d += pitch) {
      segs.push(`M ${fmt(d - y2 - pitch)} ${fmt(y2 + pitch)} L ${fmt(d - y1 + pitch)} ${fmt(y1 - pitch)}`);
    }
    return {
      clip: `<clipPath id="${clipId}">${pourPaths.map((d) => `<path d="${d}" clip-rule="evenodd"/>`).join('')}</clipPath>`,
      hatch: `<g clip-path="url(#${clipId})"><path d="${segs.join(' ')}" fill="none" stroke="${hatchInk}" stroke-opacity="${hatchOpacity}" stroke-width="${fmt(width)}"/></g>`,
    };
  };

  if (blueprint) {
    // The layer set as a drawing, with distinct line conventions per element
    // class so nothing collapses into blobs: traces keep their real widths,
    // pads are thin ink outlines (0.15mm — the wrapper's stroke-width, which
    // flashes inherit; traces override it with their own), pours render as
    // the clipped hatch with a faint boundary and a faint solid underlay.
    const bpCopper = copper
      ? renderLayerInk(copper, {
          color: BP_INK,
          idPrefix: 'pcba-bp-cu',
          clearColor: BP_BOARD,
          regionFill: 'none',
          regionStroke: { color: BP_INK_FAINT, width: 0.12 * S },
          regionUnderlay: { color: BP_INK, opacity: 0.12 },
        })
      : null;
    const bpFab = fab ? renderLayerInk(fab, { color: BP_INK_FAINT, idPrefix: 'pcba-bp-fab', clearColor: BP_BOARD }) : null;
    for (const [name, ink] of [
      ['copper', bpCopper],
      ['fab', bpFab],
    ] as const) {
      if (!ink) continue;
      for (const w of ink.warnings) warnings.push(`${name}: ${w}`);
      defs.push(...ink.defs);
    }
    bpCopperBody = bpCopper?.body.join('') ?? '';
    bpFabBody = bpFab?.body.join('') ?? '';
    const pour = buildPourHatch(copper, 'pcba-bp-pourclip', BP_INK, 0.35);
    defs.push(pour.clip);
    bpPourHatch = pour.hatch;
  }

  // schematic view: white paper, subdued pours, near-black traces — the
  // routing is the subject. Copper carries data-net/data-ref so the viewer
  // can hover a trace for its operating point. EVERY copper layer renders
  // into this one view, stack-ordered: the top layer draws solid, deeper
  // layers as construction lines (centerline, then one edge line per
  // further layer) so inner/back routing is visible without simulating a
  // second board view.
  let schCopperBody = '';
  let schPourHatch = '';
  if (schematic) {
    const styleForDepth = (i: number): 'solid' | 'center' | 'centerEdgeA' | 'centerEdgeB' =>
      i === 0 ? 'solid' : i === 1 ? 'center' : i === 2 ? 'centerEdgeA' : i === 3 ? 'centerEdgeB' : 'center';
    const stack = layers
      .filter((l) => l.info.kind === 'copper')
      .sort(
        (a, b) =>
          (b.info.copperIndex ?? (b.info.side === 'front' ? 999 : -1)) -
          (a.info.copperIndex ?? (a.info.side === 'front' ? 999 : -1)),
      );
    const inks: string[] = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      // top layer last so it paints over the construction lines
      const cu = stack[i];
      const ink = renderLayerInk(cu, {
        color: i === 0 ? SCH_TRACE : SCH_INK_FAINT,
        idPrefix: 'pcba-sch-cu' + (i === 0 ? '' : i),
        clearColor: SCH_PAPER,
        regionFill: 'none',
        regionStroke: i === 0 ? { color: SCH_INK_FAINT, width: 0.1 * S } : undefined,
        traceStyle: styleForDepth(i),
      });
      for (const w of ink.warnings) warnings.push(`copper: ${w}`);
      defs.push(...ink.defs);
      // deeper layers skip regions — their pours duplicate the top layer's
      // outline and bury the construction lines
      inks.push(i === 0 ? ink.body.join('') : ink.body.join('').replace(/<path[^>]*fill-rule="evenodd"[^>]*\/>/g, ''));
    }
    schCopperBody = inks.join('');
    const pour = buildPourHatch(copper, 'pcba-sch-pourclip', SCH_INK_FAINT, 0.4);
    defs.push(pour.clip);
    schPourHatch = pour.hatch;
  }

  // raw copper ink is only painted in the bare-board (no mask gerber) look —
  // the mask-film branch never paints it, so don't build it (or ship its
  // aperture symbols in <defs>) there
  const copperInk =
    copper && !mask && !blueprint && !schematic
      ? renderLayerInk(copper, { color: theme.copper, idPrefix: 'pcba-cu', clearColor: theme.board })
      : null;
  const padsInk =
    copper && !blueprint && !schematic
      ? renderLayerInk(copper, { color: theme.pads, idPrefix: 'pcba-pads', flashesOnly: true, clearColor: theme.board })
      : null;
  // inside the openings <mask>, luminance decides: openings render black
  // (hide the mask film), clear-polarity shapes render white (keep the film)
  const maskInk =
    mask && !blueprint && !schematic ? renderLayerInk(mask, { color: '#000000', idPrefix: 'pcba-mask', clearColor: '#ffffff' }) : null;
  const silkInk =
    silk && !blueprint && !schematic ? renderLayerInk(silk, { color: theme.silk, idPrefix: 'pcba-silk', clearColor: theme.clad }) : null;
  // copper ghosting through the mask film: the film is translucent in
  // reality, so traces/pours under it show as a darker mask tone, painted
  // over the film (still masked off at the openings)
  const maskCopperInk =
    mask && copper && !blueprint && !schematic
      ? renderLayerInk(copper, { color: theme.maskCopper, idPrefix: 'pcba-cum', clearColor: theme.clad })
      : null;
  if (!silk && !blueprint && !schematic) warnings.push(`no ${side} silkscreen layer — rendering without silkscreen`);
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
  } else if (!blueprint && !schematic) {
    warnings.push(`no ${side} soldermask layer — copper renders bare (no mask film)`);
  }
  if (outlinePath) {
    defs.push(`<clipPath id="pcba-clip"><path d="${outlinePath}" clip-rule="evenodd"/></clipPath>`);
  }
  for (const ink of [copperInk, padsInk, silkInk, maskCopperInk]) defs.push(...(ink?.defs ?? []));

  // ---- composite (painter's order, all inside the clip + y flip) ----
  const board: string[] = [];
  if (blueprint) {
    // drawing order: board region, faint fab outlines, the pour hatch (under
    // the copper so pads/traces stay legible), ink copper (pads outlined by
    // the fill=none wrapper), drill marks
    if (outlinePath) board.push(`<path d="${outlinePath}" fill="${BP_BOARD}" fill-rule="evenodd"/>`);
    if (bpFabBody) board.push(`<g fill="none" stroke="${BP_INK_FAINT}" stroke-width="${fmt(0.12 * S)}">${bpFabBody}</g>`);
    if (bpPourHatch) board.push(bpPourHatch);
    // wrapper stroke-width is what pad flashes inherit — thin outlines, not
    // the 1-unit default that made pads as thick as themselves (blobs);
    // traces carry their own real widths, regions their boundary stroke
    if (bpCopperBody)
      board.push(`<g fill="none" stroke="${BP_INK}" stroke-width="${fmt(0.15 * S)}">${bpCopperBody}</g>`);
    const bpDrills = drills.map((d) => renderDrillInk(d, { color: BP_INK }).body.join('')).join('');
    if (bpDrills) board.push(`<g fill="${BP_INK}">${bpDrills}</g>`);
  } else if (schematic) {
    // white paper, subdued pours, near-black traces: the routing is the
    // subject. Components paint AFTER (semi-transparent, in the svg
    // assembly below) so their bodies read over the traces without
    // hiding them. id: the thermal view darkens the substrate — a light
    // board washes out the pour heat image layered over it.
    if (outlinePath) board.push(`<path id="sch-board-fill" d="${outlinePath}" fill="${SCH_BOARD}" fill-rule="evenodd"/>`);
    if (schPourHatch) board.push(schPourHatch);
    if (schCopperBody)
      // id="sch-copper" is the heat-map target: the viewer recolors these
      // strokes by each trace's solved node voltage
      board.push(`<g id="sch-copper" fill="none" stroke="${SCH_TRACE}" stroke-width="${fmt(0.12 * S)}">${schCopperBody}</g>`);
    const schDrills = drills.map((d) => renderDrillInk(d, { color: SCH_INK_FAINT }).body.join('')).join('');
    if (schDrills) board.push(`<g fill="${SCH_INK_FAINT}">${schDrills}</g>`);
  } else if (maskInk) {
    if (outlinePath) board.push(`<path d="${outlinePath}" fill="${theme.board}" fill-rule="evenodd"/>`);
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
    if (outlinePath) board.push(`<path d="${outlinePath}" fill="${theme.board}" fill-rule="evenodd"/>`);
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
  if (!blueprint && !schematic) {
    const drillBody = drills.map((d) => renderDrillInk(d, { color: theme.hole }).body.join('')).join('');
    if (drillBody) board.push(`<g fill="${theme.hole}">${drillBody}</g>`);
  }

  const clipped = outlinePath && !blueprint ? `<g clip-path="url(#pcba-clip)">${board.join('')}</g>` : board.join('');

  const outlineStroke = outlinePath
    ? `<path d="${outlinePath}" fill="none" stroke="${blueprint ? BP_INK : schematic ? SCH_INK_FAINT : theme.outline}" stroke-width="${fmt(
        (outline?.strokeWidth ?? 0.1 * S) * (blueprint ? 2.5 : 1),
      )}" stroke-linejoin="round"/>`
    : '';

  // a blueprint is a labeled drawing — but the fab layer it renders already
  // carries each component's designator (placed by KiCad, out of the way),
  // so synthetic labels would double it and overlap the footprint. They are
  // the fallback only when no fab layer came in the set.
  const showLabels = blueprint
    ? (options.labels ?? !fab)
    : schematic
      ? (options.labels ?? true)
      : (options.labels ?? theme.labels ?? !silk);
  const labelFill = blueprint ? BP_INK : schematic ? SCH_TRACE : theme.silk;
  const labelEls = showLabels
    ? compLabels
        .map(
          (l) =>
            `<text x="${fmt(mirror ? -l.x : l.x)}" y="${fmt(-l.y)}" font-size="${fmt(l.size)}" fill="${labelFill}" font-family="${escapeXml(
              theme.labelFont,
            )}" text-anchor="${mirror ? 'end' : 'start'}">${escapeXml(l.ref)}</text>`,
        )
        .join('')
    : '';

  const width = all.maxX - all.minX + 2 * margin;
  const height = all.maxY - all.minY + 2 * margin;
  const viewBoxX = mirror ? -(all.maxX + margin) : all.minX - margin;
  const viewBox = `${fmt(viewBoxX)} ${fmt(-all.maxY - margin)} ${fmt(width)} ${fmt(height)}`;

  // ---- title block: the engineering-drawing strip below the board ----
  // unflipped frame (like the labels): title, date + dims + the wordmark
  let titleBlockSvg = '';
  if (options.titleBlock) {
    const ink = blueprint ? BP_INK : theme.silk;
    const accent = blueprint ? BP_INK : theme.pads;
    const frame = blueprint ? BP_INK : theme.outline;
    const bw = 46 * S;
    const bh = 11 * S;
    const bx = all.maxX - bw;
    // unflipped y: bottom of the viewBox minus the strip height
    const by = -(all.minY - margin) - blockH + (blockH - bh) / 2;
    const dims = `${(outline ? width - 2 * margin : width).toFixed(1)} × ${(outline ? height - 2 * margin - blockH - 2 * S : height).toFixed(1)} mm`;
    const note = options.titleBlock.note ?? `made with typeCAD`;
    const date = new Date().toISOString().slice(0, 10);
    titleBlockSvg = [
      `<g id="titleblock" font-family="${escapeXml(theme.labelFont)}">`,
      `<rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="none" stroke="${frame}" stroke-width="${fmt(0.2 * S)}"/>`,
      `<text x="${fmt(bx + 2 * S)}" y="${fmt(by + 4.2 * S)}" font-size="${fmt(3.2 * S)}" fill="${ink}">${escapeXml(options.titleBlock.title)}</text>`,
      `<line x1="${fmt(bx)}" y1="${fmt(by + 5.6 * S)}" x2="${fmt(bx + bw)}" y2="${fmt(by + 5.6 * S)}" stroke="${frame}" stroke-width="${fmt(0.15 * S)}"/>`,
      `<text x="${fmt(bx + 2 * S)}" y="${fmt(by + 8.8 * S)}" font-size="${fmt(1.8 * S)}" fill="${ink}">${date} · ${dims} · </text>`,
      `<text x="${fmt(bx + 2 * S)}" y="${fmt(by + 8.8 * S)}" font-size="${fmt(1.8 * S)}" fill="${accent}" text-anchor="end" dx="${fmt(bw - 4 * S)}">${escapeXml(note)}</text>`,
      `</g>`,
    ].join('');
  }

  // ---- blueprint drawing annotations: dimension lines + extents ticks ----
  // drawing conventions: extension lines run from just outside the board
  // past the dimension line; arrowheads point along the dimension; the
  // corner ticks are crop-style extents marks with a gap off the board.
  // Unflipped space (like the title block), measured against the outline's
  // own bounds — never the padded `all` bounds.
  let drawingDims = '';
  if (blueprint && boardBox) {
    const b = boardBox;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const yTop = -b.maxY; // unflipped board top
    const yBot = -b.minY;
    const gap = 0.8 * S; // extension/tick standoff off the board
    const off = 4.5 * S; // dimension line standoff
    const over = 1.2 * S; // extension overshoot past the dimension line
    const aL = 1.7 * S; // arrowhead length
    const aW = 0.55 * S; // arrowhead half width
    const tick = 3 * S;
    const sw = 0.12 * S;
    // arrowhead triangle with its tip at (x, y) pointing along dx/dy (unit)
    const arrow = (x: number, y: number, dx: number, dy: number): string => {
      const bx = x - dx * aL;
      const by = y - dy * aL;
      const px = -dy * aW;
      const py = dx * aW;
      return `<polygon points="${fmt(x)},${fmt(y)} ${fmt(bx + px)},${fmt(by + py)} ${fmt(bx - px)},${fmt(by - py)}" fill="${BP_INK}"/>`;
    };
    const yW = yTop - off; // width dimension line
    const xH = b.minX - off; // height dimension line
    drawingDims = [
      `<g id="drawing-dims" font-family="${escapeXml(theme.labelFont)}" fill="none" stroke="${BP_INK}" stroke-width="${fmt(sw)}">`,
      // width: extension lines at both top corners, dim line, arrows, text
      `<line x1="${fmt(b.minX)}" y1="${fmt(yTop - gap)}" x2="${fmt(b.minX)}" y2="${fmt(yW - over)}"/>`,
      `<line x1="${fmt(b.maxX)}" y1="${fmt(yTop - gap)}" x2="${fmt(b.maxX)}" y2="${fmt(yW - over)}"/>`,
      `<line x1="${fmt(b.minX)}" y1="${fmt(yW)}" x2="${fmt(b.maxX)}" y2="${fmt(yW)}"/>`,
      `<line x1="${fmt(b.minX + gap)}" y1="${fmt(yBot)}" x2="${fmt(xH - over)}" y2="${fmt(yBot)}"/>`,
      `<line x1="${fmt(b.minX + gap)}" y1="${fmt(yTop)}" x2="${fmt(xH - over)}" y2="${fmt(yTop)}"/>`,
      `<line x1="${fmt(xH)}" y1="${fmt(yTop)}" x2="${fmt(xH)}" y2="${fmt(yBot)}"/>`,
      `</g>`,
      `<g id="drawing-dims-arrows" fill="${BP_INK}">`,
      arrow(b.minX, yW, 1, 0),
      arrow(b.maxX, yW, -1, 0),
      arrow(xH, yTop, 0, 1),
      arrow(xH, yBot, 0, -1),
      `</g>`,
      `<g id="drawing-dims-text" font-size="${fmt(2.2 * S)}" fill="${BP_INK}" text-anchor="middle">`,
      `<text x="${fmt((b.minX + b.maxX) / 2)}" y="${fmt(yW - 1.2 * S)}">${w.toFixed(1)}</text>`,
      `<text x="${fmt(xH - 1.2 * S)}" y="${fmt((yTop + yBot) / 2)}" transform="rotate(-90 ${fmt(xH - 1.2 * S)} ${fmt((yTop + yBot) / 2)})">${h.toFixed(1)}</text>`,
      `</g>`,
      // corner extents ticks: crop marks with a gap off each board corner
      `<g id="drawing-dims-ticks" stroke="${BP_INK}" stroke-width="${fmt(sw)}">`,
      `<line x1="${fmt(b.minX - gap - tick)}" y1="${fmt(yTop)}" x2="${fmt(b.minX - gap)}" y2="${fmt(yTop)}"/>`,
      `<line x1="${fmt(b.minX)}" y1="${fmt(yTop - gap - tick)}" x2="${fmt(b.minX)}" y2="${fmt(yTop - gap)}"/>`,
      `<line x1="${fmt(b.maxX + gap)}" y1="${fmt(yTop)}" x2="${fmt(b.maxX + gap + tick)}" y2="${fmt(yTop)}"/>`,
      `<line x1="${fmt(b.maxX)}" y1="${fmt(yTop - gap - tick)}" x2="${fmt(b.maxX)}" y2="${fmt(yTop - gap)}"/>`,
      `<line x1="${fmt(b.minX - gap - tick)}" y1="${fmt(yBot)}" x2="${fmt(b.minX - gap)}" y2="${fmt(yBot)}"/>`,
      `<line x1="${fmt(b.minX)}" y1="${fmt(yBot + gap)}" x2="${fmt(b.minX)}" y2="${fmt(yBot + gap + tick)}"/>`,
      `<line x1="${fmt(b.maxX + gap)}" y1="${fmt(yBot)}" x2="${fmt(b.maxX + gap + tick)}" y2="${fmt(yBot)}"/>`,
      `<line x1="${fmt(b.maxX)}" y1="${fmt(yBot + gap)}" x2="${fmt(b.maxX)}" y2="${fmt(yBot + gap + tick)}"/>`,
      `</g>`,
    ].join('');
  }

  // ---- blueprint info block: what this drawing shows, bottom-left ----
  // balances the title block (bottom-right): the layers that went into the
  // drawing, units + side, the generator, and up to three parse warnings —
  // the info a fab drawing's notes column carries.
  let infoBlockSvg = '';
  if (blueprint && blockH > 0) {
    const ink = BP_INK;
    const frame = BP_INK;
    const bw = 52 * S;
    const bh = 11 * S;
    const bx = all.minX - margin;
    const by = -(all.minY - margin) - blockH + (blockH - bh) / 2;
    const layerNames = layers
      .filter((l) => ['copper', 'mask', 'silkscreen', 'drill', 'edge', 'fab'].includes(l.info.kind))
      .map((l) => l.info.name)
      .slice(0, 6)
      .join('  ');
    const lines: string[] = [`layers  ${layerNames || '—'}`, `units ${units} · ${side} side`, options.generator ?? ''];
    for (const w of warnings.slice(0, 2)) lines.push(`! ${w.length > 60 ? w.slice(0, 57) + '...' : w}`);
    infoBlockSvg = [
      `<g id="info-block" font-family="${escapeXml(theme.labelFont)}">`,
      `<rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="none" stroke="${frame}" stroke-width="${fmt(0.2 * S)}"/>`,
      ...lines.map((line, i) => {
        const clipped = line.length > 58 ? line.slice(0, 55) + '...' : line;
        return `<text x="${fmt(bx + 1.5 * S)}" y="${fmt(by + 3 + i * 2.6 * S)}" font-size="${fmt(1.7 * S)}" fill="${ink}">${escapeXml(clipped)}</text>`;
      }),
      `</g>`,
    ].join('');
  }

  const bgRect = blueprint
    ? `<rect x="${fmt(viewBoxX)}" y="${fmt(-all.maxY - margin)}" width="${fmt(width)}" height="${fmt(height)}" fill="${BP_PAPER}"/>`
    : schematic
      ? // id="sch-paper": the thermal view darkens the paper for its graphite look
        `<rect id="sch-paper" x="${fmt(viewBoxX)}" y="${fmt(-all.maxY - margin)}" width="${fmt(width)}" height="${fmt(height)}" fill="${SCH_PAPER}"/>`
      : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-units="${units}"${
      options.generator ? ` data-generator="${escapeXml(options.generator)}"` : ''
    } width="100%" height="100%">`,
    `<defs>${defs.join('')}</defs>`,
    bgRect,
    `<g id="board" transform="scale(${mirror ? -1 : 1},-1)">`,
    clipped,
    outlineStroke,
    blueprint
      ? ''
      : schematic
        ? // distinct id: the schematic view's glyph group is the power
          // heat-map overlay's target in the combined viewer document
          `<g id="sch-components" opacity="0.55">${glyphs}</g>`
        : `<g id="components">${glyphs}</g>`,
    `</g>`,
    labelEls ? `<g id="labels">${labelEls}</g>` : '',
    drawingDims,
    infoBlockSvg,
    titleBlockSvg,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('');

  return {
    svg,
    side,
    components: blueprint ? components.filter((c) => c.kind !== 'skip').length : count,
    warnings,
  };
}
