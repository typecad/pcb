import { describe, it, expect } from 'vitest';
import { annotateLayerSvgs } from '../../src/gitdiff/core/svg-diff-annotator.js';

describe('svg-diff-annotator', () => {
  it('returns null for empty SVGs', () => {
    const result = annotateLayerSvgs('<svg></svg>', '<svg></svg>');
    expect(result).toBeNull();
  });

  it('returns null for SVGs with no differences', () => {
    const result = annotateLayerSvgs('<svg></svg>', '<svg></svg>');
    expect(result).toBeNull();
  });

  it('annotates identical SVGs with diff-hidden on matching elements', () => {
    const svg = '<svg><path d="M0 0L10 10" /></svg>';
    const result = annotateLayerSvgs(svg, svg);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-hidden');
  });

  it('marks removed elements in original', () => {
    const orig = '<svg><path d="M0 0L10 10" /></svg>';
    const mod = '<svg></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedOriginal).toContain('d="M0 0L10 10"');
  });

  it('marks added elements in modified', () => {
    const orig = '<svg></svg>';
    const mod = '<svg><circle cx="5" cy="5" r="3" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedModified).toContain('diff-added');
    expect(result!.annotatedModified).toContain('cx="5" cy="5" r="3"');
  });

  it('marks matched elements as hidden in original', () => {
    const orig = '<svg><rect x="0" y="0" width="10" height="10" /></svg>';
    const mod = '<svg><rect x="0" y="0" width="10" height="10" /><circle cx="5" cy="5" r="2" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-hidden');
    expect(result!.annotatedOriginal).not.toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('handles path elements correctly', () => {
    const orig = '<svg><path d="M 0 0 L 10 10 L 20 0 Z" /></svg>';
    const mod = '<svg><path d="M 0 0 L 20 20 L 40 0 Z" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('annotates identical lines with diff-hidden', () => {
    const svg = '<svg><line x1="0" y1="0" x2="10" y2="10" /></svg>';
    const result = annotateLayerSvgs(svg, svg);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-hidden');
  });

  it('detects different lines as changes', () => {
    const orig = '<svg><line x1="0" y1="0" x2="10" y2="10" /></svg>';
    const mod = '<svg><line x1="0" y1="0" x2="20" y2="20" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('handles multiple elements of same type', () => {
    const orig = '<svg><circle cx="1" cy="1" r="1" /><circle cx="2" cy="2" r="2" /></svg>';
    const mod = '<svg><circle cx="1" cy="1" r="1" /><circle cx="3" cy="3" r="3" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-hidden');
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('handles polygon and polyline', () => {
    const orig = '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>';
    const mod = '<svg><polygon points="0,0 20,0 20,20 0,20" /></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('handles text elements', () => {
    const orig = '<svg><text x="10" y="20">Hello</text></svg>';
    const mod = '<svg><text x="10" y="20">World</text></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('handles elements with existing class attributes', () => {
    const orig = '<svg><path class="some-class" d="M0 0L10 10" /></svg>';
    const mod = '<svg></svg>';
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-removed');
    expect(result!.annotatedOriginal).toContain('some-class');
  });

  it('handles real-world KiCAD SVG with groups and nesting', () => {
    const orig = `<svg viewBox="0 0 100 100">
            <g stroke="#ffffff" fill="none">
                <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" />
                <circle cx="50" cy="50" r="10" />
            </g>
        </svg>`;
    const mod = `<svg viewBox="0 0 100 100">
            <g stroke="#ffffff" fill="none">
                <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" />
                <circle cx="50" cy="50" r="20" />
            </g>
        </svg>`;
    const result = annotateLayerSvgs(orig, mod);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('diff-hidden');
    expect(result!.annotatedModified).toContain('diff-added');
  });

  it('appends to existing class attribute', () => {
    const svg = '<svg><path class="existing" d="M0 0" /></svg>';
    const empty = '<svg></svg>';
    const result = annotateLayerSvgs(svg, empty);
    expect(result).not.toBeNull();
    expect(result!.annotatedOriginal).toContain('class="existing diff-removed"');
  });
});
