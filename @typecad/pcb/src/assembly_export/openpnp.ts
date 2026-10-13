/**
 * OpenPnP's native `.board.xml` — the file the Boards tab opens directly
 * (no import step, no empty board to create first).
 *
 * Schema per OpenPnP's source (simpleframework XML annotations on
 * Board/PlacementsHolder/Placement/Location) and its own checked-in
 * sample, samples/EAT001/EAT001.board.xml:
 *
 *   <openpnp-board name="...">
 *     <placements>
 *       <placement id="R1" side="Top" part-id="R_0603-10k">
 *         <location units="Millimeters" x="" y="" z="0.0" rotation=""/>
 *       </placement>
 *     </placements>
 *   </openpnp-board>
 *
 * part-id names the part OpenPnP should place (its KiCad importer uses
 * package + "-" + value); an id with no matching Part in the user's
 * configuration simply loads unassigned, ready to map in the Jobs tab.
 * Rows already carry OpenPnP's bottom transform (negated x, mirrored
 * rotation) from buildPlacementRows.
 */
import type { PlacementRow } from './centroid.js';
import type { BoardComponent } from '../cli/typecad/board_model.js';
import { footprintLocalToBoard } from './centroid.js';

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The part name OpenPnP's KiCad importer would derive: last footprint
 *  segment (library prefix dropped) + value. */
export function openPnpPartId(row: PlacementRow): string {
  const pkg = row.footprint.includes(':') ? row.footprint.split(':').pop()! : row.footprint;
  return row.value ? `${pkg}-${row.value}` : pkg;
}

export interface OpenPnpBoardXmlOptions {
  /** Board stem for the name attribute. */
  name: string;
  /** Board extent from Edge.Cuts, mm — OpenPnP shows it as the board size. */
  dimensions?: { width: number; height: number };
  /** Edge.Cuts outline segments — chained into the <profile> path when they
   *  close. OpenPnP renders the real board shape from it. */
  outline?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Components to derive solder paste pads from (every pad on a paste layer). */
  components?: BoardComponent[];
}

const fmt = (v: number): string => {
  const s = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};

/**
 * Chain Edge.Cuts segments into one closed vertex loop, mm. Null when the
 * segments don't close (or there are none) — a partial outline is worse
 * than none.
 */
export function chainOutline(
  segments: { x1: number; y1: number; x2: number; y2: number }[],
): { x: number; y: number }[] | null {
  if (segments.length < 3) return null;
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const remaining = segments.map((s) => ({
    a: { x: s.x1, y: s.y1 },
    b: { x: s.x2, y: s.y2 },
  }));
  const first = remaining.shift()!;
  // both endpoints of the first segment are corners of the loop; every
  // later push is the far end of the segment just consumed
  const vertices = [first.a, first.b];
  let cursor = first.b;
  while (remaining.length > 0) {
    if (key(cursor.x, cursor.y) === key(vertices[0]!.x, vertices[0]!.y)) break; // closed early
    const idx = remaining.findIndex(
      (s) => key(s.a.x, s.a.y) === key(cursor.x, cursor.y) || key(s.b.x, s.b.y) === key(cursor.x, cursor.y),
    );
    if (idx === -1) return null; // open outline — can't chain
    const seg = remaining.splice(idx, 1)[0]!;
    const forward = key(seg.a.x, seg.a.y) === key(cursor.x, cursor.y);
    cursor = forward ? seg.b : seg.a;
    vertices.push(cursor);
  }
  // closed iff the walk consumed every segment and came home
  if (remaining.length > 0 || key(cursor.x, cursor.y) !== key(vertices[0]!.x, vertices[0]!.y)) {
    return null;
  }
  vertices.pop(); // the closing vertex repeats the first
  return vertices.length >= 3 ? vertices : null;
}

/**
 * The <profile> element — OpenPnP's board outline as a Path2D: one MOVETO,
 * a LINETO per vertex, a CLOSE. Segment constants are java.awt.geom
 * PathIterator's; entry/element names follow OpenPnP's serializer
 * (simple-xml HyphenStyle: segment-types/<integer>, segment-points/<double>).
 */
