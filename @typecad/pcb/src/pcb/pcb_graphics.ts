import { IGrLine, IGrCircle, IGrRect, IGrPoly, OutlineElement, IOutline, ISourceInfo } from './pcb_interfaces.js';
import { generateUuid, formatCallSite } from './pcb_utils.js';
import type { PcbInternalState } from './pcb_state.js';
import fs from 'node:fs';
import logger from '../utils/logging.js';
import { getCallSite } from '../utils/stack_trace.js';

/**
 * Creates a graphical line on the board.
 * @param pcb - PCB instance to access graphics storage
 * @param options - Line configuration options
 * @param options.start - Starting point coordinates {x, y}
 * @param options.end - Ending point coordinates {x, y}
 * @param options.layer - Layer name (default: 'F.SilkS')
 * @param options.width - Line width/thickness (default: 0.15mm)
 * @param options.locked - Lock the line to prevent editing (default: false)
 * @example
 * ```ts
 * // Basic line on front silkscreen
 * pcbLine(pcbInstance, { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } });
 *
 * // Line on edge cuts with custom width
 * pcbLine(pcbInstance, {
 *   start: { x: 0, y: 0 },
 *   end: { x: 100, y: 0 },
 *   layer: 'Edge.Cuts',
 *   width: 0.1
 * });
 *
 * // Locked line on user drawings layer
 * pcbLine(pcbInstance, {
 *   start: { x: 20, y: 20 },
 *   end: { x: 80, y: 80 },
 *   layer: 'Dwgs.User',
 *   width: 0.2,
 *   locked: true
 * });
 * ```
 */
export function pcbLine(
  state: PcbInternalState,
  options: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    layer?: string;
    width?: number;
    locked?: boolean;
  },
): void {
  const { start, end, layer = 'F.SilkS', width = 0.15, locked = false } = options;

  const line: IGrLine = {
    type: 'line',
    uuid: generateUuid('gr-line', layer, width, start.x, start.y, end.x, end.y),
    layer,
    strokeWidth: width,
    start,
    end,
    locked,
  };

  state.grLines.push(line);
}

/**
 * Creates a graphical circle on the board.
 * @param pcb - PCB instance to access graphics storage
 * @param options - Circle configuration options
 * @param options.center - Center point coordinates {x, y}
 * @param options.radius - Circle radius (alternative to using end point)
 * @param options.end - Radius endpoint coordinates {x, y} (alternative to radius)
 * @param options.layer - Layer name (default: 'F.SilkS')
 * @param options.width - Outline width/thickness (default: 0.15mm)
 * @param options.fill - Fill the circle (default: false)
 * @param options.locked - Lock the circle to prevent editing (default: false)
 * @example
 * ```ts
 * // Circle with radius
 * pcbCircle(pcbInstance, { center: { x: 50, y: 50 }, radius: 10 });
 *
 * // Filled circle on copper layer
 * pcbCircle(pcbInstance, {
 *   center: { x: 30, y: 30 },
 *   radius: 5,
 *   layer: 'F.Cu',
 *   width: 0.2,
 *   fill: true
 * });
 *
 * // Circle using endpoint (radius point)
 * pcbCircle(pcbInstance, {
 *   center: { x: 0, y: 0 },
 *   end: { x: 10, y: 0 },  // Radius = 10
 *   layer: 'Dwgs.User'
 * });
 * ```
 */
export function pcbCircle(
  state: PcbInternalState,
  options: {
    center: { x: number; y: number };
    radius?: number;
    end?: { x: number; y: number };
    layer?: string;
    width?: number;
    fill?: boolean;
    locked?: boolean;
  },
): void {
  const { center, radius, end, layer = 'F.SilkS', width = 0.15, fill = false, locked = false } = options;

  // Calculate end point from radius if provided
  let endPoint: { x: number; y: number };
  if (radius !== undefined) {
    endPoint = { x: center.x + radius, y: center.y };
  } else if (end !== undefined) {
    endPoint = end;
  } else {
    logger.error(`[PCB CIRCLE] ERROR: Must provide either 'radius' or 'end' parameter${formatCallSite(getCallSite())}`);
    return;
  }

  const circle: IGrCircle = {
    type: 'circle',
    uuid: generateUuid('gr-circle', layer, width, center.x, center.y, endPoint.x, endPoint.y),
    layer,
    strokeWidth: width,
    center,
    end: endPoint,
    fill,
    locked,
  };

  state.grCircles.push(circle);
}

