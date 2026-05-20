import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { Connector } from '@typecad/passives/connector';
import { RESOLUTION } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest6(typecad: PCB): Component[] {
    // Test 6: Complex connector routing
    const conn1_test6 = new Connector({ number: 6 });
    const conn2_test6 = new Connector({ number: 6 });
    const r1_test6 = new Resistor();
    const r2_test6 = new Resistor();
    const r3_test6 = new Resistor();

    // Position components for Test 6
    conn1_test6.pcb.x = 55;
    conn1_test6.pcb.y = 50;
    conn1_test6.pcb.rotation = 0;

    conn2_test6.pcb.x = 75;
    conn2_test6.pcb.y = 50;
    conn2_test6.pcb.rotation = 90;

    r1_test6.pcb.x = 65;
    r1_test6.pcb.y = 45;
    r1_test6.pcb.rotation = 0;

    r2_test6.pcb.x = 65;
    r2_test6.pcb.y = 50;
    r2_test6.pcb.rotation = 45;

    r3_test6.pcb.x = 65;
    r3_test6.pcb.y = 55;
    r3_test6.pcb.rotation = 90;

    // Create complex routing for Test 6
    const test6_1 = typecad.named('test6_1').net(conn1_test6.pin(1), r1_test6.pin(1));
    const test6_2 = typecad.named('test6_2').net(r1_test6.pin(2), conn2_test6.pin(1));
    const test6_3 = typecad.named('test6_3').net(conn1_test6.pin(2), r2_test6.pin(1));
    const test6_4 = typecad.named('test6_4').net(r2_test6.pin(2), conn2_test6.pin(2));
    const test6_5 = typecad.named('test6_5').net(conn1_test6.pin(3), r3_test6.pin(1));
    const test6_6 = typecad.named('test6_6').net(r3_test6.pin(2), conn2_test6.pin(3));
    const test6_7 = typecad.named('test6_7').net(conn1_test6.pin(4), conn2_test6.pin(4));  // Cross-layer connection
    const test6_8 = typecad.named('test6_8').net(conn1_test6.pin(5), conn2_test6.pin(5));  // Cross-layer connection
    const test6_9 = typecad.named('test6_9').net(conn1_test6.pin(6), conn2_test6.pin(6));  // Cross-layer connection

    typecad.route(test6_1);
    typecad.route(test6_2);
    typecad.route(test6_3);
    typecad.route(test6_4);
    typecad.route(test6_5);
    typecad.route(test6_6);
    typecad.route(test6_7);
    typecad.route(test6_8);
    typecad.route(test6_9);

    // Return components for creation
    return [conn1_test6, conn2_test6, r1_test6, r2_test6, r3_test6];
}
