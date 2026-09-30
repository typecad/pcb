/**
 * kicad2typecad CLI — round-trip KiCad .kicad_pcb → TypeCAD TypeScript.
 *
 * ## Pipeline Overview
 *
 *   .kicad_pcb file
 *     → SExprNode (sexpr_tree.ts)
 *       → KicadIR  (ir_builder.ts)
 *         ├─ display  (display.ts)   → console code generation
 *         └─ --apply branch:
 *              KicadIR → SourceMatcher (matcher.ts)  → MatchResult[]
 *                       → SourceRewriter (rewriter.ts) → interactive apply
 *
 * ## Usage
 *   kicadDataToTypeCAD("board.kicad_pcb")            // display mode
 *   kicadDataToTypeCAD("board.kicad_pcb", { apply: true })  // apply mode
 */

import fs from 'node:fs';
import chalk from 'chalk';
import { checkbox } from '@inquirer/prompts';
import logger from '../utils/logging.js';
import { PCB } from '../pcb/pcb.js';
import { SExprNode } from './sexpr_tree.js';
import { KicadIRBuilder } from './ir_builder.js';
import { SourceMatcher } from './matcher.js';
import { SourceRewriter } from './rewriter.js';
import { collectTypeScriptFiles, findTextCalls } from './source_analyzer.js';
import {
  generateTrackCode,
  generatePlacementCode,
  generateTextCode,
  generateOutlineCode,
  generateStackupCode,
  generateZoneCode,
  generateCreateStatement,
  DEFAULT_CH,
} from './display.js';
import type { ChalkHelpers } from './display.js';
import {
  computeOutlineChanges,
  computeRoutingChanges,
  computeZoneChanges,
  applySourceChanges,
} from './apply_source.js';
import type {
  KicadIR,
  MatchResult,
  PendingChange,
  PendingSourceChange,
  PendingTextChange,
  PendingLayoutChange,
} from './types.js';

// === Main entry point ===

export async function kicadDataToTypeCAD(
  filePath: string,
  options?: { apply?: boolean; captureLayouts?: boolean },
): Promise<void> {
  const sourceDescription = `File: ${filePath}`;

  try {
    logger.info(`Reading from ${sourceDescription}`);

    // 1. Read the .kicad_pcb file
    if (!fs.existsSync(filePath)) {
      logger.error(`Error: File not found at ${filePath}`);
      return;
    }
    const sExpressionText = fs.readFileSync(filePath, 'utf-8');
    if (!sExpressionText.trim()) {
      logger.info(`${sourceDescription} is empty.`);
      return;
    }

    // 2. Parse S-expression → typed tree
    const tree = SExprNode.parse(sExpressionText);
    if (!tree) {
      logger.error(`Parsed data from ${sourceDescription} is empty or invalid.`);
      return;
    }

    // 3. Build IR
    const builder = new KicadIRBuilder();
    const ir = builder.build(tree);

    logger.info(
      `Parsed ${ir.footprints.length} footprints, ${ir.segments.length} segments, ` +
        `${ir.textElements.length} text elements, ${ir.vias.length} vias, ` +
        `${ir.outlines.length} outlines, ${ir.zones.length} zones, ${ir.nets.length} nets`,
    );

    if (ir.unsupported.length > 0) {
      const summary = ir.unsupported.map((u) => `${u.count} ${u.type}(s)`).join(', ');
      logger.warn(`Not imported: ${summary} — ${ir.unsupported.map((u) => u.reason).join('; ')}`);
    }

    const ch: ChalkHelpers = DEFAULT_CH;

    // 4. --apply mode: round-trip back to source files
    if (options?.apply) {
      await applyMode(ir, filePath, sourceDescription, options);
      return;
    }

    // 5. Display mode: generate TypeCAD code to console
    const pcb = new PCB('KicadImportFromFile');

    // Tracks
    const trackVariableNames = generateTrackCode(ir, pcb, sourceDescription, ch);

    // Footprint placement
    generatePlacementCode(ir.footprints, sourceDescription, ch);

    // Text elements
    generateTextCode(ir, sourceDescription, ch);

    // Board outline
    generateOutlineCode(ir, sourceDescription, ch);

    // Layer stackup
    generateStackupCode(ir, sourceDescription, ch);

    // Zones and rule areas
    generateZoneCode(ir, sourceDescription, ch);

    // Create statement
    generateCreateStatement(ir.footprints, trackVariableNames, sourceDescription, ch);
  } catch (error: unknown) {
    logger.error(`Error processing data from ${sourceDescription}: ${(error as Error).message}`);
  }
}

