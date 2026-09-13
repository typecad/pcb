import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderNets } from '../src/renderers/sexp_renderers.js';
import { NetManager } from '../src/net_manager.js';
import { buildBoardModel } from '../src/cli/typecad/board_model.js';
import type { ISchematicNode } from '../src/types/schematic_types.js';

const node = (over: Partial<ISchematicNode> = {}): ISchematicNode => ({
  name: 'net1',
  code: 1,
  nodes: [],
  owner: null,
  ...over,
});

describe('netlist net source properties', () => {
  it('renders Code/Route properties on nets that carry them', () => {
    const out = renderNets([
      node({ name: 'net2', code: 2, source: 'src/board.ts:82', routeSource: 'src/board.ts:83' }),
      node({ name: 'GND', code: 3 }),
    ]);
    expect(out).toContain('(property "Code" "src/board.ts:82")');
    expect(out).toContain('(property "Route" "src/board.ts:83")');
    // nets without provenance render exactly as before
    const gnd = out.split('(name "GND")')[1]!.split(')')[0]!;
    expect(gnd).not.toContain('property');
  });

  it('captures the declaring call when nets are added', () => {
    // the capture walks past net_manager/schematic frames to the caller —
    // in a test that caller is this file
    const mgr = new NetManager();
    mgr.addNet([]);
    expect(mgr.nodes[0]!.source).toMatch(/net_sources\.test\.ts:\d+$/);
  });

  it('records the route declaration on the named net', () => {
    const mgr = new NetManager();
    const def = mgr.addNet([]);
    mgr.setRouteSource(def.name, 'src/board.ts:83');
    expect(mgr.nodes[0]!.routeSource).toBe('src/board.ts:83');
    // unknown nets are a no-op, not an error (merged/renamed nets)
    expect(() => mgr.setRouteSource('nope', 'x.ts:1')).not.toThrow();
  });
});

describe('board model net sources', () => {
  it('attaches net sources from the netlist beside the board', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsrc-'));
    const board = path.join(dir, 'demo.kicad_pcb');
    // a segment on net 1 materializes the net in the model (bare
    // declarations without geometry produce no BoardNet entry)
    fs.writeFileSync(
      board,
      '(kicad_pcb (net 1 "net2") (segment (start 0 0) (end 1 1) (width 0.2) (layer "F.Cu") (net 1 "net2")))',
    );
    fs.writeFileSync(
      path.join(dir, 'demo.net'),
      '(export (version "E") (nets\n' +
        '  (net (code "1") (name "net2")\n' +
        '    (property "Code" "src/board.ts:82")\n' +
        '    (property "Route" "src/board.ts:83")\n' +
        '    (node (ref "R1") (pin "2") (pintype "passive")))\n' +
        '  (net (code "2") (name "GND")\n' +
        '    (node (ref "R1") (pin "1") (pintype "passive")))))\n',
    );
    const model = buildBoardModel(board);
    const net2 = model.nets.find((n) => n.name === 'net2');
    expect(net2?.source).toBe('src/board.ts:82');
    expect(net2?.routeSource).toBe('src/board.ts:83');
    const gnd = model.nets.find((n) => n.name === 'GND');
    expect(gnd?.source).toBeUndefined();
  });

  it('a missing netlist leaves sources unset (optional metadata)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsrc-'));
    const board = path.join(dir, 'demo.kicad_pcb');
    fs.writeFileSync(
      board,
      '(kicad_pcb (net 1 "net2") (segment (start 0 0) (end 1 1) (width 0.2) (layer "F.Cu") (net 1 "net2")))',
    );
    const model = buildBoardModel(board);
    expect(model.nets.find((n) => n.name === 'net2')?.source).toBeUndefined();
  });
});
