/**
 * Write-time validation of layer references against the board's declared
 * layer set.
 *
 * Every layer name typeCAD emits (tracks, graphics, zones, keepouts, vias)
 * must be declared in the board's `(layers ...)` block, otherwise KiCad
 * cannot load the file or DRC reports unknown layers. The declared set is
 * derived from the board's copper-layer count (constructor `layers` option
 * or `pcb.stackup()`) plus the standard technical layers.
 *
 * Elements loaded from an existing board file are not validated — they were
 * already valid in KiCad.
 */

import type { PcbInternalState } from './pcb_state.js';
import type {
  IVia,
  IFilledZone,
  IKeepoutZone,
  IGrLine,
  IGrArc,
  IGrCircle,
  IGrRect,
  IGrPoly,
  IGrTextOptions,
  IOutline,
  OutlineElement,
} from './pcb_interfaces.js';
import { copperLayerNames, technicalLayerNames } from './pcb_stackup.js';
import { BoardCreationError } from '../utils/errors.js';

/** Layer values that legitimately stand for "all copper layers". */
const WILDCARD_LAYERS = new Set(['*.Cu', '*']);

interface LayerViolation {
  layer: string;
  source: string;
}

/**
 * The set of layer names valid for typeCAD-generated elements on a board
 * with the given copper-layer count.
 */
export function allowedLayerNames(layerCount: number): Set<string> {
  return new Set([...copperLayerNames(layerCount), ...technicalLayerNames(), ...WILDCARD_LAYERS]);
}

function suggestFix(layer: string, layerCount: number, allowed: Set<string>): string {
  // Case-insensitive near match ("f.cu" -> "F.Cu")
  const caseMatch = Array.from(allowed).find((name) => name.toLowerCase() === layer.toLowerCase());
  if (caseMatch) {
    return `Did you mean "${caseMatch}"?`;
  }

  // Inner copper layer beyond the declared count ("In3.Cu" on a 4-layer board)
  const innerMatch = /^In(\d+)\.Cu$/.exec(layer);
  if (innerMatch) {
    const needed = Number(innerMatch[1]) + 2;
    if (needed >= 2 && needed <= 32) {
      return (
        `The board declares ${layerCount} copper layer${layerCount === 1 ? '' : 's'}; ` +
        `"${layer}" needs ${needed}. Call pcb.stackup(${needed}) or pass { layers: ${needed} } to the PCB constructor.`
      );
    }
  }
  return `Declared copper layers: ${copperLayerNames(layerCount).join(', ')}.`;
}

function collectViolations(state: PcbInternalState, viaMap: Map<string, IVia>, allowed: Set<string>): LayerViolation[] {
  const violations: LayerViolation[] = [];
  const seen = new Set<string>();
  const add = (layer: string | undefined, source: string) => {
    if (!layer || allowed.has(layer) || WILDCARD_LAYERS.has(layer)) return;
    const key = `${layer}|${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ layer, source });
  };

  for (const via of viaMap.values()) {
    for (const layer of via.layers ?? []) {
      add(layer, 'a via');
    }
  }

  (['zones', 'keepoutZones'] as const).forEach((key, i) => {
    const list = (key === 'zones' ? state.zones : state.keepoutZones) as Array<IFilledZone | IKeepoutZone>;
    const kind = i === 0 ? 'Zone' : 'Keepout';
    list.forEach((zone, idx) => {
      for (const layer of zone.layers ?? []) {
        const label = zone.name ? `${kind} "${zone.name}"` : `${kind} ${idx + 1}`;
        add(layer, label);
      }
    });
  });

  const graphics: Array<[readonly { layer: string }[], string]> = [
    [state.grLines, 'a line'],
    [state.grCircles, 'a circle'],
    [state.grRects, 'a rect'],
    [state.grPolys, 'a poly'],
  ];
  for (const [list, source] of graphics) {
    for (const el of list) {
      add(el.layer, source);
    }
  }
  for (const text of state.grTexts as IGrTextOptions[]) {
    add(text.layer ?? 'F.SilkS', 'a text');
  }

  const outlineLayer = (el: OutlineElement): string | undefined =>
    (el as IGrLine | IGrArc | IGrCircle | IGrRect | IGrPoly).layer;
  for (const outline of [...state.outlines, ...state.stagedOutlines] as IOutline[]) {
    for (const el of outline.elements) {
      add(outlineLayer(el), 'a track/outline element');
    }
  }

  return violations;
}

/**
 * Validate that every layer referenced by typeCAD-generated elements is
 * declared on the board. Throws a {@link BoardCreationError} listing all
 * violations on first mismatch.
 *
 * @param layerCount - The board's copper-layer count.
 * @param state - The PCB internal state holding generated elements.
 * @param viaMap - Vias collected for the board being written.
 */
export function validateDeclaredLayers(layerCount: number, state: PcbInternalState, viaMap: Map<string, IVia>): void {
  const allowed = allowedLayerNames(layerCount);
  const violations = collectViolations(state, viaMap, allowed);
  if (violations.length === 0) return;

  const details = violations.map((v) => `  - ${v.source} references "${v.layer}"`).join('\n');
  const first = violations[0];
  throw new BoardCreationError(
    `Layer validation failed: ${violations.length} element${violations.length === 1 ? '' : 's'} ` +
      `reference layers not declared on this ${layerCount}-layer board.\n` +
      `${details}\n` +
      `${suggestFix(first.layer, layerCount, allowed)}`,
  );
}
