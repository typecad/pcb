# Shelved changesets

Changesets parked here are **not** pending — changesets never reads this
folder. This is a plain archive for release notes that are written but not
yet scheduled for a release.

Do NOT put changesets in `.changeset/pre/` — that folder is reserved
changesets machinery: in pre-release mode, `changeset version` moves
consumed changeset files there as its record of what this pre-cycle has
already released (they are excluded from further versioning until
`changeset pre exit` folds them into the stable release). Hand-curating
`.changeset/pre/` confuses the release tooling and CI.

To ship a shelved changeset: copy its `.md` file into `.changeset/` (top
level) and push — the Release workflow will fold it into the next
"Version Packages" PR.
