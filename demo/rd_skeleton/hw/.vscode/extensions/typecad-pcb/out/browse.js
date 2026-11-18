"use strict";
// ---------------------------------------------------------------------------
// QuickPick items for "Browse Components" — pure, vscode-free.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.browseItems = browseItems;
/** `R1 — 1k` labels with the footprint as description, numeric sort. */
function browseItems(components) {
    return [...components]
        .sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }))
        .map((c) => ({
        ref: c.reference,
        label: `${c.reference}${c.value ? ` — ${c.value}` : ''}`,
        description: c.footprint,
        detail: c.variable ? `source: ${c.variable}` : undefined,
    }));
}
//# sourceMappingURL=browse.js.map