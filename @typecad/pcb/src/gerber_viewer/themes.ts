/**
 * Layer themes for the gerber/layout views — KiCad color-theme `board`
 * sections. The typecad house theme (the typecad.dev design system as a
 * board) is hand-written; the rest are vendored under `themes/` with their
 * licenses. The viewer embeds these as a JSON island and remaps each rendered
 * layer group's ink through a CSS variable, so switching themes is a
 * client-side restyle.
 */
import { TYPECAD } from './themes/typecad.js';
import { GRUVBOX } from './themes/gruvbox.js';
import { DRAGONMUX } from './themes/dragonmux.js';
import { KICADMAX } from './themes/kicadmax.js';
import { WITCHHAZEL } from './themes/witchhazel.js';
import { BEHAVE_DARK } from './themes/behave-dark.js';
import { BLUE_GREEN_DARK } from './themes/blue-green-dark.js';
import { EAGLE_DARK } from './themes/eagle-dark.js';
import { KICAD_2020 } from './themes/kicad-2020.js';
import { KICAD_CLASSIC } from './themes/kicad-classic.js';
import { NORD } from './themes/nord.js';
import type { LayerInfo } from './detect_layer.js';

export interface LayerTheme {
  id: string;
  label: string;
  /** provenance line shown in the select's tooltip */
  credit: string;
  /** SPDX id of the theme's license — vendored themes carry the text in
   *  themes/, the house theme rides on the package LICENSE */
  license: string;
  /** board background the canvas takes on */
  background: string;
  /** KiCad color-theme board section (copper.f/b/inN, f_silks, ...) */
  board: Record<string, unknown>;
}

/** Registered themes — the select box and the embedding iterate this. The
 *  house theme leads: the select's first option is its default selection. */
export const LAYER_THEME_LIST: LayerTheme[] = [
  TYPECAD,
  GRUVBOX,
  DRAGONMUX,
  KICADMAX,
  WITCHHAZEL,
  BEHAVE_DARK,
  BLUE_GREEN_DARK,
  EAGLE_DARK,
  KICAD_2020,
  KICAD_CLASSIC,
  NORD,
];

/** Resolve a user-facing theme name (id or label, spacing/punctuation
 *  insensitive) to a registered theme; KiCad's default maps to the vendored
 *  KiCad 2020 palette, and -dark/-light name variants resolve to the base
 *  palette (the board section has no light/dark split). null when nothing
 *  matches. */
export function findLayerTheme(name?: string): LayerTheme | null {
  if (!name) return null;
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(name);
  if (!want) return null;
  if (['kicaddefault', 'default', 'kicad', 'pcbnew'].includes(want)) return KICAD_2020;
  const candidates = [want, want.replace(/(?:dark|light)$/, '')];
  return (
    LAYER_THEME_LIST.find((t) => {
      const id = norm(t.id);
      const label = norm(t.label);
      return candidates.some((c) => c === id || c === label);
    }) ?? null
  );
}

/**
 * Theme ink color for a detected layer — the server-side twin of the
 * viewer's client-side `themeColorFor` (render/viewer_html.ts); keep the two
 * in sync. Returns null when the theme carries no entry for the layer.
 */
export function layerThemeColor(theme: LayerTheme, info: LayerInfo): string | null {
  let key: string | null = null;
  if (info.kind === 'copper') {
    if (info.side === 'back') key = 'b';
    else if (info.side === 'inner') key = `in${info.copperIndex ?? 1}`;
    else key = 'f';
    const cop = theme.board['copper'] as Record<string, unknown> | undefined;
    const color = cop?.[key];
    return typeof color === 'string' ? color : null;
  }
  const suffix =
    info.kind === 'silkscreen'
      ? 'silks'
      : info.kind === 'mask'
        ? 'mask'
        : info.kind === 'paste'
          ? 'paste'
          : info.kind === 'adhes'
            ? 'adhes'
            : info.kind === 'fab'
              ? 'fab'
              : info.kind === 'other'
                ? 'cmts_user'
                : info.kind === 'edge'
                  ? 'edge_cuts'
                  : info.kind === 'drill'
                    ? 'via_through'
                    : null;
  if (!suffix) return null;
  const color =
    suffix === 'edge_cuts' || suffix === 'via_through' || suffix === 'cmts_user'
      ? theme.board[suffix]
      : theme.board[`${info.side === 'back' ? 'b' : 'f'}_${suffix}`];
  return typeof color === 'string' ? color : null;
}
