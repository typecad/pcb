import { describe, expect, it } from 'vitest';
import { formatDuration, plural, resultLine, summaryLine, timestamp, withSpinner } from '../ui.js';
import { isUnicodeSupported, pickSymbols } from '../../../utils/symbols.js';

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('formatting helpers', () => {
  it('pluralizes', () => {
    expect(plural(1, 'error')).toBe('1 error');
    expect(plural(2, 'error')).toBe('2 errors');
    expect(plural(0, 'warning')).toBe('0 warnings');
    expect(plural(3, 'entry', 'entries')).toBe('3 entries');
  });

  it('formats durations', () => {
    expect(formatDuration(230)).toBe('230ms');
    expect(formatDuration(1400)).toBe('1.4s');
    expect(formatDuration(125000)).toBe('2m 05s');
  });

  it('formats a local HH:MM:SS timestamp', () => {
    expect(timestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('03:04:05');
  });
});

describe('result lines', () => {
  const { ok, fail, warn } = pickSymbols(true);

  it('summarizes a pass with the time', () => {
    expect(plain(summaryLine({ label: 'DRC', ms: 800 }))).toMatch(new RegExp(`^(${ok}|OK) DRC: passed \\(800ms\\)$`));
  });

  it('summarizes counts with real plurals', () => {
    const line = plain(summaryLine({ label: 'DRC', errors: 1, warnings: 2, unconnected: 1, ms: 1500 }));
    expect(line).toContain('DRC: 1 error, 2 warnings, 1 unconnected item (1.5s)');
    expect(line.startsWith(fail) || line.startsWith('x')).toBe(true);
  });

  it('is a warning, not a failure, without errors', () => {
    const line = plain(summaryLine({ label: 'ERC', warnings: 3 }));
    expect(line).toContain('ERC: 3 warnings');
    expect(line.startsWith(warn) || line.startsWith('!!')).toBe(true);
  });

  it('formats an arbitrary result', () => {
    expect(plain(resultLine('fail', 'check', 'failed — drc', 2000))).toContain('check: failed — drc (2.0s)');
  });
});

describe('symbols', () => {
  it('falls back to ASCII on legacy Windows consoles only', () => {
    expect(isUnicodeSupported({}, 'win32')).toBe(false);
    expect(isUnicodeSupported({ WT_SESSION: '1' }, 'win32')).toBe(true);
    expect(isUnicodeSupported({ TERM_PROGRAM: 'vscode' }, 'win32')).toBe(true);
    expect(isUnicodeSupported({ TERM: 'xterm-256color' }, 'linux')).toBe(true);
    expect(pickSymbols(false).ok).toBe('OK');
    expect(pickSymbols(true).ok).toBe('✔');
  });
});

describe('withSpinner', () => {
  it('returns the task result and does not require a terminal', async () => {
    await expect(withSpinner('working', async () => 42, { enabled: false })).resolves.toBe(42);
  });

  it('propagates errors and still cleans up', async () => {
    await expect(
      withSpinner('working', async () => {
        throw new Error('boom');
      }, { enabled: true }),
    ).rejects.toThrow('boom');
  });
});
