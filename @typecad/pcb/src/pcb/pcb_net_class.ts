/**
 * Net-class registry for a PCB.
 *
 * Stores user-defined net classes (per-net track/clearance/via dimensions) and
 * net→class assignments. The registry is consumed by the board-creation write
 * path (to populate `net_settings.classes` and `netclass_patterns` in the
 * `.kicad_pro`) and by the autorouter (to look up dimensions for a net).
 */

import type { ISchematicNetDefinition } from '../net_manager.js';
import { type INetClassOptions, resolveNetClassOptions } from './pcb_rules.js';
import type { IPcbRules } from './pcb_interfaces.js';

/**
 * Registry of net-class definitions and net→class assignments.
 *
 * Definitions are stored as resolved dimensions (floored at the board rules).
 * Assignments are keyed by net name. The autorouter resolves a net's class via
 * {@link netClassFor}; the build write path reads {@link definitions} and
 * {@link assignments}.
 */
export class NetClassRegistry {
  /** class name → resolved dimensions (insertion-ordered for priority). */
  private readonly _definitions = new Map<string, Required<INetClassOptions>>();
  /** net name → class name. */
  private readonly _assignments = new Map<string, string>();

  /**
   * Define a net class. Unspecified dimensions fall back to the board rules.
   * Re-defining an existing name replaces its dimensions.
   *
   * @param name - Class name (must not be `Default`, which is board-managed).
   * @param options - Partial dimensions.
   * @param rulesFloor - Resolved board rules used as the floor.
   */
  define(name: string, options: INetClassOptions, rulesFloor: Required<IPcbRules>): void {
    if (!name) throw new RangeError('net class name must be non-empty');
    if (name === 'Default') {
      throw new RangeError("'Default' is a reserved net class name (managed by board rules)");
    }
    this._definitions.set(name, resolveNetClassOptions(options, rulesFloor));
  }

  /**
   * Assign a net to a class. Accepts the {@link ISchematicNetDefinition}
   * returned by `pcb.net()` / `pcb.named().net()`, so it works for both named
   * and auto-named (`netN`) nets.
   *
   * @param netDef - The net definition object (carries the net name).
   * @param className - The class to assign the net to.
   */
  assign(netDef: ISchematicNetDefinition, className: string): void {
    if (!netDef?.name) throw new RangeError('net definition must have a name');
    if (!className) throw new RangeError('class name must be non-empty');
    this._assignments.set(netDef.name, className);
  }

  /** Look up the resolved dimensions for a net's class, if it has one. */
  netClassFor(netName: string): Required<INetClassOptions> | undefined {
    const className = this._assignments.get(netName);
    if (!className) return undefined;
    return this._definitions.get(className);
  }

  /** The class name assigned to a net, if any. */
  classNameFor(netName: string): string | undefined {
    return this._assignments.get(netName);
  }

  /** Whether a class with this name is defined. */
  has(name: string): boolean {
    return this._definitions.has(name);
  }

  /** Read-only view of the class definitions (insertion-ordered). */
  get definitions(): ReadonlyMap<string, Required<INetClassOptions>> {
    return this._definitions;
  }

  /** Net→class assignments as `{netName, className}` pairs. */
  get assignmentEntries(): ReadonlyArray<{ netName: string; className: string }> {
    return Array.from(this._assignments, ([netName, className]) => ({ netName, className }));
  }
}
