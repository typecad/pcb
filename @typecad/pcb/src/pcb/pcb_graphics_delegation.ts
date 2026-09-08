import type {
  IGrLine,
  IGrTextOptions,
  IPcbZoneOptions,
  IPcbKeepoutOptions,
  IPcbLineOptions,
  IPcbCircleOptions,
  IPcbRectOptions,
  IPcbPolyOptions,
  IPcbArcOptions,
  IBoundsLike,
} from './pcb_interfaces.js';
import { generateUuid } from './pcb_utils.js';
import { pcbLine, pcbCircle, pcbRect, pcbPoly, pcbOutline, pcbText, pcbArc } from './pcb_graphics.js';
import { pcbOutlinePolygon, pcbOutlineCircle, pcbCutout, pcbCutoutCircle, pcbOutlinePath } from './pcb_outline.js';
import type { OutlinePathBuilder } from './pcb_outline.js';
import { zone, keepout } from './pcb_zones.js';
import type { PcbInternalState } from './pcb_state.js';

export function pcbTextWithOffset(state: PcbInternalState, options: IGrTextOptions): void {
  const modifiedOptions: IGrTextOptions = {
    ...options,
    x: options.x + state.currentOffset.x,
    y: options.y + state.currentOffset.y,
  };
  pcbText(state, modifiedOptions);
}

/** Shift a bounds-like rectangle by the active offset (group placement). */
function shiftBounds(bounds: IBoundsLike, dx: number, dy: number): IBoundsLike {
  if ('left' in bounds && 'top' in bounds) {
    return { left: bounds.left + dx, top: bounds.top + dy, width: bounds.width, height: bounds.height };
  }
  return { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height };
}

export function pcbZoneWithOffset(state: PcbInternalState, options: IPcbZoneOptions): void {
  const modifiedOptions = {
    ...options,
    ...(options.x !== undefined ? { x: options.x + state.currentOffset.x } : {}),
    ...(options.y !== undefined ? { y: options.y + state.currentOffset.y } : {}),
    ...(options.bounds ? { bounds: shiftBounds(options.bounds, state.currentOffset.x, state.currentOffset.y) } : {}),
    ...(options.points
      ? { points: options.points.map((p) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y })) }
      : {}),
  };
  zone(state, modifiedOptions);
}

export function pcbKeepoutWithOffset(state: PcbInternalState, options: IPcbKeepoutOptions): void {
  const modifiedOptions = {
    ...options,
    ...(options.x !== undefined ? { x: options.x + state.currentOffset.x } : {}),
    ...(options.y !== undefined ? { y: options.y + state.currentOffset.y } : {}),
    ...(options.bounds ? { bounds: shiftBounds(options.bounds, state.currentOffset.x, state.currentOffset.y) } : {}),
    ...(options.points
      ? { points: options.points.map((p) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y })) }
      : {}),
  };
  keepout(state, modifiedOptions);
}

export function pcbLineWithOffset(state: PcbInternalState, options: IPcbLineOptions): void {
  const modifiedOptions = {
    ...options,
    start: { x: options.start.x + state.currentOffset.x, y: options.start.y + state.currentOffset.y },
    end: { x: options.end.x + state.currentOffset.x, y: options.end.y + state.currentOffset.y },
  };
  pcbLine(state, modifiedOptions);
}

export function pcbCircleWithOffset(state: PcbInternalState, options: IPcbCircleOptions): void {
  const modifiedOptions = {
    ...options,
    center: { x: options.center.x + state.currentOffset.x, y: options.center.y + state.currentOffset.y },
  };
  if (options.end) {
    modifiedOptions.end = { x: options.end.x + state.currentOffset.x, y: options.end.y + state.currentOffset.y };
  }
  pcbCircle(state, modifiedOptions);
}

