import { describe, it, expect } from 'vitest';
import { UnitConverter } from '../UnitConverter.js';

describe('UnitConverter', () => {
  describe('normalizeCapacitance', () => {
    it('should convert pF to F', () => {
      expect(UnitConverter.normalizeCapacitance(100, 'pF')).toBeCloseTo(100e-12);
      expect(UnitConverter.normalizeCapacitance(470, 'pF')).toBeCloseTo(470e-12);
    });

    it('should convert nF to F', () => {
      expect(UnitConverter.normalizeCapacitance(10, 'nF')).toBeCloseTo(10e-9);
      expect(UnitConverter.normalizeCapacitance(47, 'nF')).toBeCloseTo(47e-9);
    });

    it('should convert µF to F', () => {
      expect(UnitConverter.normalizeCapacitance(1, 'µF')).toBeCloseTo(1e-6);
      expect(UnitConverter.normalizeCapacitance(4.7, 'µF')).toBeCloseTo(4.7e-6);
    });

    it('should convert uF to F', () => {
      expect(UnitConverter.normalizeCapacitance(1, 'uF')).toBeCloseTo(1e-6);
      expect(UnitConverter.normalizeCapacitance(4.7, 'uF')).toBeCloseTo(4.7e-6);
    });

    it('should convert mF to F', () => {
      expect(UnitConverter.normalizeCapacitance(1, 'mF')).toBeCloseTo(1e-3);
      expect(UnitConverter.normalizeCapacitance(4.7, 'mF')).toBeCloseTo(4.7e-3);
    });

    it('should handle F directly', () => {
      expect(UnitConverter.normalizeCapacitance(1, 'F')).toBeCloseTo(1);
      expect(UnitConverter.normalizeCapacitance(0.001, 'F')).toBeCloseTo(0.001);
    });

    it('should handle unknown units as F', () => {
      expect(UnitConverter.normalizeCapacitance(1, 'unknown')).toBeCloseTo(1);
    });
  });

  describe('normalizeResistance', () => {
    it('should convert mΩ to Ω', () => {
      expect(UnitConverter.normalizeResistance(100, 'mΩ')).toBeCloseTo(0.1);
      expect(UnitConverter.normalizeResistance(470, 'mΩ')).toBeCloseTo(0.47);
    });

    it('should convert kΩ to Ω', () => {
      expect(UnitConverter.normalizeResistance(1, 'kΩ')).toBeCloseTo(1000);
      expect(UnitConverter.normalizeResistance(4.7, 'kΩ')).toBeCloseTo(4700);
    });

    it('should convert MΩ to Ω', () => {
      expect(UnitConverter.normalizeResistance(1, 'MΩ')).toBeCloseTo(1e6);
      expect(UnitConverter.normalizeResistance(4.7, 'MΩ')).toBeCloseTo(4.7e6);
    });

    it('should convert GΩ to Ω', () => {
      expect(UnitConverter.normalizeResistance(1, 'GΩ')).toBeCloseTo(1e9);
      expect(UnitConverter.normalizeResistance(4.7, 'GΩ')).toBeCloseTo(4.7e9);
    });

    it('should handle Ω directly', () => {
      expect(UnitConverter.normalizeResistance(100, 'Ω')).toBeCloseTo(100);
      expect(UnitConverter.normalizeResistance(470, 'Ω')).toBeCloseTo(470);
    });

    it('should handle ohm notation', () => {
      expect(UnitConverter.normalizeResistance(100, 'ohm')).toBeCloseTo(100);
      expect(UnitConverter.normalizeResistance(4.7, 'kohm')).toBeCloseTo(4700);
      expect(UnitConverter.normalizeResistance(1, 'Mohm')).toBeCloseTo(1e6);
    });

    it('should handle R notation', () => {
      expect(UnitConverter.normalizeResistance(4.7, 'R')).toBeCloseTo(4.7);
      expect(UnitConverter.normalizeResistance(4.7, 'kR')).toBeCloseTo(4700);
      expect(UnitConverter.normalizeResistance(4.7, 'MR')).toBeCloseTo(4.7e6);
    });

    it('should handle unknown units as Ω', () => {
      expect(UnitConverter.normalizeResistance(100, 'unknown')).toBeCloseTo(100);
    });
  });

  describe('normalizeInductance', () => {
    it('should convert nH to H', () => {
      expect(UnitConverter.normalizeInductance(100, 'nH')).toBeCloseTo(100e-9);
      expect(UnitConverter.normalizeInductance(470, 'nH')).toBeCloseTo(470e-9);
    });

    it('should convert µH to H', () => {
      expect(UnitConverter.normalizeInductance(10, 'µH')).toBeCloseTo(10e-6);
      expect(UnitConverter.normalizeInductance(47, 'µH')).toBeCloseTo(47e-6);
    });

    it('should convert uH to H', () => {
      expect(UnitConverter.normalizeInductance(10, 'uH')).toBeCloseTo(10e-6);
      expect(UnitConverter.normalizeInductance(47, 'uH')).toBeCloseTo(47e-6);
    });

    it('should convert mH to H', () => {
      expect(UnitConverter.normalizeInductance(1, 'mH')).toBeCloseTo(1e-3);
      expect(UnitConverter.normalizeInductance(4.7, 'mH')).toBeCloseTo(4.7e-3);
    });

    it('should handle H directly', () => {
      expect(UnitConverter.normalizeInductance(1, 'H')).toBeCloseTo(1);
      expect(UnitConverter.normalizeInductance(0.001, 'H')).toBeCloseTo(0.001);
    });

    it('should handle unknown units as H', () => {
      expect(UnitConverter.normalizeInductance(1, 'unknown')).toBeCloseTo(1);
    });
  });

  describe('normalizeVoltage', () => {
    it('should convert mV to V', () => {
      expect(UnitConverter.normalizeVoltage(100, 'mV')).toBeCloseTo(0.1);
      expect(UnitConverter.normalizeVoltage(470, 'mV')).toBeCloseTo(0.47);
    });

    it('should convert kV to V', () => {
      expect(UnitConverter.normalizeVoltage(1, 'kV')).toBeCloseTo(1000);
      expect(UnitConverter.normalizeVoltage(4.7, 'kV')).toBeCloseTo(4700);
    });

    it('should handle V directly', () => {
      expect(UnitConverter.normalizeVoltage(5, 'V')).toBeCloseTo(5);
      expect(UnitConverter.normalizeVoltage(12, 'V')).toBeCloseTo(12);
    });

    it('should handle volt notation', () => {
      expect(UnitConverter.normalizeVoltage(5, 'volt')).toBeCloseTo(5);
      expect(UnitConverter.normalizeVoltage(12, 'volts')).toBeCloseTo(12);
    });

    it('should handle DC/AC suffix', () => {
      expect(UnitConverter.normalizeVoltage(5, 'VDC')).toBeCloseTo(5);
      expect(UnitConverter.normalizeVoltage(12, 'VAC')).toBeCloseTo(12);
    });

    it('should handle unknown units as V', () => {
      expect(UnitConverter.normalizeVoltage(5, 'unknown')).toBeCloseTo(5);
    });
  });

  describe('normalizeFrequency', () => {
    it('should convert Hz to Hz', () => {
      expect(UnitConverter.normalizeFrequency(100, 'Hz')).toBeCloseTo(100);
      expect(UnitConverter.normalizeFrequency(60, 'Hz')).toBeCloseTo(60);
    });

    it('should convert kHz to Hz', () => {
      expect(UnitConverter.normalizeFrequency(1, 'kHz')).toBeCloseTo(1000);
      expect(UnitConverter.normalizeFrequency(32.768, 'kHz')).toBeCloseTo(32768);
    });

    it('should convert MHz to Hz', () => {
      expect(UnitConverter.normalizeFrequency(1, 'MHz')).toBeCloseTo(1e6);
      expect(UnitConverter.normalizeFrequency(16, 'MHz')).toBeCloseTo(16e6);
    });

    it('should convert GHz to Hz', () => {
      expect(UnitConverter.normalizeFrequency(1, 'GHz')).toBeCloseTo(1e9);
      expect(UnitConverter.normalizeFrequency(2.4, 'GHz')).toBeCloseTo(2.4e9);
    });

    it('should handle unknown units as Hz', () => {
      expect(UnitConverter.normalizeFrequency(100, 'unknown')).toBeCloseTo(100);
    });
  });

  describe('normalizeCurrent', () => {
    it('should convert µA to A', () => {
      expect(UnitConverter.normalizeCurrent(100, 'µA')).toBeCloseTo(100e-6);
      expect(UnitConverter.normalizeCurrent(470, 'µA')).toBeCloseTo(470e-6);
    });

    it('should convert uA to A', () => {
      expect(UnitConverter.normalizeCurrent(100, 'uA')).toBeCloseTo(100e-6);
      expect(UnitConverter.normalizeCurrent(470, 'uA')).toBeCloseTo(470e-6);
    });

    it('should convert mA to A', () => {
      expect(UnitConverter.normalizeCurrent(100, 'mA')).toBeCloseTo(0.1);
      expect(UnitConverter.normalizeCurrent(470, 'mA')).toBeCloseTo(0.47);
    });

    it('should handle A directly', () => {
      expect(UnitConverter.normalizeCurrent(1, 'A')).toBeCloseTo(1);
      expect(UnitConverter.normalizeCurrent(2.5, 'A')).toBeCloseTo(2.5);
    });

    it('should handle amp notation', () => {
      expect(UnitConverter.normalizeCurrent(1, 'amp')).toBeCloseTo(1);
      expect(UnitConverter.normalizeCurrent(2.5, 'amps')).toBeCloseTo(2.5);
    });

    it('should handle unknown units as A', () => {
      expect(UnitConverter.normalizeCurrent(1, 'unknown')).toBeCloseTo(1);
    });
  });

  describe('normalizeTemperature', () => {
    it('should convert °C to °C', () => {
      expect(UnitConverter.normalizeTemperature(25, '°C')).toBeCloseTo(25);
      expect(UnitConverter.normalizeTemperature(-40, '°C')).toBeCloseTo(-40);
    });

    it('should handle C notation', () => {
      expect(UnitConverter.normalizeTemperature(25, 'C')).toBeCloseTo(25);
      expect(UnitConverter.normalizeTemperature(85, 'C')).toBeCloseTo(85);
    });

    it('should convert °F to °C', () => {
      expect(UnitConverter.normalizeTemperature(32, '°F')).toBeCloseTo(0);
      expect(UnitConverter.normalizeTemperature(212, '°F')).toBeCloseTo(100);
    });

    it('should handle F notation', () => {
      expect(UnitConverter.normalizeTemperature(32, 'F')).toBeCloseTo(0);
      expect(UnitConverter.normalizeTemperature(212, 'F')).toBeCloseTo(100);
    });

    it('should handle unknown units as °C', () => {
      expect(UnitConverter.normalizeTemperature(25, 'unknown')).toBeCloseTo(25);
    });
  });

  describe('normalizeValue', () => {
    it('should normalize capacitance values', () => {
      expect(UnitConverter.normalizeValue(100, 'pF', 'capacitance')).toBeCloseTo(100e-12);
      expect(UnitConverter.normalizeValue(10, 'nF', 'capacitance')).toBeCloseTo(10e-9);
      expect(UnitConverter.normalizeValue(1, 'µF', 'capacitance')).toBeCloseTo(1e-6);
    });

    it('should normalize resistance values', () => {
      expect(UnitConverter.normalizeValue(100, 'Ω', 'resistance')).toBeCloseTo(100);
      expect(UnitConverter.normalizeValue(1, 'kΩ', 'resistance')).toBeCloseTo(1000);
      expect(UnitConverter.normalizeValue(1, 'MΩ', 'resistance')).toBeCloseTo(1e6);
    });

    it('should normalize inductance values', () => {
      expect(UnitConverter.normalizeValue(100, 'nH', 'inductance')).toBeCloseTo(100e-9);
      expect(UnitConverter.normalizeValue(10, 'µH', 'inductance')).toBeCloseTo(10e-6);
      expect(UnitConverter.normalizeValue(1, 'mH', 'inductance')).toBeCloseTo(1e-3);
    });

    it('should normalize voltage values', () => {
      expect(UnitConverter.normalizeValue(100, 'mV', 'voltage')).toBeCloseTo(0.1);
      expect(UnitConverter.normalizeValue(5, 'V', 'voltage')).toBeCloseTo(5);
      expect(UnitConverter.normalizeValue(1, 'kV', 'voltage')).toBeCloseTo(1000);
    });

    it('should normalize frequency values', () => {
      expect(UnitConverter.normalizeValue(100, 'Hz', 'frequency')).toBeCloseTo(100);
      expect(UnitConverter.normalizeValue(1, 'kHz', 'frequency')).toBeCloseTo(1000);
      expect(UnitConverter.normalizeValue(1, 'MHz', 'frequency')).toBeCloseTo(1e6);
    });

    it('should normalize current values', () => {
      expect(UnitConverter.normalizeValue(100, 'µA', 'current')).toBeCloseTo(100e-6);
      expect(UnitConverter.normalizeValue(100, 'mA', 'current')).toBeCloseTo(0.1);
      expect(UnitConverter.normalizeValue(1, 'A', 'current')).toBeCloseTo(1);
    });

    it('should normalize temperature values', () => {
      expect(UnitConverter.normalizeValue(25, '°C', 'temperature')).toBeCloseTo(25);
      expect(UnitConverter.normalizeValue(32, '°F', 'temperature')).toBeCloseTo(0);
    });

    it('should handle unknown types by returning the original value', () => {
      expect(UnitConverter.normalizeValue(100, 'units', 'unknown')).toBeCloseTo(100);
    });
  });

  describe('convertCapacitance', () => {
    it('should convert from pF to nF', () => {
      expect(UnitConverter.convertCapacitance({ value: 1000, unit: 'pF', originalText: '1000pF' }, 'nF')).toBeCloseTo(
        1,
      );
    });

    it('should convert from nF to µF', () => {
      expect(UnitConverter.convertCapacitance({ value: 100, unit: 'nF', originalText: '100nF' }, 'µF')).toBeCloseTo(
        0.1,
      );
    });

    it('should convert from µF to mF', () => {
      expect(UnitConverter.convertCapacitance({ value: 10, unit: 'µF', originalText: '10µF' }, 'mF')).toBeCloseTo(0.01);
    });

    it('should convert from mF to F', () => {
      expect(UnitConverter.convertCapacitance({ value: 5, unit: 'mF', originalText: '5mF' }, 'F')).toBeCloseTo(0.005);
    });

    it('should convert from F to pF', () => {
      expect(UnitConverter.convertCapacitance({ value: 1, unit: 'F', originalText: '1F' }, 'pF')).toBeCloseTo(1e12);
    });

    it('should convert from uF to nF (alternate µ)', () => {
      expect(UnitConverter.convertCapacitance({ value: 1, unit: 'uF', originalText: '1uF' }, 'nF')).toBeCloseTo(1000);
    });
  });

  describe('convertResistance', () => {
    it('should convert from kΩ to Ω', () => {
      expect(UnitConverter.convertResistance({ value: 4.7, unit: 'kΩ', originalText: '4.7kΩ' }, 'Ω')).toBeCloseTo(4700);
    });

    it('should convert from MΩ to kΩ', () => {
      expect(UnitConverter.convertResistance({ value: 1, unit: 'MΩ', originalText: '1MΩ' }, 'kΩ')).toBeCloseTo(1000);
    });

    it('should convert from GΩ to MΩ', () => {
      expect(UnitConverter.convertResistance({ value: 2.2, unit: 'GΩ', originalText: '2.2GΩ' }, 'MΩ')).toBeCloseTo(
        2200,
      );
    });

    it('should convert from mΩ to Ω', () => {
      expect(UnitConverter.convertResistance({ value: 500, unit: 'mΩ', originalText: '500mΩ' }, 'Ω')).toBeCloseTo(0.5);
    });

    it('should convert from Ω to mΩ', () => {
      expect(UnitConverter.convertResistance({ value: 1, unit: 'Ω', originalText: '1Ω' }, 'mΩ')).toBeCloseTo(1000);
    });
  });

  describe('convertInductance', () => {
    it('should convert from mH to µH', () => {
      expect(UnitConverter.convertInductance({ value: 1, unit: 'mH', originalText: '1mH' }, 'µH')).toBeCloseTo(1000);
    });

    it('should convert from µH to nH', () => {
      expect(UnitConverter.convertInductance({ value: 10, unit: 'µH', originalText: '10µH' }, 'nH')).toBeCloseTo(10000);
    });

    it('should convert from nH to H', () => {
      expect(UnitConverter.convertInductance({ value: 100, unit: 'nH', originalText: '100nH' }, 'H')).toBeCloseTo(
        100e-9,
      );
    });

    it('should convert from uH to nH (alternate µ)', () => {
      expect(UnitConverter.convertInductance({ value: 1, unit: 'uH', originalText: '1uH' }, 'nH')).toBeCloseTo(1000);
    });

    it('should convert from H to mH', () => {
      expect(UnitConverter.convertInductance({ value: 1, unit: 'H', originalText: '1H' }, 'mH')).toBeCloseTo(1000);
    });
  });

  describe('convertVoltage', () => {
    it('should convert from kV to V', () => {
      expect(UnitConverter.convertVoltage({ value: 1, unit: 'kV', originalText: '1kV' }, 'V')).toBeCloseTo(1000);
    });

    it('should convert from mV to V', () => {
      expect(UnitConverter.convertVoltage({ value: 500, unit: 'mV', originalText: '500mV' }, 'V')).toBeCloseTo(0.5);
    });

    it('should convert from V to mV', () => {
      expect(UnitConverter.convertVoltage({ value: 5, unit: 'V', originalText: '5V' }, 'mV')).toBeCloseTo(5000);
    });

    it('should convert from V to kV', () => {
      expect(UnitConverter.convertVoltage({ value: 1000, unit: 'V', originalText: '1000V' }, 'kV')).toBeCloseTo(1);
    });
  });

  describe('getBestCapacitanceUnit', () => {
    it('returns pF for values below 1nF', () => {
      expect(UnitConverter.getBestCapacitanceUnit(100e-12)).toBe('pF');
    });

    it('returns nF for values below 1µF', () => {
      expect(UnitConverter.getBestCapacitanceUnit(47e-9)).toBe('nF');
    });

    it('returns µF for values below 1mF', () => {
      expect(UnitConverter.getBestCapacitanceUnit(10e-6)).toBe('µF');
    });

    it('returns mF for values below 1F', () => {
      expect(UnitConverter.getBestCapacitanceUnit(0.5)).toBe('mF');
    });

    it('returns F for values >= 1F', () => {
      expect(UnitConverter.getBestCapacitanceUnit(1)).toBe('F');
      expect(UnitConverter.getBestCapacitanceUnit(100)).toBe('F');
    });
  });

  describe('getBestResistanceUnit', () => {
    it('returns mΩ for values below 1Ω', () => {
      expect(UnitConverter.getBestResistanceUnit(0.5)).toBe('mΩ');
    });

    it('returns Ω for values below 1kΩ', () => {
      expect(UnitConverter.getBestResistanceUnit(470)).toBe('Ω');
    });

    it('returns kΩ for values below 1MΩ', () => {
      expect(UnitConverter.getBestResistanceUnit(10e3)).toBe('kΩ');
    });

    it('returns MΩ for values below 1GΩ', () => {
      expect(UnitConverter.getBestResistanceUnit(4.7e6)).toBe('MΩ');
    });

    it('returns GΩ for values >= 1GΩ', () => {
      expect(UnitConverter.getBestResistanceUnit(1e9)).toBe('GΩ');
    });
  });

  describe('getBestInductanceUnit', () => {
    it('returns nH for values below 1µH', () => {
      expect(UnitConverter.getBestInductanceUnit(100e-9)).toBe('nH');
    });

    it('returns µH for values below 1mH', () => {
      expect(UnitConverter.getBestInductanceUnit(47e-6)).toBe('µH');
    });

    it('returns mH for values below 1H', () => {
      expect(UnitConverter.getBestInductanceUnit(10e-3)).toBe('mH');
    });

    it('returns H for values >= 1H', () => {
      expect(UnitConverter.getBestInductanceUnit(1)).toBe('H');
    });
  });
});
