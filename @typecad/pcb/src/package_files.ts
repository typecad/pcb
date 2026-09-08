/**
 * Run-time synchronization of a component package's bundled KiCad library
 * files into the project's `./build/lib/` directory.
 *
 * Historically this copy was performed by an npm `postinstall` script shipped
 * inside each package. npm is deprecating install scripts for security
 * reasons, so typeCAD now performs the same copy lazily — when a `Package`
 * subclass is constructed during `typecad-pcb build`. This keeps the on-disk
 * layout that KiCad (via `fp-lib-table`/`sym-lib-table`) and the typeCAD
 * runtime loaders expect (`./build/lib/*.kicad_sym` and
 * `./build/lib/footprints/*.kicad_mod`), without ever running an install
 * script and without making any assumptions about package names or keywords.
 */
import fs from 'node:fs';
import path from 'node:path';
import logger from './utils/logging.js';

/**
 * Project build directory that the runtime loaders and KiCad read from.
 * Resolved relative to the current working directory (the project root when
 * `typecad-pcb build` runs).
 */
const DEFAULT_PROJECT_BUILD_LIB = './build/lib';

/**
 * Recursively walk a directory and yield the path of every regular file,
 * along with its path relative to `root`.
 */
function* walk(root: string): Generator<{ abs: string; rel: string }> {
  yield* walkRelative(root, root);
}

function* walkRelative(root: string, dir: string): Generator<{ abs: string; rel: string }> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRelative(root, abs);
    } else if (entry.isFile()) {
      yield { abs, rel: path.relative(root, abs) };
    }
  }
}

/**
 * Resolve the directory of the `Package` subclass that is currently being
 * constructed, by inspecting the call stack.
 *
 * The frame immediately above the `Package` constructor (in `package.ts`)
 * is always the subclass's own constructor — whether that subclass lives
 * inside `node_modules` (an installed package) or in the project's own
 * `src/` directory. We deliberately do NOT skip `node_modules` frames here
 * (unlike the error-reporting `getCallSite`), because for an installed
 * package the subclass source *is* under `node_modules` and that is exactly
 * the directory we need.
 *
 * @returns the absolute directory of the subclass source file, or
 *   `undefined` if it cannot be determined.
 */
export function resolvePackageSourceDir(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;

  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const match = line.match(/at\s+(?:.+?\s+\()?(.+?):\d+:\d+\)?/);
    if (!match) continue;
    const filePath = match[1].replace(/\\/g, '/');

    // Skip this helper and the Package base class — the next frame up is
    // the subclass constructor.
    if (
      filePath.endsWith('/package_files.ts') ||
      filePath.endsWith('/package_files.js') ||
      filePath.endsWith('/package.ts') ||
      filePath.endsWith('/package.js')
    ) {
      continue;
    }
    // Skip synthetic Node internals.
    if (filePath.includes('node:internal')) continue;

    return path.dirname(match[1]);
  }
  return undefined;
}

/**
 * Convenience for non-`Package` consumers: resolve the caller's own source
 * directory from the call stack and sync its `build/lib/` into the project.
 *
 * `Package` subclasses get this automatically in their constructor; classes
 * that don't extend `Package` (e.g. hand-rolled wrapper classes) can call
 * this once from their constructor to get the same behavior.
 *
 * @example
 * ```ts
 * import { syncThisPackageBuildLib } from '@typecad/pcb';
 * export class MyModule {
 *   constructor(opts) {
 *     syncThisPackageBuildLib();
 *     // ...
 *   }
 * }
 * ```
 */
export function syncThisPackageBuildLib(): void {
  const dir = resolvePackageSourceDir();
  if (dir) syncPackageBuildLib(dir);
}

/**
 * Copy `${pkgSourceDir}/build/lib/**` into the project's `./build/lib/`,
 * preserving relative paths (so `.kicad_sym` files land flat and
 * `footprints/*.kicad_mod` land under `footprints/`).
 *
 * A file is only copied when the destination is missing or older than the
 * source (mtime comparison), making repeat builds cheap.
 *
 * Silently no-ops when the package has no `build/lib` directory (e.g. a
 * package that only uses stock KiCad parts). All errors are
 * non-fatal: a broken sync must never break a build.
 *
 * @param pkgSourceDir - Directory containing the `Package` subclass source
 *   (typically the installed package root inside `node_modules`).
 * @param destLibDir - Destination `lib/` directory. Defaults to the project's
 *   `./build/lib`. Exposed for testing.
 */
export function syncPackageBuildLib(pkgSourceDir: string, destLibDir: string = DEFAULT_PROJECT_BUILD_LIB): void {
  const srcLib = path.join(pkgSourceDir, 'build', 'lib');
  if (!fs.existsSync(srcLib)) return;

  for (const { abs: srcFile, rel } of walk(srcLib)) {
    const destFile = path.join(destLibDir, rel);
    try {
      const srcStat = fs.statSync(srcFile);
      let destStat: fs.Stats | undefined;
      try {
        destStat = fs.statSync(destFile);
      } catch {
        /* destination does not exist yet — will be created */
      }

      if (destStat && destStat.mtimeMs >= srcStat.mtimeMs) {
        continue; // destination is current, skip
      }

      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(srcFile, destFile);
      logger.debug(`[typeCAD] synced ${rel} from ${pkgSourceDir}`);
    } catch (e) {
      logger.debug(
        `[typeCAD] failed to sync ${rel} from ${pkgSourceDir}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
