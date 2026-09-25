/**
 * PCB Routing Calculation Functions
 *
 * This module contains standalone calculation functions extracted from the main PCB class.
 * These functions are pure mathematical calculations that don't depend on PCB class state.
 */

import { Component } from '../component.js';
import { validatePositive, validateNonNegative, validateFinite } from '../utils/numeric_validation.js';

/**
 * PCB design constants used across routing and calculation modules.
 * All dimensional values are in millimeters unless otherwise noted.
 */
export const PCB_CONSTANTS = {
  /** Default track width in mm */
  DEFAULT_TRACK_WIDTH: 0.2,
  /** Default clearance in mm */
  DEFAULT_CLEARANCE: 0.1,
  /** Default copper thickness in microns (1 oz copper) */
  DEFAULT_COPPER_THICKNESS_UM: 35,
  /** Conversion factor: mils per ounce of copper */
  MILS_PER_OZ: 1.378,
  /** Conversion factor: mm to mils */
  MM_TO_MILS: 1 / 0.0254,
  /** Conversion factor: microns to mils */
  UM_TO_MILS: 1 / 25.4,
  /** Default temperature rise in degrees C for current calculations */
  DEFAULT_TEMP_RISE: 10,
  /** Default via size in mm */
  DEFAULT_VIA_SIZE: 0.6,
  /** Default via drill size in mm */
  DEFAULT_VIA_DRILL: 0.3,
  /** Default via size in mm for component-level vias */
  DEFAULT_VIA_SIZE_COMPONENT: 0.8,
  /** Default via drill size in mm for component-level vias */
  DEFAULT_VIA_DRILL_COMPONENT: 0.4,
  /** Standard schematic grid unit in mm (0.1 inch) */
  SCHEMATIC_GRID_UNIT: 2.54,
} as const;

/**
 * Calculate the current capacity of a via based on its size and drill
 * Based on IPC-2152 formula for via current capacity
 *
 * @param size - Via size in mm
 * @param drill - Via drill size in mm
 * @param thickness - Copper plating thickness in microns (defaults to 35 microns if not provided)
 * @param boardThickness - Board thickness in mm (not used in calculation but kept for compatibility)
 * @param maxTempRise - Maximum temperature rise in °C (defaults to 10)
 * @returns Maximum current capacity in amperes
 */
export function calculateViaCurrentCapacity(
  size: number,
  drill: number,
  thickness?: number,
  boardThickness?: number,
  maxTempRise: number = PCB_CONSTANTS.DEFAULT_TEMP_RISE,
): number {
  const actualThickness = thickness ?? PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM;

  // IPC-2152 formula for via current capacity
  // I = 0.048 * T^0.44 * A^0.75
  // Where A = π * (D + Tk) * Tk
  const k = 0.048;
  const b = 0.44;
  const c = 0.75;

  const drillMils = drill * PCB_CONSTANTS.MM_TO_MILS;
  const thicknessMils = actualThickness * PCB_CONSTANTS.UM_TO_MILS;

  // Calculate via wall cross-sectional area using IPC-2152 formula
  // A = π * (D + Tk) * Tk
  const crossSectionalArea = Math.PI * (drillMils + thicknessMils) * thicknessMils;

  // Calculate current capacity using IPC-2152 formula
  // I = 0.048 * T^0.44 * A^0.75
  const current = k * Math.pow(maxTempRise, b) * Math.pow(crossSectionalArea, c);

  return current;
}

/**
 * Calculate minimum trace width using IPC-2221 formula.
 * Reuses the formula from TrackBuilder.
 *
 * @param current - Current in amperes
 * @param layer - Layer name (e.g., "F.Cu", "B.Cu", "In1.Cu", etc.)
 * @param maxTempRise - Maximum temperature rise in °C
 * @param thickness - Copper thickness in microns
 * @returns Minimum trace width in mm
 */
