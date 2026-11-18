// ---------------------------------------------------------------------------
// `typecad-pcb viewer` — the board-viewer render pipeline as ONE process:
// native gerbers/drill/job export + the interactive page build, composed
// back-to-back. The vscode extension used to spawn `export gerbers`,
// `export drill` (already covered by the native gerbers export) and
// `gerber-viewer` as three npx children per board change — each paying
// node/npx startup before any plotting happened. Same plots, same page,
// one process.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { buildViewerFromFiles, renderViewPart, type ViewerViewPart } from '../../../gerber_viewer/build.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { missingBoardMessage } from '../../../utils/command_hint.js';
import { boardStemFromArgs, buildDirPath, listBoardFiles } from '../pipeline.js';
import { defaultGerbersDir, exportNativeGerbers, findPcbFile } from './export.js';
import { writeFileAtomic } from '../../../utils/atomic_write.js';

/** An explicitly-passed value flag, resolved against cwd. */
function flagPath(parsed: ParsedArgs, name: string): string | undefined {
  // short flags park under their letter (`-o` → args['o']) — the help has
  // advertised `-o, --out` forever, but only the long form ever bound
  const v = parsed.args[name] ?? (name === 'out' ? parsed.args['o'] : undefined);
  return typeof v === 'string' && v.trim() !== '' ? path.resolve(v.trim()) : undefined;
}

/**
 * The DRC report to embed, or none. An explicit `--drc` always wins (the
 * caller asked for that report by name). AUTO-discovery only picks the
 * build's own report up when it is NEWER than the board — a report older
 * than the board describes the previous revision and would paint its
 * violation markers at stale positions on the freshly rebuilt board,
 * reading as "the rebuild ran DRC". Same freshness rule the vscode
 * extension's page generation applies.
 */
export function drcOverlayPath(
  pcbPath: string,
  buildDir: string,
  stem: string,
  explicit?: string,
): string | undefined {
  if (explicit) return explicit;
  const auto = path.join(buildDir, `${stem}_drc.json`);
  if (!fs.existsSync(auto)) return undefined;
  return fs.statSync(auto).mtimeMs >= fs.statSync(pcbPath).mtimeMs ? auto : undefined;
}

const VIEW_PARTS: ViewerViewPart[] = ['pcba', 'blueprint', 'schematic', 'assembly'];

/**
 * Write a served file so a reader never sees it half-written: the viewer
 * page (and its view-part fragments) are re-served to an OPEN browser tab
 * on every rebuild, and a plain writeFileSync hands a concurrent fetch a
 * truncated document — the DOM error-corrects enough for the page script
 * to run (the board reads black), which reads as breakage. Temp file +
 * rename is atomic on the same directory.
 */
