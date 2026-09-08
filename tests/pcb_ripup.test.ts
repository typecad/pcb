import { describe, it, expect, beforeEach } from 'vitest';
import { PCB, Component } from '../src/index.js';
import { withRipup } from '../src/pcb/pcb_ripup.js';
import type { IAutorouteResult } from '../src/index.js';

class Header4 extends Component {
  constructor() {
    super('Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical');
  }
}

function stagedNets(pcb: PCB): Set<string> {
  const state = (pcb as unknown as { _state: { stagedOutlines: { elements: { net?: string }[] }[] } })._state;
  const nets = new Set<string>();
  for (const outline of state.stagedOutlines) {
    for (const el of outline.elements) {
      if (el.net) nets.add(el.net);
    }
  }
  return nets;
}

function failedResult(blockedBy: string[]): IAutorouteResult {
  return Object.assign([], {
    success: false,
    routeCount: 1,
    completedCount: 0,
    routeDetails: [
      {
        length: 0,
        viaCount: 0,
        layers: [],
        success: false,
        error: 'No path found',
        path: { nodes: [], length: 0, viaCount: 0, success: false, blockedBy },
      },
    ],
  }) as unknown as IAutorouteResult;
}

const succeededResult: IAutorouteResult = Object.assign([], {
  success: true,
  routeCount: 1,
  completedCount: 1,
  routeDetails: [
    {
      length: 20,
      viaCount: 0,
      layers: ['F.Cu'],
      success: true,
      path: { nodes: [], length: 20, viaCount: 0, success: true },
    },
  ],
}) as unknown as IAutorouteResult;

/**
 * Rip-up-and-reroute: when a route is blocked by nets the router itself
 * staged, those nets are ripped, the victim re-routes, and the ripped nets
 * are re-routed — with rollback unless the outcome improves.
 */
