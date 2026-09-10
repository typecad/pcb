import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildNetlistModel } from '../netlist_model.js';

const NETLIST = `(export (version "E")
  (design
    (tool "typeCAD"))
  (components
    (comp
      (ref "VR1")
        (value "")
        (footprint "lib:QFN50P300X300X75-13N-D")
        (fields
          (field (name "Datasheet") "https://example.com/datasheet.pdf")
          (field (name "MPN") "ISL9120IRTNZ")
        )
     )
    (comp
      (ref "C1")
        (value "22 uF")
        (footprint "Capacitor_SMD:C_0603_1608Metric")
        (fields
          (field (name "Description") "Input power capacitor")
        )
     )
    (comp
      (ref "V1")
        (value "")
        (footprint "")
        (fields
                )
     ))
  (nets
    (net (code "1") (name "net1")
        (node (ref "VR1") (pin "5") (pintype "power_out"))
        (node (ref "C1") (pin "2") (pintype "passive"))
)
(net (code "5") (name "GND")
        (node (ref "VR1") (pin "8") (pintype "power_in"))
        (node (ref "C1") (pin "1") (pintype "passive"))
)
(net (code "6") (name "net6")
        (node (ref "VR1") (pin "9") (pintype "no_connect"))
)
))`;

let model: ReturnType<typeof buildNetlistModel>;

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-net-'));
  const file = path.join(dir, 'board.net');
  fs.writeFileSync(file, NETLIST, 'utf8');
  model = buildNetlistModel(file);
});

describe('buildNetlistModel', () => {
  it('reads the design tool', () => {
    expect(model.tool).toBe('typeCAD');
  });

  it('parses components with values, footprints, and fields', () => {
    expect(model.components).toHaveLength(3);
    const c1 = model.components.find((c) => c.reference === 'C1')!;
    expect(c1.value).toBe('22 uF');
    expect(c1.footprint).toBe('Capacitor_SMD:C_0603_1608Metric');
    expect(c1.fields['Description']).toBe('Input power capacitor');
    const vr1 = model.components.find((c) => c.reference === 'VR1')!;
    expect(vr1.fields['MPN']).toBe('ISL9120IRTNZ');
    expect(vr1.fields['Datasheet']).toBe('https://example.com/datasheet.pdf');
  });

  it('flags V-prefixed empty-footprint components as vias', () => {
    expect(model.components.find((c) => c.reference === 'V1')!.isVia).toBe(true);
    expect(model.components.find((c) => c.reference === 'VR1')!.isVia).toBe(false);
  });

  it('parses nets with codes, names, and pintyped nodes', () => {
    expect(model.nets.map((n) => n.name)).toEqual(['net1', 'GND', 'net6']);
    const net1 = model.nets[0]!;
    expect(net1.code).toBe(1);
    expect(net1.nodes).toEqual([
      { reference: 'VR1', pin: '5', pintype: 'power_out' },
      { reference: 'C1', pin: '2', pintype: 'passive' },
    ]);
  });

  it('keeps no_connect pins as ordinary nodes', () => {
    const dnc = model.nets.find((n) => n.name === 'net6')!;
    expect(dnc.nodes[0]!.pintype).toBe('no_connect');
  });
});
