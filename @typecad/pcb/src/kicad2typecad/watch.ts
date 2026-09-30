import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import logger from '../utils/logging.js';
import type { ImportOptions } from './cli.js';

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
        logger.log(chalk.gray(`\n── ${base} changed @ ${new Date().toLocaleTimeString()} ──`));
        await runOnce(absolute, cycleOptions);
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
