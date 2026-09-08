/**
 * PCB design rules.
 *
 * Modern KiCad (9/10) stores board-wide design-rule constraints in the
 * `.kicad_pro` project file as JSON under `board.design_settings.rules`, and
 * the default net class dimensions under `net_settings.classes[0]`. The
 * `.kicad_pcb` `(setup ...)` block carries only plot/stackup settings, not DRC
 * constraints — `kicad-cli pcb drc` reads the sibling `.kicad_pro`.
 *
 * This module resolves user-supplied rules over the JLCPCB no-surcharge
 * defaults and merges them into a `.kicad_pro` document. It is the single
 * source of truth consumed by both DRC (via the project file) and the
 * autorouter (via `PCB.rules`).
 */

import fs from 'node:fs';
import { validatePositive } from '../utils/numeric_validation.js';
import type { ITeardropPolicy } from './pcb_teardrops.js';
import { teardropOptionsJson, teardropParametersJson } from './pcb_teardrops.js';

/**
 * Board-wide design rules, all values in millimeters.
 *
 * Field names mirror the JSON keys KiCad writes under
 * `board.design_settings.rules` in the `.kicad_pro` file so the mapping is
 * direct. Unspecified fields fall back to the JLCPCB no-surcharge standard
 * (see {@link JLCPCB_STANDARD_RULES}).
 */
export interface IPcbRules {
  /** Minimum edge-to-edge copper clearance. Default 0.20mm (JLC standard). */
  min_clearance?: number;
  /** Minimum track width. Default 0.20mm. */
  min_track_width?: number;
  /** Minimum via pad diameter. Default 0.60mm. */
  min_via_diameter?: number;
  /** Minimum through-hole (plated drill) diameter. Default 0.30mm. */
  min_through_hole_diameter?: number;
  /** Minimum via annular ring width. Default 0.15mm. */
  min_via_annular_width?: number;
  /** Minimum copper-to-board-edge clearance. Default 0.20mm. */
  min_copper_edge_clearance?: number;
  /** Minimum edge-to-edge spacing between holes. Default 0.25mm. */
  min_hole_to_hole?: number;
}

/**
 * JLCPCB no-surcharge standard design rules.
 *
 * These are the most permissive values JLCPCB will manufacture without a
 * premium surcharge, tuned for high yield. Source: JLCPCB capabilities
 * (https://jlcpcb.com/capabilities/pcb-capabilities).
 */
export const JLCPCB_STANDARD_RULES: Required<IPcbRules> = {
  min_clearance: 0.2,
  min_track_width: 0.2,
  min_via_diameter: 0.6,
  min_through_hole_diameter: 0.3,
  min_via_annular_width: 0.15,
  min_copper_edge_clearance: 0.2,
  min_hole_to_hole: 0.25,
};

/**
 * Resolve user-supplied rules over the JLCPCB standard defaults, validating
 * every value is a positive finite number.
 *
 * @param rules - Optional partial rules from the PCB constructor.
 * @returns A complete, validated rules object.
 */
export function resolveRules(rules?: IPcbRules): Required<IPcbRules> {
  const resolved: Required<IPcbRules> = { ...JLCPCB_STANDARD_RULES };
  if (rules) {
    for (const key of Object.keys(rules) as (keyof IPcbRules)[]) {
      const value = rules[key];
      if (value !== undefined) {
        resolved[key] = validatePositive(value, `rules.${key}`);
      }
    }
  }
  return resolved;
}

/**
 * Shape of the `board.design_settings.rules` object in a `.kicad_pro` file.
 * typecad only authors the DRC-relevant subset; KiCad fills the rest.
 */
type ProjectRules = Record<string, number | boolean> & {
  min_clearance: number;
  min_track_width: number;
  min_via_diameter: number;
  min_through_hole_diameter: number;
  min_via_annular_width: number;
  min_copper_edge_clearance: number;
  min_hole_to_hole: number;
};

/** A `.kicad_pro` project document parsed as JSON (the subset typecad touches). */
interface ProjectFile {
  board?: {
    design_settings?: {
      rules?: ProjectRules;
      teardrop_options?: Array<Record<string, unknown>>;
      teardrop_parameters?: Array<Record<string, unknown>>;
    };
  };
  net_settings?: {
    classes?: INetClass[];
    netclass_patterns?: NetClassPattern[];
  };
  [key: string]: unknown;
}

/** A `netclass_patterns` entry mapping a net name to a class. */
interface NetClassPattern {
  netclass: string;
  pattern: string;
}

/**
 * A net class entry in `.kicad_pro` `net_settings.classes`. Shape mirrors the
 * KiCad 10 project-file format (see the `one_hz.kicad_pro` fixture).
 */
export interface INetClass {
  name: string;
  bus_width?: number;
  clearance?: number;
  diff_pair_gap?: number;
  diff_pair_via_gap?: number;
  diff_pair_width?: number;
  line_style?: number;
  microvia_diameter?: number;
  microvia_drill?: number;
  pcb_color?: string;
  priority?: number;
  schematic_color?: string;
  track_width?: number;
  tuning_profile?: string;
  via_diameter?: number;
  via_drill?: number;
  wire_width?: number;
}

