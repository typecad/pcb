import { describe, expect, it } from 'vitest';
import { collectManualViaFreeLocations } from '../src/pcb/manual_via_helpers.js';

describe('collectManualViaFreeLocations', () => {
    it('returns unique manual via locations for the specified net', () => {
        const pcbStub = {
            _getComponents: () => [
                { via: true, viaData: { at: { x: 10, y: 10 }, net: 'GND' } },
                { via: true, viaData: { at: { x: 20, y: 5 }, net: 'VCC' } }
            ],
            _getStagedComponents: () => [
                { via: true, viaData: { at: { x: 10, y: 10 }, net: 'gnd' } },
                { via: true, viaData: { at: { x: 5, y: 5 }, net: 'GND' } },
                { via: false }
            ]
        };

        const gndVias = collectManualViaFreeLocations(pcbStub, 'GND');
        expect(gndVias).toHaveLength(2);
        expect(gndVias).toEqual(
            expect.arrayContaining([
                { x: 10, y: 10 },
                { x: 5, y: 5 }
            ])
        );

        const vccVias = collectManualViaFreeLocations(pcbStub, 'vcc');
        expect(vccVias).toEqual([{ x: 20, y: 5 }]);

        const none = collectManualViaFreeLocations(pcbStub, 'USB_DP');
        expect(none).toHaveLength(0);
    });
});
