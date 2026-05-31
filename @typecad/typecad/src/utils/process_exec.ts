import { execFileSync } from 'node:child_process';
import process from 'node:process';

const IS_WIN = process.platform === 'win32';

type NpxExecOptions = import('node:child_process').ExecFileSyncOptions & { timeout?: number };

export function npxExec(args: string[], options: NpxExecOptions): Buffer | string {
  if (IS_WIN) {
    return execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx', ...args], options);
  }
  return execFileSync('npx', args, options);
}
