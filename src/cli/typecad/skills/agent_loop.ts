import type { Skill } from './types.js';

export const agentLoopSkills: Skill[] = [
  {
    name: 'agent-loop',
    category: 'workflow',
    description:
      'The verify-then-edit loop for agents (and humans): check the whole board in one command, query the compiled design as data, and make checked semantic edits instead of hand-editing coordinates',
    examples: [
      {
        title: 'Full loop',
        code: `# 1. Verify everything in one pass (build + unconnected + ERC + DRC)
typecad-pcb check --json
# → { ok: false, unconnected: { pads: [{ reference: 'J1', pad: '3' }] } }

# 2. Ask the board what pin 3 of J1 touches
typecad-pcb query component J1 --json

# 3. Make the connection with a checked edit
typecad-pcb edit connect GND J1.3

# 4. Re-verify — output is deterministic, so diffs are meaningful
typecad-pcb check --json`,
      },
    ],
    notes: [
      'check exits non-zero on failure and emits one JSON report; every violation carries designators and coordinates that query can expand.',
      'edit validates pins, pads, nets, and references against the compiled board BEFORE touching the source file, and fails with did-you-mean suggestions.',
      'Build output is deterministic (UUIDv5 derived from design content): the same design always produces byte-identical files, so git diffs show real changes only.',
      'query reads the built .kicad_pcb — it reflects post-build truth, not source text. Rebuild before querying after source edits.',
      'Query subjects: summary, nets, net <name>, components, component <ref>, unconnected, power.',
    ],
    related: ['circuit-design', 'pcb-structure', 'power', 'validation-erc', 'validation-drc'],
  },
  {
    name: 'board-query',
    category: 'project',
    description:
      'Inspect the compiled board as structured data: nets and their members, component placement, power rails, and floating pins — without grepping source files',
    usage: {
      signature: `typecad-pcb query <subject> [--json] [path/to/board.kicad_pcb]`,
      parameters: [
        {
          name: 'summary',
          type: 'subject',
          required: false,
          description: 'Board totals: components, nets, vias, zones, unconnected pads, outline bounds',
        },
        {
          name: 'nets',
          type: 'subject',
          required: false,
          description: 'Every net with its member pins (REF.pad), via and zone counts',
        },
        { name: 'net <name>', type: 'subject', required: false, description: 'One net in detail' },
        {
          name: 'components',
          type: 'subject',
          required: false,
          description: 'Reference, value, footprint, placement, source variable per component',
        },
        {
          name: 'component <ref>',
          type: 'subject',
          required: false,
          description: 'One component pad-by-pad, each pad with its net',
        },
        {
          name: 'unconnected',
          type: 'subject',
          required: false,
          description: 'Pads with no net (mounting holes excluded) plus single-pin nets',
        },
        {
          name: 'power',
          type: 'subject',
          required: false,
          description: 'Detected power rails with pours and stitching vias',
        },
        {
          name: 'routes',
          type: 'subject',
          required: false,
          description:
            'Copper status per net: routed/unrouted pins, segment count, total length, layers, pour assistance',
        },
        {
          name: 'zones',
          type: 'subject',
          required: false,
          description: 'Copper pours (net, layers, fill mode, extent) and keepout regions',
        },
      ],
    },
    examples: [
      {
        title: 'What is GND connected to?',
        code: `typecad-pcb query net GND
# GND — 12 pins, 94 vias
#   pours: F.Cu+B.Cu
#   U1.1  U1.9  C1.2  C2.2  ...`,
      },
      {
        title: 'Find forgotten connections',
        code: `typecad-pcb query unconnected
# Pads with no net (3):
#   J1.3  J1.4  R5.2
# Single-pin nets (1):
#   nRESET — U1.3`,
      },
    ],
    notes: [
      'Component entries include the source variable name (from the Code property), so you can map J1 → j1 when writing code.',
      'Power detection is name-based (GND, VCC, +3V3, ...) plus structural (≥4 vias or a zone pour).',
      'The board must be built first: query parses ./build/*.kicad_pcb.',
    ],
    related: ['agent-loop', 'checked-edits', 'power'],
  },
  {
    name: 'checked-edits',
    category: 'project',
    description:
      'Declarative source edits that are validated against the compiled board before anything is written: connect pins onto nets, move components by absolute or relative placement',
    usage: {
      signature: `typecad-pcb edit <op> [args] [--file=path] [--dry-run] [--json]`,
      parameters: [
        {
          name: 'connect',
          type: 'op',
          required: false,
          description: 'typecad-pcb edit connect <a> <b> [...] — endpoints are pins (R1.1) or one net name (GND)',
        },
        {
          name: 'move',
          type: 'op',
          required: false,
          description: 'typecad-pcb edit move <ref> --to=x,y | --right-of=REF [--gap=mm] [--rot=deg]',
        },
        {
          name: '--dry-run',
          type: 'flag',
          required: false,
          description: 'Print the exact code that would be written without touching the file',
        },
        {
          name: '--file',
          type: 'option',
          required: false,
          description: 'Source file to edit (default: auto-detected entry)',
        },
      ],
    },
    examples: [
      {
        title: 'Connect two pins (auto net)',
        code: `typecad-pcb edit connect R1.1 U1.3
# ✓ connected R1.1 ↔ U1.3
#   src/board.ts:26  typecad.net(r1.pin(1), u1.pin(3));`,
      },
      {
        title: 'Connect pins onto a named power rail',
        code: `typecad-pcb edit connect GND C1.2 C2.2 U1.9
#   typecad.named('GND').net(c1.pin(2), c2.pin(2), u1.pin(9));`,
      },
      {
        title: 'Move a part next to another',
        code: `typecad-pcb edit move U1 --right-of=C3 --gap=2.54
#   u1.pcb = { x: typecad.board.rightOf(c3).by(2.54), y: typecad.board.sameAs(c3), rotation: 90 };`,
      },
      {
        title: 'Autoroute copper between two pins',
        code: `typecad-pcb edit route U1.3 R1.1 --width 0.25 --layers F.Cu,B.Cu
#   typecad.route({ from: u1.pin(3), to: r1.pin(1), width: 0.25, layers: ['F.Cu', 'B.Cu'] });
# verify with: typecad-pcb query routes  (flags nets whose pins have no copper path)`,
      },
    ],
    notes: [
      'Every endpoint is checked: unknown component, missing pad, or unknown net fails BEFORE the file is modified, with did-you-mean suggestions.',
      'Generated code references the source variable names embedded in the built board (Code property), so the code stays human-idiomatic.',
      'move preserves an existing rotation unless --rot is given; --to writes absolute millimetre coordinates.',
      'route emits a synchronous pcb.route() call. ORDER IS LOAD-BEARING: define the net first (edit connect or .net()), and call route() BEFORE create() — route() after create() THROWS a TypeCadError (the board is already written; routes staged then can never reach it). The edit route codemod inserts before the first .create() for this reason.',
      'The router can still fail to find a path (saturated boards, tight clearances) — check the return value or "typecad-pcb query routes".',
      'Run typecad-pcb build or check first — edit validates against ./build/*.kicad_pcb.',
    ],
    related: ['agent-loop', 'board-query', 'pcb-structure'],
  },
];
