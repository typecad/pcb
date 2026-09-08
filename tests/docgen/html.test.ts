import { describe, it, expect } from 'vitest';
import { wrapSectionsInHtml } from '../../src/cli/docgen/utils/html.js';

describe('wrapSectionsInHtml', () => {
  it('wraps a single h1 section', () => {
    const html = '<h1>Title</h1><p>Content</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toContain('<section><h1>Title</h1><p>Content</p></section>');
  });

  it('wraps multiple h1 sections', () => {
    const html = '<h1>First</h1><p>A</p><h1>Second</h1><p>B</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toContain('<section><h1>First</h1><p>A</p></section>');
    expect(result).toContain('<section><h1>Second</h1><p>B</p></section>');
  });

  it('wraps content before first h1 in a section', () => {
    const html = '<p>Intro</p><h1>Title</h1><p>Content</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toContain('<section><p>Intro</p></section>');
    expect(result).toContain('<section><h1>Title</h1><p>Content</p></section>');
  });

  it('wraps entire content in a section when no h1 exists', () => {
    const html = '<h2>Subtitle</h2><p>Content</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toBe('<section><h2>Subtitle</h2><p>Content</p></section>');
  });

  it('returns empty string for empty input', () => {
    const result = wrapSectionsInHtml('');
    expect(result).toBe('');
  });

  it('handles whitespace-only input', () => {
    const result = wrapSectionsInHtml('   ');
    expect(result).toBe('');
  });

  it('handles h1 with other tags between sections', () => {
    const html = '<h1>A</h1><h2>sub</h2><p>text</p><h1>B</h1><p>more</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toContain('<section><h1>A</h1><h2>sub</h2><p>text</p></section>');
    expect(result).toContain('<section><h1>B</h1><p>more</p></section>');
  });

  it('handles self-closing tags', () => {
    const html = '<h1>Title</h1><br/><p>Content</p>';
    const result = wrapSectionsInHtml(html);
    expect(result).toContain('<section>');
  });
});
