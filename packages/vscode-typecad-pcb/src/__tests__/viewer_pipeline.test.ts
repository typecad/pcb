import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// viewer.ts imports 'vscode', which only exists inside the extension host —
// mock the surface it touches at test time.
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: () => undefined,
    withProgress: (_opts: unknown, fn: () => Promise<unknown>) => fn(),
    setStatusBarMessage: () => undefined,
  },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  commands: { executeCommand: () => undefined },
}));

// @ts-expect-error — accessing private members through a typed-any handle
import { BoardViewerPanel } from '../viewer.js';
import { sync } from '../syncState.js';

type PanelHandle = any;

/**
 * generate() runs the render pipeline through the injected command runner —
 * one `typecad-pcb viewer` process when the toolchain has the command, the
 * step-by-step chain when it does not (and never re-attempts the one-shot
 * command after the session learned it is absent). The drift oracle overlaps
 * the render, and drift is never the user's task: the ts source is the
 * source of truth, so the pipeline converges by itself — absorbing a
 * board-side edit into source (one-shot import --auto), or standing down
 * for the pending build when the sources moved — and only unfixable drift
 * reaches the page as a banner.
 */

describe('viewer generate pipeline', () => {
  let root: string;
  let commands: string[];
  let logs: string[];
  let panel: PanelHandle;

  const writePage = (): void => {
    fs.mkdirSync(path.join(root, 'build', 'serve'), { recursive: true });
    fs.writeFileSync(path.join(root, 'build', 'serve', 'viewer.html'), '<html><head></head><body></body></html>');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-pipeline-'));
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb)');
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(board, past, past);

    commands = [];
    logs = [];
    const run = async (_cwd: string, command: string): Promise<string> => {
      commands.push(command);
      if (command.includes('typecad-pcb viewer')) {
        writePage();
        return '';
      }
      if (command.includes('export gerbers') || command.includes('export drill')) return '';
      if (command.includes('gerber-viewer')) {
        writePage();
        return '';
      }
      if (command.includes('check-sync')) return JSON.stringify({ count: 2, changes: [{ kind: 'move', label: 'R1', props: [] }] });
      return '';
    };
    panel = new BoardViewerPanel(() => root, {
      components: async () => [],
      netSources: async () => [],
    } as never, run, { appendLine: (line: string) => logs.push(line) });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('renders through the one-pass viewer command — no per-step children', async () => {
    await expect(panel.generate(root)).resolves.toBe(true);

    const viewerCmds = commands.filter((c) => c.includes('typecad-pcb viewer'));
    expect(viewerCmds).toHaveLength(1);
    // the one-pass command covers gerbers + drill + page itself
    expect(commands.some((c) => c.includes('export gerbers'))).toBe(false);
    expect(commands.some((c) => c.includes('export drill'))).toBe(false);
    expect(commands.some((c) => c.includes('gerber-viewer'))).toBe(false);
    // the drift oracle ran (overlapped) as a diagnostic; board-side drift
    // with no newer sources reads as an out-of-band board edit → silent
    // absorption first (canonical regeneration), and the banner only when
    // absorption cannot converge (this stub's check-sync never clears)
    expect(commands.some((c) => c.includes('check-sync'))).toBe(true);
    expect(commands.filter((c) => c.includes('typecad-pcb import') && c.includes('--apply'))).toHaveLength(1);
    expect(panel.generated.html).toContain('window.__typecadDrift');
    expect(logs.some((l) => l.includes('changed outside the build'))).toBe(true);
    expect(logs.some((l) => l.includes('absorbing'))).toBe(true);
    expect(logs.some((l) => l.includes('remain after regeneration'))).toBe(true);
  });

  it('a stale DRC report is withheld — markers only for the revision asked about', async () => {
    // DRC runs on request now (the palette command); nothing refreshes the
    // report automatically, so a report older than the board describes the
    // PREVIOUS revision and its markers would sit at pre-move positions
    const old = new Date(Date.now() - 300_000);
    fs.writeFileSync(path.join(root, 'build', 'b_drc.json'), '{"violations":[]}');
    fs.utimesSync(path.join(root, 'build', 'b_drc.json'), old, old);
    await expect(panel.generate(root)).resolves.toBe(true);
    const staleCmd = commands.find((c) => c.includes('typecad-pcb viewer') && !c.includes('--view-part'));
    expect(staleCmd).toBeTruthy();
    expect(staleCmd).not.toContain('--drc');
    expect(logs.some((l) => l.includes('markers withheld'))).toBe(true);

    // a FRESH report — the one the user just requested — embeds as before
    commands = [];
    fs.utimesSync(path.join(root, 'build', 'b_drc.json'), new Date(), new Date());
    await expect(panel.generate(root)).resolves.toBe(true);
    const freshCmd = commands.find((c) => c.includes('typecad-pcb viewer') && !c.includes('--view-part'));
    expect(freshCmd).toContain('--drc');
  });

  it('drift with newer sources stands down for the pending build', async () => {
    // a source newer than the board: the pending auto-build regenerates
    // the artifact — transient, no banner, no writes
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'board.ts'), 'export {};\n');
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('import'))).toBe(false);
    expect(panel.generated.html).not.toContain('window.__typecadDrift');
    expect(logs.some((l) => l.includes('pending build resolves'))).toBe(true);
  });

  it('drift while an apply runs defers to the settled state', async () => {
    sync.applyBusy = true;
    try {
      await expect(panel.generate(root)).resolves.toBe(true);
      // no writes mid-apply, and no banner from an unsettled snapshot —
      // the apply's final render classifies against the settled state
      expect(commands.some((c) => c.includes('import'))).toBe(false);
      expect(panel.generated.html).not.toContain('window.__typecadDrift');
      expect(logs.some((l) => l.includes('deferring to the settled state'))).toBe(true);
    } finally {
      sync.applyBusy = false;
    }
  });

  it('drift with equally-aged board and sources reports a build bug', async () => {
    // no source newer, no board newer — yet the oracle sees differences:
    // the build does not reproduce source, a bug to report (banner)
    const board = path.join(root, 'build', 'b.kicad_pcb');
    const t = new Date(Date.now() - 120_000);
    fs.utimesSync(board, t, t);
    fs.writeFileSync(path.join(root, 'typecad.conf.ts'), 'export default {};\n');
    fs.utimesSync(path.join(root, 'typecad.conf.ts'), t, t);
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('import'))).toBe(false);
    expect(panel.generated.html).toContain('window.__typecadDrift');
    expect(logs.some((l) => l.includes('does not reproduce this board'))).toBe(true);
  });

  it('persisting drift absorbs ONCE per board revision, then the banner is the fallback', async () => {
    // absorption is attempted exactly once per board mtime (win or lose) —
    // an unabsorbable drift can never loop the render pipeline
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.filter((c) => c.includes('--apply'))).toHaveLength(1);
    expect(panel.generated.html).toContain('window.__typecadDrift');

    commands = [];
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('--apply'))).toBe(false);
    expect(panel.generated.html).toContain('window.__typecadDrift');
  });

  it('external drift absorbs silently when regeneration converges — no banner', async () => {
    // the converging case: check-sync clears after the importer ran, so
    // the tree maintains itself and the user never sees a banner
    let imported = false;
    const run = panel.run as (cwd: string, command: string, t: number) => Promise<string>;
    (panel as PanelHandle).run = async (cwd: string, command: string, t: number) => {
      if (command.includes('--apply') && command.includes('import')) imported = true;
      if (command.includes('check-sync')) {
        if (imported) return JSON.stringify({ count: 0, changes: [] });
      }
      return run(cwd, command, t);
    };
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('--apply'))).toBe(true);
    expect(panel.generated.html).not.toContain('window.__typecadDrift');
    expect(logs.some((l) => l.includes('in sync'))).toBe(true);
  });

  it('falls back to the step-by-step chain on a toolchain without viewer', async () => {
    const run = panel.run as (cwd: string, command: string, t: number) => Promise<string>;
    panel.run = async (_cwd: string, command: string): Promise<string> => {
      commands.push(command);
      if (command.includes('typecad-pcb viewer')) {
        throw new Error("Unknown command 'viewer'. Run 'typecad --help' for available commands.");
      }
      if (command.includes('gerber-viewer')) {
        writePage();
        return '';
      }
      if (command.includes('check-sync')) return JSON.stringify({ count: 0 });
      return '';
    };

    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('export gerbers'))).toBe(true);
    expect(commands.some((c) => c.includes('export drill'))).toBe(true);
    expect(commands.some((c) => c.includes('gerber-viewer'))).toBe(true);
    expect(logs.some((l) => l.includes("no 'viewer' command"))).toBe(true);
    // no drift → no banner
    expect(panel.generated.html).not.toContain('window.__typecadDrift');

    // the session learned: a second generate never re-attempts the command
    commands = [];
    await expect(panel.generate(root)).resolves.toBe(true);
    expect(commands.some((c) => c.includes('typecad-pcb viewer'))).toBe(false);
    expect(commands.some((c) => c.includes('export gerbers'))).toBe(true);
    expect(run).toBeDefined();
  });

  it('a real one-pass failure (not an unknown command) still fails the render', async () => {
    panel.run = async (_cwd: string, command: string): Promise<string> => {
      commands.push(command);
      if (command.includes('typecad-pcb viewer')) {
        throw new Error('zone fill engine exploded');
      }
      if (command.includes('check-sync')) return JSON.stringify({ count: 0 });
      return '';
    };
    await expect(panel.generate(root)).rejects.toThrow(/zone fill engine exploded/);
    // and it did NOT take the fallback path
    expect(commands.some((c) => c.includes('export gerbers'))).toBe(false);
  });

  it('a rendered-but-unshown page lands on the next refresh, even with an unchanged board', async () => {
    // live regression: an apply's generate() produced fresh HTML, but the
    // assigning refresh was deferred (pipelineBusy) and its replay hit the
    // board-unchanged branch, which returned without assigning — the panel
    // kept the PRE-apply page and the user's next apply was refused against
    // a stale board stamp. The branch must land any render the panel has
    // not been shown.
    writePage();
    const boardMtime = fs.statSync(path.join(root, 'build', 'b.kicad_pcb')).mtimeMs;
    const pageMtime = fs.statSync(path.join(root, 'build', 'serve', 'viewer.html')).mtimeMs;
    const assigned: string[] = [];
    panel.panel = {
      visible: true,
      webview: {
        postMessage: async () => true,
        onDidReceiveMessage: () => undefined,
        set html(h: string) {
          assigned.push(h);
        },
      },
      onDidDispose: () => undefined,
      onDidChangeViewState: () => undefined,
    };
    panel.generated = { html: '<html>POST-APPLY</html>', boardMtimeMs: boardMtime, diskMtimeMs: pageMtime };
    panel.assignedHtml = '<html>PRE-APPLY</html>';

    await panel.doRefresh();
    expect(assigned).toEqual(['<html>POST-APPLY</html>']);
    expect(panel.assignedHtml).toBe('<html>POST-APPLY</html>');
    expect(logs.some((l) => l.includes('never shown'))).toBe(true);
  });


  it('the render carries --lazy-views and never eagerly solves ngspice', async () => {
    // a netlist NEWER than the board once forced `simulate` into every
    // render — the solve now waits for the first view switch
    fs.writeFileSync(path.join(root, 'build', 'b.net'), '(export)\n');
    await expect(panel.generate(root)).resolves.toBe(true);
    const viewerCmd = commands.find((c) => c.includes('typecad-pcb viewer') && !c.includes('--view-part'));
    expect(viewerCmd).toBeTruthy();
    expect(viewerCmd).toContain('--lazy-views');
    expect(commands.some((c) => c.includes('simulate'))).toBe(false);
  });

  it('serves a deferred view part through the --view-part fragment', async () => {
    const posted: Array<Record<string, unknown>> = [];
    (panel as PanelHandle).panel = {
      webview: { postMessage: (m: Record<string, unknown>) => { posted.push(m); return Promise.resolve(true); } },
    };
    const origRun = panel.run as (cwd: string, command: string, t: number) => Promise<string>;
    (panel as PanelHandle).run = async (cwd: string, command: string, t: number) => {
      if (command.includes('--view-part pcba')) {
        fs.mkdirSync(path.join(root, 'build', 'serve'), { recursive: true });
        fs.writeFileSync(path.join(root, 'build', 'serve', 'view-pcba.html'), '<g id="view-pcba" data-viewbox="0 0 25 15"></g>');
      }
      return origRun(cwd, command, t);
    };
    await (panel as PanelHandle).serveViewPart('pcba');
    expect(commands.some((c) => c.includes('--view-part pcba'))).toBe(true);
    expect(posted.at(-1)).toMatchObject({
      type: 'typecad/view-part',
      part: 'pcba',
      html: expect.stringContaining('id="view-pcba"'),
    });
  });

  it('solves the ngspice op on the first net-op ask and caches while fresh', async () => {
    fs.writeFileSync(path.join(root, 'build', 'b.net'), '(export)\n');
    const posted: Array<Record<string, unknown>> = [];
    (panel as PanelHandle).panel = {
      webview: { postMessage: (m: Record<string, unknown>) => { posted.push(m); return Promise.resolve(true); } },
    };
    const origRun = panel.run as (cwd: string, command: string, t: number) => Promise<string>;
    (panel as PanelHandle).run = async (cwd: string, command: string, t: number) => {
      if (command.includes('simulate')) {
        fs.writeFileSync(path.join(root, 'build', 'b_op.json'), JSON.stringify({ solved: true, nets: { vcc: 3.3 } }));
      }
      return origRun(cwd, command, t);
    };
    await (panel as PanelHandle).serveViewPart('net-op');
    expect(commands.some((c) => c.includes('simulate'))).toBe(true);
    expect(posted.at(-1)).toMatchObject({ type: 'typecad/view-part', part: 'net-op', op: { solved: true, nets: { vcc: 3.3 } } });
    // op fresh now — the second ask reads the file, no second solve
    commands = [];
    await (panel as PanelHandle).serveViewPart('net-op');
    expect(commands.some((c) => c.includes('simulate'))).toBe(false);
    expect(posted.at(-1)).toMatchObject({ part: 'net-op', op: { solved: true } });
  });

  it('a failing part answers as an error the page surfaces', async () => {
    const posted: Array<Record<string, unknown>> = [];
    (panel as PanelHandle).panel = {
      webview: { postMessage: (m: Record<string, unknown>) => { posted.push(m); return Promise.resolve(true); } },
    };
    // the stock run stub writes no view-blueprint.html → fragment missing
    await (panel as PanelHandle).serveViewPart('blueprint');
    expect(posted.at(-1)).toMatchObject({ type: 'typecad/view-part', part: 'blueprint' });
    expect(typeof posted.at(-1)!.error).toBe('string');
  });
});
