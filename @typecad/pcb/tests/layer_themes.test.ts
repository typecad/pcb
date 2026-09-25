// Vendored layer themes: every registered entry must carry what the viewer's
// client-side mapper needs, so adding a theme that silently half-works fails
// here instead of in a rendered page.
import { describe, expect, it } from 'vitest';
import { LAYER_THEME_LIST } from '../src/gerber_viewer/themes.js';

describe('layer themes', () => {
  it('registers at least the vendored themes with provenance', () => {
    expect(LAYER_THEME_LIST.length).toBeGreaterThanOrEqual(2);
    expect(LAYER_THEME_LIST.map((t) => t.id)).toEqual(
      expect.arrayContaining(['gruvbox', 'dragonmux']),
    );
    for (const t of LAYER_THEME_LIST) {
      expect(t.label).toBeTruthy();
      expect(t.credit).toBeTruthy();
      expect(t.license).toMatch(/^(MIT|Apache-2\.0|BSD-\d-Clause|CC0-1\.0|ISC)$/);
      expect(t.background).toMatch(/^(rgb|rgba|#)/);
    }
  });

  it('carries the layer keys the gerber/layout mapper resolves', () => {
    for (const t of LAYER_THEME_LIST) {
      const b = t.board as Record<string, unknown>;
      const copper = b.copper as Record<string, string> | undefined;
      expect(copper?.f, `${t.id}: copper.f`).toMatch(/^(rgb|rgba|#)/);
      expect(copper?.b, `${t.id}: copper.b`).toMatch(/^(rgb|rgba|#)/);
      for (const key of [
        'f_silks',
        'b_silks',
        'f_mask',
        'b_mask',
        'f_paste',
        'b_paste',
        'f_fab',
        'b_fab',
        'f_crtyd',
        'b_crtyd',
        'edge_cuts',
      ]) {
        expect(b[key], `${t.id}: ${key}`).toMatch(/^(rgb|rgba|#)/);
      }
    }
  });
});
