/**
 * Layer stackup generation.
 *
 * Modern KiCad (9/10) stores the board's physical layer construction in a
 * `(stackup ...)` S-expression block inside `(setup ...)`, and the layer
 * declaration table in a top-level `(layers ...)` block. The two must stay
 * consistent: a 4-layer stackup must declare `In1.Cu`/`In2.Cu` in `(layers ...)`
 * as well.
 *
 * This module generates JLCPCB-standard stackups (FR4, 1oz copper, green mask)
 * for any copper-layer count from 2 to 32, plus the matching `(layers ...)`
 * declaration block. It mirrors the structure of the KiCad 10 fixture
 * `one_hz.kicad_pcb:36-88`.
 */

import { s, ss, sym, str, yes, no } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';

/**
 * Per-layer stackup overrides, keyed by layer name (e.g. `'In1.Cu'`,
 * `'dielectric 2'`, `'F.Mask'`). Applied on top of the JLCPCB-standard
 * presets; a thickness override on a dielectric is compensated by the
 * remaining (non-overridden) dielectrics so the board still totals
 * `pcb.thickness`.
 */
export interface IStackupLayerOverride {
  /** Layer thickness in mm. */
  thickness?: number;
  /** Material name, e.g. `'FR4'`, `'Rogers 4350B'`. */
  material?: string;
  /** Relative permittivity (dielectric constant). */
  epsilon_r?: number;
  /** Dielectric loss tangent. */
  loss_tangent?: number;
  /** Color string for dielectric/copper entries. */
  color?: string;
}

/** Stackup-level options (per-layer materials are JLCPCB-standard presets). */
export interface IStackupOptions {
  /** Copper surface finish, e.g. "None", "HASL", "ENIG". Default "None". */
  copper_finish?: string;
  /** Whether dielectric constraints are enforced. Default false. */
  dielectric_constraints?: boolean;
  /** Per-layer overrides keyed by layer name (coppers, dielectrics, masks). */
  layers?: Record<string, IStackupLayerOverride>;
}

/** KiCad supports a maximum of 32 copper layers. */
export const MAX_COPPER_LAYERS = 32;
/** Minimum copper layers (top + bottom). */
export const MIN_COPPER_LAYERS = 2;

/** Standard solder mask thickness in mm (JLCPCB dry film). */
const MASK_THICKNESS_MM = 0.01;
/** Default FR4 dielectric constant used by the JLCPCB preset. */
const DEFAULT_DIELECTRIC_ER = 4.5;
/** Default FR4 loss tangent used by the JLCPCB preset. */
const DEFAULT_DIELECTRIC_LOSS_TANGENT = 0.02;
/** Default copper thickness for 1 oz copper, in mm. */
const COPPER_UM_TO_MM = (um: number) => um / 1000;

/** Resolved physical geometry of a board's stackup. */
export interface IStackupGeometry {
  /** Thickness of every copper layer in mm (entry per {@link copperLayerNames} order). */
  copperThicknessMm: number[];
  /** Solder mask thickness in mm (top and bottom). */
  maskThicknessMm: number;
  /**
   * Dielectric layers, top → bottom. Dielectric `i` (0-based here) sits
   * between copper `i` and copper `i+1`.
   */
  dielectrics: Array<{
    /** KiCad stackup name, e.g. `'dielectric 1'`. */
    name: string;
    type: 'prepreg' | 'core';
    thicknessMm: number;
    material: string;
    epsilonR: number;
    lossTangent: number;
  }>;
}

/** Valid layer names a stackup override may target. */
function overridableLayerNames(layerCount: number): string[] {
  const dielectrics = Array.from({ length: layerCount - 1 }, (_, i) => `dielectric ${i + 1}`);
  return [
    ...copperLayerNames(layerCount),
    ...dielectrics,
    'F.Mask',
    'B.Mask',
    'F.SilkS',
    'B.SilkS',
    'F.Paste',
    'B.Paste',
  ];
}

