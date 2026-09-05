import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { Connector } from '@typecad/passives/connector';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest5(typecad: PCB): Component[] {
  // Test 5: Multi-layer routing test with connectors
  const conn1_test5 = new Connector({ number: 4 });
  const conn2_test5 = new Connector({ number: 4 });
  const r1_test5 = new Resistor();
  const r2_test5 = new Resistor();

  // Position components for Test 5
  conn1_test5.pcb.x = 20;
  conn1_test5.pcb.y = 50;
  conn1_test5.pcb.rotation = 0;

  conn2_test5.pcb.x = 40;
  conn2_test5.pcb.y = 57;
  conn2_test5.pcb.rotation = 180;

  r1_test5.pcb.x = 30;
  r1_test5.pcb.y = 45;
  r1_test5.pcb.rotation = 90;

  r2_test5.pcb.x = 30;
  r2_test5.pcb.y = 55;
  r2_test5.pcb.rotation = 90;

  // Create multi-layer connections for Test 5
  const test5_1 = typecad.named('test5_1').net(conn1_test5.pin(1), r1_test5.pin(1));
  const test5_2 = typecad.named('test5_2').net(r1_test5.pin(2), conn2_test5.pin(1));
  const test5_3 = typecad.named('test5_3').net(conn1_test5.pin(2), r2_test5.pin(1));
  const test5_4 = typecad.named('test5_4').net(r2_test5.pin(2), conn2_test5.pin(2));
  const test5_5 = typecad.named('test5_5').net(conn1_test5.pin(3), conn2_test5.pin(3)); // Direct connection for layer crossing

  typecad.route(test5_1, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test5_2, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test5_3, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test5_4, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test5_5, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });

  // Return components for creation
  return [conn1_test5, conn2_test5, r1_test5, r2_test5];
}
