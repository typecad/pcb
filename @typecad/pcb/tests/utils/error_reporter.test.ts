import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reportError } from '../../src/utils/error_reporter.js';
import logger from '../../src/utils/logging.js';

vi.mock('../../src/utils/logging.js', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), success: vi.fn() };
  return { default: m, ...m };
});

describe('reportError', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs error header with message', () => {
    reportError('Something failed', { reference: 'R1' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Something failed'));
  });

  it('logs no-source-info fallback when item lacks sourceInfo', () => {
    reportError('Test error', { reference: 'U1' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No source info available'));
  });

  it('logs source location when sourceInfo is present', () => {
    const filePath = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(filePath, 'line1\nline2\nconst x = 1;\nline4\nline5\n', 'utf-8');
    reportError('Error', { reference: 'C1', sourceInfo: { file: filePath, line: 3, variable: 'x' } });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(filePath));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('x'));
  });

  it('shows pointer under variable name', () => {
    const filePath = path.join(tmpDir, 'test2.ts');
    fs.writeFileSync(filePath, 'a\nb\nconst myVar = 5;\nd\ne\n', 'utf-8');
    reportError('Err', { reference: 'R2', sourceInfo: { file: filePath, line: 3, variable: 'myVar' } });
    const logCalls = (logger.log as ReturnType<typeof vi.fn>).mock.calls;
    const hasPointer = logCalls.some(([msg]) => String(msg).includes('^^^^^'));
    expect(hasPointer).toBe(true);
  });

  it('handles missing source file gracefully', () => {
    const fakePath = path.join(tmpDir, 'nonexistent.ts');
    reportError('File missing', { reference: 'R3', sourceInfo: { file: fakePath, line: 1 } });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('File missing'));
  });

  it('uses reference as fallback when sourceInfo lacks variable', () => {
    const filePath = path.join(tmpDir, 'test3.ts');
    fs.writeFileSync(filePath, 'x\ny\nz\n', 'utf-8');
    reportError('Ref fallback', { reference: 'R99', sourceInfo: { file: filePath, line: 2 } });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('R99'));
  });
});
