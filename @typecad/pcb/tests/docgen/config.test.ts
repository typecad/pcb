import { describe, it, expect } from 'vitest';
import { PCBConfig, SVGConfig, CacheConfig } from '../../src/cli/docgen/utils/config.js';

describe('PCBConfig', () => {
  it('has default width of 2000', () => {
    expect(PCBConfig.dimensions.defaultWidth).toBe(2000);
  });

  it('has all required color definitions', () => {
    const requiredColors = [
      'fr4',
      'ptfe',
      'polyimide',
      'phenolic',
      'aluminum',
      'silkscreen',
      'solderMask',
      'copper',
      'default',
    ];
    for (const color of requiredColors) {
      expect(PCBConfig.colors[color as keyof typeof PCBConfig.colors]).toBeDefined();
    }
  });

  it('has all required layer height definitions', () => {
    const requiredHeights = ['silkscreen', 'paste', 'mask', 'copper', 'core', 'prepreg', 'default'];
    for (const height of requiredHeights) {
      expect(PCBConfig.layerHeights[height as keyof typeof PCBConfig.layerHeights]).toBeGreaterThan(0);
    }
  });

  it('all colors are valid hex strings', () => {
    for (const [, value] of Object.entries(PCBConfig.colors)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('SVGConfig', () => {
  it('has style definitions', () => {
    expect(SVGConfig.styles).toHaveProperty('layerText');
    expect(SVGConfig.styles).toHaveProperty('title');
    expect(SVGConfig.styles).toHaveProperty('connectorLine');
  });

  it('styles are non-empty strings', () => {
    for (const [, value] of Object.entries(SVGConfig.styles)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('CacheConfig', () => {
  it('has positive max size', () => {
    expect(CacheConfig.maxSize).toBeGreaterThan(0);
  });

  it('has positive TTL', () => {
    expect(CacheConfig.ttl).toBeGreaterThan(0);
  });
});
