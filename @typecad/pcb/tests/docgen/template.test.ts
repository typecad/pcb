import { describe, it, expect } from 'vitest';
import { escapeHtml, generateHtmlDocument } from '../../src/cli/docgen/utils/template.js';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles string with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('generateHtmlDocument', () => {
  const metadata = {
    highlight: 'github-light',
    stylesheet: '',
    title: 'Test Board',
    company: 'TestCo',
    board_name: 'Board1',
    variant: 'revA',
    filename: 'test.kicad_pcb',
    revision: '1.0',
    date: '2024-01-01',
    kicad_theme: 'KiCAD Default',
    dark_mode: false,
  };

  it('produces valid HTML5 document', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Hello</p>', 'body {}');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('includes metadata in navbar', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).toContain('TestCo');
    expect(result).toContain('Board1');
    expect(result).toContain('1.0');
    expect(result).toContain('2024-01-01');
  });

  it('includes CSS content', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '.test { color: red; }');
    expect(result).toContain('.test { color: red; }');
  });

  it('escapes metadata in output', () => {
    const metaWithXss = { ...metadata, title: '<script>alert(1)</script>' };
    const result = generateHtmlDocument(metaWithXss, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>alert(1)</script>');
  });

  it('sets dark-mode class when dark_mode is true', () => {
    const darkMeta = { ...metadata, dark_mode: true };
    const result = generateHtmlDocument(darkMeta, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).toContain('class="dark-mode"');
  });

  it('sets light-mode class when dark_mode is false', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).toContain('class="light-mode"');
  });

  it('does not include external font links', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).not.toContain('fonts.googleapis.com');
  });

  it('does not include external favicon', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).not.toContain('typecad.net/favicon.ico');
  });

  it('includes stylesheet link when provided', () => {
    const metaWithStylesheet = { ...metadata, stylesheet: 'custom.css' };
    const result = generateHtmlDocument(metaWithStylesheet, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).toContain('href="custom.css"');
  });

  it('omits stylesheet link when empty', () => {
    const result = generateHtmlDocument(metadata, 'test.kicad_pcb', '<p>Test</p>', '');
    expect(result).not.toContain('<link rel="stylesheet"');
  });
});
