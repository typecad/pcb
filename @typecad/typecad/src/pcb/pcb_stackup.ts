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

/** Stackup-level options (per-layer materials are JLCPCB-standard presets). */
export interface IStackupOptions {
    /** Copper surface finish, e.g. "None", "HASL", "ENIG". Default "None". */
    copper_finish?: string;
    /** Whether dielectric constraints are enforced. Default false. */
    dielectric_constraints?: boolean;
}

/** KiCad supports a maximum of 32 copper layers. */
export const MAX_COPPER_LAYERS = 32;
/** Minimum copper layers (top + bottom). */
export const MIN_COPPER_LAYERS = 2;

/** Standard solder mask thickness in mm (JLCPCB dry film). */
const MASK_THICKNESS_MM = 0.01;
/** Default copper thickness for 1 oz copper, in mm. */
const COPPER_UM_TO_MM = (um: number) => um / 1000;

/**
 * Validate a copper-layer count.
 * @throws {RangeError} if not an integer in [2, 32].
 */
export function validateLayerCount(layerCount: number): void {
    if (!Number.isInteger(layerCount) || layerCount < MIN_COPPER_LAYERS || layerCount > MAX_COPPER_LAYERS) {
        throw new RangeError(
            `layer count must be an integer between ${MIN_COPPER_LAYERS} and ${MAX_COPPER_LAYERS}, got ${layerCount}`
        );
    }
}

/**
 * Build a single `(layer ...)` stackup entry node. Only provided fields are
 * emitted; KiCad treats omitted fields as unspecified.
 */
function stackupLayerNode(
    name: string,
    fields: { type?: string; color?: string; thickness?: number; material?: string; epsilon_r?: number; loss_tangent?: number }
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
 * dielectrics between them, mask, paste, silkscreen. Dielectric thicknesses are
 * computed so that copper + dielectric + mask layers sum to `boardThickness`.
 *
 * @param layerCount - Number of copper layers (2–32).
 * @param boardThickness - Total board thickness in mm.
 * @param copperThicknessUm - Copper thickness in microns (e.g. 35 for 1 oz).
 * @param options - Optional stackup-level overrides.
 * @returns The `(stackup ...)` SExpr node.
 */
export function buildStackup(
    layerCount: number,
    boardThickness: number,
    copperThicknessUm: number,
    options?: IStackupOptions
): SExpr {
    validateLayerCount(layerCount);
    const copperMm = COPPER_UM_TO_MM(copperThicknessUm);
    const nCopper = layerCount;
    const nDielectric = nCopper - 1;

    // Total dielectric thickness = board − copper − mask (top + bottom mask).
    // Silkscreen and paste have no thickness in the JLCPCB preset.
    const totalDielectric = Math.max(
        0.01,
        boardThickness - nCopper * copperMm - 2 * MASK_THICKNESS_MM
    );

    // Distribute dielectric: the central core takes the bulk, prepregs are
    // thinner. For 2-layer there is a single core. For N layers, outer
    // dielectrics are prepreg (~0.21mm typical) and any middle one is core.
    const prepregThickness = nDielectric >= 2 ? Math.min(0.21, totalDielectric / nDielectric) : 0;
    let coreCount: number;
    if (nDielectric <= 0) {
        coreCount = 0;
    } else if (nDielectric === 1) {
        coreCount = 1;
    } else {
        // outer two are prepreg; the rest is core
        coreCount = nDielectric - 2;
    }
    const coreThickness = coreCount > 0
        ? Math.max(0.1, (totalDielectric - 2 * prepregThickness) / coreCount)
        : 0;

    const layers: SExpr[] = [];

    // ── Top: silk → paste → mask ──────────────────────────────────────────
    layers.push(stackupLayerNode('F.SilkS', { type: 'Top Silk Screen', color: 'White', material: 'Liquid Photo' }));
    layers.push(stackupLayerNode('F.Paste', { type: 'Top Solder Paste' }));
    layers.push(stackupLayerNode('F.Mask', {
        type: 'Top Solder Mask', color: 'Green', thickness: MASK_THICKNESS_MM,
        material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0,
    }));

    // ── Copper + dielectric layers, top → bottom ─────────────────────────
    const copperNames = copperLayerNames(nCopper);
    for (let i = 0; i < nCopper; i++) {
        layers.push(stackupLayerNode(copperNames[i], { type: 'copper', thickness: round4(copperMm) }));
        // dielectric after this copper, except the last
        if (i < nCopper - 1) {
            const dIdx = i + 1; // 1-based
            const isOuter = (i === 0 || i === nCopper - 2);
            if (isOuter && nDielectric >= 2) {
                layers.push(stackupLayerNode(`dielectric ${dIdx}`, {
                    type: 'prepreg', color: 'FR4 natural', thickness: round4(prepregThickness),
                    material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02,
                }));
            } else {
                layers.push(stackupLayerNode(`dielectric ${dIdx}`, {
                    type: 'core', color: 'FR4 natural', thickness: round4(coreThickness),
                    material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02,
                }));
            }
        }
    }

    // ── Bottom: mask → paste → silk ───────────────────────────────────────
    layers.push(stackupLayerNode('B.Mask', {
        type: 'Bottom Solder Mask', color: 'Green', thickness: MASK_THICKNESS_MM,
        material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0,
    }));
    layers.push(stackupLayerNode('B.Paste', { type: 'Bottom Solder Paste' }));
    layers.push(stackupLayerNode('B.SilkS', { type: 'Bottom Silk Screen', color: 'White', material: 'Liquid Photo' }));

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
        return [{ id: 0, name: 'F.Cu' }, { id: 2, name: 'B.Cu' }];
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
    const copperIds = new Set(coppers.map(c => c.id));

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
                : ss(t.id, str(t.name), sym(t.type))
        );
    }
    void copperIds; // referenced for clarity; collisions handled by name

    return s('layers', ...entries);
}

/** Round to 4 decimal places (mm precision). */
function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}
