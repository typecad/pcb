// ---------------------------------------------------------------------------
// release.mjs — one command, right order:
//
//   preflight → tests → changeset version → bundle the extension asset
//   → changeset publish → per-repo commit report
//
// WHY this exists: `changeset publish` alone ships whatever state
// @typecad/pcb/assets/editor-extensions/ is in. The asset must be re-bundled
// AFTER `changeset version` (the manifest inside the asset carries the new
// version) and BEFORE `changeset publish` (the tarball packs assets/), and
// the version bumps must then be committed in each package's OWN repository
// — @typecad/pcb, @typecad/wiring and @typecad/jlcpcb-parts are gitignored
// nested repos (RELEASING.md). None of that ordering was enforced anywhere;
// the bundled extension asset went stale Sep 19–24 before anyone noticed.
//
// Usage:
//   npm run release              # full sequence (needs `npm login` for publish)
//   npm run release -- --no-test # skip the test gate
//   npm run release -- --dry-run # show pending changesets, change nothing
//   npm run release -- --publish-only
//                                # after a manual `changeset version`: skips
//                                # tests/versioning, still bundles the asset,
//                                # gates, publishes, and prints the report
//                                # (this is what `npm run publish` runs)
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Set(process.argv.slice(2));
const dryRun = flags.has('--dry-run') || flags.has('-n');
const noTest = flags.has('--no-test');
const publishOnly = flags.has('--publish-only');

const EXTENSION_DIR = path.join(root, 'packages', 'vscode-typecad-pcb');
// the shipping asset inside @typecad/pcb — `npm run bundle` lands it there
const ASSET_MANIFEST = path.join(
  root, '@typecad', 'pcb', 'assets', 'editor-extensions', 'typecad-pcb', 'package.json',
);
// the five releasable packages; the last three are gitignored nested repos
// and are missing on a fresh clone of only this umbrella repo
const REQUIRED_PACKAGES = [
  ['@typecad/pcb', 'published; carries the bundled vscode extension asset'],
  ['@typecad/wiring', 'published'],
  ['@typecad/jlcpcb-parts', 'published'],
  ['@typecad/graphviz', 'published; tracked in this repo'],
  ['@typecad/jlcpcb-export', 'published; tracked in this repo'],
];
const NESTED_REPOS = ['@typecad/pcb', '@typecad/wiring', '@typecad/jlcpcb-parts'];

const log = (m = '') => process.stdout.write(`${m}\n`);
const step = (m) => log(`\n== ${m} ${'='.repeat(Math.max(2, 66 - m.length))}`);
const die = (m) => {
  log(`\n✖ ${m}`);
  process.exit(1);
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Run a shell command with inherited stdio; die on a non-zero exit. */
function run(cmd, cwd = root) {
  log(`\n$ (${path.relative(root, cwd) || '.'}) ${cmd}`);
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) die(`command failed (exit ${r.status}): ${cmd}`);
}

const git = (args, cwd = root) =>
  spawnSync(`git ${args}`, { cwd, shell: true, encoding: 'utf8' }).stdout.trim();

/** Pending changeset files — .changeset/*.md minus the README; `pre/` is a dir. */
const pendingChangesets = () =>
  fs.readdirSync(path.join(root, '.changeset')).filter((f) => f.endsWith('.md') && f !== 'README.md');

// -- 1. preflight ------------------------------------------------------------

