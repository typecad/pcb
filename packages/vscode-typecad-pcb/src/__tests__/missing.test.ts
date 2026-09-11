import { describe, it, expect } from 'vitest';
import { findDeclaration, renderMissingHint } from '../missing.js';

const source = `
import { PCB, Resistor, MountingHole } from '@typecad/pcb';

let typecad = new PCB('demo');
let mh1 = new MountingHole();
const r1 = new Resistor({ value: '1kohm' });
var c3 = new Capacitor({ value: '100nF' });
let value = 42;
`;

describe('findDeclaration', () => {
  it('finds a component declaration by variable name', () => {
    expect(findDeclaration(source, 'r1')).toEqual({ variable: 'r1', ctor: 'Resistor' });
    expect(findDeclaration(source, 'mh1')).toEqual({ variable: 'mh1', ctor: 'MountingHole' });
    expect(findDeclaration(source, 'c3')).toEqual({ variable: 'c3', ctor: 'Capacitor' });
  });

  it('never hints for PCB or Schematic containers', () => {
    expect(findDeclaration(source, 'typecad')).toBeNull();
  });

  it('ignores non-declaration words and plain values', () => {
    expect(findDeclaration(source, 'value')).toBeNull();
    expect(findDeclaration(source, 'Resistor')).toBeNull();
    expect(findDeclaration(source, '')).toBeNull();
  });

  it('hints anywhere the word occurs, since the board either has it or not', () => {
    const usage = `${source}\ntypecad.create(r1);`;
    expect(findDeclaration(usage, 'r1')?.ctor).toBe('Resistor');
  });
});

describe('renderMissingHint', () => {
  it('names the variable, the class, and both likely causes', () => {
    const hint = renderMissingHint({ variable: 'r1', ctor: 'Resistor' });
    expect(hint).toContain('`r1` (`Resistor`) is declared here but is not on the compiled board');
    expect(hint).toContain('npm run build');
    expect(hint).toContain('typecad.create');
  });
});
