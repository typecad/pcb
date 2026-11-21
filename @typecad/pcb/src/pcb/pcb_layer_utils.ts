import type { SExpr } from '../sexpr/types.js';
import { Sym } from '../sexpr/index.js';

/**
 * Layer utility functions for PCB operations
 */

/**
 * Maps a library footprint's layer to the side the component is placed on.
 *
 * Library footprints are authored front-side, and placing one on the back
 * flips it the way KiCad does: every F.* layer becomes B.* AND every B.*
 * layer becomes F.*. On the front the footprint is used as authored. Items a
 * footprint deliberately puts on the opposite side — card-edge fingers on
 * B.Cu, back silkscreen — therefore stay opposite. (This used to force every
 * layer TO the target side, moving such pads onto the wrong copper and
 * disagreeing with the router's PadResolver, which already swapped.)
 *
 * @param layerName - The layer name to map (e.g., "F.Cu", "B.SilkS")
 * @param targetSide - Target side: 'front', 'back', or undefined (= front)
 * @returns Mapped layer name
 */
export function mapLayerToSide(layerName: string, targetSide: 'front' | 'back' | undefined): string {
  if (!targetSide) {
    targetSide = 'front'; // Default to front if side is undefined
  }
  const cleanLayerName = String(layerName);

  const parts = cleanLayerName.split('.');
  if (parts.length !== 2) {
    return layerName; // Not in "X.Y" format or not a simple layer string
  }

  let base = parts[0];
  const extension = parts[1];

  // Define paired layer extensions - include both short and full forms
  // Short forms: Cu, Adhes, Paste, SilkS, Mask, CrtYd, Fab
  // Full forms: Adhesive, Silkscreen (legacy), Courtyard (legacy), Fabrication (legacy)
  const pairedExtensions = [
    'Cu', // Copper layers
    'Adhes', // Adhesive layers (F.Adhes / B.Adhes)
    'Adhesive', // Alternative adhesive layer name
    'Paste', // Solder paste layers (F.Paste / B.Paste)
    'SilkS', // Silkscreen layers (F.SilkS / B.SilkS) - note the 'S'
    'Silkscreen', // Alternative silkscreen layer name (legacy)
    'Silk', // Alternative silkscreen layer name (legacy)
    'Mask', // Solder mask layers (F.Mask / B.Mask)
    'CrtYd', // Courtyard layers (F.CrtYd / B.CrtYd)
    'Courtyard', // Alternative courtyard layer name (legacy)
    'Fab', // Fabrication layers (F.Fab / B.Fab)
    'Fabrication', // Alternative fabrication layer name (legacy)
    'Assembly', // Alternative fabrication layer name (legacy)
  ];

  if (!pairedExtensions.includes(extension)) {
    return layerName; // Extension not in paired list, return original
  }

  // Front: as authored. Back: flip (swap both directions).
  if (targetSide !== 'back') return layerName;
  if (base === 'F') base = 'B';
  else if (base === 'B') base = 'F';
  else if (base === 'Front') base = 'Back';
  else if (base === 'Back') base = 'Front';

  return `${base}.${extension}`;
}

/**
 * Transforms S-expression layer references to match target side
 * @param sexpr - S-expression array to transform
 * @param targetSide - Target side: 'front', 'back', or undefined (defaults to front)
 * @returns Transformed S-expression
 */
export function transformSexprLayers(sexpr: SExpr, targetSide: 'front' | 'back' | undefined): SExpr {
  if (!Array.isArray(sexpr)) {
    return sexpr;
  }

  const nodeType = sexpr[0];

  // Pads are flipped by processFootprintItem, which maps every pad layer.
  // Mapping them here too flipped them TWICE on back-side parts (F→B→F),
  // which the old force-to-side mapping happened to hide.
  if (Sym.isSym(nodeType) && nodeType.name === 'pad') return sexpr;

  // Handle (layer "LAYER_NAME")
  if (Sym.isSym(nodeType) && nodeType.name === 'layer' && sexpr.length > 1 && typeof sexpr[1] === 'string') {
    sexpr[1] = mapLayerToSide(sexpr[1], targetSide);
  }
  // Handle (layers "L1" "L2" ...) — and the legacy single-string "L1 L2" form
  else if (Sym.isSym(nodeType) && nodeType.name === 'layers') {
    for (let i = 1; i < sexpr.length; i++) {
      const v = sexpr[i];
      if (typeof v !== 'string') continue;
      sexpr[i] = v
        .split(/\s+/)
        .filter((layer) => layer.length > 0)
        .map((layer) => mapLayerToSide(layer, targetSide))
        .join(' ');
    }
  }

  // Recursively process child nodes
  for (let i = 1; i < sexpr.length; i++) {
    if (Array.isArray(sexpr[i])) {
      sexpr[i] = transformSexprLayers(sexpr[i], targetSide);
    }
  }

  return sexpr;
}

/**
 * Mirrors chamfer direction for back-side components
 * @param chamferDirection - Original chamfer direction
 * @returns Mirrored chamfer direction
 */
export function mirrorChamferDirection(chamferDirection: string): string {
  const cleanDirection = String(chamferDirection);
  const directionMap: { [key: string]: string } = {
    top_left: 'bottom_left',
    top_right: 'bottom_right',
    bottom_left: 'top_left',
    bottom_right: 'top_right',
  };
  return directionMap[cleanDirection] || cleanDirection;
}
