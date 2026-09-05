import { PCB, Component } from '@typecad/typecad';
import { RESOLUTION } from '../autoroute_test';
import { Resistor } from '@typecad/passives/0603';
import { Connector } from '@typecad/passives/connector';

// Export function that accepts the main typecad object
export function runTest8(typecad: PCB): Component[] {
  // Test 8: Multi-layer connector maze
  const conn1_test8 = new Connector({ number: 12 });
  const conn2_test8 = new Connector({ number: 12 });
  const r1_test8 = new Resistor();
  const r2_test8 = new Resistor();
  const r3_test8 = new Resistor();
  const r4_test8 = new Resistor();
  const r5_test8 = new Resistor();
  const r6_test8 = new Resistor();

  // Position components for Test 8
  conn1_test8.pcb.x = 130;
  conn1_test8.pcb.y = 50;
  conn1_test8.pcb.rotation = 0;

  conn2_test8.pcb.x = 150;
  conn2_test8.pcb.y = 50;
  conn2_test8.pcb.rotation = 180;

  r1_test8.pcb.x = 135;
  r1_test8.pcb.y = 45;
  r1_test8.pcb.rotation = 0;

  r2_test8.pcb.x = 140;
  r2_test8.pcb.y = 45;
  r2_test8.pcb.rotation = 30;

  r3_test8.pcb.x = 145;
  r3_test8.pcb.y = 45;
  r3_test8.pcb.rotation = 60;

  r4_test8.pcb.x = 135;
  r4_test8.pcb.y = 55;
  r4_test8.pcb.rotation = 120;

  r5_test8.pcb.x = 140;
  r5_test8.pcb.y = 55;
  r5_test8.pcb.rotation = 150;

  r6_test8.pcb.x = 145;
  r6_test8.pcb.y = 55;
  r6_test8.pcb.rotation = 180;

  // Create complex multi-layer routing for Test 8
  const test8_1 = typecad.named('test8_1').net(conn1_test8.pin(1), r1_test8.pin(1));
  const test8_2 = typecad.named('test8_2').net(r1_test8.pin(2), conn2_test8.pin(1));
  const test8_3 = typecad.named('test8_3').net(conn1_test8.pin(2), r2_test8.pin(1));
  const test8_4 = typecad.named('test8_4').net(r2_test8.pin(2), conn2_test8.pin(2));
  const test8_5 = typecad.named('test8_5').net(conn1_test8.pin(3), r3_test8.pin(1));
  const test8_6 = typecad.named('test8_6').net(r3_test8.pin(2), conn2_test8.pin(3));
  const test8_7 = typecad.named('test8_7').net(conn1_test8.pin(4), r4_test8.pin(1));
  const test8_8 = typecad.named('test8_8').net(r4_test8.pin(2), conn2_test8.pin(4));
  const test8_9 = typecad.named('test8_9').net(conn1_test8.pin(5), r5_test8.pin(1));
  const test8_10 = typecad.named('test8_10').net(r5_test8.pin(2), conn2_test8.pin(5));
  const test8_11 = typecad.named('test8_11').net(conn1_test8.pin(6), r6_test8.pin(1));
  const test8_12 = typecad.named('test8_12').net(r6_test8.pin(2), conn2_test8.pin(6));
  const test8_13 = typecad.named('test8_13').net(conn1_test8.pin(7), conn2_test8.pin(7)); // Direct cross-layer
  const test8_14 = typecad.named('test8_14').net(conn1_test8.pin(8), conn2_test8.pin(8));
  const test8_15 = typecad.named('test8_15').net(conn1_test8.pin(9), conn2_test8.pin(9));
  const test8_16 = typecad.named('test8_16').net(conn1_test8.pin(10), conn2_test8.pin(10));
  const test8_17 = typecad.named('test8_17').net(conn1_test8.pin(11), conn2_test8.pin(11));
  const test8_18 = typecad.named('test8_18').net(conn1_test8.pin(12), conn2_test8.pin(12));

  const hw = 2;
  typecad.route(test8_17, { gridResolution: RESOLUTION });
  typecad.route(test8_18, { gridResolution: RESOLUTION });
  typecad.route(test8_1);
  typecad.route(test8_2);
  typecad.route(test8_3);
  typecad.route(test8_4);
  typecad.route(test8_5);
  typecad.route(test8_6);
  typecad.route(test8_7);
  typecad.route(test8_8);
  typecad.route(test8_9);
  typecad.route(test8_10);
  typecad.route(test8_11);
  typecad.route(test8_12);
  typecad.route(test8_13);
  typecad.route(test8_14);
  typecad.route(test8_15);
  typecad.route(test8_16);

  // Return components for creation
  return [conn1_test8, conn2_test8, r1_test8, r2_test8, r3_test8, r4_test8, r5_test8, r6_test8];
}
