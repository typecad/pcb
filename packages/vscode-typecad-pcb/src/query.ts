// ---------------------------------------------------------------------------
// Building `typecad-pcb query` command lines and parsing their --json output.
//
// The CLI is the single source of truth for board analysis (pad nets,
// unconnected pads, the source "Code" property); this extension only shells
// out to it — same producer/consumer split as the HAL breakpoint file. Output
// is clean JSON on stdout (chalk disables itself on non-TTY pipes), but npx
// can prepend noise, so parsing extracts the JSON document defensively.
// ---------------------------------------------------------------------------

import type { ComponentDetail, ComponentSummary, NetSourceSummary } from './types.js';

/** Characters safe to interpolate into a shell command line. */
const SAFE_ARG = /^[A-Za-z0-9_+\-.]+$/;

export class QueryError extends Error {
  constructor(
    message: string,
    /** True when the failure is just "no compiled board yet" — hover shows a hint. */
    public readonly boardMissing = false,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

/** `query components --json` — the index every hover resolution starts from. */
export function indexCommand(): string {
  return 'npx typecad-pcb query components --json';
}

/** `query nets --json` — every net with its source provenance. */
export function netsCommand(): string {
  return 'npx typecad-pcb query nets --json';
}

/** `query component <ref> --json` — pad-by-pad connectivity for one component. */
export function detailCommand(ref: string): string {
  if (!SAFE_ARG.test(ref)) {
    throw new QueryError(`Unsafe reference '${ref}' — refusing to build a query command`);
  }
  return `npx typecad-pcb query component ${ref} --json`;
}

/**
 * Extract the first JSON document from mixed output. `query --json` prints
 * exactly one document, but npx banners and other tooling occasionally write
 * to stdout too, so scan for the outermost braces/brackets.
 */
export function extractJson(output: string): unknown {
  const text = output.trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the scan
  }
  const start = text.search(/[{[]/);
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (start === -1 || end <= start) {
    throw new QueryError(`query output contained no JSON: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    // banner noise past the document (a stray '}' …) — classify it the same
    // way as no-JSON rather than leaking a raw SyntaxError to the hover
    throw new QueryError(`query output was not valid JSON: ${text.slice(0, 200)}`);
  }
}

/** The CLI reports its own failures as `{ error: true, message }` JSON. */
function throwIfCliError(parsed: unknown): void {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const doc = parsed as { error?: unknown; message?: unknown; code?: unknown };
    if (doc.error === true && typeof doc.message === 'string') {
      const boardMissing = doc.code === 'COMPONENT_NOT_FOUND' || /no \.kicad_pcb/i.test(doc.message);
      throw new QueryError(doc.message, boardMissing);
    }
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asPoint(value: unknown): { x: number; y: number } {
  if (value && typeof value === 'object') {
    const p = value as { x?: unknown; y?: unknown };
    return { x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 };
  }
  return { x: 0, y: 0 };
}

function asDimensions(value: unknown): ComponentSummary['dimensions'] {
  if (value && typeof value === 'object') {
    const d = value as { width?: unknown; height?: unknown };
    if (typeof d.width === 'number' && typeof d.height === 'number') {
      return { width: d.width, height: d.height };
    }
  }
  return null;
}

function parseSummary(raw: unknown): ComponentSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  const reference = asString(doc.reference);
  if (!reference) return null;
  return {
    reference,
    value: asString(doc.value),
    footprint: asString(doc.footprint),
    variable: typeof doc.variable === 'string' ? doc.variable : undefined,
    side: doc.side === 'back' ? 'back' : 'front',
    at: {
      ...asPoint(doc.at),
      rotation:
        typeof (doc.at as { rotation?: unknown })?.rotation === 'number'
          ? (doc.at as { rotation: number }).rotation
          : 0,
    },
    dimensions: asDimensions(doc.dimensions),
    padCount: typeof doc.padCount === 'number' ? doc.padCount : 0,
  };
}

/** Parse `query components --json` into the hover lookup index. */
export function parseComponentIndex(output: string): ComponentSummary[] {
  const parsed = extractJson(output);
  throwIfCliError(parsed);
  if (!Array.isArray(parsed)) {
    throw new QueryError('query components --json did not return an array');
  }
  const out: ComponentSummary[] = [];
  for (const raw of parsed) {
    const summary = parseSummary(raw);
    if (summary) out.push(summary);
  }
  return out;
}

/** Parse `query nets --json` into net-name -> source entries (sources optional). */
export function parseNetIndex(output: string): NetSourceSummary[] {
  const parsed = extractJson(output);
  throwIfCliError(parsed);
  if (!Array.isArray(parsed)) {
    throw new QueryError('query nets --json did not return an array');
  }
  const out: NetSourceSummary[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const net = raw as Record<string, unknown>;
    const name = asString(net.name);
    if (!name) continue;
    out.push({ name, source: asString(net.source) || undefined, routeSource: asString(net.routeSource) || undefined });
  }
  return out;
}

/** Parse `query component <ref> --json` into a hover-ready detail. */
export function parseComponentDetail(output: string): ComponentDetail {
  const parsed = extractJson(output);
  throwIfCliError(parsed);
  const summary = parseSummary(parsed);
  if (!summary) {
    throw new QueryError('query component --json did not return a component');
  }
  const doc = parsed as Record<string, unknown>;

  const pads: ComponentDetail['pads'] = [];
  if (Array.isArray(doc.pads)) {
    for (const raw of doc.pads) {
      if (!raw || typeof raw !== 'object') continue;
      const pad = raw as Record<string, unknown>;
      pads.push({
        pad: asString(pad.pad),
        net: typeof pad.net === 'string' ? pad.net : null,
        type: asString(pad.type),
        pinType: typeof pad.pinType === 'string' ? pad.pinType : undefined,
        at: asPoint(pad.at),
        layers: Array.isArray(pad.layers) ? pad.layers.filter((l): l is string => typeof l === 'string') : [],
      });
    }
  }

  const unconnectedPads = Array.isArray(doc.unconnectedPads)
    ? doc.unconnectedPads.filter((p): p is string => typeof p === 'string')
    : pads.filter((p) => p.net === null && p.type !== 'np_thru_hole').map((p) => p.pad);

  return {
    ...summary,
    source: typeof doc.source === 'string' ? doc.source : undefined,
    unconnectedPads,
    pads,
  };
}