export function pcbRectWithOffset(state: PcbInternalState, options: IPcbRectOptions): void {
  const modifiedOptions = { ...options };
  if (modifiedOptions.x !== undefined) modifiedOptions.x += state.currentOffset.x;
  if (modifiedOptions.y !== undefined) modifiedOptions.y += state.currentOffset.y;
  if (modifiedOptions.bounds) {
    modifiedOptions.bounds = shiftBounds(modifiedOptions.bounds, state.currentOffset.x, state.currentOffset.y);
  }
  if (modifiedOptions.start) {
    modifiedOptions.start = {
      x: modifiedOptions.start.x + state.currentOffset.x,
      y: modifiedOptions.start.y + state.currentOffset.y,
    };
  }
  if (modifiedOptions.end) {
    modifiedOptions.end = {
      x: modifiedOptions.end.x + state.currentOffset.x,
      y: modifiedOptions.end.y + state.currentOffset.y,
    };
  }
  pcbRect(state, modifiedOptions);
}

export function pcbPolyWithOffset(state: PcbInternalState, options: IPcbPolyOptions): void {
  const modifiedOptions = {
    ...options,
    points: options.points.map((p) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y })),
  };
  pcbPoly(state, modifiedOptions);
}

export function pcbArcWithOffset(state: PcbInternalState, options: IPcbArcOptions): void {
  const shift = (p: { x: number; y: number }) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y });
  const modifiedOptions = {
    ...options,
    start: shift(options.start),
    mid: shift(options.mid),
    end: shift(options.end),
  };
  pcbArc(state, modifiedOptions);
}

export function pcbOutlineWithOffset(
  state: PcbInternalState,
  x: number,
  y: number,
  width: number,
  height: number,
  filletRadius: number = 0,
  conceptualUuidFromUser?: string,
): void {
  pcbOutline(
    state,
    x + state.currentOffset.x,
    y + state.currentOffset.y,
    width,
    height,
    filletRadius,
    conceptualUuidFromUser,
  );
}

export function pcbOutlinePolygonWithOffset(state: PcbInternalState, points: { x: number; y: number }[]): void {
  const offsetPoints = points.map((p) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y }));
  pcbOutlinePolygon(state, offsetPoints);
}

export function pcbOutlineCircleWithOffset(state: PcbInternalState, cx: number, cy: number, radius: number): void {
  pcbOutlineCircle(state, cx + state.currentOffset.x, cy + state.currentOffset.y, radius);
}

export function pcbCutoutWithOffset(state: PcbInternalState, points: { x: number; y: number }[]): void {
  pcbCutout(
    state,
    points.map((p) => ({ x: p.x + state.currentOffset.x, y: p.y + state.currentOffset.y })),
  );
}

export function pcbCutoutCircleWithOffset(state: PcbInternalState, cx: number, cy: number, radius: number): void {
  pcbCutoutCircle(state, cx + state.currentOffset.x, cy + state.currentOffset.y, radius);
}

export function pcbOutlinePathWithOffset(state: PcbInternalState, x: number, y: number): OutlinePathBuilder {
  return pcbOutlinePath(state, x + state.currentOffset.x, y + state.currentOffset.y);
}

export function pcbTrackWithOffset(
  state: PcbInternalState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  layer: string,
  locked: boolean,
  uuid?: string,
  net?: string,
): string {
  const offsetStart = { x: start.x + state.currentOffset.x, y: start.y + state.currentOffset.y };
  const offsetEnd = { x: end.x + state.currentOffset.x, y: end.y + state.currentOffset.y };
  const trackUuid =
    uuid || generateUuid('track', layer, width, offsetStart.x, offsetStart.y, offsetEnd.x, offsetEnd.y, net ?? '');

  const lineData: IGrLine = {
    type: 'line',
    uuid: trackUuid,
    layer: layer,
    strokeWidth: width,
    start: offsetStart,
    end: offsetEnd,
    locked: locked,
    net: net,
  };

  state.stagedOutlines.push({
    uuid: trackUuid,
    x: lineData.start.x,
    y: lineData.start.y,
    width: Math.abs(lineData.end.x - lineData.start.x),
    height: Math.abs(lineData.end.y - lineData.start.y),
    filletRadius: 0,
    elements: [lineData],
  });

  return trackUuid;
}
