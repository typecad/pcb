#!/usr/bin/env tsx
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
// Note: kicad_cli_path must be exported as it is required by external packages (e.g. @typecad/typecad-docgen).
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
