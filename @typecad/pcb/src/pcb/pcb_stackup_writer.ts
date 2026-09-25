// ---------------------------------------------------------------------------
// Stackup summary for the board viewer.
//
// The viewer's thermal/electrical model needs the board's physical stackup —
// per-layer copper weight, dielectric thicknesses, layer count — which only
// the PCB object knows (the gerber set carries none of it). This writes the
// resolved geometry to `build/<board>_stackup.json` on every board write; the
// viewer pipeline auto-discovers it next to the netlist, exactly like the
// ngspice operating point (`<board>_op.json`).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logging.js';
import { getBuildDir } from '../utils/constants.js';
import type { PCB } from './pcb.js';

/** The stackup shape the viewer consumes (a `#stackup` JSON island). */
export interface StackupSummary {
  layerCount: number;
  copperLayers: string[];
  boardThicknessMm: number;
  /** Copper thickness per layer, top → bottom, in mm (matches `copperLayers`). */
  copperThicknessMm: number[];
  /** Dielectric `i` sits between copper `i` and copper `i+1`, top → bottom. */
  dielectrics: Array<{ name: string; type: 'prepreg' | 'core'; thicknessMm: number; material: string }>;
}

/** Serialize the PCB's resolved stackup beside the board file. Never throws. */
export function writeStackup(pcb: PCB): void {
  const geometry = pcb.stackupGeometry;
  const summary: StackupSummary = {
    layerCount: pcb.layerCount,
    copperLayers: [...pcb.copperLayers],
    boardThicknessMm: pcb.thickness,
    copperThicknessMm: geometry.copperThicknessMm,
    dielectrics: geometry.dielectrics.map((d) => ({
      name: d.name,
      type: d.type,
      thicknessMm: d.thicknessMm,
      material: d.material,
    })),
  };
  const outPath = path.join(getBuildDir(), `${pcb.boardName}_stackup.json`);
  try {
    fs.mkdirSync(getBuildDir(), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    logger.debug(`stackup written: ${outPath}`);
  } catch (error) {
    logger.warn(`could not write stackup ${outPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
