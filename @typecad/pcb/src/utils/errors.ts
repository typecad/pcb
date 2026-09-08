/**
 * Custom error hierarchy for typeCAD.
 * Provides structured error types for different failure modes.
 *
 * Adopted across the codebase: ComponentError (component.ts, buses.ts),
 * RoutingError (pcb.ts, pcb_autoroute.ts, pcb_routing_core.ts, pcb_routing_helpers.ts,
 *   pcb_track_builder.ts, length_matcher.ts),
 * BoardCreationError (pcb_board_creation.ts, pcb_footprint.ts),
 * KiCadNotFoundError (kicad.ts, kicad_commands.ts),
 * TypeCadError (schematic.ts, source_inspector.ts, pad_resolver.ts).
 */

export class TypeCadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TypeCadError';
    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = options.cause;
    }
  }
}

export class RoutingError extends TypeCadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RoutingError';
  }
}

export class ComponentError extends TypeCadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ComponentError';
  }
}

export class BoardCreationError extends TypeCadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BoardCreationError';
  }
}

export class KiCadNotFoundError extends TypeCadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KiCadNotFoundError';
  }
}

export class KiCadCommandError extends TypeCadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KiCadCommandError';
  }
}
