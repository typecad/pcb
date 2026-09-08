import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildBoardModel, findComponent, findNet, type BoardComponent, type BoardModel } from '../board_model.js';
import { loadConfig } from '../../../config.js';

interface EditError {
  code: string;
  message: string;
  didYouMean?: string[];
}

function fail(error: EditError, json: boolean): never {
  if (json) {
    logger.log(JSON.stringify({ ok: false, error }, null, 2));
  } else {
    logger.error(chalk.red(error.message));
    if (error.didYouMean && error.didYouMean.length > 0) {
      logger.log(chalk.gray(`  Did you mean: ${error.didYouMean.slice(0, 5).join(', ')}?`));
    }
  }
  process.exit(1);
}

function detectEntryFile(): string | null {
  const config = loadConfig();
  if (config.entry) return config.entry;
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const match = (pkg.scripts?.build || '').match(/tsx\s+(.+)$/);
    if (match) return match[1];
  } catch {
    /* ignore */
  }
  try {
    const srcFiles = fs.readdirSync('./src').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (srcFiles.length === 1) return `./src/${srcFiles[0]}`;
  } catch {
    /* ignore */
  }
  return null;
}

function findBuildDir(): string | null {
  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;
  const pcbFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
  return pcbFiles.length === 1 ? buildDir : null;
}

function requireVariable(comp: BoardComponent, json: boolean): string {
  if (comp.variable) return comp.variable;
  fail(
    {
      code: 'NO_SOURCE_VARIABLE',
      message: `Component ${comp.reference} has no source variable (created anonymously). Edit its net/placement manually.`,
    },
    json,
  );
}

function pinLiteral(pin: string): string {
  return /^\d+$/.test(pin) ? pin : `'${pin}'`;
}

