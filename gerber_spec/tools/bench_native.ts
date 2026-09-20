// Native exporter benchmark. Modes:
//   once — single cold pass with per-stage timings
//   warm — N iterations of the full fabrication export, median total
import fs from 'node:fs';
import path from 'node:path';
import {
  plotCopperLayers,
  plotGraphicsLayersFromSource,
  plotDrillFromSource,
  plotJobFromSource,
} from '../../@typecad/pcb/src/gerber_export/index.js';
import { GRAPHIC_LAYERS } from '../../@typecad/pcb/src/gerber_export/layers.js';
import { parse } from '../../@typecad/pcb/src/sexpr/index.js';

const board = process.argv[2]!;
const mode = process.argv[3] ?? 'once';
const outDir = path.join(path.dirname(board), 'bench_out');

function fullExport(): number {
  const t0 = performance.now();
  const source = fs.readFileSync(board, 'utf8');
  const tRead = performance.now();
  const written = [
    ...plotCopperLayers(board, { outDir }),
    ...plotGraphicsLayersFromSource(source, board, { outDir }),
  ];
  const tPlot = performance.now();
  const copper = written.filter((f) => /\.(gtl|gbl|g\d)$/.test(path.basename(f))).length;
  plotDrillFromSource(source, board, { outDir, copperLayerCount: copper });
  const tDrill = performance.now();
  const fileFor = (stem: string): { fileFunction: string; filePolarity?: string } | null => {
    if (/^(F|B)_Cu$/.test(stem))
      return {
        fileFunction: stem === 'F_Cu' ? 'Copper,L1,Top' : `Copper,L${copper},Bot`,
        filePolarity: 'Positive',
      };
    const inner = /^In(\d+)_Cu$/.exec(stem);
    if (inner) return { fileFunction: `Copper,L${Number(inner[1]) + 1},Inr`, filePolarity: 'Positive' };
    const spec = GRAPHIC_LAYERS.find((l) => l.stem === stem);
    return spec ? { fileFunction: spec.fileFunction, filePolarity: spec.polarity } : null;
  };
  plotJobFromSource(source, board, fileFor, { outDir });
  const tJob = performance.now();
  if (mode === 'once') {
    console.error(
      `read ${((tRead - t0) / 1000).toFixed(3)}s | plot ${((tPlot - tRead) / 1000).toFixed(3)}s | drill ${((tDrill - tPlot) / 1000).toFixed(3)}s | job ${((tJob - tDrill) / 1000).toFixed(3)}s`,
    );
  }
  void parse;
  return tJob - t0;
}

if (mode === 'once') {
  const ms = fullExport();
  console.log(ms / 1000);
} else {
  const N = Number(process.argv[4] ?? 7);
  const runs: number[] = [];
  fullExport(); // warm caches (font decode)
  for (let i = 0; i < N; i++) runs.push(fullExport());
  runs.sort((a, b) => a - b);
  console.log(runs[Math.floor(N / 2)] / 1000);
}
