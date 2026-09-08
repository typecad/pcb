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
    typecad = new PCB('basic_resistors');
  });

  it('should create two resistors and connect their pins', () => {
    // Test 1: Two resistors placed apart with terminals connected (positioned around 20, 20)
    const r1_test1 = new Resistor();
    const r2_test1 = new Resistor();

    // Position test 1 components in upper-left area
    r1_test1.pcb.x = 20;
    r1_test1.pcb.y = 20;
    r1_test1.pcb.rotation = 90; // 90 degrees
    r2_test1.pcb.x = 26;
    r2_test1.pcb.y = 20;
    r2_test1.pcb.rotation = 90; // 90 degrees

    r1_test1.sch.x = 20;
    r1_test1.sch.y = 20;
    r2_test1.sch.x = 26;
    r2_test1.sch.y = 20;

    // Create connections for Test 1 - connect r1's pin 1 to r2's pin 1 and r1's pin 2 to r2's pin 2
    let test1_1 = typecad.named('test1_1').net(r1_test1.pin(1), r2_test1.pin(1));
    let test1_2 = typecad.named('test1_2').net(r1_test1.pin(2), r2_test1.pin(2));

    // Route the connections
    const route1 = typecad.route(test1_1);
    const route2 = typecad.route(test1_2);

    // Check that routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
  });
});
