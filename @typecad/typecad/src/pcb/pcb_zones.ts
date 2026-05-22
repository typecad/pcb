import logger from '../logging.js';
import {
    IFilledZone,
    IKeepoutZone,
    IOutline,
    OutlineElement
} from './pcb_interfaces.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { generateUuid, formatCallSite } from './pcb_utils.js';
import { Pin } from '../pin.js';

/**
 * PCB Zone Management Module
 *
 * This module contains standalone functions for managing copper zones, keepout zones,
 * and staged outlines. These functions were extracted from the main PCB class to provide
 * better modularity and reusability.
 */

/**
 * Creates a filled zone on copper layers connected to a specific net.
 * @param pcb - The PCB instance to add the zone to
 * @param options - Zone configuration options
 * @param options.pin - The pin object to connect this zone to (determines the net). Use either pin or net, not both.
 * @param options.net - The net name to connect this zone to (e.g., 'GND', 'VCC'). Use either pin or net, not both.
 * @param options.layers - Array of layer names (e.g., ['F.Cu', 'B.Cu'])
 * @param options.x - The x-coordinate of the zone's starting corner
 * @param options.y - The y-coordinate of the zone's starting corner
 * @param options.width - The width of the zone
 * @param options.height - The height of the zone
 * @param options.fillMode - Fill mode: 'solid' (default) or 'hatched'
 * @param options.filled - Whether zone should be filled (default: true)
 * @param options.priority - Zone priority (default: 0)
 * @param options.locked - Lock zone to prevent editing (default: false)
 * @param options.name - Optional zone name
 * @param options.minThickness - Minimum thickness (default: 0.1778mm)
 * @param options.clearance - Clearance from pads (default: 0.2mm)
 * @param options.connectPads - Pad connection type (default: thermal relief)
 * @param options.thermalGap - Thermal relief gap (default: 0.254mm)
 * @param options.thermalBridgeWidth - Thermal bridge width (default: 0.4064mm)
 * @param options.hatchStyle - Hatch style for zone outline: 'none', 'edge' (default), or 'full'
 * @param options.hatchPitch - Hatch pitch/spacing (default: 0.508mm)
 * @param options.smoothing - Corner smoothing: 'chamfer', 'fillet', or 'none' (default)
 * @param options.smoothingRadius - Radius for corner smoothing (required if smoothing is set)
 * @param options.islandRemovalMode - Island removal mode (default: 2)
 * @param options.islandAreaMin - Minimum island area (default: 0.5)
 * @param options.hatchThickness - Hatch thickness
 * @param options.hatchGap - Hatch gap
 * @param options.hatchOrientation - Hatch orientation
 * @param options.hatchSmoothingLevel - Hatch smoothing level
 * @param options.hatchSmoothingValue - Hatch smoothing value
 * @param options.hatchBorderAlgorithm - Hatch border algorithm
 * @param options.hatchMinHoleArea - Hatch minimum hole area
 * @param options.fillArcSegments - Fill arc segments (default: 16)
 * @param options.filledAreasThickness - Whether filled areas have thickness
 * @example
 * ```ts
 * // Basic ground plane
 * pcb.zone({
 *   net: 'GND',
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0,
 *   width: 50, height: 50
 * });
 *
 * // Zone connected to specific pin
 * pcb.zone({
 *   pin: pcb.components[0].pins[0],
 *   layers: ['F.Cu'],
 *   x: 10, y: 10,
 *   width: 20, height: 20,
 *   clearance: 0.25,
 *   thermalGap: 0.3,
 *   thermalBridgeWidth: 0.5
 * });
 *
 * // Hatched fill zone
 * pcb.zone({
 *   net: 'VCC',
 *   layers: ['F.Cu'],
 *   x: 0, y: 0,
 *   width: 40, height: 40,
 *   fillMode: 'hatched',
 *   hatchStyle: 'edge',
 *   hatchPitch: 0.5
 * });
 * ```
 */
