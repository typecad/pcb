import fs from 'node:fs';
import {
  analyzeFile,
  applyReplacements,
  findPcbAssignmentByVariable,
  findTextCalls,
  findLayoutAssignments,
  getMemberPrefix,
} from './source_analyzer.js';
import type { Replacement, LayoutAssignmentInfo } from './source_analyzer.js';
import type {
  KicadIR,
  KicadTextIR,
  MatchResult,
  PendingChange,
  PendingTextChange,
  PendingLayoutChange,
  TextLayoutIR,
} from './types.js';

export class SourceRewriter {
  computeFootprintChanges(matchResults: MatchResult[]): PendingChange[] {
    const changes: PendingChange[] = [];

    const byFile: Record<string, MatchResult[]> = {};
    for (const mr of matchResults) {
      if (!mr.sourceLocation) continue;
      const f = mr.sourceLocation.filePath;
      if (!byFile[f]) byFile[f] = [];
      byFile[f].push(mr);
    }

    for (const [filePath, mrs] of Object.entries(byFile)) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;

      for (const mr of mrs) {
        const fp = mr.irFootprint;
        const loc = mr.sourceLocation!;
        const variable = loc.variableName;
        if (!variable) continue;

        const component = analysis.components.find((c) => c.variableName === variable && c.isThis === loc.isThis);
        if (!component) continue;

        const prefix = getMemberPrefix(loc.isThis);

        let oldX: number | null = null;
        let oldY: number | null = null;
        let oldRotation: number | null = null;
        let oldSide: 'front' | 'back' | null = null;

        const pcbAssignment = analysis.pcbAssignments.find(
          (p) => p.variableName === variable && p.isThis === loc.isThis,
        );

        if (pcbAssignment) {
          oldX = (pcbAssignment.props['x']?.value as number) ?? null;
          oldY = (pcbAssignment.props['y']?.value as number) ?? null;
          oldRotation = (pcbAssignment.props['rotation']?.value as number) ?? null;
          const sideVal = pcbAssignment.props['side']?.value;
          oldSide = sideVal === 'back' || sideVal === 'front' ? sideVal : null;
        } else if (component.inlinePcb) {
          oldX = (component.inlinePcb.props['x']?.value as number) ?? null;
          oldY = (component.inlinePcb.props['y']?.value as number) ?? null;
          oldRotation = (component.inlinePcb.props['rotation']?.value as number) ?? null;
          const sideVal = component.inlinePcb.props['side']?.value;
          oldSide = sideVal === 'back' || sideVal === 'front' ? sideVal : null;
        }

        const newSide = fp.side || 'front';
        const effectiveOldSide = oldSide || 'front';
        const hasSourceCoords = oldX !== null || oldY !== null;
        const positionDiffers =
          oldX !== fp.position.x ||
          oldY !== fp.position.y ||
          oldRotation !== fp.position.rotation ||
          effectiveOldSide !== newSide;
        const coordsChanged = hasSourceCoords
          ? positionDiffers
          : fp.position.x !== 0 || fp.position.y !== 0 || fp.position.rotation !== 0 || newSide !== 'front';

        if (!coordsChanged) continue;

        const shortFile = filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
        const labelParts: string[] = [`${prefix}${variable}`, `${shortFile}:${component.line}`];
        const oldStr = hasSourceCoords ? `(${oldX}, ${oldY})` : '(not set)';
        const sideInfo = effectiveOldSide !== newSide ? ` [${effectiveOldSide} → ${newSide}]` : '';
        labelParts.push(`pcb: ${oldStr} → (${fp.position.x}, ${fp.position.y})${sideInfo}`);

        changes.push({
          filePath,
          variableName: variable,
          prefix,
          oldX,
          oldY,
          oldRotation,
          oldSide,
          newX: fp.position.x,
          newY: fp.position.y,
          newRotation: fp.position.rotation,
          newSide,
          label: labelParts.join('  '),
        });
      }
    }

