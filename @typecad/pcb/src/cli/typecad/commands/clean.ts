import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildDirPath } from '../pipeline.js';

const KICAD_ARTIFACT = /\.(kicad_pcb|kicad_sch|net)$/;

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}

/** Any KiCAD build artifact anywhere below `dir` (not just at the top level). */
function containsKiCadArtifact(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (containsKiCadArtifact(path.join(dir, entry.name))) return true;
    } else if (KICAD_ARTIFACT.test(entry.name)) {
      return true;
    }
  }
  return false;
}

/**
 * typecad-pcb clean — remove the generated build directory (escape hatch
 * for a wedged build or stale boards from renamed sheets; the next build
 * regenerates everything). Mirrors typeCAD HAL's clean: refuses to remove a
 * directory that does not look generated unless --force is given.
 */
export async function run(parsed: ParsedArgs): Promise<void> {
  const force = parsed.args['force'] === true;
  const dir = buildDirPath();
  const cwd = path.resolve(process.cwd());

  if (dir === cwd || dir === path.parse(dir).root) {
    throw new Error(`Refusing to remove '${dir}'.`);
  }

  if (!fs.existsSync(dir)) {
    if (parsed.json) {
      logger.log(JSON.stringify({ cleaned: false, dir, files: 0, reason: 'not present' }, null, 2));
    } else {
      logger.log(chalk.gray(`  nothing to clean — ${dir} does not exist`));
    }
    return;
  }

  const looksGenerated = containsKiCadArtifact(dir);
  if (!looksGenerated && !force) {
    throw new Error(
      `${dir} contains no .kicad_pcb/.kicad_sch/.net files — it does not look like a typeCAD build directory. ` +
        'Use --force to remove it anyway.',
    );
  }

  const files = countFiles(dir);
  fs.rmSync(dir, { recursive: true, force: true });

  if (parsed.json) {
    logger.log(JSON.stringify({ cleaned: true, dir, files }, null, 2));
  } else {
    logger.log(chalk.green(`  ✓ removed ${dir} (${files} file${files === 1 ? '' : 's'})`));
  }
}
