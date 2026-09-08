export { defineConfig, type TypeCADConfig } from './config.js';
export { Component, type ComponentInit, IComponent } from './component.js';
export type { ITextPositioning } from './pcb/pcb_interfaces.js';
export { Pin } from './pin.js';
export { I2C, UART, USB, Power } from './buses.js';
export type { IPower } from './buses.js';
export { PCB, TrackBuilder } from './pcb/pcb.js';
export { copperLayerNames, validateLayerCount, MAX_COPPER_LAYERS, MIN_COPPER_LAYERS } from './pcb/pcb_stackup.js';
export type { IStackupLayerOverride } from './pcb/pcb_stackup.js';
export {
  impedanceOfWidth,
  widthForImpedance,
  widthForImpedanceWithinTolerance,
  stackupImpedanceGeometry,
} from './pcb/pcb_impedance.js';
export type { IImpedanceGeometry, ImpedanceModel } from './pcb/pcb_impedance.js';
export { Schematic } from './schematic.js';
export type {
  IConnectionIdentifier,
  IManualRoute,
  IPcbOptions,
  IPcbRules,
  IVia,
  IViaPolicy,
  IAutorouteOptions,
  IAutorouteResult,
  IAutorouteRouteOptions,
  IAutorouteWaypoint,
  IImpedanceConstraint,
  IRouteMetadata,
  IGrTextOptions,
  INetClass,
  INetClassOptions,
  IStackupOptions,
  IZoneFillOptions,
} from './pcb/pcb.js';
export { Package } from './package.js';
export type { PackageOptions } from './package.js';
export { passiveFactory } from './passives/index.js';
export type { PassiveFactory, PassiveSize, FuseSize, ConnectorSeries } from './passives/index.js';
export type { PassiveInit, FuseInit, ConnectorInit, MountingHoleInit, NetTieInit } from './passives/index.js';
export { Resistor, Capacitor, Inductor, Diode, LED, Fuse } from './passives/chip.js';
export { Connector } from './passives/connector.js';
export { TestPoint, MountingHole } from './passives/mechanical.js';
export { NetTie } from './passives/net_tie.js';
export { syncPackageBuildLib, syncThisPackageBuildLib } from './package_files.js';
export type { IPinPowerInfo } from './pcb/pcb_interfaces.js';
export { KiCAD, discoverKiCAD, kicad_cli_path } from './kicad.js';

export { runDRC, runERC, upgradeFootprint, exportPCB, exportSchematic } from './kicad_commands.js';

export type { HwContract, ContractPin, ContractComponent, ContractOptions } from './contract.js';
export type { NgspiceResult } from './simulation/types.js';
export type { SimulationContext } from './simulation/ngspice.js';
export type { ISchematicNetDefinition } from './net_manager.js';
export { clearSourceCache } from './utils/source_inspector.js';

export type { PlacementBuilder, BoardBounds, SameAsResult, PlacementNumber, PlacementInput } from './placement.js';
export type { IBoundsLike } from './pcb/pcb_interfaces.js';
export type { IPoint, OutlinePathBuilder } from './pcb/pcb_outline.js';
