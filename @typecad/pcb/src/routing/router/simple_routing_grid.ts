import chalk from 'chalk';
import logger from '../../utils/logging.js';
import type { IRoutingObstacle } from '../shared/routing_grid.js';

export class SimpleRoutingGrid {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  private resolution: number;
  layers: string[];
  private gridWidth: number;
  private gridHeight: number;
  private occupied: Map<string, { obstacle?: IRoutingObstacle }>; // key: x:y:layer
  private debug: boolean;

  constructor(
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    gridResolution: number,
    layers: string[],
    debug: boolean = false,
  ) {
    this.bounds = bounds;
    this.resolution = gridResolution;
    this.layers = layers;
    this.debug = debug;
    this.gridWidth = Math.ceil((bounds.maxX - bounds.minX) / gridResolution);
    this.gridHeight = Math.ceil((bounds.maxY - bounds.minY) / gridResolution);
    this.occupied = new Map();
    if (this.debug) {
      logger.debug(
        chalk.blue(
          `[SimpleRoutingGrid] Created grid: ${this.gridWidth}x${this.gridHeight} cells across ${layers.length} layers`,
        ),
      );
    }
  }

  getResolution(): number {
    return this.resolution;
  }

  isInBounds(gridX: number, gridY: number): boolean {
    return gridX >= 0 && gridX < this.gridWidth && gridY >= 0 && gridY < this.gridHeight;
  }

  worldToGrid(x: number, y: number): { x: number; y: number } {
    const gx = Math.floor((x - this.bounds.minX) / this.resolution);
    const gy = Math.floor((y - this.bounds.minY) / this.resolution);
    return { x: Math.max(0, Math.min(this.gridWidth - 1, gx)), y: Math.max(0, Math.min(this.gridHeight - 1, gy)) };
  }

  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: this.bounds.minX + (gridX + 0.5) * this.resolution,
      y: this.bounds.minY + (gridY + 0.5) * this.resolution,
    };
  }

  addObstacle(obstacle: IRoutingObstacle): void {
    // Mark all cells within obstacle bounds on specified layers as occupied
    const min = this.worldToGrid(obstacle.bounds.minX, obstacle.bounds.minY);
    const max = this.worldToGrid(obstacle.bounds.maxX, obstacle.bounds.maxY);
    for (let gx = min.x; gx <= max.x; gx++) {
      for (let gy = min.y; gy <= max.y; gy++) {
        for (const layer of obstacle.layers) {
          const key = `${gx}:${gy}:${layer}`;
          this.occupied.set(key, { obstacle });
        }
      }
    }
  }

  isOccupied(
    gridX: number,
    gridY: number,
    layer: string,
    clearanceMm: number,
    net?: string | null,
    ignoreSameNet?: boolean,
    treatManualRoutesAsBlocks?: boolean,
  ): boolean {
    if (!this.isInBounds(gridX, gridY)) return true; // treat out-of-bounds as occupied
    const key = `${gridX}:${gridY}:${layer}`;
    if (this.occupied.has(key)) return true;

    // Simple clearance-based check: if any obstacle on this layer is within clearance distance
    const world = this.gridToWorld(gridX, gridY);
    for (const entry of this.occupied.values()) {
      const obs = entry.obstacle!;
      if (obs.layers.indexOf(layer) === -1) continue;
      const dx = Math.max(0, Math.max(obs.bounds.minX - world.x, world.x - obs.bounds.maxX));
      const dy = Math.max(0, Math.max(obs.bounds.minY - world.y, world.y - obs.bounds.maxY));
      const dist = Math.hypot(dx, dy);
      if (dist <= clearanceMm + (obs.clearance || 0)) return true;
    }

    return false;
  }

  // Optional helpers used by GridSearch
  getCell(gridX: number, gridY: number, layer: string) {
    const key = `${gridX}:${gridY}:${layer}`;
    const entry = this.occupied.get(key);
    if (!entry) return undefined;
    return { x: gridX, y: gridY, layer, occupied: true, cost: 1.0 };
  }

  // Return a numeric cost for the given cell. Higher numbers mean less desirable.
  // GridSearch expects this to exist on the RoutingGrid interface; provide a
  // reasonable default: occupied cells -> very large cost, free cells -> 1.0
  getCellCost(gridX: number, gridY: number, layer: string): number {
    if (!this.isInBounds(gridX, gridY)) return Number.POSITIVE_INFINITY;
    const key = `${gridX}:${gridY}:${layer}`;
    if (this.occupied.has(key)) return 1e9;
    return 1.0;
  }

  // Return true if the specified cell is part of a pad geometry
  isPadCell(gridX: number, gridY: number, layer: string): boolean {
    const key = `${gridX}:${gridY}:${layer}`;
    const entry = this.occupied.get(key);
    if (!entry || !entry.obstacle) return false;
    return entry.obstacle.type === 'pad';
  }
}

// Export under the expected name so worker can import it as RoutingGrid
export const RoutingGrid = SimpleRoutingGrid;