/**
 * Creates a graphical rectangle on the board.
 * @param pcb - PCB instance to access graphics storage
 * @param options - Rectangle configuration options
 * @param options.x - X-coordinate of top-left corner (alternative to start)
 * @param options.y - Y-coordinate of top-left corner (alternative to start)
 * @param options.width - Rectangle width (alternative to end)
 * @param options.height - Rectangle height (alternative to end)
 * @param options.start - Top-left corner coordinates {x, y} (alternative to x/y)
 * @param options.end - Bottom-right corner coordinates {x, y} (alternative to width/height)
 * @param options.layer - Layer name (default: 'F.SilkS')
 * @param options.strokeWidth - Outline width/thickness (default: 0.15mm)
 * @param options.fill - Fill the rectangle (default: false)
 * @param options.locked - Lock the rectangle to prevent editing (default: false)
 * @example
 * ```ts
 * // Rectangle using x, y, width, height
 * pcbRect(pcbInstance, { x: 10, y: 10, width: 30, height: 20 });
 *
 * // Filled rectangle on copper layer
 * pcbRect(pcbInstance, {
 *   x: 50, y: 50,
 *   width: 40, height: 30,
 *   layer: 'F.Cu',
 *   strokeWidth: 0.2,
 *   fill: true
 * });
 *
 * // Rectangle using start and end points
 * pcbRect(pcbInstance, {
 *   start: { x: 0, y: 0 },
 *   end: { x: 100, y: 80 },
 *   layer: 'Dwgs.User'
 * });
 *
 * // Locked outline rectangle
 * pcbRect(pcbInstance, {
 *   x: 5, y: 5, width: 90, height: 70,
 *   layer: 'Edge.Cuts',
 *   strokeWidth: 0.1,
 *   locked: true
 * });
 * ```
 */
