export interface IAutorouteWaypoint {
  x: number;
  y: number;
  layer?: string;
}

export interface IAutorouteVia {
  x: number;
  y: number;
  /**
   * The layer to route on after the via is inserted.
   */
  layer: string;
}

export interface IImpedanceConstraint {
  target: number;
  tolerance: number;
}
