import fs from 'node:fs';
import type {
    KicadFootprintIR,
    KicadIR,
    KicadTextIR,
    MatchResult,
    PendingChange,
    PendingTextChange,
    PositionChange,
    SourceLocation,
} from './types.js';

/**
 * Computes and applies source-file changes detected from KiCad → TypeCAD
 * round-trip comparison.
 *
 * The rewriter handles two categories:
 * 1. **Footprint changes** — position (x/y/rotation/side), reference positioning,
 *    and fab text positioning changes for Component instances.
 * 2. **Text element changes** — gr_text positioning, styling (font, size, justify),
 *    and text content changes for pcb.text() calls.
 */
export class SourceRewriter {
    /**
     * Compute pending footprint changes by comparing matched IR footprints
     * against their corresponding TypeScript source files.
     *
     * Only footprints with a valid sourceLocation are considered.
     */
    computeFootprintChanges(matchResults: MatchResult[]): PendingChange[] {
        const changes: PendingChange[] = [];

        // Group by source file
        const byFile: Record<string, MatchResult[]> = {};
        for (const mr of matchResults) {
            if (!mr.sourceLocation) continue;
            const f = mr.sourceLocation.filePath;
            if (!byFile[f]) byFile[f] = [];
            byFile[f].push(mr);
        }

        for (const [filePath, mrs] of Object.entries(byFile)) {
            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }
            const lines = content.split('\n');

            for (const mr of mrs) {
                const fp = mr.irFootprint;
                const loc = mr.sourceLocation!;
                const variable = loc.variableName;
                if (!variable) continue;

                // Find the creation line by regex
                const creationRegex = new RegExp(
                    `^\\s*(let|const|var|)\\s*(this\\.)?\\s*${escapeRegex(variable)}\\s*=\\s*new\\s+`
                );
                let creationIdx = -1;
                let prefix = loc.isThis ? 'this.' : '';

                for (let i = 0; i < lines.length; i++) {
                    const m = lines[i].match(creationRegex);
                    if (m) {
                        creationIdx = i;
                        prefix = m[2] ? 'this.' : '';
                        break;
                    }
                }
                if (creationIdx === -1) continue;

                // Find end of creation statement
                let statementEndIdx = creationIdx;
                for (let i = creationIdx; i < Math.min(lines.length, creationIdx + 20); i++) {
                    if (lines[i].match(/;\s*$/)) {
                        statementEndIdx = i;
                        break;
                    }
                }

                // Search for existing .pcb = { ... }
                let existingPcbLine: number | null = null;
                let oldX: number | null = null;
                let oldY: number | null = null;
                let oldRotation: number | null = null;
                let oldSide: 'front' | 'back' | null = null;

                const escapedPrefix = prefix.replace('.', '\\.');
                const pcbRegex = new RegExp(
                    `^\\s*${escapedPrefix}\\s*${escapeRegex(variable)}\\.pcb\\s*=\\s*\\{([^}]+)\\}`
                );

                for (let i = statementEndIdx + 1; i < Math.min(lines.length, statementEndIdx + 5); i++) {
                    const pcbMatch = lines[i]?.match(pcbRegex);
                    if (pcbMatch) {
                        existingPcbLine = i + 1;
                        const inner = pcbMatch[1];
                        const xm = inner.match(/x:\s*(-?[\d.]+)/);
                        const ym = inner.match(/y:\s*(-?[\d.]+)/);
                        const rm = inner.match(/rotation:\s*(-?[\d.]+)/);
                        const sm = inner.match(/side:\s*['"](front|back)['"]/);
                        oldX = xm ? parseFloat(xm[1]) : null;
                        oldY = ym ? parseFloat(ym[1]) : null;
                        oldRotation = rm ? parseFloat(rm[1]) : null;
                        oldSide = sm ? (sm[1] as 'front' | 'back') : null;
                        break;
                    }
                }

                // Also check for inline pcb: { ... } within the constructor
                if (existingPcbLine === null) {
                    for (let i = creationIdx; i <= statementEndIdx; i++) {
                        const inlineMatch = lines[i]?.match(/\bpcb:\s*\{([^}]+)\}/);
                        if (inlineMatch) {
                            const inner = inlineMatch[1];
                            const xm = inner.match(/x:\s*(-?[\d.]+)/);
                            const ym = inner.match(/y:\s*(-?[\d.]+)/);
                            const rm = inner.match(/rotation:\s*(-?[\d.]+)/);
                            const sm = inner.match(/side:\s*['"](front|back)['"]/);
                            if (xm) oldX = parseFloat(xm[1]);
                            if (ym) oldY = parseFloat(ym[1]);
                            if (rm) oldRotation = parseFloat(rm[1]);
                            if (sm) oldSide = sm[1] as 'front' | 'back';
                            break;
                        }
                    }
                }

                const newSide = fp.side || 'front';
                const effectiveOldSide = oldSide || 'front';
                const hasSourceCoords = existingPcbLine !== null || oldX !== null;
                const coordsChanged = hasSourceCoords
                    && (oldX !== fp.position.x || oldY !== fp.position.y || oldRotation !== fp.position.rotation || effectiveOldSide !== newSide);

                // Check reference/fab position changes
                let refPositionChange: PositionChange | undefined;
                let fabPositionChange: PositionChange | undefined;

                if (fp.referenceProperty) {
                    const rp = fp.referenceProperty;
                    for (let i = creationIdx; i <= statementEndIdx; i++) {
                        if (lines[i]?.match(/reference:\s*\[/)) {
                            const inner = lines[i].match(/\{\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)(?:\s*,\s*rotation:\s*(-?[\d.]+))?/);
                            if (inner) {
                                const oldRefX = parseFloat(inner[1]);
                                const oldRefY = parseFloat(inner[2]);
                                const oldRefR = inner[3] ? parseFloat(inner[3]) : 0;
                                if (oldRefX !== rp.x || oldRefY !== rp.y || oldRefR !== rp.rotation) {
                                    refPositionChange = {
                                        oldX: oldRefX, oldY: oldRefY, oldRotation: oldRefR,
                                        newX: rp.x, newY: rp.y, newRotation: rp.rotation,
                                    };
                                }
                            }
                            break;
                        }
                    }
                }

                if (fp.fabTextProperty) {
                    const fabPcb = fp.fabTextProperty;
                    for (let i = creationIdx; i <= statementEndIdx; i++) {
                        const fabMatch = lines[i]?.match(/\bfab:\s*(?:\[.*?,\s*)?\{/);
                        if (fabMatch) {
                            const innerMatches = [...lines[i].matchAll(/\{\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)(?:\s*,\s*rotation:\s*(-?[\d.]+))?/g)];
                            const inner = innerMatches[innerMatches.length - 1];
                            if (inner) {
                                const oldFabX = parseFloat(inner[1]);
                                const oldFabY = parseFloat(inner[2]);
                                const oldFabR = inner[3] ? parseFloat(inner[3]) : 0;
                                if (oldFabX !== fabPcb.x || oldFabY !== fabPcb.y || oldFabR !== fabPcb.rotation) {
                                    fabPositionChange = {
                                        oldX: oldFabX, oldY: oldFabY, oldRotation: oldFabR,
                                        newX: fabPcb.x, newY: fabPcb.y, newRotation: fabPcb.rotation,
                                    };
                                }
                            }
                            break;
                        }
                    }
                }

                if (!coordsChanged && !refPositionChange && !fabPositionChange) continue;

                const shortFile = filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
                const labelParts: string[] = [`${prefix}${variable}`, `${shortFile}:${creationIdx + 1}`];
                if (coordsChanged) {
                    const oldStr = existingPcbLine !== null ? `(${oldX}, ${oldY})` : '(not set)';
                    const sideInfo = effectiveOldSide !== newSide ? ` [${effectiveOldSide} → ${newSide}]` : '';
                    labelParts.push(`pcb: ${oldStr} → (${fp.position.x}, ${fp.position.y})${sideInfo}`);
                }
                if (refPositionChange) {
                    const rotInfo = refPositionChange.oldRotation !== refPositionChange.newRotation
                        ? ` r:${refPositionChange.oldRotation}→${refPositionChange.newRotation}` : '';
                    labelParts.push(`ref: (${refPositionChange.oldX}, ${refPositionChange.oldY}) → (${refPositionChange.newX}, ${refPositionChange.newY})${rotInfo}`);
                }
                if (fabPositionChange) {
                    const rotInfo = fabPositionChange.oldRotation !== fabPositionChange.newRotation
                        ? ` r:${fabPositionChange.oldRotation}→${fabPositionChange.newRotation}` : '';
                    labelParts.push(`fab: (${fabPositionChange.oldX}, ${fabPositionChange.oldY}) → (${fabPositionChange.newX}, ${fabPositionChange.newY})${rotInfo}`);
                }

                changes.push({
                    filePath,
                    variableName: variable,
                    prefix,
                    sourceLine: statementEndIdx + 1,
                    oldX, oldY, oldRotation, oldSide,
                    newX: fp.position.x,
                    newY: fp.position.y,
                    newRotation: fp.position.rotation,
                    newSide,
                    existingPcbLine,
                    refPositionChange,
                    fabPositionChange,
                    label: labelParts.join('  '),
                });
            }
        }

        return changes;
    }

    /**
     * Compute pending text element changes by comparing IR text elements
     * against .text() calls in source files.
     */
    computeTextChanges(ir: KicadIR, sourceFiles: string[]): PendingTextChange[] {
        if (ir.textElements.length === 0) return [];

        interface SourceTextCall {
            filePath: string;
            lineIdx: number;
            endIdx: number;
            callText: string;
            sourceText: string;
            x: number; y: number; rotation: number;
            layer: string;
            font: string | undefined;
            width: number | undefined;
            height: number | undefined;
            thickness: number | undefined;
            bold: boolean;
            italic: boolean;
            justify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
        }

        const sourceCalls: SourceTextCall[] = [];

        for (const filePath of sourceFiles) {
            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].match(/\.text\s*\(/)) continue;

                let callText = lines[i];
                let endIdx = i;
                if (!lines[i].match(/\}\s*\)/)) {
                    for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
                        callText += '\n' + lines[j];
                        if (lines[j].match(/\}\s*\)/)) {
                            endIdx = j;
                            break;
                        }
                    }
                }

                const textMatch = callText.match(/text:\s*["']([^"']+)["']/);
                if (!textMatch) continue;

                const xm = callText.match(/x:\s*(-?[\d.]+)/);
                const ym = callText.match(/y:\s*(-?[\d.]+)/);
                const rm = callText.match(/rotation:\s*(-?[\d.]+)/);
                const lm = callText.match(/layer:\s*["']([^"']+)["']/);
                const fm = callText.match(/font:\s*["']([^"']+)["']/);
                const wm = callText.match(/width:\s*(-?[\d.]+)/);
                const hm = callText.match(/height:\s*(-?[\d.]+)/);
                const tm = callText.match(/thickness:\s*(-?[\d.]+)/);
                const bm = callText.match(/\bbold:\s*(true|false)/);
                const im = callText.match(/\bitalic:\s*(true|false)/);
                const jm = callText.match(/justify:\s*\{([^}]*)\}/);

