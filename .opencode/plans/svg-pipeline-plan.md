# Plan: Switch from PNG to SVG Image Pipeline

## Goal
Replace the entire PNG-based image processing pipeline with SVG-native processing, matching the approach used in `@typecad/typecad-docgen`. This removes the `sharp`, `pngjs`, `@xmldom/xmldom`, and `svg-parser` dependencies entirely.

## Current Flow (PNG-based)
1. KiCad CLI exports SVGs for each layer → temp files
2. SVGs converted to PNG buffers via `sharp` (with complex sizing/alignment logic)
3. PNG buffers compared pixel-by-pixel using `pngjs` + custom mask/image processing
4. Diff PNG generated as base64 data URL
5. Original/Modified saved as separate PNG files
6. HTML report embeds PNG images (base64 or file references)

## New Flow (SVG-native, matching docgen)
1. KiCad CLI exports SVGs for each layer → temp files
2. SVGs cropped via docgen's `cropSvg()` (pure string parsing, no deps)
3. SVGs compared as text strings (fast equality check)
4. For diff visualization, SVGs composited client-side in the browser (CSS-based overlay)
5. HTML report embeds SVG content inline (matching docgen's `inlineLocalImages` approach)

## Key Insight from docgen
Docgen's `executeKicadSvgExport()` uses `execFile` (not shell `exec`), exports SVG, reads it back as string, crops the viewBox via `cropSvg()`, and returns the SVG string. No image conversion at all. The SVG content is then inlined directly into HTML.

## What Changes

### Files to REWRITE

#### 1. `src/core/diff-generator.ts` → Complete rewrite
- Replace entire PNG pipeline with SVG-native approach
- Use `execFile` to call KiCad CLI (like docgen's `executeKicadSvgExport`)
- Read SVGs as strings, compare string equality for identical layers
- For layers with differences, pass both SVG strings to the HTML report
- No more PNG buffers, no `sharp`, no `pngjs`, no mask operations
- Simplify to: export SVG → read string → crop → compare → collect results

New `LayerInfo` type:
```ts
interface LayerInfo {
    name: string;
    originalSvg: string | null;   // Cropped SVG string
    modifiedSvg: string | null;   // Cropped SVG string
    hasDifferences: boolean;
}
```

#### 2. `src/core/svg-converter.ts` → DELETE entirely
This entire file is about converting SVG to PNG. No longer needed.

#### 3. `src/core/image-processing.ts` → DELETE entirely
All PNG pixel manipulation (masks, anti-aliasing, Gaussian kernels, distance fields, etc.). No longer needed.

#### 4. `src/core/mask-operations.ts` → DELETE entirely
Binary mask morphological operations for PNG comparison. No longer needed.

#### 5. `src/utils/file-utils.ts` → Simplify
- Remove `executeCommand()` (shell-based `exec`)
- Remove `exportLayerToSvg()` (shell-based KiCad invocation)
- Replace with `execFile`-based approach matching docgen's `executeKicadSvgExport`
- Keep `parseHexColor()` (used for CSS color injection in HTML)
- Keep `createTempFilePath()` (still need temp files for KiCad output)
- Keep `cleanupTempFiles()`
- Add `cropSvg()` function (copied from docgen's `svg.ts`) — pure string-based viewBox cropping

#### 6. `src/utils/html-generator.ts` → Simplify
- Remove base64 PNG data URL conversion logic
- Instead, inline SVG strings directly into HTML (matching docgen's approach)
- The `LayerInfo` type changes to carry SVG strings instead of image paths/base64
- Generate HTML that embeds SVGs inline using `<div>` wrappers (like docgen's `inlineLocalImages`)
- The `diff-viewer.html` template needs updating to work with inline SVGs instead of `<img>` tags

#### 7. `diff-viewer.html` → Update JavaScript
- Change `setLayerData()` to expect inline SVG content instead of image src URLs
- Replace `<img>` creation with inline SVG `<div>` creation
- Keep all existing view modes (side-by-side, overlay, onion-skin, swipe, diff-only)
- SVGs naturally support zoom/pan via CSS transforms (same as current img-based approach)

### Files to KEEP UNCHANGED
- `src/constants.ts` — layer definitions, no changes
- `src/index.ts` — library API entry, update exports if types change
- `src/cli/index.ts` — CLI entry, no changes needed

### Dependencies to REMOVE from package.json
```json
"sharp": "^0.33.5",        // REMOVE - was PNG conversion
"pngjs": "^7.0.0",         // REMOVE - was PNG manipulation  
"@xmldom/xmldom": "^0.9.8", // REMOVE - was SVG parsing for dimension extraction
"svg-parser": "^2.0.4"     // REMOVE - was SVG parsing
```

### Dependencies to KEEP
```json
"@typecad/typecad": "^0.2.19",  // KiCAD CLI path resolution
"open": "^10.1.0",               // Open HTML in browser
"temp-dir": "^3.0.0",            // Temp file management
"yocto-spinner": "^0.2.0"        // CLI spinner
```

### Dev dependencies to REMOVE
```json
"@types/pngjs": "^6.0.5",     // REMOVE
"@types/svg-parser": "^2.0.6" // REMOVE
```

## Execution Order
1. Rewrite `src/utils/file-utils.ts` — add `cropSvg()`, switch to `execFile`
2. Rewrite `src/core/diff-generator.ts` — SVG-native pipeline
3. Rewrite `src/utils/html-generator.ts` — SVG inline embedding
4. Update `diff-viewer.html` — accept inline SVG data
5. Delete `src/core/svg-converter.ts`
6. Delete `src/core/image-processing.ts`
7. Delete `src/core/mask-operations.ts`
8. Update `src/index.ts` — remove deleted module exports
9. Update `package.json` — remove deps, remove devDeps
10. Clean `dist/`, rebuild, verify build
11. Run `typecheck`
12. Run `test`
13. Run `test:diff` to verify end-to-end
