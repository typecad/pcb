import { rotatePoint } from './geometry.js';
import type {
  Aperture,
  ApertureHole,
  ApertureTemplate,
  EvaluatedAperture,
  MacroPrimitive,
  Point,
  StandardTemplate,
} from './types.js';

export interface MacroDefinition {
  name: string;
  body: string[];
}

/** Parse the template part of an %AD command, e.g. "C,0.5X0.25" or "DONUT,2X1". */
export function parseApertureTemplate(spec: string): ApertureTemplate | null {
  const comma = spec.indexOf(',');
  const name = (comma === -1 ? spec : spec.slice(0, comma)).trim();
  if (!name) return null;
  const mods = (comma === -1 ? '' : spec.slice(comma + 1)).split('X').map((m) => parseFloat(m));
  const num = (i: number, dflt = 0): number => (Number.isFinite(mods[i]) ? mods[i]! : dflt);
  const hole = (i: number): ApertureHole | null =>
    Number.isFinite(mods[i]) && mods[i]! > 0 ? { diameter: mods[i]! } : null;

  switch (name) {
    case 'C':
      return { kind: 'circle', diameter: num(0), hole: hole(1) };
    case 'R':
      return { kind: 'rect', width: num(0), height: num(1), hole: hole(2) };
    case 'O':
      return { kind: 'obround', width: num(0), height: num(1), hole: hole(2) };
    case 'P':
      return {
        kind: 'polygon',
        outerDiameter: num(0),
        vertices: Math.max(3, Math.round(num(1, 3))),
        rotation: num(2),
        hole: hole(3),
      };
    default:
      // macro aperture: %ADD10<MacroName>,mod1Xmod2*%
      return { kind: 'macro', name, modifiers: mods.filter((m) => Number.isFinite(m)) };
  }
}

/**
 * Tiny recursive-descent evaluator for aperture-macro expressions:
 * numbers, $variables, + - x X * / and parentheses.
 */
export function evalExpression(
  src: string,
  vars: Map<string, number>,
  warnings: string[],
  macroName: string,
): number | null {
  const s = src.replace(/\s+/g, '');
  let pos = 0;
  let failed = false;

  function factor(): number {
    const c = s[pos];
    if (c === '-') {
      pos++;
      return -factor();
    }
    if (c === '+') {
      pos++;
      return factor();
    }
    if (c === '(') {
      pos++;
      const v = expr();
      if (s[pos] === ')') pos++;
      else failed = true;
      return v;
    }
    if (c === '$') {
      pos++;
      let name = '';
      while (pos < s.length && /[0-9a-zA-Z_.]/.test(s[pos]!)) name += s[pos++]!;
      const value = vars.get(name);
      if (value === undefined) {
        failed = true;
        return NaN;
      }
      return value;
    }
    const start = pos;
    while (pos < s.length && /[0-9.]/.test(s[pos]!)) pos++;
    if (pos === start) {
      failed = true;
      return NaN;
    }
    return parseFloat(s.slice(start, pos));
  }
  function term(): number {
    let v = factor();
    while (pos < s.length && 'xX*/'.includes(s[pos]!)) {
      const op = s[pos++]!;
      const r = factor();
      v = op === '/' ? v / r : v * r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++]!;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const value = expr();
  if (failed || pos !== s.length || !Number.isFinite(value)) {
    warnings.push(`macro "${macroName}": could not evaluate expression "${src.trim()}"`);
    return null;
  }
  return value;
}

/** Evaluate an aperture macro body into concrete primitives (macro-local frame). */
export function evaluateMacro(
  macro: MacroDefinition,
  modifiers: number[],
): { primitives: MacroPrimitive[]; warnings: string[] } {
  const vars = new Map<string, number>();
  modifiers.forEach((m, i) => vars.set(String(i + 1), m));
  const warnings: string[] = [];
  const primitives: MacroPrimitive[] = [];

  for (const line of macro.body) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('$')) {
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        warnings.push(`macro "${macro.name}": malformed assignment "${trimmed}"`);
        continue;
      }
      const target = trimmed.slice(0, eq).trim().replace(/^\$/, '');
      const value = evalExpression(trimmed.slice(eq + 1), vars, warnings, macro.name);
      if (value !== null) vars.set(target, value);
      continue;
    }

    const parts = trimmed.split(',');
    const code = parseInt(parts[0]!, 10);
    if (!Number.isFinite(code)) {
      warnings.push(`macro "${macro.name}": skipped malformed primitive "${trimmed}"`);
      continue;
    }
    const mods = parts.slice(1).map((p) => evalExpression(p, vars, warnings, macro.name));
    if (mods.some((m) => m === null)) continue;
    const m = mods as number[];
    const on = m[0] !== 0;

    switch (code) {
      case 1: // circle: exposure, dia, cx, cy
        primitives.push({
          kind: 'circle',
          exposure: on,
          diameter: m[1] ?? 0,
          center: { x: m[2] ?? 0, y: m[3] ?? 0 },
        });
        break;
      case 2:
      case 20: // vector line: exposure, width, x1, y1, x2, y2, rot
        primitives.push({
          kind: 'vectorLine',
          exposure: on,
          width: m[1] ?? 0,
          from: { x: m[2] ?? 0, y: m[3] ?? 0 },
          to: { x: m[4] ?? 0, y: m[5] ?? 0 },
          rotation: m[6] ?? 0,
        });
        break;
      case 21: // center line: exposure, width, height, cx, cy, rot
        primitives.push({
          kind: 'centerLine',
          exposure: on,
          width: m[1] ?? 0,
          height: m[2] ?? 0,
          center: { x: m[3] ?? 0, y: m[4] ?? 0 },
          rotation: m[5] ?? 0,
        });
        break;
      case 4: {
        // outline: exposure, #vertices, x1..xn, y1..yn, rot
        const count = Math.max(0, Math.round(m[1] ?? 0));
        const points: Point[] = [];
        for (let i = 0; i < count; i++) {
          points.push({ x: m[2 + 2 * i] ?? 0, y: m[3 + 2 * i] ?? 0 });
        }
        primitives.push({
          kind: 'outline',
          exposure: on,
          points,
          rotation: m[2 + 2 * count] ?? 0,
        });
        break;
      }
      case 5: // polygon: exposure, vertices, cx, cy, dia, rot
        primitives.push({
          kind: 'polygon',
          exposure: on,
          vertices: Math.max(3, Math.round(m[1] ?? 3)),
          center: { x: m[2] ?? 0, y: m[3] ?? 0 },
          outerDiameter: m[4] ?? 0,
          rotation: m[5] ?? 0,
        });
        break;
      case 6:
      case 7:
        warnings.push(
          `macro "${macro.name}": primitive ${code === 6 ? '6 (moiré)' : '7 (thermal)'} is not supported and was skipped`,
        );
        break;
      default:
        warnings.push(`macro "${macro.name}": unknown primitive code ${code} skipped`);
    }
  }

  return { primitives, warnings };
}

