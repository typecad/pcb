import type { RoutingGrid } from '../contracts/routing_grid.js';
import type {
  IRoutePath as FullRoutePath,
  IGeneratedElement,
  ILengthMatchPatternConfig,
  ILengthMatchConfig,
} from '../../pcb/pcb_interfaces.js';
import type { PCB } from '../../pcb/pcb.js';

export type { ILengthMatchPatternConfig, ILengthMatchConfig };

export type IRoutePath = Pick<FullRoutePath, 'nodes' | 'length'>;

export interface ILengthMatchContext {
  pcb: PCB;
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
  getElements(): IGeneratedElement[];
};

export interface IStraightSegment {
  start: { x: number; y: number; layer: string };
  end: { x: number; y: number; layer: string };
  length: number;
  centerAlongPath: number; // distance along the overall path to the segment center (for middle prioritization)
}
