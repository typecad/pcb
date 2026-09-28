// ---------------------------------------------------------------------------
// Native ERC engine — electrical correctness over the typeCAD object model.
//
// In typeCAD the schematic is a rendering artifact of the code-defined
// netlist, so ERC never parses a .kicad_sch: the PCB's Schematic already
// holds every component, pin (with electrical type) and net. The engine
// answers exactly two questions:
//
//   pin_not_connected   a symbol-library roster pin that no net() (or dnc())
//                       ever touched — dnc'd pins sit in a net by
//                       construction, so they read as handled
//   pin_to_pin          a net tying electrically incompatible pins together
//                       (two drivers: output+output, output+tri_state, ...)
//
// Driver analysis (pin_not_driven) and schematic-document checks (dangling
// labels, references, hierarchy) are deliberately out of scope. Power pins
// (power_in/power_out) are compatible with everything: typeCAD stamps a
// PWR_FLAG — a power_out — on every rail, so power conflicts would all be
// false positives.
//
// Pin electrical types resolve as: the Pin's own type when explicitly set
// (component.pin(n, { type }), dnc(), contracts/packages), else the symbol
// library's etype for that pin number, else the 'passive' default.
// ---------------------------------------------------------------------------
import { getSymbolLibraryManager } from '../symbol_library_manager.js';
import type { PinInfo } from '../renderers/schematic_visualizer_types.js';
import type { Schematic } from '../schematic.js';
import type { Component } from '../component.js';
import type { Pin } from '../pin.js';

/** KiCad JSON report violation shape (subset the printers consume). */
export interface ErcViolation {
  type: string;
  severity: 'error' | 'warning' | 'ignore';
  description: string;
  items: Array<{ description: string; pos?: { x: number; y: number }; uuid?: string }>;
}

export interface ErcReport {
  violations: ErcViolation[];
}

export interface ErcOptions {
  /** check id → severity override (conf constraints severities map) */
  severities?: Record<string, 'error' | 'warning' | 'ignore'>;
  /**
   * Roster lookup injection (tests / non-library setups). Returns the
   * component's full pin universe keyed by pin number, or null when the
   * symbol cannot be resolved — null skips the pin_not_connected check for
   * that component without touching conflict checking of its netted pins.
   */
  pinInfoFor?: (component: Component) => Map<string, PinInfo> | null;
}

const DEFAULT_SEVERITIES: Record<string, 'error' | 'warning'> = {
  pin_not_connected: 'error',
  pin_to_pin: 'error',
};

/**
 * Unordered electrical-type pairs that cannot share a net: two drivers fight.
 * Open-collector/open-emitter pins stack by design (wired-OR/AND) and are
 * only flagged against hard drivers. Passive, input, bidirectional,
 * unspecified, free and power pins are compatible with everything.
 */
const pairKey = (a: string, b: string): string => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const CONFLICT_PAIRS = new Set(
  (
    [
      ['output', 'output'],
      ['output', 'tri_state'],
      ['output', 'open_collector'],
      ['output', 'open_emitter'],
      ['tri_state', 'tri_state'],
      ['tri_state', 'open_collector'],
      ['tri_state', 'open_emitter'],
    ] as const
  ).map(([a, b]) => pairKey(a, b)),
);

const TYPE_LABELS: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  bidirectional: 'Bidirectional',
  tri_state: 'Tri-state',
  passive: 'Passive',
  unspecified: 'Unspecified',
  power_in: 'Power input',
  power_out: 'Power output',
  free: 'Free',
  open_collector: 'Open collector',
  open_emitter: 'Open emitter',
  no_connect: 'No connect',
};

const etypeLabel = (type: string): string => TYPE_LABELS[type] ?? type;

function conflicts(a: string, b: string): boolean {
  return CONFLICT_PAIRS.has(pairKey(a, b));
}

/** Default roster resolver: the shared symbol-library singleton, degrading
 *  silently when the symbol (or the library itself) is unavailable. */
