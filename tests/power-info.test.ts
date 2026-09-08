import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('Power Info Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('power_info');
  });

  it('should route connections with power information', async () => {
    // Test 14: Two resistors with power info
    const r1_test14 = new Resistor();
    const r2_test14 = new Resistor();

    // Create powerInfo object
    r1_test14.pin(1).powerInfo = {
      current: 1.5,
    };

    // Position test 14 components in upper-left area
    r1_test14.pcb.x = 20;
    r1_test14.pcb.y = 20;
    r1_test14.pcb.rotation = 90; // 90 degrees
    r2_test14.pcb.x = 26;
    r2_test14.pcb.y = 20;
    r2_test14.pcb.rotation = 90; // 90 degrees

    // Create connections for Test 14 - connect r1's pin 1 to r2's pin 1 and r1's pin 2 to r2's pin 2
    let test14_1 = typecad.named('test14_1').net(r1_test14.pin(1), r2_test14.pin(1));
    let test14_2 = typecad.named('test14_2').net(r1_test14.pin(2), r2_test14.pin(2));

    // Route the connections
    const route1 = await typecad.route(test14_1);
    const route2 = await typecad.route(test14_2);

    // Check that routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
  });
});
