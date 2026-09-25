import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseExcellon } from '../src/gerber_viewer/gerber/parse_excellon.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');

describe('parseExcellon', () => {
  const image = parseExcellon(fs.readFileSync(path.join(fixtures, 'drill.drl'), 'utf8'), {
    name: 'drill.drl',
  });

  it('reads units and tool definitions', () => {
    expect(image.units).toBe('mm');
    expect(image.tools.get(1)).toEqual({ code: 1, diameter: 0.6 });
    expect(image.tools.get(2)).toEqual({ code: 2, diameter: 1.0 });
  });

  it('collects point holes per tool', () => {
    expect(image.holes).toHaveLength(3);
    expect(image.holes[0]).toEqual({ tool: 1, at: { x: 10, y: 10 } });
    expect(image.holes[1]).toEqual({ tool: 1, at: { x: 20, y: 10 } });
    expect(image.holes[2]).toEqual({ tool: 2, at: { x: 30, y: 20 } });
  });

  it('captures routed slots from M15/G01/M16', () => {
    expect(image.slots).toEqual([{ tool: 1, from: { x: 5, y: 5 }, to: { x: 5, y: 8 } }]);
  });

  it('parses fixed-point coordinates without decimal points', () => {
    const source = ['M48', 'METRIC,LZ', 'T1C0.6', '%', 'G90', 'G05', 'T1', 'X1500Y-250', 'M30'].join('\n');
    const parsed = parseExcellon(source);
    // METRIC defaults to 3.3; LZ means leading zeros suppressed
    expect(parsed.holes[0]!.at).toEqual({ x: 1.5, y: -0.25 });
  });

  it('reads embedded X2 attributes', () => {
    const source = [
      'M48',
      ';#@! TF.FileFunction,Plated,1,2,PTH,Drill',
      'METRIC',
      'T1C0.6',
      '%',
      'T1',
      'X1.0Y1.0',
      'M30',
    ].join('\n');
    const parsed = parseExcellon(source);
    expect(parsed.attributes.fileFunction).toBe('Plated,1,2,PTH,Drill');
    expect(parsed.holes).toHaveLength(1);
  });
});
