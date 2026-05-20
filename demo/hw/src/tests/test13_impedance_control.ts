import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest13(typecad: PCB): Component[] {
    // Test 13: Controlled impedance routing test
        const r1_test1 = new Resistor();
        const r2_test1 = new Resistor();
        const r3_test1 = new Resistor();

        // Position test 1 components in upper-left area
        r1_test1.pcb.x = 20;
        r1_test1.pcb.y = 20;
        r1_test1.pcb.rotation = 90; // 90 degrees
        r2_test1.pcb.x = 26;
        r2_test1.pcb.y = 20;
        r2_test1.pcb.rotation = 90; // 90 degrees

        r1_test1.sch.x = 20;
        r1_test1.sch.y = 20;
        r2_test1.sch.x = 26;
        r2_test1.sch.y = 20;

        r3_test1.sch.x = 20;
        r3_test1.sch.y = 30;
        r3_test1.pcb.x = 20;
        r3_test1.pcb.y = 30;

        // Create connections for Test 1 - connect r1's pin 1 to r2's pin 1 and r1's pin 2 to r2's pin 2
        const test1_1 = typecad.named('test1_1').net(r1_test1.pin(1), r2_test1.pin(1), r3_test1.pin(1));

        typecad.route(test1_1);

    // Return components for creation
    return [r1_test1, r2_test1, r3_test1];
}
