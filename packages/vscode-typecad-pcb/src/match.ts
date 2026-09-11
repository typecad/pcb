// ---------------------------------------------------------------------------
// Hovered identifier → board component.
//
// The compiled board's "Code" property records the source variable name for
// each footprint, so `let r1 = new Resistor(...)` matches R1 exactly. Order:
// exact variable, exact reference (case-insensitive — hovering `R1` on the
// variable works too), then variable case-insensitively.
// ---------------------------------------------------------------------------

import type { ComponentSummary } from './types.js';

export function matchComponent(components: ComponentSummary[], word: string): ComponentSummary | null {
  const exactVariable = components.find((c) => c.variable !== undefined && c.variable === word);
  if (exactVariable) return exactVariable;

  const upper = word.toUpperCase();
  const exactReference = components.find((c) => c.reference.toUpperCase() === upper);
  if (exactReference) return exactReference;

  const lower = word.toLowerCase();
  return components.find((c) => c.variable !== undefined && c.variable.toLowerCase() === lower) ?? null;
}
