import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import multimd from 'markdown-it-multimd-table-ext';
import { restoreRemovedMarkdownItUtils } from '../index.js';

const PLUGIN_OPTS = { multiline: true, rowspan: true, headerless: true, multibody: true, autolabel: true };

describe('restoreRemovedMarkdownItUtils (multimd-table-ext ↔ markdown-it 15 compat)', () => {
  it('lets the plugin load and render a table against the pinned markdown-it', () => {
    const md = restoreRemovedMarkdownItUtils(new MarkdownIt());
    expect(() => md.use(multimd, { ...PLUGIN_OPTS })).not.toThrow();
    const html = md.render('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table');
    expect(html).toContain('<td>1</td>');
  });

  it('keeps the restoration per-instance (no global mutation of md.utils)', () => {
    const shimmed = restoreRemovedMarkdownItUtils(new MarkdownIt());
    const untouched = new MarkdownIt();
    expect(typeof shimmed.utils.assign).toBe('function');
    expect(untouched.utils.assign).toBeUndefined();
  });

  // Canary: the raw combination still breaks. When this starts failing, the
  // plugin shipped a markdown-it 14+ fix and restoreRemovedMarkdownItUtils
  // (plus this test) should be deleted.
  it('without the shim the plugin init throws (documents why the shim exists)', () => {
    const md = new MarkdownIt();
    expect(() => md.use(multimd, { ...PLUGIN_OPTS })).toThrow();
  });
});
