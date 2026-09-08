import { PCB, Component, Resistor } from '@typecad/pcb';

import { RESOLUTION } from '../autoroute_test';

/**
 * DORMANT — not wired into pro_mini.ts.
 *
 * Differential pair routing is not implemented; the `differential`/`gap`
 * route options used below were never part of the public API and were
 * silently ignored. Kept as the reference scenario for when coupled routing
 * lands (the intended shape: coupled routing, gap-from-impedance, intra-pair
 * skew via lengthMatch).
 */

// Export function that accepts the main typecad object
export function runTest12(typecad: PCB): Component[] {
  // Test 12: Differential pair routing test
  const r1_test12 = new Resistor();
  const r2_test12 = new Resistor();
  const r3_test12 = new Resistor();
  const r4_test12 = new Resistor();

  // Position test 12 components for differential pair routing
  r1_test12.pcb.x = 260;
  r1_test12.pcb.y = 20;
  r1_test12.pcb.rotation = 0;

  r2_test12.pcb.x = 290;
  r2_test12.pcb.y = 20;
  r2_test12.pcb.rotation = 0;

  r3_test12.pcb.x = 260;
  r3_test12.pcb.y = 35;
  r3_test12.pcb.rotation = 0;

  r4_test12.pcb.x = 290;
  r4_test12.pcb.y = 35;
  r4_test12.pcb.rotation = 0;

  // Create differential pair connections
  // Pair 1: r1 to r2 (differential pair)
  const test12_pos1 = typecad.named('test12_pos1').net(r1_test12.pin(1), r2_test12.pin(1));
  const test12_neg1 = typecad.named('test12_neg1').net(r1_test12.pin(2), r2_test12.pin(2));

  // Pair 2: r3 to r4 (differential pair)
  const test12_pos2 = typecad.named('test12_pos2').net(r3_test12.pin(1), r4_test12.pin(1));
  const test12_neg2 = typecad.named('test12_neg2').net(r3_test12.pin(2), r4_test12.pin(2));

  // Route differential pairs with controlled spacing and length matching
  const diffPair1 = typecad.route([test12_pos1, test12_neg1], {
    differential: true,
    width: 0.15,
    clearance: 0.2,
    gap: 0.2, // Spacing between differential pairs
    lengthMatch: {
      tolerance: 0.05, // Tighter tolerance for differential pairs
      pattern: { type: 'meander', amplitude: 0.2 },
      debug: true,
    },
  });

  const diffPair2 = typecad.route([test12_pos2, test12_neg2], {
    differential: true,
    width: 0.15,
    clearance: 0.2,
    gap: 0.2, // Spacing between differential pairs
    lengthMatch: {
      tolerance: 0.05, // Tighter tolerance for differential pairs
      pattern: { type: 'meander', amplitude: 0.2 },
      debug: true,
    },
  });

  // Return components for creation
  return [r1_test12, r2_test12, r3_test12, r4_test12];
}
