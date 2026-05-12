# `kicad2typecad` Round-Trip System Refactor — Implementation Plan

## Executive Summary

Refactor the forward (TypeCAD → KiCad) and reverse (KiCad → TypeCAD) round-trip pipeline to be deterministic, maintainable, and robust. The current system relies on regex-based source matching with a fragile single-quote Code property format.

## Key Refinements from Code Review

| Original Analysis Assumption | Refined Finding |
|---|---|
| Need `ts-morph` for AST editing | Project already bundles `acorn` + `acorn-walk`; the `source_inspector.ts` AST path is deliberately disabled. We fix it rather than adding a 5MB dep. |
| S-expression AST is entirely `unknown[]` | True. `fast-sexpr` returns raw arrays. A typed wrapper layer (`SExprNode`) is the right approach. |
| UUID not in Code property | Confirmed. Only `{file, line, variable, isThis, params}` is written. UUID is stored on the footprint node itself (separate `uuid` child) but not in Code. |
| `--apply` interactive mode exists | Confirmed. The `bin.ts` accepts `--apply`, which calls `applyChangesToSource()` and `applyTextChangesToSource()`. We must preserve this UX. |

## Guardrails

- **NO `ts-morph` dependency** — use existing `acorn` + `acorn-walk` + `acorn-typescript` for both reading and writing TypeScript
- **Preserve `--apply` interactive checkbox UX** — users select which changes to apply
- **Backward-compatible Code property parsing** — try new format first, fall back to old regex
- **`.backup` files on modify** — existing behavior, must preserve
- **No test infrastructure changes needed** — vitest already configured

---

## Phase 1: Stable Code Property Codec

### 1.1 Create `src/kicad2typecad/codec.ts`

Replace the fragile `JSON.stringify().replace(/\"/g, "'")` with a stable binary-safe encoding.

```typescript
// New codec format:
// typecad:v1:<base64url-encoded JSON>

interface CodeMetadata {
  v: 1;                    // schema version
  u: string;               // component UUID (primary identity)
  n?: string;              // variable name (null if anonymous)
  t?: boolean;             // isThis (true/false, omit if false)
  h?: string;              // footprint identity hash (first 12 chars of sha256)
  f?: string;              // file path (fallback, only when no variable)
  l?: number;              // line number (fallback, only when no variable)
}

// Encode: base64url(compact JSON)
// Decode: try prefix "typecad:v1:" → base64url decode → JSON.parse
//         fallback to old regex parser
```

**Key design decisions:**
- **UUID is primary identity** — no more fragile variable name matching
- **File/line are fallback only** — only used when variable name is missing (components from helper functions)
- **Footprint hash** — stable identity for components without variable names (e.g., from passives libraries)
- **Base64url** — only `[A-Za-z0-9_-]` characters, no quoting issues
- **Schema versioned** — prefix allows future format evolution

### 1.2 Update `src/pcb/pcb_utils.ts` → `formatSourceInfoForProperty()`

Replace the current `JSON.stringify().replaceAll('"', "'")` with the new codec:

```typescript
export function formatSourceInfoForProperty(info?: ISourceInfo, uuid?: string, footprintHash?: string): string | undefined {
    if (!info) return undefined;
    
    const metadata: CodeMetadata = {
        v: 1,
        u: uuid || '',
        n: info.variable,
        t: info.isThis || undefined,
        h: footprintHash,
    };
    
    // Include file/line only as fallback (when no variable name)
    if (!info.variable) {
        metadata.f = info.file;
        metadata.l = info.line;
    }
    
    // Remove undefined values for compactness
    const cleaned = JSON.parse(JSON.stringify(metadata));
    const json = JSON.stringify(cleaned);
    return 'typecad:v1:' + Buffer.from(json).toString('base64url');
}
```

### 1.3 Update `src/pcb/pcb_footprint.ts` → `createFootprintNode()`

Pass `component.uuid` and a computed footprint hash to `formatSourceInfoForProperty()`.

