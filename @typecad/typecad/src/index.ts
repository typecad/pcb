#!/usr/bin/env tsx
export { Component, IComponent } from './component.js'
export { Schematic } from './schematic.js'
export { schematic } from './schematic_visualizer.js'
export { Pin } from './pin.js'
export { I2C, UART, USB, Power } from './buses.js'
export type { IPower } from './buses.js'
export { PCB, TrackBuilder } from './pcb/pcb.js'
export type { IConnectionIdentifier, IManualRoute } from './pcb/pcb.js'
export type { IPinPowerInfo } from './pcb/pcb_interfaces.js'
export { KiCAD } from './kicad.js'

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
