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
import { boardStemFromArgs, buildDirPath, listBoardFiles } from '../pipeline.js';
import { defaultGerbersDir, exportNativeGerbers, findPcbFile } from './export.js';

/** An explicitly-passed value flag, resolved against cwd. */
function flagPath(parsed: ParsedArgs, name: string): string | undefined {
  // short flags park under their letter (`-o` → args['o']) — the help has
  // advertised `-o, --out` forever, but only the long form ever bound
  const v = parsed.args[name] ?? (name === 'out' ? parsed.args['o'] : undefined);
  return typeof v === 'string' && v.trim() !== '' ? path.resolve(v.trim()) : undefined;
}

const VIEW_PARTS: ViewerViewPart[] = ['pcba', 'blueprint', 'schematic'];

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));

  if (!pcbPath) {
    if (pcbArg) throw new Error(`PCB file not found: ${pcbArg}`);
    throw new Error(
      `No .kicad_pcb file found in ${buildDirPath()}.\n` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb viewer <path/to/board.kicad_pcb>',
    );
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
  const drcReportPath = overlay('drc', `${stem}_drc.json`);
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
    fs.writeFileSync(partPath, fragment);
    if (json) {
      logger.log(JSON.stringify({ pcb: pcbPath, part, out: partPath, viewBox, warnings }, null, 2));
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
  const deferViews: ViewerViewPart[] | undefined = lazyViews ? ['pcba', 'blueprint', 'schematic'] : undefined;

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb viewer') + ' - gerbers + drill + page in one pass\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Page:   ${outPath}${lazyViews ? ' (lazy views: pcba, blueprint, schematic)' : ''}\n`);
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
  fs.writeFileSync(outPath, result.html);

  const overlays = [
    netlistPath && 'netlist',
    drcReportPath && 'drc',
    stackupPath && 'stackup',
    rulesPath && 'rules',
  ].filter(Boolean);
  if (json) {
    logger.log(
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
