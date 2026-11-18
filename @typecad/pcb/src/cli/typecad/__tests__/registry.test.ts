import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allowedFlagsFor, KNOWN_FLAGS } from '../parser.js';
import { COMMANDS, COMMAND_NAMES, findCommand, GROUP_ORDER, helpFunctionFor, helpRows } from '../registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(here, '..', 'commands');

/** command -> source file(s) that read its flags */
const SOURCES: Record<string, string[]> = {
  build: ['build.ts'],
  check: ['check.ts'],
  'check-sync': ['check_sync.ts'],
  clean: ['clean.ts'],
  diagnostics: ['diagnostics.ts'],
  diff: ['diff.ts'],
  doc: ['doc.ts'],
  doctor: ['doctor.ts'],
  drc: ['drc.ts'],
  edit: ['edit.ts'],
  erc: ['erc.ts'],
  export: ['export.ts'],
  import: ['import.ts'],
  lib: ['lib.ts'],
  search: ['search.ts'],
  simulate: ['simulate.ts'],
  skills: ['skills.ts'],
  validate: ['validate.ts'],
  viewer: ['viewer.ts'],
};

describe('command registry', () => {
  it('has unique command names and a known group for each', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COMMANDS) expect(GROUP_ORDER).toContain(c.group);
    expect(COMMAND_NAMES).toContain('help');
  });

  it('only lists flags the parser knows (an unknown one could never be typed)', () => {
    for (const c of COMMANDS) {
      const allowed = allowedFlagsFor(c.name)!;
      for (const flag of allowed) expect(KNOWN_FLAGS.has(flag), `${c.name}: ${flag}`).toBe(true);
    }
  });

  // The safety net for the per-command flag check: if a command starts
  // reading a flag that the registry does not list, `--that-flag` would be
  // rejected as "not an option of '<command>'" — fail here first.
  for (const [command, files] of Object.entries(SOURCES)) {
    it(`lists every flag ${command} reads`, () => {
      const allowed = allowedFlagsFor(command)!;
      for (const file of files) {
        const source = fs.readFileSync(path.join(commandsDir, file), 'utf8');
        for (const match of source.matchAll(/args\['([A-Za-z_-]+)'\]/g)) {
          const key = match[1]!;
          expect(allowed.has(key), `${command} reads args['${key}'] but the registry does not list it`).toBe(true);
        }
      }
    });
  }

  it('resolves help functions per subcommand, falling back to the command', () => {
    expect(helpFunctionFor('export', 'pos')).toBe('showExportPosHelp');
    expect(helpFunctionFor('export', 'help')).toBe('showExportHelp');
    expect(helpFunctionFor('add', 'component')).toBe('showAddComponentHelp');
    expect(helpFunctionFor('add', '')).toBe('showAddHelp');
    expect(helpFunctionFor('build', '')).toBe('showBuildHelp');
    expect(helpFunctionFor('nope', '')).toBeUndefined();
  });

  it('points every help reference at a real function in help.ts', async () => {
    const help = (await import('../help.js')) as unknown as Record<string, unknown>;
    for (const c of COMMANDS) {
      for (const name of [c.help, ...(c.subcommands ?? []).map((s) => s.help)]) {
        if (name) expect(typeof help[name], `${c.name}: ${name}`).toBe('function');
      }
    }
  });

  it('builds the top-level rows from the table', () => {
    const labels = GROUP_ORDER.flatMap((g) => helpRows(g).map(([label]) => label));
    for (const expected of ['create', 'add component', 'add package', 'build', 'check', 'export assembly', 'lib add/list', 'viewer', 'completion']) {
      expect(labels).toContain(expected);
    }
    expect(labels).not.toContain('export help');
    // every command appears exactly once, directly or through its subcommands
    for (const c of COMMANDS) {
      expect(labels.some((l) => l === c.name || l.startsWith(`${c.name} `) || l === c.helpLabel)).toBe(true);
    }
  });

  it('knows the closed subcommand sets', () => {
    expect(findCommand('export')!.subcommands!.map((s) => s.name)).toEqual(
      expect.arrayContaining(['gerbers', 'drill', 'pos', 'bom', 'assembly']),
    );
    expect(findCommand('build')!.subcommands).toBeUndefined();
  });
});

describe('top-level help', () => {
  it('lists every command, the workflow and the npx form', async () => {
    const help = await import('../help.js');
    const lines: string[] = [];
    const original = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.map(String).join(' '));
    try {
      help.showTopLevelHelp();
    } finally {
      console.log = original;
    }
    // eslint-disable-next-line no-control-regex
    const text = lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');
    for (const c of COMMANDS) expect(text).toContain(c.helpLabel ?? (c.expandInHelp ? `${c.name} ${c.subcommands![0]!.name}` : c.name));
    expect(text).toContain('Typical workflow');
    expect(text).toContain('npx typecad-pcb build --watch');
    expect(text).toContain('npx typecad-pcb <command>');
    expect(text).toContain('--quiet, -q');
  });
});
