// ---------------------------------------------------------------------------
// Image → board-geometry pipeline, part 3: SVG input. A dependency-free
// subset reader — the shapes artwork actually uses (path/rect/circle/
// ellipse/polygon/polyline with presentation attributes and transforms) —
// flattened into filled rings per ink color. Deliberately unsupported (and
// skipped with no error): strokes, text, images, use/symbol references,
// clip/mask, and CSS `<style>` blocks — logo SVGs from Inkscape/Figma carry
// plain attributes and still land. Subpaths of one shape nest even-odd
// (a donut is two circles in a path), matching how the raster tracer's
// holes are classified.
//
// Everything here is a pure function of the input text — deterministic.
// ---------------------------------------------------------------------------

import type { RingPt } from './contours.js';

export interface SvgShape {
  /** Resolved fill color (lowercase '#rrggbb'-ish, 'none'), or null when
   *  NO fill attribute existed on the chain — the implicit-fill artwork. */
  color: string | null;
  /** Closed subpaths in user units, viewBox-relative. */
  rings: RingPt[][];
}

export interface DecodedSvg {
  unitsWidth: number;
  unitsHeight: number;
  shapes: SvgShape[];
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function apply(m: Matrix, x: number, y: number): RingPt {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function parseTransform(value: string): Matrix {
  let m = IDENTITY;
  const calls = value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g);
  for (const [, name, rawArgs] of calls) {
    const args = rawArgs
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    let local: Matrix = IDENTITY;
    switch (name) {
      case 'matrix':
        if (args.length >= 6) local = { a: args[0]!, b: args[1]!, c: args[2]!, d: args[3]!, e: args[4]!, f: args[5]! };
        break;
      case 'translate':
        local = { ...IDENTITY, e: args[0] ?? 0, f: args[1] ?? 0 };
        break;
      case 'scale':
        {
          const sx = args[0] ?? 1;
          local = { a: sx, b: 0, c: 0, d: args[1] ?? sx, e: 0, f: 0 };
        }
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        local = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        if (args.length >= 3) {
          const cx = args[1]!;
          const cy = args[2]!;
          local = mul(mul({ ...IDENTITY, e: cx, f: cy }, local), { ...IDENTITY, e: -cx, f: -cy });
        }
        break;
      }
      case 'skewX':
        local = { a: 1, b: 0, c: Math.tan(((args[0] ?? 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      case 'skewY':
        local = { a: 1, b: Math.tan(((args[0] ?? 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
    }
    m = mul(m, local);
  }
  return m;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

interface Frame {
  fill: string | null; // null = not specified on the chain (implicit)
  opacity: number; // accumulated product
  transform: Matrix;
  skip: boolean; // inside defs/clipPath/…
}

const SKIP_TAGS = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'pattern',
  'marker',
  'style',
  'title',
  'desc',
  'metadata',
  'text',
  'tspan',
  'image',
  'use',
  'foreignobject',
  'lineargradient',
  'radialgradient',
]);

/** Sample counts: fixed subdivisions keep output deterministic. */
const CUBIC_STEPS = 12;
const QUAD_STEPS = 8;
const ARC_STEP = Math.PI / 12; // 15°

/** Walk path data, appending closed rings (transformed) to `rings`. */
function flattenPath(data: string, m: Matrix, rings: RingPt[][]): void {
  const tokens: Array<string | number> = [];
  const numRe = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  const cmdRe = /[MmLlHhVvCcSsQqTtAaZz]/y;
  let i = 0;
  while (i < data.length) {
    const ch = data[i]!;
    if (/\s|,/.test(ch)) {
      i++;
      continue;
    }
    cmdRe.lastIndex = i;
    const cmd = cmdRe.exec(data);
    if (cmd) {
      tokens.push(cmd[0]);
      i += cmd[0].length;
      continue;
    }
    numRe.lastIndex = i;
    const num = numRe.exec(data);
    if (num && num.index === i) {
      tokens.push(parseFloat(num[0]));
      i = numRe.lastIndex;
      continue;
    }
    i++; // unknown character — skip
  }

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevC2: RingPt | null = null;
  let prevQ1: RingPt | null = null;
  let prevCmd = '';
  let ring: RingPt[] | null = null;

  const startRing = (x: number, y: number): void => {
    ring = [apply(m, x, y)];
    rings.push(ring);
  };
  const lineTo = (x: number, y: number): void => {
    if (!ring) startRing(cx, cy);
    ring!.push(apply(m, x, y));
  };

  let ti = 0;
  const nextNum = (): number => tokens[ti++] as number;
  const moreNums = (): boolean => typeof tokens[ti] === 'number';

  while (ti < tokens.length) {
    let cmd = tokens[ti++];
    if (typeof cmd === 'number') {
      // implicit repeat: M continues as L, m as l, others as themselves
      if (prevCmd === 'M') cmd = 'L';
      else if (prevCmd === 'm') cmd = 'l';
      else cmd = prevCmd;
      ti--;
    }
    cmd = cmd as string;
    prevCmd = cmd;
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    switch (c) {
      case 'M': {
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        sx = x;
        sy = y;
        prevC2 = prevQ1 = null;
        ring = null;
        startRing(cx, cy);
        break;
      }
      case 'L': {
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x += cx;
          y += cy;
        }
        lineTo(x, y);
        cx = x;
        cy = y;
        prevC2 = prevQ1 = null;
        break;
      }
      case 'H': {
        let x = nextNum();
        if (rel) x += cx;
        lineTo(x, cy);
        cx = x;
        prevC2 = prevQ1 = null;
        break;
      }
      case 'V': {
        let y = nextNum();
        if (rel) y += cy;
        lineTo(cx, y);
        cy = y;
        prevC2 = prevQ1 = null;
        break;
      }
      case 'C': {
        let x1 = nextNum();
        let y1 = nextNum();
        let x2 = nextNum();
        let y2 = nextNum();
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy;
        }
        for (let s = 1; s <= CUBIC_STEPS; s++) {
          const t = s / CUBIC_STEPS;
          const u = 1 - t;
          lineTo(
            u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          );
        }
        prevC2 = { x: x2, y: y2 };
        prevQ1 = null;
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        const c1: RingPt = prevC2 ? { x: 2 * cx - prevC2.x, y: 2 * cy - prevC2.y } : { x: cx, y: cy };
        let x2 = nextNum();
        let y2 = nextNum();
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x2 += cx; y2 += cy; x += cx; y += cy;
        }
        for (let s = 1; s <= CUBIC_STEPS; s++) {
          const t = s / CUBIC_STEPS;
          const u = 1 - t;
          lineTo(
            u * u * u * cx + 3 * u * u * t * c1.x + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cy + 3 * u * u * t * c1.y + 3 * u * t * t * y2 + t * t * t * y,
          );
        }
        prevC2 = { x: x2, y: y2 };
        prevQ1 = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        let x1 = nextNum();
        let y1 = nextNum();
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x1 += cx; y1 += cy; x += cx; y += cy;
        }
        for (let s = 1; s <= QUAD_STEPS; s++) {
          const t = s / QUAD_STEPS;
          const u = 1 - t;
          lineTo(u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y);
        }
        prevQ1 = { x: x1, y: y1 };
        prevC2 = null;
        cx = x;
        cy = y;
        break;
      }
      case 'T': {
        const x1: RingPt = prevQ1 ? { x: 2 * cx - prevQ1.x, y: 2 * cy - prevQ1.y } : { x: cx, y: cy };
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x += cx;
          y += cy;
        }
        for (let s = 1; s <= QUAD_STEPS; s++) {
          const t = s / QUAD_STEPS;
          const u = 1 - t;
          lineTo(u * u * cx + 2 * u * t * x1.x + t * t * x, u * u * cy + 2 * u * t * x1.y + t * t * y);
        }
        prevQ1 = x1;
        prevC2 = null;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const r1 = nextNum();
        const r2 = nextNum();
        const rot = nextNum();
        const large = nextNum();
        const sweep = nextNum();
        let x = nextNum();
        let y = nextNum();
        if (rel) {
          x += cx;
          y += cy;
        }
        flattenArc(cx, cy, r1, r2, rot, large, sweep, x, y, lineTo);
        prevC2 = prevQ1 = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        // closed: keep what's there (the closure-assigned `ring` needs an
        // explicit type here — TS's flow analysis can't see startRing's write)
        const current = ring as RingPt[] | null;
        if (current !== null && current.length >= 3) ring = null;
        cx = sx;
        cy = sy;
        prevC2 = prevQ1 = null;
        break;
      }
      default:
        // unknown command — bail out rather than mis-parsing the rest
        ti = tokens.length;
        break;
    }
  }
  // drop unfinished scraps
  for (let r = rings.length - 1; r >= 0; r--) {
    if (rings[r] && rings[r]!.length < 4) rings.splice(r, 1);
  }
}

/** W3C SVG appendix F.6: endpoint → center parameterization, sampled. */
function flattenArc(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotDeg: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number,
  lineTo: (x: number, y: number) => void,
): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    lineTo(x2, y2);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den)) * (large !== sweep ? 1 : -1);
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(dTheta) / ARC_STEP));
  for (let s = 1; s <= steps; s++) {
    const t = theta1 + (dTheta * s) / steps;
    lineTo(ccx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, ccy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos);
  }
}

