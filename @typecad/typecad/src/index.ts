export { defineConfig, type TypeCADConfig } from './config.js'
export { Component, type ComponentInit, IComponent, ITypeHalInfo } from './component.js'
export type { ITextPositioning } from './pcb/pcb_interfaces.js'
export { Schematic } from './schematic.js'
export { Pin } from './pin.js'
export { I2C, UART, USB, Power } from './buses.js'
export type { IPower } from './buses.js'
export { PCB, TrackBuilder } from './pcb/pcb.js'
export type {
    IConnectionIdentifier,
    IManualRoute,
    IPcbOptions,
    IVia,
    IAutorouteOptions,
    IAutorouteResult,
    IAutorouteRouteOptions,
    IAutorouteWaypoint,
    IImpedanceConstraint,
    IRouteMetadata,
    IGrTextOptions,
} from './pcb/pcb.js'
export { Package } from './package.js'
export type { PackageOptions, PassiveFactory } from './package.js'
export type { IPinPowerInfo } from './pcb/pcb_interfaces.js'
export { KiCAD, discoverKiCAD, kicad_cli_path } from './kicad.js'

export {
    runDRC,
    runERC,
    upgradeFootprint,
    exportPCB,
    exportSchematic,
} from './kicad_commands.js'

export type { McuPinMapping, HwContract, ContractPin, ContractComponent, ContractOptions } from './contract.js';
export type { NgspiceResult } from './simulation/types.js';
export type { ISchematicNetDefinition } from './net_manager.js';
export { clearSourceCache } from './utils/source_inspector.js';

export {
    below,
    above,
    rightOf,
    leftOf,
    sameAs,
    board,
} from './placement.js';
export type { PlacementBuilder, BoardBounds, SameAsResult, PlacementNumber } from './placement.js';
export { PlacementValue, isPlacementValue } from './placement.js';

