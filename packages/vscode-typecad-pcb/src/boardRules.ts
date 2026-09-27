// ---------------------------------------------------------------------------
// Board design rules for the layout view: the trace-width/clearance floors,
// the copper-to-edge keep-out, and net-class width/via defaults.
//
// TWO sources, in priority order:
//  1. the project's own `typecad.rules.json` (hw folder, beside
//     typecad.conf.ts) — hand-authored, optional, wins over everything;
//  2. the board's `.kicad_pro` (design_settings.rules + net_settings) —
//     the same source drc_native reads.
// Vscode-free so the unit tests exercise exactly what the viewer's
// generate() runs.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

export interface NetClassDef {
  /** default trace width for the class, mm */
  width?: number;
  /** default via barrel diameter for the class, mm */
  viaSize?: number;
  /** default via drill for the class, mm */
  viaDrill?: number;
  /** minimum clearance for the class, mm — the live check judges pairs by
   *  the larger class clearance of the two nets involved */
  clearance?: number;
}

export interface BoardRules {
  /** minimum trace width in mm — width stepping refuses to go below it */
  minTrackWidthMm: number;
  /** minimum via diameter in mm, when known */
  minViaDiameterMm?: number;
  /** minimum copper-to-copper clearance in mm — the live router's keep-out */
  minClearanceMm?: number;
  /** copper-to-board-edge clearance in mm */
  minCopperEdgeClearanceMm?: number;
  /** per-class width/via defaults */
  netClasses?: Record<string, NetClassDef>;
  /** net-name (regex) → class assignments, first match wins */
  netClassPatterns?: Array<{ pattern: string; class: string }>;
}

/** The user-authored rules file, when the project carries one. */
export const USER_RULES_FILE = 'typecad.rules.json';

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/** Read the project's optional typecad.rules.json (null when absent/invalid). */
export function userRulesFromFolder(hwFolder: string): Partial<BoardRules> | null {
  const file = path.join(hwFolder, USER_RULES_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: Partial<BoardRules> = {};
  const minTrack = num(src.minTrackWidthMm);
  if (minTrack !== undefined) out.minTrackWidthMm = minTrack;
  const minVia = num(src.minViaDiameterMm);
  if (minVia !== undefined) out.minViaDiameterMm = minVia;
  const minCl = num(src.minClearanceMm);
  if (minCl !== undefined) out.minClearanceMm = minCl;
  const edge = num(src.minCopperEdgeClearanceMm);
  if (edge !== undefined) out.minCopperEdgeClearanceMm = edge;
  if (src.netClasses && typeof src.netClasses === 'object') {
    const classes: Record<string, NetClassDef> = {};
    for (const [name, def] of Object.entries(src.netClasses as Record<string, unknown>)) {
      if (!def || typeof def !== 'object') continue;
      const d = def as Record<string, unknown>;
      const c: NetClassDef = {};
      const w = num(d.width);
      if (w !== undefined) c.width = w;
      const vs = num(d.viaSize);
      if (vs !== undefined) c.viaSize = vs;
      const vd = num(d.viaDrill);
      if (vd !== undefined) c.viaDrill = vd;
      const cl = num(d.clearance);
      if (cl !== undefined) c.clearance = cl;
      if (Object.keys(c).length > 0) classes[name] = c;
    }
    if (Object.keys(classes).length > 0) out.netClasses = classes;
  }
  if (Array.isArray(src.netClassPatterns)) {
    const patterns: Array<{ pattern: string; class: string }> = [];
    for (const p of src.netClassPatterns) {
      const e = p as { pattern?: unknown; class?: unknown };
      if (typeof e.pattern === 'string' && typeof e.class === 'string' && e.pattern.length > 0) {
        patterns.push({ pattern: e.pattern, class: e.class });
      }
    }
    if (patterns.length > 0) out.netClassPatterns = patterns;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Extract what the board's .kicad_pro carries (floors + net classes). */
export function rulesFromProject(boardPath: string): Partial<BoardRules> {
  const proPath = boardPath.replace(/\.kicad_pcb$/i, '.kicad_pro');
  let pro: {
    board?: { design_settings?: { rules?: Record<string, unknown> } };
    net_settings?: { classes?: Array<Record<string, unknown>>; netclass_patterns?: Array<{ netclass?: string; pattern?: string }> };
  };
  try {
    pro = JSON.parse(fs.readFileSync(proPath, 'utf8')) as typeof pro;
  } catch {
    return {};
  }
  const out: Partial<BoardRules> = {};
  const rules = pro.board?.design_settings?.rules ?? {};
  const minTrack = num(rules.min_track_width);
  if (minTrack !== undefined) out.minTrackWidthMm = minTrack;
  const minVia = num(rules.min_via_diameter);
  if (minVia !== undefined) out.minViaDiameterMm = minVia;
  const minCl = num(rules.min_clearance);
  if (minCl !== undefined) out.minClearanceMm = minCl;
  const edge = num(rules.min_copper_edge_clearance);
  if (edge !== undefined) out.minCopperEdgeClearanceMm = edge;
  const classes: Record<string, NetClassDef> = {};
  for (const cls of pro.net_settings?.classes ?? []) {
    const name = typeof cls.name === 'string' ? cls.name : '';
    if (!name) continue;
    const c: NetClassDef = {};
    const w = num(cls.track_width);
    if (w !== undefined) c.width = w;
    const vs = num(cls.via_diameter);
    if (vs !== undefined) c.viaSize = vs;
    const vd = num(cls.via_drill);
    if (vd !== undefined) c.viaDrill = vd;
    const cl = num(cls.clearance);
    if (cl !== undefined) c.clearance = cl;
    if (Object.keys(c).length > 0) classes[name] = c;
  }
  if (Object.keys(classes).length > 0) out.netClasses = classes;
  const patterns: Array<{ pattern: string; class: string }> = [];
  for (const p of pro.net_settings?.netclass_patterns ?? []) {
    if (p.netclass && p.pattern) patterns.push({ pattern: p.pattern, class: p.netclass });
  }
  if (patterns.length > 0) out.netClassPatterns = patterns;
  return out;
}

/**
 * The rules the layout view ships: the project's typecad.rules.json wins
 * field-by-field, the board's .kicad_pro fills the gaps. Null when neither
 * source yields anything usable (no floor AND no net classes).
 */
export function resolveBoardRules(hwFolder: string, boardPath: string): BoardRules | null {
  const user = userRulesFromFolder(hwFolder);
  const pro = rulesFromProject(boardPath);
  const merged: Partial<BoardRules> = { ...pro, ...user };
  // arrays merge user-first (user patterns take precedence, pro patterns ride along)
  if (user?.netClassPatterns || pro.netClassPatterns) {
    merged.netClassPatterns = [...(user?.netClassPatterns ?? []), ...(pro.netClassPatterns ?? [])];
  }
  if (user?.netClasses || pro.netClasses) {
    merged.netClasses = { ...(pro.netClasses ?? {}), ...(user?.netClasses ?? {}) };
  }
  if (merged.minTrackWidthMm === undefined && !merged.netClasses) return null;
  return merged as BoardRules;
}
