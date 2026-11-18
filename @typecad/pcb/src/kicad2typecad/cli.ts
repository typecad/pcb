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
 *   kicadDataToTypeCAD("board.kicad_pcb", { apply: true, auto: true })  // non-interactive
 *   kicadDataToTypeCAD("board.kicad_pcb", { watch: true })  // re-run on board saves
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { checkbox } from '@inquirer/prompts';
import logger from '../utils/logging.js';
import { PCB } from '../pcb/pcb.js';
import { SExprNode } from './sexpr_tree.js';
import { KicadIRBuilder } from './ir_builder.js';
import { SourceMatcher } from './matcher.js';
import { SourceRewriter } from './rewriter.js';
import { analyzeFile, collectTypeScriptFiles, findTextCalls } from './source_analyzer.js';
import {
  generateTrackCode,
  generatePlacementCode,
  generateTextCode,
  generateOutlineCode,
  generateStackupCode,
  generateZoneCode,
  generateCreateStatement,
  generateGraphicsCode,
  DEFAULT_CH,
} from './display.js';
import type { ChalkHelpers } from './display.js';
import {
  computeGraphicsChanges,
  computeOutlineChanges,
  computeRoutingChanges,
  computeStackupChanges,
  computeTextSectionChanges,
  computeZoneChanges,
  applySourceChanges,
  computeComponentDeletions,
  componentDeletionChanges,
} from './apply_source.js';
import type { ComponentDeletionCandidate } from './apply_source.js';
import { startBoardWatch } from './watch.js';
import { collectLocalDependencies } from '../cli/typecad/watch.js';

/** The board stems the project's build manifest lists (multi-board
 *  detection). Empty without a manifest — every project is then
 *  single-board as far as the sync is concerned. */
function readBoardsManifestStems(projectRoot: string): string[] {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'build', '.typecad-board.json'), 'utf-8'),
    ) as { boards?: unknown };
    if (!Array.isArray(manifest.boards)) return [];
    return manifest.boards
      .filter((b): b is string => typeof b === 'string' && b.endsWith('.kicad_pcb'))
      .map((b) => b.replace('\.kicad_pcb$', ''));
  } catch {
    return [];
  }
}
import {
  acquireProjectLock,
  changedSince,
  fingerprintIR,
  latestSnapshotInfo,
  ownershipViolations,
  parseGate,
  parserSelfTest,
  restoreSnapshot,
  stampFiles,
  takeSnapshot,
} from './safety.js';
import type { SourceStamps } from './safety.js';
import { computeAllSourceChanges } from './apply_source.js';
import type {
  KicadIR,
  MatchResult,
  PendingChange,
  PendingSourceChange,
  PendingTextChange,
  PendingLayoutChange,
} from './types.js';

/** Options shared by the CLI entry, the watch loop and the apply helpers. */
export interface ImportOptions {
  apply?: boolean;
  /** Apply every detected change without prompting. */
  auto?: boolean;
  /** Watch the board file and re-run on every save. */
  watch?: boolean;
  /** Compute and print every change (with edits) but write nothing. */
  dryRun?: boolean;
  /** Restore the most recent pre-apply snapshot and exit. */
  restore?: boolean;
}

// === Main entry point ===

