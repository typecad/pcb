#!/usr/bin/env node

import { kicadDataToTypeCAD } from './cli.js';

const args = process.argv.slice(2);
const filePathArg = args[0];

if (filePathArg && filePathArg.trim() !== "") {
    kicadDataToTypeCAD(filePathArg).catch((err: unknown) => {
        console.error(err);
        process.exit(1);
    });
} else {
    console.log("No KiCad file path provided. Please provide a file path as a command line argument.");
    console.log("Usage: npx kicad2typecad <path_to_kicad_pcb_file>");
    console.log("");
    console.log("Notes:");
    console.log("- Variable names are sourced from each footprint's 'Code' property.");
    console.log("- If missing, the KiCad reference is used (e.g., U1, R3).");
}
