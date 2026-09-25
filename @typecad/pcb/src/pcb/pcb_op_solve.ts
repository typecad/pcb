// ---------------------------------------------------------------------------
// Operating-point solve for the viewer's trace hover: when the entry runs with
// TYPECAD_SIMULATE=op (the `typecad-pcb simulate` command re-runs the project
// entry with it set), create() additionally solves the board with ngspice and
// writes `build/<board>_op.json` — per-net DC voltage plus the current and
// power of every probed device. The viewer pipeline picks the file up like a
// DRC report and shows it when the mouse hovers a trace.
//
// Transient analysis is deliberately out of scope for now; the JSON leaves
// room for a richer solve later (same file, more fields).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logging.js';
import { getBuildDir } from '../utils/constants.js';
import type { PCB } from './pcb.js';

export interface OpSolveSummary {
  solved: boolean;
  /** error text when the solve did not run (no ngspice, no convergence) */
  error?: string;
  /** ngspice node voltages by net name, volts */
  nets?: Record<string, number>;
  /** probed device operating points by reference */
  devices?: Record<string, { current?: number; power?: number }>;
  /** signed conventional-current injection at each component pad, by net —
   * drives the viewer's current-flow animation */
  branches?: Record<string, Array<{ ref: string; pin: string; i: number }>>;
}

/** Run the OP solve and write the summary; resolves false when skipped. */
export function maybeWriteOpSolve(pcb: PCB): boolean {
  if (process.env.TYPECAD_SIMULATE !== 'op') return false;

  const out: OpSolveSummary = { solved: false };
  try {
    const result = pcb.simulate().op();
    if (!result) {
      out.error = 'ngspice not found';
    } else {
      out.solved = true;
      out.nets = {};
      out.devices = {};
      for (const variable of result.variables) {
        const net = /^v\((.+)\)$/.exec(variable.name);
        // device current: i(ref) only — terminal currents (i(q1:c)) are the
        // flow-graph branches and must not register as a device's current
        const dev = /^i\(([^:()]+)\)$/.exec(variable.name);
        // ngspice names probed power "r1:power" in its raw output (the
        // .probe card says p(R1)) — match both spellings
        const pwr = /^(?:p\((.+)\)|(.+):power)$/.exec(variable.name);
        const value = result.values[variable.name]?.[0];
        if (!Number.isFinite(value)) continue;
        if (net) out.nets![net[1]!] = round(value, 6);
        else if (dev) (out.devices![dev[1]!] ??= {}).current = round(value, 9);
        else if (pwr) (out.devices![(pwr[1] ?? pwr[2])!] ??= {}).power = round(value, 9);
      }
      // ground is ngspice's node 0 and never appears in the v() list —
      // pin it so hovering a GND trace reads 0V instead of nothing
      if (out.nets!['gnd'] === undefined) out.nets!['gnd'] = 0;
      if (result.branches && Object.keys(result.branches).length > 0) out.branches = result.branches;
    }
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
  }

  const outPath = path.join(getBuildDir(), `${pcb.boardName}_op.json`);
  try {
    fs.mkdirSync(getBuildDir(), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    if (out.solved) {
      logger.info(`⚡ OP solve written: ${outPath} (${Object.keys(out.nets ?? {}).length} nets)`);
    } else {
      logger.warn(`⚡ OP solve did not run (${out.error ?? 'unknown'}) — wrote ${outPath}`);
    }
  } catch (error) {
    logger.warn(`[OpSolve] could not write ${outPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
}

function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}
