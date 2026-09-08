---
title: typeCAD for Agents
description: Check, query, and edit PCBs from the command line — a tight verify-and-edit loop for AI coding agents
date: '2026-09-04'
categories:
  - ai
  - llm
  - command-line
  - automation
published: true
cover: https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=640
---

# typeCAD for Agents

typeCAD has always been a good fit for AI coding agents — hardware described as TypeScript means an agent can work the same way it does on any other codebase. But writing code is only half of what agents do. The other half is the loop: **verify** what was built, **inspect** the result, and **edit** precisely when something is wrong. Until now that loop leaned on generic tools — grep the source, parse errors by eye, hope the diff meant something.

The latest release closes the loop with three new CLI commands — `check`, `query`, and `edit` — plus a foundation that makes all of it trustworthy: deterministic builds.

### Verify everything at once: `typecad-pcb check`

One command runs the full gauntlet — build, unconnected-pad analysis, ERC, and DRC — and emits a single report. With `--json` it is one parseable document with correct exit codes, so an agent can act on it without scraping prose:

```bash
$ typecad-pcb check --json
{
  "ok": false,
  "build": { "ran": true, "passed": true, "outputs": ["rd_skeleton.kicad_pcb"] },
  "unconnected": {
    "ran": true,
    "passed": false,
    "pads": [{ "reference": "J1", "pad": "3", "type": "thru_hole" }]
  },
  "erc": { "ran": true, "passed": false, "errors": 13 },
  "drc":  { "ran": true, "passed": false, "unconnectedItems": 96 }
}
```

Every failure points at designators and pins, not file internals — the same vocabulary the agent writes code with.

### The board as a database: `typecad-pcb query`

After a build, the compiled board is a queryable dataset. Agents should ask the board, not grep the source:

```bash
$ typecad-pcb query unconnected
  Pads with no net (7):
    J1.3  thru_hole
    J1.4  thru_hole

$ typecad-pcb query net GND
  pins      2
    J1.1
    J2.1
  vias      94
  zones     F.Cu+B.Cu
  copper    fully routed — pour-assisted
```

Components come back with their source variable names (J1 → `j1`), so the answer maps directly onto the code. Routing gets first-class treatment too: `query routes` reports which nets have real copper — pins connected out of total, segment counts, routed length, layers — and understands zone pours as connectivity. A ground plane pouring around an isolated pad counts as routed; a pin with no path is called out by name:

```bash
$ typecad-pcb query routes
  ✓ GND     3/3 pins, 94 vias, pour-assisted
  ✖ net4    1/2 pins
      no copper path to: J1.4
```

`query zones` separates copper pours from keepout regions, with layers, fill mode, and extents. Everything has a `--json` form, and errors return their option space — ask for a net that doesn't exist and the response lists every net that does.

### Checked edits: `typecad-pcb edit`

The mutation side works the same way. `edit` rewrites the source through declarative, validated operations — every pin, pad, and net is checked against the compiled board *before* the file is touched, and a wrong guess fails with suggestions instead of a broken file:

```bash
$ typecad-pcb edit connect J1.3 J2.3
✓ connected J1.3 ↔ J2.3
  src/rd_skeleton.ts:27  typecad.net(j1.pin(3), j2.pin(3));

$ typecad-pcb edit route J1.3 J2.3 --width 0.25
✓ routed J1.3 ↔ J2.3
  src/rd_skeleton.ts:50  typecad.route({ from: j1.pin(3), to: j2.pin(3), width: 0.25 });

$ typecad-pcb edit move U1 --right-of=C3 --gap 2.54 --dry-run
Dry run — would write at src/board.ts:34
+ u1.pcb = { x: typecad.board.rightOf(c3).by(2.54), y: typecad.board.sameAs(c3), rotation: 90 };
```

`connect` joins pins onto nets, `route` emits a real `pcb.route()` call (anchored before `create()`, where it belongs — more on that below), and `move` writes relative or absolute placement. `--dry-run` shows the exact line first.

### Deterministic builds

This is the quiet change that makes the loop honest. Board files used to embed random UUIDs, so every build produced different bytes even for identical designs — diffs were noise, and "did my change work?" was unanswerable by comparing files. Every UUID is now derived from design content, and identical designs build to **byte-identical** `.kicad_pcb` and `.kicad_sch` files. A diff of `build/` now shows real changes and nothing else.

### Order matters — and the compiler says so

Routing has one rule: `route()` must run before `create()`, because `create()` writes the board. Call it after and the routes could never reach the file — previously a silent `0/1` in a log line. Now it's a loud, self-explanatory error:

```
TypeCadError: route() was called after create(). The board is already written,
so routes staged now can never reach it. Reorder the program: put the pins on
a net, call route() BEFORE create(), then call create().
```

`typecad-pcb edit route` anchors its output before the first `create()` automatically, so the codemod can't produce the bad ordering in the first place.

### Teaching agents what exists

The `skills` knowledge base grew with the features: `typecad-pcb skills search ` fuzzy-finds patterns across everything — placement, routing, validation, the agent loop itself — and `typecad-pcb skills export` writes every skill as a SKILL.md file for `.claude/skills`-style tooling. Newly scaffolded projects get an `AGENTS.md` generated from the live skill registry documenting the loop, and `typecad-pcb create --name=my_board --yes` builds a complete project non-interactively.

### A complete session

The whole point, end to end — no GUI, no guessing:

```bash
$ typecad-pcb check --json | jq '.unconnected.pads'     # 1. find what's missing
$ typecad-pcb query component J1 --json                  # 2. understand the part
$ typecad-pcb edit connect GND J1.3                      # 3. make it right
$ typecad-pcb edit route J1.3 J2.3 --width 0.25          # 4. give it copper
$ typecad-pcb check --json | jq '.ok'                    # 5. prove it
true
```

Verify, query, edit, verify again. The `@typecad/pcb-mcp` server exposes the same surfaces over MCP, so agents wired through either transport get identical, checkable behavior.

All of this is in `@typecad/pcb` starting from the next release. If you run agents against your hardware projects — or you're curious what that would look like — `typecad-pcb create --name=hello_agent --yes` is the fastest way to find out.