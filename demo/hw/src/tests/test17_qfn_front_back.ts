import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { HEURISTIC } from '../autoroute_test';

export function runTest17(typecad: PCB): Component[] {
  const qfn = new Component({
    footprint: 'Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.3x5.3mm',
  });

  const r1 = new Resistor();
  const r2 = new Resistor();
  const r3 = new Resistor();
  const r4 = new Resistor();
  const r5 = new Resistor();
  const r6 = new Resistor();
  const r7 = new Resistor();
  const r8 = new Resistor();

  qfn.pcb.x = 70;
  qfn.pcb.y = 70;
  qfn.pcb.rotation = 0;
  qfn.pcb.side = 'front';

  r1.pcb.x = 55;
  r1.pcb.y = 60;
  r1.pcb.rotation = 0;
  r1.pcb.side = 'front';

  r2.pcb.x = 55;
  r2.pcb.y = 70;
  r2.pcb.rotation = 0;
  r2.pcb.side = 'front';

  r3.pcb.x = 55;
  r3.pcb.y = 80;
  r3.pcb.rotation = 0;
  r3.pcb.side = 'front';

  r4.pcb.x = 85;
  r4.pcb.y = 60;
  r4.pcb.rotation = 0;
  r4.pcb.side = 'back';

  r5.pcb.x = 85;
  r5.pcb.y = 70;
  r5.pcb.rotation = 0;
  r5.pcb.side = 'back';

  r6.pcb.x = 85;
  r6.pcb.y = 80;
  r6.pcb.rotation = 0;
  r6.pcb.side = 'back';

  r7.pcb.x = 70;
  r7.pcb.y = 55;
  r7.pcb.rotation = 90;
  r7.pcb.side = 'back';

  r8.pcb.x = 70;
  r8.pcb.y = 85;
  r8.pcb.rotation = 90;
  r8.pcb.side = 'front';

  qfn.sch.x = 70;
  qfn.sch.y = 70;

  r1.sch.x = 55;
  r1.sch.y = 60;

  r2.sch.x = 55;
  r2.sch.y = 70;

  r3.sch.x = 55;
  r3.sch.y = 80;

  r4.sch.x = 85;
  r4.sch.y = 60;

  r5.sch.x = 85;
  r5.sch.y = 70;

  r6.sch.x = 85;
  r6.sch.y = 80;

  r7.sch.x = 70;
  r7.sch.y = 55;

  r8.sch.x = 70;
  r8.sch.y = 85;

  const n1 = typecad.named('test17_1').net(qfn.pin(1), r1.pin(1));
  const n2 = typecad.named('test17_2').net(qfn.pin(6), r2.pin(1));
  const n3 = typecad.named('test17_3').net(qfn.pin(12), r3.pin(1));
  const n4 = typecad.named('test17_4').net(qfn.pin(13), r4.pin(1));
  const n5 = typecad.named('test17_5').net(qfn.pin(18), r5.pin(1));
  const n6 = typecad.named('test17_6').net(qfn.pin(24), r6.pin(1));
  const n7 = typecad.named('test17_7').net(qfn.pin(36), r7.pin(1));
  const n8 = typecad.named('test17_8').net(qfn.pin(42), r8.pin(1));
  const n9 = typecad.named('test17_9').net(r1.pin(2), r6.pin(2));
  const n10 = typecad.named('test17_10').net(r2.pin(2), r5.pin(2));
  const n11 = typecad.named('test17_11').net(r3.pin(2), r4.pin(2));
  const n12 = typecad.named('test17_12').net(r7.pin(2), r8.pin(2));

  // 0.5mm-pitch QFN escapes need fine-pitch rules: 0.2mm traces at 0.2mm
  // clearance cannot physically fit between 0.5mm-pitch pads, so route with
  // 0.15mm traces at 0.1mm clearance on a finer grid.
  const fine = { gridResolution: 0.05, width: 0.15, clearance: 0.1, heuristicWeight: HEURISTIC };

  typecad.route(n1, fine);
  typecad.route(n2, fine);
  typecad.route(n3, fine);
  typecad.route(n4, fine);
  typecad.route(n5, fine);
  typecad.route(n6, fine);
  typecad.route(n7, fine);
  typecad.route(n8, fine);
  typecad.route(n9, fine);
  typecad.route(n10, fine);
  typecad.route(n11, fine);
  typecad.route(n12, fine);

  return [qfn, r1, r2, r3, r4, r5, r6, r7, r8];
}
