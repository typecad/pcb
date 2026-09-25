import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildBoardModel } from '../board_model.js';
import { buildDirPath, detectEntryFile, findBuildFile, findBuildFiles, runBuildStep, runDrcStep, runErcStep } from '../pipeline.js';
import { buildNetlistModel } from '../../diagnostics/netlist_model.js';
import { buildDiagnosticsReport, type CheckStep, type DiagnosticsReport } from '../../diagnostics/report.js';
import { renderMarkdown } from '../../diagnostics/markdown.js';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.join(__dirname, '../../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface DiagnosticsGenerateOptions {
  /** Source entry, recorded in the report header. */
  entry?: string;
  skipErc?: boolean;
  skipDrc?: boolean;
  /** Custom markdown destination (--out); JSON lands next to it. */
  out?: string;
  /** Explicit artifact paths (.kicad_pcb/.kicad_sch/.net) overriding ./build discovery. */
  artifacts?: string[];
}

export interface DiagnosticsGenerateResult {
  mdPath: string;
  jsonPath: string;
  report: DiagnosticsReport;
}

/**
 * Locates the build artifacts, analyzes them, and writes the markdown +
 * JSON diagnostics report. Shared by `typecad-pcb diagnostics` and the
 * `--diagnostics` flag on `typecad-pcb build` (mirroring typeCAD HAL's
 * `typecad-hal build --diagnostics`).
 */
export async function generateDiagnosticsReport(opts: DiagnosticsGenerateOptions): Promise<DiagnosticsGenerateResult> {
  // ── Locate build artifacts ────────────────────────────────────────────────
  const explicit = (ext: string) => {
    const found = opts.artifacts?.find((p) => p.endsWith(ext));
    return found ? path.resolve(found) : null;
  };
  let pcbPath = explicit('.kicad_pcb');
  if (!pcbPath) {
    const candidates = findBuildFiles('.kicad_pcb');
    if (candidates.length > 1) {
      throw new Error(
        `Multiple .kicad_pcb files in ${buildDirPath()} — pass one explicitly:\n  ${candidates.map((f) => path.basename(f)).join('\n  ')}`,
      );
    }
    pcbPath = candidates[0] ?? null;
  }
  const netPath = explicit('.net') ?? findBuildFile('.net');
  const schPath = explicit('.kicad_sch') ?? findBuildFile('.kicad_sch');

  if (!pcbPath && !netPath) {
    throw new Error(`No build artifacts found in ${buildDirPath()}. Build first, or pass a .kicad_pcb/.net path explicitly.`);
  }

  // ── Analyze logical + physical views, run ERC/DRC ────────────────────────
  const board = pcbPath ? buildBoardModel(pcbPath) : null;
  const netlist = netPath ? buildNetlistModel(netPath) : null;

  const erc: CheckStep = opts.skipErc
    ? { ran: false, passed: true, reason: 'skipped' }
    : schPath
      ? await runErcStep(schPath)
      : { ran: false, passed: false, reason: `No .kicad_sch found in ${buildDirPath()}` };
  const drc: CheckStep = opts.skipDrc
    ? { ran: false, passed: true, reason: 'skipped' }
    : pcbPath
      ? await runDrcStep(pcbPath)
      : { ran: false, passed: false, reason: `No .kicad_pcb found in ${buildDirPath()}` };

  const report = buildDiagnosticsReport({
    netlist,
    board,
    erc,
    drc,
    metadata: {
      entry: opts.entry,
      boardFile: pcbPath ?? undefined,
      schematicFile: schPath ?? undefined,
      netlistFile: netPath ?? undefined,
      version: getVersion(),
    },
  });

  // ── Write markdown + JSON ────────────────────────────────────────────────
  const baseName = path.basename(pcbPath ?? netPath!).replace(/\.(kicad_pcb|net)$/, '');
  const mdPath = opts.out ?? path.join(buildDirPath(), `${baseName}-diagnostics.md`);
  const jsonPath = mdPath.endsWith('.md') ? `${mdPath.slice(0, -3)}.json` : `${mdPath}.json`;

  fs.mkdirSync(path.dirname(path.resolve(mdPath)), { recursive: true });
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  return { mdPath, jsonPath, report };
}

/**
 * typecad-pcb diagnostics — build (unless skipped), then generate a full
 * diagnostics report (markdown + JSON) covering the BOM, nets, pin map,
 * unconnected pins, mermaid graphs, electrical checks, ERC/DRC, and routing.
 * Informational by design: violations land in the report, not the exit code.
 */
export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const skipBuild = parsed.args['skip-build'] === true;
  const outArg = typeof parsed.args['out'] === 'string' ? parsed.args['out'] : undefined;

  // ── Step 1: build the project (unless reusing artifacts) ─────────────────
  let entry: string | undefined;
  if (!skipBuild) {
    entry = parsed.positional.find((p) => p.endsWith('.ts')) || detectEntryFile() || undefined;
    if (!entry) throw new Error('No entry file found. Pass one (typecad-pcb diagnostics src/main.ts) or configure typecad.conf.');
    if (!fs.existsSync(entry)) throw new Error(`Entry file not found: ${entry}`);
    if (!json) logger.log(chalk.white.bold('typecad-pcb diagnostics') + '\n');
    const built = await runBuildStep(entry, { json, verbose: parsed.args['verbose'] === true });
    if (!built.passed) throw new Error(`Build failed: ${built.reason ?? 'unknown error'}`);
  } else {
    entry = detectEntryFile() ?? undefined;
  }

  const artifacts = parsed.positional.filter((p) => !p.endsWith('.ts'));
  const { mdPath, jsonPath, report } = await generateDiagnosticsReport({
    entry,
    skipErc: parsed.args['skip-erc'] === true,
    skipDrc: parsed.args['skip-drc'] === true,
    out: outArg,
    artifacts,
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  if (json) {
    logger.log(JSON.stringify(report, null, 2));
    return;
  }
  const s = report.summary;
  logger.log(`  ${chalk.green('✓')} report written`);
  logger.log(`  markdown   ${mdPath}`);
  logger.log(`  data       ${jsonPath}`);
  logger.log('');
  logger.log(
    chalk.gray(
      `  ${s.components} components, ${s.nets} nets, ${s.pins} pins — ` +
        `${s.unconnectedPins} unconnected, ${s.dncPins} no-connect, ${s.unroutedNets} unrouted`,
    ),
  );
}
