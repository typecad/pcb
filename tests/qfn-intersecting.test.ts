import { describe, it, expect, beforeEach } from 'vitest';
class Resistor extends Component {
  constructor(opts: any = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    if (opts.value) this.value = opts.value;
  }
}
import { PCB, Component } from '../src/index.js';

describe('QFN Intersecting Routing Tests', () => {
  let typecad: PCB;

  beforeEach(() => {
    // Initialize a new PCB instance for each test
    typecad = new PCB('qfn_intersecting');
  });

  it('should route intersecting traces around QFN component', { timeout: 120_000 }, async () => {
    // Test 4: QFN-12 component with resistors creating intersecting traces
    const qfn_test4 = new Component('Package_DFN_QFN:QFN-12-1EP_3x3mm_P0.5mm_EP1.45x1.45mm');

    // Create resistors for Test 4 - positioned to force intersecting traces
    const r1_test4 = new Resistor();
    const r2_test4 = new Resistor();
    const r3_test4 = new Resistor();
    const r4_test4 = new Resistor();
    const r5_test4 = new Resistor();
    const r6_test4 = new Resistor();

    // Position QFN in center area
    qfn_test4.pcb.x = 112;
    qfn_test4.pcb.y = 22;
    qfn_test4.pcb.rotation = 0;

    // Position resistors around QFN to create intersecting trace patterns
    // Top row - will create horizontal traces that intersect with vertical ones
    r1_test4.pcb.x = 105;
    r1_test4.pcb.y = 15;
    r1_test4.pcb.rotation = 0;

    r2_test4.pcb.x = 112;
    r2_test4.pcb.y = 15;
    r2_test4.pcb.rotation = 0;

    r3_test4.pcb.x = 120;
    r3_test4.pcb.y = 15;
    r3_test4.pcb.rotation = 0;

    // Bottom row - positioned to intersect with top row connections
    r4_test4.pcb.x = 105;
    r4_test4.pcb.y = 28;
    r4_test4.pcb.rotation = 0;

    r5_test4.pcb.x = 112;
    r5_test4.pcb.y = 28;
    r5_test4.pcb.rotation = 0;

    r6_test4.pcb.x = 120;
    r6_test4.pcb.y = 28;
    r6_test4.pcb.rotation = 0;

    // Schematic positions
    qfn_test4.sch.x = 112;
    qfn_test4.sch.y = 22;

    r1_test4.sch.x = 105;
    r1_test4.sch.y = 15;

    r2_test4.sch.x = 112;
    r2_test4.sch.y = 15;

    r3_test4.sch.x = 120;
    r3_test4.sch.y = 15;

    r4_test4.sch.x = 105;
    r4_test4.sch.y = 28;

    r5_test4.sch.x = 112;
    r5_test4.sch.y = 28;

    r6_test4.sch.x = 120;
    r6_test4.sch.y = 28;

    // Create intersecting connections for Test 4
    // These connections will force the autorouter to route around/under intersecting traces
    // Connect QFN pins to resistors in a pattern that creates intersections
    let test4_1 = typecad.named('test4_1').net(qfn_test4.pin(1), r1_test4.pin(1)); // Top-left to QFN pin 1
    let test4_2 = typecad.named('test4_2').net(qfn_test4.pin(2), r2_test4.pin(1)); // Top-center to QFN pin 2
    let test4_3 = typecad.named('test4_3').net(qfn_test4.pin(3), r3_test4.pin(1)); // Top-right to QFN pin 3
    let test4_4 = typecad.named('test4_4').net(qfn_test4.pin(4), r4_test4.pin(1)); // Bottom-left to QFN pin 4
    let test4_5 = typecad.named('test4_5').net(qfn_test4.pin(5), r5_test4.pin(1)); // Bottom-center to QFN pin 5
    let test4_6 = typecad.named('test4_6').net(qfn_test4.pin(6), r6_test4.pin(1)); // Bottom-right to QFN pin 6

    // Create cross-connections between resistors to force intersections
    let test4_7 = typecad.named('test4_7').net(r1_test4.pin(2), r6_test4.pin(2)); // Diagonal crossing
    let test4_8 = typecad.named('test4_8').net(r2_test4.pin(2), r5_test4.pin(2)); // Vertical crossing
    let test4_9 = typecad.named('test4_9').net(r3_test4.pin(2), r4_test4.pin(2)); // Diagonal crossing

    // Route all connections. 0.5mm-pitch QFN escapes are only physically
    // routable with fine-pitch rules: a 0.2mm trace at 0.2mm clearance
    // cannot fit between 0.5mm-pitch pads (needs 0.4mm+ from pad centers,
    // 0.5mm pitch gives 0.25mm), so use 0.15mm traces at 0.1mm clearance.
    const fine = { gridResolution: 0.05, width: 0.15, clearance: 0.1, heuristicWeight: 2 };
    const route1 = await typecad.route(test4_1, fine);
    const route2 = await typecad.route(test4_2, fine);
    const route4 = await typecad.route(test4_4, fine);
    const route5 = await typecad.route(test4_5, fine);
    const route6 = await typecad.route(test4_6, fine);
    const route7 = await typecad.route(test4_7, fine);
    const route8 = await typecad.route(test4_8, fine);
    const route9 = await typecad.route(test4_9, fine);
    const route3 = await typecad.route(test4_3, fine);

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