                sourceCalls.push({
                    filePath,
                    lineIdx: i,
                    endIdx,
                    callText,
                    sourceText: textMatch[1],
                    x: xm ? parseFloat(xm[1]) : 0,
                    y: ym ? parseFloat(ym[1]) : 0,
                    rotation: rm ? parseFloat(rm[1]) : 0,
                    layer: lm ? lm[1] : 'F.SilkS',
                    font: fm ? fm[1] : undefined,
                    width: wm ? parseFloat(wm[1]) : undefined,
                    height: hm ? parseFloat(hm[1]) : undefined,
                    thickness: tm ? parseFloat(tm[1]) : undefined,
                    bold: bm ? bm[1] === 'true' : false,
                    italic: im ? im[1] === 'true' : false,
                    justify: jm ? parseSourceJustify(jm[1]) : undefined,
                });
            }
        }

        if (sourceCalls.length === 0) return [];

        // Match source calls to PCB texts (fuzzy text match + position proximity)
        const matchedSourceIdxs = new Set<number>();
        const matchedPcbTexts = new Set<string>();
        const pairs: { source: SourceTextCall; pcb: KicadTextIR }[] = [];

        for (let si = 0; si < sourceCalls.length; si++) {
            const src = sourceCalls[si];
            for (const t of ir.textElements) {
                if (matchedPcbTexts.has(t.text)) continue;
                if (textFuzzyMatch(src.sourceText, t.text)) {
                    pairs.push({ source: src, pcb: t });
                    matchedSourceIdxs.add(si);
                    matchedPcbTexts.add(t.text);
                    break;
                }
            }
        }

        // Position proximity fallback
        const unmatchedSource = sourceCalls.filter((_, i) => !matchedSourceIdxs.has(i));
        const unmatchedPcb = ir.textElements.filter(t => !matchedPcbTexts.has(t.text));

        if (unmatchedSource.length > 0 && unmatchedPcb.length > 0) {
            const usedPcb = new Set<number>();
            for (const src of unmatchedSource) {
                let bestDist = Infinity;
                let bestPcbIdx = -1;
                for (let pi = 0; pi < unmatchedPcb.length; pi++) {
                    if (usedPcb.has(pi)) continue;
                    const t = unmatchedPcb[pi];
                    const dist = Math.sqrt(Math.pow(src.x - t.x, 2) + Math.pow(src.y - t.y, 2));
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPcbIdx = pi;
                    }
                }
                if (bestPcbIdx >= 0 && bestDist < 200) {
                    pairs.push({ source: src, pcb: unmatchedPcb[bestPcbIdx] });
                    usedPcb.add(bestPcbIdx);
                }
            }
        }

        // Build pending changes
        const changes: PendingTextChange[] = [];
        for (const { source: src, pcb } of pairs) {
            const pcbWidth = pcb.fontSize ? pcb.fontSize[1] : undefined;
            const pcbHeight = pcb.fontSize ? pcb.fontSize[0] : undefined;

            const xChanged = Math.abs(src.x - pcb.x) > 0.001;
            const yChanged = Math.abs(src.y - pcb.y) > 0.001;
            const rChanged = Math.abs(src.rotation - pcb.rotation) > 0.001;
            const textChanged = src.sourceText !== pcb.text;
            const layerChanged = src.layer !== pcb.layer;
            const fontChanged = src.font !== pcb.fontFace;
            const widthChanged = src.width !== pcbWidth && (src.width !== undefined || pcbWidth !== undefined);
            const heightChanged = src.height !== pcbHeight && (src.height !== undefined || pcbHeight !== undefined);
            const thicknessChanged = src.thickness !== pcb.thickness && (src.thickness !== undefined || pcb.thickness !== undefined);
            const boldChanged = src.bold !== (pcb.bold || false);
            const italicChanged = src.italic !== (pcb.italic || false);
            const justifyChanged = !justifyEquals(src.justify, pcb.justify);

            if (!xChanged && !yChanged && !rChanged && !textChanged && !layerChanged &&
                !fontChanged && !widthChanged && !heightChanged && !thicknessChanged &&
                !boldChanged && !italicChanged && !justifyChanged) continue;

            const changedProps: string[] = [];
            if (xChanged || yChanged) changedProps.push('position');
            if (rChanged) changedProps.push('rotation');
            if (textChanged) changedProps.push('text');
            if (layerChanged) changedProps.push('layer');
            if (fontChanged) changedProps.push('font');
            if (widthChanged || heightChanged) changedProps.push('size');
            if (thicknessChanged) changedProps.push('thickness');
            if (boldChanged) changedProps.push('bold');
            if (italicChanged) changedProps.push('italic');
            if (justifyChanged) changedProps.push('justify');

            const shortFile = src.filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
            const posStr = `(${src.x}, ${src.y}) → (${pcb.x}, ${pcb.y})`;
            const propsStr = changedProps.filter(p => p !== 'position').join(', ');
            const labelParts = [`text "${src.sourceText}"`, `${shortFile}:${src.lineIdx + 1}`, posStr];
            if (propsStr) labelParts.push(`[${propsStr}]`);
            if (textChanged) labelParts.push(`[text: "${src.sourceText}" → "${pcb.text}"]`);

            changes.push({
                filePath: src.filePath,
                sourceTextContent: src.sourceText,
                newPcbText: pcb.text,
                lineIdx: src.lineIdx,
                endIdx: src.endIdx,
                callText: src.callText,
                oldX: src.x, oldY: src.y, oldRotation: src.rotation,
                newX: pcb.x, newY: pcb.y, newRotation: pcb.rotation,
                oldLayer: src.layer, newLayer: pcb.layer,
                oldFont: src.font, newFont: pcb.fontFace,
                oldWidth: src.width, newWidth: pcbWidth,
                oldHeight: src.height, newHeight: pcbHeight,
                oldThickness: src.thickness, newThickness: pcb.thickness,
                oldBold: src.bold, newBold: pcb.bold || false,
                oldItalic: src.italic, newItalic: pcb.italic || false,
                oldJustify: src.justify, newJustify: pcb.justify,
                label: labelParts.join('  '),
                changedProps,
            });
        }

        return changes;
    }

    /**
     * Apply selected footprint changes to source files.
     * Uses string-based line replacement, sorted descending to avoid shift issues.
     * Creates .backup files before overwriting.
     */
    applyFootprintChanges(changes: PendingChange[]): { filesModified: number; changesApplied: number } {
        const selectedByFile: Record<string, PendingChange[]> = {};
        for (const c of changes) {
            if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
            selectedByFile[c.filePath].push(c);
        }

        let filesModified = 0;

        for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
            let content = fs.readFileSync(filePath, 'utf-8');

            // Sort descending by sourceLine
            fileChanges.sort((a, b) => b.sourceLine - a.sourceLine);

            for (const change of fileChanges) {
                const lines = content.split('\n');
                const escapedPrefix = change.prefix.replace('.', '\\.');
                const varName = change.variableName;

                if (change.existingPcbLine !== null) {
                    // Update existing .pcb = line
                    const pcbRegex = new RegExp(
                        `^\\s*${escapedPrefix}\\s*${escapeRegex(varName)}\\.pcb\\s*=\\s*\\{([^}]+)\\}`
                    );
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(pcbRegex)) {
                            lines[i] = lines[i]
                                .replace(/x:\s*-?[\d.]+/, `x: ${change.newX}`)
                                .replace(/y:\s*-?[\d.]+/, `y: ${change.newY}`)
                                .replace(/rotation:\s*-?[\d.]+/, `rotation: ${change.newRotation}`);
                            if (change.newSide === 'back') {
                                if (lines[i].match(/side:\s*['"](front|back)['"]/)) {
                                    lines[i] = lines[i].replace(/side:\s*['"](?:front|back)['"]/, `side: 'back'`);
                                } else {
                                    lines[i] = lines[i].replace(/(\})/, `, side: 'back'$1`);
                                }
                            } else if (change.newSide === 'front' && lines[i].match(/side:\s*['"]back['"]/)) {
                                lines[i] = lines[i].replace(/,\s*side:\s*['"]back['"]/, '');
                                if (!lines[i].match(/side:/)) {
                                    lines[i] = lines[i].replace(/side:\s*['"]back['"]\s*,\s*/, '');
                                }
                            }
                            break;
                        }
                    }

                    // Also update inline pcb: in constructor
                    const creationRegex = new RegExp(
                        `^\\s*(let|const|var|)\\s*${escapedPrefix}\\s*${escapeRegex(varName)}\\s*=\\s*new\\s+`
                    );
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(creationRegex)) {
                            for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                                const inlineMatch = lines[j]?.match(/\bpcb:\s*\{/);
                                if (inlineMatch) {
                                    lines[j] = lines[j]
                                        .replace(/(pcb:\s*\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${change.newX}`)
                                        .replace(/(pcb:\s*\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${change.newY}`)
                                        .replace(/(pcb:\s*\{[^}]*?)rotation:\s*-?[\d.]+/, `$1rotation: ${change.newRotation}`);
                                    break;
                                }
                                if (lines[j].match(/;\s*$/)) break;
                            }
                            break;
                        }
                    }

                    // Apply reference position changes
                    if (change.refPositionChange) {
                        const rc = change.refPositionChange;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].match(/reference:\s*\[/)) {
                                lines[i] = lines[i]
                                    .replace(/(reference:\s*\[[\s\S]*?\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${rc.newX}`)
                                    .replace(/(reference:\s*\[[\s\S]*?\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${rc.newY}`);
                                if (rc.newRotation !== 0) {
                                    if (lines[i].match(/(reference:\s*\[[\s\S]*?\{[^}]*?)rotation:\s*-?[\d.]+/)) {
                                        lines[i] = lines[i].replace(
                                            /(reference:\s*\[[\s\S]*?\{[^}]*?)rotation:\s*-?[\d.]+/,
                                            `$1rotation: ${rc.newRotation}`
                                        );
                                    }
                                }
                                break;
                            }
                        }
                    }

                    // Apply fab position changes
                    if (change.fabPositionChange) {
                        const fc = change.fabPositionChange;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].match(/\bfab:\s*(?:\[.*?,\s*)?\{/)) {
                                const tupleMatch = lines[i].match(/\bfab:\s*\[/);
                                if (tupleMatch) {
                                    lines[i] = lines[i]
                                        .replace(/(,\s*\{\s*x:\s*)(-?[\d.]+)/, `$1${fc.newX}`)
                                        .replace(/(,\s*\{[^}]*?y:\s*)(-?[\d.]+)/, `$1${fc.newY}`);
                                    if (fc.newRotation !== 0) {
                                        if (lines[i].match(/(,\s*\{[^}]*?)rotation:\s*-?[\d.]+/)) {
                                            lines[i] = lines[i].replace(
                                                /(,\s*\{[^}]*?)rotation:\s*-?[\d.]+/,
                                                `$1rotation: ${fc.newRotation}`
                                            );
                                        }
                                    }
                                } else {
                                    lines[i] = lines[i]
                                        .replace(/(fab:\s*\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${fc.newX}`)
                                        .replace(/(fab:\s*\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${fc.newY}`);
                                    if (fc.newRotation !== 0) {
                                        if (lines[i].match(/(fab:\s*\{[^}]*?)rotation:\s*-?[\d.]+/)) {
                                            lines[i] = lines[i].replace(
                                                /(fab:\s*\{[^}]*?)rotation:\s*-?[\d.]+/,
                                                `$1rotation: ${fc.newRotation}`
                                            );
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }

                    content = lines.join('\n');
                } else {
                    // No separate .pcb = line; check for inline pcb: in constructor
                    const creationRegex = new RegExp(
                        `^\\s*(let|const|var|)\\s*${escapedPrefix}\\s*${escapeRegex(varName)}\\s*=\\s*new\\s+`
                    );
                    let updatedInline = false;

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(creationRegex)) {
                            for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                                if (lines[j]?.match(/\bpcb:\s*\{/)) {
                                    lines[j] = lines[j]
                                        .replace(/(pcb:\s*\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${change.newX}`)
                                        .replace(/(pcb:\s*\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${change.newY}`)
                                        .replace(/(pcb:\s*\{[^}]*?)rotation:\s*-?[\d.]+/, `$1rotation: ${change.newRotation}`);
                                    updatedInline = true;
                                    break;
                                }
                                if (lines[j].match(/;\s*$/)) break;
                            }
                            break;
                        }
                    }

                    if (!updatedInline) {
                        // Insert new .pcb = line after the statement
                        let insertIdx = -1;
                        let indent = '';
                        const creationRegex2 = new RegExp(
                            `^\\s*(let|const|var|)\\s*${escapedPrefix}\\s*${escapeRegex(varName)}\\s*=\\s*new\\s+`
                        );
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].match(creationRegex2)) {
                                indent = lines[i].match(/^(\s*)/)?.[1] || '';
                                for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                                    if (lines[j].match(/;\s*$/)) {
                                        insertIdx = j;
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                        if (insertIdx !== -1) {
                            const sidePart = change.newSide === 'back' ? `, side: 'back'` : '';
                            const newLine = `${indent}${change.prefix}${varName}.pcb = { x: ${change.newX}, y: ${change.newY}, rotation: ${change.newRotation}${sidePart} };`;
                            lines.splice(insertIdx + 1, 0, newLine);
                        }
                    }
                    content = lines.join('\n');
                }
            }

            const original = fs.readFileSync(filePath, 'utf-8');
            if (content !== original) {
                fs.writeFileSync(filePath + '.backup', original, 'utf-8');
                fs.writeFileSync(filePath, content, 'utf-8');
                filesModified++;
            }
        }

        return { filesModified, changesApplied: changes.length };
    }

    /**
     * Apply selected text element changes to source files.
     */
    applyTextChanges(changes: PendingTextChange[]): { filesModified: number; changesApplied: number } {
        const selectedByFile: Record<string, PendingTextChange[]> = {};
        for (const c of changes) {
            if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
            selectedByFile[c.filePath].push(c);
        }

        let filesModified = 0;

        for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
            let content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            // Sort descending by line index
            fileChanges.sort((a, b) => b.lineIdx - a.lineIdx);

            for (const change of fileChanges) {
                const escapedSourceText = escapeRegex(change.sourceTextContent);
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i].match(/\.text\s*\(/)) continue;

                    let callBlock = lines[i];
                    let endLine = i;
                    if (!lines[i].match(/\}\s*\)/)) {
                        for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
                            callBlock += '\n' + lines[j];
                            if (lines[j].match(/\}\s*\)/)) {
                                endLine = j;
                                break;
                            }
                        }
                    }

                    const textMatch = callBlock.match(new RegExp(`text:\\s*["']${escapedSourceText}["']`));
                    if (!textMatch) continue;

                    let updated = callBlock;

                    if (change.sourceTextContent !== change.newPcbText) {
                        updated = updated.replace(change.sourceTextContent, change.newPcbText);
                    }
                    if (Math.abs(change.oldX - change.newX) > 0.001) {
                        updated = updated.replace(/x:\s*-?[\d.]+/, `x: ${change.newX}`);
                    }
                    if (Math.abs(change.oldY - change.newY) > 0.001) {
                        updated = updated.replace(/y:\s*-?[\d.]+/, `y: ${change.newY}`);
                    }
                    if (Math.abs(change.oldRotation - change.newRotation) > 0.001) {
                        if (updated.match(/rotation:\s*-?[\d.]+/)) {
                            updated = updated.replace(/rotation:\s*-?[\d.]+/, `rotation: ${change.newRotation}`);
                        }
                    }
                    if (change.oldLayer !== change.newLayer && change.newLayer !== 'F.SilkS') {
                        if (updated.match(/layer:\s*["'][^"']+["']/)) {
                            updated = updated.replace(/layer:\s*["'][^"']+["']/, `layer: '${change.newLayer}'`);
                        }
                    }
                    if (change.oldFont !== change.newFont) {
                        if (change.newFont) {
                            if (updated.match(/font:\s*["'][^"']+["']/)) {
                                updated = updated.replace(/font:\s*["'][^"']+["']/, `font: '${change.newFont}'`);
                            }
                        }
                    }
                    if (change.newWidth !== undefined && change.oldWidth !== change.newWidth) {
                        if (updated.match(/width:\s*-?[\d.]+/)) {
                            updated = updated.replace(/width:\s*-?[\d.]+/, `width: ${change.newWidth}`);
                        }
                    }
                    if (change.newHeight !== undefined && change.oldHeight !== change.newHeight) {
                        if (updated.match(/height:\s*-?[\d.]+/)) {
                            updated = updated.replace(/height:\s*-?[\d.]+/, `height: ${change.newHeight}`);
                        }
                    }
                    if (change.newThickness !== undefined && change.oldThickness !== change.newThickness) {
                        if (updated.match(/thickness:\s*-?[\d.]+/)) {
                            updated = updated.replace(/thickness:\s*-?[\d.]+/, `thickness: ${change.newThickness}`);
                        }
                    }
                    if (change.oldBold !== change.newBold) {
                        if (updated.match(/\bbold:\s*(true|false)/)) {
                            updated = updated.replace(/\bbold:\s*(true|false)/, `bold: ${change.newBold}`);
                        }
                    }
                    if (change.oldItalic !== change.newItalic) {
                        if (updated.match(/\bitalic:\s*(true|false)/)) {
                            updated = updated.replace(/\bitalic:\s*(true|false)/, `italic: ${change.newItalic}`);
                        }
                    }
                    if (!justifyEquals(change.oldJustify, change.newJustify) && change.newJustify) {
                        const j = change.newJustify;
                        const newParts: string[] = [];
                        if (j.horizontal) newParts.push(`horizontal: '${j.horizontal}'`);
                        if (j.vertical) newParts.push(`vertical: '${j.vertical}'`);
                        if (j.mirror) newParts.push('mirror: true');
                        if (newParts.length > 0) {
                            const newJustifyStr = `justify: { ${newParts.join(', ')} }`;
                            if (updated.match(/justify:\s*\{[^}]*\}/)) {
                                updated = updated.replace(/justify:\s*\{[^}]*\}/, newJustifyStr);
                            }
                        }
                    }

                    const updatedLines = updated.split('\n');
                    lines.splice(i, endLine - i + 1, ...updatedLines);
                    break;
                }
            }

            content = lines.join('\n');
            const original = fs.readFileSync(filePath, 'utf-8');
            if (content !== original) {
                fs.writeFileSync(filePath + '.backup', original, 'utf-8');
                fs.writeFileSync(filePath, content, 'utf-8');
                filesModified++;
            }
        }

        return { filesModified, changesApplied: changes.length };
    }
}

// === Utility helpers (shared with original cli.ts logic) ===

function parseSourceJustify(raw: string): { horizontal?: string; vertical?: string; mirror?: boolean } {
    const result: { horizontal?: string; vertical?: string; mirror?: boolean } = {};
    const hm = raw.match(/horizontal:\s*['"](\w+)['"]/);
    const vm = raw.match(/vertical:\s*['"](\w+)['"]/);
    const mm = raw.match(/mirror:\s*(true)/);
    if (hm) result.horizontal = hm[1];
    if (vm) result.vertical = vm[1];
    if (mm) result.mirror = true;
    return result;
}

function justifyEquals(
    a: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
    b: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined
): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (a.horizontal ?? undefined) === (b.horizontal ?? undefined) &&
           (a.vertical ?? undefined) === (b.vertical ?? undefined) &&
           (a.mirror ?? false) === (b.mirror ?? false);
}

function textFuzzyMatch(sourceText: string, pcbText: string): boolean {
    if (sourceText === pcbText) return true;
    if (pcbText.startsWith(sourceText) || sourceText.startsWith(pcbText)) return true;
    if (pcbText.includes(sourceText) || sourceText.includes(pcbText)) return true;
    return false;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