function writeAtomically(target: string, contents: string): void {
  writeFileAtomic(target, contents);
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));

  if (!pcbPath) {
    if (pcbArg) throw new Error(`PCB file not found: ${pcbArg}`);
    throw new Error(missingBoardMessage(buildDirPath(), 'viewer'));
  }

  const buildDir = buildDirPath();
  const stem = path.basename(pcbPath, '.kicad_pcb');
  // the same manifest rule the gerbers dir uses — a multi-board project
  // keeps one page per board (session state keys off the page path)
  const multiBoard = listBoardFiles(buildDir).length > 1;
  // one page per board — the extension's pending-edit and settings keys
  // derive from the page path, so each board keeps its own session state
  const outPath = flagPath(parsed, 'out') ?? (multiBoard ? path.join(buildDir, 'serve', `${stem}.html`) : path.join(buildDir, 'serve', 'viewer.html'));

  // Optional data overlays: explicit flags win; otherwise the build's own
  // artifacts are picked up when they exist (a missing one must not sink
  // the render — the viewer opens without that overlay)
  const overlay = (flagName: string, autoName: string): string | undefined => {
    const explicit = flagPath(parsed, flagName);
    if (explicit) return explicit;
    const auto = path.join(buildDir, autoName);
    return fs.existsSync(auto) ? auto : undefined;
  };
  const netlistPath = overlay('netlist', `${stem}.net`);
  const drcReportPath = drcOverlayPath(pcbPath, buildDir, stem, flagPath(parsed, 'drc'));
  const stackupPath = overlay('stackup', `${stem}_stackup.json`);
  const rulesPath = overlay('rules', `${stem}_rules.json`);
  const overlayPaths = { netlistPath, drcReportPath, stackupPath, rulesPath };

  // --view-part <name>: render ONE deferred view as a mountable fragment
  // (what the extension's on-demand channel serves, and what an http-served
  // lazy page fetches on first switch). The gerbers re-export from the same
  // board the main page rendered — identical plots, one part, no page.
  const viewPartArg = typeof parsed.args['view-part'] === 'string' ? (parsed.args['view-part'] as string).trim() : '';
  if (viewPartArg) {
    if (!VIEW_PARTS.includes(viewPartArg as ViewerViewPart)) {
      throw new Error(`unknown view part "${viewPartArg}" — expected one of: ${VIEW_PARTS.join(', ')}`);
    }
    const part = viewPartArg as ViewerViewPart;
    const exported = exportNativeGerbers(pcbPath, {
      outputDir: defaultGerbersDir(buildDir, pcbPath),
      savedFills: parsed.args['saved-fills'] === true,
      json,
    });
    const { fragment, viewBox, warnings } = renderViewPart([exported.outputDir], part, overlayPaths);
    const partPath = path.join(path.dirname(outPath), `view-${part}.html`);
    fs.mkdirSync(path.dirname(partPath), { recursive: true });
    writeAtomically(partPath, fragment);
    if (json) {
      logger.out(JSON.stringify({ pcb: pcbPath, part, out: partPath, viewBox, warnings }, null, 2));
    } else {
      logger.log(chalk.green(`View part ${part} written to ${partPath}`));
      for (const w of warnings.slice(0, 10)) logger.log(chalk.gray(`  warning: ${w}`));
    }
    return;
  }

  // --lazy-views: the page ships without the pcba/blueprint/schematic
  // renders (the layout/gerber default still builds eagerly) — each fills
  // its placeholder on first switch through the host bridge or a
  // --view-part fragment fetch. The render every board change pays for
  // shrinks to the default view alone.
  const lazyViews = parsed.args['lazy-views'] === true;
  const deferViews: ViewerViewPart[] | undefined = lazyViews ? ['pcba', 'blueprint', 'schematic', 'assembly'] : undefined;

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb viewer') + ' - gerbers + drill + page in one pass\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Page:   ${outPath}${lazyViews ? ' (lazy views: pcba, blueprint, schematic, assembly)' : ''}\n`);
  }

  const exported = exportNativeGerbers(pcbPath, {
    outputDir: defaultGerbersDir(buildDir, pcbPath),
    savedFills: parsed.args['saved-fills'] === true,
    json,
  });

  const result = buildViewerFromFiles([exported.outputDir], {
    ...overlayPaths,
    deferViews,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  writeAtomically(outPath, result.html);

  const overlays = [
    netlistPath && 'netlist',
    drcReportPath && 'drc',
    stackupPath && 'stackup',
    rulesPath && 'rules',
  ].filter(Boolean);
  if (json) {
    logger.out(
      JSON.stringify(
        {
          pcb: pcbPath,
          gerbersDir: exported.outputDir,
          out: outPath,
          layers: result.layers.length,
          overlays,
          deferredViews: deferViews ?? [],
          unfilledZones: exported.unfilledZones,
          warnings: result.warnings,
        },
        null,
        2,
      ),
    );
  } else {
    logger.log(chalk.green(`Viewer written to ${outPath} (${result.layers.length} layers, ${exported.files.length} fab files)`));
    if (overlays.length) logger.log(chalk.gray(`  Overlays: ${overlays.join(', ')}`));
    if (deferViews?.length) logger.log(chalk.gray(`  Lazy views: ${deferViews.join(', ')} (rendered on first switch)`));
    for (const w of result.warnings.slice(0, 10)) logger.log(chalk.gray(`  warning: ${w}`));
    if (result.warnings.length > 10) logger.log(chalk.gray(`  ... and ${result.warnings.length - 10} more`));
  }
}
