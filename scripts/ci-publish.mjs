// ---------------------------------------------------------------------------
// ci-publish.mjs — the publish step changesets/action runs once the Version
// Packages PR is merged (release.yml: `publish: npm run ci:publish`).
//
// Auth is npm TRUSTED PUBLISHING: the job carries id-token: write and the
// workflow ran `npm login --auth-type=oauth` first, so the OIDC identity of
// THIS workflow (registered on npmjs.com per package) is the credential —
// no NPM_TOKEN secret anywhere.
//
// The gate before publishing: the merged tree's bundled extension asset must
// be exactly fresh. The bundle is idempotent, so re-running it and checking
// git drift catches a bypassed version PR; the manifest version must equal
// the extension package's. A stale asset aborts the release instead of
// shipping (npm packs assets/ verbatim into every typecad-pcb consumer).
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = path.join('@typecad', 'pcb', 'assets', 'editor-extensions');

const run = (cmd) => {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`::error::command failed (exit ${r.status}): ${cmd}`);
    process.exit(1);
  }
};

// 1. the asset must already be fresh from the version PR — re-bundle (a
//    no-op when fresh) and demand zero drift
run('npm run bundle -w packages/vscode-typecad-pcb');
const drift = spawnSync(`git status --porcelain -- ${ASSET_DIR}`, {
  cwd: root,
  shell: true,
  encoding: 'utf8',
}).stdout.trim();
if (drift) {
  console.error(`::error::${ASSET_DIR} drifted from the version PR's bundle — the merged tree is not what ci:version staged`);
  console.error(drift);
  process.exit(1);
}

// 2. the staged manifest must carry the extension's current version
const extVersion = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'vscode-typecad-pcb', 'package.json'), 'utf8')).version;
const assetVersion = JSON.parse(fs.readFileSync(path.join(root, ASSET_DIR, 'typecad-pcb', 'package.json'), 'utf8')).version;
if (extVersion !== assetVersion) {
  console.error(`::error::bundled asset manifest is v${assetVersion} but the extension is v${extVersion} — refusing to publish a stale asset`);
  process.exit(1);
}
console.log(`> bundled extension asset is fresh at v${extVersion}`);

// 3. publish — auth already established by the OIDC login step
run('npx changeset publish');
