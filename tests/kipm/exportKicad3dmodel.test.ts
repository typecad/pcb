import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { getVertices, generateWrlModel, Exporter3dModelKicad } from '../../src/kipm/kicad/exportKicad3dmodel.js';
import { Ki3dModel } from '../../src/kipm/kicad/parametersKicadFootprint.js';

describe('getVertices', () => {
  it('should parse and round vertices from OBJ data', () => {
    const obj = 'v 1.0 2.0 3.0\nv 4.0 5.0 6.0\n';
    const result = getVertices(obj);
    expect(result).toHaveLength(2);
  });

  it('should return empty array for no vertices', () => {
    expect(getVertices('')).toEqual([]);
  });

  it('should handle negative zero', () => {
    const obj = 'v 0.0 0.0 0.0\n';
    const result = getVertices(obj);
    expect(result[0]).toContain('0');
  });
});

describe('generateWrlModel', () => {
  it('should return Ki3dModel with null raw_wrl when no raw_obj', () => {
    const model = generateWrlModel({ name: 'test', raw_obj: null, step: null } as any);
    expect(model).toBeInstanceOf(Ki3dModel);
    expect(model.name).toBe('test');
    expect(model.raw_wrl).toBe('');
  });

  it('should generate VRML from OBJ data', () => {
    const model = generateWrlModel({
      name: 'test',
      raw_obj: '# Simple OBJ\nv 0 0 0\nv 1 0 0\nv 1 1 0\nusemtl Material\ng 1 2 3\n',
      step: null,
    } as any);
    expect(model).toBeInstanceOf(Ki3dModel);
    expect(model.raw_wrl).toBeTruthy();
    expect(model.raw_wrl).toContain('VRML V2.0');
  });
});

describe('Exporter3dModelKicad', () => {
  it('should create with null output for empty model', () => {
    const exp = new Exporter3dModelKicad({ name: 'empty', raw_obj: null, step: null } as any);
    expect(exp.getWrlContent()).toBeNull();
    expect(exp.getStepContent()).toBeNull();
    expect(exp.getAllContent().name).toBeNull();
  });

  it('should create with output for valid model', () => {
    const exp = new Exporter3dModelKicad({
      name: 'test',
      raw_obj: 'v 0 0 0\nv 1 0 0\nv 1 1 0\nusemtl Mat\ng 1 2 3\n',
      step: 'step data',
    } as any);
    expect(exp.getStepContent()).toBeInstanceOf(Buffer);
    expect(exp.getAllContent().name).toBe('test');
  });

  it('should handle OBJ with material definitions', () => {
    const obj = [
      'newmtl MyMat',
      'Ka 0.2 0.2 0.2',
      'Kd 0.8 0.8 0.8',
      'Ks 0.5 0.5 0.5',
      'endmtl',
      'v 0 0 0',
      'v 1 0 0',
      'v 1 1 0',
      'usemtl MyMat',
      'g 1 2 3',
    ].join('\n');
    const model = generateWrlModel({ name: 'mat_test', raw_obj: obj, step: null } as any);
    expect(model.raw_wrl).toContain('diffuseColor 0.8 0.8 0.8');
    expect(model.raw_wrl).toContain('specularColor 0.5 0.5 0.5');
  });

  it('should use default colors when material not found', () => {
    const exp = new Exporter3dModelKicad({
      name: 'default_color',
      raw_obj: 'v 0 0 0\nv 1 0 0\nv 1 1 0\nusemtl Unknown\ng 1 2 3\n',
      step: null,
    } as any);
    expect(exp.getWrlContent()).toContain('diffuseColor 0.8 0.8 0.8');
    expect(exp.getWrlContent()).toContain('specularColor 0.5 0.5 0.5');
  });

  it('getAllContent returns all content', () => {
    const exp = new Exporter3dModelKicad({
      name: 'all',
      raw_obj: 'v 0 0 0\nv 1 0 0\nv 1 1 0\nusemtl X\ng 1 2 3\n',
      step: 'step',
    } as any);
    const content = exp.getAllContent();
    expect(content.name).toBe('all');
    expect(content.wrl).toBeTruthy();
    expect(content.step).toBeInstanceOf(Buffer);
  });

  it('export writes wrl file when output exists', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const exp = new Exporter3dModelKicad({
      name: 'test',
      raw_obj: 'v 0 0 0\nv 1 0 0\nv 1 1 0\nusemtl Mat\ng 1 2 3\n',
      step: null,
    } as any);
    exp.export('/tmp/testlib');
    expect(writeSpy).toHaveBeenCalledWith('/tmp/testlib.3dshapes/test.wrl', expect.any(String), { encoding: 'utf-8' });
    writeSpy.mockRestore();
  });

  it('export does not write when output is null', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const exp = new Exporter3dModelKicad({ name: 'empty', raw_obj: null, step: null } as any);
    exp.export('/tmp/testlib');
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
