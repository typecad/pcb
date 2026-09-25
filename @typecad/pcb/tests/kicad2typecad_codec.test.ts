import { describe, it, expect } from 'vitest';
import { encodeCodeMetadata, decodeCodeMetadata } from '../src/kicad2typecad/codec.js';
import type { CodeMetadata } from '../src/kicad2typecad/types.js';

describe('codec', () => {
  describe('encodeCodeMetadata', () => {
    it('should produce a typecad:v1: prefixed string', () => {
      const meta: CodeMetadata = { v: 1, u: 'test-uuid' };
      const encoded = encodeCodeMetadata(meta);
      expect(encoded).toMatch(/^typecad:v1:/);
    });

    it('should encode all fields', () => {
      const meta: CodeMetadata = {
        v: 1,
        u: 'uuid-123',
        n: 'myResistor',
        t: false,
        h: 'abc123',
        f: '/path/to/file.ts',
        l: 42,
      };
      const encoded = encodeCodeMetadata(meta);
      expect(encoded).toMatch(/^typecad:v1:/);
      const decoded = decodeCodeMetadata(encoded) as CodeMetadata;
      expect(decoded.v).toBe(1);
      expect(decoded.u).toBe('uuid-123');
      expect(decoded.n).toBe('myResistor');
      expect(decoded.t).toBe(false);
      expect(decoded.h).toBe('abc123');
      expect(decoded.f).toBe('/path/to/file.ts');
      expect(decoded.l).toBe(42);
    });

    it('should omit undefined fields from encoding', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid' };
      const encoded = encodeCodeMetadata(meta);
      const jsonPart = encoded.slice('typecad:v1:'.length);
      const decoded = JSON.parse(Buffer.from(jsonPart, 'base64url').toString('utf-8'));
      expect(decoded).not.toHaveProperty('n');
      expect(decoded).not.toHaveProperty('t');
    });
  });

  describe('decodeCodeMetadata', () => {
    it('should decode a round-trip encoded value', () => {
      const meta: CodeMetadata = { v: 1, u: 'test-uuid', n: 'cap' };
      const encoded = encodeCodeMetadata(meta);
      const decoded = decodeCodeMetadata(encoded);
      expect(decoded).not.toBeNull();
      expect((decoded as CodeMetadata).u).toBe('test-uuid');
      expect((decoded as CodeMetadata).n).toBe('cap');
    });

    it('should return null for null input', () => {
      expect(decodeCodeMetadata(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(decodeCodeMetadata(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(decodeCodeMetadata('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(decodeCodeMetadata('   ')).toBeNull();
    });

    it('should strip surrounding quotes', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid' };
      const encoded = `"${encodeCodeMetadata(meta)}"`;
      const decoded = decodeCodeMetadata(encoded);
      expect(decoded).not.toBeNull();
      expect((decoded as CodeMetadata).u).toBe('uuid');
    });

    it('should strip surrounding backticks', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid' };
      const encoded = '`' + encodeCodeMetadata(meta) + '`';
      const decoded = decodeCodeMetadata(encoded);
      expect(decoded).not.toBeNull();
    });

    it('should return null for legacy format when quotes are stripped', () => {
      const legacy = "{'variable':'myResistor','file':'/path/to/index.ts','isThis':true,'line':24}";
      const decoded = decodeCodeMetadata(legacy);
      expect(decoded).toBeNull();
    });

    it('should return null for invalid legacy format', () => {
      expect(decodeCodeMetadata('not valid metadata')).toBeNull();
    });

    it('should return null for invalid base64 in new format', () => {
      expect(decodeCodeMetadata('typecad:v1:!!!invalid!!!')).toBeNull();
    });

    it('should return null for valid base64 but missing v=1', () => {
      const payload = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString('base64url');
      expect(decodeCodeMetadata('typecad:v1:' + payload)).toBeNull();
    });
  });

  describe('round-trip', () => {
    it('should preserve all metadata fields', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid-456', n: 'cap' };
      const encoded = encodeCodeMetadata(meta);
      const decoded = decodeCodeMetadata(encoded) as CodeMetadata;
      expect(decoded.u).toBe('uuid-456');
      expect(decoded.n).toBe('cap');
      expect(decoded.v).toBe(1);
    });

    it('should handle special characters in file path', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid', f: 'C:\\Users\\test\\my project.ts' };
      const encoded = encodeCodeMetadata(meta);
      const decoded = decodeCodeMetadata(encoded) as CodeMetadata;
      expect(decoded.f).toBe('C:\\Users\\test\\my project.ts');
    });
  });
});
