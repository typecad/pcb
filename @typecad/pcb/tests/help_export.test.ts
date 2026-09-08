import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('help - export functions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('showExportHelp should print export parent help with subcommands', async () => {
    const { showExportHelp } = await import('../src/cli/typecad/help.js');
    showExportHelp();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('\n');
    expect(output).toContain('typecad-pcb export');
    expect(output).toContain('gerbers');
    expect(output).toContain('drill');
  });

  it('showExportGerbersHelp should print gerbers-specific help', async () => {
    const { showExportGerbersHelp } = await import('../src/cli/typecad/help.js');
    showExportGerbersHelp();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('\n');
    expect(output).toContain('typecad-pcb export gerbers');
    expect(output).toContain('kicad-cli pcb export gerbers');
    expect(output).toContain('--exclude-drawing-sheet');
  });

  it('showExportDrillHelp should print drill-specific help', async () => {
    const { showExportDrillHelp } = await import('../src/cli/typecad/help.js');
    showExportDrillHelp();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('\n');
    expect(output).toContain('typecad-pcb export drill');
    expect(output).toContain('kicad-cli pcb export drill');
    expect(output).toContain('--use-drill-file-origin');
  });

  it('showTopLevelHelp should list export gerbers and export drill', async () => {
    const { showTopLevelHelp } = await import('../src/cli/typecad/help.js');
    showTopLevelHelp();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('\n');
    expect(output).toContain('export gerbers');
    expect(output).toContain('export drill');
  });
});
