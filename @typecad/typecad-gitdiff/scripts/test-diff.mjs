import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.resolve(pkgRoot, 'tests', 'fixtures');
const cliPath = path.resolve(pkgRoot, 'dist', 'cli', 'index.js');
const pcbFile = path.join(fixturesDir, 'one_hz.kicad_pcb');
const originalFile = path.join(os.tmpdir(), 'one_hz_original.kicad_pcb');

if (!fs.existsSync(cliPath)) {
    console.error('CLI not built. Run `npm run build` first.');
    process.exit(1);
}

const gitContent = execSync('git show HEAD:one_hz.kicad_pcb', {
    cwd: fixturesDir,
    encoding: 'utf-8',
});
fs.writeFileSync(originalFile, gitContent);

console.log(`Original: ${originalFile}`);
console.log(`Modified: ${pcbFile}`);
console.log('');

execSync(`node "${cliPath}" "${originalFile}" "${pcbFile}"`, {
    cwd: pkgRoot,
    stdio: 'inherit',
});
