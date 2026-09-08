import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { resolveViaSpan } from '../src/pcb/pcb_routing_core.js';
import { BoardCreationError } from '../src/utils/errors.js';

const buildDir = './build';

class Connector extends Component {
  constructor() {
    super('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
  }
}

describe('pcb.plane()', () => {
  const boardName = 'plane_create';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('validates the layer and rejects duplicate planes', () => {
    const pcb = new PCB('plane_validate', { layers: 4 });
    pcb.plane('GND', 'In1.Cu');
    expect(pcb.planeLayers.has('In1.Cu')).toBe(true);

    expect(() => pcb.plane('GND', 'In9.Cu')).toThrow(RangeError);
    expect(() => pcb.plane('', 'In2.Cu')).toThrow(RangeError);
    expect(() => pcb.plane('+3V3', 'In1.Cu')).toThrow(/already declared/);
  });

  it('materializes a board-covering zone at create() and not before', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 50, 40);
    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 30;
    c2.pcb.y = 15;
    pcb.add(c1, c2);
    const net = pcb.net(c1.pin(1), c2.pin(1));
    pcb.route(net);
    pcb.waitForPendingAutoroutes();
    pcb.plane('GND', 'In1.Cu');
    pcb.create(c1, c2);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    // count plane zones by looking for the layer ref inside each zone head
    // (KiCad 9 resaves write `(layers "In1.Cu")`, KiCad 10 `(layer "In1.Cu")`;
    // segments also use the singular form, so anchor on the zone block)
    const planeZoneCount = (b: string) =>
      (b.match(/\(zone[\s\S]*?\(polygon/g) ?? []).filter((head) => /\(layers? "In1\.Cu"\)/.test(head)).length;
    expect(planeZoneCount(board)).toBeGreaterThan(0);
    // exactly one plane zone even after a second create()
    pcb.create(c1, c2);
    const board2 = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(planeZoneCount(board2)).toBe(1);
  });

  it('keeps autorouted signal tracks off the plane layer', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 50, 40);
    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 30;
    c2.pcb.y = 15;
    pcb.add(c1, c2);
    pcb.plane('GND', 'In1.Cu');
    const net = pcb.net(c1.pin(1), c2.pin(1));
    const result = pcb.route(net);
    pcb.waitForPendingAutoroutes();

    expect(result.success).toBe(true);
    const usedLayers = result.routeDetails.flatMap((rd) => rd.layers);
    expect(usedLayers).not.toContain('In1.Cu');
  });

  it('errors at create() when no board outline exists', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    const c = new Connector();
    pcb.add(c);
    pcb.plane('GND', 'In1.Cu');

    expect(() => pcb.create(c)).toThrow(BoardCreationError);
    try {
      pcb.create(c);
    } catch (e) {
      expect((e as Error).message).toContain('outline');
    }
  });
});

describe('net-class layer affinity', () => {
  it('validates preferred layers against the declared copper layers', () => {
    const pcb = new PCB('netclass_layers', { layers: 4 });
    expect(() => pcb.netClass('inner', { layers: ['In9.Cu'] })).toThrow(RangeError);
    expect(() => pcb.netClass('inner', { layers: ['In2.Cu'] })).not.toThrow();
  });

  it('routes an assigned net on its preferred inner layer', () => {
    const pcb = new PCB('netclass_route', { layers: 4 });
    pcb.outline(0, 0, 50, 40);
    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 30;
    c2.pcb.y = 15;
    pcb.add(c1, c2);
    pcb.netClass('inner-bus', { layers: ['In2.Cu'] });
    const net = pcb.net(c1.pin(1), c2.pin(1));
    pcb.assign(net, 'inner-bus');

    const result = pcb.route(net);
    pcb.waitForPendingAutoroutes();

    expect(result.success).toBe(true);
    const usedLayers = result.routeDetails.flatMap((rd) => rd.layers);
    expect(usedLayers).toContain('In2.Cu');
  });
});

describe('via policy', () => {
  it('defaults to through vias', () => {
    const pcb = new PCB('via_policy_default');
    expect(pcb.viaPolicyConfig).toEqual({ type: 'through' });
  });

  it('validates policy input', () => {
    const pcb = new PCB('via_policy_validate');
    expect(() => pcb.viaPolicy({ type: 'micro' } as any)).toThrow(RangeError);
    expect(() => pcb.viaPolicy({ type: 'blind-buried', maxSpan: 4 })).not.toThrow();
    expect(pcb.viaPolicyConfig).toEqual({ type: 'blind-buried', maxSpan: 4 });
  });

  describe('resolveViaSpan', () => {
    it('emits a through span under the default policy', () => {
      const pcb = new PCB('via_span_through', { layers: 4 });
      expect(resolveViaSpan(pcb, 'In1.Cu', 'In2.Cu')).toEqual(['F.Cu', 'B.Cu']);
      expect(resolveViaSpan(pcb, 'F.Cu', 'B.Cu')).toEqual(['F.Cu', 'B.Cu']);
    });

    it('keeps short transition pairs under blind-buried policy', () => {
      const pcb = new PCB('via_span_bb', { layers: 6 });
      pcb.viaPolicy({ type: 'blind-buried' });
      expect(resolveViaSpan(pcb, 'In1.Cu', 'In2.Cu')).toEqual(['In1.Cu', 'In2.Cu']);
      expect(resolveViaSpan(pcb, 'F.Cu', 'In2.Cu')).toEqual(['F.Cu', 'In2.Cu']);
    });

    it('falls back to a through span beyond maxSpan', () => {
      const pcb = new PCB('via_span_max', { layers: 6 });
      pcb.viaPolicy({ type: 'blind-buried' }); // default maxSpan 2
      expect(resolveViaSpan(pcb, 'F.Cu', 'In3.Cu')).toEqual(['F.Cu', 'B.Cu']);
      expect(resolveViaSpan(pcb, 'In1.Cu', 'In4.Cu')).toEqual(['F.Cu', 'B.Cu']);
    });

    it('honors a custom maxSpan', () => {
      const pcb = new PCB('via_span_custom', { layers: 6 });
      pcb.viaPolicy({ type: 'blind-buried', maxSpan: 5 });
      expect(resolveViaSpan(pcb, 'F.Cu', 'In4.Cu')).toEqual(['F.Cu', 'In4.Cu']);
    });
  });
});
