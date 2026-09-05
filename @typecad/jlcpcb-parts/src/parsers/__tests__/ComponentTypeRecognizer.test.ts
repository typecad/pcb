import { describe, it, expect } from 'vitest';
import { ComponentTypeRecognizer } from '../ComponentTypeRecognizer.js';

describe('ComponentTypeRecognizer', () => {
  describe('component type recognition', () => {
    it('should recognize capacitor types', () => {
      expect(ComponentTypeRecognizer.recognizeComponentType('X7R capacitor')).toBe('X7R');
      expect(ComponentTypeRecognizer.recognizeComponentType('NP0 ceramic capacitor')).toBe('NP0');
      expect(ComponentTypeRecognizer.recognizeComponentType('MLCC capacitor')).toBe('MLCC');
      expect(ComponentTypeRecognizer.recognizeComponentType('Tantalum capacitor')).toBe('Tantalum');
    });

    it('should recognize resistor types', () => {
      expect(ComponentTypeRecognizer.recognizeComponentType('Thick Film resistor')).toBe('Thick Film');
      expect(ComponentTypeRecognizer.recognizeComponentType('Metal Film resistor')).toBe('Metal Film');
      expect(ComponentTypeRecognizer.recognizeComponentType('SMD resistor')).toBe('SMD');
      expect(ComponentTypeRecognizer.recognizeComponentType('Precision resistor')).toBe('Precision');
    });

    it('should recognize inductor types', () => {
      expect(ComponentTypeRecognizer.recognizeComponentType('Ferrite inductor')).toBe('Ferrite');
      expect(ComponentTypeRecognizer.recognizeComponentType('Shielded inductor')).toBe('Shielded');
      expect(ComponentTypeRecognizer.recognizeComponentType('Power inductor')).toBe('Power');
      expect(ComponentTypeRecognizer.recognizeComponentType('Wirewound inductor')).toBe('Wirewound');
    });

    it('should recognize general component categories', () => {
      expect(ComponentTypeRecognizer.recognizeComponentType('capacitor')).toBe('Capacitor');
      expect(ComponentTypeRecognizer.recognizeComponentType('resistor')).toBe('Resistor');
      expect(ComponentTypeRecognizer.recognizeComponentType('inductor')).toBe('Inductor');
      expect(ComponentTypeRecognizer.recognizeComponentType('diode')).toBe('Diode');
      expect(ComponentTypeRecognizer.recognizeComponentType('transistor')).toBe('Transistor');
      expect(ComponentTypeRecognizer.recognizeComponentType('integrated circuit')).toBe('IC');
      expect(ComponentTypeRecognizer.recognizeComponentType('connector')).toBe('Connector');
      expect(ComponentTypeRecognizer.recognizeComponentType('switch')).toBe('Switch');
      expect(ComponentTypeRecognizer.recognizeComponentType('relay')).toBe('Relay');
      expect(ComponentTypeRecognizer.recognizeComponentType('fuse')).toBe('Fuse');
      expect(ComponentTypeRecognizer.recognizeComponentType('crystal oscillator')).toBe('Crystal/Oscillator');
      expect(ComponentTypeRecognizer.recognizeComponentType('LED')).toBe('LED');
      expect(ComponentTypeRecognizer.recognizeComponentType('sensor')).toBe('Sensor');
    });

    it('should return undefined for unrecognized types', () => {
      expect(ComponentTypeRecognizer.recognizeComponentType('unknown component')).toBeUndefined();
      expect(ComponentTypeRecognizer.recognizeComponentType('XYZ123')).toBeUndefined();
    });
  });

  describe('tolerance extraction', () => {
    it('should extract tolerance with ± symbol', () => {
      expect(ComponentTypeRecognizer.extractTolerance('±1% tolerance')).toBe('±1%');
      expect(ComponentTypeRecognizer.extractTolerance('± 5% tolerance')).toBe('±5%');
      expect(ComponentTypeRecognizer.extractTolerance('±10%')).toBe('±10%');
    });

    it('should extract tolerance with +/- symbol', () => {
      expect(ComponentTypeRecognizer.extractTolerance('+/-1% tolerance')).toBe('±1%');
      expect(ComponentTypeRecognizer.extractTolerance('+/- 5% tolerance')).toBe('±5%');
      expect(ComponentTypeRecognizer.extractTolerance('+/-10%')).toBe('±10%');
    });

    it('should extract tolerance without ± symbol', () => {
      expect(ComponentTypeRecognizer.extractTolerance('1% tolerance')).toBe('±1%');
      expect(ComponentTypeRecognizer.extractTolerance('5% tolerance')).toBe('±5%');
      expect(ComponentTypeRecognizer.extractTolerance('tolerance of 10%')).toBe('±10%');
    });

    it('should extract decimal tolerance values', () => {
      expect(ComponentTypeRecognizer.extractTolerance('±0.1% tolerance')).toBe('±0.1%');
      expect(ComponentTypeRecognizer.extractTolerance('0.5% tolerance')).toBe('±0.5%');
      expect(ComponentTypeRecognizer.extractTolerance('tolerance of 2.5%')).toBe('±2.5%');
    });

    it('should return undefined for missing tolerance', () => {
      expect(ComponentTypeRecognizer.extractTolerance('no tolerance specified')).toBeUndefined();
      expect(ComponentTypeRecognizer.extractTolerance('XYZ123')).toBeUndefined();
    });
  });

  describe('keyword extraction', () => {
    it('should extract common keywords', () => {
      const keywords = ComponentTypeRecognizer.extractKeywords('SMD High Voltage Low ESR capacitor');
      expect(keywords).toContain('SMD');
      expect(keywords).toContain('High Voltage');
      expect(keywords).toContain('Low ESR');
    });

    it('should extract industry standard keywords', () => {
      const keywords = ComponentTypeRecognizer.extractKeywords('Automotive Grade AEC-Q200 RoHS compliant');
      expect(keywords).toContain('Automotive Grade');
      expect(keywords).toContain('AEC-Q200');
      expect(keywords).toContain('RoHS');
    });

    it('should extract meaningful words as keywords', () => {
      const keywords = ComponentTypeRecognizer.extractKeywords('blue ceramic capacitor with gold plating');
      expect(keywords).toContain('blue');
      expect(keywords).toContain('ceramic');
      expect(keywords).toContain('capacitor');
      expect(keywords).toContain('gold');
      expect(keywords).toContain('plating');
    });

    it('should not extract stop words or short words', () => {
      const keywords = ComponentTypeRecognizer.extractKeywords('the and for with this that from');
      expect(keywords.length).toBe(0);

      const keywords2 = ComponentTypeRecognizer.extractKeywords('a to in on at by');
      expect(keywords2.length).toBe(0);
    });

    it('should not extract numbers as keywords', () => {
      const keywords = ComponentTypeRecognizer.extractKeywords('100 200 300 400');
      expect(keywords.length).toBe(0);
    });
  });
});
