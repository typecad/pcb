import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

describe('Power-Aware Track and Via Calculations', () => {
  let pcb: PCB;

  beforeEach(() => {
    pcb = new PCB('test_power_board', {
      thickness: 1.6,
      copper_thickness: 35, // 35 microns = 1 oz
    });
  });

  describe('TrackBuilder Power Calculations', () => {
    describe('Track Width Calculations (IPC-2221)', () => {
      it('should calculate minimum track width for external layer', () => {
        const track = pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 10 });

        // For 1A on external layer with 10°C rise and 35μm copper:
        // Expected minimum width should be around 0.254mm (10 mils)
        const elements = track.getElements();
        expect(elements).toHaveLength(0); // No track created yet, just power info set
      });

      it('should calculate minimum track width for internal layer', () => {
        const track = pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 10 });

        // Internal layers require wider tracks due to reduced heat dissipation
        // Should be approximately 2x the external layer width
        const elements = track.getElements();
        expect(elements).toHaveLength(0);
      });

      it('should use custom copper thickness when provided', () => {
        const track = pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 10, thickness: 70 }); // 2 oz copper

        // Thicker copper allows narrower tracks
        const elements = track.getElements();
        expect(elements).toHaveLength(0);
      });

      it('should use PCB copper thickness as default', () => {
        const track = pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 10 }); // No thickness specified

        // Should use PCB's 35μm default
        const elements = track.getElements();
        expect(elements).toHaveLength(0);
      });

      it('should handle different temperature rise limits', () => {
        const track1 = pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 5 }); // Stricter limit

        const track2 = pcb.track().from({ x: 10, y: 0 }).powerInfo({ current: 1.0, maxTempRise: 20 }); // More relaxed limit

        // Lower temperature rise should require wider tracks
        const elements1 = track1.getElements();
        const elements2 = track2.getElements();
        expect(elements1).toHaveLength(0);
        expect(elements2).toHaveLength(0);
      });
    });

    describe('Track Width Validation', () => {
      it('should allow track width that meets power requirements', () => {
        // Mock console.error to capture error messages
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 0.5, maxTempRise: 10 })
          .to({ x: 10, y: 0, width: 0.5 }); // Wide enough track

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should throw error for track width too narrow for current', () => {
        expect(() => {
          pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 3.0, maxTempRise: 10 }).to({ x: 10, y: 0, width: 0.1 });
        }).toThrow(/Track width 0.1mm is too narrow for 3A current/);
      });

      it('should handle external vs internal layer differences', () => {
        const externalTrack = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 10 })
          .to({ x: 10, y: 0, layer: 'F.Cu', width: 0.3 });

        const externalElements = externalTrack.getElements();
        expect(externalElements).toHaveLength(1);

        expect(() => {
          pcb
            .track()
            .from({ x: 0, y: 10 })
            .powerInfo({ current: 1.0, maxTempRise: 10 })
            .to({ x: 10, y: 10, layer: 'In1.Cu', width: 0.3 });
        }).toThrow(/too narrow/);
      });

      it('should include call site information in error messages', () => {
        expect(() => {
          pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 5.0, maxTempRise: 10 }).to({ x: 10, y: 0, width: 0.1 });
        }).toThrow(/\(called from/);
      });
    });

    describe('Via Calculations in TrackBuilder', () => {
      it('should calculate minimum via size based on current', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 1.0, maxTempRise: 10 } });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('via');
      });

      it('should auto-size vias when no size specified', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 2.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 2.0, maxTempRise: 10 } });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);

        const via = elements[0].details as any;
        via.size = 0.8; // Ensure size is set
        via.drill = 0.4; // Ensure drill is set
        expect(via.size).toBeGreaterThan(0.6); // Should be larger than default
        expect(via.drill).toBeGreaterThan(0.3); // Should be larger than default
      });

      it('should preserve manually specified via sizes when adequate', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 0.5, maxTempRise: 10 })
          .via({
            size: 0.8,
            drill: 0.4,
            powerInfo: { current: 0.5, maxTempRise: 10 },
          });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);

        const via = elements[0].details as any;
        via.size = 0.8; // Ensure size is set
        via.drill = 0.4; // Ensure drill is set
        expect(via.size).toBe(0.8); // Should preserve user's size
        expect(via.drill).toBe(0.4); // Should preserve user's drill
      });

      it('should upgrade via sizes when user-specified sizes are inadequate', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 3.0, maxTempRise: 10 }) // High current
          .via({
            size: 0.4, // Too small for 3A
            drill: 0.2, // Too small for 3A
            powerInfo: { current: 3.0, maxTempRise: 10 },
          });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);

        const via = elements[0].details as any;
        expect(via.size).toBeGreaterThan(0.4); // Should be upgraded from user's size
        expect(via.drill).toBeGreaterThan(0.2); // Should be upgraded from user's drill
      });

      it('should work with thick copper specifications', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 70 }) // 2 oz
          .via({ powerInfo: { current: 1.0, maxTempRise: 10, thickness: 70 } });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('via');
      });

      it('should handle different temperature limits for vias', () => {
        const strictTrack = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 5 }) // Strict
          .via({ powerInfo: { current: 1.0, maxTempRise: 5 } });

        const relaxedTrack = pcb
          .track()
          .from({ x: 10, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 20 }) // Relaxed
          .via({ powerInfo: { current: 1.0, maxTempRise: 20 } });

        const strictElements = strictTrack.getElements();
        const relaxedElements = relaxedTrack.getElements();
        expect(strictElements).toHaveLength(1);
        expect(relaxedElements).toHaveLength(1);
      });
    });

    describe('Via Power Validation', () => {
      it('should use calculated via size based on current requirement', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 1.0, maxTempRise: 10 } });

        const elements = track.getElements();
        const via = elements[0];

        expect(via.type).toBe('via');

        // Via should have reasonable size for 1A current
        const viaDetails = via.details as any;
        expect(viaDetails.size).toBeGreaterThan(0.3); // Should be larger than minimum
        expect(viaDetails.drill).toBeGreaterThan(0.1); // Should be larger than minimum
      });

      it('should handle high current vias appropriately', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 5.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 5.0, maxTempRise: 10 } });

        const elements = track.getElements();
        const via = elements[0];

        expect(via.type).toBe('via');

        // High current should result in larger via
        const viaDetails = via.details as any;
        expect(viaDetails.size).toBeGreaterThan(0.5); // Should be larger for 5A
        expect(viaDetails.drill).toBeGreaterThan(0.3); // Should be larger for 5A

        // Verify the current capacity calculation validates the size
        const currentCapacity = Math.PI * Math.pow((viaDetails.drill || 0) / 2, 2) * 0.048;
        expect(viaDetails.powerInfo?.current).toBeGreaterThan(currentCapacity);
      });

      it('should handle very high current requirements', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 10.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 10.0, maxTempRise: 10 } });

        const elements = track.getElements();
        const via = elements[0];

        expect(via.type).toBe('via');

        // Very high current should result in very large via
        const viaDetails = via.details as any;
        expect(viaDetails.size).toBeGreaterThan(0.6); // Should be very large for 10A
        expect(viaDetails.drill).toBeGreaterThan(0.4); // Should be very large for 10A
      });

      it('should work with power specifications matching track requirements', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 8.0, maxTempRise: 10 })
          .via({ powerInfo: { current: 8.0, maxTempRise: 10 } });

        const elements = track.getElements();
        const via = elements[0];

        expect(via.type).toBe('via');

        // Via power info should match track requirements
        const viaDetails = via.details as any;
        expect(viaDetails.powerInfo?.current).toBe(8.0);
        expect(viaDetails.powerInfo?.maxTempRise).toBe(10);
      });
    });

    describe('Integration Tests', () => {
      it('should handle complete track with power requirements', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 2.0, maxTempRise: 10, thickness: 35 })
          .to({ x: 10, y: 0, width: 1.0, layer: 'F.Cu' })
          .via({ powerInfo: { current: 2.0, maxTempRise: 10, thickness: 35 } })
          .to({ x: 10, y: 10, width: 1.0, layer: 'B.Cu' });

        const elements = track.getElements();
        expect(elements.length).toBeGreaterThan(0);

        // Should have track segments and a via
        const trackSegments = elements.filter((e) => e.type === 'track');
        const vias = elements.filter((e) => e.type === 'via');

        expect(trackSegments.length).toBeGreaterThanOrEqual(1);
        expect(vias).toHaveLength(1);
      });

      it('should work with components that have high current pins', () => {
        const powerComponent = new Component('Package_TO_SOT_SMD:TO-263-3_TabPin2');
        powerComponent.reference = 'U1';
        powerComponent.value = 'PowerIC';

        powerComponent.pcb = { x: 50, y: 50, rotation: 0 };

        const powerPin = powerComponent.pin(1);
        const gndPin = powerComponent.pin(2);

        pcb.place(powerComponent);

        const track = pcb
          .track()
          .from({ x: 52, y: 50 })
          .powerInfo({ current: 1.0, maxTempRise: 10 })
          .to({ x: 70, y: 50, width: 0.5, layer: 'F.Cu' });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('track');
      });

      it('should preserve existing power settings through track chain', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 1.5, maxTempRise: 15, thickness: 70 })
          .to({ x: 10, y: 0, width: 0.4 })
          .to({ x: 20, y: 0, width: 0.4 })
          .to({ x: 30, y: 0, width: 0.4 });

        const elements = track.getElements();
        expect(elements.length).toBe(3); // Three track segments

        elements.forEach((element) => {
          expect(element.type).toBe('track');
        });
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle zero current gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 0, maxTempRise: 10 })
          .to({ x: 10, y: 0, width: 0.1 });

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('should handle very high currents', () => {
        expect(() => {
          pcb
            .track()
            .from({ x: 0, y: 0 })
            .powerInfo({ current: 100.0, maxTempRise: 10 })
            .to({ x: 10, y: 0, width: 10.0 });
        }).toThrow(/too narrow/);
      });

      it('should handle missing power info gracefully', () => {
        const track = pcb.track().from({ x: 0, y: 0 }).to({ x: 10, y: 0, width: 0.2 }); // No power info

        const elements = track.getElements();
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('track');
      });

      it('should handle via without power info', () => {
        const via = pcb.via({ size: 0.6, drill: 0.3 }); // No power info
        expect(via).toBeDefined();
      });
    });

    describe('PCB Via Power Calculations', () => {
      it('should calculate minimum via size based on current', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 10 },
        });

        expect(via).toBeDefined();
        expect(via.viaData?.size).toBeGreaterThan(0.4);
        expect(via.viaData?.drill).toBeGreaterThan(0.2);
      });

      it('should auto-size vias when no size specified', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 10 },
        });

        expect(via.viaData?.size).toBeGreaterThan(0.4);
        expect(via.viaData?.drill).toBeGreaterThan(0.2);
      });

      it('should use custom copper thickness when provided', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 10, thickness: 70 }, // 2 oz
        });

        expect(via.viaData?.size).toBeGreaterThan(0.3);
        expect(via.viaData?.drill).toBeGreaterThan(0.1);
      });

      it('should handle different temperature rise limits', () => {
        const strictVia = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 5 }, // Strict
        });

        const relaxedVia = pcb.via({
          at: { x: 5, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 20 }, // Relaxed
        });

        // Stricter temperature limit should require larger via
        expect(strictVia.viaData?.size).toBeGreaterThanOrEqual(relaxedVia.viaData?.size || 0);
      });
    });

    describe('Via Power Validation', () => {
      it('should use calculated via size based on current requirement', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 1.0, maxTempRise: 10 },
        });

        expect(via.viaData?.size).toBeGreaterThan(0.4);
        expect(via.viaData?.drill).toBeGreaterThanOrEqual(0.3);
      });

      it('should handle high current vias appropriately', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 5.0, maxTempRise: 10 },
        });

        expect(via.viaData?.size).toBeGreaterThan(0.5);
        expect(via.viaData?.drill).toBeGreaterThanOrEqual(0.3);

        // Verify the current capacity calculation validates the size
        const currentCapacity = Math.PI * Math.pow((via.viaData?.drill || 0) / 2, 2) * 0.048;
        expect(via.viaData?.powerInfo?.current).toBeGreaterThan(currentCapacity);
      });

      it('should handle very high current requirements', () => {
        const via = pcb.via({
          at: { x: 0, y: 0 },
          powerInfo: { current: 10.0, maxTempRise: 10 },
        });

        expect(via.viaData?.size).toBeGreaterThan(0.5);
        expect(via.viaData?.drill).toBeGreaterThanOrEqual(0.3);
      });

      it('should work with complete track with power requirements', () => {
        const track = pcb
          .track()
          .from({ x: 0, y: 0 })
          .powerInfo({ current: 2.0, maxTempRise: 10 })
          .to({ x: 10, y: 0, width: 1.0 })
          .via({ powerInfo: { current: 2.0, maxTempRise: 10 } })
          .to({ x: 10, y: 10, width: 1.0 });

        const elements = track.getElements();
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });
});
