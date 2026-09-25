/**
 * Layer themes for the gerber/layout views — KiCad color-theme `board`
 * sections, vendored under `themes/` with their licenses. The viewer embeds
 * these as a JSON island and remaps each rendered layer group's ink through
 * a CSS variable, so switching themes is a client-side restyle.
 */
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
export const LAYER_THEME_LIST: LayerTheme[] = [
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
