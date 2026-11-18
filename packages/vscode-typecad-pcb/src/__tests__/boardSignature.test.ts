import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { boardIdentity, boardIsBuildOutput } from '../boardFile.js';

let dir: string;
const board = (): string => path.join(dir, 'b.kicad_pcb');
const sign = (contents: string): void =>
  fs.writeFileSync(
    path.join(dir, '.typecad-board.json'),
    JSON.stringify({ board: 'b.kicad_pcb', boards: ['b.kicad_pcb'], hashes: { 'b.kicad_pcb': createHash('sha256').update(contents, 'utf8').digest('hex') } }),
  );

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-sig-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('boardIsBuildOutput', () => {
  it('true when the bytes match what the build signed', () => {
    fs.writeFileSync(board(), '(kicad_pcb)');
    sign('(kicad_pcb)');
    expect(boardIsBuildOutput(board())).toBe(true);
  });
  it('false after an out-of-band edit', () => {
    fs.writeFileSync(board(), '(kicad_pcb (edited))');
    sign('(kicad_pcb)');
    expect(boardIsBuildOutput(board())).toBe(false);
  });
  it('null without a signature (pre-hash toolchain) — callers keep legacy behavior', () => {
    fs.writeFileSync(board(), '(kicad_pcb)');
    fs.writeFileSync(path.join(dir, '.typecad-board.json'), JSON.stringify({ board: 'b.kicad_pcb', boards: ['b.kicad_pcb'] }));
    expect(boardIsBuildOutput(board())).toBe(null);
  });
  it('null when there is no manifest or no board', () => {
    expect(boardIsBuildOutput(board())).toBe(null);
    fs.writeFileSync(board(), '(kicad_pcb)');
    expect(boardIsBuildOutput(board())).toBe(null);
  });
});

describe('boardIdentity', () => {
  it('a touched board with the same bytes is the same board', () => {
    fs.writeFileSync(board(), '(kicad_pcb (a))');
    const before = boardIdentity(board());
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(board(), later, later);
    expect(boardIdentity(board())).toBe(before);
  });
  it('changed bytes are a different board, even at the same size', () => {
    fs.writeFileSync(board(), '(kicad_pcb (a))');
    const a = boardIdentity(board());
    fs.writeFileSync(board(), '(kicad_pcb (b))');
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(board(), later, later);
    expect(boardIdentity(board())).not.toBe(a);
  });
  it('unreadable is the empty identity', () => {
    expect(boardIdentity(path.join(dir, 'nope.kicad_pcb'))).toBe('');
  });
});
