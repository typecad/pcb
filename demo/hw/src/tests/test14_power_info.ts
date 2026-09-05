import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest14(typecad: PCB): Component[] {
  // Test 1: Two resistors placed apart with terminals connected (positioned around 20, 20)
  const r1_test1 = new Resistor();
  const r2_test1 = new Resistor();

  // create powerInfo object
  r1_test1.pin(1).powerInfo = {
    current: 1.5,
  };
  // Position test 1 components in upper-left area
  r1_test1.pcb.x = 20;
  r1_test1.pcb.y = 20;
  r1_test1.pcb.rotation = 90; // 90 degrees
  r2_test1.pcb.x = 26;
  r2_test1.pcb.y = 20;
  r2_test1.pcb.rotation = 90; // 90 degrees

  // Create connections for Test 1 - connect r1's pin 1 to r2's pin 1 and r1's pin 2 to r2's pin 2
  const test1_1 = typecad.named('test1_1').net(r1_test1.pin(1), r2_test1.pin(1));
  const test1_2 = typecad.named('test1_2').net(r1_test1.pin(2), r2_test1.pin(2));

  typecad.route(test1_1, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test1_2, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });

  // Return components for creation
  return [r1_test1, r2_test1];
}
