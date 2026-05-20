import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { Connector } from '@typecad/passives/connector';
import { RESOLUTION } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest7(typecad: PCB): Component[] {
    // Test 7: Dense connector array
    const conn1_test7 = new Connector({ number: 8 });
    const conn2_test7 = new Connector({ number: 8 });
    const r1_test7 = new Resistor();
    const r2_test7 = new Resistor();
    const r3_test7 = new Resistor();
    const r4_test7 = new Resistor();

    // Position components for Test 7
    conn1_test7.pcb.x = 90;
    conn1_test7.pcb.y = 50;
    conn1_test7.pcb.rotation = 0;

    conn2_test7.pcb.x = 115;
    conn2_test7.pcb.y = 50;
    conn2_test7.pcb.rotation = 180;

    r1_test7.pcb.x = 97;
    r1_test7.pcb.y = 45;
    r1_test7.pcb.rotation = 0;

    r2_test7.pcb.x = 102;
    r2_test7.pcb.y = 45;
    r2_test7.pcb.rotation = 45;

    r3_test7.pcb.x = 102;
    r3_test7.pcb.y = 55;
    r3_test7.pcb.rotation = 90;

    r4_test7.pcb.x = 108;
    r4_test7.pcb.y = 55;
    r4_test7.pcb.rotation = 180;

    // Create dense routing for Test 7
    const test7_1 = typecad.named('test7_1').net(conn1_test7.pin(1), r1_test7.pin(1));
    const test7_2 = typecad.named('test7_2').net(r1_test7.pin(2), conn2_test7.pin(1));
    const test7_3 = typecad.named('test7_3').net(conn1_test7.pin(2), r2_test7.pin(1));
    const test7_4 = typecad.named('test7_4').net(r2_test7.pin(2), conn2_test7.pin(2));
    const test7_5 = typecad.named('test7_5').net(conn1_test7.pin(3), r3_test7.pin(1));
    const test7_6 = typecad.named('test7_6').net(r3_test7.pin(2), conn2_test7.pin(3));
    const test7_7 = typecad.named('test7_7').net(conn1_test7.pin(4), r4_test7.pin(1));
    const test7_8 = typecad.named('test7_8').net(r4_test7.pin(2), conn2_test7.pin(4));
    const test7_9 = typecad.named('test7_9').net(conn1_test7.pin(5), conn2_test7.pin(5));  // Direct connections
    const test7_10 = typecad.named('test7_10').net(conn1_test7.pin(6), conn2_test7.pin(6));
    const test7_11 = typecad.named('test7_11').net(conn1_test7.pin(7), conn2_test7.pin(7));
    const test7_12 = typecad.named('test7_12').net(conn1_test7.pin(8), conn2_test7.pin(8));

    typecad.route(test7_1);
    typecad.route(test7_2);
    typecad.route(test7_3);
    typecad.route(test7_4);
    typecad.route(test7_5);
    typecad.route(test7_6);
    typecad.route(test7_7);
    typecad.route(test7_8);
    typecad.route(test7_9);
    typecad.route(test7_10);
    typecad.route(test7_11);
    typecad.route(test7_12);

    // Return components for creation
    return [conn1_test7, conn2_test7, r1_test7, r2_test7, r3_test7, r4_test7];
}
