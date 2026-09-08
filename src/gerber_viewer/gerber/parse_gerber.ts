import { parseApertureTemplate } from './apertures.js';
import { dist, signedSweep } from './geometry.js';
import type { DrawOp, FormatSpec, GerberImage, PathSegment, Point, Polarity, RegionContour } from './types.js';

export interface ParseGerberOptions {
  /** Display name used in warnings (defaults to "gerber"). */
  name?: string;
}

/**
 * Parse a fixed-point Gerber coordinate token ("035000", "-5", "1.5").
 * Decimal points are tolerated even though RS-274X does not use them.
 */
export function parseCoordinate(raw: string, format: FormatSpec): number {
  if (raw.includes('.')) return parseFloat(raw);
  const negative = raw.startsWith('-');
  let digits = raw.replace(/^[+-]/, '');
  const total = format.integerDigits + format.decimalDigits;
  if (format.zeroMode === 'T' && digits.length < total) {
    // trailing zeros omitted: the digits present are the most significant ones
    digits = digits.padEnd(total, '0');
  }
  const value = parseInt(digits || '0', 10) / Math.pow(10, format.decimalDigits);
  return negative ? -value : value;
}

interface PendingCoords {
  x?: number;
  y?: number;
  i?: number;
  j?: number;
}

/**
 * Resolve I/J offsets into an arc segment. Multi-quadrant (G75) uses signed
 * offsets directly; single-quadrant (G74) offsets are unsigned magnitudes and
 * the correct center is picked from the four sign combinations.
 */
function resolveArc(
  from: Point,
  to: Point,
  i: number,
  j: number,
  ccw: boolean,
  quadrant: 'single' | 'multi',
  warnings: string[],
): PathSegment {
  const makeArc = (center: Point): PathSegment => ({ kind: 'arc', to, center, ccw });
  const radiusTolerance = (r: number) => 0.0001 + r * 0.001;

  if (quadrant === 'multi') {
    const center = { x: from.x + i, y: from.y + j };
    const r1 = dist(from, center);
    if (r1 < 1e-9) {
      warnings.push(`arc with zero radius at (${from.x}, ${from.y}) drawn as a line`);
      return { kind: 'line', to };
    }
    const r2 = dist(to, center);
    if (Math.abs(r1 - r2) > radiusTolerance(r1)) {
      warnings.push(
        `arc radii mismatch (start ${r1.toFixed(4)} vs end ${r2.toFixed(4)}); rendered with the start radius`,
      );
    }
    return makeArc(center);
  }

  // single quadrant: try all sign combinations, keep arcs <= 90 degrees
  let best: { center: Point; sweep: number } | null = null;
  for (const si of [1, -1]) {
    for (const sj of [1, -1]) {
      const center = { x: from.x + si * i, y: from.y + sj * j };
      const r1 = dist(from, center);
      const r2 = dist(to, center);
      if (r1 < 1e-9 || Math.abs(r1 - r2) > radiusTolerance(r1)) continue;
      const sweep = Math.abs(signedSweep(from, to, center, ccw));
      if (sweep > Math.PI / 2 + 1e-6) continue;
      if (!best || sweep < best.sweep) best = { center, sweep };
    }
  }
  if (!best) {
    warnings.push(`single-quadrant arc at (${from.x}, ${from.y}) has no valid center; assumed (+I, +J)`);
    return makeArc({ x: from.x + i, y: from.y + j });
  }
  return makeArc(best.center);
}

