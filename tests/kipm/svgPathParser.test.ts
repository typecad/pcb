import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SvgPathMoveTo,
  SvgPathLineTo,
  SvgPathEllipticalArc,
  SvgPathClosePath,
  parseSvgPath,
} from '../../src/kipm/easyeda/svgPathParser.js';

vi.mock('../../src/utils/logging.js', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('SvgPathMoveTo', () => {
  it('should create with provided data', () => {
    const cmd = new SvgPathMoveTo({ start_x: '10', start_y: '20' });
    expect(cmd.start_x).toBe(10);
    expect(cmd.start_y).toBe(20);
  });

  it('should create with numeric data', () => {
    const cmd = new SvgPathMoveTo({ start_x: 10, start_y: 20 });
    expect(cmd.start_x).toBe(10);
    expect(cmd.start_y).toBe(20);
  });

  it('should handle empty data', () => {
    const cmd = new SvgPathMoveTo();
    expect(cmd.start_x).toBe(NaN);
    expect(cmd.start_y).toBe(NaN);
  });

  it('should have static fields', () => {
    expect(SvgPathMoveTo.fields).toEqual(['start_x', 'start_y']);
  });
});

describe('SvgPathLineTo', () => {
  it('should create with provided data', () => {
    const cmd = new SvgPathLineTo({ pos_x: 30, pos_y: 40 });
    expect(cmd.pos_x).toBe(30);
    expect(cmd.pos_y).toBe(40);
  });

  it('should have static fields', () => {
    expect(SvgPathLineTo.fields).toEqual(['pos_x', 'pos_y']);
  });
});

describe('SvgPathEllipticalArc', () => {
  it('should create with provided data', () => {
    const cmd = new SvgPathEllipticalArc({
      radius_x: 10,
      radius_y: 20,
      x_axis_rotation: 30,
      flag_large_arc: '1',
      flag_sweep: '0',
      end_x: 100,
      end_y: 200,
    });
    expect(cmd.radius_x).toBe(10);
    expect(cmd.radius_y).toBe(20);
    expect(cmd.x_axis_rotation).toBe(30);
    expect(cmd.flag_large_arc).toBe(true);
    expect(cmd.flag_sweep).toBe(false);
    expect(cmd.end_x).toBe(100);
    expect(cmd.end_y).toBe(200);
  });

  it('should parse flag_large_arc as boolean from string', () => {
    const cmd = new SvgPathEllipticalArc({ flag_large_arc: '1' });
    expect(cmd.flag_large_arc).toBe(true);
  });

  it('should parse flag_sweep as boolean from numeric', () => {
    const cmd = new SvgPathEllipticalArc({ flag_sweep: 1 });
    expect(cmd.flag_sweep).toBe(true);
  });

  it('should have static fields', () => {
    expect(SvgPathEllipticalArc.fields).toContain('radius_x');
    expect(SvgPathEllipticalArc.fields).toContain('end_y');
  });
});

describe('SvgPathClosePath', () => {
  it('should create without data', () => {
    const cmd = new SvgPathClosePath();
    expect(cmd).toBeDefined();
  });

  it('should have static fields', () => {
    expect(SvgPathClosePath.fields).toEqual([]);
  });
});

describe('parseSvgPath', () => {
  it('should parse MoveTo command', () => {
    const result = parseSvgPath('M 10 20');
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SvgPathMoveTo);
    const m = result[0] as SvgPathMoveTo;
    expect(m.start_x).toBe(10);
    expect(m.start_y).toBe(20);
  });

  it('should parse LineTo command', () => {
    const result = parseSvgPath('L 30 40');
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SvgPathLineTo);
    const l = result[0] as SvgPathLineTo;
    expect(l.pos_x).toBe(30);
    expect(l.pos_y).toBe(40);
  });

  it('should parse EllipticalArc command', () => {
    const result = parseSvgPath('A 5 10 45 1 0 50 100');
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SvgPathEllipticalArc);
    const a = result[0] as SvgPathEllipticalArc;
    expect(a.radius_x).toBe(5);
    expect(a.radius_y).toBe(10);
    expect(a.x_axis_rotation).toBe(45);
    expect(a.flag_large_arc).toBe(true);
    expect(a.flag_sweep).toBe(false);
    expect(a.end_x).toBe(50);
    expect(a.end_y).toBe(100);
  });

  it('should parse ClosePath command', () => {
    const result = parseSvgPath('Z');
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SvgPathClosePath);
  });

  it('should parse combined path commands', () => {
    const result = parseSvgPath('M 10 20 L 30 40 Z');
    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(SvgPathMoveTo);
    expect(result[1]).toBeInstanceOf(SvgPathLineTo);
    expect(result[2]).toBeInstanceOf(SvgPathClosePath);
  });

  it('should handle commas in path', () => {
    const result = parseSvgPath('M 10,20 L 30,40');
    expect(result).toHaveLength(2);
    const m = result[0] as SvgPathMoveTo;
    expect(m.start_x).toBe(10);
    expect(m.start_y).toBe(20);
  });

  it('should handle multiple coordinates per command', () => {
    const result = parseSvgPath('M 10 20 30 40');
    expect(result).toHaveLength(2);
    const m1 = result[0] as SvgPathMoveTo;
    expect(m1.start_x).toBe(10);
    expect(m1.start_y).toBe(20);
    const m2 = result[1] as SvgPathMoveTo;
    expect(m2.start_x).toBe(30);
    expect(m2.start_y).toBe(40);
  });

  it('should log warning for unsupported commands', async () => {
    const logger = (await import('../../src/utils/logging.js')).default;
    const warnSpy = vi.fn();
    logger.warn = warnSpy;

    const result = parseSvgPath('X 1 2');
    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not supported'));
  });

  it('should handle path without trailing space', () => {
    const result = parseSvgPath('M 10 20');
    expect(result).toHaveLength(1);
  });

  it('should ignore empty input', () => {
    const result = parseSvgPath('');
    expect(result).toHaveLength(0);
  });
});
