// Sync the built vscode extension into @typecad/pcb's bundled asset — the
// asset is what the scaffold installs into projects and what the
// workspace-bundled copies self-update from. Run after changing anything in
// packages/vscode-typecad-pcb:
//   npm run sync:extension   (from @typecad/pcb, after `npm run compile`
//                             in packages/vscode-typecad-pcb)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', '..', '..', 'packages', 'vscode-typecad-pcb');
const target = path.resolve(here, '..', 'assets', 'editor-extensions', 'typecad-pcb');

const missing = ['out', 'package.json'].filter((p) => !fs.existsSync(path.join(source, p)));
if (missing.length > 0) {
  console.error(`missing ${missing.join(', ')} in ${source} — compile the extension first (npm run compile there)`);
  process.exit(1);
}

fs.mkdirSync(path.join(target, 'out'), { recursive: true });
for (const file of ['package.json', 'README.md']) {
  if (fs.existsSync(path.join(source, file))) fs.copyFileSync(path.join(source, file), path.join(target, file));
}
let count = 0;
for (const name of fs.readdirSync(path.join(source, 'out'))) {
  fs.copyFileSync(path.join(source, 'out', name), path.join(target, 'out', name));
  count++;
}
const version = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version;
console.log(`asset synced: ${count} file(s) → ${path.relative(path.resolve(here, '..'), target)} (version ${version})`);
