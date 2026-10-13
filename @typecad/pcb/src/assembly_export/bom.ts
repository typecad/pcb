/**
 * BOM row computation and CSV rendering — board truth joined with the
 * netlist's component fields (MPN, Datasheet, Description...; the typeCAD
 * serializer writes them capitalized, see renderNetlist in
 * renderers/sexp_renderers.ts). A missing or stale netlist degrades to
 * board-only columns (value, footprint, side) — never an error.
 */
import type { BoardComponent } from '../cli/typecad/board_model.js';
import type { NetlistModel } from '../cli/diagnostics/netlist_model.js';
import type { BomColumnKey, BomProfile } from './profiles.js';
import { csvEscape, refMatches } from './centroid.js';

export interface BomRow {
  /** One reference (ungrouped) or the collapsed reference list (grouped). */
  refs: string[];
  value: string;
  footprint: string;
  mpn: string;
  datasheet: string;
  sides: ('front' | 'back')[];
  dnp: boolean;
}

/** Netlist field names worth joining, tried case-insensitively. */
function netField(fields: Record<string, string>, ...names: string[]): string {
  const byLower = new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]));
  for (const name of names) {
    const hit = byLower.get(name.toLowerCase());
    if (hit) return hit;
  }
  return '';
}

export function buildBomRows(
  components: BoardComponent[],
  netlist: NetlistModel | null,
  opts: { grouped: boolean; exclude: string[] },
): { rows: BomRow[]; skipped: { ref: string; reason: string }[] } {
  const fieldsByRef = new Map<string, Record<string, string>>();
  if (netlist) {
    for (const comp of netlist.components) {
      if (comp.isVia) continue;
      fieldsByRef.set(comp.reference, comp.fields);
    }
  }

  const skipped: { ref: string; reason: string }[] = [];
  const eligible: BoardComponent[] = [];
  for (const comp of components) {
    const reason = comp.excludeFromBom
      ? 'exclude_from_bom'
      : comp.dnp
        ? 'dnp'
        : opts.exclude.some((p) => refMatches(p, comp.reference))
          ? 'excluded'
          : null;
    if (reason) {
      skipped.push({ ref: comp.reference, reason });
      continue;
    }
    eligible.push(comp);
  }

  const rows: BomRow[] = [];
  if (opts.grouped) {
    // Same physical part = same value + footprint + mpn; side deliberately
    // not in the key (one part on both sides is one BOM line — the
    // placement file tells the assembler which side).
    const groups = new Map<string, BomRow>();
    for (const comp of eligible) {
      const fields = fieldsByRef.get(comp.reference) ?? {};
      const mpn = netField(fields, 'MPN', 'LCSC', 'LCSC Part #', 'Manufacturer Part Number');
      const key = `${comp.value}\u0000${comp.footprint}\u0000${mpn}`;
      let row = groups.get(key);
      if (!row) {
        row = {
          refs: [],
          value: comp.value,
          footprint: comp.footprint,
          mpn,
          datasheet: netField(fields, 'Datasheet'),
          sides: [],
          dnp: false,
        };
        groups.set(key, row);
        rows.push(row);
      }
      row.refs.push(comp.reference);
      if (!row.sides.includes(comp.side)) row.sides.push(comp.side);
    }
  } else {
    for (const comp of eligible) {
      const fields = fieldsByRef.get(comp.reference) ?? {};
      rows.push({
        refs: [comp.reference],
        value: comp.value,
        footprint: comp.footprint,
        mpn: netField(fields, 'MPN', 'LCSC', 'LCSC Part #', 'Manufacturer Part Number'),
        datasheet: netField(fields, 'Datasheet'),
        sides: [comp.side],
        dnp: comp.dnp,
      });
    }
  }

  const sortRef = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  for (const row of rows) row.refs.sort(sortRef);
  rows.sort((a, b) => sortRef(a.refs[0] ?? '', b.refs[0] ?? ''));
  return { rows, skipped };
}

export function renderBomCsv(rows: BomRow[], profile: BomProfile): string {
  const esc = (v: string) => csvEscape(v, profile.delimiter, profile.quote);
  const lines: string[] = [];
  lines.push(profile.columns.map((c) => c.header).join(profile.delimiter));
  for (const row of rows) {
    const fields = profile.columns.map((c): string => {
      switch (c.key as BomColumnKey) {
        case 'ref':
          return esc(row.refs[0] ?? '');
        case 'refs':
          return esc(row.refs.join(', '));
        case 'qty':
          return String(row.refs.length);
        case 'comment':
        case 'value':
          return esc(row.value);
        case 'footprint':
          return esc(row.footprint);
        case 'mpn':
          return esc(row.mpn);
        case 'datasheet':
          return esc(row.datasheet);
        case 'side':
          return esc(row.sides.map((s) => (s === 'front' ? 'Top' : 'Bottom')).join('/'));
      }
    });
    lines.push(fields.join(profile.delimiter));
  }
  return lines.join('\n') + '\n';
}