/** Locate the PCB instance variable so generated code references the right object. */
function findPcbVariable(source: string): string | null {
  const match = source.match(/(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+PCB\s*\(/);
  return match ? match[1] : null;
}

function insertionIndexForNet(lines: string[]): { index: number; indent: string } {
  let lastNet = -1;
  let firstCreate = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\.net\(/.test(lines[i])) lastNet = i;
    if (firstCreate === -1 && /\.create\(/.test(lines[i])) firstCreate = i;
  }
  if (lastNet !== -1) {
    const indentMatch = lines[lastNet].match(/^(\s*)/);
    return { index: lastNet + 1, indent: indentMatch ? indentMatch[1] : '' };
  }
  if (firstCreate !== -1) {
    const indentMatch = lines[firstCreate].match(/^(\s*)/);
    return { index: firstCreate, indent: indentMatch ? indentMatch[1] : '' };
  }
  return { index: lines.length, indent: '' };
}

/**
 * Route calls must run BEFORE create() — create() writes the board and the
 * router operates on live staging state. Anchor after existing route calls,
 * else immediately before the first create(), else after the nets.
 */
function insertionIndexForRoute(lines: string[]): { index: number; indent: string } {
  let lastRoute = -1;
  let firstCreate = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\.route\(/.test(lines[i])) lastRoute = i;
    if (firstCreate === -1 && /\.create\(/.test(lines[i])) firstCreate = i;
  }
  if (lastRoute !== -1) {
    const indentMatch = lines[lastRoute].match(/^(\s*)/);
    return { index: lastRoute + 1, indent: indentMatch ? indentMatch[1] : '' };
  }
  if (firstCreate !== -1) {
    const indentMatch = lines[firstCreate].match(/^(\s*)/);
    return { index: firstCreate, indent: indentMatch ? indentMatch[1] : '' };
  }
  return insertionIndexForNet(lines);
}

function findAssignmentLine(lines: string[], variable: string): number {
  const pattern = new RegExp(`^\\s*${variable}\\.pcb\\s*=`);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

function parseEndpoint(
  token: string,
  model: BoardModel,
  json: boolean,
): { kind: 'pin'; comp: BoardComponent; pad: string } | { kind: 'net'; name: string } {
  const pinMatch = token.match(/^([A-Za-z]+\d+)\.(.+)$/);
  if (pinMatch) {
    const comp = findComponent(model, pinMatch[1]);
    if (!comp) {
      fail(
        {
          code: 'COMPONENT_NOT_FOUND',
          message: `Component '${pinMatch[1]}' not found in the built board.`,
          didYouMean: model.components.map((c) => c.reference).filter((r) => r[0] === pinMatch[1][0].toUpperCase()),
        },
        json,
      );
    }
    const pad = pinMatch[2];
    if (!comp!.pads.some((p) => p.pad === pad)) {
      fail(
        {
          code: 'PAD_NOT_FOUND',
          message: `Component ${comp!.reference} has no pad '${pad}'.`,
          didYouMean: comp!.pads.map((p) => `${comp!.reference}.${p.pad}`),
        },
        json,
      );
    }
    return { kind: 'pin', comp: comp!, pad };
  }
  // Net endpoint: must exist or look like a power rail
  if (findNet(model, token)) return { kind: 'net', name: findNet(model, token)!.name };
  if (/^(gnd|ground|vcc|\+|-|vdd|vss|vin|vout)/i.test(token) || /^[+-]?\d+(\.\d+)?v/i.test(token)) {
    return { kind: 'net', name: token };
  }
  fail(
    {
      code: 'ENDPOINT_UNKNOWN',
      message: `'${token}' is neither a pin (REF.PAD) nor a known net.`,
      didYouMean: model.nets.map((n) => n.name).filter((n) => n.toLowerCase().startsWith(token[0].toLowerCase())),
    },
    json,
  );
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const op = parsed.subcommand;

  if (!op) {
    if (json) {
      logger.log(
        JSON.stringify({ operations: ['connect <endpoints...>', 'move <ref> (--to=x,y | --right-of=ref ...)'] }),
      );
    } else {
      const help = await import('../help.js');
      help.showEditHelp();
    }
    return;
  }

  // Validation model: edits are checked against the compiled board.
  const buildDir = findBuildDir();
  if (!buildDir) {
    fail(
      {
        code: 'NO_BUILD',
        message:
          "No .kicad_pcb found in ./build/. Run 'typecad-pcb build' or 'typecad-pcb check' first so edits can be validated.",
      },
      json,
    );
  }
  const pcbFile = fs.readdirSync(buildDir).find((f) => f.endsWith('.kicad_pcb'))!;
  const model = buildBoardModel(path.join(buildDir, pcbFile));

  if (parsed.args['file'] === true) {
    fail({ code: 'MISSING_VALUE', message: '--file needs a value: typecad-pcb edit <op> ... --file <path>' }, json);
  }
  const fileArg = typeof parsed.args['file'] === 'string' ? parsed.args['file'] : undefined;
  const sourcePath = path.resolve(fileArg || detectEntryFile() || '');
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    fail({ code: 'NO_SOURCE_FILE', message: `Source file not found: ${sourcePath}. Pass --file=<path>.` }, json);
  }
  const dryRun = parsed.args['dry-run'] === true;
  const source = fs.readFileSync(sourcePath, 'utf8');
  const lines = source.split(/\r?\n/);

  if (op === 'connect') {
    const endpoints = parsed.positional.filter((p) => !p.endsWith('.kicad_pcb'));
    if (endpoints.length < 2) {
      fail(
        {
          code: 'TOO_FEW_ENDPOINTS',
          message: 'connect needs at least two endpoints: typecad-pcb edit connect R1.1 U1.3 [GND ...]',
        },
        json,
      );
    }

    const parsedEndpoints = endpoints.map((e) => parseEndpoint(e, model, json));
    const netNames = parsedEndpoints.filter((e): e is { kind: 'net'; name: string } => e.kind === 'net');
    const pins = parsedEndpoints.filter(
      (e): e is { kind: 'pin'; comp: BoardComponent; pad: string } => e.kind === 'pin',
    );

    if (netNames.length > 1) {
      fail(
        {
          code: 'MULTIPLE_NETS',
          message: `Multiple net names given (${netNames.map((n) => n.name).join(', ')}). Use one net and the rest pins.`,
        },
        json,
      );
    }
    if (pins.length < 2) {
      fail({ code: 'TOO_FEW_PINS', message: 'connect needs at least two pins.' }, json);
    }

    const pcbVar = findPcbVariable(source) ?? 'typecad';
    const pinCalls = pins.map((p) => `${requireVariable(p.comp, json)}.pin(${pinLiteral(p.pad)})`).join(', ');
    const code =
      netNames.length === 1
        ? `${pcbVar}.named('${netNames[0].name}').net(${pinCalls});`
        : `${pcbVar}.net(${pinCalls});`;

    const { index, indent } = insertionIndexForNet(lines);
    lines.splice(index, 0, `${indent}${code}`);
    const lineNumber = index + 1;

    if (dryRun) {
      if (json)
        logger.log(JSON.stringify({ ok: true, dryRun: true, file: sourcePath, line: lineNumber, code }, null, 2));
      else {
        logger.log(chalk.white.bold('Dry run — would insert at ') + `${sourcePath}:${lineNumber}`);
        logger.log(chalk.green(`+ ${code}`));
      }
      return;
    }
    fs.writeFileSync(sourcePath, lines.join('\n'), 'utf8');
    if (json) logger.log(JSON.stringify({ ok: true, file: sourcePath, line: lineNumber, code }, null, 2));
    else {
      logger.log(
        chalk.green(
          `✓ connected ${pins.map((p) => `${p.comp.reference}.${p.pad}`).join(' ↔ ')}${netNames.length === 1 ? ` on net ${netNames[0].name}` : ''}`,
        ),
      );
      logger.log(chalk.gray(`  ${sourcePath}:${lineNumber}  ${code}`));
    }
    return;
  }

  if (op === 'move') {
    const ref = parsed.positional[0];
    if (!ref) fail({ code: 'MISSING_REF', message: 'move needs a reference: typecad-pcb edit move U1 --to=25,10' }, json);
    const comp = findComponent(model, ref);
    if (!comp) {
      fail(
        {
          code: 'COMPONENT_NOT_FOUND',
          message: `Component '${ref}' not found in the built board.`,
          didYouMean: model.components
            .map((c) => c.reference)
            .filter((r) => r[0].toUpperCase() === ref[0].toUpperCase()),
        },
        json,
      );
    }
    const variable = requireVariable(comp!, json);

    const args = parsed.args;
    const toArg = typeof args['to'] === 'string' ? args['to'] : undefined;
    const relTargets = ['left-of', 'right-of', 'above', 'below'].filter((k) => typeof args[k] === 'string');
    if (!toArg && relTargets.length === 0) {
      fail(
        { code: 'NO_TARGET', message: 'move needs --to=x,y or one of --left-of/--right-of/--above/--below=REF.' },
        json,
      );
    }
    if (toArg && relTargets.length > 0) {
      fail({ code: 'CONFLICTING_TARGETS', message: 'Pass either --to or a relative target, not both.' }, json);
    }

    const pcbVar = findPcbVariable(source);
    let xExpr: string;
    let yExpr: string;
    let relLabel = '';

    if (toArg) {
      const xy = toArg.split(',').map((v) => parseFloat(v.trim()));
      if (xy.length !== 2 || xy.some((v) => !Number.isFinite(v))) {
        fail({ code: 'BAD_TO', message: `--to expects x,y numbers, got '${toArg}'.` }, json);
      }
      xExpr = String(xy[0]);
      yExpr = String(xy[1]);
    } else {
      if (!pcbVar) {
        fail(
          {
            code: 'NO_PCB_VAR',
            message: "Cannot find the 'new PCB(' assignment in the source; relative placement needs it.",
          },
          json,
        );
      }
      const key = relTargets[0];
      const targetRef = args[key] as string;
      const target = findComponent(model, targetRef);
      if (!target) {
        fail(
          {
            code: 'TARGET_NOT_FOUND',
            message: `Target component '${targetRef}' not found in the built board.`,
            didYouMean: model.components
              .map((c) => c.reference)
              .filter((r) => r[0].toUpperCase() === targetRef[0].toUpperCase()),
          },
          json,
        );
      }
      const targetVar = requireVariable(target!, json);
      const gap = typeof args['gap'] === 'string' ? parseFloat(args['gap']) : NaN;
      const gapSuffix = Number.isFinite(gap) ? `.by(${gap})` : '';
      relLabel = ` ${key.replace('-of', ' of')} ${target!.reference}`;
      if (key === 'right-of' || key === 'left-of') {
        xExpr = `${pcbVar}.board.${key === 'right-of' ? 'rightOf' : 'leftOf'}(${targetVar})${gapSuffix}`;
        yExpr = `${pcbVar}.board.sameAs(${targetVar})`;
      } else {
        yExpr = `${pcbVar}.board.${key}(${targetVar})${gapSuffix}`;
        xExpr = `${pcbVar}.board.sameAs(${targetVar})`;
      }
    }

    // Preserve existing rotation unless overridden
    let rotation: string | null = null;
    if (typeof args['rot'] === 'string') rotation = args['rot'];
    const existingLine = findAssignmentLine(lines, variable);
    if (rotation === null && existingLine !== -1) {
      const rotMatch = lines[existingLine].match(/rotation\s*:\s*(-?\d+(?:\.\d+)?)/);
      if (rotMatch) rotation = rotMatch[1];
    }
    const rotationSuffix = rotation !== null ? `, rotation: ${rotation}` : '';
    const code = `${variable}.pcb = { x: ${xExpr}, y: ${yExpr}${rotationSuffix} };`;

    let lineNumber: number;
    let action: 'updated' | 'created';
    if (existingLine !== -1) {
      const indentMatch = lines[existingLine].match(/^(\s*)/);
      lines[existingLine] = `${indentMatch ? indentMatch[1] : ''}${code}`;
      lineNumber = existingLine + 1;
      action = 'updated';
    } else {
      const { index, indent } = insertionIndexForNet(lines);
      lines.splice(index, 0, `${indent}${code}`);
      lineNumber = index + 1;
      action = 'created';
    }

    if (dryRun) {
      if (json)
        logger.log(
          JSON.stringify({ ok: true, dryRun: true, file: sourcePath, line: lineNumber, action, code }, null, 2),
        );
      else {
        logger.log(chalk.white.bold('Dry run — would write at ') + `${sourcePath}:${lineNumber}`);
        logger.log(chalk.green(`+ ${code}`));
      }
      return;
    }
    fs.writeFileSync(sourcePath, lines.join('\n'), 'utf8');
    if (json) logger.log(JSON.stringify({ ok: true, file: sourcePath, line: lineNumber, action, code }, null, 2));
    else {
      logger.log(chalk.green(`✓ moved ${comp!.reference}${relLabel}`));
      logger.log(chalk.gray(`  ${sourcePath}:${lineNumber}  ${code}`));
    }
    return;
  }

  if (op === 'route') {
    const endpoints = parsed.positional.filter((p) => !p.endsWith('.kicad_pcb'));
    if (endpoints.length !== 2) {
      fail(
        {
          code: 'ROUTE_NEEDS_TWO_PINS',
          message: 'route needs exactly two pins: typecad-pcb edit route U1.3 R1.1 [--width=0.25] [--layers=F.Cu,B.Cu]',
        },
        json,
      );
    }
    const from = parseEndpoint(endpoints[0], model, json);
    const to = parseEndpoint(endpoints[1], model, json);
    if (from.kind !== 'pin' || to.kind !== 'pin') {
      fail(
        {
          code: 'ROUTE_PINS_ONLY',
          message: 'route endpoints must be pins (REF.PAD). Net names are for `edit connect`; route draws the copper.',
        },
        json,
      );
    }

    const pcbVar = findPcbVariable(source) ?? 'typecad';
    const args = parsed.args;
    const options: string[] = [];
    const width = args['width'];
    if (typeof width === 'string' && width !== '') options.push(`width: ${parseFloat(width)}`);
    const layers = args['layers'];
    if (typeof layers === 'string' && layers !== '') {
      const layerList = layers
        .split(',')
        .map((l) => `'${l.trim()}'`)
        .join(', ');
      options.push(`layers: [${layerList}]`);
    }
    const inner = [
      `from: ${requireVariable(from.comp, json)}.pin(${pinLiteral(from.pad)})`,
      `to: ${requireVariable(to.comp, json)}.pin(${pinLiteral(to.pad)})`,
      ...options,
    ].join(', ');
    const code = `${pcbVar}.route({ ${inner} });`;

    const { index, indent } = insertionIndexForRoute(lines);
    lines.splice(index, 0, `${indent}${code}`);
    const lineNumber = index + 1;

    if (dryRun) {
      if (json)
        logger.log(JSON.stringify({ ok: true, dryRun: true, file: sourcePath, line: lineNumber, code }, null, 2));
      else {
        logger.log(chalk.white.bold('Dry run — would insert at ') + `${sourcePath}:${lineNumber}`);
        logger.log(chalk.green(`+ ${code}`));
      }
      return;
    }
    fs.writeFileSync(sourcePath, lines.join('\n'), 'utf8');
    if (json) logger.log(JSON.stringify({ ok: true, file: sourcePath, line: lineNumber, code }, null, 2));
    else {
      logger.log(chalk.green(`✓ routed ${from.comp.reference}.${from.pad} ↔ ${to.comp.reference}.${to.pad}`));
      logger.log(chalk.gray(`  ${sourcePath}:${lineNumber}  ${code}`));
    }
    return;
  }

  fail({ code: 'UNKNOWN_OP', message: `Unknown edit operation '${op}'. Use 'connect', 'move', or 'route'.` }, json);
}