function libraryRoster(component: Component): Map<string, PinInfo> | null {
  try {
    const manager = getSymbolLibraryManager();
    if (!manager.hasSymbol(component.symbol)) return null;
    return manager.getPinInfoMap(component.symbol);
  } catch {
    return null;
  }
}

/**
 * Run the electrical rules check over a Schematic's object model. Pure:
 * reads components/nets, resolves library pin types, returns violations —
 * no files, no side effects on the model.
 */
export function runErc(schematic: Schematic, options: ErcOptions = {}): ErcReport {
  const severities = options.severities ?? {};
  const rosterFor = options.pinInfoFor ?? libraryRoster;

  const violations: ErcViolation[] = [];
  const report = (type: string, description: string, items: ErcViolation['items']): void => {
    const severity = severities[type] ?? DEFAULT_SEVERITIES[type] ?? 'error';
    if (severity === 'ignore') return;
    violations.push({ type, severity, description, items });
  };

  // Backfill owners for standalone pins (class-field `new Pin(...)`
  // declarations) so net membership attributes to a component — the same
  // backfill the schematic renderer performs before placing labels.
  const componentsByReference = new Map<string, Component>();
  for (const component of schematic.components) {
    if (component && component.reference) {
      componentsByReference.set(component.reference, component);
    }
  }
  const nodes = schematic.nodes;
  for (const node of nodes) {
    for (const pin of node.nodes) {
      if (pin && !pin.owner) {
        pin.owner = componentsByReference.get(pin.reference) ?? null;
      }
    }
  }

  const analyzable = schematic.components.filter(
    (component) => component && !component.via && component.dnp !== true,
  );

  // one roster per component (roster pass + conflict-pass etype refinement)
  const rosters = new Map<Component, Map<string, PinInfo> | null>();
  for (const component of analyzable) {
    if (!component.symbol) continue;
    rosters.set(component, rosterFor(component));
  }

  // ---- pin_not_connected: roster pins no net ever touched -----------------
  // A pin "counts" as handled when some net carries a pin with the same
  // owner reference and pin number (dnc'd pins are in a net by construction).
  const netted = new Set<string>();
  for (const node of nodes) {
    for (const pin of node.nodes) {
      if (!pin) continue;
      const ref = pin.owner ? pin.owner.reference : pin.reference;
      netted.add(`${ref}\0${pin.number}`);
    }
  }
  for (const [component, roster] of rosters) {
    if (!roster) continue; // unknowable pin universe: skip the check
    for (const [number, info] of roster) {
      if (netted.has(`${component.reference}\0${number}`)) continue;
      report('pin_not_connected', 'Pin not connected', [
        {
          description: `Symbol ${component.reference} Pin ${number} [${info.name}, ${etypeLabel(info.type)}]`,
          uuid: component.uuid,
        },
      ]);
    }
  }

  // ---- pin_to_pin: incompatible electrical types on one net ---------------
  const effectiveType = (pin: Pin): string => {
    if (pin.type && pin.type !== 'passive') return pin.type;
    const roster = pin.owner !== null ? rosters.get(pin.owner) : undefined;
    return roster?.get(pin.number)?.type ?? pin.type;
  };
  const pinItem = (pin: Pin): ErcViolation['items'][number] => {
    const ref = pin.owner ? pin.owner.reference : pin.reference;
    const number = pin.number;
    const type = etypeLabel(effectiveType(pin));
    const name =
      (pin.owner !== null ? rosters.get(pin.owner) : undefined)?.get(number)?.name ?? '';
    return {
      description: `Symbol ${ref} Pin ${number} [${name}, ${type}]`,
      ...(pin.uuid ? { uuid: pin.uuid } : {}),
    };
  };

  for (const node of nodes) {
    const pins = node.nodes.filter((pin) => pin && pin.type !== 'no_connect');
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i]!;
        const b = pins[j]!;
        if (!conflicts(effectiveType(a), effectiveType(b))) continue;
        report('pin_to_pin', 'Pins of incompatible electrical types on net', [
          pinItem(a),
          pinItem(b),
        ]);
      }
    }
  }

  return { violations };
}
