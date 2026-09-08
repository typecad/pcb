import { describe, it, expect } from 'vitest';
import { toRadian, vec3, mat4, quat } from '../../src/kipm/easyeda/transform.js';

describe('toRadian', () => {
  it('should convert 0 degrees to 0 radians', () => {
    expect(toRadian(0)).toBe(0);
  });
  it('should convert 180 degrees to PI radians', () => {
    expect(toRadian(180)).toBeCloseTo(Math.PI, 6);
  });
  it('should convert 90 degrees to PI/2 radians', () => {
    expect(toRadian(90)).toBeCloseTo(Math.PI / 2, 6);
  });
  it('should convert 360 degrees to 2*PI radians', () => {
    expect(toRadian(360)).toBeCloseTo(2 * Math.PI, 6);
  });
  it('should convert negative degrees', () => {
    expect(toRadian(-90)).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('vec3', () => {
  it('create should return zero vector', () => {
    expect(vec3.create()).toEqual([0, 0, 0]);
  });
  it('fromValues should create vector', () => {
    expect(vec3.fromValues(1, 2, 3)).toEqual([1, 2, 3]);
  });
});

describe('quat', () => {
  it('create should return identity quaternion', () => {
    expect(quat.create()).toEqual([0, 0, 0, 1]);
  });
});

describe('mat4', () => {
  it('create should return identity matrix', () => {
    const m = mat4.create();
    expect(m).toHaveLength(16);
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    expect(m[1]).toBe(0);
    expect(m[4]).toBe(0);
  });

  it('translate should modify matrix', () => {
    const out = mat4.create();
    const a = mat4.create();
    const result = mat4.translate(out, a, [10, 20, 30]);
    expect(result).toBe(out);
    expect(out[12]).toBe(10);
    expect(out[13]).toBe(20);
    expect(out[14]).toBe(30);
  });

  it('translate in-place should work', () => {
    const m = mat4.create();
    mat4.translate(m, m, [5, 10, 15]);
    expect(m[12]).toBe(5);
    expect(m[13]).toBe(10);
    expect(m[14]).toBe(15);
  });

  it('rotateX should rotate around X axis', () => {
    const out = mat4.create();
    const a = mat4.create();
    mat4.rotateX(out, a, Math.PI / 2);
    expect(out[5]).toBeCloseTo(0, 5);
    expect(out[6]).toBeCloseTo(1, 5);
    expect(out[9]).toBeCloseTo(-1, 5);
    expect(out[10]).toBeCloseTo(0, 5);
  });

  it('rotateY should rotate around Y axis', () => {
    const out = mat4.create();
    const a = mat4.create();
    mat4.rotateY(out, a, Math.PI);
    expect(out[0]).toBeCloseTo(-1, 5);
    expect(out[2]).toBeCloseTo(0, 5);
    expect(out[8]).toBeCloseTo(0, 5);
    expect(out[10]).toBeCloseTo(-1, 5);
  });

  it('rotateZ should rotate around Z axis', () => {
    const out = mat4.create();
    const a = mat4.create();
    mat4.rotateZ(out, a, Math.PI / 2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[4]).toBeCloseTo(-1, 5);
    expect(out[5]).toBeCloseTo(0, 5);
  });

  it('multiply should compute matrix product', () => {
    const a = mat4.create();
    const b = mat4.create();
    const out = mat4.create();
    mat4.translate(a, a, [1, 2, 3]);
    mat4.rotateZ(b, b, Math.PI / 2);
    mat4.multiply(out, a, b);
    expect(out).toHaveLength(16);
  });

  it('scale should scale matrix', () => {
    const a = mat4.create();
    const out = mat4.create();
    mat4.scale(out, a, [2, 3, 4]);
    expect(out[0]).toBe(2);
    expect(out[5]).toBe(3);
    expect(out[10]).toBe(4);
  });

  it('getTranslation should extract translation', () => {
    const a = mat4.create();
    mat4.translate(a, a, [7, 8, 9]);
    const out = [0, 0, 0];
    mat4.getTranslation(out, a);
    expect(out).toEqual([7, 8, 9]);
  });

  it('getScaling should extract scale factors', () => {
    const a = mat4.create();
    mat4.scale(a, a, [3, 4, 5]);
    const out = [0, 0, 0];
    mat4.getScaling(out, a);
    expect(out[0]).toBeCloseTo(3, 5);
    expect(out[1]).toBeCloseTo(4, 5);
    expect(out[2]).toBeCloseTo(5, 5);
  });

  it('getRotation should extract rotation quaternion', () => {
    const a = mat4.create();
    mat4.rotateZ(a, a, Math.PI / 4);
    const out = [0, 0, 0, 0];
    mat4.getRotation(out, a);
    expect(out[3]).toBeGreaterThan(0);
  });
});