Current (line 650):
```typescript
const codeData = {
    file: component.sourceInfo.file,
    line: component.sourceInfo.line,
    variable: component.sourceInfo.variable,
    isThis: component.sourceInfo.isThis
};
l.splice(2, 0, ['property', '`Code`', `\`${JSON.stringify(codeData).replaceAll('"', "'")}\``, ...]);
```

New:
```typescript
const codeValue = formatSourceInfoForProperty(
    component.sourceInfo,
    component.uuid,
    computeFootprintHash(component.footprint)
);
if (codeValue) {
    l.splice(2, 0, ['property', '`Code`', `\`${codeValue}\``, ...]);
}
```

### 1.4 Add footprint hash computation to `src/component.ts`

```typescript
// Add to Component class:
get footprintHash(): string {
    const str = `${this.footprint || ''}:${this.reference || ''}`;
    // Simple DJB2 hash for zero-dependency fingerprinting
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
```

---

## Phase 2: Typed S-Expression Tree

### 2.1 Create `src/kicad2typecad/sexpr_tree.ts`

A thin typed wrapper around `fast-sexpr`'s raw array output:

```typescript
class SExprNode {
    private raw: unknown[];
    
    static parse(content: string): SExprNode {
        // Wraps fsexp(content.replaceAll('"', '`'))
    }
    
    get name(): string;                    // e.g., "footprint", "at", "property"
    get stringValue(): string | null;      // leaf string value (stripped of quotes/backticks)
    
    child(key: string): SExprNode | null;  // first child with matching name
    children(key?: string): SExprNode[];   // all children, optionally filtered by name
    getNumber(key: string, fallback?: number): number;
    getString(key: string): string | null;
    getBool(key: string): boolean | null;
    
    // Query helpers
    findAll(name: string): SExprNode[];
    hasChild(key: string): boolean;
    
    // Raw access (for interoperability)
    toArray(): unknown[];
}
```

This replaces the pattern of `findNodes(rootElement, 'footprint')` + manual field-index access like `subItem[1]`, `subItem[2]`.

### 2.2 Create `src/kicad2typecad/types.ts`

All shared type definitions moved out of `cli.ts`:

```typescript
// === IR Types ===
interface KicadFootprintIR {
    footprintName: string;
    reference: string;
    position: { x: number; y: number; rotation: number };
    side: 'front' | 'back';
    uuid: string;
    codeMetadata: CodeMetadata | null;
    referenceProperty: ReferencePropertyIR | null;
    fabTextProperty: ReferencePropertyIR | null;
    valueProperty: ReferencePropertyIR | null;
}

interface KicadSegmentIR {
    start: { x: number; y: number };
    end: { x: number; y: number };
    width: number;
    layer: string;
    net?: number;
}

interface KicadTextIR {
    text: string;
    x: number; y: number; rotation: number;
    layer: string;
    fontSize?: [number, number];
    fontFace?: string;
    thickness?: number;
    bold?: boolean;
    italic?: boolean;
    justify?: { horizontal?: string; vertical?: string; mirror?: boolean };
    hide?: boolean;
}

interface KicadViaIR {
    at: { x: number; y: number };
    size: number;
    drill: number;
}

interface KicadNetIR {
    number: number;
    name: string;
}

interface KicadOutlineIR {
    type: 'rect' | 'line' | 'arc' | 'circle';
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    center?: { x: number; y: number };
    mid?: { x: number; y: number };
    width?: number;
    height?: number;
}

// === Change Types ===
interface PositionChange {
    oldX: number; oldY: number; oldRotation: number;
    newX: number; newY: number; newRotation: number;
}

interface PendingChange {
    filePath: string;
    variableName: string;
    prefix: string;
    oldX: number | null; oldY: number | null; oldRotation: number | null;
    oldSide: 'front' | 'back' | null;
    newX: number; newY: number; newRotation: number;
    newSide: 'front' | 'back';
    existingPcbLine: number | null;
    refPositionChange?: PositionChange;
    fabPositionChange?: PositionChange;
    label: string;
}

interface MatchResult {
    irFootprint: KicadFootprintIR;
    sourceLocation: {
        filePath: string;
        variableName?: string;
        isThis: boolean;
    } | null;
    matchConfidence: 'uuid' | 'hash' | 'variable-fallback' | 'none';
}
```

---

## Phase 3: IR Builder

### 3.1 Create `src/kicad2typecad/ir_builder.ts`

Builds typed `KicadIR` from the parsed S-expression tree. Replaces the monolithic parsing functions in `cli.ts` (`parseFootprintItem`, `parseSexprItem`, `parseNetItem`, `parseViaItem`, `parseOutlineItem`, `parseGrTextItem`).

```typescript
class KicadIRBuilder {
    build(tree: SExprNode): KicadIR;
    
    private parseFootprint(node: SExprNode): KicadFootprintIR | null;
    private parseSegment(node: SExprNode): KicadSegmentIR | null;
    private parseNet(node: SExprNode): KicadNetIR | null;
    private parseVia(node: SExprNode): KicadViaIR | null;
    private parseText(node: SExprNode): KicadTextIR | null;
    private parseOutline(node: SExprNode): KicadOutlineIR | null;
}
```

Key: uses `SExprNode` key-based access instead of `subItem[1]`, `subItem[2]`.

### 3.2 Code Property Parsing (in ir_builder.ts)

The `parseFootprint` method extracts and decodes the Code property:

```typescript
private decodeCodeProperty(node: SExprNode): CodeMetadata | null {
    const codeProp = node.children('property')
        .find(p => p.getString('') === 'Code');
    if (!codeProp) return null;
    
    const rawValue = codeProp.stringValue;
    if (!rawValue) return null;
    
    // Try new format
    if (rawValue.startsWith('typecad:v1:')) {
        try {
            const json = Buffer.from(rawValue.slice('typecad:v1:'.length), 'base64url').toString();
            return JSON.parse(json) as CodeMetadata;
        } catch { /* fall through */ }
    }
    
    // Fallback to old format: {'variable':'...','file':'...',...}
    return this.decodeLegacyCode(rawValue);
}

private decodeLegacyCode(raw: string): CodeMetadata | null {
    // Existing regex approach, but map to new CodeMetadata shape
    const varMatch = raw.match(/'variable':'([^']+)'/);
    const fileMatch = raw.match(/'file':'([^']+)'/);
    const isThisMatch = raw.match(/'isThis':(true|false)/);
    const lineMatch = raw.match(/'line':(\d+)/);
    
    if (!varMatch && !fileMatch) return null;
    
    return {
        v: 0,  // legacy
        u: '',  // no UUID in legacy format
        n: varMatch?.[1],
        t: isThisMatch?.[1] === 'true' || undefined,
        f: fileMatch?.[1],
        l: lineMatch ? parseInt(lineMatch[1]) : undefined,
    };
}
```

---

## Phase 4: Source Matcher

### 4.1 Create `src/kicad2typecad/matcher.ts`

Matches KiCad IR footprints to TypeScript source code using UUID as primary identity.

```typescript
class SourceMatcher {
    constructor(private sourceRoot: string);
    
