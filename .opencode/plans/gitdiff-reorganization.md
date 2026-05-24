# Plan: Reorganize @typecad/typecad-gitdiff

## Goal
Bring typecad-gitdiff to parity with @typecad/typecad's package structure for a future merge.

## Directory Structure Changes

### Before
```
@typecad/typecad-gitdiff/
├── index.ts                    # CLI entry (raw .ts, run via tsx)
├── src/
│   ├── constants.ts
│   ├── core/
│   │   ├── diff-generator.ts
│   │   ├── image-processing.ts
│   │   ├── mask-operations.ts
│   │   └── svg-converter.ts
│   └── utils/
│       ├── file-utils.ts
│       └── html-generator.ts
├── diff-viewer.html
├── package.json
├── tsconfig.json
├── test1.kicad_pcb
└── test2.kicad_pcb
```

### After
```
@typecad/typecad-gitdiff/
├── src/
│   ├── index.ts                # NEW: Library API entry (exports generateDiffs, types)
│   ├── cli/
│   │   └── index.ts            # MOVED from ./index.ts (CLI entry)
│   ├── constants.ts
│   ├── core/
│   │   ├── diff-generator.ts
│   │   ├── image-processing.ts
│   │   ├── mask-operations.ts
│   │   └── svg-converter.ts
│   └── utils/
│       ├── file-utils.ts
│       └── html-generator.ts
├── tests/
│   └── gitdiff.test.ts         # NEW: Placeholder test
├── diff-viewer.html
├── package.json                # UPDATED
├── tsconfig.json               # UPDATED (library)
├── tsconfig.cli.json           # NEW (CLI)
├── vitest.config.ts            # NEW
├── .gitignore                  # UPDATED
├── .npmignore                  # NEW
├── test1.kicad_pcb
└── test2.kicad_pcb
```

## Detailed File Changes

### 1. NEW: `src/index.ts` (Library API)
Exports the public API so consumers can `import { generateDiffs } from '@typecad/typecad-gitdiff'`:
```ts
export { generateDiffs, type DiffOptions } from './core/diff-generator.js';
export { type LayerInfo } from './utils/html-generator.js';
export { allLayers, standardLayers } from './constants.js';
```

### 2. MOVE: `index.ts` -> `src/cli/index.ts`
The CLI entry point moves to `src/cli/index.ts` with these changes:
- Shebang changes to `#!/usr/bin/env node` (was `tsx`)
- Reads version from `package.json` via `createRequire` instead of hardcoded strings
- Updates relative import paths (e.g., `'../core/diff-generator.js'`)
- Imports `KiCAD` from `@typecad/typecad` and `generateDiffs` from new relative path

### 3. UPDATE: `package.json`
Key changes:
- `"main"`: `"dist/index.js"` (was `"index.ts"`)
- Added `"types"`: `"dist/index.d.ts"`
- `"bin"`: `"dist/cli/index.js"` (was `"index.ts"`)
- `"files"`: `["dist/**/*", "diff-viewer.html"]` (was source .ts files)
- Added `build`, `typecheck`, `prepack`, `test`, `test:watch` scripts
- Removed `basecoat-css` from dependencies (it's a CDN-loaded CSS, not an npm import)
- Added `vitest` to devDependencies

### 4. UPDATE: `tsconfig.json` (Library)
Key changes:
- `"rootDir"`: `"./src"` (was `"./"`)
- Added explicit `"outDir"`: `"./dist"`
- Added `"removeComments": true` (matches @typecad/typecad)
- Excludes `src/cli/**` from library build
- Added `tests/**` to exclude

### 5. NEW: `tsconfig.cli.json`
Separate config for CLI compilation extending tsconfig.json with rootDir pointing to src/cli.

### 6. html-generator.ts template path
No change needed - `dist/utils/html-generator.js` -> `../../diff-viewer.html` resolves correctly to package root.

### 7. NEW: `.npmignore`
Excludes source .ts files, dev configs, test fixtures. Ships `dist/`, `diff-viewer.html`, `README.md`.

### 8. UPDATE: `.gitignore`
Simplify to match @typecad/typecad pattern.

### 9. NEW: `vitest.config.ts`
Basic vitest config pointing to tests/ directory.

### 10. NEW: `tests/gitdiff.test.ts`
Placeholder test importing constants and verifying basic invariants.

## Execution Order
1. Create `src/cli/` directory and `tests/` directory (already done)
2. Create `src/index.ts` (library API)
3. Create `src/cli/index.ts` (moved CLI with updated paths, version, shebang)
4. Delete old root `index.ts`
5. Update `tsconfig.json`
6. Create `tsconfig.cli.json`
7. Update `package.json`
8. Create `.npmignore`
9. Update `.gitignore`
10. Create `vitest.config.ts`
11. Create `tests/gitdiff.test.ts`
12. Run `npm run build` to verify compilation
13. Run `npm run typecheck` to verify types
14. Run `npm run test` to verify tests pass
