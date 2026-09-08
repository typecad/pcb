import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { PadResolver } from '../src/routing/shared/pad_resolver.js';
import { ObstacleBuilder } from '../src/routing/shared/obstacle_builder.js';
import { BoardCreationError, RoutingError } from '../src/utils/errors.js';

const buildDir = './build';

/** Minimal component with a mocked single-pad footprint (stackup-test pattern). */
function padComponent(kind: 'smd' | 'thru_hole' = 'smd'): Component {
  const c = new Component('test:pad');
  c.reference = 'R1';
  c.pins = [c.pin(1)];
  c.pcb = { x: 10, y: 10 } as any;
  const footprint =
    kind === 'smd'
      ? '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))'
      : '(footprint (pad "1" thru_hole circle (at 0 0) (size 1 1) (drill 0.5) (layers "*.Cu" "*.Mask")))';
  vi.spyOn(c, 'footprint_lib').mockReturnValue(footprint as any);
  return c;
}

describe('PCB layer set resolution', () => {
  it('defaults to a 2-layer board', () => {
    const pcb = new PCB('layer_set_default');
    expect(pcb.layerCount).toBe(2);
    expect(pcb.copperLayers).toEqual(['F.Cu', 'B.Cu']);
  });

  it('resolves copper layers from the constructor layers option', () => {
    const pcb = new PCB('layer_set_ctor', { layers: 4 });
    expect(pcb.layerCount).toBe(4);
    expect(pcb.copperLayers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
  });

  it('validates the constructor layer count', () => {
    expect(() => new PCB('layer_set_bad', { layers: 1 })).toThrow(RangeError);
    expect(() => new PCB('layer_set_bad', { layers: 33 })).toThrow(RangeError);
    expect(() => new PCB('layer_set_bad', { layers: 2.5 })).toThrow(RangeError);
  });

  it('stackup() overrides the constructor layer count', () => {
    const pcb = new PCB('layer_set_override', { layers: 2 });
    pcb.stackup(6);
    expect(pcb.layerCount).toBe(6);
    expect(pcb.copperLayers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu']);

    const pcb2 = new PCB('layer_set_override2', { layers: 6 });
    pcb2.stackup(2);
    expect(pcb2.copperLayers).toEqual(['F.Cu', 'B.Cu']);
  });
});

describe('PCB create() with constructor-configured layers', () => {
  const boardName = 'layer_set_create';

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

  it('writes a 4-layer stackup without calling pcb.stackup()', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    const c = padComponent();
    pcb.add(c);
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('(stackup');
    expect(board).toContain('(layer "In1.Cu"');
    expect(board).toContain('(1 "In1.Cu" signal)');
    expect(board).toContain('(2 "In2.Cu" signal)');
  });

  it('does not emit a stackup for the 2-layer default', () => {
    const pcb = new PCB(boardName);
    const c = padComponent();
    pcb.add(c);
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).not.toContain('(stackup');
  });
});

describe('write-time layer validation', () => {
  const boardName = 'layer_set_validate';

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

  it('rejects a zone on an undeclared inner layer', () => {
    const pcb = new PCB(boardName); // 2-layer default
    const c = padComponent();
    pcb.add(c);
    pcb.zone({ net: 'GND', layers: ['In1.Cu'], x: 0, y: 0, width: 10, height: 10 });

    expect(() => pcb.create(c)).toThrow(BoardCreationError);
    try {
      pcb.create(c);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('In1.Cu');
      expect(msg).toContain('pcb.stackup');
    }
  });

  it('accepts the same zone once the layer is declared', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    const c = padComponent();
    pcb.add(c);
    pcb.zone({ net: 'GND', layers: ['In1.Cu'], x: 0, y: 0, width: 10, height: 10 });
    expect(() => pcb.create(c)).not.toThrow();

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('"In1.Cu"');
  });

  it('suggests the correct spelling for case-mismatched layer names', () => {
    const pcb = new PCB(boardName);
    const c = padComponent();
    pcb.add(c);
    pcb.zone({ net: 'GND', layers: ['f.cu'], x: 0, y: 0, width: 10, height: 10 });

    expect(() => pcb.create(c)).toThrow(/Did you mean "F\.Cu"/);
  });
});

describe('route() layer validation', () => {
  class Connector extends Component {
    constructor() {
      super('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
    }
  }

  it('rejects routing on an undeclared copper layer', () => {
    const pcb = new PCB('layer_set_route'); // 2-layer default
    const c1 = new Connector();
    const c2 = new Connector();
    pcb.add(c1, c2);
    const net = pcb.net(c1.pin(1), c2.pin(1));

    expect(() => pcb.route(net, { layers: ['In1.Cu'] } as any)).toThrow(RoutingError);
  });

  it('routes on a 4-layer board without explicit layer arguments', async () => {
    const pcb = new PCB('layer_set_route4', { layers: 4 });
    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 30;
    c2.pcb.y = 15;
    pcb.add(c1, c2);
    const net = pcb.net(c1.pin(1), c2.pin(1));

    const result = pcb.route(net);
    pcb.waitForPendingAutoroutes();
    expect(result.success).toBe(true);
  });
});

describe('TrackBuilder via defaults', () => {
  it('uses a through-via span when no layers are specified from an inner layer', () => {
    const pcb = new PCB('layer_set_via', { layers: 4 });
    const track = pcb.track().from({ x: 0, y: 0 }, 'In1.Cu').via();

    const elements = track.getElements();
    const viaElement = elements.find((el) => el.type === 'via');
    expect(viaElement).toBeDefined();
    expect((viaElement!.details as any).layers).toEqual(['F.Cu', 'B.Cu']);
  });

  it('honors an explicit blind/buried span', () => {
    const pcb = new PCB('layer_set_via2', { layers: 4 });
    const track = pcb
      .track()
      .from({ x: 0, y: 0 }, 'In1.Cu')
      .via({ layers: ['In1.Cu', 'In2.Cu'] });

    const elements = track.getElements();
    const viaElement = elements.find((el) => el.type === 'via');
    expect((viaElement!.details as any).layers).toEqual(['In1.Cu', 'In2.Cu']);
  });
});

describe('PadResolver board copper layer expansion', () => {
  it('expands through-hole pads to the board copper layers when provided', () => {
    const c = padComponent('thru_hole');
    const six = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
    const geom = PadResolver.getPadGeometry(c, 1, six);
    expect(geom).not.toBeNull();
    expect(geom!.type).toBe('thru_hole');
    expect(geom!.layers).toEqual(six);
  });

  it('defaults through-hole pads to the outer layers when no board set is provided', () => {
    const c = padComponent('thru_hole');
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom!.layers).toEqual(['F.Cu', 'B.Cu']);
  });
});

describe('ObstacleBuilder via span on N-layer boards', () => {
  it('blocks a through via on every copper layer of a 4-layer board', () => {
    const pcb = new PCB('layer_set_obstacle', { layers: 4 });
    pcb.via({ at: { x: 5, y: 5 } });

    const obstacles = ObstacleBuilder.buildFromPCB(pcb, 0.2);
    const viaObstacle = obstacles.find((o) => o.type === 'pad');
    expect(viaObstacle).toBeDefined();
    expect(viaObstacle!.layers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
  });
});