/**
 * Resolve the physical geometry of a board's stackup: copper, mask, and
 * dielectric thicknesses/materials. This is the single source of truth used
 * by `buildStackup` (writing the KiCad `(stackup ...)` block) and by the
 * impedance calculator — the two can never disagree.
 *
 * Defaults follow the JLCPCB-standard preset (FR4, prepreg outer dielectrics
 * ≤0.21mm, core inner). Per-layer `overrides` replace named entries; any
 * remaining dielectric budget is redistributed across non-overridden
 * dielectrics so copper + dielectric + mask still sums to `boardThickness`.
 *
 * @throws {RangeError} on an unknown override name, non-positive thickness,
 *   or overrides that leave no room for the remaining dielectrics.
 */
export function resolveStackupGeometry(
  layerCount: number,
  boardThickness: number,
  copperThicknessUm: number,
  overrides?: Record<string, IStackupLayerOverride>,
): IStackupGeometry {
  validateLayerCount(layerCount);
  const nCopper = layerCount;
  const nDielectric = nCopper - 1;
  const copperMm = COPPER_UM_TO_MM(copperThicknessUm);

  if (overrides) {
    const valid = new Set(overridableLayerNames(layerCount));
    for (const name of Object.keys(overrides)) {
      if (!valid.has(name)) {
        throw new RangeError(
          `stackup override names unknown layer "${name}". Valid layer names for a ` +
            `${layerCount}-layer board: ${Array.from(valid).join(', ')}`,
        );
      }
      const thickness = overrides[name].thickness;
      if (thickness !== undefined && (!Number.isFinite(thickness) || thickness <= 0)) {
        throw new RangeError(`stackup override for "${name}" has non-positive thickness ${thickness}`);
      }
    }
  }

  // Copper thicknesses: uniform default, per-layer override wins.
  const copperThicknesses = copperLayerNames(nCopper).map((name) => overrides?.[name]?.thickness ?? copperMm);

  // Default dielectric distribution: prepregs on the outside (≤0.21mm),
  // core in the middle taking the bulk.
  const totalDielectric = Math.max(
    0.01,
    boardThickness - copperThicknesses.reduce((a, b) => a + b, 0) - 2 * MASK_THICKNESS_MM,
  );
  const prepregDefault = nDielectric >= 2 ? Math.min(0.21, totalDielectric / nDielectric) : 0;
  const coreCount = nDielectric <= 1 ? nDielectric : nDielectric - 2;
  const coreDefault = coreCount > 0 ? Math.max(0.1, (totalDielectric - 2 * prepregDefault) / coreCount) : 0;

  const dielectrics: IStackupGeometry['dielectrics'] = [];
  for (let i = 0; i < nDielectric; i++) {
    const name = `dielectric ${i + 1}`;
    const isOuter = i === 0 || i === nDielectric - 1;
    const preset = isOuter && nDielectric >= 2 ? prepregDefault : coreDefault || prepregDefault;
    dielectrics.push({
      name,
      type: isOuter && nDielectric >= 2 ? 'prepreg' : 'core',
      thicknessMm: overrides?.[name]?.thickness ?? preset,
      material: overrides?.[name]?.material ?? 'FR4',
      epsilonR: overrides?.[name]?.epsilon_r ?? DEFAULT_DIELECTRIC_ER,
      lossTangent: overrides?.[name]?.loss_tangent ?? DEFAULT_DIELECTRIC_LOSS_TANGENT,
    });
  }

  // Compensate for overridden thicknesses (dielectric or copper) so the
  // board still totals boardThickness: redistribute the remaining budget
  // across the non-overridden dielectrics with the preset prepreg/core split.
  const overridden = new Set(
    dielectrics.filter((d) => overrides?.[d.name]?.thickness !== undefined).map((d) => d.name),
  );
  if (
    overridden.size > 0 ||
    copperThicknesses.some((t, i) => overrides?.[copperLayerNames(nCopper)[i]]?.thickness !== undefined)
  ) {
    const fixedDielectric = dielectrics.filter((d) => overridden.has(d.name)).reduce((a, d) => a + d.thicknessMm, 0);
    const budget =
      boardThickness - 2 * MASK_THICKNESS_MM - copperThicknesses.reduce((a, b) => a + b, 0) - fixedDielectric;
    const flexible = dielectrics.filter((d) => !overridden.has(d.name));
    if (flexible.length > 0) {
      if (budget <= 0.01) {
        throw new RangeError(
          `stackup overrides leave only ${budget.toFixed(3)}mm for the remaining ` +
            `${flexible.length} dielectric layer(s); reduce the overridden thicknesses or increase pcb.thickness`,
        );
      }
      const flexPrepregs = flexible.filter((d) => d.type === 'prepreg');
      const flexCores = flexible.filter((d) => d.type === 'core');
      let prepregEach = 0;
      let coreEach = 0;
      if (flexPrepregs.length > 0 && flexCores.length > 0) {
        // Prepregs keep their ≤0.21mm preset; the core absorbs the rest.
        prepregEach = Math.min(0.21, budget / flexible.length);
        coreEach = Math.max(0.1, (budget - prepregEach * flexPrepregs.length) / flexCores.length);
      } else if (flexCores.length > 0) {
        coreEach = Math.max(0.1, budget / flexCores.length);
      } else if (flexPrepregs.length > 0) {
        // Only prepregs left: they share the whole budget.
        prepregEach = budget / flexPrepregs.length;
      }
      for (const d of flexible) {
        d.thicknessMm = d.type === 'prepreg' ? prepregEach : coreEach;
      }
    }
  }

  return {
    copperThicknessMm: copperThicknesses,
    maskThicknessMm: MASK_THICKNESS_MM,
    dielectrics,
  };
}

