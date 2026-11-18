import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseAsList, Sym } from './sexpr/index.js';
import { findSymbolNode } from './symbol_core.js';
import { getBuildDir } from './utils/constants.js';
import { writeFileAtomic } from './utils/atomic_write.js';

export function libraryCacheDir(): string {
  return process.env.TYPECAD_LIB_CACHE || path.join(os.homedir(), '.typecad', 'cache', 'kicad-libs');
}

export const SYMBOLS_RAW = 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/master';
export const FOOTPRINTS_RAW = 'https://gitlab.com/kicad/libraries/kicad-footprints/-/raw/master';

export function validLibraryPart(part: string): boolean {
  return !!part && part !== '.' && part !== '..' && !/[\\/:*?"<>|\x00-\x1f]/.test(part);
}

// Component construction and rendering are synchronous. Use the running Node
// executable for a cold network miss, without requiring KiCad or curl.
const fetchScript = `
  fetch(process.argv[1], { signal: AbortSignal.timeout(15000) })
    .then(async response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      process.stdout.write(await response.text());
    })
    .catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
`;

function download(url: string): string {
  const result = spawnSync(process.execPath, ['-e', fetchScript, url], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${url}: ${result.stderr.trim() || 'download interrupted'}`);
  return result.stdout;
}

export function resolveLibraryAsset(
  kind: 'symbols' | 'footprints',
  library: string,
  name: string,
  allowFetch: boolean,
  buildDir = getBuildDir(),
): string | null {
  if (!validLibraryPart(library) || !validLibraryPart(name)) return null;
  const symbol = kind === 'symbols';
  const filename = name + (symbol ? '.kicad_sym' : '.kicad_mod');
  const relative = path.join(kind, library, filename);
  const project = path.join(buildDir, 'lib', relative);
  if (fs.existsSync(project)) return fs.readFileSync(project, 'utf8');
  if (!allowFetch) return null;

  const cache = path.join(libraryCacheDir(), relative);
  const cached = fs.existsSync(cache);
  const base = symbol ? SYMBOLS_RAW : FOOTPRINTS_RAW;
  const dir = encodeURIComponent(library) + (symbol ? '.kicad_symdir' : '.pretty');
  const url = `${base}/${dir}/${encodeURIComponent(filename)}`;
  const text = cached ? fs.readFileSync(cache, 'utf8') : download(url);
  const nodes = parseAsList(text);
  const head = nodes[0];
  const valid =
    Sym.isSym(head) &&
    (symbol
      ? head.name === 'kicad_symbol_lib' && !!findSymbolNode(nodes, name)
      : head.name === 'footprint' || head.name === 'module');
  if (!valid) throw new Error(`Invalid KiCad file for ${library}:${name}`);
  if (!cached) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    writeFileAtomic(cache, text);
  }
  fs.mkdirSync(path.dirname(project), { recursive: true });
  writeFileAtomic(project, text);
  return text;
}