export function calculateMinTraceWidth(current: number, layer: string, maxTempRise: number, thickness: number): number {
  validateNonNegative(current, 'current');
  validatePositive(maxTempRise, 'maxTempRise');
  validatePositive(thickness, 'thickness');

  if (current === 0) return 0;

  // IPC-2221 formula constants
  const k = layer === 'F.Cu' || layer === 'B.Cu' ? 0.048 : 0.024;
  const b = 0.44;
  const c = 0.725;

  const thicknessOz = thickness / PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM;

  const area = Math.pow(current / (k * Math.pow(maxTempRise, b)), 1 / c);

  const widthMils = area / (thicknessOz * PCB_CONSTANTS.MILS_PER_OZ);

  const widthMm = widthMils / PCB_CONSTANTS.MM_TO_MILS;

  return widthMm;
}

/**
 * Calculate minimum via size using the same IPC-2221-based barrel approximation
 * used by routing helpers and track building.
 *
 * @param current - Current in amperes
 * @param thickness - Copper thickness in microns
 * @returns Minimum via size and drill in mm
 */
export function calculateMinViaSize(
  current: number,
  thickness: number = PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM,
): { size: number; drill: number } {
  const k = 0.048;
  const b = 0.44;
  const c = 0.725;
  const annularRing = 0.1;

  const thicknessOz = thickness / PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM;
  const area = Math.pow(current / (k * Math.pow(PCB_CONSTANTS.DEFAULT_TEMP_RISE, b)), 1 / c);
  const drillMils = 2 * Math.sqrt(area / Math.PI);
  const drillMm = drillMils / PCB_CONSTANTS.MM_TO_MILS;
  const sizeMm = drillMm + 2 * annularRing;

  return {
    size: sizeMm,
    drill: drillMm,
  };
}

/**
 * Interface for board bounds calculation result
 */
export interface BoardBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Interface for outline elements used in bounds calculation
 */
export interface OutlineElement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Creates a bounding box centered around all component positions.
 *
 * @param components - Array of components to calculate bounds for
 * @param outlines - Optional array of outline elements that define board edges
 * @param stagedComponents - Optional array of staged components to include
 * @returns Bounding box coordinates
 */
export function calculateBoardBounds(
  components: Component[],
  outlines?: OutlineElement[],
  stagedComponents?: Component[],
): BoardBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let foundComponents = 0;

  // Check outlines first (these define the board edge if present)
  if (outlines && outlines.length > 0) {
    for (const outline of outlines) {
      minX = Math.min(minX, outline.x);
      maxX = Math.max(maxX, outline.x + outline.width);
      minY = Math.min(minY, outline.y);
      maxY = Math.max(maxY, outline.y + outline.height);
    }

    // If we have explicit outlines, use those bounds
    if (isFinite(minX)) {
      return { minX, maxX, minY, maxY };
    }
  }

  // Collect all components from both staged and active lists
  const allComponents: Component[] = [];

  if (components) {
    allComponents.push(...components);
  }

  if (stagedComponents) {
    allComponents.push(...stagedComponents);
  }

  // Calculate bounds from component positions
  for (const component of allComponents) {
    if (component.dnp || component.via) continue;

    // Check if component has valid position
    if (typeof component.pcb.x === 'number' && typeof component.pcb.y === 'number') {
      minX = Math.min(minX, component.pcb.x);
      maxX = Math.max(maxX, component.pcb.x);
      minY = Math.min(minY, component.pcb.y);
      maxY = Math.max(maxY, component.pcb.y);
      foundComponents++;
    }
  }

  // If we found components, create a bounding box with padding
  if (foundComponents > 0 && isFinite(minX)) {
    // Calculate center point
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate dimensions with padding
    const width = maxX - minX;
    const height = maxY - minY;

    // Add generous padding (50% of dimensions or minimum 20mm)
    const paddingX = Math.max(width * 0.5, 20);
    const paddingY = Math.max(height * 0.5, 20);

    const bounds = {
      minX: centerX - width / 2 - paddingX,
      maxX: centerX + width / 2 + paddingX,
      minY: centerY - height / 2 - paddingY,
      maxY: centerY + height / 2 + paddingY,
    };

    return bounds;
  }

  // Fallback: no components or outlines found
  return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
}
