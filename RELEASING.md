# Releasing Packages with Changesets

This workspace uses [changesets](https://github.com/changesets/changesets) to manage versioning and publishing across all `@typecad/` packages.

## Repository layout

The `@typecad/` packages sit side by side here, but not all of them are tracked by this (umbrella) repo:

- `@typecad/graphviz` and `@typecad/jlcpcb-export` — tracked here, and also carry their own git repos (`github.com/typecad/graphviz`, `github.com/typecad/jlcpcb-export`).
- `@typecad/pcb`, `@typecad/wiring`, and `@typecad/jlcpcb-parts` — gitignored here; they are independent repositories (`github.com/typecad/pcb`, `github.com/typecad/wiring`, `github.com/typecad/jlcpcb-parts`).

Releases are cut from this workspace root, so **all five package directories must be present on disk** for `changeset version` / `changeset publish` to work. A fresh clone of only the umbrella repo is missing the three gitignored packages — clone or restore them first. After `npm run version`, remember to commit the version bumps inside each package's own repository as well (the umbrella only tracks graphviz and jlcpcb-export).

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

1. **Preflight** — all five package dirs present (a fresh clone of only the umbrella repo is missing the three gitignored ones), warns on a non-master branch and on dirty nested repos.
2. **Tests** — every workspace (`--no-test` skips).
3. **`changeset version`** — consumes the changesets, bumps versions/changelogs, then refreshes `package-lock.json` so CI's `npm ci` doesn't break.
4. **Extension bundle** — compiles `vscode-typecad-pcb` and bundles it into `@typecad/pcb/assets/editor-extensions/`. This must happen **after** the version bump (the asset's manifest carries the new version) and **before** publish (the tarball packs `assets/`); the script hard-aborts if the bundled manifest's version doesn't match the package.
5. **`changeset publish`** — publishes changed packages to npm in dependency order.
6. **Commit report** — prints the per-repo commit commands for the version bumps: the umbrella repo (consumed changesets, changelogs, lockfile) and each dirty nested repo (including the bundled-asset refresh for `@typecad/pcb`).

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

**Commit the version bumps.**

### 5. Publish (manual)

```
npm run publish
```

This publishes every changed package to npm in dependency order. Packages that haven't changed version are skipped.

If this is your first time publishing from this machine, run `npm login` first.

## Common scenarios

### Only the core library changed

```
npm run changeset
# Select: @typecad/pcb
# Bump: patch
# Message: "Fixed pin numbering for reversed connectors"
```

Running `npm run version` will also bump `@typecad/pcb` in the `dependencies` of workspaces that depend on it (e.g. `demo/hw`, `rd_skeleton/hw`), because `updateInternalDependencies` is set to `"patch"` in `.changeset/config.json`.

### Multiple packages changed

```
npm run changeset
# Select: @typecad/pcb, @typecad/wiring
# Bump: @typecad/pcb → minor, @typecad/wiring → patch
# Message: "Added differential pair routing support"
```

### Release everything at once (emergency)

Create a changeset selecting all packages with the desired bump type, then run `npm run version && npm run publish`.

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

To cut the next alpha: `npm run release`, then make the per-repo commits it prints (the manual equivalent is `npm run version && npm run publish`, but remember to `npm run bundle` in `packages/vscode-typecad-pcb` between them — see step 3 above).

To ship a **stable** release, exit pre-release mode first so accumulated version bumps land in one go:

```
npx changeset pre exit
npm run version
npm run publish
```

(Re-enter anytime with `npx changeset pre enter alpha`.) Don't leave pre mode open unintentionally — pending changesets accumulate silently while it is on.

## CI integration (optional)

For automated releases via GitHub Actions, see the [changesets GitHub Action](https://github.com/changesets/action). It can automatically open a "Version Packages" PR that applies pending changesets, and publish to npm on merge.
