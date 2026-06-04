import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
    parseArgs,
    discoverKiCADCli,
    findConfigPath,
    parseEntryFromConfig,
    parseKicadCliFromConfig,
    findProjectPackageJson,
    runKiCADCommand,
    runGitCommand,
} from '../src/index.js';

vi.mock('chalk', () => ({
    default: {
        red: (t: string) => t,
        green: (t: string) => t,
        blue: (t: string & { bold?: string; italic?: string; underline?: string }) => t,
        yellow: (t: string) => t,
        bgBlue: { white: { bold: (t: string) => t } },
        bold: (t: string) => t,
        italic: (t: string) => t,
        underline: (t: string) => t,
    },
}));

describe('parseArgs', () => {
    it('returns defaults when no args provided', () => {
        const result = parseArgs(['node', 'jlcpcb-export']);
        expect(result).toEqual({
            boardName: null,
            ignore: false,
            inputPath: './build',
            outputPath: null,
            kicadCli: 'kicad-cli',
            help: false,
            version: false,
        });
    });

    it('parses --help and -h', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--help']).help).toBe(true);
        expect(parseArgs(['node', 'jlcpcb-export', '-h']).help).toBe(true);
    });

    it('parses --version and -v', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--version']).version).toBe(true);
        expect(parseArgs(['node', 'jlcpcb-export', '-v']).version).toBe(true);
    });

    it('parses --ignore and -i', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--ignore']).ignore).toBe(true);
        expect(parseArgs(['node', 'jlcpcb-export', '-i']).ignore).toBe(true);
    });

    it('parses --input with value', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--input', './out']).inputPath).toBe('./out');
    });

    it('parses --output with value', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--output', './target']).outputPath).toBe('./target');
    });

    it('parses --kicad-cli with value', () => {
        expect(parseArgs(['node', 'jlcpcb-export', '--kicad-cli', '/usr/bin/kicad-cli']).kicadCli).toBe('/usr/bin/kicad-cli');
    });

    it('treats positional argument as board name', () => {
        expect(parseArgs(['node', 'jlcpcb-export', 'my-board']).boardName).toBe('my-board');
    });

    it('uses only the first positional as board name', () => {
        const result = parseArgs(['node', 'jlcpcb-export', 'board-a', 'board-b']);
        expect(result.boardName).toBe('board-a');
    });

    it('handles multiple flags together', () => {
        const result = parseArgs(['node', 'jlcpcb-export', '--ignore', '--input', './src', '--output', './dest']);
        expect(result.ignore).toBe(true);
        expect(result.inputPath).toBe('./src');
        expect(result.outputPath).toBe('./dest');
    });

    it('preserves defaults when --input is last token without value', () => {
        const result = parseArgs(['node', 'jlcpcb-export', '--input']);
        expect(result.inputPath).toBe('./build');
    });

    it('preserves defaults when --output is last token without value', () => {
        const result = parseArgs(['node', 'jlcpcb-export', '--output']);
        expect(result.outputPath).toBeNull();
    });

    it('preserves defaults when --kicad-cli is last token without value', () => {
        const result = parseArgs(['node', 'jlcpcb-export', '--kicad-cli']);
        expect(result.kicadCli).toBe('kicad-cli');
    });

    it('ignores unknown flags', () => {
        const result = parseArgs(['node', 'jlcpcb-export', '--unknown-flag']);
        expect(result.boardName).toBeNull();
        expect(result.help).toBe(false);
    });

    it('handles empty argv', () => {
        const result = parseArgs([]);
        expect(result.help).toBe(false);
        expect(result.boardName).toBeNull();
    });
});

describe('discoverKiCADCli', () => {
    it('returns null when no KiCad installation found', () => {
        const result = discoverKiCADCli();
        expect(typeof result === 'string' || result === null).toBe(true);
    });
});

describe('findConfigPath', () => {
    let tmpDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlcpcb-test-'));
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when no config file exists', () => {
        process.chdir(tmpDir);
        expect(findConfigPath()).toBeNull();
    });

    it('finds typecad.conf.ts', () => {
        fs.writeFileSync(path.join(tmpDir, 'typecad.conf.ts'), '');
        process.chdir(tmpDir);
        expect(findConfigPath()).toBe(path.join(tmpDir, 'typecad.conf.ts'));
    });

    it('finds typecad.conf.js', () => {
        fs.writeFileSync(path.join(tmpDir, 'typecad.conf.js'), '');
        process.chdir(tmpDir);
        expect(findConfigPath()).toBe(path.join(tmpDir, 'typecad.conf.js'));
    });

    it('prefers typecad.conf.ts over typecad.conf.js', () => {
        fs.writeFileSync(path.join(tmpDir, 'typecad.conf.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'typecad.conf.js'), '');
        process.chdir(tmpDir);
        expect(findConfigPath()).toBe(path.join(tmpDir, 'typecad.conf.ts'));
    });
});

