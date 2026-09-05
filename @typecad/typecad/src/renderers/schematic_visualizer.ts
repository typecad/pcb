import { Schematic } from '../schematic.js';
import { setPendingSchematicPath } from '../cli/pending_summary.js';
import { KiCAD } from '../kicad.js';
import fs from 'node:fs';
import { SymbolLibraryManager } from '../symbol_library_manager.js';
import { KiCADSchematic } from './kicad_schematic_renderer.js';
import { logWarning, logError, displayName } from './schematic_visualizer_types.js';
import { renderSchematic } from './schematic_templates.js';
import { reportError } from '../utils/error_reporter.js';
import type { Component } from '../component.js';

export function schematic(schematicData: Schematic): boolean {
  // Initializing the singleton throws when the KiCad CLI is unavailable.
  if (!KiCAD.instance) return false;
  const symbolManager = new SymbolLibraryManager();
  const kicad = new KiCADSchematic(symbolManager);

  kicad.sheetname = schematicData.sheetName;

  // Backfill owners for standalone pins (e.g. class-field `new Pin(...)`
  // declarations in component packages). Pins created via component.pin()
  // already carry their owner; net label placement needs an owner to
  // resolve absolute pin coordinates.
  const componentsByReference = new Map<string, Component>();
  for (const component of schematicData.components) {
    if (component && component.reference) {
      componentsByReference.set(component.reference, component);
    }
  }
  for (const node of schematicData.nodes) {
    for (const pin of node.nodes) {
      if (pin && !pin.owner) {
        pin.owner = componentsByReference.get(pin.reference) ?? null;
      }
    }
  }

  schematicData.components.forEach((component) => {
    if (typeof component !== 'object' || component === null) {
      logWarning('Skipping non-object or null entry in Components array:', component);
      return;
    }

    // Vias are PCB-only elements and intentionally have no symbol.
    if (component.via) return;

    if (component.symbol) {
      const symbolInstanceData = kicad.update(component);
      if (symbolInstanceData) {
        kicad.symbols.push(symbolInstanceData);
      } else {
        logWarning(`Skipping symbol instance for ${displayName(component)} due to previous errors.`);
      }
    } else {
      reportError('Component is missing a symbol. Skipping.', component);
    }
  });

  for (const node of schematicData.nodes) {
    kicad.net(node);
  }

  kicad.addPowerSymbols();

  const _schematic = renderSchematic({
    lib_symbols: kicad.lib_symbols,
    symbols: kicad.symbols,
    wires: kicad.wires,
    labels: kicad.labels,
    uuid: kicad.uuid,
  });

  try {
    fs.writeFileSync(`./build/${schematicData.sheetName}.kicad_sch`, _schematic);
    setPendingSchematicPath(`./build/${schematicData.sheetName}.kicad_sch`);
  } catch (err) {
    logError(`Failed to write schematic file:`, err);
    throw err;
  }
  return true;
}