step('preflight');
const missing = REQUIRED_PACKAGES.filter(([dir]) => !fs.existsSync(path.join(root, dir, 'package.json')));
if (missing.length > 0) {
  die(
    'missing published-package directories:\n' +
      missing.map(([dir, why]) => `  ${dir} — ${why}`).join('\n') +
      '\nReleases are cut from this workspace root and changesets needs all five on\n' +
      `disk (RELEASING.md); the umbrella repo gitignores ${NESTED_REPOS.join(', ')}.`,
  );
}
const branch = git('rev-parse --abbrev-ref HEAD');
if (branch !== 'master') log(`  warning: on branch '${branch}', not master (changesets baseBranch)`);
for (const dir of NESTED_REPOS) {
  if (git('status --porcelain', path.join(root, dir)))
    log(`  warning: ${dir} has uncommitted changes — they ride into its release commit`);
}
const pending = pendingChangesets();
if (publishOnly) {
  // The version step is skipped in this mode, so pending changesets are
  // expected to be already consumed — warn loudly if they are not.
  if (pending.length > 0)
    log(`  warning: ${pending.length} pending changeset(s) will NOT be consumed by --publish-only`);
} else if (pending.length === 0) {
  log('\nno pending changesets — nothing to release');
  process.exit(0);
}
log(`  ${pending.length} pending changeset(s)`);

if (dryRun) {
  step('dry run — pending changesets and their bumps');
  for (const file of pending) {
    const frontmatter = (fs.readFileSync(path.join(root, '.changeset', file), 'utf8').split('---')[1] ?? '')
      .split('\n')
      .filter((line) => line.includes(':'))
      .map((line) => line.trim())
      .join(', ');
    log(`  ${file}  [${frontmatter}]`);
  }
  log('\ndry run — no versions changed, nothing published');
  process.exit(0);
}

// -- 2. tests ----------------------------------------------------------------

if (publishOnly) {
  step('tests (skipped — publish-only)');
} else if (noTest) {
  step('tests (skipped)');
} else {
  step('tests');
  run('npm run test -ws --if-present');
}

// -- 3. version ---------------------------------------------------------------
// Consume the changesets, then refresh package-lock.json so the bumped
// workspace versions are recorded — CI's `npm ci` fails on a stale lock.

if (publishOnly) {
  step('changeset version (skipped — publish-only, run after a manual version)');
} else {
  step('changeset version (consume changesets, bump versions + changelogs)');
  run('npx changeset version');
  run('npm install --package-lock-only');
}

// -- 4. extension asset -------------------------------------------------------
// AFTER the bump (the asset manifest must carry the new version), BEFORE
// publish (the @typecad/pcb tarball packs assets/). The cross-check turns
// "forgot to bundle" from a silent stale-asset ship into a hard abort.

step('bundle the vscode extension into @typecad/pcb assets');
run('npm run bundle', EXTENSION_DIR);
const extVersion = readJson(path.join(EXTENSION_DIR, 'package.json')).version;
const assetVersion = readJson(ASSET_MANIFEST).version;
if (extVersion !== assetVersion) {
  die(
    `bundled asset manifest is v${assetVersion} but the extension is v${extVersion} — ` +
      'the bundle did not land; refusing to publish a stale asset',
  );
}
log(`  asset manifest matches extension version ${extVersion}`);

// -- 5. publish ----------------------------------------------------------------

step('changeset publish (npm, dependency order — needs `npm login`)');
run('npx changeset publish');

// -- 6. commit report ----------------------------------------------------------
// changesets is configured with commit:false — the bumps are committed by
// hand, per repository. Print the exact commands instead of running them:
// the umbrella commit also carries the consumed changesets and changelogs,
// and changesets' git tags land in THIS repo.

step('commit the bumps — run these yourself');
if (git('status --porcelain')) {
  log('  umbrella repo (consumed changesets, changelogs, lockfile, bump graphviz/jlcpcb-export/vscode):');
  log('    git add -A && git commit -m "Version Packages (pre-release)"');
  log(`    git push origin ${branch} --tags   # changesets tags land in this repo`);
}
for (const dir of NESTED_REPOS) {
  const cwd = path.join(root, dir);
  if (!git('status --porcelain', cwd)) continue;
  const version = readJson(path.join(cwd, 'package.json')).version;
  const note = dir === '@typecad/pcb' ? ' (+ bundled extension asset refreshed)' : '';
  log(`  ${dir} v${version}${note}:`);
  log(`    git -C ${dir} add -A && git -C ${dir} commit -m "release v${version}${note}"`);
  log(`    git -C ${dir} push`);
}
log('\ndone.');
