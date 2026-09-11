import { describe, it, expect } from 'vitest';
import { renderComponentHover } from '../hover.js';
import type { ComponentDetail } from '../types.js';

const fullyConnected: ComponentDetail = {
  reference: 'R1',
  value: '1kohm',
  footprint: 'Resistor_SMD:R_0402_1005Metric',
  variable: 'r1',
  source: 'src/power.ts:12',
  side: 'front',
  at: { x: 31.2, y: 18, rotation: 90 },
  dimensions: { width: 1, height: 0.5 },
  padCount: 2,
  unconnectedPads: [],
  pads: [
    { pad: '1', net: 'VCC', type: 'smd', pinType: 'passive', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
    { pad: '2', net: 'GND', type: 'smd', pinType: 'passive', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
  ],
};

const partlyUnconnected: ComponentDetail = {
  ...fullyConnected,
  reference: 'U1',
  value: '',
  variable: undefined,
  source: undefined,
  unconnectedPads: ['3', '4'],
  pads: [
    { pad: '1', net: 'SDA', type: 'smd', pinType: 'bidirectional', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
    { pad: '2', net: 'SCL', type: 'smd', pinType: 'bidirectional', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
    { pad: '3', net: null, type: 'smd', pinType: 'input', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
    { pad: '4', net: null, type: 'smd', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
  ],
};

describe('renderComponentHover', () => {
  it('renders a title, footprint, and placement', () => {
    const md = renderComponentHover(fullyConnected);
    expect(md).toContain('**R1 — 1kohm**');
    expect(md).toContain('`Resistor_SMD:R_0402_1005Metric`');
    expect(md).toContain('(31.2, 18)');
    expect(md).toContain('rot 90°');
    expect(md).toContain('front');
  });

  it('marks connected and unconnected pads distinctly', () => {
    const md = renderComponentHover(fullyConnected);
    expect(md).toContain('`VCC`');
    expect(md).toContain('$(check) connected');
    expect(md).not.toContain('unconnected');

    const u = renderComponentHover(partlyUnconnected);
    expect(u).toContain('$(warning) unconnected');
    expect(u).toContain('2 of 4 pads connected — 2 unconnected');
  });

  it('treats net-less np_thru_hole pads as mechanical, not unconnected', () => {
    const md = renderComponentHover({
      ...fullyConnected,
      reference: 'MH1',
      pads: [
        ...fullyConnected.pads,
        { pad: '1', net: null, type: 'np_thru_hole', at: { x: 0, y: 0 }, layers: ['*.Cu'] },
      ],
    });
    expect(md).toContain('$(circle-slash) mechanical');
    expect(md).toContain('all 2 pads connected');
  });

  it('renders the all-connected summary without warnings', () => {
    const md = renderComponentHover(fullyConnected);
    expect(md).toContain('$(check) all 2 pads connected');
  });

  it('shows the source location and variable when present, neither when absent', () => {
    expect(renderComponentHover(fullyConnected)).toContain('_`src/power.ts:12` · variable `r1`_');
    const bare = renderComponentHover(partlyUnconnected);
    expect(bare).not.toContain('src/power.ts');
    expect(bare).not.toContain('variable');
  });

  it('escapes pipes in names so the table survives net names like A|B', () => {
    const md = renderComponentHover({
      ...fullyConnected,
      pads: [{ ...fullyConnected.pads[0], net: 'A|B' }],
    });
    expect(md).toContain('`A\\|B`');
  });

  it('omits the value when empty', () => {
    expect(renderComponentHover(partlyUnconnected)).toContain('**U1**');
  });
});