    return changes;
  }

  computeLayoutChanges(matchResults: MatchResult[], captureLayouts = false): PendingLayoutChange[] {
    const changes: PendingLayoutChange[] = [];
    const layoutTypes = ['referenceLayout', 'valueLayout', 'fabLayout'] as const;

    const byFile: Record<string, MatchResult[]> = {};
    for (const mr of matchResults) {
      if (!mr.sourceLocation) continue;
      const f = mr.sourceLocation.filePath;
      if (!byFile[f]) byFile[f] = [];
      byFile[f].push(mr);
    }

    for (const [filePath, mrs] of Object.entries(byFile)) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;

      for (const mr of mrs) {
        const fp = mr.irFootprint;
        const loc = mr.sourceLocation!;
        const variable = loc.variableName;
        if (!variable) continue;

        const component = analysis.components.find((c) => c.variableName === variable && c.isThis === loc.isThis);
        if (!component) continue;

        const prefix = getMemberPrefix(loc.isThis);

        for (const layoutType of layoutTypes) {
          const irLayout: TextLayoutIR | undefined = fp[layoutType];
          if (!irLayout) continue;

          const sourceLayout = this.getSourceLayout(
            analysis.layoutAssignments,
            component,
            variable,
            loc.isThis,
            layoutType,
          );

          if (sourceLayout === null && !captureLayouts) continue;

          const diff = this.computeLayoutDiff(sourceLayout, irLayout);
          if (diff.length === 0) continue;

          const shortFile = filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
          const labelParts: string[] = [
            `${prefix}${variable}.${layoutType}`,
            `${shortFile}:${component.line}`,
            diff.join(', '),
          ];

          changes.push({
            filePath,
            variableName: variable,
            prefix,
            layoutType,
            oldLayout: sourceLayout,
            newLayout: irLayout,
            label: labelParts.join('  '),
            changedProps: diff,
          });
        }
      }
    }

    return changes;
  }

  private getSourceLayout(
    layoutAssignments: LayoutAssignmentInfo[],
    component: { properties: Record<string, import('./source_analyzer.js').PropertyValue>; inlinePcb?: unknown },
    variableName: string,
    isThis: boolean,
    layoutType: string,
  ): TextLayoutIR | null {
    const assignment = layoutAssignments.find(
      (la) => la.variableName === variableName && la.isThis === isThis && la.propertyName === layoutType,
    );
    if (assignment) {
      return propsToLayoutIR(assignment.props);
    }

    const inlineProp = component.properties[layoutType];
    if (inlineProp && inlineProp.value && typeof inlineProp.value === 'object') {
      return propsToLayoutIR(inlineProp.value as Record<string, import('./source_analyzer.js').PropertyValue>);
    }

    return null;
  }

  private computeLayoutDiff(oldLayout: TextLayoutIR | null, newLayout: TextLayoutIR): string[] {
    const changed: string[] = [];
    const oldX = oldLayout?.x ?? 0;
    const oldY = oldLayout?.y ?? 0;
    if (Math.abs(oldX - newLayout.x) > 0.001 || Math.abs(oldY - newLayout.y) > 0.001) {
      changed.push(`position: (${oldX}, ${oldY}) → (${newLayout.x}, ${newLayout.y})`);
    }
    const oldR = oldLayout?.rotation ?? 0;
    const newR = newLayout.rotation ?? 0;
    if (Math.abs(oldR - newR) > 0.001) changed.push(`rotation: ${oldR} → ${newR}`);
    if (oldLayout?.layer !== newLayout.layer && newLayout.layer !== undefined) changed.push('layer');
    if (oldLayout?.width !== newLayout.width && newLayout.width !== undefined) changed.push('width');
    if (oldLayout?.height !== newLayout.height && newLayout.height !== undefined) changed.push('height');
    if (oldLayout?.thickness !== newLayout.thickness && newLayout.thickness !== undefined) changed.push('thickness');
    if ((oldLayout?.bold ?? false) !== (newLayout.bold ?? false)) changed.push('bold');
    if ((oldLayout?.italic ?? false) !== (newLayout.italic ?? false)) changed.push('italic');
    if (
      !justifyEquals(
        oldLayout?.justify as { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
        newLayout.justify as { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
      )
    )
      changed.push('justify');
    const oldShow = oldLayout?.show ?? true;
    const newShow = newLayout.show ?? true;
    if (oldShow !== newShow) changed.push('show');
    return changed;
  }

  applyLayoutChanges(changes: PendingLayoutChange[]): { filesModified: number; changesApplied: number } {
    const selectedByFile: Record<string, PendingLayoutChange[]> = {};
    for (const c of changes) {
      if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
      selectedByFile[c.filePath].push(c);
    }

    let filesModified = 0;

    for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;

      const replacements: Replacement[] = [];

      for (const change of fileChanges) {
        const component = analysis.components.find(
          (c) => c.variableName === change.variableName && c.isThis === change.prefix.startsWith('this.'),
        );
        if (!component) continue;

        const assignment = analysis.layoutAssignments.find(
          (la) =>
            la.variableName === change.variableName &&
            la.isThis === change.prefix.startsWith('this.') &&
            la.propertyName === change.layoutType,
        );

        if (assignment) {
          applyLayoutPropsToReplacements(replacements, assignment.objectRange, assignment.props, change.newLayout);
        } else {
          const inlineProp = component.properties[change.layoutType];
          if (inlineProp && inlineProp.value && typeof inlineProp.value === 'object') {
            const inlineProps = inlineProp.value as Record<string, import('./source_analyzer.js').PropertyValue>;
            applyLayoutPropsToReplacements(replacements, inlineProp.range, inlineProps, change.newLayout);
          } else {
            let source: string;
            try {
              source = fs.readFileSync(filePath, 'utf-8');
            } catch {
              continue;
            }

            const insertPos = component.creationRange.end;
            const lineStart = source.lastIndexOf('\n', component.creationRange.start - 1);
            const indent = lineStart >= 0 ? source.slice(lineStart + 1).match(/^(\s*)/)?.[1] || '' : '';

            const layoutObj = layoutIRToString(change.newLayout, change.layoutType);
            const newLine = `\n${indent}${change.prefix}${change.variableName}.${change.layoutType} = ${layoutObj};`;

            replacements.push({
              range: { start: insertPos, end: insertPos },
              newValue: newLine,
            });
          }
        }
      }

      if (replacements.length > 0) {
        const modified = applyReplacements(filePath, replacements);
        if (modified) filesModified++;
      }
    }

    return { filesModified, changesApplied: changes.length };
  }

  computeTextChanges(ir: KicadIR, sourceFiles: string[]): PendingTextChange[] {
    if (ir.textElements.length === 0) return [];

    interface SourceTextCall {
      filePath: string;
      lineIdx: number;
      endIdx: number;
      callText: string;
      sourceText: string;
      x: number;
      y: number;
      rotation: number;
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
      const textCallInfos = findTextCalls(filePath);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n');

      for (const tc of textCallInfos) {
        const lineIdx = tc.line - 1;

        let callText = '';
        let endIdx = lineIdx;
        for (let j = lineIdx; j < Math.min(lines.length, lineIdx + 30); j++) {
          callText += (j > lineIdx ? '\n' : '') + lines[j];
          endIdx = j;
          if (lines[j].match(/\}\s*\)/)) break;
        }

        const props = tc.props;
        const justifyVal = props['justify']?.value;
        let justify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
        if (justifyVal && typeof justifyVal === 'object') {
          justify = justifyVal as { horizontal?: string; vertical?: string; mirror?: boolean };
        }

        sourceCalls.push({
          filePath,
          lineIdx,
          endIdx,
          callText,
          sourceText: tc.text,
          x: (props['x']?.value as number) ?? 0,
          y: (props['y']?.value as number) ?? 0,
          rotation: (props['rotation']?.value as number) ?? 0,
          layer: (props['layer']?.value as string) ?? 'F.SilkS',
          font: props['font']?.value as string | undefined,
          width: props['width']?.value as number | undefined,
          height: props['height']?.value as number | undefined,
          thickness: props['thickness']?.value as number | undefined,
          bold: props['bold']?.value === true,
          italic: props['italic']?.value === true,
          justify,
        });
      }
    }

    if (sourceCalls.length === 0) return [];

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

    const unmatchedSource = sourceCalls.filter((_, i) => !matchedSourceIdxs.has(i));
    const unmatchedPcb = ir.textElements.filter((t) => !matchedPcbTexts.has(t.text));

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
      const thicknessChanged =
        src.thickness !== pcb.thickness && (src.thickness !== undefined || pcb.thickness !== undefined);
      const boldChanged = src.bold !== (pcb.bold || false);
      const italicChanged = src.italic !== (pcb.italic || false);
      const justifyChanged = !justifyEquals(src.justify, pcb.justify);

      if (
        !xChanged &&
        !yChanged &&
        !rChanged &&
        !textChanged &&
        !layerChanged &&
        !fontChanged &&
        !widthChanged &&
        !heightChanged &&
        !thicknessChanged &&
        !boldChanged &&
        !italicChanged &&
        !justifyChanged
      )
        continue;

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
      const propsStr = changedProps.filter((p) => p !== 'position').join(', ');
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
        oldX: src.x,
        oldY: src.y,
        oldRotation: src.rotation,
        newX: pcb.x,
        newY: pcb.y,
        newRotation: pcb.rotation,
        oldLayer: src.layer,
        newLayer: pcb.layer,
        oldFont: src.font,
        newFont: pcb.fontFace,
        oldWidth: src.width,
        newWidth: pcbWidth,
        oldHeight: src.height,
        newHeight: pcbHeight,
        oldThickness: src.thickness,
        newThickness: pcb.thickness,
        oldBold: src.bold,
        newBold: pcb.bold || false,
        oldItalic: src.italic,
        newItalic: pcb.italic || false,
        oldJustify: src.justify,
        newJustify: pcb.justify,
        label: labelParts.join('  '),
        changedProps,
      });
    }

    return changes;
  }

  applyFootprintChanges(changes: PendingChange[]): { filesModified: number; changesApplied: number } {
    const selectedByFile: Record<string, PendingChange[]> = {};
    for (const c of changes) {
      if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
      selectedByFile[c.filePath].push(c);
    }

    let filesModified = 0;

    for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;

      const replacements: Replacement[] = [];

      for (const change of fileChanges) {
        const component = analysis.components.find(
          (c) => c.variableName === change.variableName && c.isThis === change.prefix.startsWith('this.'),
        );
        if (!component) continue;

        const pcbAssignment = analysis.pcbAssignments.find(
          (p) => p.variableName === change.variableName && p.isThis === change.prefix.startsWith('this.'),
        );

        if (pcbAssignment) {
          const props = pcbAssignment.props;
          if (props['x'] && change.newX !== undefined) {
            replacements.push({ range: props['x'].range, newValue: String(change.newX) });
          }
          if (props['y'] && change.newY !== undefined) {
            replacements.push({ range: props['y'].range, newValue: String(change.newY) });
          }
          if (props['rotation'] && change.newRotation !== undefined) {
            replacements.push({ range: props['rotation'].range, newValue: String(change.newRotation) });
          }
          if (change.newSide === 'back') {
            if (props['side']) {
              replacements.push({ range: props['side'].range, newValue: "'back'" });
            } else {
              const insertPos = pcbAssignment.objectRange.end - 1;
              replacements.push({
                range: { start: insertPos, end: insertPos },
                newValue: `, side: 'back'`,
              });
            }
          } else if (change.newSide === 'front' && props['side']) {
            replacements.push({ range: props['side'].range, newValue: "'front'" });
          }
        } else if (component.inlinePcb) {
          const props = component.inlinePcb.props;
          if (props['x'] && change.newX !== undefined) {
            replacements.push({ range: props['x'].range, newValue: String(change.newX) });
          }
          if (props['y'] && change.newY !== undefined) {
            replacements.push({ range: props['y'].range, newValue: String(change.newY) });
          }
          if (props['rotation'] && change.newRotation !== undefined) {
            replacements.push({ range: props['rotation'].range, newValue: String(change.newRotation) });
          }
          if (change.newSide === 'back') {
            if (props['side']) {
              replacements.push({ range: props['side'].range, newValue: "'back'" });
            } else {
              const insertPos = component.inlinePcb.range.end - 1;
              replacements.push({
                range: { start: insertPos, end: insertPos },
                newValue: `, side: 'back'`,
              });
            }
          } else if (change.newSide === 'front' && props['side']) {
            replacements.push({ range: props['side'].range, newValue: "'front'" });
          }
        } else {
          let source: string;
          try {
            source = fs.readFileSync(filePath, 'utf-8');
          } catch {
            continue;
          }

          const insertPos = component.creationRange.end;
          const lineStart = source.lastIndexOf('\n', component.creationRange.start - 1);
          const indent = lineStart >= 0 ? source.slice(lineStart + 1).match(/^(\s*)/)?.[1] || '' : '';

          const sidePart = change.newSide === 'back' ? `, side: 'back'` : '';
          const newLine = `\n${indent}${change.prefix}${change.variableName}.pcb = { x: ${change.newX}, y: ${change.newY}, rotation: ${change.newRotation}${sidePart} };`;

          replacements.push({
            range: { start: insertPos, end: insertPos },
            newValue: newLine,
          });
          continue;
        }
      }

      if (replacements.length > 0) {
        const modified = applyReplacements(filePath, replacements);
        if (modified) filesModified++;
      }
    }

    return { filesModified, changesApplied: changes.length };
  }

  applyTextChanges(changes: PendingTextChange[]): { filesModified: number; changesApplied: number } {
    const selectedByFile: Record<string, PendingTextChange[]> = {};
    for (const c of changes) {
      if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
      selectedByFile[c.filePath].push(c);
    }

    let filesModified = 0;

    for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
      const textCallInfos = findTextCalls(filePath);
      const replacements: Replacement[] = [];

      for (const change of fileChanges) {
        const tc = textCallInfos.find((t) => t.text === change.sourceTextContent);
        if (!tc) continue;

        const props = tc.props;

        if (change.sourceTextContent !== change.newPcbText && props['text']) {
          const textRange = props['text'].range;
          replacements.push({
            range: textRange,
            newValue: `'${change.newPcbText}'`,
          });
        }
        if (Math.abs(change.oldX - change.newX) > 0.001 && props['x']) {
          replacements.push({ range: props['x'].range, newValue: String(change.newX) });
        }
        if (Math.abs(change.oldY - change.newY) > 0.001 && props['y']) {
          replacements.push({ range: props['y'].range, newValue: String(change.newY) });
        }
        if (Math.abs(change.oldRotation - change.newRotation) > 0.001 && props['rotation']) {
          replacements.push({ range: props['rotation'].range, newValue: String(change.newRotation) });
        }
        if (change.oldLayer !== change.newLayer && props['layer']) {
          replacements.push({ range: props['layer'].range, newValue: `'${change.newLayer}'` });
        }
        if (change.oldFont !== change.newFont && change.newFont && props['font']) {
          replacements.push({ range: props['font'].range, newValue: `'${change.newFont}'` });
        }
        if (change.newWidth !== undefined && change.oldWidth !== change.newWidth && props['width']) {
          replacements.push({ range: props['width'].range, newValue: String(change.newWidth) });
        }
        if (change.newHeight !== undefined && change.oldHeight !== change.newHeight && props['height']) {
          replacements.push({ range: props['height'].range, newValue: String(change.newHeight) });
        }
        if (change.newThickness !== undefined && change.oldThickness !== change.newThickness && props['thickness']) {
          replacements.push({ range: props['thickness'].range, newValue: String(change.newThickness) });
        }
        if (change.oldBold !== change.newBold && props['bold']) {
          replacements.push({ range: props['bold'].range, newValue: String(change.newBold) });
        }
        if (change.oldItalic !== change.newItalic && props['italic']) {
          replacements.push({ range: props['italic'].range, newValue: String(change.newItalic) });
        }
        if (!justifyEquals(change.oldJustify, change.newJustify) && change.newJustify && props['justify']) {
          const j = change.newJustify;
          const newParts: string[] = [];
          if (j.horizontal) newParts.push(`horizontal: '${j.horizontal}'`);
          if (j.vertical) newParts.push(`vertical: '${j.vertical}'`);
          if (j.mirror) newParts.push('mirror: true');
          if (newParts.length > 0) {
            replacements.push({
              range: props['justify'].range,
              newValue: `{ ${newParts.join(', ')} }`,
            });
          }
        }
      }

      if (replacements.length > 0) {
        const modified = applyReplacements(filePath, replacements);
        if (modified) filesModified++;
      }
    }

    return { filesModified, changesApplied: changes.length };
  }
}

