import { describe, it, expect } from 'vitest';
import {
  indexCommand,
  detailCommand,
  extractJson,
  parseComponentIndex,
  parseComponentDetail,
  QueryError,
} from '../query.js';

const componentJson = {
  reference: 'R1',
  value: '1kohm',
  footprint: 'Resistor_SMD:R_0402_1005Metric',
  variable: 'r1',
  source: 'src/power.ts:12',
  side: 'front',
  at: { x: 31.2, y: 18, rotation: 90 },
  dimensions: { width: 1, height: 0.5 },
  padCount: 2,
  unconnectedPads: ['2'],
  pads: [
    { pad: '1', net: 'VCC', type: 'smd', pinType: 'passive', at: { x: -0.4, y: 0 }, layers: ['F.Cu'] },
    { pad: '2', net: null, type: 'smd', pinType: 'passive', at: { x: 0.4, y: 0 }, layers: ['F.Cu'] },
  ],
};

describe('command building', () => {
  it('builds the index and detail commands', () => {
    expect(indexCommand()).toBe('npx typecad-pcb query components --json');
    expect(detailCommand('R1')).toBe('npx typecad-pcb query component R1 --json');
  });

  it('refuses to interpolate unsafe references into the command line', () => {
    expect(() => detailCommand('R1; rm -rf /')).toThrow(QueryError);
    expect(() => detailCommand('R 1')).toThrow(QueryError);
  });
});

describe('extractJson', () => {
  it('parses clean JSON output', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('extracts JSON from noisy npx output', () => {
    const noisy = 'npm notice\n[{"reference":"R1"}]\nnpm notice done';
    expect(extractJson(noisy)).toEqual([{ reference: 'R1' }]);
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('total nonsense')).toThrow(QueryError);
  });

  it('throws a QueryError (not a raw SyntaxError) when banner noise breaks the scan', () => {
    // a stray '}' after the document makes the slice invalid JSON — the
    // hover's board-missing hint logic must still see a classified error
    expect(() => extractJson('noise {bad json} trailing }')).toThrow(QueryError);
  });
});

describe('parseComponentIndex', () => {
  it('parses the components array', () => {
    const out = `[
      {"reference":"R1","value":"1kohm","footprint":"R_0402","variable":"r1","side":"front",
       "at":{"x":1,"y":2,"rotation":0},"dimensions":{"width":1,"height":0.5},"padCount":2},
      {"reference":"U1","value":"MCU","footprint":"QFN","side":"back","at":{"x":0,"y":0,"rotation":90},"padCount":32}
    ]`;
    const index = parseComponentIndex(out);
    expect(index).toHaveLength(2);
    expect(index[0].variable).toBe('r1');
    expect(index[0].dimensions).toEqual({ width: 1, height: 0.5 });
    expect(index[1].variable).toBeUndefined();
    expect(index[1].dimensions).toBeNull();
    expect(index[1].at.rotation).toBe(90);
  });

  it('throws when the CLI reports an error object instead of an array', () => {
    expect(() => parseComponentIndex('{"error":true,"message":"boom","code":"UNKNOWN_SUBJECT"}')).toThrow(/boom/);
  });
});

describe('parseComponentDetail', () => {
  it('parses pads, nets, unconnected pads, and source metadata', () => {
    const detail = parseComponentDetail(JSON.stringify(componentJson));
    expect(detail.reference).toBe('R1');
    expect(detail.source).toBe('src/power.ts:12');
    expect(detail.pads).toHaveLength(2);
    expect(detail.pads[0].net).toBe('VCC');
    expect(detail.pads[1].net).toBeNull();
    expect(detail.unconnectedPads).toEqual(['2']);
  });

  it('derives unconnected pads when the CLI omits the field', () => {
    const { unconnectedPads, ...withoutField } = componentJson;
    const detail = parseComponentDetail(JSON.stringify(withoutField));
    expect(detail.unconnectedPads).toEqual(['2']);
  });

  it('surfaces the CLI error message, flagging missing boards', () => {
    expect(() =>
      parseComponentDetail('{"error":true,"message":"Component \'R9\' not found.","code":"COMPONENT_NOT_FOUND"}'),
    ).toThrow(QueryError);
    try {
      parseComponentDetail('{"error":true,"message":"No .kicad_pcb found in ./build/"}');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as QueryError).boardMissing).toBe(true);
    }
  });
});
