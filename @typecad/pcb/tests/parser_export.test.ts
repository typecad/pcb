import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/cli/typecad/parser.js';

function makeArgv(...tokens: string[]): string[] {
  return ['node', 'typecad', ...tokens];
}

describe('parser - export subcommand', () => {
  it('should parse "export gerbers" as command=export, subcommand=gerbers', () => {
    const result = parseArgv(makeArgv('export', 'gerbers'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
  });

  it('should parse "export drill" as command=export, subcommand=drill', () => {
    const result = parseArgv(makeArgv('export', 'drill'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('drill');
  });

  it('should parse "export" with no subcommand', () => {
    const result = parseArgv(makeArgv('export'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('');
  });

  it('should parse "export gerbers" with --output flag', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', '--output=./fab'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.args['output']).toBe('./fab');
  });

  it('should parse "export gerbers" with --output= flag', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', '--output=./fab'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.args['output']).toBe('./fab');
  });

  it('should parse "export gerbers" with -o flag', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', '-o', './fab'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.args['o']).toBe('./fab');
  });

  it('should parse "export gerbers" with --json flag', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', '--json'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.json).toBe(true);
  });

  it('should parse "export gerbers" with positional path', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', './myboard.kicad_pcb'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.positional).toContain('./myboard.kicad_pcb');
  });

  it('should parse passthrough args after --', () => {
    const result = parseArgv(makeArgv('export', 'gerbers', '--', '--exclude-drawing-sheet', '--use-drill-file-origin'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.passthrough).toEqual(['--exclude-drawing-sheet', '--use-drill-file-origin']);
  });

  it('should parse "export gerbers" with -o, --json, positional, and passthrough', () => {
    const result = parseArgv(
      makeArgv('export', 'gerbers', '-o', './fab', '--json', './board.kicad_pcb', '--', '--exclude-drawing-sheet'),
    );
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('gerbers');
    expect(result.args['o']).toBe('./fab');
    expect(result.json).toBe(true);
    expect(result.positional).toContain('./board.kicad_pcb');
    expect(result.passthrough).toEqual(['--exclude-drawing-sheet']);
  });

  it('should not treat a flag after "export" as a subcommand', () => {
    const result = parseArgv(makeArgv('export', '--help'));
    expect(result.command).toBe('export');
    expect(result.subcommand).toBe('');
    expect(result.help).toBe(true);
  });
});
