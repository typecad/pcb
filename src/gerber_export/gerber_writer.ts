// ---------------------------------------------------------------------------
// Low-level RS-274X (extended Gerber) writer. Pure text emission — no board
// knowledge. Encodings match the KiCad conventions captured in
// gerber_spec/SPEC.md (KiCad 10.0.0 golden fixtures):
//   - %FSLAX46Y46*% — 4.6 coordinates, absolute, leading zeros omitted
//   - %MOMM*%, Y negated relative to the .kicad_pcb frame
//   - aperture macros RoundRect/HorizOval/RotRect/Outline4P/FreePoly emitted
//     verbatim in KiCad's own wording, once per file, before the ADD list
//   - aperture attributes as TA → ADD → TD triplets
// ---------------------------------------------------------------------------

/** AperFunction values observed in KiCad copper output. */
export type AperFunction =
  | 'Profile'
  | 'ViaPad'
  | 'ComponentPad'
  | 'SMDPad,CuDef'
  | 'BGAPad,CuDef'
  | 'HeatsinkPad'
  | 'Conductor';

export type Point = { x: number; y: number };

export type ApertureShape =
  | { kind: 'C'; dia: number }
  | { kind: 'R'; w: number; h: number }
  | { kind: 'O'; w: number; h: number }
  | { kind: 'RotRect'; w: number; h: number; rot: number }
  /** radius + the four corner-circle centers (already rotated), rot param 0 */
  | { kind: 'RoundRect'; r: number; corners: [Point, Point, Point, Point] }
  /** oval drawn as a thick line: width + the two end-cap centers */
  | { kind: 'HorizOval'; w: number; end1: Point; end2: Point }
  /** free 4-corner polygon: unrotated corners + rotation param */
  | { kind: 'Outline4P'; corners: [Point, Point, Point, Point]; rot: number }
  /** arbitrary polygon: unrotated vertices + rotation param */
  | { kind: 'FreePoly'; verts: Point[]; rot: number };

/** Number formatting for aperture parameters: always 6 decimals. */
function p(n: number): string {
  return n.toFixed(6);
}

/** Coordinate word value: mm → integer at 10⁶ scale, no leading zeros. */
function coord(mm: number): string {
  return String(Math.round(mm * 1e6));
}

const MACRO_BODIES: Record<string, string> = {
  RoundRect: [
    '%AMRoundRect*',
    '0 Rectangle with rounded corners*',
    '0 $1 Rounding radius*',
    '0 $2 $3 $4 $5 $6 $7 $8 $9 X,Y pos of 4 corners*',
    '0 Add a 4 corners polygon primitive as box body*',
    '4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*',
    '0 Add four circle primitives for the rounded corners*',
    '1,1,$1+$1,$2,$3*',
    '1,1,$1+$1,$4,$5*',
    '1,1,$1+$1,$6,$7*',
    '1,1,$1+$1,$8,$9*',
    '0 Add four rect primitives between the rounded corners*',
    '20,1,$1+$1,$2,$3,$4,$5,0*',
    '20,1,$1+$1,$4,$5,$6,$7,0*',
    '20,1,$1+$1,$6,$7,$8,$9,0*',
    '20,1,$1+$1,$8,$9,$2,$3,0*%',
  ].join('\n'),
  HorizOval: [
    '%AMHorizOval*',
    '0 Thick line with rounded ends*',
    '0 $1 width*',
    '0 $2 $3 position (X,Y) of the first rounded end (center of the circle)*',
    '0 $4 $5 position (X,Y) of the second rounded end (center of the circle)*',
    '0 Add line between two ends*',
    '20,1,$1,$2,$3,$4,$5,0*',
    '0 Add two circle primitives to create the rounded ends*',
    '1,1,$1,$2,$3*',
    '1,1,$1,$4,$5*%',
  ].join('\n'),
  RotRect: [
    '%AMRotRect*',
    '0 Rectangle, with rotation*',
    '0 The origin of the aperture is its center*',
    '0 $1 length*',
    '0 $2 width*',
    '0 $3 Rotation angle, in degrees counterclockwise*',
    '0 Add horizontal line*',
    '21,1,$1,$2,0,0,$3*%',
  ].join('\n'),
  Outline4P: [
    '%AMOutline4P*',
    '0 Free polygon, 4 corners , with rotation*',
    '0 The origin of the aperture is its center*',
    '0 number of corners: always 4*',
    '0 $1 to $8 corner X, Y*',
    '0 $9 Rotation angle, in degrees counterclockwise*',
    '0 create outline with 4 corners*',
    '4,1,4,$1,$2,$3,$4,$5,$6,$7,$8,$1,$2,$9*%',
  ].join('\n'),
};

function shapeParams(s: ApertureShape): string {
  switch (s.kind) {
    case 'C':
      return p(s.dia);
    case 'R':
    case 'O':
      return `${p(s.w)}X${p(s.h)}`;
    case 'RotRect':
      return `${p(s.w)}X${p(s.h)}X${p(s.rot)}`;
    case 'RoundRect':
      return [p(s.r), ...s.corners.flatMap((c) => [p(c.x), p(c.y)]), '0'].join('X');
    case 'HorizOval':
      return [p(s.w), p(s.end1.x), p(s.end1.y), p(s.end2.x), p(s.end2.y), '0'].join('X');
    case 'Outline4P':
      return [...s.corners.flatMap((c) => [p(c.x), p(c.y)]), p(s.rot)].join('X');
    case 'FreePoly':
      return p(s.rot);
  }
}

