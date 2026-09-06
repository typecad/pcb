import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { HEURISTIC } from '../autoroute_test';
// Export function that accepts the main typecad object
export function runTest4(typecad: PCB): Component[] {
  // Test 4: QFN-12 component with resistors creating intersecting traces
  const qfn_test4 = new Component({
    footprint: 'Package_DFN_QFN:QFN-12-1EP_3x3mm_P0.5mm_EP1.45x1.45mm',
  });

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

  /// ----------------
  qfn_test4.sch.x = 112;
  qfn_test4.sch.y = 22;
  // qfn_test4.pcb.rotation = 0;

  r1_test4.sch.x = 105;
  r1_test4.sch.y = 15;
  // r1_test4.pcb.rotation = 0;

  r2_test4.sch.x = 112;
  r2_test4.sch.y = 15;
  // r2_test4.pcb.rotation = 0;

  r3_test4.sch.x = 120;
  r3_test4.sch.y = 15;
  // r3_test4.pcb.rotation = 0;

  // Bottom row - positioned to intersect with top row connections
  r4_test4.sch.x = 105;
  r4_test4.sch.y = 28;
  // r4_test4.pcb.rotation = 0;

  r5_test4.sch.x = 112;
  r5_test4.sch.y = 28;
  // r5_test4.pcb.rotation = 0;

  r6_test4.sch.x = 120;
  r6_test4.sch.y = 28;
  // r6_test4.pcb.rotation = 0;

  // Create intersecting connections for Test 4
  // These connections will force the autorouter to route around/under intersecting traces
  // Connect QFN pins to resistors in a pattern that creates intersections
  const test4_1 = typecad.named('test4_1').net(qfn_test4.pin(1), r1_test4.pin(1)); // Top-left to QFN pin 1
  const test4_2 = typecad.named('test4_2').net(qfn_test4.pin(2), r2_test4.pin(1)); // Top-center to QFN pin 2
  const test4_3 = typecad.named('test4_3').net(qfn_test4.pin(3), r3_test4.pin(1)); // Top-right to QFN pin 3
  const test4_4 = typecad.named('test4_4').net(qfn_test4.pin(4), r4_test4.pin(1)); // Bottom-left to QFN pin 4
  const test4_5 = typecad.named('test4_5').net(qfn_test4.pin(5), r5_test4.pin(1)); // Bottom-center to QFN pin 5
  const test4_6 = typecad.named('test4_6').net(qfn_test4.pin(6), r6_test4.pin(1)); // Bottom-right to QFN pin 6

  // Create cross-connections between resistors to force intersections
  const test4_7 = typecad.named('test4_7').net(r1_test4.pin(2), r6_test4.pin(2)); // Diagonal crossing
  const test4_8 = typecad.named('test4_8').net(r2_test4.pin(2), r5_test4.pin(2)); // Vertical crossing
  const test4_9 = typecad.named('test4_9').net(r3_test4.pin(2), r4_test4.pin(2)); // Diagonal crossing

  // 0.5mm-pitch QFN escapes are only physically routable with fine-pitch
  // rules: a 0.2mm trace at 0.2mm clearance cannot fit between 0.5mm-pitch
  // pads (0.25mm mid-channel available, 0.4mm+ needed), so route with 0.15mm
  // traces at 0.1mm clearance on a finer grid.
  const fine = { gridResolution: 0.05, width: 0.15, clearance: 0.1, heuristicWeight: HEURISTIC };

  typecad.route(test4_1, fine);
  typecad.route(test4_2, fine);
  typecad.route(test4_4, fine);
  typecad.route(test4_5, fine);
  typecad.route(test4_6, fine);
  typecad.route(test4_7, fine);
  typecad.route(test4_8, fine);
  typecad.route(test4_9, fine);
  typecad.route(test4_3, fine);

  // Return components for creation
  return [qfn_test4, r1_test4, r2_test4, r3_test4, r4_test4, r5_test4, r6_test4];
}
