# Layer themes

KiCad color themes vendored for the gerber/layout views. Each theme keeps its
upstream JSON (provenance) and license beside a trimmed `.ts` build of the
`board` section (copper layers + per-layer colors + background) that the
viewer embeds.

| Theme     | Upstream                                                       | License    | Redistribution                                  |
| --------- | -------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| gruvbox   | https://github.com/AlexanderBrevig/kicad-gruvbox-theme         | MIT        | Allowed — keep `gruvbox-LICENSE-MIT` with it    |
| dragonmux | https://github.com/dragonmux/kicad-dragonmux-theme             | CC0 1.0    | Public domain — no conditions                   |

Both licenses permit redistribution inside this project.

## Adding a theme

1. Drop the KiCad color-theme JSON here as `<id>.json` plus its LICENSE file
   (name it `<id>-LICENSE-<SPDX>`).
2. Generate the trimmed const: `node -e` snippet mirroring the existing
   headers, or hand-write `<id>.ts` exporting
   `{ id, label, credit, license, background, board }`.
3. Register it in `../themes.ts` (`LAYER_THEME_LIST`) — the select box,
   persistence, and embedding pick it up automatically.
4. Check the license first: MIT/Apache-2.0/BSD/CC0 are fine to vendor with
   their notice. GPL/CC-BY-ND are not compatible with redistribution here —
   do not vendor those without a separate decision.