function parsePoints(value: string): RingPt[] {
  const nums = value.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  const pts: RingPt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
  return pts;
}

function ellipseRing(cx: number, cy: number, rx: number, ry: number, m: Matrix, steps = 24): RingPt[] {
  const pts: RingPt[] = [];
  for (let s = 0; s < steps; s++) {
    const t = (2 * Math.PI * s) / steps;
    pts.push(apply(m, cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
  }
  return pts;
}

const UNIT_RE = /^([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/;

function parseLength(value: string | undefined): number | null {
  if (!value) return null;
  const m = UNIT_RE.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function attrOf(attrs: Record<string, string>, style: Record<string, string>, name: string): string | null {
  if (style[name] !== undefined) return style[name];
  if (attrs[name] !== undefined) return attrs[name];
  return null;
}

export function decodeSvg(text: string): DecodedSvg {
  // strip comments
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');

  let unitsWidth = 0;
  let unitsHeight = 0;
  let vbMinX = 0;
  let vbMinY = 0;
  const shapes: SvgShape[] = [];
  const stack: Frame[] = [{ fill: null, opacity: 1, transform: IDENTITY, skip: false }];

  const frameFor = (tag: string, attrs: Record<string, string>, parent: Frame): Frame => {
    const style: Record<string, string> = {};
    for (const decl of (attrs.style ?? '').split(';')) {
      const idx = decl.indexOf(':');
      if (idx > 0) style[decl.slice(0, idx).trim().toLowerCase()] = decl.slice(idx + 1).trim().toLowerCase();
    }
    // SVG fill inherits: an element without its own fill takes the nearest
    // ancestor's — null only when NO element on the chain specified one,
    // which is the implicit-fill-is-the-artwork case. Inherited values are
    // already normalized; only the element's own needs it.
    const ownFill = attrOf(attrs, style, 'fill');
    let fill = parent.fill;
    if (ownFill !== null) {
      fill = ownFill.trim().toLowerCase();
      if (fill === 'transparent') fill = 'none';
      if (!/^#[0-9a-f]{3,8}$|^rgb\(/.test(fill) && fill !== 'none' && !NAMED.has(fill)) fill = 'none';
    }
    const opacity =
      parent.opacity *
      (parseFloat(style['opacity'] ?? attrs['opacity'] ?? '1') || 0) *
      (parseFloat(style['fill-opacity'] ?? attrs['fill-opacity'] ?? '1') || 0);
    return {
      fill,
      opacity,
      transform: mul(parent.transform, attrs.transform ? parseTransform(attrs.transform) : IDENTITY),
      skip: parent.skip || SKIP_TAGS.has(tag),
    };
  };

  // tag walk
  let i = 0;
  while (i < clean.length) {
    const lt = clean.indexOf('<', i);
    if (lt === -1) break;
    if (clean.startsWith('<?', lt) || clean.startsWith('<!', lt)) {
      const end = clean.indexOf('>', lt);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    // scan the tag body respecting quotes ('>' may sit inside a quoted value)
    let j = lt + 1;
    let quote: string | null = null;
    while (j < clean.length) {
      const ch = clean[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    if (j >= clean.length) break;
    const body = clean.slice(lt + 1, j);
    i = j + 1;

    const closing = body.startsWith('/');
    const selfClosing = body.endsWith('/');
    const inner = closing ? body.slice(1) : selfClosing ? body.slice(0, -1) : body;
    const nameMatch = /^([A-Za-z_][\w:.-]*)/.exec(inner);
    if (!nameMatch) continue;
    const tag = nameMatch[1]!.toLowerCase();

    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // attributes
    const attrs: Record<string, string> = {};
    const attrRe = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let am: RegExpExecArray | null;
    const attrText = inner.slice(nameMatch[0].length);
    while ((am = attrRe.exec(attrText)) !== null) {
      attrs[am[1]!.toLowerCase()] = decodeEntities(am[3] ?? am[4] ?? am[5] ?? '');
    }

    const parent = stack[stack.length - 1]!;
    const frame = frameFor(tag, attrs, parent);

    if (tag === 'svg' && stack.length === 1) {
      // attribute keys are lowercased at parse; SVG's viewBox is the one
      // camelCase attribute the reader needs
      const vb = (attrs['viewbox'] ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      if (vb.length === 4 && vb.every((n) => Number.isFinite(n))) {
        vbMinX = vb[0]!;
        vbMinY = vb[1]!;
        unitsWidth = Math.abs(vb[2]!);
        unitsHeight = Math.abs(vb[3]!);
      } else {
        const w = parseLength(attrs.width);
        const h = parseLength(attrs.height);
        if (w && h) {
          unitsWidth = w;
          unitsHeight = h;
        }
      }
    }

    stack.push(frame);
    if (frame.skip || frame.opacity < 0.5) {
      if (!selfClosing) stack[stack.length - 1] = { ...frame, skip: true };
      else stack.pop();
      continue;
    }

    const fill = frame.fill;
    // rings store viewBox-relative coordinates (viewBox min subtracted), so
    // the placed box maps 0..unitsWidth regardless of a non-zero origin
    const rel = (rings: RingPt[]): RingPt[] =>
      rings.map((p) => ({ x: p.x - vbMinX, y: p.y - vbMinY }));
    const emit = (rings: RingPt[]): void => {
      if (rings.length >= 3) shapes.push({ color: fill, rings: [rel(rings)] });
    };
    const emitAll = (rings: RingPt[][]): void => {
      const kept = rings.filter((r) => r.length >= 3);
      if (kept.length > 0) shapes.push({ color: fill, rings: kept.map(rel) });
    };

    switch (tag) {
      case 'path': {
        const d = attrs.d;
        if (d) {
          const rings: RingPt[][] = [];
          flattenPath(d, frame.transform, rings);
          emitAll(rings);
        }
        break;
      }
      case 'rect': {
        const x = parseLength(attrs.x) ?? 0;
        const y = parseLength(attrs.y) ?? 0;
        const w = parseLength(attrs.width);
        const h = parseLength(attrs.height);
        if (w && h && w > 0 && h > 0) {
          let rx = parseLength(attrs.rx);
          let ry = parseLength(attrs.ry);
          if (rx === null && ry === null) {
            rx = ry = 0;
          } else {
            if (rx === null) rx = ry;
            if (ry === null) ry = rx;
            rx = Math.min(rx!, w / 2);
            ry = Math.min(ry!, h / 2);
          }
          const m = frame.transform;
          if (rx > 0 || ry > 0) {
            // ring order: top edge → TR corner → right edge → BR corner →
            // bottom edge → BL corner → left edge → TL corner. Each edge's
            // chord is one explicit vertex pair (exact straight line); each
            // corner is the short clockwise arc between its edge endpoints
            // (sweep=1 in y-down screen coords, verified per-corner).
            const ring: RingPt[] = [];
            const corner = (sx: number, sy: number, ex: number, ey: number): void => {
              ring.push(apply(m, sx, sy));
              flattenArc(sx, sy, rx, ry, 0, 0, 1, ex, ey, (px, py) => ring.push(apply(m, px, py)));
            };
            ring.push(apply(m, x + rx, y)); // top edge start
            corner(x + w - rx, y, x + w, y + ry); // TR
            ring.push(apply(m, x + w, y + h - ry)); // right edge
            corner(x + w, y + h - ry, x + w - rx, y + h); // BR
            ring.push(apply(m, x + rx, y + h)); // bottom edge
            corner(x + rx, y + h, x, y + h - ry); // BL
            ring.push(apply(m, x, y + ry)); // left edge
            corner(x, y + ry, x + rx, y); // TL
            emit(ring);
          } else {
            emit([
              apply(m, x, y),
              apply(m, x + w, y),
              apply(m, x + w, y + h),
              apply(m, x, y + h),
            ]);
          }
        }
        break;
      }
      case 'circle':
        emit(
          ellipseRing(
            parseLength(attrs.cx) ?? 0,
            parseLength(attrs.cy) ?? 0,
            parseLength(attrs.r) ?? 0,
            parseLength(attrs.r) ?? 0,
            frame.transform,
          ),
        );
        break;
      case 'ellipse':
        emit(
          ellipseRing(
            parseLength(attrs.cx) ?? 0,
            parseLength(attrs.cy) ?? 0,
            parseLength(attrs.rx) ?? 0,
            parseLength(attrs.ry) ?? 0,
            frame.transform,
          ),
        );
        break;
      case 'polygon':
      case 'polyline': {
        const pts = parsePoints(attrs.points ?? '');
        if (pts.length >= 3) emit(pts.map((p) => apply(frame.transform, p.x, p.y)));
        break;
      }
      default:
        break;
    }

    if (selfClosing) stack.pop();
  }

  if (!unitsWidth || !unitsHeight) {
    throw new Error('SVG has no viewBox or width/height — the artwork cannot be scaled to the board');
  }

  return { unitsWidth, unitsHeight, shapes };
}

const NAMED = new Set([
  'black', 'white', 'red', 'lime', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'grey', 'silver', 'maroon', 'navy', 'olive', 'purple', 'teal',
  'orange', 'gold',
]);