    matchFootprint(fp: KicadFootprintIR): SourceMatch | null;
    
    // 1. Try UUID match: scan source files for Component constructor that
    //    has this UUID (by re-running source_inspector.ts on candidate files)
    // 2. Try footprint hash + position proximity
    // 3. Fallback: variable name regex (legacy)
}
```

**Key insight:** Instead of modifying source (Phase 5 handles that), the matcher just needs to find the *file and variable* for each footprint. The existing `captureSourceInfo()` / `inspectSource()` already does this — but we need a reverse version: given a UUID, find the file and line.

**Simplified approach:** Since the Code property stores `file` (in legacy format) and we now store `uuid`, we can:
1. Read the file from `codeMetadata.f` (old) or scan all source files (new)
2. Find the variable declaration by variable name regex (existing approach)
3. This is inherently O(n) — acceptable for a CLI tool with <100 components

---

## Phase 5: Source Rewriter

### 5.1 Create `src/kicad2typecad/rewriter.ts`

Replaces the regex-based string manipulation in `applyChangesToSource()` with structural editing.

**Instead of `ts-morph`**, we use a hybrid approach:
1. Use `acorn`/`acorn-typescript` to **parse** the source file into an AST
2. Use AST traversal to **locate** the exact property nodes to modify
3. Use string-based replacement **within known boundaries** to apply changes safely

```typescript
class SourceRewriter {
    applyComponentPosition(filePath: string, change: PendingChange): boolean;
    
