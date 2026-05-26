import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;

  const pcbFiles = fs.readdirSync(buildDir).filter(f => f.endsWith('.kicad_pcb'));
  if (pcbFiles.length === 1) return path.join(buildDir, pcbFiles[0]);
  if (pcbFiles.length > 1) {
    return null;
  }

  return null;
}

function parseDrcOutput(output: string): { violations: number; unconnected: number } {
  let violations = 0;
  let unconnected = 0;

  const violMatch = output.match(/Found\s+(\d+)\s+violation/i);
  if (violMatch) violations = parseInt(violMatch[1], 10);

  const unconnMatch = output.match(/Found\s+(\d+)\s+unconnected/i);
  if (unconnMatch) unconnected = parseInt(unconnMatch[1], 10);

  return { violations, unconnected };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) {
      throw new Error(`PCB file not found: ${pcbArg}`);
    }
    throw new Error(
      'No .kicad_pcb file found in ./build/.\n' +
      'Run `typecad build` first, or specify a path: typecad drc <path/to/board.kicad_pcb>'
    );
  }

  if (!json) {
    console.log(chalk.white.bold('typecad drc') + ' - Design Rule Check\n');
    console.log(`  PCB: ${pcbPath}\n`);
  }

  let rawOutput = '';

  try {
    rawOutput = await executeKiCADCommand('pcb', ['drc', pcbPath], {
      stdio: 'pipe',
    });
  } catch (error: any) {
    rawOutput = error.stdout?.toString() || error.message || '';
  }

  const { violations, unconnected } = parseDrcOutput(rawOutput);
  const passed = violations === 0 && unconnected === 0;

  if (json) {
    console.log(JSON.stringify({
      pcb: pcbPath,
      passed,
      violations,
      unconnected,
      output: rawOutput,
    }, null, 2));
  } else {
    if (!passed) {
      console.log(rawOutput.trim());
      console.log('');
      if (violations > 0) {
        console.log(chalk.red(`DRC found ${violations} violation(s).`));
      }
      if (unconnected > 0) {
        console.log(chalk.yellow(`DRC found ${unconnected} unconnected item(s).`));
      }
    } else {
      console.log(chalk.green('DRC passed. No violations or unconnected items.'));
    }
  }

  if (!passed) {
    process.exit(1);
  }
}
