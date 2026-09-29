import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { getBuildDir } from '../../../utils/constants.js';
import { libraryRoots } from '../../../kicad.js';
import { parse, serialize, Sym } from '../../../sexpr/index.js';
import type { SExpr, SList } from '../../../sexpr/types.js';

/**
 * `typecad-pcb lib` — project-owned KiCad libraries, no install required.
 *
 * The build resolves symbols/footprints from the install (or conf paths),
 * then the project's `build/lib/`, then the bundled `power` library. This
 * command fills `build/lib/` from the official KiCad library repos
 * (gitlab.com/kicad/libraries) on demand. Downloads go through a
 * user-level cache and land INSIDE the project (committable, and the
 * board builds offline from then on). Fetching never happens during a
 * build itself — it is an explicit act, so builds stay deterministic
 * and network-free.
 *
 *   typecad-pcb lib add Device                  (whole symbol library)
 *   typecad-pcb lib add Device:R_Small          (one symbol — the repo's
 *                                                 kicad_symdir layout stores
 *                                                 symbols as individual files)
 *   typecad-pcb lib add --footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm
 *   typecad-pcb lib list
 */

const SYMBOLS_RAW = 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/master';
const SYMBOLS_TREE = 'https://gitlab.com/api/v4/projects/kicad%2Flibraries%2Fkicad-symbols/repository/tree';
const FOOTPRINTS_RAW = 'https://gitlab.com/kicad/libraries/kicad-footprints/-/raw/master';

function cacheDir(): string {
  return process.env.TYPECAD_LIB_CACHE || path.join(os.homedir(), '.typecad', 'cache', 'kicad-libs');
}

/** Libraries shipped inside @typecad/pcb (`bundled/` at the package root);
 *  works identically from src/ via tsx and from dist/. */
function bundledLibraryPath(libraryName: string): string {
  return fileURLToPath(new URL(`../../../../bundled/${libraryName}.kicad_sym`, import.meta.url));
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with retry/backoff: GitLab rate-limits bulk raw fetches (429), and
 * a whole library is hundreds of files. The user-level cache makes failed
 * runs resumable — a retry only refetches what never landed.
 */
async function fetchWithRetry(url: string, timeoutMs = 30_000, attempts = 4): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (res.ok) return await res.arrayBuffer();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= attempts) throw new Error(`HTTP ${res.status}`);
    await delay(attempt * attempt * 1000); // 1s, 4s, 9s
  }
}

async function fetchText(url: string, timeoutMs?: number): Promise<string> {
  return Buffer.from(await fetchWithRetry(url, timeoutMs)).toString('utf8');
}

/** fetch through the user-level cache (keyed by repo path) so a second
 *  project — or a refetch after deleting a project copy — doesn't
 *  re-download. Listing calls bypass the cache. */
async function fetchCached(url: string, cacheRel: string): Promise<string> {
  const cached = path.join(cacheDir(), cacheRel);
  if (fs.existsSync(cached)) {
    logger.debug(`lib: cache hit ${cached}`);
    return fs.readFileSync(cached, 'utf8');
  }
  const text = await fetchText(url);
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, text, 'utf8');
  return text;
}

/** binary cache variant — 3D models (.step/.wrl) are large and must not
 *  round-trip through UTF-8 text. */
