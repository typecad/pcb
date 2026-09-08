import type { SExpr } from '../sexpr/types.js';
import { Sym } from '../sexpr/index.js';

/**
 * Layer utility functions for PCB operations
 */

/**
 * Maps layer names to the appropriate side (front/back) of the PCB
 * @param layerName - The layer name to map (e.g., "F.Cu", "B.SilkS")
 * @param targetSide - Target side: 'front', 'back', or undefined (defaults to front)
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

  // Transform base based on target side
  if (targetSide === 'back') {
    if (base === 'F') {
      base = 'B';
    } else if (base === 'Front') {
      base = 'Back';
    }
  } else {
    // targetSide === 'front'
    if (base === 'B') {
      base = 'F';
    } else if (base === 'Back') {
      base = 'Front';
    }
  }

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

  // Handle (layer "LAYER_NAME")
  if (Sym.isSym(nodeType) && nodeType.name === 'layer' && sexpr.length > 1 && typeof sexpr[1] === 'string') {
    sexpr[1] = mapLayerToSide(sexpr[1], targetSide);
  }
  // Handle (layers "L1 L2 L3")
  else if (Sym.isSym(nodeType) && nodeType.name === 'layers' && sexpr.length > 1 && typeof sexpr[1] === 'string') {
    const layersString = String(sexpr[1]);

    const individualLayers = layersString.split(/\s+/).filter((layer) => layer.length > 0);

    const mappedLayers = individualLayers.map((layer) => mapLayerToSide(layer, targetSide));

    sexpr[1] = mappedLayers.join(' ');
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
