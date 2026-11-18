import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boardIsBuildOutput, boardSignature, recordBoardSignature } from '../src/utils/build_signature.js';

// The build signs every board it writes (.typecad-board.json `hashes`) so
// board→source sync can tell its own output from a KiCad edit.
describe('build signature', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sig-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const board = () => path.join(dir, 'b.kicad_pcb');
  const manifest = (extra: Record<string, unknown> = {}) =>
    fs.writeFileSync(path.join(dir, '.typecad-board.json'), JSON.stringify({ board: 'b.kicad_pcb', boards: ['b.kicad_pcb'], ...extra }));

  it('matches the signed bytes, rejects edited bytes', () => {
    fs.writeFileSync(board(), '(kicad_pcb)');
    manifest({ hashes: { 'b.kicad_pcb': boardSignature('(kicad_pcb)') } });
    expect(boardIsBuildOutput(board())).toBe(true);
    fs.writeFileSync(board(), '(kicad_pcb (moved))');
    expect(boardIsBuildOutput(board())).toBe(false);
  });

  it('unknown without a signature', () => {
    fs.writeFileSync(board(), '(kicad_pcb)');
    expect(boardIsBuildOutput(board())).toBe(null);
    manifest();
    expect(boardIsBuildOutput(board())).toBe(null);
  });

  it('re-signing after an in-build rewrite (zone fill) keeps the manifest intact', () => {
    manifest({ hashes: { 'b.kicad_pcb': boardSignature('(kicad_pcb)'), 'other.kicad_pcb': 'abc' } });
    fs.writeFileSync(board(), '(kicad_pcb (filled))');
    recordBoardSignature(board(), '(kicad_pcb (filled))');
    expect(boardIsBuildOutput(board())).toBe(true);
    const m = JSON.parse(fs.readFileSync(path.join(dir, '.typecad-board.json'), 'utf8'));
    expect(m.boards).toEqual(['b.kicad_pcb']);
    expect(m.hashes['other.kicad_pcb']).toBe('abc');
  });
});
