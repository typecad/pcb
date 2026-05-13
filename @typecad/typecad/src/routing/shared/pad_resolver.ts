import { Component } from "../../component.js";
import { Pin } from "../../pin.js";
import S from "../../utils/sexpr_instance.js";
import { TypeCadError } from '../../errors.js';
import logger from '../../logging.js';



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
    /**
     * Get the absolute center position of a pin's pad on the PCB.
     *
     * @param pin - The pin to resolve
     * @returns The absolute X,Y coordinates in mm, or null if unable to resolve
     *
     * @example
     * ```ts
     * const center = PadResolver.getPadCenter(resistor.pin(1));
     * if (center) {
     *   console.log(`Pad is at ${center.x}, ${center.y}`);
     * }
     * ```
     */
    static getPadCenter(pin: Pin): { x: number; y: number; layer: string } | null {
        if (!pin.owner) {
            logger.warn(`[PadResolver] Pin ${pin.number} has no owner component`);
            return null;
        }

        const geometry = this.getPadGeometry(pin.owner, pin.number);
        if (!geometry) {
            return null;
        }

        return {
            x: geometry.center.x,
            y: geometry.center.y,
            layer: geometry.layer
        };
    }

    /**
     * Get complete geometry information for a specific pad.
     *
     * @param component - The component containing the pad
     * @param pinNumber - The pin/pad number to look up
     * @returns Complete pad geometry, or null if not found
     *
     * @example
     * ```ts
     * const padGeom = PadResolver.getPadGeometry(resistor, 1);
     * if (padGeom) {
     *   console.log(`Pad shape: ${padGeom.shape}, size: ${padGeom.size.width}x${padGeom.size.height}mm`);
     * }
     * ```
     */
    static getPadGeometry(component: Component, pinNumber: string | number): IPadGeometry | null {
        try {
            // Get the footprint S-expression
            const footprintSExpr = component.footprint_lib(component.footprint);

            // Parse the S-expression
            const parsed = S.parse(footprintSExpr);

            if (!Array.isArray(parsed) || parsed.length === 0) {
                logger.warn(`[PadResolver] Unable to parse footprint for ${component.reference}`);
                return null;
            }

            // Find the pad matching the pin number
            const padNode = this.findPadNode(parsed, pinNumber);
            if (!padNode) {
                logger.warn(`[PadResolver] Pad ${pinNumber} not found in footprint ${component.footprint} for ${component.reference}`);
                return null;
            }

            // Extract pad data from the S-expression
            const relativeData = this.extractPadData(padNode);
            if (!relativeData) {
                logger.warn(`[PadResolver] Unable to extract pad data for ${component.reference} pin ${pinNumber}`);
                return null;
            }

            // Transform from footprint-relative to board-absolute coordinates
            const absoluteGeometry = this.transformToAbsolute(relativeData, component);

            return absoluteGeometry;

        } catch (error: unknown) {
            logger.warn(`[PadResolver] Error resolving pad geometry for ${component.reference} pin ${pinNumber}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Find a pad node in the footprint S-expression tree.
     * @private
     */
    private static findPadNode(sexpr: any, pinNumber: string | number): any[] | null {
        // Normalize pin number to string for comparison
        const targetNumber = String(pinNumber);

        // Recursively search for pad nodes
        const search = (node: any): any[] | null => {
            if (!Array.isArray(node)) return null;

            // Check if this is a pad node: (pad "number" ...)
            if (node[0] === 'pad' && node.length > 1) {
                const padNumber = String(node[1]).replace(/[`"]/g, '');
                if (padNumber === targetNumber) {
                    return node;
                }
            }

            // Search children
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

    /**
     * Extract pad data from a pad S-expression node.
     * @private
     */
    private static extractPadData(padNode: any[]): {
        number: string | number;
        type: string;
        at: { x: number; y: number; rotation: number };
        size: { width: number; height: number };
        shape: string;
        layers: string[];
    } | null {
        let at = { x: 0, y: 0, rotation: 0 };
        let size = { width: 1.0, height: 1.0 };
        let shape = 'rect';
        let type = 'smd';
        let layers: string[] = ['F.Cu'];
        const number = String(padNode[1]).replace(/[`"]/g, '');

        // Parse the pad node elements
        for (const element of padNode) {
            if (!Array.isArray(element)) continue;

            const elementType = element[0];

            if (elementType === 'at') {
                // (at x y [rotation])
                at.x = parseFloat(String(element[1])) || 0;
                at.y = parseFloat(String(element[2])) || 0;
                at.rotation = element.length > 3 ? parseFloat(String(element[3])) || 0 : 0;
            } else if (elementType === 'size') {
                // (size width height)
                size.width = parseFloat(String(element[1])) || 1.0;
                size.height = parseFloat(String(element[2])) || 1.0;
            } else if (elementType === 'layers') {
                // (layers "F.Cu" "F.Paste" "F.Mask")
                layers = element.slice(1).map((l: any) => String(l).replace(/[`"]/g, ''));
            }
        }

        // Type is the 2nd element: (pad "1" thru_hole circle ...)
        if (padNode.length > 2) {
            type = String(padNode[2]).replace(/[`"]/g, '');
        }

        // Shape is the 3rd element: (pad "1" type shape ...)
        if (padNode.length > 3) {
            shape = String(padNode[3]).replace(/[`"]/g, '');
        }

        return { number, type, at, size, shape, layers };
    }

    /**
     * Transform pad data from footprint-relative to board-absolute coordinates.
     * @private
     */
    private static transformToAbsolute(
        relativeData: ReturnType<typeof PadResolver.extractPadData>,
        component: Component
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
        let padX = relativeData.at.x;
        let padY = relativeData.at.y;

        // For back side, flip X coordinate (KiCad convention)
        if (componentSide === 'back') {
            padX = -padX;
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
        const copperLayers = relativeData.layers.filter(l => l.includes('.Cu'));
        const hasWildcardCu = copperLayers.some(l => l === '*.Cu');
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
            // Through-hole pads exist on all copper layers
            allLayers = ['F.Cu', 'B.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu']; // Add more inner layers as needed
            primaryLayer = componentSide === 'back' ? 'B.Cu' : 'F.Cu';
        } else {
            // SMD pads exist only on the specified layers
            if (hasWildcardCu) {
                // KiCad may specify '*.Cu' for pads that exist on all copper layers (e.g., 'connect').
                // For routing, avoid propagating the wildcard; expand to the two outer copper layers by default.
                allLayers = ['F.Cu', 'B.Cu'];
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
            number: relativeData.number
        };
    }

    /**
     * Get all pad geometries for a component.
     * Useful for obstacle detection and collision checking.
     *
     * @param component - The component to get pads from
     * @returns Array of pad geometries
     */
    static getAllPadGeometries(component: Component): IPadGeometry[] {
        const geometries: IPadGeometry[] = [];

        // Always parse the footprint and enumerate all pads to ensure
        // netless/mechanical pads are included as obstacles. This avoids
        // missing NC pads on footprints that also define electrical pins.
        try {
            const footprintSExpr = component.footprint_lib(component.footprint);
            const parsed = S.parse(footprintSExpr);

            if (!Array.isArray(parsed) || parsed.length === 0) {
                return geometries;
            }

            // Recursively collect all pad nodes
            const padNodes: any[] = [];
            const collectPads = (node: any) => {
                if (Array.isArray(node)) {
                    if (node.length > 0 && String(node[0]) === 'pad') {
                        padNodes.push(node);
                    }
                    for (const child of node) {
                        collectPads(child);
                    }
                }
            };
            collectPads(parsed);

            for (const padNode of padNodes) {
                const rel = this.extractPadData(padNode);
                if (!rel) continue;
                const abs = this.transformToAbsolute(rel, component);
                if (abs) geometries.push(abs);
            }
        } catch {
            // Silently ignore if footprint cannot be parsed; no pads resolved
        }

        return geometries;
    }
}