    // For each change:
    // 1. Parse file with acorn + acorn-typescript
    // 2. Walk AST to find:
    //    a. Variable declaration for variableName in change
    //    b. .pcb = { ... } assignment (or inline pcb: { ... })
    //    c. reference: [...] sub-expression
    //    d. fab: {...} sub-expression
    // 3. For each located AST node, use node.loc to get exact source positions
    // 4. Use string slice/replace to modify only the specific values
    // 5. Preserve all formatting outside the changed values
    // 6. Write .backup file
    // 7. Write modified file
}
```

This is significantly better than the current regex approach because:
- AST loc gives exact byte offsets for property values
- No risk of accidentally matching wrong variables
- Handles multi-line constructors, varied formatting
- Handles trailing commas, whitespace variance

---

## Phase 6: Orchestrator

### 6.1 Refactor `src/kicad2typecad/cli.ts`

Rewrite `kicadDataToTypeCAD()` to use the new pipeline modules, while preserving the interactive `--apply` UX and the code generation display.

```typescript
export async function kicadDataToTypeCAD(filePath: string, options?: { apply?: boolean }) {
    // 1. Parse S-expression
    const tree = SExprNode.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // 2. Build typed IR
    const builder = new KicadIRBuilder();
    const ir = builder.build(tree);
    
    // 3. Match to source files
    const matcher = new SourceMatcher(process.cwd());
    const matches = matcher.matchAll(ir.footprints);
    
    // 4. Compute changes
    const differ = new ChangeDiffer();
    const changes = differ.computePositionChanges(matches);
    const textChanges = differ.computeTextChanges(ir.textElements, sourceFiles);
    
    // 5. Display or apply
    if (options?.apply) {
        await this.interactiveApply(changes, textChanges);
    } else {
        this.displayChanges(changes, textChanges);
        this.displayGeneratedCode(ir);
    }
}
```

### 6.2 Separate display from application

Move the code-generation display functions (`generatePlacementCode`, `generateTextCode`, `generateTrackCode`, `generateViaCode`, `generateOutlineCode`, `generateCreateStatement`) to a separate `src/kicad2typecad/display.ts` module.

---

## Phase 7: Fix the Existing AST Path

### 7.1 Fix `src/source_inspector.ts` — stop throwing away AST results

Current line 32: `throw new Error('Fallback to regex for better "this." detection');`

This intentionally disables the AST path. The comment says "better this. detection" — we should fix the AST path instead. This benefits both forward (captureSourceInfo) and reverse (rewriter) directions.

---

## Implementation Order

| Step | File | Action | Depends On |
|------|------|--------|------------|
| 1 | `src/kicad2typecad/types.ts` | Create — shared type definitions | — |
| 2 | `src/kicad2typecad/codec.ts` | Create — stable KiCadPropertyCodec | types.ts |
| 3 | `src/component.ts` | Modify — add `footprintHash` getter | — |
| 4 | `src/pcb/pcb_utils.ts` | Modify — `formatSourceInfoForProperty` uses new codec | codec.ts |
| 5 | `src/pcb/pcb_footprint.ts` | Modify — `createFootprintNode()` passes uuid+hash | pcb_utils.ts, component.ts |
| 6 | `src/kicad2typecad/sexpr_tree.ts` | Create — typed S-expression wrapper | — |
| 7 | `src/kicad2typecad/ir_builder.ts` | Create — builds KicadIR from SExprNode | sexpr_tree.ts, codec.ts, types.ts |
| 8 | `src/kicad2typecad/matcher.ts` | Create — matches IR to source files | ir_builder.ts, types.ts |
| 9 | `src/source_inspector.ts` | Modify — fix AST path (stop throwing) | — |
| 10 | `src/kicad2typecad/rewriter.ts` | Create — AST-based source rewriting | source_inspector.ts, types.ts |
| 11 | `src/kicad2typecad/display.ts` | Create — code generation display | ir_builder.ts, types.ts |
| 12 | `src/kicad2typecad/cli.ts` | Rewrite — use new pipeline modules | all above |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Legacy Code properties have no UUID | Backward-compatible decoder falls back to variable+file matching |
| AST parsing can fail on complex TypeScript | Fall back to regex-based matching (existing behavior) |
| `acorn-typescript` may not support all TS features | Use `acorn` loose mode; fall back to regex on parse failure |
| Multi-file changes order | Sort by line descending (existing behavior preserved) |
| `.backup` accumulation | Existing behavior — users manage backups manually |

---

## Dependency Changes

**None.** The project already has `acorn` and `acorn-walk` as runtime dependencies. No new packages needed.
