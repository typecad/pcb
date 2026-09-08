import { Component } from '../../src/component.js';
import { Pin } from '../../src/pin.js';
import { Schematic } from '../../src/schematic.js';
import { PcbInternalState } from '../../src/pcb/pcb_state.js';
import type { IPcbOptions } from '../../src/pcb/pcb_interfaces.js';

export function makeComponent(
  overrides: {
    reference?: string;
    value?: string;
    footprint?: string;
    dnp?: boolean;
    pcb?: { x: number; y: number; rotation?: number; side?: 'front' | 'back' };
  } = {},
): Component {
  const fp = overrides.footprint ?? 'Resistor_SMD:R_0603_1608Metric';
  const init: Record<string, unknown> = {};
  if (overrides.reference) init.reference = overrides.reference;
  if (overrides.value) init.value = overrides.value;
  if (overrides.dnp !== undefined) init.dnp = overrides.dnp;
  if (overrides.pcb) init.pcb = overrides.pcb;
  init.footprint = fp;
  return new Component(init as any);
}

export function makePin(reference: string, number: number | string, type?: string): Pin {
  return new Pin(reference, number, type as any);
}

export function makeSchematic(name = 'test'): Schematic {
  return new Schematic(name);
}

export function makePcbState(overrides: Partial<IPcbOptions> = {}): PcbInternalState {
  const options: IPcbOptions = {
    remove_orphans: true,
    thickness: 1.6,
    copper_thickness: 35,
    schematic: new Schematic('test'),
    ...overrides,
  };
  return new PcbInternalState(options);
}
