import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest10(typecad: PCB): Component[] {
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
  const test10_1 = typecad.named('test10_1').net(r1_test10.pin(1), r2_test10.pin(1));
  const test10_2 = typecad.named('test10_2').net(r1_test10.pin(2), r2_test10.pin(2));
  const test10_3 = typecad.named('test10_3').net(r3_test10.pin(1), r4_test10.pin(1));
  const test10_4 = typecad.named('test10_4').net(r3_test10.pin(2), r4_test10.pin(2));

  // Define keepout area globally
  typecad.keepout({ x: 170, y: 15, width: 10, height: 20, layers: ['F.Cu'] });

  // Route with keepout area in the middle (coordinates represent a restricted area)
  typecad.route(test10_1);

  typecad.route(test10_2);

  typecad.route(test10_3, {
    debug: true,
  });

  typecad.route(test10_4);

  // Return components for creation
  return [r1_test10, r2_test10, r3_test10, r4_test10];
}
