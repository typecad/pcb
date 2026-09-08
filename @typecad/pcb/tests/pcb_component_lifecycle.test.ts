import { describe, it, expect } from 'vitest';
import {
  placeComponent,
  stageComponent,
  unstageComponent,
  groupComponents,
} from '../src/pcb/pcb_component_lifecycle.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';
import { Component } from '../src/component.js';
import { TrackBuilder } from '../src/pcb/pcb_track_builder.js';

function makeState(): PcbInternalState {
  return new PcbInternalState({ schematic: new Schematic('test') });
}

function makeComponent(ref: string, dnp = false): Component {
  const c = new Component({
    reference: ref,
    footprint: 'Resistor_SMD:R_0603_1608Metric',
    dnp,
  });
  return c;
}

describe('placeComponent', () => {
  it('should add component to state.components', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    placeComponent(state, comp);
    expect(state.components).toContain(comp);
  });

  it('should skip DNP components', () => {
    const state = makeState();
    const comp = makeComponent('R1', true);
    placeComponent(state, comp);
    expect(state.components).toHaveLength(0);
  });

  it('should unstage component before placing', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    stageComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(1);
    placeComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(0);
    expect(state.components).toContain(comp);
  });
});

describe('stageComponent', () => {
  it('should add component to stagedComponents', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    stageComponent(state, comp);
    expect(state.stagedComponents).toContain(comp);
  });

  it('should skip undefined component', () => {
    const state = makeState();
    stageComponent(state, undefined);
    expect(state.stagedComponents).toHaveLength(0);
  });

  it('should skip DNP components', () => {
    const state = makeState();
    const comp = makeComponent('R1', true);
    stageComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(0);
  });

  it('should deduplicate by UUID', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    stageComponent(state, comp);
    stageComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(1);
  });
});

describe('unstageComponent', () => {
  it('should remove component from stagedComponents', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    stageComponent(state, comp);
    unstageComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(0);
  });

  it('should do nothing for undefined component', () => {
    const state = makeState();
    expect(() => unstageComponent(state, undefined)).not.toThrow();
  });

  it('should do nothing for component not in stagedComponents', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    unstageComponent(state, comp);
    expect(state.stagedComponents).toHaveLength(0);
  });
});

describe('groupComponents', () => {
  it('should create a group string with component UUIDs', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    const placed: Component[] = [];
    groupComponents(state, (...comps) => placed.push(...comps), 'Power', comp);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toContain('"Power"');
    expect(state.groups[0]).toContain(comp.uuid);
  });

  it('should add group name to component.groups array', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    groupComponents(state, () => {}, 'Power', comp);
    expect(comp.groups).toContain('Power');
  });

  it('should not duplicate group name on component', () => {
    const state = makeState();
    const comp = makeComponent('R1');
    groupComponents(state, () => {}, 'Power', comp);
    groupComponents(state, () => {}, 'Power', comp);
    expect(comp.groups.filter((g) => g === 'Power')).toHaveLength(1);
  });

  it('should replace existing group with same name', () => {
    const state = makeState();
    const comp1 = makeComponent('R1');
    const comp2 = makeComponent('R2');
    groupComponents(state, () => {}, 'Power', comp1);
    groupComponents(state, () => {}, 'Power', comp2);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toContain(comp2.uuid);
  });

  it('should skip DNP components in UUID list', () => {
    const state = makeState();
    const comp = makeComponent('R1', true);
    groupComponents(state, () => {}, 'Power', comp);
    const groupStr = state.groups[0];
    expect(groupStr).not.toContain(comp.uuid);
  });
});
