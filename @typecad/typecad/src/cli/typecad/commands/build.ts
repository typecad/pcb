import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../logging.js';

function detectEntryFile(): string | null {
  const config = loadConfig();
  if (config.entry) return config.entry;

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const buildScript = pkg.scripts?.build || '';
    const match = buildScript.match(/tsx\s+(.+)$/);
    if (match) return match[1];
  } catch { logger.debug('Failed to read or parse package.json'); }

  try {
    const srcFiles = fs
      .readdirSync('./src')
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (srcFiles.length === 1) return `./src/${srcFiles[0]}`;
  } catch { logger.debug('Failed to read src directory'); }

  return null;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const entry = parsed.positional[0] || detectEntryFile();

  if (!entry) {
    throw new Error(
      'No entry file specified and none could be auto-detected.\n' +
      'Provide a file path: typecad build <entry.ts>\n' +
      'Or configure one in typecad.conf.ts: { entry: "./src/main.ts" }'
    );
  }

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }

  const env: Record<string, string> = { ...process.env as Record<string, string> };

  if (parsed.args['verbose'] === true) {
    env.TYPECAD_DEBUG = '1';
  }

  try {
    execFileSync('tsx', [entry], {
      stdio: 'inherit',
      env,
    });
  } catch (error) {
    throw new Error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