export function zone(pcb: IPcbBoardContext, options: {
    // Net specification (required - one of these)
    pin?: Pin;
    net?: string;

    // Position and size (required)
    layers: string[];
    x: number;
    y: number;
    width: number;
    height: number;

    // Basic zone settings
    fillMode?: 'solid' | 'hatched';
    filled?: boolean;
    priority?: number;
    locked?: boolean;
    name?: string;
    minThickness?: number;

    // Hatch display settings (for zone outline)
    hatchStyle?: 'none' | 'edge' | 'full';
    hatchPitch?: number;

    // Pad connection settings
    clearance?: number;
    connectPads?: 'thru_hole_only' | 'full' | 'no';

    // Thermal relief settings
    thermalGap?: number;
    thermalBridgeWidth?: number;

    // Corner smoothing
    smoothing?: 'chamfer' | 'fillet' | 'none';
    smoothingRadius?: number;

    // Island removal
    islandRemovalMode?: number;
    islandAreaMin?: number;

    // Hatched fill options
    hatchThickness?: number;
    hatchGap?: number;
    hatchOrientation?: number;
    hatchSmoothingLevel?: number;
    hatchSmoothingValue?: number;
    hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
    hatchMinHoleArea?: number;

    // Additional fill settings
    fillArcSegments?: number;
    filledAreasThickness?: boolean;
}): void {
    const {
        pin,
        net,
        layers,
        x,
        y,
        width,
        height,
        fillMode = 'solid',
        filled = true,
        priority = 0,
        locked = false,
        name,
        minThickness = 0.1778,
        hatchStyle = 'edge',
        hatchPitch = 0.508,
        clearance = 0.2,
        connectPads,
        thermalGap = 0.254,
        thermalBridgeWidth = 0.4064,
        smoothing,
        smoothingRadius,
        islandRemovalMode,
        islandAreaMin,
        hatchThickness,
        hatchGap,
        hatchOrientation,
        hatchSmoothingLevel,
        hatchSmoothingValue,
        hatchBorderAlgorithm,
        hatchMinHoleArea,
        fillArcSegments = 16,
        filledAreasThickness
    } = options;

    // Validate that exactly one of pin or net is provided
    if (!pin && !net) {
        logger.error(`[PCB ZONE] ERROR: Must provide either 'pin' or 'net' parameter${formatCallSite(pcb.getCallSite())}`);
        return;
    }
    if (pin && net) {
        logger.error(`[PCB ZONE] ERROR: Cannot provide both 'pin' and 'net' parameters. Use one or the other${formatCallSite(pcb.getCallSite())}`);
        return;
    }

    // Create rectangular polygon (4 corners)
    const polygon = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
    ];

    const zoneUuid = generateUuid();

    // Store net information for later resolution
    // Format: "pin:reference:pinNumber" or "net:netName"
    let netIdentifier: string | undefined;
    if (pin) {
        netIdentifier = `pin:${pin.reference}:${pin.number}`;
    } else if (net) {
        netIdentifier = `net:${net}`;
    }

    const zone: IFilledZone = {
        uuid: zoneUuid,
        layers,
        x,
        y,
        width,
        height,
        polygon,
        net: netIdentifier,

        // Basic zone settings
        fillMode,
        filled,
        priority,
        locked,
        name,
        minThickness,

        // Hatch display settings
        hatchStyle,
        hatchPitch,

        // Pad connection
        clearance,
        connectPads,

        // Thermal relief
        thermalGap,
        thermalBridgeWidth,

        // Corner smoothing
        smoothing,
        smoothingRadius,

        // Island removal
        islandRemovalMode,
        islandAreaMin,

        // Hatched fill options
        hatchThickness,
        hatchGap,
        hatchOrientation,
        hatchSmoothingLevel,
        hatchSmoothingValue,
        hatchBorderAlgorithm,
        hatchMinHoleArea,

        // Additional fill settings
        fillArcSegments,
        filledAreasThickness
    };

    pcb.zones.push(zone);
}

