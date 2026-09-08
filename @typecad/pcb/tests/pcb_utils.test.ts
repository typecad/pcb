import { describe, it, expect } from 'vitest';
import { normalizeNetName, formatCallSite, getErrorMessage } from '../src/pcb/pcb_utils.js';

describe('pcb_utils', () => {
  describe('normalizeNetName', () => {
    it('should lowercase net names', () => {
      expect(normalizeNetName('VCC')).toBe('vcc');
    });

    it('should strip leading slash', () => {
      expect(normalizeNetName('/GND')).toBe('gnd');
    });

    it('should handle both slash and uppercase', () => {
      expect(normalizeNetName('/VCC')).toBe('vcc');
    });

    it('should trim whitespace', () => {
      expect(normalizeNetName('  GND  ')).toBe('gnd');
    });

    it('should return undefined for undefined input', () => {
      expect(normalizeNetName(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(normalizeNetName('')).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      expect(normalizeNetName('   ')).toBeUndefined();
    });

    it('should return undefined for non-string input', () => {
      expect(normalizeNetName(42 as any)).toBeUndefined();
    });

    it('should only strip one leading slash', () => {
      expect(normalizeNetName('//VCC')).toBe('/vcc');
    });

    it('should handle already-normalized name', () => {
      expect(normalizeNetName('gnd')).toBe('gnd');
    });
  });

  describe('formatCallSite', () => {
    it('should format a valid call site', () => {
      const result = formatCallSite({ file: 'test.ts', line: 42, column: 5 });
      expect(result).toBe(' (called from test.ts:42)');
    });

    it('should return empty string for undefined', () => {
      expect(formatCallSite(undefined)).toBe('');
    });

    it('should return empty string for null', () => {
      expect(formatCallSite(null)).toBe('');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      expect(getErrorMessage(new Error('test error'))).toBe('test error');
    });

    it('should stringify non-Error values', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('should stringify numbers', () => {
      expect(getErrorMessage(42)).toBe('42');
    });

    it('should handle null', () => {
      expect(getErrorMessage(null)).toBe('null');
    });
  });
});
