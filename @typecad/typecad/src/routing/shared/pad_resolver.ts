import { Component } from '../../component.js';
import { Pin } from '../../pin.js';
import { parseAsList, Sym } from '../../sexpr/index.js';
import type { SExpr } from '../../sexpr/types.js';
import { TypeCadError } from '../../utils/errors.js';
import { displayName } from '../../utils/error_reporter.js';
import logger from '../../utils/logging.js';

export interface IPadResolutionFailure {
  pinNumber: string;
  component: Component;
  reason: 'no_owner' | 'footprint_unparseable' | 'pad_not_found' | 'pad_data_unextractable' | 'unknown';
  availablePads: (string | number)[];
}

/**
 * Geometry information for a component pad on the PCB.
 */
export interface IPadGeometry {
  /** Absolute center position on the PCB in mm */
  center: { x: number; y: number };

  /** Pad shape type */
  shape: 'circle' | 'rect' | 'oval' | 'roundrect' | 'custom';

  /** Pad type (SMD or through-hole) */
  type: 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';

  /** Pad size in mm */
  size: { width: number; height: number };

  /** Absolute rotation in degrees */
  rotation: number;

  /** Layer the pad is on (e.g., 'F.Cu', 'B.Cu'). For through-hole pads, this is the primary layer but the pad exists on all layers */
  layer: string;

  /** All layers this pad exists on (for through-hole pads, includes all copper layers) */
  layers: string[];

  /** Pad number/name */
  number: string | number;

  /** Net name this pad belongs to (for net-aware routing) */
  net?: string;

  /** Component reference (for debugging) */
  componentRef?: string;
}

/**
 * Resolves pin objects to their physical pad positions on the PCB.
 * Handles coordinate transformation from footprint-relative to board-absolute coordinates.
 */
export class PadResolver {
  private static _parseCache: Map<string, SExpr[] | null> = new Map();

  private static getCachedParse(footprintName: string, footprintSExpr: string): SExpr[] | null {
    let cached = this._parseCache.get(footprintName);
    if (cached !== undefined) return cached;
    try {
      cached = parseAsList(footprintSExpr);
    } catch {
      cached = null;
    }
    this._parseCache.set(footprintName, cached);
    return cached;
  }

  static clearParseCache(): void {
    this._parseCache.clear();
  }
  /**
   * Get the absolute center position of a pin's pad on the PCB.
   *
   * @param pin - The pin to resolve
   * @param boardCopperLayers - The board's copper layers, top to bottom.
   *   Through-hole pads exist on every one of them. Defaults to a 2-layer
   *   set when omitted.
   * @returns The absolute X,Y coordinates in mm, or null if unable to resolve
   *
   * @example
   * ```ts
   * const center = PadResolver.getPadCenter(resistor.pin(1));
   * if (center) {
   *   logger.log(`Pad is at ${center.x}, ${center.y}`);
   * }
   * ```
   */
  static getPadCenter(pin: Pin, boardCopperLayers?: readonly string[]): { x: number; y: number; layer: string } | null {
    const result = this.getPadCenterWithFailure(pin, boardCopperLayers);
    if ('failure' in result) return null;
    return { x: result.x, y: result.y, layer: result.layer };
  }

  static getPadCenterWithFailure(
    pin: Pin,
    boardCopperLayers?: readonly string[],
  ): { x: number; y: number; layer: string } | { failure: IPadResolutionFailure } {
    if (!pin.owner) {
      logger.warn(`[PadResolver] Pin ${pin.number} has no owner component`);
      return {
        failure: {
          pinNumber: String(pin.number),
          component: pin.owner as unknown as Component,
          reason: 'no_owner',
          availablePads: [],
        },
      };
    }

    const result = this.getPadGeometryWithFailure(pin.owner, pin.number, boardCopperLayers);
    if ('failure' in result) {
      return { failure: result.failure };
    }

    return {
      x: result.center.x,
      y: result.center.y,
      layer: result.layer,
    };
  }

