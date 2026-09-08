import { describe, it, expect } from 'vitest';
import { sanitizeSvg, computeSvgBBox, parseHexColor, cropSvg } from '../../src/gitdiff/utils/file-utils.js';

describe('sanitizeSvg', () => {
  it('strips script tags and content', () => {
    const input = '<svg><script>alert("xss")</script><path d="M0 0"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<path d="M0 0"/>');
  });

  it('strips foreignObject tags', () => {
    const input = '<svg><foreignObject><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain('foreignObject');
    expect(result).not.toContain('iframe');
  });

  it('strips event handler attributes', () => {
    const input = '<svg><path d="M0 0" onclick="alert(1)" onload="evil()" /></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onload');
    expect(result).toContain('<path d="M0 0"');
  });

  it('strips javascript: URLs in href', () => {
    const input = '<svg><a href="javascript:alert(1)">click</a></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain('javascript');
  });

  it('strips javascript: URLs in xlink:href', () => {
    const input = '<svg><use xlink:href="javascript:alert(1)" /></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain('javascript');
  });

  it('preserves safe SVG content', () => {
    const input = '<svg viewBox="0 0 100 100"><path d="M0 0L10 10" stroke="#fff" fill="none" /></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('viewBox');
    expect(result).toContain('M0 0L10 10');
    expect(result).toContain('stroke="#fff"');
  });
});

describe('computeSvgBBox', () => {
  it('computes bbox for paths', () => {
    const svg = '<svg><path d="M0 0L10 0L10 10L0 10Z" /></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(0);
    expect(bbox!.minY).toBeLessThanOrEqual(0);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(10);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(10);
  });

  it('computes bbox for circles', () => {
    const svg = '<svg><circle cx="5" cy="5" r="3" /></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(2);
    expect(bbox!.minY).toBeLessThanOrEqual(2);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(8);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(8);
  });

  it('computes bbox for rects', () => {
    const svg = '<svg><rect x="1" y="2" width="10" height="20" /></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(1);
    expect(bbox!.minY).toBeLessThanOrEqual(2);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(11);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(22);
  });

  it('computes bbox for lines', () => {
    const svg = '<svg><line x1="0" y1="0" x2="15" y2="30" /></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(0);
    expect(bbox!.minY).toBeLessThanOrEqual(0);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(15);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(30);
  });

  it('computes bbox for text', () => {
    const svg = '<svg><text x="10" y="20">Label</text></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(10);
    expect(bbox!.minY).toBeLessThanOrEqual(20);
  });

  it('returns null for empty SVG', () => {
    const bbox = computeSvgBBox('<svg></svg>');
    expect(bbox).toBeNull();
  });

  it('includes padding', () => {
    const svg = '<svg><rect x="0" y="0" width="10" height="10" /></svg>';
    const bbox = computeSvgBBox(svg, 5);
    expect(bbox!.minX).toBeLessThanOrEqual(-5);
    expect(bbox!.minY).toBeLessThanOrEqual(-5);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(15);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(15);
  });

  it('computes union bbox for multiple elements', () => {
    const svg = '<svg><rect x="0" y="0" width="5" height="5" /><circle cx="20" cy="20" r="3" /></svg>';
    const bbox = computeSvgBBox(svg);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeLessThanOrEqual(0);
    expect(bbox!.minY).toBeLessThanOrEqual(0);
    expect(bbox!.maxX).toBeGreaterThanOrEqual(23);
    expect(bbox!.maxY).toBeGreaterThanOrEqual(23);
  });
});

describe('cropSvg', () => {
  it('sets viewBox to match content bounds', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20" /></svg>';
    const cropped = cropSvg(svg);
    expect(cropped).toContain('viewBox="');
    const vb = cropped.match(/viewBox="([^"]+)"/);
    expect(vb).not.toBeNull();
    const [minX, minY, w, h] = vb![1].split(' ').map(Number);
    expect(minX).toBeLessThanOrEqual(10);
    expect(minY).toBeLessThanOrEqual(10);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('returns original SVG if no elements found', () => {
    const svg = '<svg viewBox="0 0 100 100"></svg>';
    const cropped = cropSvg(svg);
    expect(cropped).toBe(svg);
  });
});

describe('parseHexColor', () => {
  it('parses full hex color', () => {
    const { r, g, b } = parseHexColor('#ff6600');
    expect(r).toBe(255);
    expect(g).toBe(102);
    expect(b).toBe(0);
  });

  it('parses hex without hash', () => {
    const { r, g, b } = parseHexColor('4caf50');
    expect(r).toBe(76);
    expect(g).toBe(175);
    expect(b).toBe(80);
  });

  it('parses black', () => {
    const { r, g, b } = parseHexColor('#000000');
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('parses white', () => {
    const { r, g, b } = parseHexColor('#ffffff');
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it('throws on invalid hex color', () => {
    expect(() => parseHexColor('red')).toThrow('Invalid hex color');
    expect(() => parseHexColor('#12345')).toThrow('Invalid hex color');
    expect(() => parseHexColor('#gggggg')).toThrow('Invalid hex color');
  });
});
