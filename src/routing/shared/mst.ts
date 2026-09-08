export interface IMSTEdge {
  from: number;
  to: number;
  cost: number;
}

/**
 * Build a Minimum Spanning Tree (Prim's) over indexed nodes with a cost callback.
 * Returns a list of edges connecting all nodes in a tree (n-1 edges) or fewer if disconnected.
 */
export function buildMST<T>(nodes: T[], costFn: (i: number, j: number) => number, startIndex: number = 0): IMSTEdge[] {
  const n = nodes.length;
  const edges: IMSTEdge[] = [];
  if (n <= 1) return edges;

  const inTree = new Set<number>();
  const minCost = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);

  const start = Math.max(0, Math.min(startIndex, n - 1));
  inTree.add(start);
  for (let i = 0; i < n; i++) {
    if (i === start) continue;
    minCost[i] = costFn(start, i);
    parent[i] = start;
  }

  for (let iter = 0; iter < n - 1; iter++) {
    let minIdx = -1;
    let minEdgeCost = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree.has(i) && minCost[i] < minEdgeCost) {
        minEdgeCost = minCost[i];
        minIdx = i;
      }
    }
    if (minIdx === -1) break; // done or disconnected

    inTree.add(minIdx);
    edges.push({ from: parent[minIdx], to: minIdx, cost: minCost[minIdx] });

    for (let i = 0; i < n; i++) {
      if (!inTree.has(i)) {
        const c = costFn(minIdx, i);
        if (c < minCost[i]) {
          minCost[i] = c;
          parent[i] = minIdx;
        }
      }
    }
  }

  return edges;
}
