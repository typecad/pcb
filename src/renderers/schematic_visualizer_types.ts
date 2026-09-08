import { Component } from '../component.js';
import { Pin } from '../pin.js';
import logger from '../utils/logging.js';
import type { SExprNode } from '../types/sexpr_types.js';

export function logError(message: string, ...args: unknown[]): void {
  logger.error(`[Schematic] ERROR: ${message}`, ...args);
}

export function logWarning(message: string, ...args: unknown[]): void {
  logger.warn(`[Schematic] Warning: ${message}`, ...args);
}

export type { SExprNode };

export interface SymbolDefinition {
  rawSexpr: SExprNode;
  serializedLibEntry: string;
}

export interface PinLocation {
  x: number;
  y: number;
  angle: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PinInfo {
  name: string;
  type: string;
}

export const GRID_UNIT_MM = 2.54;
export const PAGE_WIDTH_MM = 284.73;
export const PAGE_HEIGHT_MM = 165.86;

export { displayName } from '../utils/error_reporter.js';