function justifyEquals(
  a: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
  b: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a.horizontal ?? undefined) === (b.horizontal ?? undefined) &&
    (a.vertical ?? undefined) === (b.vertical ?? undefined) &&
    (a.mirror ?? false) === (b.mirror ?? false)
  );
}

function textFuzzyMatch(sourceText: string, pcbText: string): boolean {
  if (sourceText === pcbText) return true;
  if (pcbText.startsWith(sourceText) || sourceText.startsWith(pcbText)) return true;
  if (pcbText.includes(sourceText) || sourceText.includes(pcbText)) return true;
  return false;
}

function propsToLayoutIR(props: Record<string, import('./source_analyzer.js').PropertyValue>): TextLayoutIR {
  const result: TextLayoutIR = {
    x: (props['x']?.value as number) ?? 0,
    y: (props['y']?.value as number) ?? 0,
  };
  if (props['rotation']?.value !== undefined) result.rotation = props['rotation'].value as number;
  if (props['layer']?.value !== undefined) result.layer = props['layer'].value as string;
  if (props['width']?.value !== undefined) result.width = props['width'].value as number;
  if (props['height']?.value !== undefined) result.height = props['height'].value as number;
  if (props['thickness']?.value !== undefined) result.thickness = props['thickness'].value as number;
  if (props['bold']?.value !== undefined) result.bold = props['bold'].value as boolean;
  if (props['italic']?.value !== undefined) result.italic = props['italic'].value as boolean;
  if (props['show']?.value !== undefined) result.show = props['show'].value as boolean;
  const justifyVal = props['justify']?.value;
  if (justifyVal && typeof justifyVal === 'object') {
    result.justify = justifyVal as TextLayoutIR['justify'];
  }
  return result;
}

