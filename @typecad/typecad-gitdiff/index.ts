#!/usr/bin/env tsx
/**
 * typecad-gitdiff - A tool for comparing KiCAD PCB files
 * Main entry point
 */

import open from 'open';
import yoctoSpinner from 'yocto-spinner';
import { KiCAD } from '@typecad/typecad';
import { generateDiffs } from './src/core/diff-generator.js';

/**
 * Main application function
 */
(async () => {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let fullMode = false;
    let theme: string | undefined = undefined;
    let colorModified: string | undefined = undefined;
    let colorNew: string | undefined = undefined;
    let originalFile = '';
    let modifiedFile = '';

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--full') {
            fullMode = true;
        } else if (arg === '--theme') {
            if (i + 1 < args.length) {
                theme = args[i + 1];
                i++; // Skip the next argument since we consumed it
            } else {
                console.error("Error: --theme requires a theme name");
                process.exit(1);
            }
        } else if (arg === '--color-modified') {
            if (i + 1 < args.length) {
                colorModified = args[i + 1];
                i++; // Skip the next argument since we consumed it
            } else {
                console.error("Error: --color-modified requires a hex color (e.g., #ff6600)");
                process.exit(1);
            }
        } else if (arg === '--color-new') {
            if (i + 1 < args.length) {
                colorNew = args[i + 1];
                i++; // Skip the next argument since we consumed it
            } else {
                console.error("Error: --color-new requires a hex color (e.g., #4caf50)");
                process.exit(1);
            }
        } else if (arg === '--help' || arg === '-h') {
            console.log("");
            console.log("🔃 typeCAD GitDiff - Visual PCB Comparison Tool v1.0.6");
            console.log("");
            console.log("Visit https://typecad.net/ for more information about schematic-as-code");
            console.log("");
            console.log("📖 Usage:");
            console.log("   typecad-gitdiff [options] <original.kicad_pcb> <modified.kicad_pcb>");
            console.log("");
            console.log("⚙️  Options:");
            console.log("   --full              🔧 Process all layers including User layers");
            console.log("                          (User.1, User.2, etc.)");
            console.log("                          Default: false (standard PCB layers only)");
            console.log("");
            console.log("   --theme <name>      🎨 Specify theme for SVG export");
            console.log("                          Examples: \"typeCAD-dark\", \"typeCAD-light\"");
            console.log("");
            console.log("   --color-modified    🟠 Color for modified features (hex format)");
            console.log("                          Example: #ff6600");
            console.log("                          Default: #ff6600 (orange)");
            console.log("");
            console.log("   --color-new         🟢 Color for new features (hex format)");
            console.log("                          Example: #4caf50");
            console.log("                          Default: #4caf50 (green)");
            console.log("");
            console.log("   --help, -h          📚 Show this help message");
            console.log("   --version, -v       📦 Show version information");
            console.log("");
            console.log("💡 Examples:");
            console.log("   typecad-gitdiff board1.kicad_pcb board2.kicad_pcb");
            console.log("   typecad-gitdiff --full board1.kicad_pcb board2.kicad_pcb");
            console.log("   typecad-gitdiff --theme \"typeCAD-light\" board1.kicad_pcb board2.kicad_pcb");
            console.log("   typecad-gitdiff --color-modified \"#ff0000\" --color-new \"#00ff00\" \\");
            console.log("                   board1.kicad_pcb board2.kicad_pcb");
            console.log("");
            console.log("🔗 For more information and documentation:");
            console.log("   https://typecad.net/");
            console.log("");
            process.exit(0);
        } else if (arg === '--version' || arg === '-v') {
            process.exit(0);
        } else if (!originalFile) {
            originalFile = arg;
        } else if (!modifiedFile) {
            modifiedFile = arg;
        }
    }

    if (!originalFile || !modifiedFile) {
        console.error("❌ Usage: typecad-gitdiff [options] <original.kicad_pcb> <modified.kicad_pcb>");
        console.log("💡 Use --help for more information");
        console.log("📦 typeCAD-gitdiff version 1.0.6");
        process.exit(1);
    }

    // Display banner and startup information
    console.log("");
    console.log("🔃 typeCAD GitDiff - Visual PCB Comparison Tool v1.0.6");
    console.log("");
    console.log("Visit https://typecad.net/ for more information about schematic-as-code");
    console.log("");

    console.log("🔍 Analyzing PCB files:");
    console.log(`   📄 Original:  ${originalFile}`);
    console.log(`   📄 Modified:  ${modifiedFile}`);
    console.log("");

    console.log("⚙️  Configuration:");
    if (fullMode) {
        console.log("   🔧 Processing mode: Full (all layers including User layers)");
    } else {
        console.log("   🔧 Processing mode: Standard (User layers excluded)");
        console.log("   💡 Use --full flag to include User layers");
    }
    if (theme) {
        console.log(`   🎨 Theme: ${theme}`);
    }
    if (colorModified || colorNew) {
        console.log("   🌈 Custom colors:");
        if (colorModified) console.log(`      Modified: ${colorModified}`);
        if (colorNew) console.log(`      New: ${colorNew}`);
    }
    console.log("");

    const spinner = yoctoSpinner({ text: 'processing files...', color: 'green' }).start();
    try {
        // Initialize KiCAD
        new KiCAD();

        // Generate diffs between the two PCB files
        const htmlFilePath = await generateDiffs({
            originalFile,
            modifiedFile,
            fullMode,
            theme,
            colorModified,
            colorNew
        });

        // Open the HTML file in the default browser
        await open(htmlFilePath);

        spinner.success('Processing complete!');
        console.log("");
        console.log("✅ Success! Visual diff report generated");
        console.log(`📊 Report location: ${htmlFilePath}`);
        console.log("🌐 Opening in your default browser...");
        console.log("");
        console.log("💡 Tip: Bookmark the report file to review changes later");
        console.log("🔗 Learn more about typeCAD at https://typecad.net/");
    } catch (error) {
        spinner.error('Processing failed');
        console.log("");
        console.log("❌ Error occurred during processing:");
        console.error(`   ${error}`);
        console.log("");
        console.log("🔧 Troubleshooting tips:");
        console.log("   • Ensure both PCB files exist and are valid KiCAD files");
        console.log("   • Check that KiCAD CLI is properly installed and accessible");
        console.log("   • Verify file permissions for reading the PCB files");
        console.log("");
        console.log("🆘 Need help? Visit https://typecad.net/ for support");
        process.exit(1);
    }
})();