// === Apply mode implementation ===

async function applyMode(
  ir: KicadIR,
  kicadFilePath: string,
  sourceDescription: string,
  options?: { apply?: boolean; captureLayouts?: boolean },
): Promise<void> {
  // Determine source root from the KiCad file location
  // The KiCad file is typically in a build/ directory; source is usually in src/
  const kicadDir = kicadFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '.';

  // Try src/ as sibling of build/, or fall back to the project root
  const projectRoot = kicadDir.replace(/(^|\/)build$/, '') || '.';
  const sourceRoot = fs.existsSync(projectRoot + '/src') ? projectRoot + '/src' : projectRoot;

  // 1. Match IR footprints to source locations
  const matcher = new SourceMatcher(sourceRoot);
  const matchResults = matcher.matchAll(ir.footprints);

  const matchedCount = matchResults.filter((mr) => mr.sourceLocation !== null).length;
  logger.info(`Matched ${matchedCount}/${ir.footprints.length} footprints to source locations`);

  // 2. Compute footprint changes
  const rewriter = new SourceRewriter();
  const footprintChanges = rewriter.computeFootprintChanges(matchResults);

  // 3. Compute text changes (scan all project source files for .text() calls —
  // silkscreen text usually lives where no footprint is declared)
  const sourceFiles = collectTypeScriptFiles(sourceRoot);
  const textChanges = rewriter.computeTextChanges(ir, sourceFiles);

  // 4. Compute layout changes (referenceLayout, valueLayout, fabLayout)
  const layoutChanges = rewriter.computeLayoutChanges(matchResults, options?.captureLayouts ?? false);

  // 5. Apply footprint changes interactively
  if (footprintChanges.length > 0) {
    const footprintResult = await interactiveApplyFootprints(footprintChanges);
    if (footprintResult.applied > 0) {
      logger.log(
        chalk.green(
          `\n✓ Applied ${footprintResult.applied} component change(s) to ${footprintResult.filesModified} file(s).`,
        ),
      );
    }
  } else {
    logger.log(chalk.green('\nAll component positions are up to date. No changes needed.'));
  }

  // 6. Apply text changes interactively
  if (textChanges.length > 0) {
    const textResult = await interactiveApplyTexts(textChanges);
    if (textResult.applied > 0) {
      logger.log(
        chalk.green(`\n✓ Applied ${textResult.applied} text change(s) to ${textResult.filesModified} file(s).`),
      );
    }
  } else if (ir.textElements.length > 0) {
    const hasSourceTextCalls = sourceFiles.some((f) => findTextCalls(f).length > 0);
    if (hasSourceTextCalls) {
      logger.log(chalk.green('\nAll text positions are up to date.'));
    } else {
      logger.log(
        chalk.yellow(
          `\n${ir.textElements.length} board text element(s) have no matching typecad.text() call in the source. ` +
            'Run without --apply to see the generated text code for manual insertion.',
        ),
      );
    }
  }

  // 7. Apply layout changes interactively
  if (layoutChanges.length > 0) {
    const layoutResult = await interactiveApplyLayouts(layoutChanges);
    if (layoutResult.applied > 0) {
      logger.log(
        chalk.green(`\n✓ Applied ${layoutResult.applied} layout change(s) to ${layoutResult.filesModified} file(s).`),
      );
    }
  } else if (!options?.captureLayouts) {
    const hasLayoutsInIR = matchResults.some(
      (mr) => mr.irFootprint.referenceLayout || mr.irFootprint.valueLayout || mr.irFootprint.fabLayout,
    );
    if (hasLayoutsInIR) {
      logger.log(
        chalk.gray(
          '\nLayout positions use footprint template defaults. ' +
            'Use --capture-layouts to import all text positions into source.',
        ),
      );
    }
  }

  // 8. Compute outline / zone / routing write-back changes
  const zoneResult = computeZoneChanges(ir, sourceFiles);
  const outlineResult = computeOutlineChanges(ir, sourceFiles);
  const routingResult = computeRoutingChanges(ir, sourceFiles);
  for (const note of [...zoneResult.notes, ...outlineResult.notes, ...routingResult.notes]) {
    logger.log(chalk.gray(`\nnote: ${note}`));
  }

  // 9. Apply the new categories interactively — all selected changes go
  // through ONE replacement pass per file so ranges stay valid.
  const selectedSource: PendingSourceChange[] = [];
  const declined: PendingSourceChange[] = [];

  if (outlineResult.changes.length > 0) {
    selectedSource.push(...(await interactiveApplySourceChanges('board outline', outlineResult.changes, declined)));
  }
  if (zoneResult.changes.length > 0) {
    selectedSource.push(...(await interactiveApplySourceChanges('zone', zoneResult.changes, declined)));
  }
  if (routingResult.changes.length > 0) {
    selectedSource.push(...(await interactiveApplySourceChanges('routing', routingResult.changes, declined)));
  }

  if (selectedSource.length > 0) {
    const result = applySourceChanges(selectedSource);
    if (result.changesApplied > 0) {
      logger.log(
        chalk.green(
          `\n✓ Applied ${result.changesApplied} outline/zone/routing change(s) to ${result.filesModified} file(s).`,
        ),
      );
    }
  }

  // 10. Manual-insertion fallback: show generated code for categories the
  // user declined (or that could not be written automatically).
  if (declined.some((c) => c.kind === 'tracks' || c.kind === 'via')) {
    const pcb = new PCB('KicadImportFromFile');
    generateTrackCode(ir, pcb, sourceDescription);
  }
  if (declined.some((c) => c.kind === 'zone' || c.kind === 'keepout')) {
    generateZoneCode(ir, sourceDescription);
  }

  if (
    footprintChanges.length === 0 &&
    textChanges.length === 0 &&
    layoutChanges.length === 0 &&
    zoneResult.changes.length === 0 &&
    outlineResult.changes.length === 0 &&
    routingResult.changes.length === 0
  ) {
    logger.log(chalk.green('\nNo changes detected. Everything is in sync.'));
  }

  logger.log(chalk.gray('\nRebuild with: npm run build'));
}