/**
 * Validate a copper-layer count.
 * @throws {RangeError} if not an integer in [2, 32].
 */
export function validateLayerCount(layerCount: number): void {
  if (!Number.isInteger(layerCount) || layerCount < MIN_COPPER_LAYERS || layerCount > MAX_COPPER_LAYERS) {
    throw new RangeError(
      `layer count must be an integer between ${MIN_COPPER_LAYERS} and ${MAX_COPPER_LAYERS}, got ${layerCount}`,
    );
  }
}

/**
 * Build a single `(layer ...)` stackup entry node. Only provided fields are
 * emitted; KiCad treats omitted fields as unspecified.
 */
function stackupLayerNode(
  name: string,
  fields: {
    type?: string;
    color?: string;
    thickness?: number;
    material?: string;
    epsilon_r?: number;
    loss_tangent?: number;
  },
): SExpr {
  const children: SExpr[] = [str(name)];
  if (fields.type !== undefined) children.push(s('type', str(fields.type)));
  if (fields.color !== undefined) children.push(s('color', str(fields.color)));
  if (fields.thickness !== undefined) children.push(s('thickness', fields.thickness));
  if (fields.material !== undefined) children.push(s('material', str(fields.material)));
  if (fields.epsilon_r !== undefined) children.push(s('epsilon_r', fields.epsilon_r));
  if (fields.loss_tangent !== undefined) children.push(s('loss_tangent', fields.loss_tangent));
  return s('layer', ...children);
}

/**
 * Build the `(stackup ...)` S-expression node for a board.
 *
 * Layers are emitted top → bottom: silkscreen, paste, mask, copper(s) with
 * dielectrics between them, mask, paste, silkscreen. Geometry comes from
 * {@link resolveStackupGeometry} (JLCPCB-standard presets plus per-layer
 * overrides), so copper + dielectric + mask sum to `boardThickness`.
 *
 * @param layerCount - Number of copper layers (2–32).
 * @param boardThickness - Total board thickness in mm.
 * @param copperThicknessUm - Copper thickness in microns (e.g. 35 for 1 oz).
 * @param options - Optional stackup-level and per-layer overrides.
 * @returns The `(stackup ...)` SExpr node.
 */
