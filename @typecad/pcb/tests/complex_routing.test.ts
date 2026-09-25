import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('Basic Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('complex_routing');
  });

  it('should create multiple resistors and angles and connect their pins', async () => {
    // Test 3: More complex routing with additional components
    const r1_test3 = new Resistor();
    const r2_test3 = new Resistor();
    const r3_test3 = new Resistor();
    const r4_test3 = new Resistor();

    // Position test 3 components
    r1_test3.pcb.x = 66;
    r1_test3.pcb.y = 20;
    r1_test3.pcb.rotation = 0;
    r2_test3.pcb.x = 76;
    r2_test3.pcb.y = 20;
    r2_test3.pcb.rotation = 45; // Diagonal placement for complexity
    r3_test3.pcb.x = 86;
    r3_test3.pcb.y = 20;
    r3_test3.pcb.rotation = 90; // 90 degrees
    r4_test3.pcb.x = 96;
    r4_test3.pcb.y = 20;
    r4_test3.pcb.rotation = 180; // 180 degrees

    r1_test3.sch.x = 66;
    r1_test3.sch.y = 20;
    r1_test3.sch.rotation = 0;
    r2_test3.sch.x = 76;
    r2_test3.sch.y = 20;
    r2_test3.sch.rotation = 90; // Diagonal placement for complexity
    r3_test3.sch.x = 86;
    r3_test3.sch.y = 20;
    // r3_test3.pcb.rotation = 90; // 90 degrees
    r4_test3.sch.x = 96;
    r4_test3.sch.y = 20;
    r4_test3.sch.rotation = 180; // 180 degrees

    // Create complex connections for Test 3
    let test3_1 = typecad.named('test3_1').net(r1_test3.pin(2), r2_test3.pin(1));
    let test3_2 = typecad.named('test3_2').net(r2_test3.pin(2), r3_test3.pin(1));
    let test3_3 = typecad.named('test3_3').net(r3_test3.pin(2), r4_test3.pin(1));
    let test3_4 = typecad.named('test3_4').net(r4_test3.pin(2), r1_test3.pin(1));

    const route1 = await typecad.route(test3_1);
    const route2 = await typecad.route(test3_2);
    const route3 = await typecad.route(test3_3);
    const route4 = await typecad.route(test3_4);

    // Check that routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
    expect(route3.success).toBe(true);
    expect(route4.success).toBe(true);
  });
});
