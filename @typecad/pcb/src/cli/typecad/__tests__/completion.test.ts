import { describe, expect, it } from 'vitest';
import { completionEntries, completionScript } from '../commands/completion.js';

describe('completion scripts', () => {
  it('generates one entry per registry command with its flags and subcommands', () => {
    const entries = completionEntries();
    const build = entries.find((e) => e.name === 'build')!;
    expect(build.flags).toEqual(expect.arrayContaining(['--watch', '--clear', '-w', '--json', '--quiet']));
    expect(build.flags).not.toContain('--zip');
    const exp = entries.find((e) => e.name === 'export')!;
    expect(exp.subs).toEqual(expect.arrayContaining(['gerbers', 'assembly']));
  });

  it('bash: completes commands, subcommands and flags', () => {
    const script = completionScript('bash');
    expect(script).toContain('complete -o default -F _typecad_pcb typecad-pcb pcb');
    expect(script).toContain('compgen -W "create add');
    expect(script).toMatch(/export\) subs="gerbers drill pos bom assembly help"; flags="[^"]*--zip/);
    expect(script).toMatch(/build\) subs=""; flags="[^"]*--watch/);
  });

  it('zsh: describes commands and escapes colons in summaries', () => {
    const script = completionScript('zsh');
    expect(script.startsWith('#compdef typecad-pcb pcb')).toBe(true);
    expect(script).toContain("'build:Build KiCad output from typeCAD source'");
    expect(script).toContain('compdef _typecad_pcb typecad-pcb pcb');
    // `Build + ERC + DRC in one pass, one report` has no colon, the
    // viewer line ends with a parenthesis — none may break out of quotes
    for (const line of script.split('\n').filter((l) => /^\s+'[a-z-]+:/.test(l))) {
      expect(line.trim().endsWith("'")).toBe(true);
    }
  });

  it('pwsh: registers a native completer for both binaries', () => {
    const script = completionScript('pwsh');
    expect(script).toContain("Register-ArgumentCompleter -Native -CommandName 'typecad-pcb', 'pcb'");
    expect(script).toContain("'build' = @{ subs = @(); flags = @(");
    expect(script).toContain("'--watch'");
    const open = (script.match(/{/g) ?? []).length;
    const close = (script.match(/}/g) ?? []).length;
    expect(open).toBe(close);
  });
});
