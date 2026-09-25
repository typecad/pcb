# Layer themes

KiCad color themes vendored for the gerber/layout views. Each theme keeps its
upstream JSON (provenance) and license beside a trimmed `.ts` build of the
`board` section (copper layers + per-layer colors + background) that the
viewer embeds.

| Theme            | Upstream                                                       | License    | Redistribution                                        |
| ---------------- | -------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| gruvbox          | https://github.com/AlexanderBrevig/kicad-gruvbox-theme         | MIT        | Allowed — keep `gruvbox-LICENSE-MIT` with it          |
| dragonmux        | https://github.com/dragonmux/kicad-dragonmux-theme             | CC0 1.0    | Public domain — no conditions                         |
| kicadmax         | https://github.com/maximekahn/KiCadMaxColors                   | MIT        | Allowed — keep `kicadmax-LICENSE-MIT` with it         |
| witchhazel       | https://github.com/theacodes/witchhazel                        | Apache-2.0 | Allowed — keep `witchhazel-LICENSE-Apache-2.0` with it |
| behave-dark      | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |
| blue-green-dark  | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |
| eagle-dark       | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |
| kicad-2020       | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |
| kicad-classic    | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |
| nord             | https://github.com/pointhi/kicad-color-schemes                 | CC0 1.0    | Public domain — no conditions                         |

All licenses permit redistribution inside this project. The six
`kicad-color-schemes` themes share one upstream CC0 license file
(`kicad-color-schemes-LICENSE-CC0`) instead of a per-theme copy.

`kicad-classic` has no upstream v6 JSON — its `kicad-classic.json` is
converted from the KiCad 5 `pcbnew` color fragment kept here as
`kicad-classic-pcbnew-legacy`.

Upstream themes from
https://github.com/pointhi/kicad-color-schemes that are **not** vendored:
black-white, blue-tone, monokai, neon, solarized-dark, solarized-light,
wdark, wlight — they define schematic (eeschema) colors only and carry no
`board` section in any upstream format, so there is nothing for the
gerber/layout views to theme.

## Adding a theme

1. Drop the KiCad color-theme JSON here as `<id>.json` plus its LICENSE file
   (name it `<id>-LICENSE-<SPDX>`).
2. Generate the trimmed const: add the theme to
   `scripts/vendor_layer_themes.mjs` and run
   `node scripts/vendor_layer_themes.mjs`, or hand-write `<id>.ts`
   exporting `{ id, label, credit, license, background, board }`.
3. Register it in `../themes.ts` (`LAYER_THEME_LIST`) — the select box,
   persistence, and embedding pick it up automatically.
4. Check the license first: MIT/Apache-2.0/BSD/CC0 are fine to vendor with
   their notice. GPL/CC-BY-ND are not compatible with redistribution here —
   do not vendor those without a separate decision.
