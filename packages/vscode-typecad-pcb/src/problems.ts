// ---------------------------------------------------------------------------
// Problems-pane content, pure: unconnected-pad warnings and DRC violations
// mapped to the DECLARING source lines (component Code property, net
// Code/Route provenance) so a violation points at the code that caused it.
// vscode-free — the extension turns ProblemEntry into vscode.Diagnostic.
// ---------------------------------------------------------------------------

import type { ComponentSummary, NetSourceSummary } from './types.js';

export interface ProblemEntry {
  /** Project-relative "file:line" as the query surface reports it. */
  location: string;
  message: string;
  severity: 'error' | 'warning';
  /** DRC violation type / source tag shown in the Problems list. */
  code: string;
}

export interface UnconnectedReport {
  unconnectedPads: Array<{ reference: string; pad: string; type?: string }>;
  singlePinNets: string[];
}

/** ref -> "file:line" from the component index's source field. */
export function refSourceMap(components: ComponentSummary[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of components) {
    if (c.reference && c.source) map.set(c.reference, c.source);
  }
  return map;
}

/**
 * Unconnected pads (one warning each, at the declaring line of their
 * component) plus single-pin nets (at the net's declaration). Mechanical
 * pads are already excluded by the query. Pads of components without a
 * recorded source attach to the board file as a catch-all.
 */
export function unconnectedProblems(
  report: UnconnectedReport,
  refs: Map<string, string>,
  nets: NetSourceSummary[],
  boardFile: string,
): ProblemEntry[] {
  const out: ProblemEntry[] = [];
  for (const pad of report.unconnectedPads) {
    out.push({
      location: refs.get(pad.reference) ?? `${boardFile}:1`,
      message: `${pad.reference} pad ${pad.pad} is unconnected`,
      severity: 'warning',
      code: 'unconnected-pad',
    });
  }
  const netByName = new Map(nets.map((n) => [n.name, n]));
  for (const name of report.singlePinNets) {
    const net = netByName.get(name);
    out.push({
      location: net?.source ?? net?.routeSource ?? `${boardFile}:1`,
      message: `net ${name} has only one pin`,
      severity: 'warning',
      code: 'single-pin-net',
    });
  }
  return out;
}

// ---- DRC report (KiCad JSON) ----

export interface DrcViolation {
  severity: 'error' | 'warning' | 'exclusion' | 'ignore';
  type: string;
  description: string;
  items: Array<{ description?: string }>;
}

/** Parse kicad-cli's `pcb drc --format json` document defensively. */
export function parseDrcReport(raw: unknown): DrcViolation[] {
  if (!raw || typeof raw !== 'object') return [];
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.violations)) return [];
  const out: DrcViolation[] = [];
  for (const v of doc.violations) {
    if (!v || typeof v !== 'object') continue;
    const violation = v as Record<string, unknown>;
    const severity = String(violation.severity ?? 'error');
    if (severity !== 'error' && severity !== 'warning' && severity !== 'exclusion' && severity !== 'ignore') continue;
    const items = Array.isArray(violation.items)
      ? (violation.items as Array<Record<string, unknown>>).map((i) => ({ description: i.description ? String(i.description) : undefined }))
      : [];
    out.push({
      severity,
      type: String(violation.type ?? 'uncategorized'),
      description: String(violation.description ?? violation.type ?? ''),
      items,
    });
  }
  return out;
}

/**
 * Map DRC violations to source lines: item descriptions name pads
 * ("pad R1.2"), vias and tracks; a token matching a known reference wins,
 * then a net name from the net provenance. Unmatched violations attach to
 * the board file itself (still visible in Problems, just not source-aimed).
 */
export function drcProblems(
  violations: DrcViolation[],
  refs: Map<string, string>,
  nets: NetSourceSummary[],
  boardFile: string,
): ProblemEntry[] {
  const netByName = new Map<string, NetSourceSummary>();
  for (const n of nets) netByName.set(n.name, n);
  const out: ProblemEntry[] = [];
  for (const v of violations) {
    if (v.severity !== 'error' && v.severity !== 'warning') continue;
    let location: string | undefined;
    let aimed = '';
    const descriptions = [v.description, ...v.items.map((i) => i.description ?? '')].join(' ; ');
    for (const token of descriptions.split(/[^A-Za-z0-9_.]+/)) {
      // item descriptions name pads as "R1.2" — try the token, then its
      // pre-dot prefix (the reference), then a trailing-dot cleanup
      const clean = token.replace(/\.$/, '');
      const candidates = clean.includes('.') ? [clean, clean.split('.')[0]!] : [clean];
      for (const candidate of candidates) {
        if (candidate && refs.has(candidate)) {
          location = refs.get(candidate)!;
          aimed = candidate;
          break;
        }
      }
      if (location) break;
    }
    if (!location) {
      for (const n of nets) {
        if (descriptions.includes(n.name)) {
          location = n.routeSource ?? n.source ?? `${boardFile}:1`;
          aimed = `net ${n.name}`;
          break;
        }
      }
    }
    const where = aimed ? ` (${aimed})` : '';
    out.push({
      location: location ?? `${boardFile}:1`,
      message: `${v.description}${where}`,
      severity: v.severity,
      code: v.type,
    });
  }
  return out;
}
