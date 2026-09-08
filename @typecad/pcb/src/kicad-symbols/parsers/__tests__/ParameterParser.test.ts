import { describe, it, expect } from 'vitest';
import { ElectricalParameterParser } from '../ParameterParser.js';

describe('ElectricalParameterParser', () => {
  const parser = new ElectricalParameterParser();

  // Note: Since we removed JLCPCB mode and default to KICAD mode,
  // electrical parameter parsing is disabled for KiCad symbols.
  // These tests now verify that only non-electrical parameters are extracted.

  describe('voltage recognition', () => {
    it('should not extract voltage values in KICAD mode', () => {
      const result = parser.parseQuery('I need a 5V regulator');
      expect(result.voltage).toBeUndefined();
    });

    it('should not extract decimal voltage values in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 3.3V component');
      expect(result.voltage).toBeUndefined();
    });

    it('should not extract voltage with DC/AC suffix in KICAD mode', () => {
      const result = parser.parseQuery('Need a 12VDC power supply');
      expect(result.voltage).toBeUndefined();
    });
  });

  describe('capacitance recognition', () => {
    it('should not extract capacitance in pF in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 100pF capacitor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract capacitance in nF in KICAD mode', () => {
      const result = parser.parseQuery('Need a 10nF cap');
      expect(result.value).toBeUndefined();
    });

    it('should not extract capacitance in µF in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 2.2µF capacitor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract capacitance with uF notation in KICAD mode', () => {
      const result = parser.parseQuery('Need a 4.7uF cap');
      expect(result.value).toBeUndefined();
    });
  });

  describe('resistance recognition', () => {
    it('should not extract resistance in ohms in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 100Ω resistor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract resistance in kΩ in KICAD mode', () => {
      const result = parser.parseQuery('Need a 10kΩ resistor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract resistance in MΩ in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 1MΩ resistor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract resistance with R notation in KICAD mode', () => {
      const result = parser.parseQuery('Need a 4.7R resistor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract resistance with k notation in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 4k7 resistor');
      expect(result.value).toBeUndefined();
    });
  });

  describe('inductance recognition', () => {
    it('should not extract inductance in nH in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 100nH inductor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract inductance in µH in KICAD mode', () => {
      const result = parser.parseQuery('Need a 10µH inductor');
      expect(result.value).toBeUndefined();
    });

    it('should not extract inductance in mH in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 1mH inductor');
      expect(result.value).toBeUndefined();
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
    it('should only extract non-electrical parameters in KICAD mode', () => {
      const result = parser.parseQuery('Looking for a 100nF 50V 0603 X7R ±5% capacitor');
      expect(result.value).toBeUndefined();
      expect(result.voltage).toBeUndefined();
      expect(result.package).toBe('0603');
      expect(result.componentType).toBe('X7R');
      expect(result.tolerance).toBe('±5%');
    });
  });
});