export async function kicadDataToTypeCAD(filePath: string, options?: ImportOptions): Promise<void> {
  // Parser self-test: a broken TS parser once made apply silently match
  // nothing. Fail loudly before any work happens.
  const selfTest = parserSelfTest();
  if (!selfTest.ok) {
    logger.error(
      `Source parser self-test failed: ${selfTest.detail}. ` +
        'Reinstall dependencies (npm install acorn-typescript) — refusing to touch source files.',
    );
    return;
  }

  const kicadDir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '.';
  const projectRoot = kicadDir.replace(/(^|[\\/])build$/, '') || '.';

  if (options?.restore) {
    const info = latestSnapshotInfo(projectRoot);
    if (!info) {
      logger.error(`No snapshot found for ${projectRoot} — nothing to restore.`);
      return;
    }
    const result = restoreSnapshot(projectRoot);
    logger.log(
      chalk.green(
        `
✓ Restored ${result.restored} file(s) from snapshot ${info.id} ` +
          `(taken ${new Date(info.createdAt).toLocaleString()}).`,
      ),
    );
    return;
  }

  // One import process per project: `npm run sync` plus a manual `import`
  // must not interleave their writes.
  const lock = acquireProjectLock(projectRoot);
  if (!lock.ok) {
    logger.error(`Another import process (${lock.holder}) is running on this project — exiting.`);
    return;
  }

  try {
    if (options?.watch) {
      // Watch mode runs the first cycle immediately, then re-runs on saves.
      // `watch` is stripped from the per-cycle options by startBoardWatch.
      const session = startBoardWatch(filePath, options, (file, cycleOptions) => runOnce(file, cycleOptions));
      const innerStop = session.stop.bind(session);
      session.stop = () => {
        innerStop();
        lock.release();
      };
      await session.forever;
      return;
    }

    await runOnce(filePath, options);
  } finally {
    lock.release();
  }
}

