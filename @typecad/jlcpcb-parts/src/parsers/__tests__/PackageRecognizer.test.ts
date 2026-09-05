import { describe, it, expect } from 'vitest';
import { PackageRecognizer } from '../PackageRecognizer.js';

describe('PackageRecognizer', () => {
  describe('package recognition', () => {
    it('should recognize SMD packages', () => {
      expect(PackageRecognizer.recognizePackage('0402')).toBe('0402');
      expect(PackageRecognizer.recognizePackage('I need a 0603 resistor')).toBe('0603');
      expect(PackageRecognizer.recognizePackage('Looking for 0805 capacitors')).toBe('0805');
      expect(PackageRecognizer.recognizePackage('1206 package')).toBe('1206');
    });

    it('should recognize SMD packages with different formats', () => {
      expect(PackageRecognizer.recognizePackage('04-02')).toBe('0402');
      expect(PackageRecognizer.recognizePackage('06-03 resistor')).toBe('0603');
    });

    it('should recognize SOT packages', () => {
      expect(PackageRecognizer.recognizePackage('SOT-23')).toBe('SOT-23');
      expect(PackageRecognizer.recognizePackage('SOT23')).toBe('SOT-23');
      expect(PackageRecognizer.recognizePackage('SOT-23-5')).toBe('SOT-23-5');
      expect(PackageRecognizer.recognizePackage('SOT235')).toBe('SOT-23-5');
    });

    it('should recognize SOIC packages', () => {
      expect(PackageRecognizer.recognizePackage('SOIC-8')).toBe('SOIC-8');
      expect(PackageRecognizer.recognizePackage('SOIC8')).toBe('SOIC-8');
      expect(PackageRecognizer.recognizePackage('SOIC-16')).toBe('SOIC-16');
      expect(PackageRecognizer.recognizePackage('SOIC16')).toBe('SOIC-16');
    });

    it('should recognize QFN packages', () => {
      expect(PackageRecognizer.recognizePackage('QFN-32')).toBe('QFN-32');
      expect(PackageRecognizer.recognizePackage('QFN32')).toBe('QFN-32');
      expect(PackageRecognizer.recognizePackage('QFN-48')).toBe('QFN-48');
      expect(PackageRecognizer.recognizePackage('QFN48')).toBe('QFN-48');
    });

    it('should recognize TO packages', () => {
      expect(PackageRecognizer.recognizePackage('TO-92')).toBe('TO-92');
      expect(PackageRecognizer.recognizePackage('TO92')).toBe('TO-92');
      expect(PackageRecognizer.recognizePackage('TO-220')).toBe('TO-220');
      expect(PackageRecognizer.recognizePackage('TO220')).toBe('TO-220');
    });

    it('should extract package from complex text', () => {
      expect(PackageRecognizer.recognizePackage('I need a SOT23 transistor')).toBe('SOT-23');
      expect(PackageRecognizer.recognizePackage('Looking for SOIC8 op-amp')).toBe('SOIC-8');
      expect(PackageRecognizer.recognizePackage('QFN32 microcontroller')).toBe('QFN-32');
    });

    it('should return undefined for unrecognized packages', () => {
      expect(PackageRecognizer.recognizePackage('unknown package')).toBeUndefined();
      expect(PackageRecognizer.recognizePackage('XYZ-123')).toBeUndefined();
    });
  });

  describe('package similarity', () => {
    it('should identify identical packages', () => {
      expect(PackageRecognizer.areSimilarPackages('0402', '0402')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('SOT-23', 'SOT-23')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('SOIC-8', 'SOIC-8')).toBe(true);
    });

    it('should identify similar packages with different formats', () => {
      expect(PackageRecognizer.areSimilarPackages('0402', '04-02')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('SOT-23', 'SOT23')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('SOIC-8', 'SOIC8')).toBe(true);
    });

    it('should identify adjacent SMD package sizes as similar', () => {
      expect(PackageRecognizer.areSimilarPackages('0402', '0603')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('0603', '0805')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('0805', '1206')).toBe(true);
    });

    it('should not identify non-adjacent SMD package sizes as similar', () => {
      expect(PackageRecognizer.areSimilarPackages('0402', '0805')).toBe(false);
      expect(PackageRecognizer.areSimilarPackages('0603', '1206')).toBe(false);
      expect(PackageRecognizer.areSimilarPackages('0201', '0805')).toBe(false);
    });

    it('should identify packages from the same IC family as similar', () => {
      expect(PackageRecognizer.areSimilarPackages('SOT-23', 'SOT-23-5')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('SOIC-8', 'SOIC-16')).toBe(true);
      expect(PackageRecognizer.areSimilarPackages('QFN-32', 'QFN-48')).toBe(true);
    });

    it('should not identify packages from different families as similar', () => {
      expect(PackageRecognizer.areSimilarPackages('SOT-23', 'SOIC-8')).toBe(false);
      expect(PackageRecognizer.areSimilarPackages('SOIC-16', 'QFN-32')).toBe(false);
      expect(PackageRecognizer.areSimilarPackages('QFN-48', 'TO-220')).toBe(false);
      expect(PackageRecognizer.areSimilarPackages('0402', 'SOT-23')).toBe(false);
    });
  });
});
