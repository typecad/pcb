import { describe, expect, it } from 'vitest';
import { collectManualViaFreeLocations } from '../src/pcb/manual_via_helpers.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';

describe('collectManualViaFreeLocations', () => {
  it('returns unique manual via locations for the specified net', () => {
    const state = new PcbInternalState({ remove_orphans: true });
    state.components = [
      { via: true, viaData: { at: { x: 10, y: 10 }, net: 'GND' } } as any,
      { via: true, viaData: { at: { x: 20, y: 5 }, net: 'VCC' } } as any,
    ];
    state.stagedComponents = [
      { via: true, viaData: { at: { x: 10, y: 10 }, net: 'gnd' } } as any,
      { via: true, viaData: { at: { x: 5, y: 5 }, net: 'GND' } } as any,
      { via: false } as any,
    ];
    const pcbStub = { _state: state };

    const gndVias = collectManualViaFreeLocations(pcbStub as any, 'GND');
    expect(gndVias).toHaveLength(2);
    expect(gndVias).toEqual(
      expect.arrayContaining([
        { x: 10, y: 10 },
        { x: 5, y: 5 },
      ]),
    );

    const vccVias = collectManualViaFreeLocations(pcbStub as any, 'vcc');
    expect(vccVias).toEqual([{ x: 20, y: 5 }]);

    const none = collectManualViaFreeLocations(pcbStub as any, 'USB_DP');
    expect(none).toHaveLength(0);
  });
});
