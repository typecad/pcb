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

### 3. Release

**The default path is push-to-publish (CI):** push your changesets to `master` and the Release workflow opens a **Version Packages PR** carrying the bumps, changelogs, refreshed lockfile, and the re-bundled extension asset. Merging that PR publishes to npm — authenticated by **trusted publishing** (OIDC), no stored npm token — pushes the release tags, and commits the bump. That merge is the entire release.

**The local equivalent** (for cutting a release by hand) is:

```
npm run release
```

which runs the same ordering with the same guarantees:

1. **Preflight** — package dirs present, warns on a non-master branch.
2. **Tests** — every workspace (`--no-test` skips).
3. **`changeset version`** — consumes the changesets, bumps versions/changelogs, then refreshes `package-lock.json`.
4. **Extension bundle** — compiles `vscode-typecad-pcb` and bundles it into `@typecad/pcb/assets/editor-extensions/`; hard-aborts if the bundled manifest's version doesn't match the package.
5. **`changeset publish`** — publishes changed packages to npm in dependency order (needs `npm login` locally; CI uses trusted publishing instead).
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

Create a changeset selecting all packages with the desired bump type, then release (merge the Version Packages PR, or `npm run release` locally).

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

To cut the next alpha: push your changesets and merge the Version Packages PR (or `npm run release` locally, then commit the bump it prints — the bundle step is built into both paths).

To ship a **stable** release, exit pre-release mode first so accumulated version bumps land in one go:

```
npx changeset pre exit
npm run version
npm run publish
```

(Re-enter anytime with `npx changeset pre enter alpha`.) Don't leave pre mode open unintentionally — pending changesets accumulate silently while it is on.

## CI publishing (trusted publishing, no npm token)

Releases run in `.github/workflows/release.yml`: push with pending changesets opens the Version Packages PR; merging it publishes. Authentication is npm **trusted publishing** — the workflow's OIDC identity is the credential, so there is no `NPM_TOKEN` secret to create, leak, or rotate.

One-time setup, per published package (all five), on npmjs.com: open the package → **Settings → Trusted Publisher** and register THIS repository, the workflow file `release.yml`, and optionally a GitHub environment (leave empty to match any). The registration must match exactly — repo, workflow filename, environment — or the publish fails with an OIDC error.

The publish command (`npm run ci:publish`) re-bundles the extension asset and fails the release on any drift, so a stale or bypassed asset can never ship. The version command (`npm run ci:version`) makes the Version Packages PR itself carry the lockfile refresh and the fresh bundle.