function profileLines(
  outline: { x1: number; y1: number; x2: number; y2: number }[],
): string[] {
  const loop = chainOutline(outline);
  if (!loop) return [];
  const types = [0, ...Array<number>(loop.length - 1).fill(1), 4];
  // OpenPnP's reader has a fall-through in its commit switch: SEG_MOVETO
  // also executes the SEG_LINETO branch, consuming 4 points for the first
  // entry (their own persist() writes 2 — the pair is asymmetric upstream).
  // Appending the first vertex again satisfies the fall-through reader
  // (its extra lineTo lands back on the start) and is ignored by a reader
  // with the fall-through fixed — same polygon either way.
  const points = [...loop, loop[0]!].flatMap((v) => [v.x, v.y]);
  return [
    // winding-rule is a REQUIRED attribute in OpenPnP's schema (bare
    // @Attribute on GeometricPath2D) — 1 is Path2D's WIND_NON_ZERO default
    '   <profile units="Millimeters" winding-rule="1">',
    '      <segment-types>',
    ...types.map((t) => `         <integer>${t}</integer>`),
    '      </segment-types>',
    '      <segment-points>',
    ...points.map((p) => `         <double>${fmt(p)}</double>`),
    '      </segment-points>',
    '   </profile>',
  ];
}

const PASTE_LAYER = /^([FB]|\*)\.Paste$/;

/**
 * The <solderPastePads> element — every component pad on a paste layer, for
 * paste-dispensing setups. The pad shape is an org.openpnp.model.Pad
 * subclass (abstract base — simple-xml picks the concrete class from the
 * class= attribute): Circle for fully-round pads, RoundRectangle otherwise
 * (roundness 1.0 on unequal sides is the stadium/oval shape). The shape is
 * centered on the location, which carries the board position.
 */
function pastePadLines(components: BoardComponent[]): string[] {
  const entries: string[] = [];
  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.type === 'np_thru_hole') continue;
      const paste = pad.layers.find((l) => PASTE_LAYER.test(l));
      if (!paste) continue;
      const center = footprintLocalToBoard(comp.at, pad.at);
      const side =
        paste === '*.Paste'
          ? comp.side === 'front'
            ? 'Top'
            : 'Bottom'
          : paste.startsWith('B')
            ? 'Bottom'
            : 'Top';
      const roundness = (pad.roundness ?? 0) / 100;
      const shape =
        roundness >= 1 && Math.abs(pad.size.width - pad.size.height) < 1e-9
          ? `         <pad class="org.openpnp.model.Pad$Circle" units="Millimeters" radius="${fmt(
              pad.size.width / 2,
            )}"/>`
          : `         <pad class="org.openpnp.model.Pad$RoundRectangle" units="Millimeters" width="${fmt(
              pad.size.width,
            )}" height="${fmt(pad.size.height)}"${roundness > 0 ? ` roundness="${fmt(roundness)}"` : ''}/>`;
      entries.push(
        `      <board-pad type="Paste" side="${side}" name="${xmlEscape(`${comp.reference}-${pad.pad}`)}">`,
        `         <location units="Millimeters" x="${fmt(center.x)}" y="${fmt(
          center.y,
        )}" z="0.0" rotation="0.0"/>`,
        shape,
        '      </board-pad>',
      );
    }
  }
  if (entries.length === 0) return [];
  return ['   <solderPastePads>', ...entries, '   </solderPastePads>'];
}

function locationLine(row: PlacementRow): string {
  return `         <location units="Millimeters" x="${fmt(row.x)}" y="${fmt(
    row.y,
  )}" z="0.0" rotation="${+row.rotation.toFixed(2)}"/>`;
}

/** The block we'd write for a placement the existing file doesn't know.
 *  Fiducial rows carry type="Fiducial" and no part — the machine aligns on
 *  them; the user assigns their own fiducial part if they have one. */
export function freshPlacementBlock(row: PlacementRow): string {
  const fiducial = row.kind === 'fiducial';
  const attrs = [
    `id="${xmlEscape(row.ref)}"`,
    `side="${row.side === 'front' ? 'Top' : 'Bottom'}"`,
    ...(fiducial
      ? ['type="Fiducial"']
      : [`part-id="${xmlEscape(openPnpPartId(row))}"`]),
  ];
  return [`      <placement ${attrs.join(' ')}>`, locationLine(row), '      </placement>'].join('\n');
}

/**
 * Splice fresh geometry into a block OpenPnP (or a previous export) wrote:
 * keep every other attribute and child element exactly as saved — the
 * part-id association, type=Ignore/Fiducial, enabled, comments,
 * error-handling — and only move the placement to where the board now has
 * it (location, and side if the part flipped).
 */