export function pcbRect(
  state: PcbInternalState,
  options: {
    bounds?: import('./pcb_interfaces.js').IBoundsLike;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    layer?: string;
    strokeWidth?: number;
    fill?: boolean;
    locked?: boolean;
  },
): void {
  const {
    bounds,
    x,
    y,
    width,
    height,
    start,
    end,
    layer = 'F.SilkS',
    strokeWidth = 0.15,
    fill = false,
    locked = false,
  } = options;

  // Expand bounds (e.g. pcb.board) to the rect form first
  let rectX = x;
  let rectY = y;
  let rectW = width;
  let rectH = height;
  if (bounds !== undefined) {
    const r =
      'left' in bounds && 'top' in bounds
        ? { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
        : { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    rectX = r.x;
    rectY = r.y;
    rectW = r.width;
    rectH = r.height;
  }

  // Determine start and end points
  let startPoint: { x: number; y: number };
  let endPoint: { x: number; y: number };

  if (start !== undefined && end !== undefined) {
    startPoint = start;
    endPoint = end;
  } else if (rectX !== undefined && rectY !== undefined && rectW !== undefined && rectH !== undefined) {
    startPoint = { x: rectX, y: rectY };
    endPoint = { x: rectX + rectW, y: rectY + rectH };
  } else {
    logger.error(
      `[PCB RECT] ERROR: Must provide 'bounds', (x, y, width, height), or (start, end) parameters${formatCallSite(getCallSite())}`,
    );
    return;
  }

  const rect: IGrRect = {
    type: 'rect',
    uuid: generateUuid('gr-rect', layer, strokeWidth, startPoint.x, startPoint.y, endPoint.x, endPoint.y),
    layer,
    strokeWidth,
    start: startPoint,
    end: endPoint,
    fill,
    locked,
  };

  state.grRects.push(rect);
}

/**
 * Creates a graphical polygon on the board.
 * @param pcb - PCB instance to access graphics storage
 * @param options - Polygon configuration options
 * @param options.points - Array of vertex coordinates [{x, y}, ...]
 * @param options.layer - Layer name (default: 'F.SilkS')
 * @param options.width - Outline width/thickness (default: 0.15mm)
 * @param options.fill - Fill the polygon (default: false)
 * @param options.locked - Lock the polygon to prevent editing (default: false)
 * @example
 * ```ts
 * // Triangle
 * pcbPoly(pcbInstance, {
 *   points: [
 *     { x: 0, y: 0 },
 *     { x: 10, y: 0 },
 *     { x: 5, y: 10 }
 *   ]
 * });
 *
 * // Filled hexagon on copper layer
 * pcbPoly(pcbInstance, {
 *   points: [
 *     { x: 50, y: 40 },
 *     { x: 60, y: 45 },
 *     { x: 60, y: 55 },
 *     { x: 50, y: 60 },
 *     { x: 40, y: 55 },
 *     { x: 40, y: 45 }
 *   ],
 *   layer: 'F.Cu',
 *   width: 0.2,
 *   fill: true
 * });
 *
 * // Pentagon on user drawings layer
 * pcbPoly(pcbInstance, {
 *   points: [
 *     { x: 100, y: 90 },
 *     { x: 110, y: 95 },
 *     { x: 108, y: 105 },
 *     { x: 92, y: 105 },
 *     { x: 90, y: 95 }
 *   ],
 *   layer: 'Dwgs.User',
 *   width: 0.15,
 *   locked: true
 * });
 * ```
 */
export function pcbPoly(
  state: PcbInternalState,
  options: {
    points: { x: number; y: number }[];
    layer?: string;
    width?: number;
    fill?: boolean;
    locked?: boolean;
  },
): void {
  const { points, layer = 'F.SilkS', width = 0.15, fill = false, locked = false } = options;

  if (!points || points.length < 3) {
    logger.error(`[PCB POLY] ERROR: Polygon must have at least 3 points${formatCallSite(getCallSite())}`);
    return;
  }

  const poly: IGrPoly = {
    type: 'poly',
    uuid: generateUuid('gr-poly', layer, width, points.map((p) => `${p.x},${p.y}`).join(';')),
    layer,
    strokeWidth: width,
    points,
    fill,
    locked,
  };

  state.grPolys.push(poly);
}

/**
 * Creates a rectangular outline on the Edge.Cuts layer.
 * @param pcb - PCB instance to access graphics storage
 * @param x - The x-coordinate of the rectangle's start point.
 * @param y - The y-coordinate of the rectangle's start point.
 * @param width - The width of the rectangle.
 * @param height - The height of the rectangle.
 * @param filletRadius - The radius for filleted corners (0 for sharp).
 * @param conceptualUuidFromUser - Optional UUID for the conceptual outline.
 */
export function pcbOutline(
  state: PcbInternalState,
  x: number,
  y: number,
  width: number,
  height: number,
  filletRadius: number = 0,
  conceptualUuidFromUser?: string,
): void {
  // Capture source info
  const callSite = getCallSite();
  const sourceInfo: ISourceInfo | undefined = callSite
    ? {
        file: callSite.file,
        line: callSite.line,
        column: callSite.column,
      }
    : undefined;

  // Try to capture variable and params from source code
  if (callSite && sourceInfo) {
    try {
      const sourceContent = fs.readFileSync(callSite.file, 'utf8');
      const lines = sourceContent.split('\n');
      const targetLine = lines[callSite.line - 1];

      // Match patterns like: const outline1 = pcb.outline(...) or just pcb.outline(...)
      const varMatch = targetLine.match(
        /^\s*(?:(const|let|var)\s+(\w+)\s*=\s*)?(\w+)\.outline\s*\(\s*(.+?)\s*\)\s*;?\s*$/,
      );
      if (varMatch) {
        if (varMatch[2]) {
          sourceInfo.variable = varMatch[2]; // Variable name if assigned
        }
        // Store the actual parameter values
        sourceInfo.params = {
          x,
          y,
          width,
          height,
          filletRadius,
          ...(conceptualUuidFromUser ? { conceptualUuidFromUser } : {}),
        };
      }
    } catch (err) {
      logger.debug('pcb_graphics: failed to read existing file for outline reuse', err);
    }
  }

  const conceptualOutlineUuid: string = conceptualUuidFromUser || generateUuid('outline', x, y, width, height);

  const elements: OutlineElement[] = [];
  const strokeW = 0.05;
  const layerName = 'Edge.Cuts';

  // Helper to generate element UUID (deterministic from segment geometry)
  const getElementUuid = (kind: string, ax: number, ay: number, bx: number, by: number, stroke: number): string => {
    return generateUuid('outline-el', layerName, kind, stroke, ax, ay, bx, by);
  };

  const r = Math.max(0, filletRadius); // Ensure radius is not negative

  // Calculate corner points and line segment points
  // Points for the outer rectangle corners
  const x0 = x;
  const y0 = y;
  const x1 = x + width;
  const y1 = y + height;

  // Points for line segments, adjusted for fillet radius
  const p_top_start = { x: x0 + r, y: y0 };
  const p_top_end = { x: x1 - r, y: y0 };

  const p_right_start = { x: x1, y: y0 + r };
  const p_right_end = { x: x1, y: y1 - r };

  const p_bottom_start = { x: x1 - r, y: y1 };
  const p_bottom_end = { x: x0 + r, y: y1 };

  const p_left_start = { x: x0, y: y1 - r };
  const p_left_end = { x: x0, y: y0 + r };

  // Top line
  if (p_top_start.x < p_top_end.x) {
    // Only add line if its length is positive
    elements.push({
      type: 'line',
      uuid: getElementUuid('line', p_top_start.x, p_top_start.y, p_top_end.x, p_top_end.y, strokeW),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_top_start,
      end: p_top_end,
      locked: false,
    });
  }
  // Right line
  if (p_right_start.y < p_right_end.y) {
    elements.push({
      type: 'line',
      uuid: getElementUuid('line', p_right_start.x, p_right_start.y, p_right_end.x, p_right_end.y, strokeW),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_right_start,
      end: p_right_end,
      locked: false,
    });
  }
  // Bottom line
  if (p_bottom_end.x < p_bottom_start.x) {
    // Note: KiCad typically has x increasing left to right
    elements.push({
      type: 'line',
      uuid: getElementUuid('line', p_bottom_start.x, p_bottom_start.y, p_bottom_end.x, p_bottom_end.y, strokeW),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_bottom_start,
      end: p_bottom_end,
      locked: false, // Corrected order for bottom line
    });
  }
  // Left line
  if (p_left_end.y < p_left_start.y) {
    elements.push({
      type: 'line',
      uuid: getElementUuid('line', p_left_start.x, p_left_start.y, p_left_end.x, p_left_end.y, strokeW),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_left_start,
      end: p_left_end,
      locked: false, // Corrected order for left line
    });
  }

  if (r > 0) {
    // Arc centers
    const center_tr = { x: x1 - r, y: y0 + r };
    const center_br = { x: x1 - r, y: y1 - r };
    const center_bl = { x: x0 + r, y: y1 - r };
    const center_tl = { x: x0 + r, y: y0 + r };

    // Top-Right Arc (clockwise in KiCad coordinate system for this orientation)
    // Starts from end of top line, ends at start of right line
    elements.push({
      type: 'arc',
      uuid: getElementUuid('arc-tr', p_top_end.x, p_top_end.y, p_right_start.x, p_right_start.y, r),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_top_end, // (x1-r, y0)
      mid: { x: center_tr.x + r * Math.cos(Math.PI * 1.75), y: center_tr.y + r * Math.sin(Math.PI * 1.75) }, // Midpoint on arc (angle -45 deg or 315 deg)
      end: p_right_start, // (x1, y0+r)
    });
    // Bottom-Right Arc
    elements.push({
      type: 'arc',
      uuid: getElementUuid('arc-br', p_right_end.x, p_right_end.y, p_bottom_start.x, p_bottom_start.y, r),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_right_end, // (x1, y1-r)
      mid: { x: center_br.x + r * Math.cos(Math.PI * 0.25), y: center_br.y + r * Math.sin(Math.PI * 0.25) }, // Corrected: Midpoint on arc (angle 45 deg for BR)
      end: p_bottom_start, // (x1-r, y1)
    });
    // Bottom-Left Arc
    elements.push({
      type: 'arc',
      uuid: getElementUuid('arc-bl', p_bottom_end.x, p_bottom_end.y, p_left_start.x, p_left_start.y, r),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_bottom_end, // (x0+r, y1)
      mid: { x: center_bl.x + r * Math.cos(Math.PI * 0.75), y: center_bl.y + r * Math.sin(Math.PI * 0.75) }, // Midpoint on arc (angle 135 deg)
      end: p_left_start, // (x0, y1-r)
    });
    // Top-Left Arc
    elements.push({
      type: 'arc',
      uuid: getElementUuid('arc-tl', p_left_end.x, p_left_end.y, p_top_start.x, p_top_start.y, r),
      layer: layerName,
      strokeWidth: strokeW,
      start: p_left_end, // (x0, y0+r)
      mid: { x: center_tl.x + r * Math.cos(Math.PI * 1.25), y: center_tl.y + r * Math.sin(Math.PI * 1.25) }, // Corrected: Midpoint on arc (angle 225 deg for TL)
      end: p_top_start, // (x0+r, y0)
    });
  }

  const outlineData: IOutline = {
    uuid: conceptualOutlineUuid,
    x,
    y,
    width,
    height,
    filletRadius: r,
    elements,
    sourceInfo,
  };
  state.stagedOutlines.push(outlineData);
}

export function pcbText(state: PcbInternalState, options: import('./pcb_interfaces.js').IGrTextOptions): void {
  const textElement: import('./pcb_interfaces.js').IGrTextOptions = {
    text: options.text,
    x: options.x,
    y: options.y,
    layer: options.layer || 'F.SilkS',
    width: options.width || 1.27,
    height: options.height || 1.27,
    thickness: options.thickness,
    rotation: options.rotation || 0,
    font: options.font,
    bold: options.bold,
    italic: options.italic,
    justify: options.justify,
    hide: options.hide,
    uuid:
      options.uuid ||
      generateUuid('gr-text', options.text, options.x, options.y, options.layer || 'F.SilkS', options.rotation || 0),
  };

  state.grTexts.push(textElement);
}
/**
 * Draw an arc on a board layer (e.g. silkscreen, fabrication, or copper).
 * KiCad defines arcs by three points: start, a point on the arc (mid), and
 * end — a mid point halfway along the intended arc yields the expected shape.
 * @param options.start - Arc start point in mm.
 * @param options.mid - A point on the arc between start and end.
 * @param options.end - Arc end point in mm.
 * @param options.layer - Layer name (default 'F.SilkS').
 * @param options.width - Stroke width in mm (default 0.15).
 */
export function pcbArc(state: PcbInternalState, options: import('./pcb_interfaces.js').IPcbArcOptions): void {
  const { start, mid, end, layer = 'F.SilkS', width = 0.15 } = options;

  const finite = (p: { x?: number; y?: number } | undefined) =>
    p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!finite(start) || !finite(mid) || !finite(end)) {
    logger.error(`[PCB ARC] ERROR: start, mid, and end must be finite {x, y} points${formatCallSite(getCallSite())}`);
    return;
  }
  // Degenerate: all three points identical
  if (start.x === mid.x && start.y === mid.y && mid.x === end.x && mid.y === end.y) {
    logger.error(`[PCB ARC] ERROR: start, mid, and end must not all be the same point${formatCallSite(getCallSite())}`);
    return;
  }

  const elements = [
    {
      type: 'arc' as const,
      uuid: generateUuid('gr-arc', layer, width, start.x, start.y, mid.x, mid.y, end.x, end.y),
      layer,
      strokeWidth: width,
      start: { ...start },
      mid: { ...mid },
      end: { ...end },
    },
  ];

  // Bounding box feeds outline classification and bounds math
  const xs = [start.x, mid.x, end.x];
  const ys = [start.y, mid.y, end.y];

  const outlineData: import('./pcb_interfaces.js').IOutline = {
    uuid: generateUuid('gr-arc-outline', layer, width, start.x, start.y, mid.x, mid.y, end.x, end.y),
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    filletRadius: 0,
    elements,
  };
  state.stagedOutlines.push(outlineData);
}
