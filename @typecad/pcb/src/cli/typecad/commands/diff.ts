import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import { generateDiffs } from '../../../gitdiff/core/diff-generator.js';
import { openInBrowser } from '../../../gitdiff/utils/open.js';
import createSpinner from '../../../gitdiff/utils/spinner.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';

const execFileAsync = promisify(execFile);

function isGitRef(arg: string): boolean {
  return !arg.endsWith('.kicad_pcb') && !arg.startsWith('-') && !arg.includes('\\') && !arg.includes('/');
}

let gitTempFiles: string[] = [];
let cachedRepoRoot: string | null = null;

async function getGitRepoRoot(): Promise<string> {
  if (cachedRepoRoot !== null) return cachedRepoRoot;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
    cachedRepoRoot = stdout.trim();
    return cachedRepoRoot;
  } catch {
    throw new Error('Not inside a git repository');
  }
}

function toGitPath(localPath: string, repoRoot: string): string {
  const absolute = path.resolve(localPath);
  const relative = path.relative(repoRoot, absolute).replace(/\\/g, '/');
  return relative;
}

async function resolveGitFile(rev: string, localPath: string): Promise<string> {
  const repoRoot = await getGitRepoRoot();
  const gitPath = toGitPath(localPath, repoRoot);
  const outDir = path.dirname(path.resolve(localPath));
  const outPath = path.join(outDir, `.typecad-gitdiff-${crypto.randomUUID()}-${path.basename(localPath)}`);
  try {
    const result = await execFileAsync('git', ['show', `${rev}:${gitPath}`], { maxBuffer: 50 * 1024 * 1024 });
    fs.writeFileSync(outPath, result.stdout);
    gitTempFiles.push(outPath);
    return outPath;
  } catch {
    throw new Error(`Unable to resolve git revision "${rev}" for file "${gitPath}"`);
  }
}

function cleanupGitTempFiles(): void {
  for (const f of gitTempFiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      logger.debug('Failed to delete file', f);
    }
  }
  gitTempFiles = [];
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const positional = parsed.positional;
  const fullMode = parsed.args['full'] === true;
  let theme: string | undefined;
  let outputHtmlPath: string | undefined;

  if (typeof parsed.args['theme'] === 'string') {
    theme = parsed.args['theme'];
  }
  if (typeof parsed.args['output'] === 'string') {
    outputHtmlPath = parsed.args['output'];
  }

  let originalFile = '';
  let modifiedFile = '';
  let isGitRevisionMode = false;
  let isGitVsFileMode = false;

  const nonDashArgs = positional.filter((a) => a !== '--');

  if (nonDashArgs.length === 2) {
    const first = nonDashArgs[0];
    const second = nonDashArgs[1];

    if (isGitRef(first) && second.endsWith('.kicad_pcb')) {
      isGitVsFileMode = true;
      originalFile = first;
      modifiedFile = second;
    } else {
      originalFile = first;
      modifiedFile = second;
    }
  } else if (nonDashArgs.length >= 3) {
    originalFile = nonDashArgs[0];
    modifiedFile = nonDashArgs[1];
    const pcbFile = nonDashArgs[nonDashArgs.length - 1];

    if (!originalFile.endsWith('.kicad_pcb') && !modifiedFile.endsWith('.kicad_pcb')) {
      isGitRevisionMode = true;
    }
  }

  if (!originalFile || !modifiedFile) {
    throw new Error(
      'Usage: typecad-pcb diff [options] <original.kicad_pcb> <modified.kicad_pcb>\n' +
        '       typecad-pcb diff [options] <rev> <file.kicad_pcb>\n' +
        '       typecad-pcb diff [options] <rev1> <rev2> [--] <file.kicad_pcb>\n' +
        "Use 'typecad-pcb diff --help' for more information",
    );
  }

  logger.log('');
  logger.log('typeCAD GitDiff - Visual PCB Comparison Tool');
  logger.log('');

  if (isGitVsFileMode) {
    if (!fs.existsSync(modifiedFile)) {
      throw new Error(`File not found: ${modifiedFile}`);
    }
    logger.log('Git vs File Mode:');
    logger.log(`   Original:  ${originalFile} (git)`);
    logger.log(`   Modified:  ${modifiedFile} (working tree)`);
    logger.log('');

    const spinner1 = createSpinner({ text: `extracting ${originalFile} from git...` }).start();
    originalFile = await resolveGitFile(originalFile, modifiedFile);
    spinner1.success();
  } else if (isGitRevisionMode) {
    const pcbFile = nonDashArgs[nonDashArgs.length - 1];
    if (!pcbFile.endsWith('.kicad_pcb')) {
      throw new Error('Git revision mode requires a .kicad_pcb file path');
    }
    logger.log('Git Revision Mode:');
    logger.log(`   File:  ${pcbFile}`);
    logger.log(`   From:  ${originalFile}`);
    logger.log(`   To:    ${modifiedFile}`);
    logger.log('');

    const absPcbFile = path.resolve(pcbFile);

    const spinner1 = createSpinner({ text: `extracting ${originalFile} from git...` }).start();
    originalFile = await resolveGitFile(originalFile, absPcbFile);
    spinner1.success();

    const spinner2 = createSpinner({ text: `extracting ${modifiedFile} from git...` }).start();
    modifiedFile = await resolveGitFile(modifiedFile, absPcbFile);
    spinner2.success();
  } else {
    for (const f of [originalFile, modifiedFile]) {
      if (!fs.existsSync(f)) {
        throw new Error(`File not found: ${f}`);
      }
    }

    logger.log('Analyzing PCB files:');
    logger.log(`   Original:  ${originalFile}`);
    logger.log(`   Modified:  ${modifiedFile}`);
    logger.log('');
  }

  logger.log('Configuration:');
  if (fullMode) logger.log('   Processing mode: Full (all layers including User layers)');
  else logger.log('   Processing mode: Standard');
  if (theme) logger.log(`   Theme: ${theme}`);
  if (outputHtmlPath) logger.log(`   Output: ${outputHtmlPath}`);
  logger.log('');

  const spinner = createSpinner({ text: 'processing files...' }).start();
  try {
    const htmlFilePath = await generateDiffs({
      originalFile,
      modifiedFile,
      fullMode,
      theme,
      outputHtmlPath,
    });

    await openInBrowser(htmlFilePath);

    spinner.success('Processing complete!');
    logger.log('');
    logger.log('Success! Visual diff report generated');
    logger.log(`Report location: ${htmlFilePath}`);
    logger.log('Opening in your default browser...');
  } catch (error) {
    spinner.error('Processing failed');
    logger.log('');
    logger.error(`   ${error}`);
    logger.log('');
    logger.log('Troubleshooting tips:');
    logger.log('   - Ensure both PCB files exist and are valid KiCAD files');
    logger.log('   - Check that KiCAD CLI is properly installed');
    logger.log("   - For git revisions, ensure you're inside a git repository");
    cleanupGitTempFiles();
    throw error;
  }
  cleanupGitTempFiles();
}
