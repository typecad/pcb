// ---------------------------------------------------------------------------
// End-to-end scaffold test: run the REAL create_project() with only the
// external commands (npm install, git) stubbed, then assert every artifact a
// new project must receive — including the bundled VS Code extension and its
// companion files. Guards the whole create → editor-integration chain;
// registry availability (why a live `create` can't run in CI) is the only
// thing mocked.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync }));

describe('create_project scaffolds the complete project', () => {
  let tmp: string;
  let previousCwd: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-e2e-'));
    previousCwd = process.cwd();
    process.chdir(tmp);
    execFileSync.mockReset();
    // Emulate the two external commands create drives: `npm init -y` writes a
    // starter package.json (create later reads it back to add scripts), and
    // every other command (npm install, git init) is a no-op. On Windows npm
    // arrives via cmd.exe, so detect subcommands positionally.
    execFileSync.mockImplementation((_cmd: string, args: unknown[], opts?: { cwd?: string }) => {
      if ((args as string[]).includes('init')) {
        const cwd = opts?.cwd ?? process.cwd();
        fs.writeFileSync(
          path.join(cwd, 'package.json'),
          JSON.stringify({ name: 'probe-hw', version: '1.0.0', scripts: {} }, null, 2),
        );
      }
      return '';
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes every artifact including the bundled VS Code extension', async () => {
    const { create_project } = await import('../create_project.js');
    create_project({ name: 'probe', hal: false, git: false });

    const root = path.join(tmp, 'probe');
    const hw = path.join(root, 'hw');

    // -- core project scaffold ------------------------------------------------
    expect(fs.existsSync(path.join(hw, 'typecad.conf.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'src', 'probe.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'build', 'probe.kicad_pcb'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'build', 'fp-lib-table'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'docs', 'probe.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'probe.code-workspace'))).toBe(true);
    expect(fs.existsSync(path.join(hw, 'AGENTS.md'))).toBe(true);

    // -- npm scripts wired to the CLIs ----------------------------------------
    const pkg = JSON.parse(fs.readFileSync(path.join(hw, 'package.json'), 'utf8'));
    for (const script of ['build', 'add_component', 'add_package', 'kicad-search', 'import']) {
      expect(pkg.scripts[script], `npm script '${script}'`).toBeDefined();
    }

    // -- the bundled extension, exactly as shipped -----------------------------
    const ext = path.join(hw, '.vscode', 'extensions', 'typecad-pcb');
    expect(fs.existsSync(path.join(ext, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(ext, 'out', 'extension.js'))).toBe(true);
    expect(fs.existsSync(path.join(ext, 'out', 'probeClient.js'))).toBe(true);
    // the bundle's manifest carries the commands the hover links invoke
    const extPkg = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
    expect(extPkg.contributes.commands.map((c: { command: string }) => c.command)).toContain(
      'typecad-pcb.viewComponent',
    );

    // auto-install + npm hiding companions
    const extensionsJson = JSON.parse(fs.readFileSync(path.join(hw, '.vscode', 'extensions.json'), 'utf8'));
    expect(extensionsJson.forceInstall).toContain('typecad.vscode-typecad-pcb');
    const settings = JSON.parse(fs.readFileSync(path.join(hw, '.vscode', 'settings.json'), 'utf8'));
    expect(settings['npm.exclude']).toBe('**/.vscode/extensions/**');
    expect(settings['npm.autoDetect']).toBe('on');
    expect(settings['files.exclude']).toEqual({ '.vscode/extensions': true });

    // every emitted extension script parses (escaping guard)
    for (const file of fs.readdirSync(path.join(ext, 'out')).filter((f) => f.endsWith('.js'))) {
      expect(() => new Function(fs.readFileSync(path.join(ext, 'out', file), 'utf8')), file).not.toThrow();
    }
  });

  it('leaves no partial project behind when a step throws', async () => {
    execFileSync.mockImplementation((_cmd: string, args: unknown[]) => {
      if ((args as string[]).join(' ').includes('npm')) throw new Error('simulated npm failure');
      return '';
    });
    const { create_project } = await import('../create_project.js');
    create_project({ name: 'doomed', hal: false, git: false });
    expect(fs.existsSync(path.join(tmp, 'doomed'))).toBe(false);
  });
});
