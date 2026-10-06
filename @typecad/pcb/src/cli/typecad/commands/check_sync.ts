import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import logger from '../../../utils/logging.js';
import { boardStemFromArgs, findBoardFile } from '../pipeline.js';
import { SExprNode } from '../../../kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../../../kicad2typecad/ir_builder.js';
import { computeAllSourceChanges } from '../../../kicad2typecad/apply_source.js';
import type { ParsedArgs } from '../parser.js';

/**
 * check-sync: is the built board in sync with the committed source?
 *
 * The same write-back oracle the hardening suite uses: parse the board,
 * compute every source change an import would make, and report them. Any
 * pending change means the two have drifted (a board saved by KiCad, a
 * source edit that hasn't been rebuilt, an apply that didn't land) — the
 * reconciliation paths are the two the layout view already offers: apply
 * & rebuild writes the board's state into source, a rebuild takes the
 * source's side.
 */
export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const stem = boardStemFromArgs(parsed);
  const pcbPath = pcbArg ?? findBoardFile(stem ?? undefined);
  if (!pcbPath || !fs.existsSync(pcbPath)) {
    throw new Error(
      'No .kicad_pcb file found — run `typecad-pcb build` first, or pass one: typecad-pcb check-sync <board.kicad_pcb>',
    );
  }
  const srcDir = path.resolve(path.dirname(pcbPath), '..', 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`no source directory at ${srcDir} — check-sync compares a built board against src/`);
  }
  const sourceFiles = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(srcDir, f));

  const ir = new KicadIRBuilder().build(SExprNode.parse(fs.readFileSync(pcbPath, 'utf8')));
  const all = computeAllSourceChanges(ir, sourceFiles);
  const rows: Array<{ kind: string; file: string; label: string; props: string[] }> = [];
  for (const [category, result] of Object.entries(all)) {
    for (const change of result.changes) {
      rows.push({
        kind: change.kind,
        file: path.relative(process.cwd(), change.filePath),
        label: change.label,
        props: change.changedProps,
      });
    }
    void category;
  }

  if (json) {
    logger.log(JSON.stringify({ inSync: rows.length === 0, board: pcbPath, count: rows.length, changes: rows }, null, 2));
  } else {
    logger.log(chalk.white.bold('typecad-pcb check-sync') + ' - board vs source drift check\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Source: ${srcDir} (${sourceFiles.length} files)\n`);
    if (!rows.length) {
      logger.log(chalk.green('  in sync — the source regenerates this board exactly\n'));
    } else {
      logger.log(chalk.yellow(`  ${rows.length} pending difference${rows.length > 1 ? 's' : ''}:\n`));
      for (const r of rows) {
        logger.log(`    ${chalk.cyan(r.kind.padEnd(9))} ${r.label} ${chalk.gray('(' + r.props.join(', ') + ')')}`);
        logger.log(chalk.gray(`              ${r.file}`));
      }
      logger.log('');
      logger.log(chalk.gray('  reconcile: apply & rebuild writes the board state into source;'));
      logger.log(chalk.gray('  rebuilding (npm run build) takes the source side'));
    }
  }
  if (rows.length && !json) process.exitCode = 1;
}
