import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('DSBGA Complex Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('dsbga_complex_routing');
  });

  it('should route complex connections around DSBGA component', { timeout: 120_000 }, async () => {
    // Test 9: Texas DSBGA-12 component with complex routing
    const dsbga_test9 = new Component('Package_BGA:Texas_DSBGA-12_1.36x1.86mm_Layout3x4_P0.5mm');

    // Create resistors for Test 9 - positioned to test BGA routing challenges
    const r1_test9 = new Resistor();
    const r2_test9 = new Resistor();
    const r3_test9 = new Resistor();
    const r4_test9 = new Resistor();
    const r5_test9 = new Resistor();
    const r6_test9 = new Resistor();

    // Position DSBGA in center area for Test 9
    dsbga_test9.pcb.x = 112;
    dsbga_test9.pcb.y = 75;
    dsbga_test9.pcb.rotation = 0;

    // Position resistors around DSBGA to create complex routing patterns
    // Top row - will create horizontal traces that intersect with vertical ones
    r1_test9.pcb.x = 105;
    r1_test9.pcb.y = 68;
    r1_test9.pcb.rotation = 0;

    r2_test9.pcb.x = 112;
    r2_test9.pcb.y = 68;
    r2_test9.pcb.rotation = 0;

    r3_test9.pcb.x = 120;
    r3_test9.pcb.y = 68;
    r3_test9.pcb.rotation = 0;

    // Bottom row - positioned to intersect with top row connections
    r4_test9.pcb.x = 105;
    r4_test9.pcb.y = 82;
    r4_test9.pcb.rotation = 0;

    r5_test9.pcb.x = 112;
    r5_test9.pcb.y = 82;
    r5_test9.pcb.rotation = 0;

    r6_test9.pcb.x = 120;
    r6_test9.pcb.y = 82;
    r6_test9.pcb.rotation = 0;

    // Create complex connections for Test 9
    // These connections will test BGA routing with fine pitch and escape routing
    // Connect DSBGA pins to resistors in a pattern that creates routing challenges
    let test9_1 = typecad.named('test9_1').net(dsbga_test9.pin('A2'), r1_test9.pin(1)); // Top-left to DSBGA pin 1
    let test9_2 = typecad.named('test9_2').net(dsbga_test9.pin('B2'), dsbga_test9.pin('C2')); // Top-center to DSBGA pin 2
    let test9_3 = typecad.named('test9_3').net(dsbga_test9.pin('D1'), r3_test9.pin(1)); // Top-right to DSBGA pin 3
    let test9_4 = typecad.named('test9_4').net(dsbga_test9.pin('B3'), r4_test9.pin(1)); // Bottom-left to DSBGA pin 4
    let test9_5 = typecad.named('test9_5').net(dsbga_test9.pin('D3'), r5_test9.pin(1)); // Bottom-center to DSBGA pin 5
    let test9_6 = typecad.named('test9_6').net(dsbga_test9.pin('B1'), r6_test9.pin(1)); // Bottom-right to DSBGA pin 6

    // Create cross-connections between resistors to force complex routing
    let test9_7 = typecad.named('test9_7').net(r1_test9.pin(2), r6_test9.pin(2)); // Diagonal crossing
    let test9_8 = typecad.named('test9_8').net(r2_test9.pin(2), r5_test9.pin(2)); // Vertical crossing
    let test9_9 = typecad.named('test9_9').net(r3_test9.pin(2), r4_test9.pin(2)); // Diagonal crossing

    // Route all connections with special options. 0.5mm-pitch DSBGA
    // escapes need fine-pitch rules: 0.2mm traces at 0.2mm clearance
    // cannot physically fit between 0.5mm-pitch pads (0.25mm available,
    // 0.4mm+ needed), so route with 0.15mm traces at 0.1mm clearance.
    const fine = { gridResolution: 0.05, width: 0.15, clearance: 0.1, heuristicWeight: 2 };
    const route1 = await typecad.route(test9_1, fine);
    const route2 = await typecad.route(test9_2, fine);
    const route3 = await typecad.route(test9_3, {
      ...fine,
      waypoints: [
        { x: 112.02, y: 76.96 },
        { x: 113.02, y: 76.96 },
      ],
    });
    // The forced via sits below route3's horizontal track (y=76.96):
    // forced-via clearance includes the via pad radius, so the spot
    // must keep 0.6mm-via clearance from both the BGA pads and that track.
    const route5 = await typecad.route(test9_5, { ...fine, vias: [{ x: 112.51, y: 78.2, layer: 'B.Cu' }] });
    const route4 = await typecad.route(test9_4, fine);

    const route6 = await typecad.route(test9_6, fine);
    const route7 = await typecad.route(test9_7, fine);
    const route8 = await typecad.route(test9_8, fine);
    const route9 = await typecad.route(test9_9, fine);

    // Check that all routes were created successfully
    expect(route1.success).toBe(true);
    expect(route2.success).toBe(true);
    expect(route3.success).toBe(true);
    expect(route4.success).toBe(true);
    expect(route5.success).toBe(true);
    expect(route6.success).toBe(true);
    expect(route7.success).toBe(true);
    expect(route8.success).toBe(true);
    expect(route9.success).toBe(true);
  });
});
