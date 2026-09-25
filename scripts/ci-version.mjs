// ---------------------------------------------------------------------------
// ci-version.mjs — the version step changesets/action runs when pending
// changesets exist (release.yml: `version: npm run ci:version`).
//
// Ordering matters, and the output rides the "Version Packages" PR so the
// published state is exactly what was reviewed:
//   1. changeset version — bumps + changelogs
//   2. lockfile refresh — the PR must carry a package-lock consistent with
//      the bumped workspace versions, or post-merge `npm ci` breaks
//   3. extension bundle — compile vscode-typecad-pcb and stage the asset
//      into @typecad/pcb/assets/editor-extensions; running it AFTER the
//      bump means the staged manifest carries the new version, and the
//      gate in ci-publish.mjs can demand an exactly-fresh asset
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (cmd) => {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`::error::command failed (exit ${r.status}): ${cmd}`);
    process.exit(1);
  }
};

run('npx changeset version');
run('npm install --package-lock-only');
run('npm run bundle -w packages/vscode-typecad-pcb');
