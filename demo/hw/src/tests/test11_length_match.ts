import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION } from '../autoroute_test';

// Export function that accepts the main typecad object
export function runTest11(typecad: PCB): Component[] {
    // Test 11: Length matching test with sawtooth pattern
    const r1_test11 = new Resistor();
    const r2_test11 = new Resistor();

    // Position test 11 components for length matching
    r1_test11.pcb.x = 210;
    r1_test11.pcb.y = 20;
    r1_test11.pcb.rotation = 0;

    r2_test11.pcb.x = 240;
    r2_test11.pcb.y = 20;
    r2_test11.pcb.rotation = 90;

    // Create connections for length matching
    const test11_1 = typecad.named('test11_1').net(r1_test11.pin(1), r2_test11.pin(1));
    const test11_2 = typecad.named('test11_2').net(r1_test11.pin(2), r2_test11.pin(2));

    // typecad.route(test11_1, {
    //     gridResolution: RESOLUTION,
    //     heuristicWeight: 2,
    // });

    // typecad.route(test11_2, {
    //     gridResolution: RESOLUTION,
    //     heuristicWeight: 2,
    // });

    // Route with length matching
const r = typecad.route({
    debug: true,
    heuristicWeight: 2,
    gridResolution: RESOLUTION,
    from: [r1_test11.pin(1), r1_test11.pin(2)],
    to: [r2_test11.pin(1), r2_test11.pin(2)],
    lengthMatch: { 
        tolerance: 0.1,  // More generous tolerance
        pattern: { type: 'sawtooth'}, 
        debug: true,
        minStraightSegment: 0.1
    }
});
    console.log('test11_1 length match result:', r);

    // typecad.route(test11_1, {waypoints: [{x: 213, y: 20}, {x: 238, y: 20}]});
    // typecad.route(test11_2, {waypoints: [{x: 212.4454, y: 19.605262}, {x: 237.856832, y: 19.605262}]});

    // Return components for creation
    return [r1_test11, r2_test11];
}
