import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'node:perf_hooks';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('Keepout Area Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('keepout_area');
  });

  it('should route connections around keepout areas', async () => {
    const benchEnabled = process.env.MAST_BENCH === '1';
    const benchStart = benchEnabled ? performance.now() : 0;

    // Test 10: Keepout area routing test
    const r1_test10 = new Resistor();
    const r2_test10 = new Resistor();
    const r3_test10 = new Resistor();
    const r4_test10 = new Resistor();

    // Position test 10 components to test routing around keepout areas
    // Place components on opposite sides of a keepout area to force routing around it
    r1_test10.pcb.x = 160;
    r1_test10.pcb.y = 20;
    r1_test10.pcb.rotation = 0;

    r2_test10.pcb.x = 190;
    r2_test10.pcb.y = 20;
    r2_test10.pcb.rotation = 0;

    r3_test10.pcb.x = 160;
    r3_test10.pcb.y = 35;
    r3_test10.pcb.rotation = 0;

    r4_test10.pcb.x = 190;
    r4_test10.pcb.y = 35;
    r4_test10.pcb.rotation = 0;

    // Create connections that must route around a keepout area
    // These connections will need to navigate around a restricted zone in the middle
    let test10_1 = typecad.named('test10_1').net(r1_test10.pin(1), r2_test10.pin(1));
    let test10_2 = typecad.named('test10_2').net(r1_test10.pin(2), r2_test10.pin(2));
    let test10_3 = typecad.named('test10_3').net(r3_test10.pin(1), r4_test10.pin(1));
    let test10_4 = typecad.named('test10_4').net(r3_test10.pin(2), r4_test10.pin(2));

    // Define keepout area globally
    typecad.keepout({ x: 170, y: 15, width: 10, height: 20, layers: ['F.Cu'] });

    // Route with keepout area in the middle (coordinates represent a restricted area)
    const t1 = benchEnabled ? performance.now() : 0;
    const route1 = await typecad.route(test10_1);
    const t2 = benchEnabled ? performance.now() : 0;
    const route2 = await typecad.route(test10_2);
    const t3 = benchEnabled ? performance.now() : 0;
    const route3 = await typecad.route(test10_3);
    const t4 = benchEnabled ? performance.now() : 0;
    const route4 = await typecad.route(test10_4);

    if (benchEnabled) {
      const total = performance.now() - benchStart;
      console.log(
        `[MAST_BENCH] keepout-area: route1 ${(t2 - t1).toFixed(2)}ms, route2 ${(t3 - t2).toFixed(2)}ms, route3 ${(t4 - t3).toFixed(2)}ms, route4 ${(performance.now() - t4).toFixed(2)}ms, total ${total.toFixed(2)}ms`,
      );
    }

    // Check that all routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
    expect(route3.success).toBe(true);
    expect(route4.success).toBe(true);
  }, 60000);
});
