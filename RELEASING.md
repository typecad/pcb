# Releasing Packages with Changesets

This workspace uses [changesets](https://github.com/changesets/changesets) to manage versioning and publishing across all `@typecad/` packages.

## Repository layout

This is a **single repository** containing the whole workspace: the five published packages (`@typecad/pcb`, `@typecad/wiring`, `@typecad/jlcpcb-parts`, `@typecad/graphviz`, `@typecad/jlcpcb-export`), the `vscode-typecad-pcb` extension source, and the demo/template board projects. (Previously each package carried its own nested git repo — those histories are archived as bundles + bare repos in `pcb-repo-archives/` beside the workspace and on their old origin remotes.)

One consequence worth knowing: the built VS Code extension ships inside the published `@typecad/pcb` package under `assets/editor-extensions/`. It is rebuilt from `packages/vscode-typecad-pcb` by `npm run bundle` and must be re-bundled **after** version bumps (the asset manifest carries the version) and **before** publish (the tarball packs it). Both release paths below enforce this ordering.

## Setup (one-time)

After cloning, run `npm install` from the repo root. This installs `@changesets/cli` and all workspace dependencies.

## Workflow

### 1. Make your changes

Work on a feature branch as normal. Commit your changes.

### 2. Create a changeset

Before merging, describe what changed:

```
npm run changeset
```

This prompts you to select:
- **Which packages changed** (use space to select, enter to confirm)
- **Version bump type** — `patch`, `minor`, or `major`
  - `patch` — bug fixes, non-breaking changes (0.2.19 → 0.2.20)
  - `minor` — new features, backwards-compatible (0.2.19 → 0.3.0)
  - `major` — breaking changes (0.2.19 → 1.0.0)
- **Description** — a short summary for the changelog

This creates a markdown file under `.changeset/` (e.g., `.changeset/happy-pandas-fly.md`). **Commit this file with your changes.**

Example changeset file:
```markdown
---
"@typecad/pcb": patch
---

Fixed via annular ring calculation for high-current tracks
```

### 3. Release in one command

When ready to release, run:

```
npm run release
```

This wraps `changeset version` / `changeset publish` with the ordering this repo needs:

1. **Preflight** — package dirs present, warns on a non-master branch.
2. **Tests** — every workspace (`--no-test` skips).
3. **`changeset version`** — consumes the changesets, bumps versions/changelogs, then refreshes `package-lock.json`.
4. **Extension bundle** — compiles `vscode-typecad-pcb` and bundles it into `@typecad/pcb/assets/editor-extensions/`. This must happen **after** the version bump (the asset's manifest carries the new version) and **before** publish (the tarball packs `assets/`); the script hard-aborts if the bundled manifest's version doesn't match the package.
5. **`changeset publish`** — publishes changed packages to npm in dependency order (needs `npm login` locally).
6. **Commit report** — prints the commit/push commands for the version bump.

`npm run release -- --dry-run` lists the pending changesets and their bumps without changing anything.

### 4. Bump versions (manual)

The raw command, for when you need to step through by hand:

```
npm run version
```

This:
- Reads all `.changeset/*.md` files
- Bumps `package.json` versions in the selected packages
- Updates internal `@typecad/` dependency ranges (e.g., `@typecad/pcb` ^0.2.19 → ^0.2.20) in packages that depend on the changed ones
- Generates `CHANGELOG.md` entries
- Deletes the consumed changeset files

Then refresh the lockfile so the bumped workspace versions are recorded — CI's `npm ci` fails on a stale lock (`npm run release` does this automatically):

```
npm install --package-lock-only
```

**Commit the version bumps.**

### 5. Publish (manual)

```
npm run publish
```

Publish-only mode of the release script (`release.mjs --publish-only`): it skips tests and versioning but still re-bundles the VS Code extension into `@typecad/pcb/assets/editor-extensions/`, hard-aborts if the bundled manifest's version doesn't match the package, publishes every changed package to npm in dependency order, and prints the commit report. Packages that haven't changed version are skipped.

If this is your first time publishing from this machine, run `npm login` first.

## Common scenarios

### Only the core library changed

```
npm run changeset
# Select: @typecad/pcb
# Bump: patch
# Message: "Fixed pin numbering for reversed connectors"
```

Running `npm run version` will also bump `@typecad/pcb` in the `dependencies` of workspaces that depend on it (e.g. `demo/hw`, `demo/rd_skeleton/hw`), because `updateInternalDependencies` is set to `"patch"` in `.changeset/config.json`.

### Multiple packages changed

```
npm run changeset
# Select: @typecad/pcb, @typecad/wiring
# Bump: @typecad/pcb → minor, @typecad/wiring → patch
# Message: "Added differential pair routing support"
```

### Release everything at once (emergency)

Create a changeset selecting all packages with the desired bump type, then run `npm run release`.

### Skip a package from being published

Add its name to the `ignore` array in `.changeset/config.json`.

## Config reference

The config lives in `.changeset/config.json`:

| Setting | Value | Meaning |
|---------|-------|---------|
| `access` | `"public"` | All packages publish as public (required for scoped `@typecad/` packages) |
| `baseBranch` | `"master"` | The branch changesets compares against |
| `updateInternalDependencies` | `"patch"` | When a dep changes, auto-bump packages that depend on it |
| `changelog` | `["@changesets/changelog-github", { "repo": "typecad/pcb" }]` | Generates GitHub-linked changelogs (commit/PR links resolve against `github.com/typecad/pcb`) |
| `commit` | `false` | Don't auto-commit (you commit manually) |

## Pre-release mode

The repo is currently **in changeset pre-release mode** (see `.changeset/pre.json`, `"mode": "pre", "tag": "alpha"`). While in this mode:

- `npm run version` only bumps the **prerelease counter** (e.g., `1.0.0-alpha.1` → `1.0.0-alpha.2`); the accumulated major/minor changesets are consumed but do **not** produce a stable release until pre mode is exited.
- `npm run publish` publishes under the `alpha` dist-tag.

To cut the next alpha: `npm run release`, then commit the bump it prints (the bundle step is built in).

To ship a **stable** release, exit pre-release mode first so accumulated version bumps land in one go:

```
npx changeset pre exit
npm run version
npm run publish
```

(Re-enter anytime with `npx changeset pre enter alpha`.) Don't leave pre mode open unintentionally — pending changesets accumulate silently while it is on.

## The extension version must change when its content changes

Installed copies of the extension self-update only when the bundled asset's
version is **newer** than their own (`bundledUpdate.ts`). The extension is a
private workspace package, so changesets bumps it only if a changeset names it.
`release.mjs` therefore compares the freshly bundled content against the hash
recorded in `packages/vscode-typecad-pcb/.shipped.json` (written after each
publish — commit it with the release) and auto-bumps the extension version when
the content changed but the version did not. Don't hand-edit `.shipped.json`.