describe('pcb rip-up-and-reroute', () => {
  let pcb: PCB;

  beforeEach(() => {
    pcb = new PCB('test_ripup', { layers: 2 });
  });

  it('rips the blocking net, re-routes the victim, and re-routes the blocker', () => {
    const j1 = new Header4();
    const j2 = new Header4();
    j1.pcb.x = 20;
    j1.pcb.y = 20;
    j2.pcb.x = 40;
    j2.pcb.y = 20;
    pcb.add(j1, j2);
    pcb.outline(10, 10, 40, 20);
    const netA = pcb.named('net_a').net(j1.pin(1), j2.pin(1));
    const pinsB = [j1.pin(4), j2.pin(4)];

    // net_a routes normally and is registered as router-staged.
    expect(pcb.route(netA, { ripup: false }).success).toBe(true);
    expect(stagedNets(pcb).has('net_a')).toBe(true);

    let call = 0;
    const result = withRipup(
      pcb,
      () => {
        call++;
        // The victim fails while net_a is staged; once net_a is ripped the
        // (mocked) re-route succeeds — exactly what the real router does
        // when its blocker's copper is gone.
        if (call === 1) return failedResult(['net_a']);
        expect(stagedNets(pcb).has('net_a')).toBe(false);
        return succeededResult;
      },
      {},
      pinsB,
      "'net_b'",
    );

    expect(result.success).toBe(true);
    expect(call).toBe(2);
    // net_a was re-routed after the victim — its copper is back.
    expect(stagedNets(pcb).has('net_a')).toBe(true);
  });

  it('rolls back when the rip-up attempt does not improve the outcome', () => {
    const j1 = new Header4();
    const j2 = new Header4();
    j1.pcb.x = 20;
    j1.pcb.y = 20;
    j2.pcb.x = 40;
    j2.pcb.y = 20;
    pcb.add(j1, j2);
    pcb.outline(10, 10, 40, 20);
    const netA = pcb.named('net_a').net(j1.pin(1), j2.pin(1));
    const pinsB = [j1.pin(4), j2.pin(4)];

    expect(pcb.route(netA, { ripup: false }).success).toBe(true);
    const tracksBefore = (pcb as unknown as { _state: { stagedOutlines: unknown[] } })._state.stagedOutlines.length;

    const result = withRipup(
      pcb,
      // The victim keeps failing even after the rip-up.
      () => failedResult(['net_a']),
      {},
      pinsB,
      "'net_b'",
    );

    expect(result.success).toBe(false);
    // net_a's routes were restored by the rollback.
    expect(stagedNets(pcb).has('net_a')).toBe(true);
    const state = (pcb as unknown as { _state: { stagedOutlines: unknown[] } })._state;
    expect(state.stagedOutlines.length).toBe(tracksBefore);
  });

  it('rescues a congested-but-successful route end to end (quality trigger)', () => {
    // net_a routes first as a near-full-width wall on F.Cu. net_b must cross
    // it vertically: without rip-up it detours around the wall (~36mm for a
    // 10mm span); with rip-up the router tears out the wall, routes net_b
    // straight through, and re-routes net_a around it.
    const build = () => {
      const board = new PCB('test_ripup_quality', { layers: 2 });
      const aL = new Header4();
      aL.pcb.x = 16;
      aL.pcb.y = 15;
      aL.pcb.rotation = 90;
      const aR = new Header4();
      aR.pcb.x = 44;
      aR.pcb.y = 15;
      aR.pcb.rotation = 90;
      const bT = new Header4();
      bT.pcb.x = 30;
      bT.pcb.y = 9;
      bT.pcb.rotation = 90;
      const bB = new Header4();
      bB.pcb.x = 30;
      bB.pcb.y = 19;
      bB.pcb.rotation = 90;
      board.add(aL, aR, bT, bB);
      board.outline(8, 4, 44, 22);
      const netA = board.named('net_a').net(aL.pin(1), aR.pin(1));
      const netB = board.named('net_b').net(bT.pin(1), bB.pin(1));
      return { board, netA, netB };
    };

    // Without rip-up: a long detour around the wall.
    const detoured = build();
    expect(detoured.board.route(detoured.netA, { layers: ['F.Cu'], allowVias: false, ripup: false }).success).toBe(
      true,
    );
    const resDetour = detoured.board.route(detoured.netB, { layers: ['F.Cu'], allowVias: false, ripup: false });
    expect(resDetour.success).toBe(true);
    const detourLength = resDetour.routeDetails[0]?.length ?? 0;
    expect(detourLength).toBeGreaterThan(25); // it really went around

    // With rip-up (default): straight through, wall re-routed around it.
    const rescued = build();
    expect(rescued.board.route(rescued.netA, { layers: ['F.Cu'], allowVias: false, ripup: false }).success).toBe(true);
    const resRescue = rescued.board.route(rescued.netB, { layers: ['F.Cu'], allowVias: false });
    expect(resRescue.success).toBe(true);
    const rescueLength = resRescue.routeDetails[0]?.length ?? 0;
    expect(rescueLength).toBeLessThan(detourLength / 2);

    // The wall net was re-routed, not sacrificed.
    const nets = stagedNets(rescued.board);
    expect(nets.has('net_a')).toBe(true);
    expect(nets.has('net_b')).toBe(true);
  });

  it('leaves a healthy board untouched (no rip-up when nothing is wrong)', () => {
    const j1 = new Header4();
    const j2 = new Header4();
    j1.pcb.x = 20;
    j1.pcb.y = 20;
    j2.pcb.x = 40;
    j2.pcb.y = 20;
    pcb.add(j1, j2);
    pcb.outline(10, 10, 40, 20);

    const a = pcb.named('net_a').net(j1.pin(1), j2.pin(1));
    const b = pcb.named('net_b').net(j1.pin(4), j2.pin(4));

    expect(pcb.route(a).success).toBe(true);
    expect(pcb.route(b).success).toBe(true);

    const nets = stagedNets(pcb);
    expect(nets.has('net_a')).toBe(true);
    expect(nets.has('net_b')).toBe(true);
  });
});
