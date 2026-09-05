import { PCB, Component } from '@typecad/typecad';
import type { IAutorouteResult } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { Connector } from '@typecad/passives/connector';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

/**
 * Test 18: Multilayer feature coverage.
 *
 * Exercises everything the N-layer support added: the constructor layer set,
 * stackup material overrides, planes (with routing exclusion), middle-layer
 * routing for through-hole and SMD parts, net-class layer affinity,
 * impedance-controlled widths, keepouts on specific layers, the via
 * manufacturing policy (through vs blind/buried), and the validation
 * guardrails. Each check logs PASS/FAIL with a summary at the end.
 */
export function runTest18(typecad: PCB): Component[] {
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

  console.log('Test 18: multilayer features');

  // ── Layer set from the constructor ─────────────────────────────────
  check(
    'board declares 4 copper layers',
    typecad.layerCount === 4 && typecad.copperLayers.join(',') === 'F.Cu,In1.Cu,In2.Cu,B.Cu',
    typecad.copperLayers.join(','),
  );

  // ── Stackup material overrides ─────────────────────────────────────
  typecad.stackup(4, { layers: { 'dielectric 2': { thickness: 1.0, epsilon_r: 4.3 } } });
  const dielectric2 = typecad.stackupGeometry.dielectrics[1];
  check(
    'stackup override applied to dielectric 2',
    Math.abs(dielectric2.thicknessMm - 1.0) < 1e-6 && dielectric2.epsilonR === 4.3,
    `${dielectric2.thicknessMm}mm, er=${dielectric2.epsilonR}`,
  );
  const total =
    typecad.stackupGeometry.dielectrics.reduce((a, d) => a + d.thicknessMm, 0) +
    typecad.stackupGeometry.copperThicknessMm.reduce((a, b) => a + b, 0) +
    2 * typecad.stackupGeometry.maskThicknessMm;
  check('stackup still totals pcb.thickness (1.6mm)', Math.abs(total - 1.6) < 0.01, `${total.toFixed(3)}mm`);

  // ── Components ─────────────────────────────────────────────────────
  // Through-hole connectors (pads exist on every copper layer)
  const conn1 = new Connector({ number: 4 });
  const conn2 = new Connector({ number: 4 });
  const conn3 = new Connector({ number: 4 });
  const conn4 = new Connector({ number: 4 });
  // SMD resistors (pads only on F.Cu)
  const r1 = new Resistor();
  const r2 = new Resistor();

  conn1.pcb.x = 70;
  conn1.pcb.y = 65;
  conn1.pcb.rotation = 0;
  conn2.pcb.x = 95;
  conn2.pcb.y = 65;
  conn2.pcb.rotation = 180;
  conn3.pcb.x = 70;
  conn3.pcb.y = 30;
  conn3.pcb.rotation = 0;
  conn4.pcb.x = 95;
  conn4.pcb.y = 30;
  conn4.pcb.rotation = 180;
  r1.pcb.x = 60;
  r1.pcb.y = 72;
  r1.pcb.rotation = 0;
  r2.pcb.x = 80;
  r2.pcb.y = 72;
  r2.pcb.rotation = 0;
  [conn1, conn2, conn3, conn4, r1, r2].forEach((c, i) => {
    c.sch.x = 60 + (i % 3) * 10;
    c.sch.y = 30 + Math.floor(i / 3) * 10;
  });

  // pin 4 of conn3/conn4 is the GND net the plane ties into
  const gnd = typecad.named('GND').net(conn3.pin(4), conn4.pin(4));

  // ── Nets ───────────────────────────────────────────────────────────
  const netA = typecad.named('test18_a').net(conn1.pin(1), conn2.pin(1)); // explicit In1.Cu
  const netB = typecad.named('test18_b').net(conn1.pin(2), conn2.pin(2)); // net-class affinity -> In1.Cu
  const netC = typecad.named('test18_c').net(conn1.pin(3), conn2.pin(3)); // default layers, must avoid plane
  const netD = typecad.named('test18_d').net(conn1.pin(4), conn2.pin(4)); // impedance-controlled on F.Cu
  const netE = typecad.named('test18_e').net(r1.pin(1), r2.pin(1)); // SMD forced onto In1.Cu (through vias)
  const netF = typecad.named('test18_f').net(r1.pin(2), r2.pin(2)); // SMD forced onto In1.Cu (blind-buried)
  const netH = typecad.named('test18_h').net(conn3.pin(1), conn4.pin(1)); // keepout dodge

  // ── Outline + plane ────────────────────────────────────────────────
  // Size the outline to just cover the components of the tests on this
  // board — every component referenced by a schematic net (which includes
  // test 1's resistors), padded by a footprint-sized margin.
  const boardComponents = new Set<Component>();
  for (const node of (typecad.schematic as any).nodes ?? []) {
    for (const p of node.nodes ?? []) {
      if (p.owner) boardComponents.add(p.owner);
    }
  }
  const MARGIN = 6; // covers the largest footprint (4-pin pin header) plus edge clearance
  const positions = Array.from(boardComponents).map((c) => ({ x: c.pcb.x, y: c.pcb.y }));
  const minX = Math.min(...positions.map((p) => p.x)) - MARGIN;
  const maxX = Math.max(...positions.map((p) => p.x)) + MARGIN;
  const minY = Math.min(...positions.map((p) => p.y)) - MARGIN;
  const maxY = Math.max(...positions.map((p) => p.y)) + MARGIN;
  typecad.outline(minX, minY, maxX - minX, maxY - minY);
  check(
    'outline tightly covers all board components',
    positions.every((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY),
    `${(maxX - minX).toFixed(1)}x${(maxY - minY).toFixed(1)}mm for ${positions.length} components`,
  );

  try {
    typecad.plane('GND', 'In9.Cu');
    check('plane() rejects an undeclared layer', false);
  } catch {
    check('plane() rejects an undeclared layer', true);
  }
  typecad.plane('GND', 'In2.Cu');
  check('plane declared on In2.Cu', typecad.planeLayers.has('In2.Cu'));

  // ── Net-class layer affinity ───────────────────────────────────────
  try {
    typecad.netClass('bad18', { layers: ['In9.Cu'] });
    check('netClass() rejects undeclared preferred layers', false);
  } catch {
    check('netClass() rejects undeclared preferred layers', true);
  }
  typecad.netClass('inner18', { layers: ['In1.Cu'] });
  typecad.assign(netB, 'inner18');

  // ── Route-time validation ──────────────────────────────────────────
  try {
    typecad.route(netA, { layers: ['In9.Cu'] } as any);
    check('route() rejects undeclared routing layers', false);
  } catch (e) {
    check('route() rejects undeclared routing layers', e instanceof Error && /not declared/.test(e.message));
  }

  // ── Impedance helpers ──────────────────────────────────────────────
  const zWidth = typecad.impedanceWidth('F.Cu', 50);
  check('impedanceWidth returns a sane 50Ω microstrip width', zWidth > 0.1 && zWidth < 1.0, `${zWidth}mm`);
  try {
    typecad.impedanceWidth('F.Cu', 1);
    check('impedanceWidth rejects an unreachable target', false);
  } catch {
    check('impedanceWidth rejects an unreachable target', true);
  }

  // ── Keepout on F.Cu between conn3 and conn4 ────────────────────────
  typecad.keepout({ x: 78, y: 25, width: 8, height: 10, layers: ['F.Cu'] });

  // A plain (non-plane) zone on B.Cu, sized to just the GND-tied connectors
  const ZONE_MARGIN = 3;
  const gndXs = [conn3.pcb.x, conn4.pcb.x];
  const gndYs = [conn3.pcb.y, conn4.pcb.y];
  typecad.zone({
    net: 'GND',
    layers: ['B.Cu'],
    x: Math.min(...gndXs) - ZONE_MARGIN,
    y: Math.min(...gndYs) - ZONE_MARGIN,
    width: Math.max(...gndXs) - Math.min(...gndXs) + 2 * ZONE_MARGIN,
    height: Math.max(...gndYs) - Math.min(...gndYs) + 2 * ZONE_MARGIN,
  });

  // ── Routing ────────────────────────────────────────────────────────
  const opts = { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC };
  const layersUsed = (r: IAutorouteResult) => r.routeDetails.flatMap((rd) => rd.layers);
  const viaSpans = (r: IAutorouteResult): string[][] =>
    Array.from(r).flatMap((tb) =>
      tb
        .getElements()
        .filter((el) => el.type === 'via')
        .map((el) => (el.details as { layers?: string[] }).layers ?? []),
    );
  const trackWidths = (r: IAutorouteResult): number[] =>
    Array.from(r).flatMap((tb) =>
      tb
        .getElements()
        .map((el) => (el.details as { width?: number }).width)
        .filter((w): w is number => typeof w === 'number'),
    );

  // A: explicit middle layer, through-hole endpoints anchor there directly
  const resA = typecad.route(netA, { ...opts, layers: ['In1.Cu'] });
  check('A: through-hole net routed on In1.Cu', resA.success && layersUsed(resA).includes('In1.Cu'));
  check(
    'A: no vias needed (pads exist on every layer)',
    resA.routeDetails.every((rd) => rd.viaCount === 0),
  );

  // B: net-class affinity puts the net on In1.Cu without explicit layers
  const resB = typecad.route(netB, opts);
  check('B: net class pinned the route to In1.Cu', resB.success && layersUsed(resB).every((l) => l === 'In1.Cu'));

  // C: default routing must avoid the In2.Cu plane
  const resC = typecad.route(netC, opts);
  check('C: default route avoids the plane layer', resC.success && !layersUsed(resC).includes('In2.Cu'));

  // D: impedance control widens the trace
  const resD = typecad.route(netD, { ...opts, impedance: { target: 50, tolerance: 5 } });
  const widthsD = trackWidths(resD);
  check(
    'D: impedance route meets the computed width',
    resD.success && widthsD.length > 0 && Math.max(...widthsD) >= zWidth - 0.0015,
    `max ${widthsD.length ? Math.max(...widthsD) : 0}mm vs ${zWidth}mm`,
  );

  // E: SMD net forced to In1.Cu drops through vias (default policy)
  const resE = typecad.route(netE, { ...opts, layers: ['In1.Cu'] });
  const spansE = viaSpans(resE);
  check('E: SMD net reached In1.Cu', resE.success && layersUsed(resE).includes('In1.Cu'));
  check(
    'E: vias span F.Cu->B.Cu (through policy)',
    spansE.length >= 2 &&
      spansE.every((s) => (s[0] === 'F.Cu' && s[1] === 'B.Cu') || (s[0] === 'B.Cu' && s[1] === 'F.Cu')),
    JSON.stringify(spansE),
  );

  // F: same SMD situation under blind-buried policy uses the short span
  typecad.viaPolicy({ type: 'blind-buried' });
  const resF = typecad.route(netF, { ...opts, layers: ['In1.Cu'] });
  const spansF = viaSpans(resF);
  check(
    'F: blind-buried policy uses the F.Cu/In1.Cu pair',
    resF.success &&
      spansF.length >= 2 &&
      spansF.every((s) => (s[0] === 'F.Cu' && s[1] === 'In1.Cu') || (s[0] === 'In1.Cu' && s[1] === 'F.Cu')),
    JSON.stringify(spansF),
  );
  typecad.viaPolicy({ type: 'through' }); // restore the default for anything routed later

  // H: keepout on F.Cu between the connectors — route must still succeed
  const resH = typecad.route(netH, opts);
  check('H: keepout dodged, route succeeded', resH.success);

  // Plane zone materialization needs create(); the zone for In2.Cu is
  // written with the board. (Verified in build/autoroute_test.kicad_pcb.)

  console.log(`Test 18 result: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Test 18 FAILED');
  }

  return [conn1, conn2, conn3, conn4, r1, r2];
}
