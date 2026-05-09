import type { RoutingGrid } from '../contracts/routing_grid.js';
import type { IRoutePath as FullRoutePath } from '../../pcb/pcb_interfaces.js';

export interface ILengthMatchPatternConfig {
  type: 'sawtooth';
  amplitude?: number; // optional amplitude in mm
  pitch?: number; // optional pitch in mm
}

export interface ILengthMatchConfig {
  tolerance: number; // maximum length difference in mm
  pattern?: ILengthMatchPatternConfig;
  minStraightSegment?: number; // minimum straight segment length for pattern placement
  maxIterations?: number; // maximum iterations for pattern fitting
  debug?: boolean; // enable debug logging
}

export type IRoutePath = Pick<FullRoutePath, 'nodes' | 'length'>;

export interface ILengthMatchContext {
  pcb: any; // PCB instance - using any to avoid circular dependency
  grid: RoutingGrid;
  traceWidth: number;
  clearance: number;
  net?: string;
  locked?: boolean;
}

// Use a more flexible type that matches the actual TrackBuilder implementation
export type ITrackBuilder = {
  from(point: { x: number; y: number }, layer?: string, width?: number): ITrackBuilder;
  to(point: { x: number; y: number; layer?: string; width?: number }): ITrackBuilder;
  getElements(): any[];
  // Additional properties that may exist on the actual TrackBuilder
  [key: string]: any;
};

export interface IStraightSegment {
  start: { x: number; y: number; layer: string };
  end: { x: number; y: number; layer: string };
  length: number;
  centerAlongPath: number; // distance along the overall path to the segment center (for middle prioritization)
}
