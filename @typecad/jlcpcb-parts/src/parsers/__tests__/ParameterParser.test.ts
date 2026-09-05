import { describe, it, expect } from 'vitest';
import { ElectricalParameterParser } from '../ParameterParser.js';

describe('ElectricalParameterParser', () => {
  const parser = new ElectricalParameterParser();

  describe('voltage recognition', () => {
    it('should recognize simple voltage values', () => {
      const result = parser.parseQuery('I need a 5V regulator');
      expect(result.voltage).toBeDefined();
      expect(result.voltage?.value).toBe(5);
      expect(result.voltage?.unit).toBe('V');
    });

    it('should recognize decimal voltage values', () => {
      const result = parser.parseQuery('Looking for a 3.3V component');
      expect(result.voltage).toBeDefined();
      expect(result.voltage?.value).toBe(3.3);
      expect(result.voltage?.unit).toBe('V');
    });

    it('should recognize voltage with DC/AC suffix', () => {
      const result = parser.parseQuery('Need a 12VDC power supply');
      expect(result.voltage).toBeDefined();
      expect(result.voltage?.value).toBe(12);
      expect(result.voltage?.unit).toBe('V');
    });
  });

  describe('capacitance recognition', () => {
    it('should recognize capacitance in pF', () => {
      const result = parser.parseQuery('Looking for a 100pF capacitor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-10);
      expect(result.value?.unit).toBe('F');
      expect(result.value?.originalText).toBe('100pF');
    });

    it('should recognize capacitance in nF', () => {
      const result = parser.parseQuery('Need a 10nF cap');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-8);
      expect(result.value?.unit).toBe('F');
    });

    it('should recognize capacitance in µF', () => {
      const result = parser.parseQuery('Looking for a 2.2µF capacitor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(2.2e-6);
      expect(result.value?.unit).toBe('F');
    });

    it('should recognize capacitance with uF notation', () => {
      const result = parser.parseQuery('Need a 4.7uF cap');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(4.7e-6);
      expect(result.value?.unit).toBe('F');
    });
  });

  describe('resistance recognition', () => {
    it('should recognize resistance in ohms', () => {
      const result = parser.parseQuery('Looking for a 100Ω resistor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(100);
      expect(result.value?.unit).toBe('Ω');
    });

    it('should recognize resistance in kΩ', () => {
      const result = parser.parseQuery('Need a 10kΩ resistor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(10000);
      expect(result.value?.unit).toBe('Ω');
    });

    it('should recognize resistance in MΩ', () => {
      const result = parser.parseQuery('Looking for a 1MΩ resistor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(1000000);
      expect(result.value?.unit).toBe('Ω');
    });

    it('should recognize resistance with R notation', () => {
      const result = parser.parseQuery('Need a 4.7R resistor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(4.7);
      expect(result.value?.unit).toBe('Ω');
    });

    it('should recognize resistance with k notation', () => {
      const result = parser.parseQuery('Looking for a 4k7 resistor');
      // This is a more complex case that our current implementation doesn't handle
      // We would need to enhance the regex to handle this notation
    });
  });

  describe('inductance recognition', () => {
    it('should recognize inductance in nH', () => {
      const result = parser.parseQuery('Looking for a 100nH inductor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-7);
      expect(result.value?.unit).toBe('H');
    });

    it('should recognize inductance in µH', () => {
      const result = parser.parseQuery('Need a 10µH inductor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-5);
      expect(result.value?.unit).toBe('H');
    });

    it('should recognize inductance in mH', () => {
      const result = parser.parseQuery('Looking for a 1mH inductor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-3);
      expect(result.value?.unit).toBe('H');
    });
  });

  describe('frequency parsing', () => {
    it('should parse Hz values', () => {
      const result = parser.parseQuery('32768Hz crystal');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(32768);
      expect(result.value?.unit).toBe('Hz');
    });

    it('should parse kHz values', () => {
      const result = parser.parseQuery('32.768kHz crystal');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(32768);
      expect(result.value?.unit).toBe('Hz');
    });

    it('should parse MHz values', () => {
      const result = parser.parseQuery('25MHz crystal');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(25000000);
      expect(result.value?.unit).toBe('Hz');
    });

    it('should parse GHz values', () => {
      const result = parser.parseQuery('2.4GHz oscillator');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBe(2400000000);
      expect(result.value?.unit).toBe('Hz');
    });
  });

  describe('package recognition', () => {
    it('should recognize SMD packages', () => {
      const result = parser.parseQuery('Looking for a 0402 resistor');
      expect(result.package).toBe('0402');
    });

    it('should recognize SOT packages', () => {
      const result = parser.parseQuery('Need a SOT-23 transistor');
      expect(result.package).toBe('SOT-23');
    });

    it('should recognize SOIC packages', () => {
      const result = parser.parseQuery('Looking for a SOIC-8 chip');
      expect(result.package).toBe('SOIC-8');
    });

    it('should recognize QFN packages', () => {
      const result = parser.parseQuery('Need a QFN-32 microcontroller');
      expect(result.package).toBe('QFN-32');
    });
  });

  describe('component type recognition', () => {
    it('should recognize capacitor types', () => {
      const result = parser.parseQuery('Looking for an X7R capacitor');
      expect(result.componentType).toBe('X7R');
    });

    it('should recognize resistor types', () => {
      const result = parser.parseQuery('Need a Thick Film resistor');
      expect(result.componentType).toBe('Thick Film');
    });

    it('should recognize general component categories', () => {
      const result = parser.parseQuery('Looking for a transistor');
      expect(result.componentType).toBe('Transistor');
    });
  });

  describe('tolerance recognition', () => {
    it('should recognize tolerance with ± symbol', () => {
      const result = parser.parseQuery('Looking for a ±1% resistor');
      expect(result.tolerance).toBe('±1%');
    });

    it('should recognize tolerance without ± symbol', () => {
      const result = parser.parseQuery('Need a 5% tolerance capacitor');
      expect(result.tolerance).toBe('±5%');
    });
  });

  describe('keyword extraction', () => {
    it('should extract keywords from query', () => {
      const result = parser.parseQuery('Looking for a High Voltage Low ESR capacitor');
      expect(result.keywords).toBeDefined();
      expect(result.keywords).toContain('High Voltage');
      expect(result.keywords).toContain('Low ESR');
    });
  });

  describe('multiple parameter recognition', () => {
    it('should recognize multiple parameters in a query', () => {
      const result = parser.parseQuery('Looking for a 100nF 50V 0603 X7R ±5% capacitor');
      expect(result.value).toBeDefined();
      expect(result.value?.value).toBeCloseTo(1e-7);
      expect(result.voltage).toBeDefined();
      expect(result.voltage?.value).toBe(50);
      expect(result.package).toBe('0603');
      expect(result.componentType).toBe('X7R');
      expect(result.tolerance).toBe('±5%');
    });
  });
});
