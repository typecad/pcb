#!/usr/bin/env tsx
export { defineConfig, type TypeCADConfig } from './config.js'
export { Component, IComponent, ITypeHalInfo } from './component.js'
export { Schematic } from './schematic.js'
export { schematic } from './schematic_visualizer.js'
export { Pin } from './pin.js'
export { I2C, UART, USB, Power } from './buses.js'
export type { IPower } from './buses.js'
export { PCB, TrackBuilder } from './pcb/pcb.js'
export type { IConnectionIdentifier, IManualRoute } from './pcb/pcb.js'
export { Package } from './package.js'
export type { PackageOptions, PassiveFactory } from './package.js'
export type { IPinPowerInfo } from './pcb/pcb_interfaces.js'
export { KiCAD } from './kicad.js'
// Note: kicad_cli_path must be exported as it is used internally by the docgen pipeline.
// It was removed during a code review in error.
export { kicad_cli_path } from './kicad.js'

// KiCAD command execution exports
export {
    executeKiCADCommand,
    executeKiCADCommandSync,
    runDRC,
    upgradeFootprint,
    exportPCB,
    exportSchematic,
    type KiCADCommandOptions
} from './kicad_commands.js'

// Autorouting infrastructure exports
export {
    AStarRouter,
    LengthMatcher,
    RoutingGrid,
    ObstacleBuilder,
    PadResolver,
    DebugVisualizer
} from './routing/index.js'
export type {
    IGridCell,
    IRoutingObstacle,
    IPadGeometry
} from './routing/index.js'

// Note: This is a library module. KiCAD detection happens when KiCAD class is instantiated.

// HW Contract — types + export helper
export { exportContract } from './contract.js';
export type { McuPinMapping, HwContract, ContractPin, ContractComponent, ContractOptions } from './contract.js';

// KiCad symbol search engine
export { Application, runApplication, ComponentSearchEngine, NetworkError, FileSystemError, ParsingError } from './kicad-symbols/index.js';
export type {
  ComponentRecord,
  SearchResult,
  ParsedParameters,
  ElectricalValue,
  MatchDetail,
  ComponentScore,
  CacheMetadata,
  JsonSearchResult,
  JsonErrorResponse,
  LibraryInfo,
  SymbolInfo,
  KiCadCacheMetadata,
} from './kicad-symbols/index.js';

// GitDiff — PCB visual comparison
export { generateDiffs, type DiffOptions } from './gitdiff/core/diff-generator.js';
export { computeTextualDiff, computeNetlistDiff, computeBomDiff, type TextualDiff, type ChangeDescription, type NetlistDiff, type NetDiffEntry, type BomDiff, type BomDiffEntry, type BomEntry } from './gitdiff/core/pcb-textual-diff.js';
export { annotateLayerSvgs, type SVGAnnotation } from './gitdiff/core/svg-diff-annotator.js';
export { type LayerInfo } from './gitdiff/utils/html-generator.js';
export { allLayers, standardLayers } from './gitdiff/constants.js';
export { cropSvg, sanitizeSvg, getFileHash, clearCache, detectInnerCopperLayers } from './gitdiff/utils/file-utils.js';

// Docgen — PCB documentation generator
export { generateDocumentation } from './cli/docgen/index.js';
export { extractStackup, generateStackupSvgString, generateStackupSvgFromFile, generateStackupFiles } from './cli/docgen/utils/pcbLayerRenderer.js';
export { parseMetadata } from './cli/docgen/utils/metadata.js';
export { wrapSectionsInHtml } from './cli/docgen/utils/html.js';
export { generateHtmlDocument, escapeHtml } from './cli/docgen/utils/template.js';
export { pathExists, ensureDir } from './cli/docgen/utils/fs.js';
export {
    writeStringToFile,
    writeBufferToFile,
    cropSvg as cropSvgDocgen,
    executeKicadSvgExport,
    executeKicadDrillExport,
    processKicadSvgLayers,
    renderKicad3DView
} from './cli/docgen/utils/svg.js';
export { PCBConfig, SVGConfig, CacheConfig } from './cli/docgen/utils/config.js';
export { TempFileManager, tempManager } from './cli/docgen/utils/tempFileManager.js';
export { IMetadata, defaultMetadata, getDefaultMetadata } from './cli/docgen/types/metadata.js';
