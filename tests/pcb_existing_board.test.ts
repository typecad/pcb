import { describe, it, expect } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { parse, s, sym, nameOf } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import { normalizeNetName } from '../src/pcb/pcb_utils.js';
import {
  insertNetsIntoBoardContents,
  parseExistingBoard,
  processExistingFootprints,
} from '../src/pcb/pcb_existing_board.js';

describe('pcb_existing_board', () => {
  describe('insertNetsIntoBoardContents', () => {
    it('should return boardContents unchanged when nets is empty', () => {
      const contents: SExpr[] = [sym('version'), sym('setup')];
      const result = insertNetsIntoBoardContents(contents, []);
      expect(result).toEqual(contents);
    });

    it('should insert nets and remove existing net definitions', () => {
      const existingNet: SExpr[] = [sym('net'), 1, 'VCC'];
      const newNet: SExpr[] = [sym('net'), 2, 'GND'];
      const contents: SExpr[] = [sym('version'), existingNet, sym('setup')];
      const result = insertNetsIntoBoardContents(contents, [newNet]);
      expect(
        result.some((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'net' && item[2] === 'GND'),
      ).toBe(true);
      expect(
        result.some((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'net' && item[2] === 'VCC'),
      ).toBe(false);
    });

    it('should insert nets after setup/layers/paper/general markers', () => {
      const net1: SExpr[] = [sym('net'), 0, ''];
      const net2: SExpr[] = [sym('net'), 1, 'VCC'];
      const contents: SExpr[] = [s('version'), s('general'), s('setup')];
      const result = insertNetsIntoBoardContents(contents, [net1, net2]);
      const setupIdx = result.findIndex((item) => {
        if (Array.isArray(item) && item.length > 0) return nameOf(item[0]) === 'setup';
        return false;
      });
      expect(setupIdx).toBeGreaterThanOrEqual(0);
      const net0Idx = result.findIndex((item) => {
        if (Array.isArray(item) && item.length > 1) return nameOf(item[0]) === 'net' && item[1] === 0;
        return false;
      });
      expect(net0Idx).toBeGreaterThan(setupIdx);
    });
  });
});

describe('normalizeNetName in existing board context', () => {
  it('should strip leading / for board net lookup', () => {
    expect(normalizeNetName('/VCC')).toBe('vcc');
    expect(normalizeNetName('GND')).toBe('gnd');
  });

  it('should return lowercase', () => {
    expect(normalizeNetName('MyNet')).toBe('mynet');
  });
});

describe('parseExistingBoard', () => {
  it('should build empty board contents when no existing elements', () => {
    const pcb = {
      _state: { existingBoardElements: [] },
      boardName: 'test',
      options: {},
    };
    const headerItems: SExpr[] = [s('version', 20231001), s('general', s('thickness', 1.6))];
    const result = parseExistingBoard(pcb as any, headerItems, new Map());
    expect(result.boardContents.length).toBe(2);
    expect(result.boardNetNameToCodeMap.size).toBe(0);
  });

  it('should parse existing board elements and extract nets', () => {
    const existingElements: SExpr[] = [
      sym('kicad_pcb'),
      [sym('net'), 0, ''],
      [sym('net'), 1, 'VCC'],
      [sym('net'), 2, 'GND'],
      [sym('footprint'), sym('Resistor_SMD:R_0402'), [sym('at'), 10, 20, 0], [sym('layer'), 'F.Cu']],
    ];
    const pcb = {
      _state: { existingBoardElements: existingElements },
      boardName: 'test',
      options: {},
    };
    const headerItems: SExpr[] = [s('version', 20231001), s('general', s('thickness', 1.6))];
    const result = parseExistingBoard(pcb as any, headerItems, new Map());
    expect(result.boardContents.length).toBeGreaterThan(0);
    expect(result.boardNetNameToCodeMap.get('vcc')).toBe(1);
    expect(result.boardNetNameToCodeMap.get('gnd')).toBe(2);
  });
});

describe('processExistingFootprints', () => {
  it('should do nothing when existingBoardElements is empty', () => {
    const boardContents: SExpr[] = [];
    processExistingFootprints([], {} as any, new Map(), new Map(), boardContents);
    expect(boardContents.length).toBe(0);
  });

  it('should update footprint position from existing board for matched UUID', () => {
    const uuid = 'comp-uuid-1';
    const component = {
      reference: 'R1',
      value: '10k',
      footprint: 'Resistor_SMD:R_0402',
      uuid: uuid,
      pcb: { x: 0, y: 0, rotation: 0 },
      sourceInfo: {},
      footprint_lib: () => '(footprint Resistor_SMD:R_0402 (at 0 0 0) (layer F.Cu) (uuid comp-uuid-1))',
      text: [],
    };
    const componentMap = new Map<string, any>([[uuid, component]]);

    const existingElements: SExpr[] = [
      [
        sym('footprint'),
        sym('Resistor_SMD:R_0402'),
        [sym('at'), 15, 25, 90],
        [sym('layer'), 'F.Cu'],
        [sym('uuid'), uuid],
      ],
    ];

    const boardContents: SExpr[] = [];
    processExistingFootprints(
      existingElements,
      {
        _state: {},
        resolveNet: () => ({ found: false, netCode: 0, netName: '' }),
        options: { remove_orphans: true },
      } as any,
      componentMap,
      new Map(),
      boardContents,
    );

    expect(component.pcb.x).toBe(15);
    expect(component.pcb.y).toBe(25);
    expect(component.pcb.rotation).toBe(90);
    expect(boardContents.length).toBe(1);
    expect(componentMap.has(uuid)).toBe(false);
  });

  it('should keep orphan footprints when remove_orphans is false', () => {
    const existingElements: SExpr[] = [
      [sym('footprint'), sym('Resistor_SMD:R_0402'), [sym('at'), 0, 0, 0], [sym('uuid'), 'orphan-uuid']],
    ];
    const boardContents: SExpr[] = [];
    processExistingFootprints(
      existingElements,
      {
        _state: {},
        resolveNet: () => ({ found: false, netCode: 0, netName: '' }),
        options: { remove_orphans: false },
      } as any,
      new Map(),
      new Map(),
      boardContents,
    );
    expect(boardContents.length).toBe(1);
  });

  it('should remove orphan footprints when remove_orphans is true', () => {
    const existingElements: SExpr[] = [
      [sym('footprint'), sym('Resistor_SMD:R_0402'), [sym('at'), 0, 0, 0], [sym('uuid'), 'orphan-uuid']],
    ];
    const boardContents: SExpr[] = [];
    processExistingFootprints(
      existingElements,
      {
        _state: {},
        resolveNet: () => ({ found: false, netCode: 0, netName: '' }),
        options: { remove_orphans: true },
      } as any,
      new Map(),
      new Map(),
      boardContents,
    );
    expect(boardContents.length).toBe(0);
  });
});