export function buildStackup(
  layerCount: number,
  boardThickness: number,
  copperThicknessUm: number,
  options?: IStackupOptions,
): SExpr {
  validateLayerCount(layerCount);
  const geometry = resolveStackupGeometry(layerCount, boardThickness, copperThicknessUm, options?.layers);

  const layers: SExpr[] = [];

  // ── Top: silk → paste → mask ──────────────────────────────────────────
  layers.push(
    stackupLayerNode('F.SilkS', {
      type: 'Top Silk Screen',
      color: options?.layers?.['F.SilkS']?.color ?? 'White',
      material: options?.layers?.['F.SilkS']?.material ?? 'Liquid Photo',
    }),
  );
  layers.push(stackupLayerNode('F.Paste', { type: 'Top Solder Paste' }));
  layers.push(
    stackupLayerNode('F.Mask', {
      type: 'Top Solder Mask',
      color: options?.layers?.['F.Mask']?.color ?? 'Green',
      thickness: geometry.maskThicknessMm,
      material: options?.layers?.['F.Mask']?.material ?? 'Dry Film',
      epsilon_r: options?.layers?.['F.Mask']?.epsilon_r ?? 3.3,
      loss_tangent: options?.layers?.['F.Mask']?.loss_tangent ?? 0,
    }),
  );

  // ── Copper + dielectric layers, top → bottom ─────────────────────────
  const copperNames = copperLayerNames(layerCount);
  for (let i = 0; i < layerCount; i++) {
    layers.push(
      stackupLayerNode(copperNames[i], {
        type: 'copper',
        thickness: round4(geometry.copperThicknessMm[i]),
      }),
    );
    // dielectric after this copper, except the last
    if (i < layerCount - 1) {
      const d = geometry.dielectrics[i];
      layers.push(
        stackupLayerNode(d.name, {
          type: d.type,
          color: options?.layers?.[d.name]?.color ?? 'FR4 natural',
          thickness: round4(d.thicknessMm),
          material: d.material,
          epsilon_r: d.epsilonR,
          loss_tangent: d.lossTangent,
        }),
      );
    }
  }

  // ── Bottom: mask → paste → silk ───────────────────────────────────────
  layers.push(
    stackupLayerNode('B.Mask', {
      type: 'Bottom Solder Mask',
      color: options?.layers?.['B.Mask']?.color ?? 'Green',
      thickness: geometry.maskThicknessMm,
      material: options?.layers?.['B.Mask']?.material ?? 'Dry Film',
      epsilon_r: options?.layers?.['B.Mask']?.epsilon_r ?? 3.3,
      loss_tangent: options?.layers?.['B.Mask']?.loss_tangent ?? 0,
    }),
  );
  layers.push(stackupLayerNode('B.Paste', { type: 'Bottom Solder Paste' }));
  layers.push(
    stackupLayerNode('B.SilkS', {
      type: 'Bottom Silk Screen',
      color: options?.layers?.['B.SilkS']?.color ?? 'White',
      material: options?.layers?.['B.SilkS']?.material ?? 'Liquid Photo',
    }),
  );

  // ── Stackup-level attributes ──────────────────────────────────────────
  layers.push(s('copper_finish', str(options?.copper_finish ?? 'None')));
  layers.push(s('dielectric_constraints', options?.dielectric_constraints ? yes() : no()));

  return s('stackup', ...layers);
}

/**
 * Compute the copper layer names for a given count, top → bottom.
 * 2-layer: ["F.Cu", "B.Cu"]; 4-layer: ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]; etc.
 */
export function copperLayerNames(layerCount: number): string[] {
  validateLayerCount(layerCount);
  if (layerCount === 2) return ['F.Cu', 'B.Cu'];
  const inner = layerCount - 2;
  const names = ['F.Cu'];
  for (let i = 1; i <= inner; i++) names.push(`In${i}.Cu`);
  names.push('B.Cu');
  return names;
}

/**
 * Copper layer declaration entries for the `(layers ...)` block.
 *
 * For 2-layer boards KiCad uses a compact ID scheme (F.Cu=0, B.Cu=2). For
 * 3+ layers it uses the canonical scheme (F.Cu=0, In1.Cu=1, ..., B.Cu=31).
 *
 * @returns Array of `{ id, name }` for each copper layer.
 */
export function copperLayerDeclarations(layerCount: number): Array<{ id: number; name: string }> {
  validateLayerCount(layerCount);
  if (layerCount === 2) {
    return [
      { id: 0, name: 'F.Cu' },
      { id: 2, name: 'B.Cu' },
    ];
  }
  // canonical: F.Cu=0, In1.Cu=1, ..., In(N-2).Cu=N-2, B.Cu=31
  const entries: Array<{ id: number; name: string }> = [{ id: 0, name: 'F.Cu' }];
  const inner = layerCount - 2;
  for (let i = 1; i <= inner; i++) entries.push({ id: i, name: `In${i}.Cu` });
  entries.push({ id: 31, name: 'B.Cu' });
  return entries;
}