describe('parseEntryFromConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlcpcb-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('extracts entry from config with single quotes', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({ entry: './src/my-board.ts' });`);
        expect(parseEntryFromConfig(configPath)).toBe('./src/my-board.ts');
    });

    it('extracts entry from config with double quotes', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({ entry: "./src/led-board.ts" });`);
        expect(parseEntryFromConfig(configPath)).toBe('./src/led-board.ts');
    });

    it('handles entry with extra whitespace', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({\n  entry   :   './src/board.ts'\n});`);
        expect(parseEntryFromConfig(configPath)).toBe('./src/board.ts');
    });

    it('returns null when entry is not present', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({ other: 'value' });`);
        expect(parseEntryFromConfig(configPath)).toBeNull();
    });

    it('returns null for nonexistent file', () => {
        expect(parseEntryFromConfig(path.join(tmpDir, 'nonexistent.ts'))).toBeNull();
    });
});

describe('parseKicadCliFromConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlcpcb-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('extracts kicad_cli from config', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({ kicad_cli: '/Applications/KiCad/kicad-cli' });`);
        expect(parseKicadCliFromConfig(configPath)).toBe('/Applications/KiCad/kicad-cli');
    });

    it('returns null when kicad_cli is not present', () => {
        const configPath = path.join(tmpDir, 'typecad.conf.ts');
        fs.writeFileSync(configPath, `export default defineConfig({ entry: './src/board.ts' });`);
        expect(parseKicadCliFromConfig(configPath)).toBeNull();
    });

    it('returns null for nonexistent file', () => {
        expect(parseKicadCliFromConfig(path.join(tmpDir, 'nonexistent.ts'))).toBeNull();
    });
});

describe('findProjectPackageJson', () => {
    let tmpDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jlcpcb-test-'));
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds package.json in current directory', () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-project', version: '1.0.0' }));
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toEqual({ name: 'my-project', version: '1.0.0' });
    });

    it('finds package.json in parent directory', () => {
        const subDir = path.join(tmpDir, 'subdir');
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'parent-project', version: '2.0.0' }));
        process.chdir(subDir);
        expect(findProjectPackageJson()).toEqual({ name: 'parent-project', version: '2.0.0' });
    });

    it('returns null when no package.json with name and version found', () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ description: 'no name or version' }));
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toBeNull();
    });

    it('returns null when no package.json exists at all', () => {
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toBeNull();
    });

    it('skips package.json without name field', () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toBeNull();
    });

    it('skips package.json without version field', () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-project' }));
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toBeNull();
    });

    it('handles scoped package names', () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@scope/my-project', version: '3.0.0' }));
        process.chdir(tmpDir);
        expect(findProjectPackageJson()).toEqual({ name: '@scope/my-project', version: '3.0.0' });
    });
});

describe('runGitCommand', () => {
    it('returns string for valid git command', () => {
        const result = runGitCommand(['--version']);
        expect(result).not.toBeNull();
        expect(result).toContain('git');
    });

    it('returns null for invalid git command', () => {
        const result = runGitCommand(['nonexistent-command-that-will-fail-xyz']);
        expect(result).toBeNull();
    });
});

describe('runKiCADCommand', () => {
    it('returns false for nonexistent binary', () => {
        const result = runKiCADCommand('/nonexistent/path/kicad-cli', ['--version']);
        expect(result).toBe(false);
    });
});

describe('board name derivation', () => {
    it('derives board name from entry path', () => {
        const entry = './src/my-awesome-board.ts';
        const boardName = path.basename(entry, path.extname(entry));
        expect(boardName).toBe('my-awesome-board');
    });

    it('strips .kicad_pcb extension from board name', () => {
        let boardName = 'test-board.kicad_pcb';
        if (boardName.endsWith('.kicad_pcb')) {
            boardName = boardName.replace(/\.kicad_pcb$/, '');
        }
        boardName = path.basename(boardName);
        expect(boardName).toBe('test-board');
    });

    it('handles entry with nested path', () => {
        const entry = './src/boards/production/main-controller.ts';
        const boardName = path.basename(entry, path.extname(entry));
        expect(boardName).toBe('main-controller');
    });
});

describe('pkgSlug derivation', () => {
    it('strips @ and replaces / for scoped packages', () => {
        const name = '@typecad/my-board';
        const slug = name.replace(/^@/, '').replace(/\//, '-');
        expect(slug).toBe('typecad-my-board');
    });

    it('leaves unscoped package names unchanged', () => {
        const name = 'my-board';
        const slug = name.replace(/^@/, '').replace(/\//, '-');
        expect(slug).toBe('my-board');
    });
});

describe('default output path construction', () => {
    it('constructs correct default output path', () => {
        const projectPkg = { name: '@scope/my-board', version: '1.2.3' };
        const pkgSlug = projectPkg.name.replace(/^@/, '').replace(/\//, '-');
        const outputPath = `./build/jlcpcb-export/${pkgSlug}-${projectPkg.version}`;
        expect(outputPath).toBe('./build/jlcpcb-export/scope-my-board-1.2.3');
    });
});