async function fetchCachedBuffer(url: string, cacheRel: string): Promise<Buffer> {
  const cached = path.join(cacheDir(), cacheRel);
  if (fs.existsSync(cached)) {
    logger.debug(`lib: cache hit ${cached}`);
    return fs.readFileSync(cached);
  }
  const buf = Buffer.from(await fetchWithRetry(url));
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

const looksLikeSymbolLib = (text: string): boolean => /^\s*\(kicad_symbol_lib/.test(text);
const looksLikeFootprint = (text: string): boolean => /^\s*\((footprint|module)\b/.test(text);

/**
 * Merge single-symbol `.kicad_sym` payloads into one library file keyed by
 * symbol name (later payloads win) — the repos' kicad_symdir layout stores
 * each symbol as its own complete library file.
 */
function mergeSymbolPayloads(payloads: string[]): string {
  const byName = new Map<string, string>();
  for (const text of payloads) {
    const lists = parse(text) as SExpr[];
    for (const node of lists) {
      const head = (node as SList)[0];
      if (Sym.isSym(head) && head.name === 'symbol') {
        const name = String((node as SList)[1] ?? '');
        byName.set(name, serialize(node));
      }
    }
  }
  return `(kicad_symbol_lib\n  (version 20251024)\n  (generator "typecad lib merge")\n${[...byName.values()].map((s) => `  ${s}`).join('\n')}\n)`;
}

/** whole-library file list from the tree API (`Lib.kicad_symdir/` blobs) */
async function listSymdirFiles(libraryName: string): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; ; page++) {
    const url = `${SYMBOLS_TREE}?ref=master&path=${encodeURIComponent(`${libraryName}.kicad_symdir`)}&per_page=100&page=${page}`;
    const json = JSON.parse(await fetchText(url)) as Array<{ name?: string; type?: string }>;
    if (!Array.isArray(json) || json.length === 0) break;
    for (const entry of json) {
      if (entry.type === 'blob' && entry.name?.endsWith('.kicad_sym')) out.push(entry.name);
    }
    if (json.length < 100) break;
  }
  return out;
}

/** bounded-concurrency map so a whole library (hundreds of files) doesn't
 *  open hundreds of sockets at once */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function addSymbolLibrary(raw: string): Promise<void> {
  const specific = raw.includes(':');
  const libraryName = specific ? raw.slice(0, raw.indexOf(':')) : raw;
  const destPath = path.join(getBuildDir(), 'lib', `${libraryName}.kicad_sym`);

  // `power` ships inside @typecad/pcb — copy it offline, no network
  if (libraryName === 'power') {
    const bundled = bundledLibraryPath('power');
    if (fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(bundled, destPath);
      logger.log(chalk.green(`  ✓ power (bundled with @typecad/pcb, copied offline) → ${destPath}`));
      return;
    }
  }

  try {
    // payload per source file; merged with any existing project copy so
    // successive adds accumulate instead of clobbering
    const payloads: string[] = [];
    const existing = fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf8') : '';
    if (existing && looksLikeSymbolLib(existing)) payloads.push(existing);

    if (specific) {
      const symbolName = raw.slice(raw.indexOf(':') + 1);
      const url = `${SYMBOLS_RAW}/${libraryName}.kicad_symdir/${symbolName}.kicad_sym`;
      const text = await fetchCached(url, path.join('symbols', libraryName, `${symbolName}.kicad_sym`));
      if (!looksLikeSymbolLib(text)) throw new Error('the URL did not return a symbol file');
      payloads.push(text);
    } else {
      const files = await listSymdirFiles(libraryName);
      if (files.length === 0) throw new Error(`library "${libraryName}" not found`);
      logger.log(chalk.gray(`  … ${libraryName}: ${files.length} symbol files`));
      const texts = await mapLimited(files, 4, (name) =>
        fetchCached(`${SYMBOLS_RAW}/${libraryName}.kicad_symdir/${name}`, path.join('symbols', libraryName, name)),
      );
      for (const text of texts) {
        if (!looksLikeSymbolLib(text)) throw new Error('a fetched file was not a symbol library');
        payloads.push(text);
      }
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, mergeSymbolPayloads(payloads), 'utf8');
    logger.log(chalk.green(`  ✓ ${raw} → ${destPath}`));
  } catch (e) {
    logger.log(
      chalk.red(`  ✖ ${raw}: ${e instanceof Error ? e.message : String(e)} — check the name at https://gitlab.com/kicad/libraries/kicad-symbols`),
    );
    process.exitCode = 1;
  }
}

/**
 * `(model "${X_3DMODEL_DIR}/Lib.3dshapes/file")` references inside a
 * footprint — the 3D models live in a third repo (kicad-packages3D) and
 * are not part of the .kicad_mod. Each is fetched into
 * build/lib/3dshapes and the reference rewritten to
 * `${KIPRJMOD}/lib/3dshapes/…`: KIPRJMOD resolves to the directory of
 * the opened .kicad_pcb (= build/), so the KiCad GUI and kicad-cli
 * raytrace find the project-owned models with no env-var setup.
 */
const MODEL_REF = /\(model\s+"([^"]+)"/g;
const ENV_MODEL_DIR = /^\$\{[A-Za-z0-9_]*3DMODEL_DIR\}\/(.+)$/;
const MODELS_RAW = 'https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/master';

