#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'module';
import { generateDiffs } from '../core/diff-generator.js';
import { KiCAD } from '@typecad/typecad';
import { openInBrowser } from '../utils/open.js';
import createSpinner from '../utils/spinner.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function isGitRef(arg: string): boolean {
    return !arg.endsWith('.kicad_pcb') && !arg.startsWith('-') && !arg.includes('\\') && !arg.includes('/');
}

async function resolveGitFile(rev: string, filePath: string): Promise<string> {
    const outPath = path.join(tmpdir(), `typecad-gitdiff-${crypto.randomUUID()}-${path.basename(filePath)}`);
    try {
        const result = await execFileAsync('git', ['show', `${rev}:${filePath}`], { maxBuffer: 50 * 1024 * 1024 });
        fs.writeFileSync(outPath, result.stdout);
        return outPath;
    } catch {
        console.error(`Error: unable to resolve git revision "${rev}" for file "${filePath}"`);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
let fullMode = false;
let theme: string | undefined;
let outputHtmlPath: string | undefined;
let originalFile = '';
let modifiedFile = '';
let isGitRevisionMode = false;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--full') {
        fullMode = true;
    } else if (arg === '--theme') {
        if (i + 1 < args.length) { theme = args[++i]; }
        else { console.error("Error: --theme requires a theme name"); process.exit(1); }
    } else if (arg === '--output') {
        if (i + 1 < args.length) { outputHtmlPath = args[++i]; }
        else { console.error("Error: --output requires a file path"); process.exit(1); }
    } else if (arg === '--help' || arg === '-h') {
        console.log("");
        console.log(`typeCAD GitDiff - Visual PCB Comparison Tool v${pkg.version}`);
        console.log("");
        console.log("Usage:");
        console.log("   typecad-gitdiff [options] <original.kicad_pcb> <modified.kicad_pcb>");
        console.log("   typecad-gitdiff [options] <rev1> <rev2> [--] <file.kicad_pcb>");
        console.log("");
        console.log("Options:");
        console.log("   --full              Process all layers including User layers");
        console.log("   --theme <name>      Theme for SVG export (e.g. \"Monokai\")");
        console.log("   --output <path>     Output HTML file path");
        console.log("   --help, -h          Show this help message");
        console.log("   --version, -v       Show version information");
        console.log("");
        console.log("Git Revision Comparison:");
        console.log("   typecad-gitdiff HEAD~1 HEAD -- board.kicad_pcb");
        console.log("   typecad-gitdiff main feature-branch -- board.kicad_pcb");
        console.log("");
        console.log("Examples:");
        console.log("   typecad-gitdiff board_v1.kicad_pcb board_v2.kicad_pcb");
        console.log("   typecad-gitdiff HEAD~1 HEAD -- board.kicad_pcb");
        console.log('   typecad-gitdiff --theme "typeCAD-dark" --output report.html \\');
        console.log("                   old.kicad_pcb new.kicad_pcb");
        console.log("");
        process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
        console.log(`typeCAD-gitdiff v${pkg.version}`);
        process.exit(0);
    } else if (arg === '--') {
        continue;
    } else if (!originalFile) {
        originalFile = arg;
    } else if (!modifiedFile) {
        modifiedFile = arg;
    }
}

if (!originalFile || !modifiedFile) {
    console.error("Usage: typecad-gitdiff [options] <original.kicad_pcb> <modified.kicad_pcb>");
    console.log("Use --help for more information");
    process.exit(1);
}

if (!originalFile.endsWith('.kicad_pcb') && !modifiedFile.endsWith('.kicad_pcb')) {
    isGitRevisionMode = true;
}

(async () => {
    console.log("");
    console.log(`typeCAD GitDiff - Visual PCB Comparison Tool v${pkg.version}`);
    console.log("");

    if (isGitRevisionMode) {
        const pcbFile = args[args.length - 1];
        if (!pcbFile.endsWith('.kicad_pcb')) {
            console.error("Error: git revision mode requires a .kicad_pcb file path");
            process.exit(1);
        }
        console.log("Git Revision Mode:");
        console.log(`   File:  ${pcbFile}`);
        console.log(`   From:  ${originalFile}`);
        console.log(`   To:    ${modifiedFile}`);
        console.log("");

        const spinner1 = createSpinner({ text: `extracting ${originalFile} from git...` }).start();
        originalFile = await resolveGitFile(originalFile, pcbFile);
        spinner1.success();

        const spinner2 = createSpinner({ text: `extracting ${modifiedFile} from git...` }).start();
        modifiedFile = await resolveGitFile(modifiedFile, pcbFile);
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
        new KiCAD();

        const htmlFilePath = await generateDiffs({
            originalFile,
            modifiedFile,
            fullMode,
            theme,
            outputHtmlPath,
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
        process.exit(1);
    }
})();