/** Checkbox selection for pre-computed source changes; unselected ones land in `declined`. */
async function interactiveApplySourceChanges(
  category: string,
  changes: PendingSourceChange[],
  declined: PendingSourceChange[],
): Promise<PendingSourceChange[]> {
  logger.log(chalk.bold(`\n${changes.length} ${category} change(s) detected:\n`));
  for (const c of changes) {
    logger.log(`    ${chalk.blueBright(c.label)}`);
  }

  const selected: PendingSourceChange[] = await checkbox({
    message: `Select ${category} changes to apply:`,
    choices: changes.map((c) => ({
      name: c.label,
      value: c,
    })),
  });

  if (selected.length === 0) {
    logger.log(chalk.gray(`\nNo ${category} changes selected.`));
  }
  declined.push(...changes.filter((c) => !selected.includes(c)));
  return selected;
}

async function interactiveApplyFootprints(
  changes: PendingChange[],
): Promise<{ filesModified: number; applied: number }> {
  // Show summary
  logger.log(chalk.bold(`\n${changes.length} component(s) have new positions:\n`));
  const byFile: Record<string, PendingChange[]> = {};
  for (const c of changes) {
    if (!byFile[c.filePath]) byFile[c.filePath] = [];
    byFile[c.filePath].push(c);
  }
  for (const [file, fileChanges] of Object.entries(byFile)) {
    const shortFile = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
    logger.log(chalk.yellow(`  ${shortFile}:`));
    for (const c of fileChanges) {
      const oldStr = c.oldX !== null ? `(${c.oldX}, ${c.oldY})` : '(not set)';
      const effectiveOldSide = c.oldSide || 'front';
      const sideChanged = effectiveOldSide !== c.newSide;
      const sideInfo = sideChanged ? ` ${chalk.magenta(`[${effectiveOldSide} → ${c.newSide}]`)}` : '';
      logger.log(
        `    ${chalk.blueBright(c.prefix + c.variableName.padEnd(14))} ${oldStr} → (${c.newX}, ${c.newY})${sideInfo}`,
      );
    }
  }

  // Interactive selection
  const selected: PendingChange[] = await checkbox({
    message: 'Select changes to apply:',
    choices: changes.map((c) => ({
      name: c.label,
      value: c,
    })),
  });

  if (selected.length === 0) {
    logger.log(chalk.gray('\nNo changes selected.'));
    return { filesModified: 0, applied: 0 };
  }

  // Apply
  const rewriter = new SourceRewriter();
  const result = rewriter.applyFootprintChanges(selected);
  return { filesModified: result.filesModified, applied: selected.length };
}