function applyLayoutPropsToReplacements(
  replacements: Replacement[],
  objectRange: { start: number; end: number },
  props: Record<string, import('./source_analyzer.js').PropertyValue>,
  newLayout: TextLayoutIR,
): void {
  const layoutKeys = ['x', 'y', 'rotation', 'layer', 'width', 'height', 'thickness', 'bold', 'italic', 'show'] as const;
  const hasMissing = layoutKeys.some((k) => newLayout[k as keyof TextLayoutIR] !== undefined && !props[k]);

  if (hasMissing) {
    replacements.push({
      range: objectRange,
      newValue: layoutIRToString(newLayout, ''),
    });
    return;
  }

  if (props['x'] && newLayout.x !== undefined) {
    replacements.push({ range: props['x'].range, newValue: String(newLayout.x) });
  }
  if (props['y'] && newLayout.y !== undefined) {
    replacements.push({ range: props['y'].range, newValue: String(newLayout.y) });
  }
  if (props['rotation'] && newLayout.rotation !== undefined) {
    replacements.push({ range: props['rotation'].range, newValue: String(newLayout.rotation) });
  }
  if (props['layer'] && newLayout.layer !== undefined) {
    replacements.push({ range: props['layer'].range, newValue: `'${newLayout.layer}'` });
  }
  if (props['width'] && newLayout.width !== undefined) {
    replacements.push({ range: props['width'].range, newValue: String(newLayout.width) });
  }
  if (props['height'] && newLayout.height !== undefined) {
    replacements.push({ range: props['height'].range, newValue: String(newLayout.height) });
  }
  if (props['thickness'] && newLayout.thickness !== undefined) {
    replacements.push({ range: props['thickness'].range, newValue: String(newLayout.thickness) });
  }
  if (props['bold'] && newLayout.bold !== undefined) {
    replacements.push({ range: props['bold'].range, newValue: String(newLayout.bold) });
  }
  if (props['italic'] && newLayout.italic !== undefined) {
    replacements.push({ range: props['italic'].range, newValue: String(newLayout.italic) });
  }
  if (props['show'] && newLayout.show !== undefined) {
    replacements.push({ range: props['show'].range, newValue: String(newLayout.show) });
  }
}

