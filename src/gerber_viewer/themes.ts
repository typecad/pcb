/**
 * Layer themes for the gerber/layout views — KiCad color-theme `board`
 * sections, vendored under `themes/` with their licenses. The viewer embeds
 * these as a JSON island and remaps each rendered layer group's ink through
 * a CSS variable, so switching themes is a client-side restyle.
 */
import { GRUVBOX } from './themes/gruvbox.js';
import { DRAGONMUX } from './themes/dragonmux.js';

export interface LayerTheme {
  id: string;
  label: string;
  /** provenance line shown in the select's tooltip */
  credit: string;
  /** SPDX id of the upstream license (the text lives in themes/) */
  license: string;
  /** board background the canvas takes on */
  background: string;
  /** KiCad color-theme board section (copper.f/b/inN, f_silks, ...) */
  board: Record<string, unknown>;
}

/** Registered themes — the select box and the embedding iterate this. */
export const LAYER_THEME_LIST: LayerTheme[] = [GRUVBOX, DRAGONMUX];