async function interactiveApplyTexts(
  changes: PendingTextChange[],
): Promise<{ filesModified: number; applied: number }> {
  // Show summary
  logger.log(chalk.bold(`\n${changes.length} text element(s) have changes:\n`));
  for (const c of changes) {
    const propsStr = c.changedProps.length > 0 ? ` ${chalk.magenta(`[${c.changedProps.join(', ')}]`)}` : '';
    logger.log(
      `    ${chalk.blueBright(`"${c.sourceTextContent}"`)}  (${c.oldX}, ${c.oldY}) → (${c.newX}, ${c.newY})${propsStr}`,
    );
  }

  // Interactive selection
  const selected: PendingTextChange[] = await checkbox({
    message: 'Select text changes to apply:',
    choices: changes.map((c) => ({
      name: c.label,
      value: c,
    })),
  });

  if (selected.length === 0) {
    logger.log(chalk.gray('\nNo text changes selected.'));
    return { filesModified: 0, applied: 0 };
  }

  // Apply
  const rewriter = new SourceRewriter();
  const result = rewriter.applyTextChanges(selected);
  return { filesModified: result.filesModified, applied: selected.length };
}

async function interactiveApplyLayouts(
  changes: PendingLayoutChange[],
): Promise<{ filesModified: number; applied: number }> {
  logger.log(chalk.bold(`\n${changes.length} text layout(s) have changes:\n`));
  for (const c of changes) {
    const propsStr = c.changedProps.length > 0 ? ` ${chalk.magenta(`[${c.changedProps.join(', ')}]`)}` : '';
    logger.log(`    ${chalk.blueBright(`${c.prefix}${c.variableName}.${c.layoutType}`)}${propsStr}`);
  }

  const selected: PendingLayoutChange[] = await checkbox({
    message: 'Select layout changes to apply:',
    choices: changes.map((c) => ({
      name: c.label,
      value: c,
    })),
  });

  if (selected.length === 0) {
    logger.log(chalk.gray('\nNo layout changes selected.'));
    return { filesModified: 0, applied: 0 };
  }

  const rewriter = new SourceRewriter();
  const result = rewriter.applyLayoutChanges(selected);
  return { filesModified: result.filesModified, applied: selected.length };
}
