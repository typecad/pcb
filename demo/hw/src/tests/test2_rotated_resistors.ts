import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest2(typecad: PCB): Component[] {
    // Test 2: Two resistors, one at -90 degrees and one at 90 degrees (middle area)
    const r1_test2 = new Resistor();
    const r2_test2 = new Resistor();

    // Position test 2 components in middle area
    r1_test2.pcb.x = 40;
    r1_test2.pcb.y = 20;
    r1_test2.pcb.rotation = -90; // -90 degrees
    r2_test2.pcb.x = 46;
    r2_test2.pcb.y = 20;
    r2_test2.pcb.rotation = 90; // 90 degrees - this forces a more complex routing

    // schematic symol locations
    r1_test2.sch.x = 40;
    r1_test2.sch.y = 20;
    // r1_test2.sch.rotation = -90; // -90 degrees
    r2_test2.sch.x = 46;
    r2_test2.sch.y = 20;
    
    // r2_test2.sch.rotation = 90; // 90 degrees - this forces a more complex routing
    // Create connections for Test 2 - this will require routing around the 90-degree rotation
    const test2_1 = typecad.named('test2_1').net(r1_test2.pin(1), r2_test2.pin(1));
    const test2_2 = typecad.named('test2_2').net(r1_test2.pin(2), r2_test2.pin(2));

    typecad.route(test2_1, {gridResolution: RESOLUTION, heuristicWeight: HEURISTIC});
    typecad.route(test2_2, {gridResolution: RESOLUTION, heuristicWeight: HEURISTIC});

    // Return components for creation
    return [r1_test2, r2_test2];
}
