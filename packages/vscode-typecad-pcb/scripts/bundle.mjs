// ---------------------------------------------------------------------------
// bundle.mjs — compile output → the shipping asset inside @typecad/pcb.
//
// `typecad-pcb create` copies assets/editor-extensions/typecad-pcb/ from its
// own npm package into new projects' hw/.vscode/extensions/ folders, so the
// compiled extension must live inside the published @typecad/pcb package
// tree. Run after `npm run compile` (the package.json script chains them).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(pkgRoot, 'out');
const destination = path.join(
  pkgRoot,
  '..',
  '..',
  '@typecad',
  'pcb',
  'assets',
  'editor-extensions',
  'typecad-pcb',
);

if (!fs.existsSync(path.join(source, 'extension.js'))) {
  console.error(`! bundle: ${source}/extension.js missing — run 'npm run compile' first`);
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
// The whole compiled out/ tree — tsc emits one file per module, and
// extension.js requires its siblings — keeps the layout the manifest's
// "main" points at; manifest and README sit at the bundle root. Source
// maps stay behind: they are dev artifacts, and dropping them keeps the
// shipped copies identical everywhere (the parent repo gitignores *.js.map
// while this nested repo would otherwise commit them).
fs.cpSync(source, path.join(destination, 'out'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});
for (const entry of ['package.json', 'README.md']) {
  fs.copyFileSync(path.join(pkgRoot, entry), path.join(destination, entry));
}
console.log(`+ bundled vscode-typecad-pcb → ${path.relative(pkgRoot, destination)}`);