/**
 * User-facing net-class definition options (mm). Passed to `pcb.netClass()`.
 * Unspecified dimensions fall back to the board design rules so a class never
 * goes below the manufacturing floor.
 */
export interface INetClassOptions {
  /** Trace width for nets in this class. Defaults to rules.min_track_width. */
  track_width?: number;
  /** Copper clearance for nets in this class. Defaults to rules.min_clearance. */
  clearance?: number;
  /** Via pad diameter for nets in this class. Defaults to rules.min_via_diameter. */
  via_diameter?: number;
  /** Via drill for nets in this class. Defaults to rules.min_through_hole_diameter. */
  via_drill?: number;
  /**
   * Preferred routing layers for nets in this class (e.g. `['In1.Cu']`).
   * The autorouter favors these layers for assigned nets. Must be declared
   * copper layers. Empty (default) means no preference. This is a typeCAD
   * routing directive — KiCad net classes have no layer field, so it is not
   * written to the `.kicad_pro`.
   */
  layers?: string[];
}

/**
 * Resolve net-class options over the board rules floor. Every dimension is
 * guaranteed to be present and at least as large as the corresponding board
 * rule.
 *
 * @param opts - Partial net-class options from `pcb.netClass()`.
 * @param rules - Resolved board rules used as the floor for unspecified fields.
 */
export function resolveNetClassOptions(opts: INetClassOptions, rules: Required<IPcbRules>): Required<INetClassOptions> {
  return {
    track_width: opts.track_width ?? rules.min_track_width,
    clearance: opts.clearance ?? rules.min_clearance,
    via_diameter: opts.via_diameter ?? rules.min_via_diameter,
    via_drill: opts.via_drill ?? rules.min_through_hole_diameter,
    layers: opts.layers ?? [],
  };
}

/**
 * The keys in {@link IPcbRules} that correspond to `.kicad_pro` board-level
 * DRC rules (as opposed to the default net class).
 */
const RULE_KEYS: ReadonlyArray<keyof IPcbRules> = [
  'min_clearance',
  'min_track_width',
  'min_via_diameter',
  'min_through_hole_diameter',
  'min_via_annular_width',
  'min_copper_edge_clearance',
  'min_hole_to_hole',
];

/**
 * Build the `board.design_settings.rules` object for the `.kicad_pro` file
 * from resolved rules, preserving any non-typecad keys already present.
 *
 * @param rules - Resolved (complete) rules.
 * @param existing - Existing rules object to preserve unknown keys from.
 */
export function buildProjectRules(rules: Required<IPcbRules>, existing?: Record<string, unknown>): ProjectRules {
  const out: ProjectRules = {
    ...(existing as ProjectRules | undefined),
    min_clearance: rules.min_clearance,
    min_track_width: rules.min_track_width,
    min_via_diameter: rules.min_via_diameter,
    min_through_hole_diameter: rules.min_through_hole_diameter,
    min_via_annular_width: rules.min_via_annular_width,
    min_copper_edge_clearance: rules.min_copper_edge_clearance,
    min_hole_to_hole: rules.min_hole_to_hole,
  };
  return out;
}

/**
 * Build a full `.kicad_pro` net-class object from resolved options, filling in
 * the standard default fields KiCad expects (matches the `one_hz.kicad_pro`
 * `Default` class shape). The caller sets `priority` per definition order.
 *
 * Diff-pair dimensions are intentionally omitted: typeCAD has no differential
 * pair routing yet, and writing hard-coded values here would make KiCad's DRC
 * enforce geometry the user never chose. KiCad fills its own defaults.
 */
function buildNetClass(name: string, dims: Required<INetClassOptions>, priority: number): INetClass {
  return {
    name,
    bus_width: 12,
    clearance: dims.clearance,
    line_style: 0,
    microvia_diameter: 0.3,
    microvia_drill: 0.1,
    pcb_color: 'rgba(0, 0, 0, 0.000)',
    priority,
    schematic_color: 'rgba(0, 0, 0, 0.000)',
    track_width: dims.track_width,
    tuning_profile: '',
    via_diameter: dims.via_diameter,
    via_drill: dims.via_drill,
    wire_width: 6,
  };
}

/**
 * Merge resolved rules and net classes into a `.kicad_pro` JSON document string.
 *
 * Writes `board.design_settings.rules`, the `Default` net class (mirrors board
 * rules), any user-defined net classes, and net→class assignments
 * (`netclass_patterns`). Existing project structure and unknown classes/patterns
 * are preserved.
 *
 * If the project file is empty or unparseable (e.g. a freshly scaffolded
 * project), a minimal valid project shell is created.
 *
 * @param projectJson - The raw `.kicad_pro` contents (may be empty).
 * @param rules - Resolved rules.
 * @param netClasses - Optional map of class name → resolved dimensions.
 * @param assignments - Optional array of `{netName, className}` assignments.
 * @returns The updated `.kicad_pro` JSON string.
 */
