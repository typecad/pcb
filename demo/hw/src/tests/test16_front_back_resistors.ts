import { PCB, Component } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { RESOLUTION, HEURISTIC } from '../autoroute_test';

export function runTest16(typecad: PCB): Component[] {
  const r1_front = new Resistor();
  const r2_back = new Resistor();

  r1_front.pcb.x = 20;
  r1_front.pcb.y = 120;
  r1_front.pcb.rotation = 0;
  r1_front.pcb.side = 'front';

  r2_back.pcb.x = 20;
  r2_back.pcb.y = 126;
  r2_back.pcb.rotation = 0;
  r2_back.pcb.side = 'back';

  r1_front.sch.x = 20;
  r1_front.sch.y = 120;
  r2_back.sch.x = 26;
  r2_back.sch.y = 120;

  const test16_1 = typecad.named('test16_1').net(r1_front.pin(1), r2_back.pin(1));
  const test16_2 = typecad.named('test16_2').net(r1_front.pin(2), r2_back.pin(2));

  typecad.route(test16_1, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });
  typecad.route(test16_2, { gridResolution: RESOLUTION, heuristicWeight: HEURISTIC });

  return [r1_front, r2_back];
}
