---
'@typecad/typecad': minor
---

Deterministic builds and the agent loop. Build output is now byte-identical across runs: every UUID in the schematic and board is derived (UUIDv5) from design content — component references, net names, geometry — instead of `randomUUID()`, and auto-placed components land on stable grid cells via a seeded hash. This makes git diffs of `build/` meaningful and enables golden tests.

Three new CLI commands form a verify-then-edit loop for agents:

- `typecad check` — build + unconnected-pad analysis + ERC + DRC in one pass, one JSON report (`--skip-erc` / `--skip-drc` to scope). Exits non-zero on failure; in `--json` mode build output is captured so stdout stays parseable.
- `typecad query <subject>` — inspect the compiled board as data: `summary`, `nets`, `net <name>`, `components`, `component <ref>`, `unconnected`, `power`. Component entries carry their source variable name (from the Code property); `unconnected` lists floating pads (mounting holes excluded) and single-pin nets.
- `typecad edit <op>` — checked semantic source edits validated against the built board before anything is written: `connect R1.1 U1.3`, `connect GND C1.2 C2.2`, `move U1 --right-of=C3 --gap=2.54`, with `--dry-run`, did-you-mean suggestions, and generated code that references your variable names.

Skills upgrades: `typecad skills search <query>` fuzzy-finds skills; `typecad skills export --out <dir>` emits every skill as a SKILL.md for `.claude/skills`-style tooling; `typecad create` scaffolds AGENTS.md from the live skill registry (can no longer drift) and gains `--yes` for fully non-interactive project creation with defaults.
