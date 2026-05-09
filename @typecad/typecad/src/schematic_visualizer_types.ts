import { Component } from "./component.js";
import { Pin } from "./pin.js";
import logger from './logging.js';

// ── Logging helpers ──────────────────────────────────────────────────────────

export function logError(message: string, ...args: unknown[]): void {
    logger.error(`[Schematic] ERROR: ${message}`, ...args);
}

export function logWarning(message: string, ...args: unknown[]): void {
    logger.warn(`[Schematic] Warning: ${message}`, ...args);
}

// ── Shared types ─────────────────────────────────────────────────────────────

export type SExprNode = (string | SExprNode)[];

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

export type SchematicNode = { name: string; code: number; nodes: Pin[]; owner: Component | null };

// ── Shared constants ─────────────────────────────────────────────────────────

export const GRID_UNIT_MM = 2.54;
export const PAGE_WIDTH_MM = 284.73;
export const PAGE_HEIGHT_MM = 165.86;