function refreshPlacementBlock(block: string, row: PlacementRow): string | null {
  const side = row.side === 'front' ? 'Top' : 'Bottom';
  const withSide = /\bside="[^"]*"/.test(block)
    ? block.replace(/\bside="[^"]*"/, `side="${side}"`)
    : null;
  if (withSide === null) return null;
  // a ref that became a fiducial (or stopped being one) carries the fresh
  // type; user-chosen types on regular placements stay theirs
  const withType =
    row.kind === 'fiducial'
      ? /\btype="[^"]*"/.test(withSide)
        ? withSide.replace(/\btype="[^"]*"/, 'type="Fiducial"')
        : withSide.replace(/(<placement\b[^>]*\bside="[^"]*")/, '$1 type="Fiducial"')
      : withSide;
  if (!/<location\b[^>]*\/>/.test(withType)) return null;
  return withType.replace(/<location\b[^>]*\/>/, locationLine(row));
}

function boardHeaderLines(opts: OpenPnpBoardXmlOptions): string[] {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(`<openpnp-board name="${xmlEscape(opts.name)}">`);
  if (opts.dimensions) {
    lines.push(
      `   <dimensions units="Millimeters" x="${fmt(opts.dimensions.width)}" y="${fmt(
        opts.dimensions.height,
      )}" z="0.0" rotation="0.0"/>`,
    );
  }
  if (opts.outline?.length) lines.push(...profileLines(opts.outline));
  if (opts.components?.length) lines.push(...pastePadLines(opts.components));
  lines.push('   <placements>');
  return lines;
}

function boardFooterLines(): string[] {
  return ['   </placements>', '</openpnp-board>'];
}

export function renderOpenPnpBoardXml(
  rows: PlacementRow[],
  opts: OpenPnpBoardXmlOptions,
): string {
  const lines = [...boardHeaderLines(opts)];
  for (const row of rows) lines.push(freshPlacementBlock(row));
  lines.push(...boardFooterLines());
  return lines.join('\n') + '\n';
}

export interface BoardXmlMergeResult {
  xml: string;
  /** Fresh rows that matched an existing block — geometry updated, edits kept. */
  preserved: number;
  /** Fresh rows with no existing block — written with derived defaults. */
  added: number;
  /** Existing blocks for refs still on the board but not in the rows
   *  (profile-excluded fiducials the user placed in OpenPnP) — kept as-is. */
  keptExisting: string[];
  /** Existing blocks whose ref is gone from the board entirely — dropped. */
  dropped: string[];
}

/**
 * Re-render a board.xml over a previous copy without destroying the work
 * done inside OpenPnP: placement geometry always follows the board, while
 * part associations and placement settings ride over unchanged. Blocks
 * whose reference no longer exists on the board can't be carried (there
 * is nothing to place) and are reported for the log.
 */
export function mergeOpenPnpBoardXml(
  rows: PlacementRow[],
  opts: OpenPnpBoardXmlOptions,
  existingXml: string,
  boardRefs: ReadonlySet<string>,
): BoardXmlMergeResult {
  const existing = new Map<string, string>();
  // leading whitespace rides with the block so carried-over placements keep
  // their indentation in the merged file
  const blockRe = /[ \t]*<placement\b[^>]*>[\s\S]*?<\/placement>/g;
  for (const m of existingXml.matchAll(blockRe)) {
    const id = /\bid="([^"]*)"/.exec(m[0])?.[1];
    if (id) existing.set(id, m[0]);
  }

  const merged = new Map<string, string>();
  let preserved = 0;
  let added = 0;
  for (const row of rows) {
    const oldBlock = existing.get(row.ref);
    const refreshed = oldBlock ? refreshPlacementBlock(oldBlock, row) : null;
    if (refreshed) {
      merged.set(row.ref, refreshed);
      preserved++;
    } else {
      merged.set(row.ref, freshPlacementBlock(row));
      added++;
    }
  }

  const keptExisting: string[] = [];
  const dropped: string[] = [];
  for (const [id, block] of existing) {
    if (merged.has(id)) continue;
    if (boardRefs.has(id)) {
      merged.set(id, block);
      keptExisting.push(id);
    } else {
      dropped.push(id);
    }
  }

  const lines = [...boardHeaderLines(opts)];
  for (const id of [...merged.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    lines.push(merged.get(id)!);
  }
  lines.push(...boardFooterLines());

  keptExisting.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  dropped.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    xml: lines.join('\n') + '\n',
    preserved,
    added,
    keptExisting,
    dropped,
  };
}
