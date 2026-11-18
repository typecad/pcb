import { describe, expect, it } from 'vitest';
import { findUnknownFlags, parseArgv } from '../parser.js';
import { suggestClosest } from '../suggest.js';

const parse = (...tokens: string[]) => parseArgv(['node', 'typecad-pcb', ...tokens]);

describe('parseArgv', () => {
  it('takes a space-separated value for search flags', () => {
    const p = parse('search', '--limit', '3', '--format', 'table', 'LM358');
    expect(p.args['limit']).toBe('3');
    expect(p.args['format']).toBe('table');
    expect(p.positional).toEqual(['LM358']);
  });

  it('treats short flags as booleans except -o', () => {
    const w = parse('build', '-w', 'main.ts');
    expect(w.args['w']).toBe(true);
    expect(w.positional).toEqual(['main.ts']);
    expect(parse('doc', '-o', 'out.html').args['o']).toBe('out.html');
  });

  it('accepts alternate spellings of a flag', () => {
    expect(parse('export', 'gerbers', '--outdir', 'x').args['outDir']).toBe('x');
    expect(parse('add', 'component', '--symbol-source=kicad').args['symbol_source']).toBe('kicad');
  });
});

describe('findUnknownFlags', () => {
  it('flags typos and reports --no- forms as written', () => {
    const flags = (...t: string[]) => findUnknownFlags(parse(...t)).map((u) => u.flag);
    expect(flags('build', '--watchh')).toEqual(['--watchh']);
    expect(flags('build', '--no-foo')).toEqual(['--no-foo']);
    expect(flags('build', '-x')).toEqual(['-x']);
  });

  it('accepts known flags and ignores passthrough after --', () => {
    expect(findUnknownFlags(parse('build', '--watch', '--no-clear', '--', '--whatever'))).toEqual([]);
    expect(findUnknownFlags(parse('doc', '--no-open', 'a.md', 'b.kicad_pcb'))).toEqual([]);
  });

  it('rejects a flag that another command reads, instead of ignoring it', () => {
    const [fix] = findUnknownFlags(parse('build', '--fix'));
    expect(fix).toMatchObject({ flag: '--fix', scope: 'command' });
    expect(findUnknownFlags(parse('drc', '--zip')).map((u) => u.flag)).toEqual(['--zip']);
    // typos stay `unknown`
    expect(findUnknownFlags(parse('build', '--watchh'))[0]).toMatchObject({ scope: 'unknown' });
  });

  it('offers this command\'s own flags as candidates', () => {
    const [bad] = findUnknownFlags(parse('build', '--wach'));
    expect(bad!.candidates).toContain('watch');
    expect(bad!.candidates).not.toContain('zip');
  });

  it('accepts the global flags on every command', () => {
    for (const command of ['build', 'clean', 'drc', 'export', 'search']) {
      expect(findUnknownFlags(parse(command, '--json', '--quiet', '--verbose', '--board=a', '--outdir', 'x'))).toEqual([]);
    }
  });
});

describe('-v and -q', () => {
  it('-v is --version on its own and --verbose after a command', () => {
    expect(parse('-v').version).toBe(true);
    const build = parse('build', '-v');
    expect(build.version).toBe(false);
    expect(build.args['verbose']).toBe(true);
    expect(parse('doc', 'a.md', 'b.kicad_pcb', '-v').args['verbose']).toBe(true);
  });

  it('-q is --quiet', () => {
    expect(parse('drc', '-q').args['quiet']).toBe(true);
  });

  it('-v and -q pass flag validation', () => {
    expect(findUnknownFlags(parse('build', '-v', '-q'))).toEqual([]);
  });
});

describe('suggestClosest', () => {
  it('matches case and separator differences and near typos', () => {
    expect(suggestClosest('outdir', ['outDir', 'out'])).toBe('outDir');
    expect(suggestClosest('buidl', ['build', 'clean'])).toBe('build');
    expect(suggestClosest('zzzzzz', ['build', 'clean'])).toBeUndefined();
  });
});
