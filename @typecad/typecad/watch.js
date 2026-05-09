import { watch, readdirSync, existsSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, basename } from 'path';
import * as ts from 'typescript';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import JavaScriptObfuscator from 'javascript-obfuscator';

const execAsync = promisify(exec);

// Load obfuscator config from the shared config file instead of duplicating it here.
const __dirname = dirname(fileURLToPath(import.meta.url));
const obfuscatorOptions = JSON.parse(readFileSync(`${__dirname}/obfuscator.strong.config.json`, 'utf8'));

/**
 * Recursively list all .ts files in a directory.
 */
function listTsFiles(dir) {
    const result = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = current + '/' + entry.name;
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.name.endsWith('.ts')) {
                result.push(fullPath);
            }
        }
    }
    return result;
}

/**
 * Dynamically resolve the list of TypeScript source files from tsconfig.json.
 * Falls back to a static list if tsconfig.json can't be parsed.
 */
function loadFilesToWatch() {
    const tsconfigPath = 'tsconfig.json';
    if (!existsSync(tsconfigPath)) {
        console.warn('tsconfig.json not found, using static file list');
        return getStaticFileList();
    }
    try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
        const includeGlobs = tsconfig.include || ['src/**/*.ts'];
        const excludeGlobs = tsconfig.exclude || [];
        const files = [];
        for (const pattern of includeGlobs) {
            if (pattern.endsWith('/**/*.ts')) {
                const dir = pattern.replace('/**/*.ts', '');
                files.push(...listTsFiles(dir));
            } else {
                files.push(pattern);
            }
        }
        const filtered = files.filter(f => {
            return !excludeGlobs.some(ex => f.startsWith(ex) || f.includes(ex));
        });
        return filtered.length > 0 ? filtered : getStaticFileList();
    } catch {
        console.warn('Failed to parse tsconfig.json, using static file list');
        return getStaticFileList();
    }
}

/** Static fallback file list */
function getStaticFileList() {
    return [
        'src/index.ts',
        'src/component.ts',
        'src/pcb/pcb.ts',
        'src/pcb/pcb_track_builder.ts',
        'src/pcb/pcb_interfaces.ts',
        'src/pcb/pcb_utils.ts',
        'src/pcb/pcb_layer_utils.ts',
        'src/pcb/pcb_graphics.ts',
        'src/pcb/pcb_zones.ts',
        'src/pcb/pcb_routing_calculations.ts',
        'src/pcb/pcb_routing_helpers.ts',
        'src/pcb/pcb_routing_core.ts',
        'src/pcb/pcb_board_creation.ts',
        'src/pcb/pcb_autoroute.ts',
        'src/pcb/pcb_kicad_window.ts',
        'src/schematic.ts',
        'src/buses.ts',
        'src/config.ts',
        'src/erc.ts',
        'src/kicad.ts',
        'src/pin.ts',
        'src/reference_counter.ts'
    ];
}

const filesToWatch = loadFilesToWatch();

// Debounce timers for each file
const debounceTimers = new Map();
const DEBOUNCE_DELAY = 500;

console.log(chalk.blue('🔍 Watching files for changes...'));
console.log(chalk.gray('Watching:'));
filesToWatch.forEach(file => console.log(chalk.gray(`  - ${file}`)));

async function compileFile(file) {
  const tsApi = ts.default;

  const program = tsApi.createProgram([file], {
    target: tsApi.ScriptTarget.ES2021,
    module: tsApi.ModuleKind.ES2020,
    moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    outDir: 'dist',
    declaration: true
  });

  const emitResult = program.emit();
  const diagnostics = tsApi.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    throw new Error(tsApi.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: fileName => fileName,
      getNewLine: () => tsApi.sys.newLine
    }));
  }
}

async function obfuscateFile(file) {
  const fileName = basename(file, '.ts');
  const inputPath = `dist/${fileName}.js`;

  const code = await readFile(inputPath, 'utf8');
  const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);

  await writeFile(inputPath, obfuscatedCode.getObfuscatedCode());
}

async function rebuild(file) {
  console.log(chalk.yellow(`\n🔄 Changes detected in ${file}`));
  console.log(chalk.gray('Building and obfuscating...'));

  const startTime = Date.now();
  
  try {
    await compileFile(file);
    await obfuscateFile(file);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(chalk.green(`✅ Build completed in ${duration}ms`));
    console.log(chalk.gray('Watching for changes...'));
  } catch (error) {
    console.error(chalk.red('❌ Build failed:'));
    console.error(error.message);
  }
}

function debouncedRebuild(file) {
  if (debounceTimers.has(file)) {
    clearTimeout(debounceTimers.get(file));
  }

  const timer = setTimeout(() => {
    rebuild(file);
    debounceTimers.delete(file);
  }, DEBOUNCE_DELAY);

  debounceTimers.set(file, timer);
}

// Initial build
console.log(chalk.blue('🏗️  Running initial build...'));
Promise.all(filesToWatch.map(compileFile))
  .then(() => console.log(chalk.green('✅ Initial build completed')))
  .catch(error => {
    console.error(chalk.red('❌ Initial build failed:'));
    console.error(error.message);
  });

filesToWatch.forEach(file => {
  watch(file, (eventType) => {
    if (eventType === 'change') {
      debouncedRebuild(file);
    }
  });
});
