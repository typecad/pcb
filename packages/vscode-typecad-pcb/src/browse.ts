// ---------------------------------------------------------------------------
// QuickPick items for "Browse Components" — pure, vscode-free.
// ---------------------------------------------------------------------------

import type { ComponentSummary } from './types.js';

export interface BrowseItem {
  /** The reference designator to zoom to on accept. */
  ref: string;
  label: string;
  description: string;
  detail?: string;
}

/** `R1 — 1k` labels with the footprint as description, numeric sort. */
export function browseItems(components: ComponentSummary[]): BrowseItem[] {
  return [...components]
    .sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }))
    .map((c) => ({
      ref: c.reference,
      label: `${c.reference}${c.value ? ` — ${c.value}` : ''}`,
      description: c.footprint,
      detail: c.variable ? `source: ${c.variable}` : undefined,
    }));
}
