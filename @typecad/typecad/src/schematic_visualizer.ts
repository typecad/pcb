import { Schematic, setPendingSchematicPath } from "./schematic.js";
import { KiCAD } from "./kicad.js";
import fs from "node:fs";
import { SymbolLibraryManager } from './symbol_library_manager.js';
import { KiCADSchematic } from './kicad_schematic_renderer.js';
import { logWarning, logError } from './schematic_visualizer_types.js';
import { renderSchematic } from './schematic_templates.js';

export function schematic(schematicData: Schematic): boolean {
    new KiCAD();
    const symbolManager = new SymbolLibraryManager();
    const kicad = new KiCADSchematic(symbolManager);

    kicad.sheetname = schematicData.Sheetname;

    schematicData.components.forEach(component => {
        if (typeof component !== 'object' || component === null) {
            logWarning("Skipping non-object or null entry in Components array:", component);
            return;
        }

        if (component.symbol) {
            const symbolInstanceData = kicad.update(component);
            if (symbolInstanceData) {
                kicad.symbols.push(symbolInstanceData);
            } else {
                logWarning(`Skipping symbol instance for component ${component.reference || component.symbol} due to previous errors.`);
            }
        } else {
            logWarning(`Component ${component.reference || 'UNKNOWN'} is missing a symbol. Skipping.`);
        }
    });

    for (const node of schematicData.Nodes) {
        kicad.net(node);
    }

    const _schematic = renderSchematic({
        lib_symbols: kicad.lib_symbols,
        symbols: kicad.symbols,
        wires: kicad.wires,
        labels: kicad.labels,
        uuid: kicad.uuid
    });

    try {
        fs.writeFileSync(`./build/${schematicData.Sheetname}.kicad_sch`, _schematic);
        setPendingSchematicPath(`./build/${schematicData.Sheetname}.kicad_sch`);
    } catch (err) {
        logError(`Failed to write schematic file:`, err);
        throw err;
    }
    return true;
}
