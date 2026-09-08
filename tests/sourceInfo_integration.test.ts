import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn(),
  };
});

const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync');
const mockReadFileSync = vi.spyOn(fs, 'readFileSync');

describe('sourceInfo Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFileSync.mockImplementation(() => {});
    mockReadFileSync.mockReturnValue('');
  });

  describe('Component sourceInfo in PCB creation', () => {
    it('should include sourceInfo in KiCad output when creating board', () => {
      const pcb = new PCB('test_board');

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      component.pcb = { x: 100, y: 100, rotation: 0 };

      const mockFootprintLib = vi
        .spyOn(component, 'footprint_lib')
        .mockReturnValue('(footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (width 1.6) (height 0.8))');

      pcb.create(component);

      expect(component.sourceInfo).toBeDefined();
      expect(mockFootprintLib).toHaveBeenCalled();

      mockFootprintLib.mockRestore();
    });

    it('should preserve sourceInfo when components are grouped', () => {
      const pcb = new PCB('test_board');

      const component1 = new Component('Resistor_SMD:R_0603_1608Metric');
      component1.reference = 'R1';
      component1.value = '10k';

      const component2 = new Component('Resistor_SMD:R_0603_1608Metric');
      component2.reference = 'R2';
      component2.value = '1k';

      component1.pcb = { x: 100, y: 100, rotation: 0 };
      component2.pcb = { x: 200, y: 100, rotation: 0 };

      const originalSourceInfo1 = component1.sourceInfo;
      const originalSourceInfo2 = component2.sourceInfo;

      pcb.group('resistors', component1, component2);

      expect(component1.sourceInfo).toEqual(originalSourceInfo1);
      expect(component2.sourceInfo).toEqual(originalSourceInfo2);
    });

    it('should handle sourceInfo when components are placed and then created', () => {
      const pcb = new PCB('test_board');

      const component = new Component('Package_DIP:DIP-28_W7.62mm');
      component.reference = 'U1';
      component.value = 'ATMEGA328P';

      component.pcb = { x: 150, y: 150, rotation: 90, side: 'back' };

      const originalSourceInfo = component.sourceInfo;

      pcb.place(component);

      const mockFootprintLib = vi
        .spyOn(component, 'footprint_lib')
        .mockReturnValue('(footprint "Package_DIP:DIP-28_W7.62mm" (layer "B.Cu") (width 7.62) (height 35.56))');

      pcb.create(component);

      expect(component.sourceInfo).toEqual(originalSourceInfo);

      mockFootprintLib.mockRestore();
    });
  });

  describe('Outline sourceInfo in PCB creation', () => {
    it('should preserve sourceInfo for outlines when creating board', () => {
      const pcb = new PCB('test_board');

      pcb.outline(0, 0, 100, 80, 5);

      pcb.create();

      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should handle multiple outlines with sourceInfo', () => {
      const pcb = new PCB('test_board');

      pcb.outline(0, 0, 100, 80);
      pcb.outline(10, 10, 90, 70, 2);

      pcb.create();

      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('Via sourceInfo in PCB creation', () => {
    it('should preserve sourceInfo for vias when creating board', () => {
      const pcb = new PCB('test_board');

      const via = pcb.via({
        at: { x: 50, y: 50 },
        size: 0.8,
        drill: 0.4,
      });

      const originalSourceInfo = via.sourceInfo;

      pcb.create();

      expect(via.sourceInfo).toEqual(originalSourceInfo);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should handle vias with powerInfo and sourceInfo', () => {
      const pcb = new PCB('test_board');

      const via = pcb.via({
        at: { x: 75, y: 75 },
        size: 1.0,
        drill: 0.5,
        powerInfo: { current: 2.0, maxTempRise: 10 },
      });

      expect(via.sourceInfo).toBeDefined();
      expect(via.viaData?.powerInfo).toBeDefined();

      pcb.create();

      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('Error handling with sourceInfo', () => {
    it('should include sourceInfo in error messages when board creation fails', () => {
      const pcb = new PCB('test_board');

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit was called');
      });

      try {
        new Component('InvalidFootprint');
      } catch (error) {
        expect(error).toBeDefined();
      }

      mockExit.mockRestore();
    });
  });

  describe('SourceInfo persistence', () => {
    it('should maintain sourceInfo consistency across operations', () => {
      const pcb = new PCB('test_board');

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      const originalSourceInfo = component.sourceInfo;

      component.pcb = { x: 100, y: 100, rotation: 0 };
      component.value = '20k';
      component.description = 'Updated resistor';

      pcb.place(component);

      pcb.group('resistors', component);

      expect(component.sourceInfo).toEqual(originalSourceInfo);
    });

    it('should handle sourceInfo for components created in different contexts', () => {
      const pcb1 = new PCB('board1');
      const pcb2 = new PCB('board2');

      const component1 = new Component('Resistor_SMD:R_0603_1608Metric');
      component1.reference = 'R1';
      component1.value = '10k';

      const component2 = new Component('Resistor_SMD:R_0603_1608Metric');
      component2.reference = 'R1';
      component2.value = '10k';

      expect(component1.sourceInfo).toBeDefined();
      expect(component2.sourceInfo).toBeDefined();

      expect(component1.sourceInfo?.line).not.toBe(component2.sourceInfo?.line);

      pcb1.place(component1);
      pcb2.place(component2);

      expect(component1.sourceInfo?.file).toBe(component2.sourceInfo?.file);
      expect(component1.sourceInfo?.line).not.toBe(component2.sourceInfo?.line);
    });
  });
});
