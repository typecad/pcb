import { describe, it, expect } from 'vitest';
import { s, sym, nameOf, serialize } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import { mergeNets } from '../src/pcb/pcb_net_merger.js';
import type { IVia } from '../src/pcb/pcb_interfaces.js';

function makeNetDef(code: number, name: string): SExpr[] {
  return [sym('net'), code, name];
}

describe('pcb_net_merger', () => {
  describe('mergeNets', () => {
    it('should return empty nets when no schematic and no board', () => {
      const result = mergeNets(undefined, undefined, [], new Map());
      expect(result.allNets.length).toBe(1);
      const emptyNet = result.allNets.find((n) => Array.isArray(n) && n[1] === 0);
      expect(emptyNet).toBeDefined();
    });

    it('should preserve existing board nets', () => {
      const existingNets: SExpr[] = [makeNetDef(0, ''), makeNetDef(1, 'VCC'), makeNetDef(2, 'GND')];
      const result = mergeNets(undefined, undefined, existingNets, new Map());
      expect(result.allNets.length).toBeGreaterThanOrEqual(3);
      const netNames = result.allNets
        .filter((n) => Array.isArray(n) && typeof n[2] === 'string')
        .map((n) => String(n[2]).replace(/[`"]/g, ''));
      expect(netNames).toContain('VCC');
      expect(netNames).toContain('GND');
    });

    it('should include empty net (code 0)', () => {
      const existingNets: SExpr[] = [makeNetDef(1, 'VCC')];
      const result = mergeNets(undefined, undefined, existingNets, new Map());
      const emptyNet = result.allNets.find((n) => Array.isArray(n) && n[1] === 0);
      expect(emptyNet).toBeDefined();
    });

    it('should merge schematic nets with board nets', () => {
      const existingNets: SExpr[] = [makeNetDef(0, ''), makeNetDef(1, 'VCC')];
      const mockSchematic = {
        nodes: [
          { code: 2, name: 'GND', nodes: [] },
          { code: 3, name: 'SDA', nodes: [] },
        ],
      } as any;
      const schematicNodes = [
        { code: 2, name: 'GND', nodes: [] },
        { code: 3, name: 'SDA', nodes: [] },
      ];
      const result = mergeNets(mockSchematic, schematicNodes, existingNets, new Map());
      expect(result.allNets.length).toBeGreaterThanOrEqual(4);
      expect(result.boardNetNameToCodeMap.get('gnd')).toBe(2);
      expect(result.boardNetNameToCodeMap.get('sda')).toBe(3);
    });

    it('should reuse existing board net code for same name', () => {
      const existingNets: SExpr[] = [makeNetDef(0, ''), makeNetDef(1, 'VCC')];
      const schematicNodes = [{ code: 5, name: 'VCC', nodes: [] }];
      const result = mergeNets({} as any, schematicNodes, existingNets, new Map());
      expect(result.boardNetNameToCodeMap.get('vcc')).toBe(1);
    });

    it('should handle via nets', () => {
      const viaMap = new Map<string, IVia>();
      viaMap.set('via-1', {
        at: { x: 10, y: 20 },
        size: 0.6,
        drill: 0.3,
        net: 'VCC',
      });
      const result = mergeNets(undefined, undefined, [], viaMap);
      expect(result.boardNetNameToCodeMap.get('vcc')).toBeDefined();
    });

    it('should sort nets by code', () => {
      const existingNets: SExpr[] = [makeNetDef(3, 'NET3'), makeNetDef(1, 'NET1'), makeNetDef(2, 'NET2')];
      const result = mergeNets(undefined, undefined, existingNets, new Map());
      const codes = result.allNets
        .filter((n) => Array.isArray(n) && typeof n[1] === 'number')
        .map((n) => n[1] as number);
      for (let i = 1; i < codes.length; i++) {
        expect(codes[i]).toBeGreaterThanOrEqual(codes[i - 1]);
      }
    });

    it('should handle conflicting net codes', () => {
      const existingNets: SExpr[] = [makeNetDef(1, 'VCC'), makeNetDef(2, 'GND')];
      const schematicNodes = [
        { code: 1, name: 'SDA', nodes: [] },
        { code: 2, name: 'SCL', nodes: [] },
      ];
      const result = mergeNets({} as any, schematicNodes, existingNets, new Map());
      expect(result.boardNetNameToCodeMap.get('sda')).toBeDefined();
      expect(result.boardNetNameToCodeMap.get('scl')).toBeDefined();
      expect(result.boardNetNameToCodeMap.get('sda')).not.toBe(result.boardNetNameToCodeMap.get('scl'));
    });
  });
});