async function addFootprint(spec: string): Promise<void> {
  const sep = spec.indexOf(':');
  if (sep <= 0 || sep === spec.length - 1) {
    logger.log(chalk.red(`  ✖ "${spec}" — footprints need Lib:Name form (e.g. Package_SO:SOIC-8_3.9x4.9mm_P1.27mm)`));
    process.exitCode = 1;
    return;
  }
  const libraryName = spec.slice(0, sep);
  const footprintName = spec.slice(sep + 1);
  const destPath = path.join(getBuildDir(), 'lib', 'footprints', `${footprintName}.kicad_mod`);
  if (fs.existsSync(destPath)) {
    logger.log(chalk.gray(`  – ${footprintName} already in build/lib/footprints → ${destPath}`));
    return;
  }
  try {
    const original = await fetchCached(
      `${FOOTPRINTS_RAW}/${libraryName}.pretty/${footprintName}.kicad_mod`,
      path.join('footprints', libraryName, `${footprintName}.kicad_mod`),
    );
    if (!looksLikeFootprint(original)) throw new Error('the URL did not return a footprint file');

    // companion 3D models: fetch each referenced file, rewrite the path.
    // Best-effort — a missing model never fails the footprint itself.
    let text = original;
    let models = 0;
    for (const ref of [...original.matchAll(MODEL_REF)].map((m) => m[1]!)) {
      const rel = ENV_MODEL_DIR.exec(ref)?.[1];
      if (!rel) continue; // already project-relative or absolute
      try {
        const buf = await fetchCachedBuffer(`${MODELS_RAW}/${rel}`, path.join('3dshapes', rel));
        const dest = path.join(getBuildDir(), 'lib', '3dshapes', rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        text = text.replaceAll(ref, `\${KIPRJMOD}/lib/3dshapes/${rel}`);
        models++;
      } catch (e) {
        logger.log(chalk.yellow(`  ⚠ 3D model ${rel}: ${e instanceof Error ? e.message : String(e)} — footprint added without it`));
      }
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, text, 'utf8');
    const suffix = models > 0 ? chalk.gray(` (+${models} 3D model${models > 1 ? 's' : ''})`) : '';
    logger.log(chalk.green(`  ✓ ${spec} → ${destPath}`) + suffix);
  } catch (e) {
    logger.log(
      chalk.red(`  ✖ ${spec}: ${e instanceof Error ? e.message : String(e)} — check the name at https://gitlab.com/kicad/libraries/kicad-footprints`),
    );
    process.exitCode = 1;
  }
}

function listLibraries(): void {
  const roots = libraryRoots();
  logger.log(chalk.white.bold('typecad-pcb lib list') + ' — library sources\n');
  logger.log(`  symbols:    ${roots.symbols ?? chalk.gray('(none)')} (${roots.symbolsSource})`);
  logger.log(`  footprints: ${roots.footprints ?? chalk.gray('(none)')} (${roots.footprintsSource})`);
  logger.log(`  bundled:    power + chip-passive symbols/footprints (inside @typecad/pcb, last resort)\n`);

  const libDir = path.join(getBuildDir(), 'lib');
  const symbols = fs.existsSync(libDir) ? fs.readdirSync(libDir).filter((f) => f.endsWith('.kicad_sym')) : [];
  const footprintsDir = path.join(libDir, 'footprints');
  const footprints = fs.existsSync(footprintsDir)
    ? fs.readdirSync(footprintsDir).filter((f) => f.endsWith('.kicad_mod'))
    : [];
  const modelsDir = path.join(libDir, '3dshapes');
  const models: string[] = [];
  if (fs.existsSync(modelsDir)) {
    for (const lib of fs.readdirSync(modelsDir)) {
      const dir = path.join(modelsDir, lib);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) models.push(`${lib}/${f}`);
    }
  }
  logger.log('  build/lib (project-owned, committable):');
  logger.log(symbols.length ? symbols.map((s) => `    ${s}`).join('\n') : chalk.gray('    (no symbol libraries)'));
  logger.log(footprints.length ? footprints.map((f) => `    footprints/${f}`).join('\n') : chalk.gray('    (no footprints)'));
  logger.log(models.length ? models.map((m) => `    3dshapes/${m}`).join('\n') : chalk.gray('    (no 3D models)'));
  logger.log('');
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const sub = parsed.subcommand;

  if (sub === 'list') {
    listLibraries();
    return;
  }

  if (sub === 'add') {
    logger.log(chalk.white.bold('typecad-pcb lib add') + ' — fetch KiCad libraries into build/lib\n');
    const footprintArg = parsed.args['footprint'];
    if (typeof footprintArg === 'string' && footprintArg) {
      await addFootprint(footprintArg);
    }
    for (const name of parsed.positional) {
      await addSymbolLibrary(name);
    }
    if (typeof footprintArg !== 'string' && parsed.positional.length === 0) {
      logger.log(chalk.yellow('  nothing to add — pass library names (Device, Device:R_Small) and/or --footprint Lib:Name'));
      process.exitCode = 1;
    }
    logger.log(chalk.gray('\nFetched libraries are project-owned (committable); builds never touch the network.'));
    return;
  }

  const help = await import('../help.js');
  help.showLibHelp();
}
