/**
 * PCBWorld smoke tier — runs with `npm test`. Routes the bundled PCBWorld
 * fixtures that the autorouter currently clears and requires each to stay a
 * clean pass (fully connected, zero error-level DRC). Scored with typecad's
 * native DRC so it needs no KiCad install; when kicad-cli is present the
 * same boards are also checked by KiCad, which is what PCBWorld reports.
 *
 * The full benchmark is `npm run bench:pcbworld` (see bench/pcbworld/README.md).
 */
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { readBoard } from './lib/board.js';
import { routeBoard } from './lib/route.js';
import { spliceCopper, stripCopper } from './lib/splice.js';
import { findKicadCli, scoreKicad, scoreNative, bareRatsnest } from './lib/score.js';
import { resolveSet, FIXTURES_DIR } from './lib/sets.js';
import { parse, prettyPrint, type SExpr } from '../../src/sexpr/index.js';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pcbworld-smoke-'));
const kicadCli = findKicadCli();

describe('PCBWorld bench plumbing', () => {
  it('reads pads, nets, outline and rules from a fixture', () => {
    const b = readBoard(path.join(FIXTURES_DIR, 'two_net_multiterm_board.kicad_pcb'));
    expect(b.footprints).toHaveLength(6);
    expect(b.outline?.outer).toEqual({ kind: 'rect', x: 0, y: 0, width: 50, height: 30 });
    expect(b.rules).toMatchObject({ clearance: 0.2, trackWidth: 0.2, viaDiameter: 0.6, viaDrill: 0.3, source: 'kicad_pro' });
    expect(bareRatsnest(b)).toBe(4); // two 3-pad nets
  });

  it('chains gr_line/gr_arc Edge.Cuts into an outer contour plus cutouts', () => {
    const b = readBoard(path.join(FIXTURES_DIR, 'donut_cutout_board.kicad_pcb'));
    expect(b.outline?.outer.kind).toBe('rect');
    expect(b.outline?.cutouts).toHaveLength(1);
  });

  it('keeps repeated pad numbers as they are (typecad routes every repeat)', () => {
    const b = readBoard(path.join(FIXTURES_DIR, 'crossover_board.kicad_pcb'));
    const numbers = b.footprints[0]!.pads.map((p) => p.number);
    expect(numbers.filter((n) => n === '2')).toHaveLength(2); // BNC shield
  });

  it('strips existing copper and splices nets back by the input numbering', () => {
    const b = readBoard(path.join(FIXTURES_DIR, 'two_net_multiterm_board.kicad_pcb'));
    const bare = prettyPrint(stripCopper(b));
    expect(bare).not.toMatch(/\((segment|via) /);
    const seg = parse('(segment (start 10 10) (end 40 10) (width 0.2) (layer "F.Cu") (net 7))') as SExpr[];
    const { text, dropped } = spliceCopper(b, [{ node: seg, net: 'NET2' }]);
    expect(dropped).toBe(0);
    expect(text).toMatch(/\(segment[^\n]*\(net 2\)/);
  });
});

describe('PCBWorld smoke set routes clean', () => {
  for (const file of resolveSet('smoke').files) {
    const id = path.basename(file, '.kicad_pcb');
    it(id, { timeout: 120_000 }, () => {
      const board = readBoard(file);
      const run = routeBoard(board, path.join(work, id));
      expect(run.importMismatches, 'bench staged the board faithfully').toEqual([]);
      const { text } = spliceCopper(board, run.copper);

      const native = scoreNative(board, text);
      expect({ routability: native.routability, drv: native.drvByType }).toEqual({ routability: 1, drv: {} });

      if (kicadCli) {
        const k = scoreKicad(board, text, kicadCli);
        expect({ routability: k.routability, drv: k.drvByType }, 'kicad-cli').toEqual({ routability: 1, drv: {} });
      }
    });
  }
});
