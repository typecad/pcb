import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
class Connector extends Component {
  constructor(opts: any = {}) {
    super('Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('Multilayer Connectors Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('multilayer_connectors');
  });

  it('should route connections between multilayer connectors', async () => {
    // Test 5: Multi-layer routing test with connectors
    const conn1_test5 = new Connector({ number: 4 });
    const conn2_test5 = new Connector({ number: 4 });
    const r1_test5 = new Resistor();
    const r2_test5 = new Resistor();

    // Position components for Test 5
    conn1_test5.pcb.x = 20;
    conn1_test5.pcb.y = 50;
    conn1_test5.pcb.rotation = 0;

    conn2_test5.pcb.x = 40;
    conn2_test5.pcb.y = 57;
    conn2_test5.pcb.rotation = 180;

    r1_test5.pcb.x = 30;
    r1_test5.pcb.y = 45;
    r1_test5.pcb.rotation = 90;

    r2_test5.pcb.x = 30;
    r2_test5.pcb.y = 55;
    r2_test5.pcb.rotation = 90;

    // Create multi-layer connections for Test 5
    let test5_1 = typecad.named('test5_1').net(conn1_test5.pin(1), r1_test5.pin(1));
    let test5_2 = typecad.named('test5_2').net(r1_test5.pin(2), conn2_test5.pin(1));
    let test5_3 = typecad.named('test5_3').net(conn1_test5.pin(2), r2_test5.pin(1));
    let test5_4 = typecad.named('test5_4').net(r2_test5.pin(2), conn2_test5.pin(2));
    let test5_5 = typecad.named('test5_5').net(conn1_test5.pin(3), conn2_test5.pin(3)); // Direct connection for layer crossing

    // Route all connections
    const route1 = await typecad.route(test5_1);
    const route2 = await typecad.route(test5_2);
    const route3 = await typecad.route(test5_3);
    const route4 = await typecad.route(test5_4);
    const route5 = await typecad.route(test5_5);

    // Check that all routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
    expect(route3.success).toBe(true);
    expect(route4.success).toBe(true);
    expect(route5.success).toBe(true);
  });
});
