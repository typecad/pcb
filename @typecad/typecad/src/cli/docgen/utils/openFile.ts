import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export default async function openFile(target: string): Promise<void> {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
        cmd = 'open';
        args = [target];
    } else if (platform === 'win32') {
        cmd = 'cmd';
        args = ['/c', 'start', '""', target];
    } else {
        cmd = 'xdg-open';
        args = [target];
    }

    await execFileAsync(cmd, args);
}
