import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getBuildDir } from './utils/constants.js';
import { findSymbolNode, parseSymbolLibrary } from './symbol_core.js';
import { resolveLibraryAsset, validLibraryPart } from './library_asset.js';
import type { SList } from './sexpr/types.js';

export function symbolLibraryFor(
  root: string | undefined | null,
  library: string,
  name: string,
  allowFetch: boolean,
  cache?: Map<string, SList>,
  buildDir = getBuildDir(),
): SList | null {
  if (!validLibraryPart(library) || !validLibraryPart(name)) return null;
  const candidates = [
    root && `${root}/${library}.kicad_sym`,
    `${buildDir}/lib/${library}.kicad_sym`,
    `${buildDir}/lib/symbols/${name}.kicad_sym`,
    fileURLToPath(new URL(`../bundled/${encodeURIComponent(library)}.kicad_sym`, import.meta.url)),
  ];
  for (const file of candidates) {
    if (!file) continue;
    let nodes = cache?.get(file);
    if (!nodes && fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      if (/^\s*\(symbol\b/.test(content)) continue; // pre-serialized project entry
      nodes = parseSymbolLibrary(content);
      cache?.set(file, nodes);
    }
    if (nodes && findSymbolNode(nodes, name)) return nodes;
  }
  const asset = resolveLibraryAsset('symbols', library, name, allowFetch, buildDir);
  return asset ? parseSymbolLibrary(asset) : null;
}