/** Parse an RS-274X (extended Gerber) document into a GerberImage. */
export function parseGerber(source: string, options: ParseGerberOptions = {}): GerberImage {
  const image: GerberImage = {
    sourceName: options.name ?? 'gerber',
    units: 'in',
    format: { zeroMode: 'L', notation: 'A', integerDigits: 3, decimalDigits: 6 },
    apertures: new Map(),
    macros: new Map(),
    ops: [],
    attributes: {},
    warnings: [],
  };
  const warnings = image.warnings;

  let interpolation: 'linear' | 'cw' | 'ccw' = 'linear';
  let arcQuadrant: 'single' | 'multi' | null = null;
  let aperture: number | null = null;
  let point: Point = { x: 0, y: 0 };
  let polarity: Polarity = 'dark';
  let sawFormatSpec = false;
  let ended = false;

  let inRegion = false;
  let contours: RegionContour[] = [];
  let contour: RegionContour | null = null;
  let trace: Extract<DrawOp, { type: 'trace' }> | null = null;
  // X2 object attributes (%TO.N/%TO.C/%TO.P) apply to subsequent objects
  // until %TD clears them; they ride on the ops for net/component tooling.
  let objAttrs: { net?: string; ref?: string; pin?: string } = {};
  let regionNet: string | undefined;

  const finishTrace = () => {
    if (trace && trace.segments.length > 0) image.ops.push(trace);
    trace = null;
  };
  const finishContour = () => {
    if (contour && contour.segments.length > 0) contours.push(contour);
    contour = null;
  };
  const finishRegion = () => {
    finishContour();
    if (contours.length > 0) {
      image.ops.push({ type: 'region', polarity, contours, net: regionNet });
    }
    contours = [];
  };

  function buildSegment(from: Point, to: Point, next: PendingCoords): PathSegment | null {
    if (interpolation === 'linear') return { kind: 'line', to };
    if (next.i === undefined && next.j === undefined) {
      warnings.push('arc command without I/J offsets drawn as a line');
      return { kind: 'line', to };
    }
    const quadrant = arcQuadrant ?? 'multi';
    if (!arcQuadrant) {
      warnings.push('arc quadrant mode (G74/G75) not specified; assuming multi-quadrant');
    }
    return resolveArc(from, to, next.i ?? 0, next.j ?? 0, interpolation === 'ccw', quadrant, warnings);
  }

  function handleExtended(body: string): void {
    if (body.startsWith('AM')) {
      const star = body.indexOf('*');
      const name = star === -1 ? body.slice(2) : body.slice(2, star);
      const macroBody = (star === -1 ? '' : body.slice(star + 1))
        .split('*')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      image.macros.set(name, { name, body: macroBody });
      return;
    }
    for (const word of body.split('*')) {
      if (!word || ended) continue;
      const wordMatch = /^([A-Z]{2})\.?(.*)$/.exec(word);
      if (!wordMatch) continue;
      const code = wordMatch[1]!;
      const rest = wordMatch[2]!;
      switch (code) {
        case 'FS': {
          const m = /^([LT])([AI])X(\d)(\d)Y(\d)(\d)/.exec(rest);
          if (m) {
            image.format = {
              zeroMode: m[1]! as 'L' | 'T',
              notation: m[2]! as 'A' | 'I',
              integerDigits: parseInt(m[3]!, 10),
              decimalDigits: parseInt(m[4]!, 10),
            };
            if (m[4] !== m[6]) {
              warnings.push(`X/Y decimal digit mismatch in "%${word}*" (using X digits)`);
            }
            if (image.format.notation === 'I') {
              warnings.push('incremental coordinates (%FS..I) are not supported');
              image.format.notation = 'A';
            }
            sawFormatSpec = true;
          } else {
            warnings.push(`malformed format spec "%${word}*" ignored`);
          }
          break;
        }
        case 'MO':
          if (rest === 'MM') image.units = 'mm';
          else if (rest === 'IN') image.units = 'in';
          else warnings.push(`unknown units "%${word}*" ignored`);
          break;
        case 'AD': {
          const m = /^D(\d+)(.*)$/.exec(rest);
          if (!m) {
            warnings.push(`malformed aperture definition "%${word}*" ignored`);
            break;
          }
          const template = parseApertureTemplate(m[2]!.trim());
          if (template) image.apertures.set(parseInt(m[1]!, 10), { code: parseInt(m[1]!, 10), template });
          else warnings.push(`unparseable aperture template in "%${word}*"`);
          break;
        }
        case 'LP':
          finishTrace(); // a trace must not straddle a polarity change
          polarity = rest.startsWith('C') ? 'clear' : 'dark';
          break;
        case 'TF': {
          const fields = rest.split(',');
          if (fields[0] === 'FileFunction') image.attributes.fileFunction = fields.slice(1).join(',');
          else if (fields[0] === 'FilePolarity') image.attributes.filePolarity = fields.slice(1).join(',');
          else if (fields[0] === 'Part') image.attributes.part = fields.slice(1).join(',');
          break;
        }
        case 'SR':
          if (rest.trim() !== '') {
            warnings.push('step-and-repeat (%SR) is not supported; repeated content renders once');
          }
          break;
        case 'AB':
          if (rest.trim() !== '') {
            warnings.push('aperture blocks (%AB) are not supported; block content renders inline');
          }
          break;
        case 'LM':
        case 'LR':
        case 'LS':
          warnings.push(`layer transform "%${word}*" is not supported and was ignored`);
          break;
        case 'IP':
          if (rest === 'NEG') warnings.push('negative image polarity (%IPNEG) is not supported');
          break;
        case 'TO': {
          // %TO.N,<net> / %TO.C,<ref> / %TO.P,<ref>,<pin> — strip any quoting
          const fields = rest.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));
          const kind = fields[0];
          if (kind === 'N' && fields[1]) objAttrs.net = fields[1];
          else if (kind === 'C' && fields[1]) objAttrs.ref = fields[1];
          else if (kind === 'P' && fields[1]) {
            objAttrs.ref = fields[1];
            if (fields[2]) objAttrs.pin = fields[2];
          }
          break;
        }
        case 'TD': {
          // %TD* clears everything; %TD.<kind> clears one attribute
          const kind = rest.replace('.', '').trim();
          if (!kind) objAttrs = {};
          else if (kind === 'N') delete objAttrs.net;
          else if (kind === 'C') delete objAttrs.ref;
          else if (kind === 'P') {
            delete objAttrs.ref;
            delete objAttrs.pin;
          }
          break;
        }
        default:
          // IN/LN names and TA/TD/TO/TH object attributes: safe to ignore
          if (/^[A-Z][A-Z0-9]/.test(code) && !['IN', 'LN', 'TA', 'TD', 'TO', 'TH', 'OF'].includes(code)) {
            warnings.push(`extended command "%${word}*" ignored`);
          }
          break;
      }
    }
  }

  function handleDataBlock(block: string): void {
    if (!block || ended) return;
    if (block === 'M02' || block === 'M00' || block === 'M01') {
      ended = true;
      return;
    }
    if (block.startsWith('G04') || block.startsWith('G4')) return; // comment

    const tokens = block.match(/G\d+|D\d+|[XYIJ][+-]?[0-9.]+/g);
    if (!tokens) {
      if (/^[A-Za-z]/.test(block)) warnings.push(`unrecognized block "${block}" ignored`);
      return;
    }

    let next: PendingCoords = {};
    for (const token of tokens) {
      if (ended) return;
      const lead = token[0]!;
      if (lead === 'G') {
        const g = parseInt(token.slice(1), 10);
        switch (g) {
          case 1:
            interpolation = 'linear';
            break;
          case 2:
            interpolation = 'cw';
            break;
          case 3:
            interpolation = 'ccw';
            break;
          case 36:
            finishTrace();
            inRegion = true;
            contours = [];
            contour = null;
            regionNet = objAttrs.net;
            break;
          case 37:
            if (inRegion) {
              finishRegion();
              inRegion = false;
            } else {
              warnings.push('G37 (region end) without a matching G36 ignored');
            }
            break;
          case 74:
            arcQuadrant = 'single';
            break;
          case 75:
            arcQuadrant = 'multi';
            break;
          case 54:
          case 55:
            break; // deprecated aperture-select prefix
          case 70:
            image.units = 'in';
            break;
          case 71:
            image.units = 'mm';
            break;
          case 90:
            break; // absolute already assumed
          case 91:
            warnings.push('incremental coordinates (G91) are not supported');
            break;
          default:
            warnings.push(`unsupported code ${token} ignored`);
        }
        continue;
      }
      if (lead === 'D') {
        const d = parseInt(token.slice(1), 10);
        if (d === 1 || d === 2 || d === 3) {
          if (!sawFormatSpec) {
            warnings.push('no %FS format spec found; assuming leading-zero-omitted 3.6');
            sawFormatSpec = true;
          }
          const target = { x: next.x ?? point.x, y: next.y ?? point.y };
          if (d === 2) {
            // move
            if (inRegion) finishContour();
            else finishTrace();
            point = target;
          } else if (d === 1) {
            // interpolate (draw)
            if (!inRegion) {
              if (!trace || trace.aperture !== aperture || trace.polarity !== polarity || trace.net !== objAttrs.net) {
                finishTrace();
                if (aperture === null) {
                  warnings.push(`interpolation at (${target.x}, ${target.y}) before any aperture was selected`);
                  point = target;
                  next = {};
                  continue;
                }
                trace = { type: 'trace', polarity, aperture, from: point, segments: [], net: objAttrs.net };
              }
            }
            const segment = buildSegment(point, target, next);
            if (segment) {
              if (inRegion) {
                if (!contour) contour = { start: point, segments: [] };
                contour.segments.push(segment);
              } else {
                trace!.segments.push(segment);
              }
            }
            point = target;
          } else {
            // flash
            finishTrace();
            if (aperture === null) {
              warnings.push(`flash at (${target.x}, ${target.y}) before any aperture was selected`);
            } else {
              image.ops.push({
                type: 'flash',
                polarity,
                aperture,
                at: target,
                net: objAttrs.net,
                ref: objAttrs.ref,
                pin: objAttrs.pin,
              });
            }
            point = target;
          }
          next = {};
        } else if (d >= 10) {
          aperture = d;
          if (!image.apertures.has(d)) {
            warnings.push(`aperture D${d} selected but never defined`);
          }
        } else {
          warnings.push(`unsupported code D${d} ignored`);
        }
        continue;
      }
      // coordinate letter
      const value = parseCoordinate(token.slice(1), image.format);
      if (lead === 'X') next.x = value;
      else if (lead === 'Y') next.y = value;
      else if (lead === 'I') next.i = value;
      else next.j = value;
    }
  }

  // Extended commands live between '%' markers; everything else is data blocks.
  const parts = source.split('%');
  for (let i = 0; i < parts.length && !ended; i++) {
    const part = parts[i]!.replace(/[\r\n]+/g, '');
    if (!part) continue;
    if (i % 2 === 1) handleExtended(part);
    else for (const block of part.split('*')) handleDataBlock(block.trim());
  }

  finishTrace();
  if (inRegion) {
    finishRegion();
    warnings.push('file ended while a region was still open');
  }
  if (!ended) warnings.push('file ended without M02');

  return image;
}
