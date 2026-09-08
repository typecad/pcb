import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';

const activeTempDirs: string[] = [];

export function createTempDir(prefix = 'typecad-test-'): string {
  const dir = path.join(os.tmpdir(), `${prefix}${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  activeTempDirs.push(dir);
  return dir;
}

export function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  const idx = activeTempDirs.indexOf(dir);
  if (idx >= 0) activeTempDirs.splice(idx, 1);
}

export function cleanupAllTempDirs(): void {
  for (const dir of activeTempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  activeTempDirs.length = 0;
}

export function writeTempFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  const fileDir = path.dirname(filePath);
  fs.mkdirSync(fileDir, { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function readTempFile(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

export function tempFileExists(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name));
}
