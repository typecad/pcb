import { describe, it, expect, vi, afterEach } from 'vitest';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

class StubConnector extends Component {
  constructor() {
    super('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
  }
}

describe('route() placement-order guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors when every net component sits at the default (0, 0) position', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pcb = new PCB('route_order_no_outline');
    const c1 = new StubConnector();
    const c2 = new StubConnector();
    const net = pcb.net(c1.pin(1), c2.pin(1));
    pcb.route(net);

    expect(errSpy).toHaveBeenCalled();
    const message = errSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(message).toContain('route() called out of order for net');
    expect(message).toContain('outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create()');
  });

  it('errors when an outline excludes the origin a component still sits on', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pcb = new PCB('route_order_outline');
    pcb.outline(100, 100, 40, 30);
    const c1 = new StubConnector();
    c1.pcb = { x: 110, y: 110 };
    const c2 = new StubConnector(); // never placed
    const net = pcb.net(c1.pin(1), c2.pin(1));
    pcb.route(net);

    expect(errSpy).toHaveBeenCalled();
    const message = errSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(message).toContain('route() called out of order');
  });

  it('stays silent when the net components are placed', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pcb = new PCB('route_order_placed');
    pcb.outline(100, 100, 40, 30);
    const c1 = new StubConnector();
    const c2 = new StubConnector();
    c1.pcb = { x: 110, y: 110 };
    c2.pcb = { x: 120, y: 115 };
    const net = pcb.net(c1.pin(1), c2.pin(1));
    pcb.route(net);

    const orderMessages = errSpy.mock.calls.filter((args) => String(args[0]).includes('route() called out of order'));
    expect(orderMessages).toHaveLength(0);
  });
});
