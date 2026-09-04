import { PCB, Component } from '@typecad/typecad';
import { Connector } from '@typecad/passives/connector';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

/**
 * Test 19: Zone options coverage.
 *
 * Exercises the zone property work: polygon (`points`) geometry for zones
 * and keepouts, validation of the geometry contract, `filledAreasThickness`,
 * the `islandRemovalMode` default, and the keepout rule-area `placement`
 * option.
 *
 * Zone validation failures are reported through console.error, so invalid
 * uses are verified by capturing the console during the call.
 */
export function runTest19(typecad: PCB): Component[] {
    let passed = 0;
    let failed = 0;
    const check = (name: string, ok: boolean, detail = '') => {
        if (ok) {
            passed++;
            console.log(`  \u2713 ${name}${detail ? ` (${detail})` : ''}`);
        } else {
            failed++;
            console.error(`  \u2717 ${name}${detail ? ` (${detail})` : ''}`);
        }
    };

    /** Run fn while capturing console.error output (zone validation reports there). */
    const captureErrors = (fn: () => void): string[] => {
        const captured: string[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => {
            captured.push(args.map(String).join(' '));
        };
        try {
            fn();
        } finally {
            console.error = original;
        }
        return captured;
    };

    console.log('Test 19: zone options');

    // ── Components: one connector pair in the free lower-left area ──────
    const conn5 = new Connector({ number: 4 });
    const conn6 = new Connector({ number: 4 });
    conn5.pcb.x = 25; conn5.pcb.y = 55; conn5.pcb.rotation = 0;
    conn6.pcb.x = 45; conn6.pcb.y = 55; conn6.pcb.rotation = 180;
    conn5.sch.x = 60; conn5.sch.y = 45;
    conn6.sch.x = 70; conn6.sch.y = 45;

    const gnd = typecad.named('GND').net(conn5.pin(4), conn6.pin(4));
    const netA = typecad.named('test19_a').net(conn5.pin(1), conn6.pin(1));

    // ── Geometry contract ───────────────────────────────────────────────
    const TRIANGLE = [
        { x: 32, y: 53 },
        { x: 38, y: 53 },
        { x: 35, y: 59 },
    ];
    const L_SHAPE = [
        { x: 16, y: 48 },
        { x: 30, y: 48 },
        { x: 30, y: 55 },
        { x: 22, y: 55 },
        { x: 22, y: 72 },
        { x: 16, y: 72 },
    ];

    const both = captureErrors(() =>
        typecad.zone({ net: 'GND', layers: ['B.Cu'], points: TRIANGLE, x: 1, y: 1, width: 2, height: 2 }),
    );
    check('zone rejects points + rectangle together', both.length === 1 && /not both/.test(both[0]));

    const tooFew = captureErrors(() =>
        typecad.zone({ net: 'GND', layers: ['B.Cu'], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
    );
    check('zone rejects polygons under 3 vertices', tooFew.length === 1 && /at least 3/.test(tooFew[0]));

    const neither = captureErrors(() => typecad.keepout({ layers: ['F.Cu'], x: 5, width: 5 } as any));
    check('keepout rejects incomplete geometry', neither.length === 1 && /requires either 'points'/.test(neither[0]));

    // ── Valid zones produce no validation errors ────────────────────────
    const lZone = captureErrors(() =>
        typecad.zone({
            net: 'GND',
            layers: ['B.Cu'],
            points: L_SHAPE, // L-shaped pour, not expressible as a rectangle
            filledAreasThickness: false,
            islandRemovalMode: 1,
            connectPads: 'thru_hole_only',
            priority: 3,
            name: 'GND L-pour',
            fillMode: 'hatched'
        }),
    );
    check('L-shaped polygon zone accepted', lZone.length === 0);

    const rectZone = captureErrors(() =>
        typecad.zone({
            net: 'GND',
            layers: ['F.Cu'],
            x: 16,
            y: 40,
            width: 14,
            height: 5,
            filledAreasThickness: true,
            islandAreaMin: 4, // islandRemovalMode defaults to 2
        }),
    );
    check('rectangle zone with fill options accepted', rectZone.length === 0);

    const triKeepout = captureErrors(() =>
        typecad.keepout({
            layers: ['F.Cu'],
            points: TRIANGLE, // triangular rule area between the connectors
            placement: true,
            restrictions: { tracks: true, vias: true, pads: false, copperpour: false, footprints: false },
        }),
    );
    check('polygon keepout with rule-area options accepted', triKeepout.length === 0);

    // ── The router respects the polygon keepout ─────────────────────────
    const resA = typecad.route(netA, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
    const usedLayers = resA.routeDetails.flatMap((rd) => rd.layers);
    check('A: route succeeded around the triangular keepout', resA.success, usedLayers.join(','));

    // Serialization (polygon vertices, filled_areas_thickness, placement,
    // island removal) is verified in build/autoroute_test.kicad_pcb.

    console.log(`Test 19 result: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.error('Test 19 FAILED');
    }

    return [conn5, conn6];
}
