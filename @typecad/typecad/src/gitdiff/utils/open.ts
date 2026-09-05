import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import logger from '../../utils/logging.js';

const execFileAsync = promisify(execFile);

export async function openInBrowser(target: string): Promise<void> {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === 'darwin') {
    command = 'open';
    args = [target];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '""', target];
  } else {
    command = 'xdg-open';
    args = [target];
  }

  try {
    await execFileAsync(command, args);
  } catch {
    logger.warn(`Could not open ${target} in browser. Please open it manually.`);
  }
}
