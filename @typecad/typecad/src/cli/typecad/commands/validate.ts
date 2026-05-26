import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';

function detectEntryFile(): string | null {
  const config = loadConfig();
  if (config.entry) return config.entry;

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const buildScript = pkg.scripts?.build || '';
    const match = buildScript.match(/tsx\s+(.+)$/);
    if (match) return match[1];
  } catch {}

  try {
    const srcFiles = fs
      .readdirSync('./src')
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (srcFiles.length === 1) return `./src/${srcFiles[0]}`;
  } catch {}

  return null;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const entry = parsed.positional[0] || detectEntryFile();
  const verbose = parsed.args['verbose'] === true;
  const json = parsed.json;
  let hasErrors = false;

  const results: { step: string; passed: boolean; message: string }[] = [];

  if (!entry) {
    throw new Error(
      'No entry file specified and none could be auto-detected.\n' +
      'Provide a file path: typecad validate <entry.ts>\n' +
      'Or configure one in typecad.conf.ts: { entry: "./src/main.ts" }'
    );
  }

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }

  results.push({ step: 'Entry file', passed: true, message: entry });

  if (fs.existsSync('tsconfig.json')) {
    try {
      execSync('npx tsc --noEmit', {
        stdio: verbose ? 'inherit' : 'pipe',
        timeout: 30000,
      });
      results.push({ step: 'TypeScript', passed: true, message: 'no type errors' });
    } catch (error: any) {
      hasErrors = true;
      const stderr = error.stderr?.toString().trim() || '';
      results.push({ step: 'TypeScript', passed: false, message: stderr || 'type errors found' });
    }
  } else {
    results.push({ step: 'TypeScript', passed: true, message: 'skipped (no tsconfig.json)' });
  }

  try {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    env.TYPECAD_SILENT = '1';
    if (verbose) {
      env.TYPECAD_SILENT = '0';
      env.TYPECAD_DEBUG = '1';
    }

    execSync(`npx tsx "${entry}"`, {
      stdio: verbose ? 'inherit' : 'pipe',
      env,
      timeout: 60000,
    });
    results.push({ step: 'Runtime', passed: true, message: 'entry file executed successfully' });
  } catch (error: any) {
    hasErrors = true;
    const stderr = error.stderr?.toString().trim() || error.message || 'runtime error';
    results.push({ step: 'Runtime', passed: false, message: stderr });
  }

  if (json) {
    console.log(JSON.stringify({ valid: !hasErrors, results }, null, 2));
  } else {
    for (const r of results) {
      const icon = r.passed ? '  \u2714' : '  \u2716';
      const color = r.passed ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(`${color}${icon}${reset} ${r.step}: ${r.passed ? r.message : ''}`);
      if (!r.passed && r.message) {
        for (const line of r.message.split('\n').slice(0, 10)) {
          console.log(`    ${line}`);
        }
      }
    }

    console.log('');
    if (hasErrors) {
      console.log('\x1b[31mValidation failed.\x1b[0m');
    } else {
      console.log('\x1b[32mValidation passed.\x1b[0m');
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}
