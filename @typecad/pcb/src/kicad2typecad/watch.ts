import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import logger from '../utils/logging.js';
import type { ImportOptions } from './cli.js';
import { boardIsBuildOutput } from '../utils/build_signature.js';

export interface BoardWatchSession {
  /** Resolves after the initial cycle completes (success or handled failure). */
  ready: Promise<void>;
  /** Never resolves while watching — awaited by the CLI to keep the process alive. */
  forever: Promise<void>;
  /** Stop watching and close the file watcher. */
  stop(): void;
}

/**
 * Watch a .kicad_pcb file and re-run the import on every save.
 *
 * With `auto` in the cycle options the source .ts is rewritten on each save
 * (live KiCad → TypeCAD sync); without it, the generated code is printed.
 * The board directory is watched (not the file) so editor save strategies
 * that replace the file (write+rename) do not lose the subscription.
 */
export function startBoardWatch(
  filePath: string,
  options: ImportOptions,
  runOnce: (filePath: string, cycleOptions: ImportOptions) => Promise<void>,
): BoardWatchSession {
  const absolute = path.resolve(filePath);
  const dir = path.dirname(absolute);
  const base = path.basename(absolute);

  // The per-cycle run must not recurse into watch mode.
  const cycleOptions: ImportOptions = { ...options, watch: false };

  const DEBOUNCE_MS = 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: fs.FSWatcher | null = null;
  const watchers: fs.FSWatcher[] = [];
  let running = false;
  let queued = false;
  let lastStamp = '';

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runCycle();
    }, DEBOUNCE_MS);
  };

  const runCycle = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      // Skip cycles the file mtime/size did not change (touch without write).
      const stamp = fileStamp(absolute);
      if (stamp !== null && stamp !== lastStamp) {
        lastStamp = stamp;
        if (boardIsBuildOutput(absolute) === true) {
          // the build just wrote this exact file from source — there is
          // nothing to import, and importing it anyway fed a
          // build→import→build loop whenever the round trip was not an
          // exact fixed point
          logger.log(chalk.gray(`\n── ${base} rewritten by the build — nothing to import ──`));
        } else {
          logger.log(chalk.gray(`\n── ${base} changed @ ${new Date().toLocaleTimeString()} ──`));
          await runOnce(absolute, cycleOptions);
        }
      }
    } catch (error) {
      // A transient failure (file locked mid-save, parse of a partial write)
      // must never kill the watcher — the next save retries.
      logger.warn(`Watch cycle failed: ${(error as Error).message}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  };

  // Source-side watch: an editor saving a .ts file while a cycle runs would
  // interleave with the importer's writes. Watching src/ re-triggers a cycle
  // (the in-cycle stamp guard in apply mode aborts any interleaved write).
  const kicadDirOnly = path.dirname(absolute);
  const projectRootGuess = kicadDirOnly.replace(/[/\\]build$/, '') || '.';
  const srcDir = path.join(projectRootGuess, 'src');
  if (fs.existsSync(srcDir)) {
    try {
      const srcWatcher = fs.watch(srcDir, { recursive: true }, (_event, filename) => {
        const name = String(filename ?? '');
        if (/\.ts$/.test(name)) schedule();
      });
      watchers.push(srcWatcher);
    } catch {
      // recursive watch is platform-dependent; the stamp guard still protects
    }
  }

  if (!fs.existsSync(absolute)) {
    logger.warn(`Warning: ${filePath} does not exist yet — waiting for it to appear.`);
  }
  // lastStamp intentionally starts empty so the FIRST cycle always runs;
  // afterwards it gates cycles where the file did not actually change.

  const ready = (async () => {
    await runCycle();
  })();

  try {
    watcher = fs.watch(dir, (_event, filename) => {
      if (filename && filename !== base) return;
      schedule();
    });
    watcher.on('error', (error) => {
      logger.warn(`Board watcher error: ${(error as Error).message}`);
    });
  } catch (error) {
    logger.error(`Cannot watch ${dir}: ${(error as Error).message}`);
  }

  const forever = new Promise<void>(() => {
    /* kept alive until stop() or process exit */
  });

  return {
    ready,
    forever,
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      watcher?.close();
      watcher = null;
      for (const w of watchers) w.close();
      watchers.length = 0;
    },
  };
}

function fileStamp(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}
