# Releasing Packages with Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) to manage versioning and publishing across all `@typecad/` packages.

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
"@typecad/typecad": patch
---

Fixed via annular ring calculation for high-current tracks
```

### 3. Bump versions

When ready to release, consume all pending changesets:

```
npm run version
```

This:
- Reads all `.changeset/*.md` files
- Bumps `package.json` versions in the selected packages
- Updates internal `@typecad/` dependency ranges (e.g., `@typecad/typecad` ^0.2.19 → ^0.2.20) in packages that depend on the changed ones
- Generates `CHANGELOG.md` entries
- Deletes the consumed changeset files

**Commit the version bumps.**

### 4. Publish

```
npm run publish
```

This publishes every changed package to npm in dependency order. Packages that haven't changed version are skipped.

If this is your first time publishing from this machine, run `npm login` first.

## Common scenarios

### Only the core library changed

```
npm run changeset
# Select: @typecad/typecad
# Bump: patch
# Message: "Fixed pin numbering for reversed connectors"
```

Running `npm run version` will also bump `@typecad/typecad` in the `dependencies` of packages that depend on it (docgen, gitdiff, schematic), because `updateInternalDependencies` is set to `"patch"` in `.changeset/config.json`.

### Multiple packages changed

```
npm run changeset
# Select: @typecad/typecad, @typecad/mast
# Bump: @typecad/typecad → minor, @typecad/mast → patch
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
| `baseBranch` | `"main"` | The branch changesets compares against |
| `updateInternalDependencies` | `"patch"` | When a dep changes, auto-bump packages that depend on it |
| `changelog` | `"@changesets/changelog-github"` | Generates GitHub-linked changelogs |
| `commit` | `false` | Don't auto-commit (you commit manually) |

## CI integration (optional)

For automated releases via GitHub Actions, see the [changesets GitHub Action](https://github.com/changesets/action). It can automatically open a "Version Packages" PR that applies pending changesets, and publish to npm on merge.