  /**
   * Get complete geometry information for a specific pad.
   *
   * @param component - The component containing the pad
   * @param pinNumber - The pin/pad number to look up
   * @param boardCopperLayers - The board's copper layers, top to bottom.
   *   Through-hole pads exist on every one of them. Defaults to a 2-layer
   *   set when omitted.
   * @returns Complete pad geometry, or null if not found
   *
   * @example
   * ```ts
   * const padGeom = PadResolver.getPadGeometry(resistor, 1);
   * if (padGeom) {
   *   logger.log(`Pad shape: ${padGeom.shape}, size: ${padGeom.size.width}x${padGeom.size.height}mm`);
   * }
   * ```
   */
  static getPadGeometry(
    component: Component,
    pinNumber: string | number,
    boardCopperLayers?: readonly string[],
  ): IPadGeometry | null {
    const result = this.getPadGeometryWithFailure(component, pinNumber, boardCopperLayers);
    if ('failure' in result) return null;
    return result;
  }

  static getPadGeometryWithFailure(
    component: Component,
    pinNumber: string | number,
    boardCopperLayers?: readonly string[],
  ): IPadGeometry | { failure: IPadResolutionFailure } {
    try {
      const footprintSExpr = component.footprint_lib(component.footprint);
      const parsed = this.getCachedParse(component.footprint, footprintSExpr);
      if (!parsed) {
        logger.warn(`[PadResolver] Unable to parse footprint for ${displayName(component)}`);
        return {
          failure: { pinNumber: String(pinNumber), component, reason: 'footprint_unparseable', availablePads: [] },
        };
      }

      const padNode = this.findPadNode(parsed, pinNumber);
      if (!padNode) {
        logger.warn(
          `[PadResolver] Pad ${pinNumber} not found in footprint ${component.footprint} for ${displayName(component)}`,
        );
        const available = this.collectAvailablePadNumbers(parsed);
        return {
          failure: { pinNumber: String(pinNumber), component, reason: 'pad_not_found', availablePads: available },
        };
      }

      const relativeData = this.extractPadData(padNode);
      if (!relativeData) {
        logger.warn(`[PadResolver] Unable to extract pad data for ${displayName(component)} pin ${pinNumber}`);
        const available = this.collectAvailablePadNumbers(parsed);
        return {
          failure: {
            pinNumber: String(pinNumber),
            component,
            reason: 'pad_data_unextractable',
            availablePads: available,
          },
        };
      }

      const absoluteGeometry = this.transformToAbsolute(relativeData, component, boardCopperLayers);

      return absoluteGeometry;
    } catch (error: unknown) {
      logger.warn(
        `[PadResolver] Error resolving pad geometry for ${displayName(component)} pin ${pinNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { failure: { pinNumber: String(pinNumber), component, reason: 'unknown', availablePads: [] } };
    }
  }

  /**
   * Find a pad node in the footprint S-expression tree.
   * @private
   */
  private static findPadNode(sexpr: SExpr[], pinNumber: string | number): SExpr[] | null {
    const targetNumber = String(pinNumber);

    const search = (node: SExpr[]): SExpr[] | null => {
      if (!Array.isArray(node)) return null;

      if (Sym.isSym(node[0]) && node[0].name === 'pad' && node.length > 1) {
        const padNumber = String(node[1]);
        if (padNumber === targetNumber) {
          return node;
        }
      }

      for (const child of node) {
        if (Array.isArray(child)) {
          const result = search(child);
          if (result) return result;
        }
      }

      return null;
    };

    return search(sexpr);
  }

  private static collectAvailablePadNumbers(sexpr: SExpr[]): (string | number)[] {
    const numbers: (string | number)[] = [];
    const collect = (node: SExpr | SExpr[]) => {
      if (!Array.isArray(node)) return;
      if (node.length > 0 && Sym.isSym(node[0]) && node[0].name === 'pad' && node.length > 1) {
        numbers.push(String(node[1]));
      }
      for (const child of node) {
        if (Array.isArray(child)) collect(child);
      }
    };
    collect(sexpr);
    return numbers;
  }

  /**
   * Extract pad data from a pad S-expression node.
   * @private
   */
  private static extractPadData(padNode: SExpr[]): {
    number: string | number;
    type: string;
    at: { x: number; y: number; rotation: number };
    size: { width: number; height: number };
    shape: string;
    layers: string[];
  } | null {
    const at = { x: 0, y: 0, rotation: 0 };
    const size = { width: 1.0, height: 1.0 };
    let shape = 'rect';
    let type = 'smd';
    let layers: string[] = ['F.Cu'];
    const number = String(padNode[1]);

    for (const element of padNode) {
      if (!Array.isArray(element)) continue;

      const tag = Sym.isSym(element[0]) ? element[0].name : '';

      if (tag === 'at') {
        at.x = parseFloat(String(element[1])) || 0;
        at.y = parseFloat(String(element[2])) || 0;
        at.rotation = element.length > 3 ? parseFloat(String(element[3])) || 0 : 0;
      } else if (tag === 'size') {
        size.width = parseFloat(String(element[1])) || 1.0;
        size.height = parseFloat(String(element[2])) || 1.0;
      } else if (tag === 'layers') {
        layers = element.slice(1).map((l: SExpr) => String(l));
      }
    }

    if (padNode.length > 2) {
      type = String(padNode[2]);
    }

    if (padNode.length > 3) {
      shape = String(padNode[3]);
    }

    return { number, type, at, size, shape, layers };
  }

  /**
   * Transform pad data from footprint-relative to board-absolute coordinates.
   * @private
   */
  private static transformToAbsolute(
    relativeData: ReturnType<typeof PadResolver.extractPadData>,
    component: Component,
    boardCopperLayers?: readonly string[],
  ): IPadGeometry {
    if (!relativeData) {
      throw new TypeCadError('Invalid relative data');
    }

    const componentX = component.pcb.x || 0;
    const componentY = component.pcb.y || 0;
    const componentRotation = component.pcb.rotation || 0;
    const componentSide = component.pcb.side || 'front';

    // Convert rotation to radians
    // KiCad uses clockwise rotation (Y-down coordinate system), so we negate the angle
    const rotRad = (-componentRotation * Math.PI) / 180;
    const cosRot = Math.cos(rotRad);
    const sinRot = Math.sin(rotRad);

    // Apply rotation transformation to pad position
    const padX = relativeData.at.x;
    let padY = relativeData.at.y;

    // For back side, negate Y to match pcb_footprint.ts back-side transform
    // (pcb_footprint.ts negates pad Y and adjusts rotation for B.Cu modules)
    if (componentSide === 'back') {
      padY = -padY;
    }

    // Rotate the pad position around component origin
    // Using standard rotation matrix with negated angle for KiCad's clockwise rotation
    const rotatedX = padX * cosRot - padY * sinRot;
    const rotatedY = padX * sinRot + padY * cosRot;

    // Translate to absolute board coordinates
    const absoluteX = componentX + rotatedX;
    const absoluteY = componentY + rotatedY;

    // Calculate absolute rotation
    let absoluteRotation = componentRotation + relativeData.at.rotation;
    if (componentSide === 'back') {
      absoluteRotation = (360 - absoluteRotation) % 360;
    }
    absoluteRotation = absoluteRotation % 360;

    // Determine the primary copper layer and all layers
    const copperLayers = relativeData.layers.filter((l) => l.includes('.Cu'));
    const hasWildcardCu = copperLayers.some((l) => l === '*.Cu');
    let primaryLayer = 'F.Cu';
    let allLayers: string[] = [];

    // Normalize pad type
    let normalizedType: IPadGeometry['type'] = 'smd';
    const typeStr = relativeData.type.toLowerCase();
    if (typeStr.includes('thru_hole')) {
      normalizedType = 'thru_hole';
    } else if (typeStr.includes('np_thru_hole')) {
      normalizedType = 'np_thru_hole';
    } else if (typeStr.includes('connect')) {
      normalizedType = 'connect';
    }

    // For through-hole pads, the pad exists on all copper layers
    if (normalizedType === 'thru_hole' || normalizedType === 'np_thru_hole') {
      // Through-hole pads exist on every copper layer the board declares
      allLayers = boardCopperLayers && boardCopperLayers.length > 0 ? [...boardCopperLayers] : ['F.Cu', 'B.Cu'];
      primaryLayer = componentSide === 'back' ? 'B.Cu' : 'F.Cu';
    } else {
      // SMD pads exist only on the specified layers
      if (hasWildcardCu) {
        // KiCad may specify '*.Cu' for pads that exist on all copper layers (e.g., 'connect').
        // For routing, avoid propagating the wildcard; expand to the
        // board's copper layers (outer two by default).
        allLayers = boardCopperLayers && boardCopperLayers.length > 0 ? [...boardCopperLayers] : ['F.Cu', 'B.Cu'];
        primaryLayer = componentSide === 'back' ? 'B.Cu' : 'F.Cu';
      } else if (copperLayers.length > 0) {
        primaryLayer = copperLayers[0];
        // Map layer to component side
        if (componentSide === 'back') {
          if (primaryLayer === 'F.Cu') primaryLayer = 'B.Cu';
          else if (primaryLayer === 'B.Cu') primaryLayer = 'F.Cu';
        }
        allLayers = [primaryLayer];
      } else {
        // Fallback if no copper layer specified: assume outer layer based on component side
        primaryLayer = componentSide === 'back' ? 'B.Cu' : 'F.Cu';
        allLayers = [primaryLayer];
      }
    }

    // Normalize shape name
    let normalizedShape: IPadGeometry['shape'] = 'rect';
    const shapeStr = relativeData.shape.toLowerCase();
    if (shapeStr.includes('circle')) normalizedShape = 'circle';
    else if (shapeStr.includes('oval')) normalizedShape = 'oval';
    else if (shapeStr.includes('roundrect')) normalizedShape = 'roundrect';
    else if (shapeStr.includes('custom')) normalizedShape = 'custom';

    return {
      center: { x: absoluteX, y: absoluteY },
      shape: normalizedShape,
      type: normalizedType,
      size: { width: relativeData.size.width, height: relativeData.size.height },
      rotation: absoluteRotation,
      layer: primaryLayer,
      layers: allLayers,
      number: relativeData.number,
    };
  }

  /**
   * Get all pad geometries for a component.
   * Useful for obstacle detection and collision checking.
   *
   * @param component - The component to get pads from
   * @param boardCopperLayers - The board's copper layers, top to bottom.
   *   Through-hole pads exist on every one of them. Defaults to a 2-layer
   *   set when omitted.
   * @returns Array of pad geometries
   */
  static getAllPadGeometries(component: Component, boardCopperLayers?: readonly string[]): IPadGeometry[] {
    const geometries: IPadGeometry[] = [];

    try {
      const footprintSExpr = component.footprint_lib(component.footprint);
      const parsed = this.getCachedParse(component.footprint, footprintSExpr);
      if (!parsed) return geometries;

      // Recursively collect all pad nodes
      const padNodes: SExpr[][] = [];
      const collectPads = (node: SExpr | SExpr[]) => {
        if (Array.isArray(node)) {
          if (node.length > 0 && Sym.isSym(node[0]) && node[0].name === 'pad') {
            padNodes.push(node);
          }
          for (const child of node) {
            if (Array.isArray(child)) {
              collectPads(child);
            }
          }
        }
      };
      collectPads(parsed);

      for (const padNode of padNodes) {
        const rel = this.extractPadData(padNode);
        if (!rel) continue;
        const abs = this.transformToAbsolute(rel, component, boardCopperLayers);
        if (abs) geometries.push(abs);
      }
    } catch {
      logger.debug(`[PadResolver] Footprint cannot be parsed, no pads resolved for ${displayName(component)}`);
    }

    return geometries;
  }
}