export function mergeRulesIntoProject(
  projectJson: string,
  rules: Required<IPcbRules>,
  netClasses?: ReadonlyMap<string, Required<INetClassOptions>>,
  assignments?: ReadonlyArray<{ netName: string; className: string }>,
  teardrops?: ITeardropPolicy,
): string {
  let doc: ProjectFile;
  if (projectJson.trim().length > 0) {
    try {
      doc = JSON.parse(projectJson) as ProjectFile;
    } catch {
      doc = {};
    }
  } else {
    doc = {};
  }

  doc.board = doc.board ?? {};
  doc.board.design_settings = doc.board.design_settings ?? {};
  const existingRules = doc.board.design_settings.rules as Record<string, unknown> | undefined;
  doc.board.design_settings.rules = buildProjectRules(rules, existingRules);

  // Teardrop tool configuration (fixture shape under design_settings); only
  // written when the board opted in via pcb.teardrops().
  if (teardrops?.enabled) {
    doc.board.design_settings.teardrop_options = teardropOptionsJson(teardrops);
    doc.board.design_settings.teardrop_parameters = teardropParametersJson(teardrops);
  }

  // Keep the "Default" net class consistent with the board rules so the
  // autorouter's fallbacks and DRC agree. The default net class is the one
  // KiCad applies to every net without an explicit class assignment. If no
  // Default class exists (fresh project), seed a minimal one.
  doc.net_settings = doc.net_settings ?? {};
  doc.net_settings.classes = Array.isArray(doc.net_settings.classes) ? doc.net_settings.classes : [];
  let defaultClass = doc.net_settings.classes.find((c) => c.name === 'Default');
  if (!defaultClass) {
    defaultClass = {
      name: 'Default',
      bus_width: 12,
      line_style: 0,
      microvia_diameter: 0.3,
      microvia_drill: 0.1,
      pcb_color: 'rgba(0, 0, 0, 0.000)',
      priority: 2147483647,
      schematic_color: 'rgba(0, 0, 0, 0.000)',
      tuning_profile: '',
      wire_width: 6,
    };
    doc.net_settings.classes.push(defaultClass);
  }
  defaultClass.clearance = rules.min_clearance;
  defaultClass.track_width = rules.min_track_width;
  defaultClass.via_diameter = rules.min_via_diameter;
  defaultClass.via_drill = rules.min_through_hole_diameter;

  // Seed/update user-defined net classes. Priority decreases with definition
  // order (Default keeps the max priority as KiCad's fallback). We replace any
  // existing typecad-managed class of the same name; classes we don't manage
  // are left untouched.
  if (netClasses && netClasses.size > 0) {
    let priority = 50; // user classes sit well below Default (2147483647)
    for (const [name, dims] of netClasses) {
      const idx = doc.net_settings.classes.findIndex((c) => c.name === name);
      const cls = buildNetClass(name, dims, priority);
      if (idx >= 0) {
        doc.net_settings.classes[idx] = cls;
      } else {
        doc.net_settings.classes.push(cls);
      }
      priority = Math.max(0, priority - 1);
    }
  }

  // Write net→class assignments as netclass_patterns. We replace patterns for
  // nets we manage and preserve any others.
  if (assignments && assignments.length > 0) {
    const existing = Array.isArray(doc.net_settings.netclass_patterns) ? doc.net_settings.netclass_patterns : [];
    const managed = new Set(assignments.map((a) => a.netName));
    const preserved = existing.filter((p) => !managed.has(p.pattern));
    doc.net_settings.netclass_patterns = [
      ...preserved,
      ...assignments.map((a) => ({ netclass: a.className, pattern: a.netName })),
    ];
  }

  return JSON.stringify(doc, null, 2);
}

/**
 * Read the `.kicad_pro` file for a board, merge resolved rules and net classes
 * into it, and write it back. Creates a minimal project shell if the file is
 * missing or empty. No-op safe: always produces valid JSON KiCad can open.
 *
 * @param boardName - Board name (the `.kicad_pro` lives at `./build/<name>.kicad_pro`).
 * @param rules - Resolved rules.
 * @param netClasses - Optional map of class name → resolved dimensions.
 * @param assignments - Optional array of `{netName, className}` assignments.
 */
export function writeRulesToProject(
  boardName: string,
  rules: Required<IPcbRules>,
  netClasses?: ReadonlyMap<string, Required<INetClassOptions>>,
  assignments?: ReadonlyArray<{ netName: string; className: string }>,
  teardrops?: ITeardropPolicy,
): void {
  const projectPath = `./build/${boardName}.kicad_pro`;
  let existing = '';
  try {
    existing = fs.existsSync(projectPath) ? fs.readFileSync(projectPath, 'utf8') : '';
  } catch {
    existing = '';
  }
  const updated = mergeRulesIntoProject(existing, rules, netClasses, assignments, teardrops);
  fs.writeFileSync(projectPath, updated, 'utf8');
}

export { RULE_KEYS };