/**
 * The standard non-copper (technical + user) layers every KiCad board
 * declares. Values mirror the `one_hz.kicad_pcb` fixture's `(layers ...)` block.
 * Each entry: `{ id, name, type, userName? }` where `type` is the layer type
 * keyword and `userName` is the optional third field.
 */
const TECHNICAL_LAYERS: ReadonlyArray<{ id: number; name: string; type: string; userName?: string }> = [
  { id: 9, name: 'F.Adhes', type: 'user', userName: 'F.Adhesive' },
  { id: 11, name: 'B.Adhes', type: 'user', userName: 'B.Adhesive' },
  { id: 13, name: 'F.Paste', type: 'user' },
  { id: 15, name: 'B.Paste', type: 'user' },
  { id: 5, name: 'F.SilkS', type: 'user', userName: 'F.Silkscreen' },
  { id: 7, name: 'B.SilkS', type: 'user', userName: 'B.Silkscreen' },
  { id: 1, name: 'F.Mask', type: 'user' },
  { id: 3, name: 'B.Mask', type: 'user' },
  { id: 17, name: 'Dwgs.User', type: 'user', userName: 'User.Drawings' },
  { id: 19, name: 'Cmts.User', type: 'user', userName: 'User.Comments' },
  { id: 21, name: 'Eco1.User', type: 'user', userName: 'User.Eco1' },
  { id: 23, name: 'Eco2.User', type: 'user', userName: 'User.Eco2' },
  { id: 25, name: 'Edge.Cuts', type: 'user' },
  { id: 27, name: 'Margin', type: 'user' },
  { id: 31, name: 'F.CrtYd', type: 'user', userName: 'F.Courtyard' },
  { id: 29, name: 'B.CrtYd', type: 'user', userName: 'B.Courtyard' },
  { id: 35, name: 'F.Fab', type: 'user' },
  { id: 33, name: 'B.Fab', type: 'user' },
  { id: 39, name: 'User.1', type: 'user' },
  { id: 41, name: 'User.2', type: 'user' },
  { id: 43, name: 'User.3', type: 'user' },
  { id: 45, name: 'User.4', type: 'user' },
];

/**
 * Names of the standard non-copper (technical + user) layers every KiCad
 * board declares. Together with {@link copperLayerNames} this is the set of
 * layer names typeCAD-generated elements may reference.
 */
export function technicalLayerNames(): string[] {
  return TECHNICAL_LAYERS.map((t) => t.name);
}

/**
 * Build the `(layers ...)` declaration node for a board with `layerCount`
 * copper layers. Copper layers first (sorted by id), then the standard
 * technical/user layers.
 *
 * @param layerCount - Number of copper layers (2–32).
 * @returns The `(layers ...)` SExpr node.
 */
export function buildLayersNode(layerCount: number): SExpr {
  validateLayerCount(layerCount);

  // Merge copper + technical, sort by id (KiCad emits them id-ordered for
  // the non-copper ones; copper first as a group). The one_hz fixture lists
  // copper first then technical in ascending-id order.
  const coppers = copperLayerDeclarations(layerCount);
  const copperIds = new Set(coppers.map((c) => c.id));

  // For 3+ layer boards, B.Cu uses id 31 which collides with F.CrtYd (id 31).
  // KiCad resolves this by the layer NAME in the declaration, and F.CrtYd
  // still appears — the id 31 is reused across different board sizes. We
  // emit copper first, then technical layers that don't collide with copper
  // ids by name.
  const entries: SExpr[] = [];

  for (const c of coppers) {
    // (0 "F.Cu" signal) — bare integer id, string name, type symbol
    entries.push(ss(c.id, str(c.name), sym('signal')));
  }
  for (const t of TECHNICAL_LAYERS) {
    // For 4+ layer boards B.Cu takes id 31, colliding with F.CrtYd(31).
    // KiCad disambiguates by name, so both are emitted.
    entries.push(
      t.userName !== undefined
        ? ss(t.id, str(t.name), sym(t.type), str(t.userName))
        : ss(t.id, str(t.name), sym(t.type)),
    );
  }
  void copperIds; // referenced for clarity; collisions handled by name

  return s('layers', ...entries);
}

/** Round to 4 decimal places (mm precision). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
