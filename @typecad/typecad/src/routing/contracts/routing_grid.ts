export interface IGridCoordinate {
  x: number;
  y: number;
}

export interface IRoutingCell {
  occupied?: boolean;
  net?: string;
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
    sumObstacleClearance?: boolean
  ): boolean;
  getResolution(): number;
  getCellCost(x: number, y: number, layer: string): number;
  isPadCell(x: number, y: number, layer: string): boolean;
  isOccupiedById(
    x: number,
    y: number,
    layer: string,
    obstacleIds: Set<string> | string[]
  ): boolean;
}

export type RoutingGrid = IRoutingGrid;
