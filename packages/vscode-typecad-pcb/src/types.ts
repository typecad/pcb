// ---------------------------------------------------------------------------
// Shape of the JSON `typecad-pcb query` emits. Mirrors the CLI's
// src/cli/typecad/board_model.ts + commands/query.ts — kept structural (all
// optional-ish parsing) so a benign CLI change degrades the hover instead of
// crashing it.
// ---------------------------------------------------------------------------

export interface BoardPad {
  pad: string;
  net: string | null;
  type: string;
  pinType?: string;
  at: { x: number; y: number };
  layers: string[];
}

/** `query components --json` entry (no pads — use the detail query for those). */
export interface ComponentSummary {
  reference: string;
  value: string;
  footprint: string;
  /** Source variable name recovered from the footprint's "Code" property. */
  variable?: string;
  /** Source file:line from the "Code" property, when present. */
  source?: string;
  side: 'front' | 'back';
  at: { x: number; y: number; rotation: number };
  dimensions: { width: number; height: number } | null;
  padCount: number;
}

/** `query nets --json` entry — source provenance per net (when the netlist carries it). */
export interface NetSourceSummary {
  name: string;
  /** "file:line" of the declaring pcb.net(...) call. */
  source?: string;
  /** "file:line" of the declaring pcb.route(<net>) call — where traces come from. */
  routeSource?: string;
}

/** `query unconnected --json` report — pads with no net plus single-pin nets. */
export interface UnconnectedReport {
  unconnectedPads: Array<{ reference: string; pad: string; type?: string }>;
  singlePinNets: string[];
}

/** `query component <ref> --json` — the summary plus pad-by-pad connectivity. */
export interface ComponentDetail extends ComponentSummary {
  /** Source file:line recovered from the "Code" property, when present. */
  source?: string;
  /** Pad designators carrying no net (mechanical pads excluded). */
  unconnectedPads: string[];
  pads: BoardPad[];
}