/**
 * Creates a keepout zone that restricts routing and placement.
 * @param pcb - The PCB instance to add the keepout zone to
 * @param options - Keepout zone configuration options
 * @param options.layers - Array of layer names (e.g., ['F.Cu', 'B.Cu'])
 * @param options.x - The x-coordinate of the keepout zone's starting corner
 * @param options.y - The y-coordinate of the keepout zone's starting corner
 * @param options.width - The width of the keepout zone
 * @param options.height - The height of the keepout zone
 * @param options.restrictions - Object specifying what to restrict (all default to true)
 * @param options.restrictions.tracks - Restrict tracks (default: true)
 * @param options.restrictions.vias - Restrict vias (default: true)
 * @param options.restrictions.pads - Restrict pads (default: true)
 * @param options.restrictions.copperpour - Restrict copper pour (default: true)
 * @param options.restrictions.footprints - Restrict footprints (default: true)
 * @param options.priority - Zone priority (default: 0)
 * @param options.locked - Lock zone to prevent editing (default: false)
 * @param options.name - Optional zone name
 * @param options.hatchStyle - Hatch style for zone outline: 'none', 'edge' (default), or 'full'
 * @param options.hatchPitch - Hatch pitch/spacing (default: 0.508mm)
 * @param options.smoothing - Corner smoothing: 'chamfer', 'fillet', or 'none' (default)
 * @param options.smoothingRadius - Radius for corner smoothing (required if smoothing is set)
 * @example
 * ```ts
 * // ============================================
 * // BASIC EXAMPLES
 * // ============================================
 *
 * // Basic keepout (restricts everything)
 * pcb.keepout({
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0,
 *   width: 10, height: 10
 * });
 *
 * // ============================================
 * // CUSTOM RESTRICTIONS
 * // ============================================
 *
 * // Restrict only tracks and vias, allow pads
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 5, y: 5, width: 8, height: 8,
 *   restrictions: {
 *     tracks: true,
 *     vias: true,
 *     pads: false,
 *     copperpour: true,
 *     footprints: false
 *   }
 * });
 *
 * // Restrict only copper pour (allow routing)
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 10, y: 10, width: 15, height: 15,
 *   restrictions: {
 *     tracks: false,
 *     vias: false,
 *     pads: false,
 *     copperpour: true,
 *     footprints: false
 *   }
 * });
 *
 * // ============================================
 * // ZONE MANAGEMENT OPTIONS
 * // ============================================
 *
 * // Named, locked keepout with priority
 * pcb.keepout({
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0, width: 20, height: 20,
 *   name: 'Antenna Keepout',
 *   locked: true,
 *   priority: 10
 * });
 *
 * // High-priority keepout area
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 0, y: 0, width: 30, height: 30,
 *   name: 'Critical Area',
 *   priority: 100
 * });
 *
 * // ============================================
 * // CORNER SMOOTHING
 * // ============================================
 *
 * // Filleted corners
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 0, y: 0, width: 15, height: 15,
 *   smoothing: 'fillet',
 *   smoothingRadius: 0.5,
 *   name: 'Smooth Keepout'
 * });
 *
 * // Chamfered corners
 * pcb.keepout({
 *   layers: ['B.Cu'],
 *   x: 0, y: 0, width: 15, height: 15,
 *   smoothing: 'chamfer',
 *   smoothingRadius: 0.3
 * });
 * ```
 */
export function keepout(pcb: IPcbBoardContext, options: {
    // Position and size (required)
    layers: string[];
    x: number;
    y: number;
    width: number;
    height: number;

    // Restrictions
    restrictions?: {
        tracks?: boolean;
        vias?: boolean;
        pads?: boolean;
        copperpour?: boolean;
        footprints?: boolean;
    };

    // Basic zone settings
    priority?: number;
    locked?: boolean;
    name?: string;

    // Hatch display settings
    hatchStyle?: 'none' | 'edge' | 'full';
    hatchPitch?: number;

    // Corner smoothing
    smoothing?: 'chamfer' | 'fillet' | 'none';
    smoothingRadius?: number;
}): void {
    const {
        layers,
        x,
        y,
        width,
        height,
        restrictions = {},
        priority = 0,
        locked = false,
        name,
        hatchStyle = 'edge',
        hatchPitch = 0.508,
        smoothing,
        smoothingRadius
    } = options;

    // Create rectangular polygon (4 corners)
    const polygon = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
    ];

    const zoneUuid = generateUuid();

    // Default all restrictions to true (not allowed)
    const keepoutZone: IKeepoutZone = {
        uuid: zoneUuid,
        layers,
        x,
        y,
        width,
        height,
        polygon,
        priority,
        locked,
        name,
        restrictions: {
            tracks: restrictions.tracks !== false,
            vias: restrictions.vias !== false,
            pads: restrictions.pads !== false,
            copperpour: restrictions.copperpour !== false,
            footprints: restrictions.footprints !== false
        },
        hatchStyle,
        hatchPitch,
        smoothing,
        smoothingRadius
    };

    pcb.keepoutZones.push(keepoutZone);
}