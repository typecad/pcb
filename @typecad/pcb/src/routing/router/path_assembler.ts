import type { IRoutePath, RouteEndpoint } from './types.js';

export function appendSegmentNodes(
  destination: RouteEndpoint[],
  destinationGrid: { gridX: number; gridY: number; layer: string }[],
  segment: IRoutePath,
): void {
  const skipFirst = destination.length > 0 && pointsEqual(destination[destination.length - 1], segment.nodes[0]);
  const nodesToAdd = skipFirst ? segment.nodes.slice(1) : segment.nodes;
  destination.push(...nodesToAdd);

  if (segment.gridNodes && segment.gridNodes.length > 0) {
    const gridSlice = skipFirst ? segment.gridNodes.slice(1) : segment.gridNodes;
    destinationGrid.push(...gridSlice);
  }
}

export function mergeSegments(segments: IRoutePath[]): IRoutePath {
  const mergedNodes: RouteEndpoint[] = [];
  const mergedGridNodes: { gridX: number; gridY: number; layer: string }[] = [];
  let mergedLength = 0;
  let mergedVias = 0;

  for (const seg of segments) {
    appendSegmentNodes(mergedNodes, mergedGridNodes, seg);
    mergedLength += seg.length;
    mergedVias += seg.viaCount;
  }

  return {
    nodes: mergedNodes,
    gridNodes: mergedGridNodes.length > 0 ? mergedGridNodes : undefined,
    length: mergedLength,
    viaCount: mergedVias,
    success: segments.every((s) => s.success),
    error: segments.every((s) => s.success) ? undefined : 'One or more segments failed',
  };
}

export function pointsEqual(a: RouteEndpoint | undefined, b: RouteEndpoint | undefined, tolerance = 0.001): boolean {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance && a.layer === b.layer;
}
