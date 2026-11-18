# typecad workspace

npm workspaces monorepo (TypeScript, vitest). Root scripts: `npm run build|typecheck|test|lint|format`.

## Layout
- `@typecad/pcb` — core toolchain (src/, tests/). Most work happens here.
- `@typecad/{jlcpcb-export,jlcpcb-parts,wiring,graphviz}` — support packages
- `packages/vscode-typecad-pcb` — VS Code extension
- `demo/*` — example boards (hw/ subfolders are workspaces)
- `gerber_spec/`, `openpnp_spec/` — format specs / golden fixtures (large, rarely relevant)
- `website/` — docs site (Svelte)

## Token-saving rules
- Don't read generated/large files: `*.html` viewers, `gerber_spec/golden/**`, `*.gtl/*.gbl/*.gbr`, `package-lock.json`, `CHANGELOG.md`, `website/static/**`, `website/llms/**`, PDFs/PNGs (see `.Codex/settings.json` deny list).
- `@typecad/pcb/src/gerber_viewer/render/viewer_html.ts` is ~700KB generated-ish; grep for a symbol, read only a line range.
- Use Grep with `-n` and `head_limit`, then Read with offset/limit. Prefer one package's tests (`npm test -w @typecad/pcb -- <file>`) over the whole suite.
- Changesets live in `.changeset/`; keep new ones short.
