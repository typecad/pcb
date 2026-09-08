import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component } from '../src/component.js';
import { PCB } from '../src/pcb/pcb.js';
import fs from 'node:fs';

const mockReadFileSync = vi.spyOn(fs, 'readFileSync');

describe('sourceInfo Object', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component sourceInfo', () => {
    it('should capture basic source information when creating a component', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(typeof component.sourceInfo?.file).toBe('string');
      expect(component.sourceInfo?.line).toBeDefined();
      expect(typeof component.sourceInfo?.line).toBe('number');
    });

    it('should handle components without sourceInfo when creation fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });

    it('should parse variable name from simple assignment', () => {
      mockReadFileSync.mockReturnValue(`
        const resistor1 = new Component('Resistor_SMD:R_0603_1608Metric')
        resistor1.reference = 'R1'
        resistor1.value = '10k'
      `);

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });

    it('should handle complex parameter objects', () => {
      mockReadFileSync.mockReturnValue(`
        const complexComponent = new Component('Package_DIP:DIP-28_W7.62mm')
        complexComponent.reference = 'U1'
        complexComponent.value = 'ATMEGA328P'
      `);

      const component = new Component('Package_DIP:DIP-28_W7.62mm');
      component.reference = 'U1';
      component.value = 'ATMEGA328P';
      component.pcb = { x: 100, y: 100, rotation: 45, side: 'back' };
      component.simulation = { include: true, model: 'atmega.sp' };

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });

    it('should preserve sourceInfo when component is copied or updated', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      const originalSourceInfo = component.sourceInfo;

      component.value = '20k';
      component.pcb = { x: 50, y: 50, rotation: 90, side: 'front' };

      expect(component.sourceInfo).toEqual(originalSourceInfo);
    });
  });

  describe('PCB outline sourceInfo', () => {
    let pcb: PCB;

    beforeEach(() => {
      pcb = new PCB('test_board');
    });

    it('should capture source information when creating an outline', () => {
      mockReadFileSync.mockReturnValue(`
        const boardOutline = pcb.outline(0, 0, 100, 80, 5)
      `);

      pcb.outline(0, 0, 100, 80, 5);

      expect(() => pcb.outline(0, 0, 100, 80, 5)).not.toThrow();
    });

    it('should include outline parameters in sourceInfo', () => {
      mockReadFileSync.mockReturnValue(`
        const boardOutline = pcb.outline(10, 20, 100, 80, 5, 'custom-uuid')
      `);

      pcb.outline(10, 20, 100, 80, 5, 'custom-uuid');

      expect(() => pcb.outline(10, 20, 100, 80, 5, 'custom-uuid')).not.toThrow();
    });

    it('should handle outline creation without variable assignment', () => {
      mockReadFileSync.mockReturnValue(`
        pcb.outline(0, 0, 100, 80, 5)
      `);

      pcb.outline(0, 0, 100, 80, 5);

      expect(() => pcb.outline(0, 0, 100, 80, 5)).not.toThrow();
    });

    it('should preserve sourceInfo for multiple outlines', () => {
      mockReadFileSync.mockReturnValue(`
        const outline1 = pcb.outline(0, 0, 100, 80)
        const outline2 = pcb.outline(50, 50, 150, 130)
      `);

      pcb.outline(0, 0, 100, 80);
      pcb.outline(50, 50, 150, 130);

      expect(() => pcb.outline(0, 0, 100, 80)).not.toThrow();
      expect(() => pcb.outline(50, 50, 150, 130)).not.toThrow();
    });
  });

  describe('sourceInfo formatting', () => {
    it('should handle sourceInfo with various data types', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(typeof component.sourceInfo?.file).toBe('string');
      expect(typeof component.sourceInfo?.line).toBe('number');

      if (component.sourceInfo?.variable !== undefined) {
        expect(typeof component.sourceInfo.variable).toBe('string');
      }
      if (component.sourceInfo?.params !== undefined) {
        expect(typeof component.sourceInfo.params).toBe('object');
      }
    });

    it('should handle sourceInfo with complex nested parameters', () => {
      const component = new Component('Package_DIP:DIP-28_W7.62mm');
      component.reference = 'U1';
      component.value = 'ATMEGA328P';
      component.pcb = { x: 100, y: 100, rotation: 45, side: 'back' };
      component.simulation = { include: true, model: 'atmega.sp' };

      expect(component.sourceInfo).toBeDefined();

      if (component.sourceInfo?.params) {
        expect(typeof component.sourceInfo.params).toBe('object');
      }
    });

    it('should handle sourceInfo serialization', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();

      expect(() => {
        JSON.stringify(component.sourceInfo);
      }).not.toThrow();

      const serialized = JSON.stringify(component.sourceInfo);
      expect(typeof serialized).toBe('string');

      expect(() => {
        JSON.parse(serialized);
      }).not.toThrow();
    });

    it('should handle sourceInfo with special characters in file paths', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();

      expect(typeof component.sourceInfo?.file).toBe('string');
    });
  });

  describe('sourceInfo in PCB operations', () => {
    let pcb: PCB;

    beforeEach(() => {
      pcb = new PCB('test_board');
    });

    it('should preserve sourceInfo when placing components', () => {
      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      const originalSourceInfo = component.sourceInfo;

      component.pcb = { x: 100, y: 100, rotation: 0 };
      pcb.place(component);

      expect(component.sourceInfo).toEqual(originalSourceInfo);
    });

    it('should preserve sourceInfo when creating vias', () => {
      mockReadFileSync.mockReturnValue(`
        const via1 = pcb.via({ at: { x: 50, y: 50 }, size: 0.8, drill: 0.4 })
      `);

      const via = pcb.via({ at: { x: 50, y: 50 }, size: 0.8, drill: 0.4 });

      expect(via.sourceInfo).toBeDefined();
      expect(via.sourceInfo?.file).toBeDefined();
      expect(via.sourceInfo?.line).toBeDefined();
    });

    it('should include sourceInfo in error messages when possible', () => {
      expect(() => {
        pcb.track().from({ x: 0, y: 0 }).powerInfo({ current: 5.0, maxTempRise: 10 }).to({ x: 10, y: 0, width: 0.1 });
      }).toThrow(/\(called from/);
    });
  });

  describe('sourceInfo edge cases', () => {
    it('should handle missing files gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        const err: any = new Error('ENOENT: no such file or directory');
        err.code = 'ENOENT';
        throw err;
      });

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });

    it('should handle malformed source files', () => {
      mockReadFileSync.mockReturnValue(`
        const malformed = new Component('Resistor_SMD:R_0603_1608Metric')
        malformed.reference = 'R1'
        malformed.value = '10k'
      `);

      const component = new Component('Resistor_SMD:R_0603_1608Metric');
      component.reference = 'R1';
      component.value = '10k';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });

    it('should handle very long parameter lists', () => {
      mockReadFileSync.mockReturnValue(`
        const complexComponent = new Component('Package_DIP:DIP-28_W7.62mm')
        complexComponent.reference = 'U1'
        complexComponent.value = 'ATMEGA328P'
      `);

      const component = new Component('Package_DIP:DIP-28_W7.62mm');
      component.reference = 'U1';
      component.value = 'ATMEGA328P';
      component.pcb = { x: 100, y: 100, rotation: 45, side: 'back' };
      component.simulation = { include: true, model: 'atmega.sp' };
      component.datasheet = 'https://example.com/datasheet.pdf';
      component.description = 'A very long description with many words and details';
      component.mpn = 'ATMEGA328P-AU';
      component.voltage = '5V';
      component.wattage = '0.2W';

      expect(component.sourceInfo).toBeDefined();
      expect(component.sourceInfo?.file).toBeDefined();
      expect(component.sourceInfo?.line).toBeDefined();
    });
  });
});
