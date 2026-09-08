import { evaluateAperture } from '../gerber/apertures.js';
import { dist, fmt, rotatePoint, signedSweep } from '../gerber/geometry.js';
import type { DrillImage, EvaluatedAperture, GerberImage, PathSegment, Point, RegionContour } from '../gerber/types.js';
import type { LayerInfo } from '../detect_layer.js';

export interface RenderLayer {
  info: LayerInfo;
  image: GerberImage | DrillImage;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RenderOptions {
  /** Page background used by clear-polarity shapes (default white). */
  background?: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function polygonPoints(points: Point[]): string {
  return points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
}

/** Regular polygon vertices starting at `rotation` degrees CCW from +x. */
function regularPolygon(outerDiameter: number, vertices: number, rotation: number): Point[] {
  const r = outerDiameter / 2;
  const points: Point[] = [];
  for (let i = 0; i < vertices; i++) {
    const angle = ((rotation + (360 * i) / vertices) * Math.PI) / 180;
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return points;
}

/** Macro vector line rendered as its swept rectangle (fill-only shapes only). */
function vectorLinePolygon(from: Point, to: Point, width: number, rotation: number): Point[] {
  const a = rotatePoint(from, rotation);
  const b = rotatePoint(to, rotation);
  const len = dist(a, b);
  if (len < 1e-12) {
    return regularPolygon(width, 8, rotation);
  }
  const px = (-(b.y - a.y) / len) * (width / 2);
  const py = ((b.x - a.x) / len) * (width / 2);
  return [
    { x: a.x + px, y: a.y + py },
    { x: b.x + px, y: b.y + py },
    { x: b.x - px, y: b.y - py },
    { x: a.x - px, y: a.y - py },
  ];
}

/** SVG defs content for one evaluated aperture, centered at the origin. */
function apertureDefsShapes(ap: EvaluatedAperture): string {
  const t = ap.template;
  if (t) {
    const hole = t.hole ? `<circle class="cut" cx="0" cy="0" r="${fmt(t.hole.diameter / 2)}"/>` : '';
    switch (t.kind) {
      case 'circle':
        return `<circle cx="0" cy="0" r="${fmt(t.diameter / 2)}"/>${hole}`;
      case 'rect':
      case 'obround': {
        const round =
          t.kind === 'obround'
            ? ` rx="${fmt(Math.min(t.width, t.height) / 2)}" ry="${fmt(Math.min(t.width, t.height) / 2)}"`
            : '';
        return `<rect x="${fmt(-t.width / 2)}" y="${fmt(-t.height / 2)}" width="${fmt(t.width)}" height="${fmt(t.height)}"${round}/>${hole}`;
      }
      case 'polygon':
        return `<polygon points="${polygonPoints(regularPolygon(t.outerDiameter, t.vertices, t.rotation))}"/>${hole}`;
    }
  }
  return ap.primitives
    .map((p) => {
      const attrs = p.exposure ? '' : ' class="cut"';
      switch (p.kind) {
        case 'circle':
          return `<circle${attrs} cx="${fmt(p.center.x)}" cy="${fmt(p.center.y)}" r="${fmt(p.diameter / 2)}"/>`;
        case 'vectorLine':
          return `<polygon${attrs} points="${polygonPoints(vectorLinePolygon(p.from, p.to, p.width, p.rotation))}"/>`;
        case 'centerLine':
          return `<g transform="rotate(${fmt(p.rotation)} ${fmt(p.center.x)} ${fmt(p.center.y)})"><rect${attrs} x="${fmt(
            p.center.x - p.width / 2,
          )}" y="${fmt(p.center.y - p.height / 2)}" width="${fmt(p.width)}" height="${fmt(p.height)}"/></g>`;
        case 'outline':
          return `<polygon${attrs} points="${polygonPoints(p.points.map((pt) => rotatePoint(pt, p.rotation)))}"/>`;
        case 'polygon':
          return `<polygon${attrs} points="${polygonPoints(
            regularPolygon(p.outerDiameter, p.vertices, p.rotation).map((pt) => ({
              x: pt.x + p.center.x,
              y: pt.y + p.center.y,
            })),
          )}"/>`;
      }
    })
    .join('');
}

interface StrokeProps {
  width: number;
  cap: 'round' | 'butt';
}

function strokeFor(ap: EvaluatedAperture, warnings: Set<string>): StrokeProps {
  const t = ap.template;
  if (t?.kind === 'circle') return { width: t.diameter, cap: 'round' };
  if (t?.kind === 'rect' && Math.abs(t.width - t.height) < 1e-9) {
    return { width: t.width, cap: 'butt' };
  }
  if (t?.kind === 'obround' && Math.abs(t.width - t.height) < 1e-9) {
    return { width: t.width, cap: 'round' };
  }
  warnings.add('non-circular aperture used for a trace; approximated with a round stroke of the smaller dimension');
  return { width: 2 * Math.min(ap.extent.rx, ap.extent.ry), cap: 'round' };
}

/** SVG path data for one arc segment (handles full circles as two half arcs). */
function arcCommand(from: Point, seg: Extract<PathSegment, { kind: 'arc' }>): string {
  const r = dist(from, seg.center);
  if (r < 1e-9) return `L ${fmt(seg.to.x)} ${fmt(seg.to.y)}`;
  const sweep = seg.ccw ? 1 : 0;
  if (dist(from, seg.to) < 1e-9) {
    // full circle: two 180-degree arcs through a midpoint rotated 90 degrees
    const v = { x: from.x - seg.center.x, y: from.y - seg.center.y };
    const dir = seg.ccw ? 1 : -1;
    const mid = { x: seg.center.x - dir * v.y, y: seg.center.y + dir * v.x };
    return `A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(mid.x)} ${fmt(mid.y)} A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(seg.to.x)} ${fmt(seg.to.y)}`;
  }
  const angle = Math.abs(signedSweep(from, seg.to, seg.center, seg.ccw));
  const largeArc = angle > Math.PI + 1e-9 ? 1 : 0;
  return `A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(seg.to.x)} ${fmt(seg.to.y)}`;
}

function pathData(start: Point, segments: PathSegment[], close: boolean): string {
  if (segments.length === 0) return '';
  let d = `M ${fmt(start.x)} ${fmt(start.y)}`;
  let prev = start;
  for (const seg of segments) {
    d += seg.kind === 'line' ? ` L ${fmt(seg.to.x)} ${fmt(seg.to.y)}` : ` ${arcCommand(prev, seg)}`;
    prev = seg.to;
  }
  return close ? `${d} Z` : d;
}

function contourBounds(contour: RegionContour, bounds: Bounds): void {
  const consider = (p: Point) => {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  };
  consider(contour.start);
  let prev = contour.start;
  for (const seg of contour.segments) {
    if (seg.kind === 'line') {
      consider(seg.to);
    } else {
      // conservative: extremes of the full circle around the center
      consider({ x: seg.center.x - dist(prev, seg.center), y: seg.center.y - dist(prev, seg.center) });
      consider({ x: seg.center.x + dist(prev, seg.center), y: seg.center.y + dist(prev, seg.center) });
      consider(seg.to);
    }
    prev = seg.to;
  }
}

export function computeLayerBounds(layer: RenderLayer): Bounds | null {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const consider = (p: Point, pad = 0) => {
    bounds.minX = Math.min(bounds.minX, p.x - pad);
    bounds.minY = Math.min(bounds.minY, p.y - pad);
    bounds.maxX = Math.max(bounds.maxX, p.x + pad);
    bounds.maxY = Math.max(bounds.maxY, p.y + pad);
  };
  const img = layer.image;
  if ('ops' in img) {
    const apertures = new Map<number, EvaluatedAperture>();
    const evalAp = (code: number): EvaluatedAperture => {
      if (!apertures.has(code)) {
        apertures.set(
          code,
          img.apertures.has(code)
            ? evaluateAperture(img.apertures.get(code)!, img.macros)
            : { template: null, primitives: [], extent: { rx: 0, ry: 0 }, warnings: [] },
        );
      }
      return apertures.get(code)!;
    };
    for (const op of img.ops) {
      if (op.type === 'flash') {
        consider(op.at, Math.max(evalAp(op.aperture).extent.rx, evalAp(op.aperture).extent.ry));
      } else if (op.type === 'trace') {
        consider(op.from, Math.max(evalAp(op.aperture).extent.rx, evalAp(op.aperture).extent.ry));
        for (const seg of op.segments) consider(seg.to);
      } else {
        for (const contour of op.contours) contourBounds(contour, bounds);
      }
    }
  } else {
    for (const hole of img.holes) {
      const dia = img.tools.get(hole.tool)?.diameter ?? 0;
      consider(hole.at, dia / 2);
    }
    for (const slot of img.slots) {
      const dia = img.tools.get(slot.tool)?.diameter ?? 0;
      consider(slot.from, dia / 2);
      consider(slot.to, dia / 2);
    }
  }
  if (!Number.isFinite(bounds.minX)) return null;
  return bounds;
}

/**
 * Render layers to a single SVG string. The gerber frame (y up) is mapped to
 * the screen via a `scale(1,-1)` group plus a flipped viewBox. Layers paint
 * bottom-up in stackup order; each layer group carries data-layer-id/name and
 * a display default matching LayerInfo.defaultVisible.
 */
export function renderSvg(layers: RenderLayer[], options: RenderOptions = {}): string {
  const background = options.background ?? '#ffffff';
  const defs: string[] = [];
  const groups: string[] = [];
  const units = layers[0]?.image.units ?? 'mm';

  const all: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const layer of layers) {
    const b = computeLayerBounds(layer);
    if (!b) continue;
    all.minX = Math.min(all.minX, b.minX);
    all.minY = Math.min(all.minY, b.minY);
    all.maxX = Math.max(all.maxX, b.maxX);
    all.maxY = Math.max(all.maxY, b.maxY);
  }
  if (!Number.isFinite(all.minX)) {
    all.minX = 0;
    all.minY = 0;
    all.maxX = 1;
    all.maxY = 1;
  }

  layers.forEach((layer, li) => {
    const info = layer.info;
    const img = layer.image;
    const body: string[] = [];
    const warnings = new Set<string>();

    if ('ops' in img) {
      const evaluated = new Map<number, EvaluatedAperture>();
      const evalAp = (code: number): EvaluatedAperture => {
        if (!evaluated.has(code)) {
          evaluated.set(
            code,
            img.apertures.has(code)
              ? evaluateAperture(img.apertures.get(code)!, img.macros)
              : {
                  template: null,
                  primitives: [],
                  extent: { rx: 0, ry: 0 },
                  warnings: [`aperture D${code} used but not defined`],
                },
          );
          for (const w of evaluated.get(code)!.warnings) warnings.add(w);
        }
        return evaluated.get(code)!;
      };

      // aperture symbols for flashes
      const flashed = new Set<number>();
      for (const op of img.ops) if (op.type === 'flash') flashed.add(op.aperture);
      for (const code of flashed) {
        const ap = evalAp(code);
        defs.push(`<g id="ap${li}_${code}">${apertureDefsShapes(ap)}</g>`);
      }

      for (const op of img.ops) {
        if (op.type === 'flash') {
          const attrs = op.polarity === 'clear' ? ' class="cut"' : '';
          // X2 object attributes ride along for hover probing / highlighting
          const probe =
            (op.net ? ` data-net="${escapeXml(op.net)}"` : '') +
            (op.ref ? ` data-ref="${escapeXml(op.ref)}"` : '') +
            (op.pin ? ` data-pin="${escapeXml(op.pin)}"` : '');
          body.push(`<use${attrs}${probe} href="#ap${li}_${op.aperture}" x="${fmt(op.at.x)}" y="${fmt(op.at.y)}"/>`);
        } else if (op.type === 'trace') {
          const ap = evalAp(op.aperture);
          const stroke = strokeFor(ap, warnings);
          const d = pathData(op.from, op.segments, false);
          if (!d) continue;
          const attrs = op.polarity === 'clear' ? ' class="cut"' : ` stroke="${info.color}"`;
          const net = op.net ? ` data-net="${escapeXml(op.net)}"` : '';
          body.push(
            `<path${attrs}${net} d="${d}" fill="none" stroke-width="${fmt(stroke.width)}" stroke-linecap="${stroke.cap}" stroke-linejoin="${stroke.cap === 'round' ? 'round' : 'miter'}"/>`,
          );
        } else {
          const d = op.contours.map((c) => pathData(c.start, c.segments, true)).join(' ');
          if (!d) continue;
          const attrs = op.polarity === 'clear' ? ' class="cut"' : ` fill="${info.color}"`;
          const net = op.net ? ` data-net="${escapeXml(op.net)}"` : '';
          body.push(`<path${attrs}${net} d="${d}" fill-rule="evenodd" stroke="none"/>`);
        }
      }
    } else {
      for (const hole of img.holes) {
        const dia = img.tools.get(hole.tool)?.diameter ?? 0;
        body.push(`<circle cx="${fmt(hole.at.x)}" cy="${fmt(hole.at.y)}" r="${fmt(dia / 2)}"/>`);
      }
      for (const slot of img.slots) {
        const dia = img.tools.get(slot.tool)?.diameter ?? 0;
        body.push(
          `<path d="M ${fmt(slot.from.x)} ${fmt(slot.from.y)} L ${fmt(slot.to.x)} ${fmt(slot.to.y)}" fill="none" stroke="${info.color}" stroke-width="${fmt(dia)}" stroke-linecap="round"/>`,
        );
      }
    }

    if (warnings.size > 0) {
      defs.push(
        `<desc data-layer-warnings="${escapeXml(info.id)}">${escapeXml([...warnings].slice(0, 5).join(' | '))}</desc>`,
      );
    }
    groups.push(
      `<g data-layer-id="${escapeXml(info.id)}" data-layer-name="${escapeXml(info.name)}" data-kind="${info.kind}" fill="${info.color}"${
        info.defaultVisible ? '' : ' display="none"'
      }>${body.join('')}</g>`,
    );
  });

  const margin = Math.max(all.maxX - all.minX, all.maxY - all.minY) * 0.02;
  const width = all.maxX - all.minX + 2 * margin;
  const height = all.maxY - all.minY + 2 * margin;
  const viewBox = `${fmt(all.minX - margin)} ${fmt(-all.maxY - margin)} ${fmt(width)} ${fmt(height)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-units="${units}" width="100%" height="100%" style="--bg:${background}">`,
    `<style>.cut{fill:var(--bg);stroke:var(--bg);}</style>`,
    defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '',
    `<g id="panzoom"><g id="yflip" transform="scale(1,-1)">${groups.join('')}</g></g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('');
}