/** One full import pass: apply (interactive or --auto) or display. */
export async function runOnce(filePath: string, options?: ImportOptions): Promise<void> {
  const sourceDescription = `File: ${filePath}`;

  try {
    logger.info(`Reading from ${sourceDescription}`);

    // 1. Read the .kicad_pcb file
    if (!fs.existsSync(filePath)) {
      logger.error(`Error: File not found at ${filePath}`);
      return;
    }
    let sExpressionText: string;
    try {
      sExpressionText = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      // Watch cycles can race KiCad's write (EBUSY/EPERM on Windows) — the
      // next save event re-reads, so this is not fatal.
      logger.warn(`Could not read ${sourceDescription} (${(error as Error).message}); waiting for the next save.`);
      return;
    }
    if (!sExpressionText.trim()) {
      logger.info(`${sourceDescription} is empty.`);
      return;
    }

    // 2. Parse S-expression → typed tree
    let tree: ReturnType<typeof SExprNode.parse>;
    try {
      tree = SExprNode.parse(sExpressionText);
    } catch (error) {
      // A partially written file fails to parse; watch mode picks up the
      // completed write on the next event.
      logger.warn(`Could not parse ${sourceDescription} (${(error as Error).message}); waiting for the next save.`);
      return;
    }
    if (!tree) {
      logger.error(`Parsed data from ${sourceDescription} is empty or invalid.`);
      return;
    }

    // A parseable file that is not a board (a .kicad_sch handed over by
    // mistake, a project file, anything else s-expression shaped) would
    // otherwise import as an empty board and apply destructive deletions.
    if (!tree.is('kicad_pcb')) {
      logger.error(
        `${sourceDescription} does not look like a .kicad_pcb file (root element is ${JSON.stringify(tree.name)}). Refusing to import.`,
      );
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

    // Board graphics on silk/user layers
    generateGraphicsCode(ir, sourceDescription, ch);

    // Create statement
    generateCreateStatement(ir.footprints, trackVariableNames, sourceDescription, ch);
  } catch (error: unknown) {
    logger.error(`Error processing data from ${sourceDescription}: ${(error as Error).message}`);
  }
}

// === Apply mode implementation ===

/**
 * Multi-board scoping for a sync cycle: when the project's build manifest
 * lists more than one board, the cycle is scoped to THIS board's sources —
 * the entry is the file constructing `new PCB('<stem>')`, and the scope is
 * its local import graph (the per-board sidecar rides in it). Every
 * name-based guard — variable ambiguity, the sidecar-first assignment
 * search, routing ownership — then sees only files that can legally hold
 * this board's components, so the same variable name on two boards is no
 * longer "ambiguous". Single-board projects keep the whole-src scan
 * (orphans like scratch files stay visible exactly as before).
 */
export function scopeSourceFilesToBoard(
  sourceFiles: string[],
  projectRoot: string,
  stem: string,
): string[] {
  if (readBoardsManifestStems(projectRoot).length <= 1) return sourceFiles;
  const escaped = stem.replace(/[.*+?^${}()|[\\]]/g, '\\$&');
  const entry = sourceFiles.find((f) => {
    try {
      return new RegExp(`new\\s+PCB\\s*\\(\\s*['"]${escaped}['"]`).test(fs.readFileSync(f, 'utf-8'));
    } catch {
      return false;
    }
  });
  if (!entry) {
    logger.warn(
      chalk.yellow(
        `
No source file constructs new PCB('${stem}') — cannot scope to the board's entry; scanning all of src/`,
      ),
    );
    return sourceFiles;
  }
  const scope = new Set(collectLocalDependencies(entry).map((f) => path.resolve(f)));
  const sidecar = new RegExp(`^_sync(\\.${escaped})?\\.ts$`);
  const scoped = sourceFiles.filter((f) => scope.has(path.resolve(f)) || sidecar.test(path.basename(f)));
  logger.info(`Board '${stem}': scoped to its entry's import graph (${scoped.length} file(s))`);
  return scoped;
}

async function applyMode(
  ir: KicadIR,
  kicadFilePath: string,
  sourceDescription: string,
  options?: ImportOptions,
): Promise<void> {
  const auto = options?.auto ?? false;
  // Determine source root from the KiCad file location
  // The KiCad file is typically in a build/ directory; source is usually in src/
  const kicadDir = kicadFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '.';

  // Try src/ as sibling of build/, or fall back to the project root
  const projectRoot = kicadDir.replace(/(^|[\\/])build$/, '') || '.';
  const sourceRoot = fs.existsSync(projectRoot + '/src') ? projectRoot + '/src' : projectRoot;

  // 1. Match IR footprints to source locations
  const matcher = new SourceMatcher(sourceRoot);
  const matchResults = matcher.matchAll(ir.footprints);

  const matchedCount = matchResults.filter((mr) => mr.sourceLocation !== null).length;
  logger.info(`Matched ${matchedCount}/${ir.footprints.length} footprints to source locations`);

  // 3. Scan all project source files for .text() calls — silkscreen text
  // usually lives where no footprint is declared
  let sourceFiles = collectTypeScriptFiles(sourceRoot);

  // Multi-board projects (mother/daughter, board/jig) scope the cycle to
  // THIS board's sources — see scopeSourceFilesToBoard.
  sourceFiles = scopeSourceFilesToBoard(
    sourceFiles,
    projectRoot,
    path.basename(kicadFilePath, '.kicad_pcb'),
  );

  // A source file that fails to parse (a transient read race, an editor
  // mid-save under --watch) must abort the whole cycle: acting on a
  // half-visible project would match components in the wrong file and
  // write positions, routing, and text into whatever file still parses.
  const unparsable = sourceFiles.filter((f) => analyzeFile(f) === null);
  if (unparsable.length > 0) {
    logger.warn(
      chalk.yellow(
        `\nSource file(s) failed to parse: ${unparsable.map((f) => f.replace(/\\/g, '/').split('/').slice(-2).join('/')).join(', ')}. ` +
          'Skipping this cycle so nothing is written against a partial view of the project.',
      ),
    );
    return;
  }

  // Concurrent-edit guard: remember what the analyzed files looked like; if
  // anything changes on disk before we write, the cycle aborts rather than
  // interleaving our ranges with someone else's edits. Our OWN write passes
  // refresh the stamps — the guard exists for external edits, which in
  // interactive mode land during the checkbox pauses.
  const sourceStamps: SourceStamps = stampFiles(sourceFiles);
  const restamp = (): void => {
    const fresh = stampFiles(sourceFiles);
    sourceStamps.clear();
    for (const [k, v] of fresh) sourceStamps.set(k, v);
  };
  const analyzedFiles = new Set(sourceFiles);

  // Snapshot the analyzed source set BEFORE the first write — a bad cycle
  // must be fully recoverable (per-pass .backup files only capture the state
  // before the LAST pass). A dry run writes nothing and takes nothing.
  const snapshot = options?.dryRun ? null : takeSnapshot(projectRoot, sourceFiles, kicadFilePath);
  const rollback = (reason: string): void => {
    if (!snapshot) return;
    const result = restoreSnapshot(projectRoot);
    logger.error(
      chalk.red(
        `
✗ ${reason} — rolled back the cycle (restored ${result.restored} file(s) from snapshot ${snapshot.id}). ` +
          'Your sources are unchanged; please report the pending change labels above.',
      ),
    );
  };

  // 4. Component deletions FIRST: a part deleted in KiCad leaves an orphan
  // declaration that would dangle under every later pass, so it is removed
  // (and the stamps refreshed) before positions/text/routing are computed —
  // their ranges are planned against the post-deletion files.
  const rewriter = new SourceRewriter();
  const deletion = computeComponentDeletions(matchResults, sourceFiles, ir.footprints.length);
  for (const n of deletion.notes) logger.log(chalk.gray(`\nnote: ${n}`));
  if (deletion.candidates.length > 0) {
    if (options?.dryRun) {
      logger.log(chalk.bold(`\n${deletion.candidates.length} component(s) deleted on the board (dry run — nothing written):\n`));
      for (const c of deletion.candidates) logger.log(`    ${chalk.blueBright(c.label)}`);
    } else {
      const selectedDeletions = auto
        ? deletion.candidates
        : await interactiveApplyComponentDeletions(deletion.candidates);
      if (selectedDeletions.length > 0) {
        const drifted = changedSince(sourceStamps);
        if (drifted.length > 0) {
          logger.warn(
            chalk.yellow(
              `\nSource file(s) changed on disk before the deletion pass: ${drifted
                .map((f) => f.replace(/\\/g, '/').split('/').slice(-2).join('/'))
                .join(', ')} — skipping this cycle; re-run the import.`,
            ),
          );
          return;
        }
        const deletionChanges = componentDeletionChanges(selectedDeletions);
        applySourceChanges(deletionChanges);
        const deletionGate = parseGate([...new Set(deletionChanges.map((c) => c.filePath))]);
        if (!deletionGate.ok) {
          rollback(`component deletion left file(s) unparsable: ${deletionGate.failures.join(', ')}`);
          return;
        }
        // convergence: an applied deletion must not reappear as a candidate
        const afterDeletion = computeComponentDeletions(matchResults, sourceFiles, ir.footprints.length);
        const stillPending = selectedDeletions.filter((c) =>
          afterDeletion.candidates.some((a) => a.variable === c.variable && a.filePath === c.filePath),
        );
        if (stillPending.length > 0) {
          rollback(
            `component deletion(s) did not converge (still pending after write): ${stillPending
              .map((c) => c.label)
              .slice(0, 5)
              .join('; ')}`,
          );
          return;
        }
        restamp();
        logger.log(
          chalk.green(
            `\n✓ Removed ${selectedDeletions.length} deleted component(s) from ${new Set(deletionChanges.map((c) => c.filePath)).size} file(s).`,
          ),
        );
      } else {
        logger.log(
          chalk.gray(`\n${deletion.candidates.length} component(s) deleted on the board were left in source (declined).`),
        );
      }
    }
  }

  // 5. Compute the remaining categories against the post-deletion tree.
  // Footprint changes come after the file scan so assignments are searched
  // project-wide (the _sync.ts sidecar carries `parts.x.pcb` overrides in
  // files far from their constructors).
  const footprintChanges = rewriter.computeFootprintChanges(matchResults, sourceFiles);
  const textChanges = rewriter.computeTextChanges(ir, sourceFiles);

  // 6. Compute layout changes (referenceLayout, valueLayout, fabLayout) —
  // project-wide assignment search, sidecar-first, same as footprints
  const layoutChanges = rewriter.computeLayoutChanges(matchResults, sourceFiles);

  // 7. Dry-run: print every pending change with its edit preview and stop.
  // No snapshot, no writes, no interactive prompts.
  if (options?.dryRun) {
    await dryRunReport(ir, matchResults, footprintChanges, textChanges, layoutChanges, sourceFiles);
    return;
  }

  // Apply footprint changes
  if (footprintChanges.length > 0) {
    const footprintResult = auto
      ? applyAllFootprints(footprintChanges)
      : await interactiveApplyFootprints(footprintChanges);
    if (footprintResult.applied > 0) {
      restamp();
      logger.log(
        chalk.green(
          `\n✓ Applied ${footprintResult.applied} component change(s) to ${footprintResult.filesModified} file(s).`,
        ),
      );
    }
  } else {
    logger.log(chalk.green('\nAll component positions are up to date. No changes needed.'));
  }

  // 6. Apply text changes (position/style updates to existing calls)
  if (textChanges.length > 0) {
    const textResult = auto ? applyAllTexts(textChanges) : await interactiveApplyTexts(textChanges);
    if (textResult.applied > 0) {
      restamp();
      logger.log(
        chalk.green(`\n✓ Applied ${textResult.applied} text change(s) to ${textResult.filesModified} file(s).`),
      );
    }
  } else if (ir.textElements.length > 0) {
    const hasSourceTextCalls = sourceFiles.some((f) => findTextCalls(f).length > 0);
    if (hasSourceTextCalls) {
      logger.log(chalk.green('\nAll text positions are up to date.'));
    }
    // Board text with no source call is handled by the text-section pass below.
  }

  // 7. Apply layout changes
  if (layoutChanges.length > 0) {
    const layoutResult = auto ? applyAllLayouts(layoutChanges) : await interactiveApplyLayouts(layoutChanges);
    if (layoutResult.applied > 0) {
      restamp();
      logger.log(
        chalk.green(`\n✓ Applied ${layoutResult.applied} layout change(s) to ${layoutResult.filesModified} file(s).`),
      );
    }
  }

  // 8. Compute outline / zone / routing / text-section write-back changes.
  // Text-section runs AFTER the footprint/layout passes above so its
  // insertion offsets reflect the file as it will be written.
  const zoneResult = computeZoneChanges(ir, sourceFiles);
  const outlineResult = computeOutlineChanges(ir, sourceFiles);
  const routingResult = computeRoutingChanges(ir, sourceFiles);
  const textSectionResult = computeTextSectionChanges(ir, sourceFiles);
  const stackupResult = computeStackupChanges(ir, sourceFiles);
  const graphicsResult = computeGraphicsChanges(ir, sourceFiles);
  for (const note of [
    ...zoneResult.notes,
    ...outlineResult.notes,
    ...routingResult.notes,
    ...textSectionResult.notes,
    ...stackupResult.notes,
    ...graphicsResult.notes,
  ]) {
    logger.log(chalk.gray(`\nnote: ${note}`));
  }

  // 9. Apply the new categories — all selected changes go through ONE
  // replacement pass per file so ranges stay valid.
  const selectedSource: PendingSourceChange[] = [];
  const declined: PendingSourceChange[] = [];

  if (auto) {
    selectedSource.push(
      ...stackupResult.changes,
      ...outlineResult.changes,
      ...zoneResult.changes,
      ...graphicsResult.changes,
      ...textSectionResult.changes,
      ...routingResult.changes,
    );
  } else {
    if (stackupResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('stackup', stackupResult.changes, declined)));
    }
    if (outlineResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('board outline', outlineResult.changes, declined)));
    }
    if (zoneResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('zone', zoneResult.changes, declined)));
    }
    if (graphicsResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('board graphics', graphicsResult.changes, declined)));
    }
    if (textSectionResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('text', textSectionResult.changes, declined)));
    }
    if (routingResult.changes.length > 0) {
      selectedSource.push(...(await interactiveApplySourceChanges('routing', routingResult.changes, declined)));
    }
  }

  if (selectedSource.length > 0) {
    const violations = ownershipViolations(selectedSource, analyzedFiles);
    if (violations.length > 0) {
      rollback(`write targeted file(s) outside the analyzed set: ${violations.join(', ')}`);
      return;
    }
    const drifted = changedSince(sourceStamps);
    if (drifted.length > 0) {
      logger.warn(
        chalk.yellow(
          `\nSource file(s) changed on disk during this cycle: ${drifted
            .map((f) => f.replace(/\\/g, '/').split('/').slice(-2).join('/'))
            .join(', ')} — skipping the write; re-run the import.`,
        ),
      );
      return;
    }
    const result = applySourceChanges(selectedSource);
    if (result.changesApplied > 0) {
      logger.log(
        chalk.green(
          `\n✓ Applied ${result.changesApplied} stackup/outline/zone/graphics/text/routing change(s) to ${result.filesModified} file(s).`,
        ),
      );
    }
  }

  // 11. Parse gate + convergence oracle over every written file.
  const writtenFiles = [...new Set(selectedSource.map((c) => c.filePath))];
  if (writtenFiles.length > 0) {
    const gate = parseGate(writtenFiles);
    if (!gate.ok) {
      rollback(`written file(s) no longer parse: ${gate.failures.join(', ')}`);
      return;
    }

    // Oracle: recomputing every category against the just-written tree must
    // find nothing left to do. Categories the user declined (or that were
    // never applied) legitimately remain pending and are exempt.
    const appliedSignatures = new Set(selectedSource.map((c) => `${c.kind}::${c.label}`));
    const after = computeAllSourceChanges(ir, sourceFiles);
    const nonConverged: string[] = [];
    for (const result of Object.values(after)) {
      for (const change of result.changes) {
        if (appliedSignatures.has(`${change.kind}::${change.label}`)) {
          nonConverged.push(change.label);
        }
      }
    }
    if (nonConverged.length > 0) {
      rollback(
        `applied change(s) did not converge (still pending after write): ${nonConverged.slice(0, 5).join('; ')}`,
      );
      return;
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
  if (declined.some((c) => c.kind === 'text')) {
    generateTextCode(ir, sourceDescription);
  }
  if (declined.some((c) => c.kind === 'graphics')) {
    generateGraphicsCode(ir, sourceDescription);
  }

  if (
    footprintChanges.length === 0 &&
    textChanges.length === 0 &&
    layoutChanges.length === 0 &&
    zoneResult.changes.length === 0 &&
    outlineResult.changes.length === 0 &&
    textSectionResult.changes.length === 0 &&
    stackupResult.changes.length === 0 &&
    graphicsResult.changes.length === 0 &&
    routingResult.changes.length === 0
  ) {
    logger.log(chalk.green('\nNo changes detected. Everything is in sync.'));
  }

  logger.log(chalk.gray('\nRebuild with: npm run build'));
  logger.log(
    chalk.gray(
      `Board fingerprint: ${fingerprintIR(ir)}${snapshot ? ` (pre-apply snapshot ${snapshot.id}; undo with --restore)` : ''}`,
    ),
  );
}

/** Full preview of a cycle without writing anything: labels plus edits. */
async function dryRunReport(
  ir: KicadIR,
  matchResults: MatchResult[],
  footprintChanges: PendingChange[],
  textChanges: PendingTextChange[],
  layoutChanges: PendingLayoutChange[],
  sourceFiles: string[],
): Promise<void> {
  const all = computeAllSourceChanges(ir, sourceFiles);

  logger.log(chalk.bold('\n== dry run: nothing will be written ==\n'));

  if (footprintChanges.length === 0 && textChanges.length === 0 && layoutChanges.length === 0) {
    logger.log(chalk.green('component positions / text / layouts: in sync'));
  } else {
    logger.log(chalk.bold(`component positions (${footprintChanges.length}):`));
    for (const c of footprintChanges) logger.log(`    ${c.label}`);
    logger.log(chalk.bold(`text updates (${textChanges.length}):`));
    for (const c of textChanges) logger.log(`    ${c.label}`);
    logger.log(chalk.bold(`layouts (${layoutChanges.length}):`));
    for (const c of layoutChanges) logger.log(`    ${c.label}`);
  }
  void matchResults;

  for (const [name, result] of Object.entries(all)) {
    if (result.changes.length === 0) {
      logger.log(chalk.green(`${name}: in sync`));
      continue;
    }
    logger.log(chalk.bold(`\n${name} (${result.changes.length}):`));
    for (const change of result.changes) {
      const short = change.filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
      logger.log(`    ${chalk.blueBright(change.label)}  [${short}]`);
      let source: string | null = null;
      for (const rep of change.replacements) {
        if (source === null) {
          try {
            source = fs.readFileSync(change.filePath, 'utf-8');
          } catch {
            source = null;
          }
        }
        if (source === null) continue;
        const before = source.slice(rep.range.start, rep.range.end);
        if (before === '') {
          logger.log(chalk.gray(`      + ${rep.newValue.split('\n')[0].slice(0, 100)}`));
        } else {
          logger.log(chalk.gray(`      - ${before.split('\n')[0].slice(0, 100)}`));
          logger.log(chalk.gray(`      + ${rep.newValue.split('\n')[0].slice(0, 100)}`));
        }
      }
    }
    for (const note of result.notes) logger.log(chalk.gray(`    note: ${note}`));
  }

  logger.log(chalk.gray('\n(dry run - no files were modified)'));
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

// === --auto variants: apply everything, no prompts ===

/** Surface an apply pass's drops: a change that matched no statement at
 *  write time is reported (the source drifted since it was computed),
 *  never silently counted as applied. */
function reportApplyResult(result: {
  filesModified: number;
  changesApplied: number;
  dropped: string[];
}): { filesModified: number; applied: number } {
  for (const note of result.dropped) logger.warn(chalk.yellow(`\nnote: ${note}`));
  return { filesModified: result.filesModified, applied: result.changesApplied };
}

function applyAllFootprints(changes: PendingChange[]): { filesModified: number; applied: number } {
  logger.log(chalk.bold(`\n${changes.length} component(s) have new positions (auto-apply):\n`));
  for (const c of changes) {
    const oldStr = c.oldX !== null ? `(${c.oldX}, ${c.oldY})` : '(not set)';
    logger.log(`    ${chalk.blueBright(c.prefix + c.variableName.padEnd(14))} ${oldStr} → (${c.newX}, ${c.newY})`);
  }
  const rewriter = new SourceRewriter();
  return reportApplyResult(rewriter.applyFootprintChanges(changes));
}

function applyAllTexts(changes: PendingTextChange[]): { filesModified: number; applied: number } {
  logger.log(chalk.bold(`\n${changes.length} text element(s) have changes (auto-apply):\n`));
  for (const c of changes) {
    const propsStr = c.changedProps.length > 0 ? ` ${chalk.magenta(`[${c.changedProps.join(', ')}]`)}` : '';
    logger.log(
      `    ${chalk.blueBright(`"${c.sourceTextContent}"`)}  (${c.oldX}, ${c.oldY}) → (${c.newX}, ${c.newY})${propsStr}`,
    );
  }
  const rewriter = new SourceRewriter();
  const result = rewriter.applyTextChanges(changes);
  return { filesModified: result.filesModified, applied: changes.length };
}

function applyAllLayouts(changes: PendingLayoutChange[]): { filesModified: number; applied: number } {
  logger.log(chalk.bold(`\n${changes.length} text layout(s) have changes (auto-apply):\n`));
  for (const c of changes) {
    const propsStr = c.changedProps.length > 0 ? ` ${chalk.magenta(`[${c.changedProps.join(', ')}]`)}` : '';
    logger.log(`    ${chalk.blueBright(`${c.prefix}${c.variableName}.${c.layoutType}`)}${propsStr}`);
  }
  const rewriter = new SourceRewriter();
  return reportApplyResult(rewriter.applyLayoutChanges(changes));
}

/** Deletions are opt-in per component: the board no longer carries the
 *  part, and the checkbox makes "remove it from source" an explicit yes. */
async function interactiveApplyComponentDeletions(
  candidates: ComponentDeletionCandidate[],
): Promise<ComponentDeletionCandidate[]> {
  logger.log(chalk.bold(`
${candidates.length} component(s) deleted on the board:
`));
  for (const c of candidates) logger.log(`    ${chalk.blueBright(c.label)}`);
  const selected: ComponentDeletionCandidate[] = await checkbox({
    message: 'Remove which deleted component(s) from source?',
    choices: candidates.map((c) => ({ name: c.label, value: c })),
  });
  if (selected.length === 0) logger.log(chalk.gray('\nNo deletions selected.'));
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
  return reportApplyResult(rewriter.applyFootprintChanges(selected));
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
  return reportApplyResult(rewriter.applyLayoutChanges(selected));
}