function shapeKey(s: ApertureShape): string {
  return `${s.kind}:${shapeParams(s)}:${s.kind === 'FreePoly' ? s.verts.map((v) => `${v.x.toFixed(6)},${v.y.toFixed(6)}`).join(';') : ''}`;
}

/** Which macro template a shape needs (undefined = standard aperture). */
function macroName(s: ApertureShape): string | undefined {
  switch (s.kind) {
    case 'RoundRect':
    case 'HorizOval':
    case 'RotRect':
    case 'Outline4P':
      return s.kind;
    case 'FreePoly':
      return 'FreePoly';
    default:
      return undefined;
  }
}

interface Aperture {
  dcode: number;
  shape: ApertureShape;
  aperFunction?: AperFunction;
  macroName?: string;
  /** FreePoly macros are per-shape (bodies differ); others share one body. */
  macroBody?: string;
}

export interface GerberHeaderInfo {
  fileFunction: string;
  /** omitted for layers that carry no polarity (Profile, Fab, User) */
  polarity?: 'Positive' | 'Negative';
  projectName: string;
  /** opaque GUID string; parity harnesses may ignore this line */
  projectGuid: string;
  projectRevision: string;
  generationSoftware: string;
  creationDate: string;
}

export class GerberWriter {
  private lines: string[] = [];
  private apertures: Aperture[] = [];
  private byKey = new Map<string, Aperture>();
  private nextDcode = 10;
  private freePolyCounter = 0;
  private lastDcode: number | null = null;
  private currentNet: string | null = null;
  private currentPad: string | null = null;
  private inRegion = false;
  private arcModeSet = false;
  private currentComponent: string | null = null;

  /** Component attribute (graphics-layer footprint groups, mask/paste pads). */
  componentAttr(ref: string): void {
    if (this.currentComponent !== ref) {
      this.lines.push(`%TO.C,${ref}*%`);
      this.currentComponent = ref;
    }
  }

  /** Close a footprint's attribute group on a graphics layer. */
  closeComponent(): void {
    if (this.currentComponent === null) return;
    this.lines.push('%TD*%');
    this.currentComponent = null;
    this.currentNet = null;
    this.currentPad = null;
  }

  /** Reserve (or reuse) an aperture; returns its D-code. */
  aperture(shape: ApertureShape, aperFunction?: AperFunction): number {
    const key = shapeKey(shape);
    let a = this.byKey.get(key);
    if (!a) {
      let macroBody: string | undefined;
      let name: string | undefined;
      if (shape.kind === 'FreePoly') {
        name = `FreePoly${this.freePolyCounter}`;
        this.freePolyCounter++;
        macroBody = this.freePolyBody(name, shape.verts);
      } else {
        name = macroName(shape);
        if (name) macroBody = MACRO_BODIES[name];
      }
      a = { dcode: this.nextDcode++, shape, aperFunction, macroName: name, macroBody };
      this.apertures.push(a);
      this.byKey.set(key, a);
    } else if (aperFunction && !a.aperFunction) {
      a.aperFunction = aperFunction;
    }
    return a.dcode;
  }

  private freePolyBody(name: string, verts: Point[]): string {
    const coords = verts.map((v) => `${v.x.toFixed(6)},${v.y.toFixed(6)}`).join(',');
    const first = verts[0];
    if (!first) throw new Error('FreePoly needs at least one vertex');
    return `%AM${name}*\n4,1,${verts.length},${coords},${first.x.toFixed(6)},${first.y.toFixed(6)},$1*%`;
  }

  // ---- object attributes -------------------------------------------------

  /** Pad attributes before a flash; repeats are suppressed like KiCad. */
  padAttrs(ref: string, pad: string, net: string | null): void {
    const padId = `${ref},${pad}`;
    if (this.currentPad !== padId) {
      this.lines.push(`%TO.P,${ref},${pad}*%`);
      this.currentPad = padId;
    }
    this.netAttr(net);
  }

  /** Inner-copper pads carry net + component attributes (no pad number). */
  innerPadAttrs(ref: string, net: string | null): void {
    const padId = `C:${ref}`;
    if (this.currentPad !== padId) {
      this.netAttr(net);
      this.lines.push(`%TO.C,${ref}*%`);
      this.currentPad = padId;
      this.currentNet = net;
    } else {
      this.netAttr(net);
    }
  }

  /**
   * Net attribute; only emitted when it changes (KiCad behavior). Items
   * without any net reference plot as `N/C`.
   */
  netAttr(net: string | null): void {
    const label = net === null || net === '' ? 'N/C' : net;
    if (label !== this.currentNet) {
      this.lines.push(`%TO.N,${label}*%`);
      this.currentNet = label;
    }
  }