function standardExtent(t: StandardTemplate): { rx: number; ry: number } {
  switch (t.kind) {
    case 'circle':
      return { rx: t.diameter / 2, ry: t.diameter / 2 };
    case 'rect':
    case 'obround':
      return { rx: t.width / 2, ry: t.height / 2 };
    case 'polygon':
      return { rx: t.outerDiameter / 2, ry: t.outerDiameter / 2 };
  }
}

function primitiveExtent(p: MacroPrimitive): { rx: number; ry: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const addPoint = (pt: Point, pad = 0) => {
    minX = Math.min(minX, pt.x - pad);
    minY = Math.min(minY, pt.y - pad);
    maxX = Math.max(maxX, pt.x + pad);
    maxY = Math.max(maxY, pt.y + pad);
  };
  switch (p.kind) {
    case 'circle':
      addPoint(p.center, p.diameter / 2);
      break;
    case 'vectorLine': {
      // the swept rectangle: endpoints plus width/2 in every direction
      const a = rotatePoint(p.from, p.rotation);
      const b = rotatePoint(p.to, p.rotation);
      addPoint(a, p.width / 2);
      addPoint(b, p.width / 2);
      break;
    }
    case 'centerLine': {
      const rad = (p.rotation * Math.PI) / 180;
      const ex = (Math.abs(Math.cos(rad)) * p.width + Math.abs(Math.sin(rad)) * p.height) / 2;
      const ey = (Math.abs(Math.sin(rad)) * p.width + Math.abs(Math.cos(rad)) * p.height) / 2;
      addPoint({ x: p.center.x - ex, y: p.center.y - ey });
      addPoint({ x: p.center.x + ex, y: p.center.y + ey });
      break;
    }
    case 'outline':
      for (const pt of p.points) addPoint(rotatePoint(pt, p.rotation));
      break;
    case 'polygon':
      addPoint(p.center, p.outerDiameter / 2);
      break;
  }
  return { rx: (maxX - minX) / 2, ry: (maxY - minY) / 2 };
}

/** Resolve an aperture into renderable shapes + a bounding half-extent. */
export function evaluateAperture(aperture: Aperture, macros: Map<string, MacroDefinition>): EvaluatedAperture {
  const t = aperture.template;
  if (t.kind !== 'macro') {
    return { template: t, primitives: [], extent: standardExtent(t), warnings: [] };
  }
  const macro = macros.get(t.name);
  if (!macro) {
    return {
      template: null,
      primitives: [],
      extent: { rx: 0, ry: 0 },
      warnings: [`macro "${t.name}" (aperture D${aperture.code}) is referenced but never defined`],
    };
  }
  const { primitives, warnings } = evaluateMacro(macro, t.modifiers);
  let rx = 0;
  let ry = 0;
  for (const p of primitives) {
    rx = Math.max(rx, primitiveExtent(p).rx);
    ry = Math.max(ry, primitiveExtent(p).ry);
  }
  return { template: null, primitives, extent: { rx, ry }, warnings };
}