function layoutIRToString(layout: TextLayoutIR, layoutType: string): string {
  const parts: string[] = [`x: ${layout.x}`, `y: ${layout.y}`];
  if (layout.rotation !== undefined) parts.push(`rotation: ${layout.rotation}`);
  if (layout.layer !== undefined) parts.push(`layer: '${layout.layer}'`);
  if (layout.width !== undefined) parts.push(`width: ${layout.width}`);
  if (layout.height !== undefined) parts.push(`height: ${layout.height}`);
  if (layout.thickness !== undefined) parts.push(`thickness: ${layout.thickness}`);
  if (layout.bold !== undefined) parts.push(`bold: ${layout.bold}`);
  if (layout.italic !== undefined) parts.push(`italic: ${layout.italic}`);
  if (layout.show !== undefined) parts.push(`show: ${layout.show}`);
  if (layout.justify) {
    const jParts: string[] = [];
    if (layout.justify.horizontal) jParts.push(`horizontal: '${layout.justify.horizontal}'`);
    if (layout.justify.vertical) jParts.push(`vertical: '${layout.justify.vertical}'`);
    if (layout.justify.mirror) jParts.push('mirror: true');
    if (jParts.length > 0) parts.push(`justify: { ${jParts.join(', ')} }`);
  }
  return `{ ${parts.join(', ')} }`;
}
