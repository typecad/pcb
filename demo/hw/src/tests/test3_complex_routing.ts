import { PCB, Component, Resistor } from '@typecad/pcb';

import { RESOLUTION, HEURISTIC } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest3(typecad: PCB): Component[] {
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
  const test3_1 = typecad.named('test3_1').net(r1_test3.pin(2), r2_test3.pin(1));
  const test3_2 = typecad.named('test3_2').net(r2_test3.pin(2), r3_test3.pin(1));
  const test3_3 = typecad.named('test3_3').net(r3_test3.pin(2), r4_test3.pin(1));
  const test3_4 = typecad.named('test3_4').net(r4_test3.pin(2), r1_test3.pin(1));

  typecad.route(test3_1, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test3_2, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test3_3, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test3_4, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });

  // Return components for creation
  return [r1_test3, r2_test3, r3_test3, r4_test3];
}
