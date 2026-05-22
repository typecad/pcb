import fs from "node:fs";
import { parse, prettyPrint, Sym } from './sexpr/index.js';
import type { SExpr } from './sexpr/types.js';
import { KiCAD } from "./kicad.js";
import { ComponentError } from "./errors.js";
import logger from "./logging.js";
import { executeKiCADCommandSync } from "./kicad_commands.js";
import { LIBRARY_SEPARATOR } from './constants.js';

export function loadFootprintLib(
    footprint: string,
    reference: string,
    value: string,
    cachedContent: string | undefined
): string {
    if (cachedContent && cachedContent !== '') return cachedContent;

    let footprint_file_contents = "";
    const footprint_file_name = footprint.split(LIBRARY_SEPARATOR);
    let kicad_footprint: string = '';

    const kicad = KiCAD.instance;
    const libraryPaths = kicad.getLibraryPaths();
    kicad_footprint = libraryPaths.footprints;

    try {
        if (kicad_footprint && fs.existsSync(`${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`)) {
            footprint_file_contents = fs.readFileSync(
                `${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`,
                "utf8"
            );
        } else {
            try {
                executeKiCADCommandSync('fp', ['upgrade', '--output', './build/lib/footprints/', './build/lib/footprints/'], { stdio: 'ignore' });
            } catch (e) {
                if (process.env.TYPECAD_DEBUG === '1') {
                    logger.warn('[typeCAD] Footprint upgrade failed:', e instanceof Error ? e.message : String(e));
                }
            }

            const buildFootprintPath = `./build/lib/footprints/${footprint_file_name[1]}.kicad_mod`;
            if (!fs.existsSync(buildFootprintPath)) {
                throw new ComponentError(`Footprint file not found: ${buildFootprintPath}. Is the .kicad_mod missing or empty in build/footprints/? Footprint must be in format "library:footprint" (e.g., "Resistor_SMD:R_0603_1608Metric" or "lib:Local_Footprint")`);
            }

            footprint_file_contents = fs.readFileSync(buildFootprintPath, "utf8");
        }

        const l = parse(footprint_file_contents) as SExpr[];

        if (Sym.isSym(l[0]) && l[0].name === 'module') {
            l[0] = Sym.for('footprint')
        }
        return prettyPrint(l);

    } catch (err: unknown) {
        if (err instanceof ComponentError) throw err;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred while loading footprint';
        throw new ComponentError(`[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] ${errorMessage}`);
    }
}