  /** Clear object attributes (KiCad emits %TD*% at group boundaries). */
  clearAttrs(): void {
    if (this.currentNet === null && this.currentPad === null && this.currentComponent === null)
      return;
    this.lines.push('%TD*%');
    this.currentNet = null;
    this.currentPad = null;
    this.currentComponent = null;
  }

  /** Object-level aperture attribute (zones carry Conductor here). */
  objectAperFunction(fn: AperFunction): void {
    this.lines.push(`%TA.AperFunction,${fn}*%`);
  }

  clearAperFunction(): void {
    this.lines.push('%TD.AperFunction*%');
  }

  // ---- drawing operations ------------------------------------------------

  selectAperture(dcode: number): void {
    if (this.lastDcode !== dcode) {
      this.lines.push(`D${dcode}*`);
      this.lastDcode = dcode;
    }
  }

  /** aperture select + flash with the aperture's attribute context. */
  flash(dcode: number, at: Point): void {
    this.selectAperture(dcode);
    this.lines.push(`X${coord(at.x)}Y${coord(at.y)}D03*`);
  }

  moveTo(pt: Point): void {
    this.lines.push(`X${coord(pt.x)}Y${coord(pt.y)}D02*`);
  }

  /** Stroke to pt with the current aperture. */
  lineTo(pt: Point): void {
    this.lines.push(`X${coord(pt.x)}Y${coord(pt.y)}D01*`);
  }

  /**
   * Arc from the current point to `end` with center offset (relative, gerber
   * frame). G75 once, then G02/G03 per arc; KiCad resets G01 right after.
   */
  arcTo(end: Point, centerOffset: Point, clockwise: boolean): void {
    // KiCad re-issues G75 before every arc (and resets with G01 after)
    this.lines.push('G75*');
    this.lines.push(clockwise ? 'G02*' : 'G03*');
    this.lines.push(
      `X${coord(end.x)}Y${coord(end.y)}I${coord(centerOffset.x)}J${coord(centerOffset.y)}D01*`,
    );
    this.lines.push('G01*');
    this.arcModeSet = false;
  }

  /** Multi-contour region: each contour starts with a moveTo. */
  beginRegion(): void {
    this.lines.push('G36*');
    this.inRegion = true;
  }

  regionPoint(pt: Point): void {
    // inside regions KiCad emits G01 after the D02 contour start
    if (this.inRegion && this.lines.at(-1)?.endsWith('D02*')) this.lines.push('G01*');
    this.lines.push(`X${coord(pt.x)}Y${coord(pt.y)}D01*`);
  }

  endRegion(): void {
    this.lines.push('G37*');
    this.inRegion = false;
  }

  // ---- document ----------------------------------------------------------

  /** Assemble header + aperture list + buffered body. */
  render(info: GerberHeaderInfo): string {
    const head: string[] = [
      `%TF.GenerationSoftware,${info.generationSoftware}*%`,
      `%TF.CreationDate,${info.creationDate}*%`,
      `%TF.ProjectId,${info.projectName},${info.projectGuid},${info.projectRevision}*%`,
      `%TF.SameCoordinates,Original*%`,
      `%TF.FileFunction,${info.fileFunction}*%`,
      ...(info.polarity ? [`%TF.FilePolarity,${info.polarity}*%`] : []),
      `%FSLAX46Y46*%`,
      'G04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*',
      `G04 Created by ${info.generationSoftware.split(',').slice(0, 2).join(' ')} date ${info.creationDate.slice(0, 19)}*`,
      '%MOMM*%',
      '%LPD*%',
      'G01*',
      'G04 APERTURE LIST*',
    ];
    const withMacros = this.apertures.filter((a) => a.macroBody);
    if (withMacros.length > 0) {
      head.push('G04 Aperture macros list*');
      // KiCad emits shared templates once in a fixed template order
      // (RoundRect, HorizOval, RotRect, Outline4P — observed on KiCad 10
      // multi-macro output), then per-shape FreePoly bodies by index.
      const templateOrder = ['RoundRect', 'HorizOval', 'RotRect', 'Outline4P'];
      const byTemplate = new Map<string, Aperture[]>();
      for (const a of withMacros) {
        if (a.macroName?.startsWith('FreePoly')) continue;
        byTemplate.set(a.macroName!, [...(byTemplate.get(a.macroName!) ?? []), a]);
      }
      for (const t of templateOrder) {
        const a = byTemplate.get(t)?.[0];
        if (a) head.push(a.macroBody!);
      }
      for (const a of withMacros) {
        if (a.macroName?.startsWith('FreePoly')) head.push(a.macroBody!);
      }
      head.push('G04 Aperture macros list end*');
    }
    for (const a of this.apertures) {
      const params = shapeParams(a.shape);
      if (a.aperFunction) head.push(`%TA.AperFunction,${a.aperFunction}*%`);
      head.push(`%ADD${a.dcode}${a.macroName ?? a.shape.kind},${params}*%`);
      if (a.aperFunction) head.push('%TD*%');
    }
    head.push('G04 APERTURE END LIST*');
    return [...head, ...this.lines, 'M02*', ''].join('\n');
  }
}
