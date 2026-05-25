import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { KiCAD, kicad_cli_path } from '../../../kicad.js';
import { generateDiffs } from '../../../gitdiff/core/diff-generator.js';
import { openInBrowser } from '../../../gitdiff/utils/open.js';
import createSpinner from '../../../gitdiff/utils/spinner.js';
import type { ParsedArgs } from '../parser.js';

const execFileAsync = promisify(execFile);

function isGitRef(arg: string): boolean {
    return !arg.endsWith('.kicad_pcb') && !arg.startsWith('-') && !arg.includes('\\') && !arg.includes('/');
}

let gitTempFiles: string[] = [];
let cachedRepoRoot: string | null = null;

async function getGitRepoRoot(): Promise<string> {
    if (cachedRepoRoot !== null) return cachedRepoRoot;
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
        cachedRepoRoot = stdout.trim();
        return cachedRepoRoot;
    } catch {
        console.error('Error: not inside a git repository');
        process.exit(1);
    }
}

function toGitPath(localPath: string, repoRoot: string): string {
    const absolute = path.resolve(localPath);
    const relative = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    return relative;
}

async function resolveGitFile(rev: string, localPath: string): Promise<string> {
    const repoRoot = await getGitRepoRoot();
    const gitPath = toGitPath(localPath, repoRoot);
    const outPath = path.join(tmpdir(), `typecad-gitdiff-${crypto.randomUUID()}-${path.basename(localPath)}`);
    try {
        const result = await execFileAsync('git', ['show', `${rev}:${gitPath}`], { maxBuffer: 50 * 1024 * 1024 });
        fs.writeFileSync(outPath, result.stdout);
        gitTempFiles.push(outPath);
        return outPath;
    } catch {
        console.error(`Error: unable to resolve git revision "${rev}" for file "${gitPath}"`);
        process.exit(1);
    }
}

function cleanupGitTempFiles(): void {
    for (const f of gitTempFiles) {
        try { fs.unlinkSync(f); } catch {}
    }
    gitTempFiles = [];
}

export async function run(parsed: ParsedArgs): Promise<void> {
    const positional = parsed.positional;
    let fullMode = parsed.args['full'] === true;
    let theme: string | undefined;
    let outputHtmlPath: string | undefined;

    if (typeof parsed.args['theme'] === 'string') {
        theme = parsed.args['theme'];
    }
    if (typeof parsed.args['output'] === 'string') {
        outputHtmlPath = parsed.args['output'];
    }

    let originalFile = '';
    let modifiedFile = '';
    let isGitRevisionMode = false;
    let isGitVsFileMode = false;

    const nonDashArgs = positional.filter(a => a !== '--');

    if (nonDashArgs.length === 2) {
        const first = nonDashArgs[0];
        const second = nonDashArgs[1];

        if (isGitRef(first) && second.endsWith('.kicad_pcb')) {
            isGitVsFileMode = true;
            originalFile = first;
            modifiedFile = second;
        } else {
            originalFile = first;
            modifiedFile = second;
        }
    } else if (nonDashArgs.length >= 3) {
        originalFile = nonDashArgs[0];
        modifiedFile = nonDashArgs[1];
        const pcbFile = nonDashArgs[nonDashArgs.length - 1];

        if (!originalFile.endsWith('.kicad_pcb') && !modifiedFile.endsWith('.kicad_pcb')) {
            isGitRevisionMode = true;
        }
    }

    if (!originalFile || !modifiedFile) {
        console.error("Usage: typecad diff [options] <original.kicad_pcb> <modified.kicad_pcb>");
        console.error("       typecad diff [options] <rev> <file.kicad_pcb>");
        console.error("       typecad diff [options] <rev1> <rev2> [--] <file.kicad_pcb>");
        console.log("Use 'typecad diff --help' for more information");
        process.exit(1);
    }

    console.log("");
    console.log("typeCAD GitDiff - Visual PCB Comparison Tool");
    console.log("");

    if (isGitVsFileMode) {
        if (!fs.existsSync(modifiedFile)) {
            console.error(`Error: file not found: ${modifiedFile}`);
            process.exit(1);
        }
        console.log("Git vs File Mode:");
        console.log(`   Original:  ${originalFile} (git)`);
        console.log(`   Modified:  ${modifiedFile} (working tree)`);
        console.log("");

        const spinner1 = createSpinner({ text: `extracting ${originalFile} from git...` }).start();
        originalFile = await resolveGitFile(originalFile, modifiedFile);
        spinner1.success();
    } else if (isGitRevisionMode) {
        const pcbFile = nonDashArgs[nonDashArgs.length - 1];
        if (!pcbFile.endsWith('.kicad_pcb')) {
            console.error("Error: git revision mode requires a .kicad_pcb file path");
            process.exit(1);
        }
        console.log("Git Revision Mode:");
        console.log(`   File:  ${pcbFile}`);
        console.log(`   From:  ${originalFile}`);
        console.log(`   To:    ${modifiedFile}`);
        console.log("");

        const absPcbFile = path.resolve(pcbFile);

        const spinner1 = createSpinner({ text: `extracting ${originalFile} from git...` }).start();
        originalFile = await resolveGitFile(originalFile, absPcbFile);
        spinner1.success();

        const spinner2 = createSpinner({ text: `extracting ${modifiedFile} from git...` }).start();
        modifiedFile = await resolveGitFile(modifiedFile, absPcbFile);
        spinner2.success();
    } else {
        for (const f of [originalFile, modifiedFile]) {
            if (!fs.existsSync(f)) {
                console.error(`Error: file not found: ${f}`);
                process.exit(1);
            }
        }

        console.log("Analyzing PCB files:");
        console.log(`   Original:  ${originalFile}`);
        console.log(`   Modified:  ${modifiedFile}`);
        console.log("");
    }

    console.log("Configuration:");
    if (fullMode) console.log("   Processing mode: Full (all layers including User layers)");
    else console.log("   Processing mode: Standard");
    if (theme) console.log(`   Theme: ${theme}`);
    if (outputHtmlPath) console.log(`   Output: ${outputHtmlPath}`);
    console.log("");

    const spinner = createSpinner({ text: 'processing files...' }).start();
    try {
        const kicad = new KiCAD();
        const resolvedCliPath = kicad_cli_path;

        const htmlFilePath = await generateDiffs({
            originalFile,
            modifiedFile,
            fullMode,
            theme,
            outputHtmlPath,
            kicadCliPath: resolvedCliPath,
        });

        await openInBrowser(htmlFilePath);

        spinner.success('Processing complete!');
        console.log("");
        console.log("Success! Visual diff report generated");
        console.log(`Report location: ${htmlFilePath}`);
        console.log("Opening in your default browser...");
    } catch (error) {
        spinner.error('Processing failed');
        console.log("");
        console.error(`   ${error}`);
        console.log("");
        console.log("Troubleshooting tips:");
        console.log("   - Ensure both PCB files exist and are valid KiCAD files");
        console.log("   - Check that KiCAD CLI is properly installed");
        console.log("   - For git revisions, ensure you're inside a git repository");
        cleanupGitTempFiles();
        process.exit(1);
    }
    cleanupGitTempFiles();
}
