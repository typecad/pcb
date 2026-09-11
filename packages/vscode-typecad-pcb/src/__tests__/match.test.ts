import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { matchComponent } from '../match.js';
import { findHwFolder } from '../hwFolder.js';
import type { ComponentSummary } from '../types.js';

const index: ComponentSummary[] = [
  {
    reference: 'R1',
    value: '1kohm',
    footprint: 'R_0402',
    variable: 'r1',
    side: 'front',
    at: { x: 0, y: 0, rotation: 0 },
    dimensions: null,
    padCount: 2,
  },
  {
    reference: 'U1',
    value: 'MCU',
    footprint: 'QFN32',
    side: 'front',
    at: { x: 0, y: 0, rotation: 0 },
    dimensions: null,
    padCount: 32,
  },
];

describe('matchComponent', () => {
  it('prefers the exact source variable', () => {
    expect(matchComponent(index, 'r1')?.reference).toBe('R1');
  });

  it('matches references case-insensitively (hovering the ref works too)', () => {
    expect(matchComponent(index, 'U1')?.reference).toBe('U1');
    expect(matchComponent(index, 'u1')?.reference).toBe('U1');
  });

  it('matches references case-insensitively, even against a differently-cased variable', () => {
    expect(matchComponent(index, 'R1')?.reference).toBe('R1');
  });

  it('returns null for words that are not components', () => {
    expect(matchComponent(index, 'Resistor')).toBeNull();
    expect(matchComponent(index, 'typecad')).toBeNull();
    expect(matchComponent(index, '')).toBeNull();
  });
});

describe('findHwFolder', () => {
  it('picks the folder carrying typecad.conf.ts, not simply the first folder', () => {
    const folders = ['C:/proj/fw', 'C:/proj/hw'];
    const conf = path.join('C:/proj/hw', 'typecad.conf.ts');
    expect(findHwFolder(folders, (p) => p === conf)).toBe('C:/proj/hw');
  });

  it('returns null when no folder is a typeCAD project', () => {
    expect(findHwFolder(['C:/somewhere'], () => false)).toBeNull();
    expect(findHwFolder([], () => true)).toBeNull();
  });
});
