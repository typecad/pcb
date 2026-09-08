export interface IGridCoordinate {
  x: number;
  y: number;
}

export interface IRoutingCell {
  occupied?: boolean;
  net?: string;
}

export interface IRoutingCellFull extends IRoutingCell {
  x: number;
  y: number;
  layer: string;
  isManualRoute?: boolean;
  absoluteBlock?: boolean;
  pad?: boolean;
  cost: number;
  clearance?: number;
  obstacleHalfWidthMm?: number;
  obstacleIds?: string[];
}

/**
 * Minimal routing grid contract shared between host and plugins.
 * Concrete grid implementations should satisfy this interface.
 */
export interface IRoutingGrid {
  worldToGrid(x: number, y: number): IGridCoordinate;
  gridToWorld(gridX: number, gridY: number): { x: number; y: number };
  getCell(x: number, y: number, layer: string): IRoutingCell | undefined;
  isInBounds(x: number, y: number): boolean;
  isOccupied(
    x: number,
    y: number,
    layer: string,
    clearance?: number,
    net?: string,
    considerObstacleClearance?: boolean,
    sumObstacleClearance?: boolean,
    blockers?: Set<string>,
  ): boolean;
  getResolution(): number;
  readonly gridResolution: number;
  readonly maxObstacleHalfWidthMm: number;
  getCellCost(x: number, y: number, layer: string): number;
  isPadCell(x: number, y: number, layer: string): boolean;
  isOccupiedById(x: number, y: number, layer: string, obstacleIds: Set<string> | string[]): boolean;
  addObstacle(obstacle: import('../shared/routing_grid.js').IRoutingObstacle): void;
  getCellsArray(): readonly (IRoutingCellFull | undefined)[];
  getDimensions(): { width: number; height: number; layers: number };
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number };
  getLayers(): string[];
  getVersion(): number;
}

export type RoutingGrid = IRoutingGrid;
