/**
 * OpenPnP `packages.xml` + `parts.xml` — the definitions the board's
 * `part-id`s reference. OpenPnP's bottom-vision alignment checks each
 * placed part against its package footprint (pad layout + body size), so a
 * placement whose package has no footprint can't be vision-verified. These
 * files carry one `<package>` per unique footprint on the board (pads from
 * a representative component, body size from the measured fab outline) and
 * one `<part>` per unique part name — the same `footprint + value` naming
 * the board file uses.
 *
 * Schema per OpenPnP's own config defaults (src/main/resources/config) and
 * its serializer's HyphenStyle: `body-width`/`body-height`, `height-units`,
 * `package-id`, `roundness` as a percent (0 square, 100 round).
 *
 * There is no File > Import for these in OpenPnP's UI — they're drop-in
 * documents for the machine's configuration directory (or paste sources
 * for the Parts tab): ids match the board, so an import-once setup maps
 * cleanly. Part heights are 0.0 — only you know your stackup.
 */
import type { BoardComponent } from '../cli/typecad/board_model.js';
import { xmlEscape } from './openpnp.js';

const fmt = (v: number): string => {
  const s = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};

/** OpenPnP package id: the footprint's last library segment. */
export function openPnpPackageId(footprint: string): string {
  return footprint.includes(':') ? footprint.split(':').pop()! : footprint;
}

function normRot(deg: number | undefined): number {
  if (deg === undefined) return 0;
  return ((deg % 360) + 360) % 360;
}

function footprintLines(comp: BoardComponent, indent: string): string[] {
  const lines: string[] = [];
  const body = comp.dimensions
    ? ` body-width="${fmt(comp.dimensions.width)}" body-height="${fmt(comp.dimensions.height)}"`
    : '';
  lines.push(`${indent}<footprint units="Millimeters"${body}>`);
  for (const pad of comp.pads) {
    if (pad.type === 'np_thru_hole') continue;
    lines.push(
      `${indent}   <pad name="${xmlEscape(pad.pad)}" x="${fmt(pad.at.x)}" y="${fmt(
        pad.at.y,
      )}" width="${fmt(pad.size.width)}" height="${fmt(pad.size.height)}" rotation="${fmt(
        normRot(pad.rotation),
      )}" roundness="${fmt(pad.roundness ?? 0)}"/>`,
    );
  }
  lines.push(`${indent}</footprint>`);
  return lines;
}

/**
 * One `<package>` per unique footprint — pads from the first component
 * that uses it (they're identical by construction: same footprint).
 */
export function renderOpenPnpPackagesXml(components: BoardComponent[]): string {
  const byFootprint = new Map<string, BoardComponent>();
  for (const comp of components) {
    if (!byFootprint.has(comp.footprint) && comp.pads.some((p) => p.type !== 'np_thru_hole')) {
      byFootprint.set(comp.footprint, comp);
    }
  }
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<openpnp-packages>'];
  for (const id of [...byFootprint.keys()].sort()) {
    const comp = byFootprint.get(id)!;
    lines.push(`   <package id="${xmlEscape(openPnpPackageId(comp.footprint))}">`);
    // no legacy <outline/> — current OpenPnP Package has no such field and
    // its strict reader rejects unknown elements
    lines.push(...footprintLines(comp, '      '));
    lines.push('   </package>');
  }
  lines.push('</openpnp-packages>');
  return lines.join('\n') + '\n';
}

/**
 * One `<part>` per unique part name (footprint + value, matching the
 * board's part-ids). Height is the one number the board can't know — it
 * starts at 0.0 for the user to fill in.
 */
export function renderOpenPnpPartsXml(components: BoardComponent[]): string {
  // part id -> package id (values can contain dashes, so pairs are kept,
  // never re-derived from the id string)
  const parts = new Map<string, string>();
  for (const comp of components) {
    if (!comp.pads.some((p) => p.type !== 'np_thru_hole')) continue;
    const pkg = openPnpPackageId(comp.footprint);
    parts.set(comp.value ? `${pkg}-${comp.value}` : pkg, pkg);
  }
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<openpnp-parts>'];
  for (const id of [...parts.keys()].sort()) {
    lines.push(
      `   <part id="${xmlEscape(id)}" height-units="Millimeters" height="0.0" package-id="${xmlEscape(
        parts.get(id)!,
      )}" speed="1.0"/>`,
    );
  }
  lines.push('</openpnp-parts>');
  return lines.join('\n') + '\n';
}
