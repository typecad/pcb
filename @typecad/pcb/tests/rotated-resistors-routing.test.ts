import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('Rotated Resistors Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('rotated_resistors');
  });

  it('should route connections between rotated resistors', async () => {
    // Test 2: Two resistors, one at -90 degrees and one at 90 degrees (middle area)
    const r1_test2 = new Resistor();
    const r2_test2 = new Resistor();

    // Position test 2 components in middle area
    r1_test2.pcb.x = 40;
    r1_test2.pcb.y = 20;
    r1_test2.pcb.rotation = -90; // -90 degrees
    r2_test2.pcb.x = 46;
    r2_test2.pcb.y = 20;
    r2_test2.pcb.rotation = 90; // 90 degrees - this forces a more complex routing

    // schematic symbol locations
    r1_test2.sch.x = 40;
    r1_test2.sch.y = 20;
    r2_test2.sch.x = 46;
    r2_test2.sch.y = 20;

    // Create connections for Test 2 - this will require routing around the 90-degree rotation
    let test2_1 = typecad.named('test2_1').net(r1_test2.pin(1), r2_test2.pin(1));
    let test2_2 = typecad.named('test2_2').net(r1_test2.pin(2), r2_test2.pin(2));

    // Route the connections
    const route1 = await typecad.route(test2_1);
    const route2 = await typecad.route(test2_2);

    // Check that routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
  });
});
