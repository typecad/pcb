import { describe, test, expect } from 'vitest';
import { getVertices } from '../src/kipm/kicad/exportKicad3dmodel.js';

function callGetVertices(objData: string) {
  return getVertices(objData);
}

describe('getVertices (no decimal.js)', () => {
  test('basic positive coordinates', () => {
    const objData = 'v 2.54 5.08 7.62\n';
    const result = callGetVertices(objData);
    expect(result).toHaveLength(1);
    const coords = result[0].split(/\s+/);
    coords.forEach((c) => {
      expect(+c).not.toBeNaN();
    });
  });

  test('negative coordinates', () => {
    const objData = 'v -2.54 -5.08 -7.62\n';
    const result = callGetVertices(objData);
    expect(result).toHaveLength(1);
    const coords = result[0].split(/\s+/);
    expect(+coords[0]).toBeCloseTo(-1, 4);
    expect(+coords[1]).toBeCloseTo(-2, 4);
    expect(+coords[2]).toBeCloseTo(-3, 4);
  });

  test('zero coordinate', () => {
    const objData = 'v 0 2.54 5.08\n';
    const result = callGetVertices(objData);
    expect(result).toHaveLength(1);
    const coords = result[0].split(/\s+/);
    expect(+coords[0]).toBe(0);
  });

  test('negative zero preserved as -0.0', () => {
    const objData = 'v -0 2.54 5.08\n';
    const result = callGetVertices(objData);
    expect(result).toHaveLength(1);
    expect(result[0].split(/\s+/)[0]).toBe('-0.0');
  });

  test('multiple vertices', () => {
    const objData = 'v 1 2 3\nv 4 5 6\nv 7 8 9\n';
    const result = callGetVertices(objData);
    expect(result).toHaveLength(3);
  });

  test('integer results get .0 suffix', () => {
    const objData = 'v 2.54 5.08 7.62\n';
    const result = callGetVertices(objData);
    const coords = result[0].split(/\s+/);
    expect(coords[0]).toBe('1.0');
    expect(coords[1]).toBe('2.0');
    expect(coords[2]).toBe('3.0');
  });

  test('non-integer results have decimal precision', () => {
    const objData = 'v 1.27 3.81 6.35\n';
    const result = callGetVertices(objData);
    const coords = result[0].split(/\s+/);
    expect(+coords[0]).toBeCloseTo(0.5, 4);
    expect(+coords[1]).toBeCloseTo(1.5, 4);
    expect(+coords[2]).toBeCloseTo(2.5, 4);
  });

  test('coordinates are divided by 2.54', () => {
    const objData = 'v 25.4 50.8 254\n';
    const result = callGetVertices(objData);
    const coords = result[0].split(/\s+/);
    expect(+coords[0]).toBeCloseTo(10, 4);
    expect(+coords[1]).toBeCloseTo(20, 4);
    expect(+coords[2]).toBeCloseTo(100, 4);
  });

  test('small negative value that rounds toward zero', () => {
    const objData = 'v -0.0001 2.54 5.08\n';
    const result = callGetVertices(objData);
    const coords = result[0].split(/\s+/);
    expect(+coords[0]).toBe(0);
  });
});
