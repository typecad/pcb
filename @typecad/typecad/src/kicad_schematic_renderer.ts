import { Component } from "./component.js";
import { Pin } from "./pin.js";
import S from "./utils/sexpr_instance.js";
import Handlebars from "handlebars";
import { randomUUID, UUID } from "node:crypto";
import { SymbolLibraryManager } from './symbol_library_manager.js';
import {
    type SExprNode,
    type SchematicNode,
    logError,
    logWarning,
    GRID_UNIT_MM,
    PAGE_WIDTH_MM,
    PAGE_HEIGHT_MM,
} from './schematic_visualizer_types.js';
import { label_template } from './schematic_templates.js';

export class KiCADSchematic {
    lib_symbols: string[] = [];
    symbols: string[] = [];
    wires: string[] = [];
    labels: string[] = [];
    sheetname: string = '';
    uuid: UUID = randomUUID();
    private symbolManager: SymbolLibraryManager;

    constructor(symbolManager: SymbolLibraryManager) {
        this.symbolManager = symbolManager;
    }

    update(component: Component): string | null {
        const component_props: SExprNode = [];

        if (!component.symbol) {
            logError(`Component ${component.reference || 'undefined'} has no symbol defined.`);
            return null;
        }

        if (!component.sch) {
            component.sch = { x: 0, y: 0, rotation: 0 };
            logWarning(`Component ${component.reference || component.symbol} missing schematic placement data (sch). Initializing to x=0, y=0 for potential random placement.`);
        } else {
            if (component.sch.x == null) {
                logWarning(`Component ${component.reference || component.symbol} missing sch.x. Initializing to 0 for potential random placement.`);
                component.sch.x = 0;
            }
            if (component.sch.y == null) {
                logWarning(`Component ${component.reference || component.symbol} missing sch.y. Initializing to 0 for potential random placement.`);
                component.sch.y = 0;
            }
            if (component.sch.rotation == null) {
                logWarning(`Component ${component.reference || component.symbol} missing sch.rotation. Defaulting to 0.`);
                component.sch.rotation = 0;
            }
        }

        if (component.sch.x === 0 && component.sch.y === 0) {
            logWarning(`Component ${component.reference || component.symbol} has coordinates (0,0). Placing randomly.`);
            const maxX = Math.max(0, Math.ceil(PAGE_WIDTH_MM / GRID_UNIT_MM) - 1);
            const maxY = Math.max(0, Math.ceil(PAGE_HEIGHT_MM / GRID_UNIT_MM) - 1);
            const randXGrid = Math.floor(Math.random() * (maxX + 1));
            const randYGrid = Math.floor(Math.random() * (maxY + 1));
            component.sch.x = randXGrid * GRID_UNIT_MM;
            component.sch.y = randYGrid * GRID_UNIT_MM;
        }

        const symbolDef = this.symbolManager.getSymbolDefinition(component.symbol);
        if (!symbolDef) {
            logError(`Cannot update component ${component.reference}: Symbol ${component.symbol} definition not found.`);
            return null;
        }
        if (!this.lib_symbols.includes(symbolDef.serializedLibEntry)) {
            this.lib_symbols.push(symbolDef.serializedLibEntry);
        }

        component_props.push([`lib_id "${component.symbol}"`]);

        const x = GRID_UNIT_MM * Math.round(component.sch.x / GRID_UNIT_MM);
        const y = GRID_UNIT_MM * Math.round(component.sch.y / GRID_UNIT_MM);
        component.sch.x = x;
        component.sch.y = y;
        component_props.push([`at ${x} ${y} ${component.sch.rotation}`]);

        const propertiesToAdd = ['Reference', 'Value', 'Footprint'];
        const textOffsetY = 5.08;
        propertiesToAdd.forEach((propName) => {
            const key = propName.toLowerCase() as keyof Component;
            const propVal = component[key];
            if (propVal !== undefined && (typeof propVal === "string" || typeof propVal === "number")) {
                const propX = x;
                const propY = y + textOffsetY;
                component_props.push([
                    `property "${propName}" "${propVal}"`,
                    [`at ${propX} ${propY} ${component.sch?.rotation ?? 0}`],
                    [`effects`, [`font`, [`size 1.27 1.27`]], propName === 'Reference' ? [`hide no`] : [`hide yes`]],
                ]);
            }
        });

        if (component.reference) {
            component_props.push([
                `instances`,
                [`project "${this.sheetname}"`, [
                    `path "/${this.uuid}" (reference "${component.reference}") (unit 1)`
                ]],
            ]);
        } else {
            logWarning(`Component with symbol ${component.symbol} is missing a reference designator. Skipping instances entry.`);
        }

        const s = S.serialize(component_props, { includingRootParentheses: false });
        return `(symbol ${s})`;
    }

    getAbsolutePinCoordinates(component: Component, pin: Pin): [number, number] | null {
        if (!component.symbol) {
            logError(`Component ${component.reference} has no symbol.`);
            return null;
        }
        if (!component.sch) {
            logError(`Component ${component.reference} has no schematic placement data.`);
            return null;
        }
        if (pin === undefined || pin.number === undefined) {
            logError(`Pin is malformed for component ${component.reference}.`);
            return null;
        }

        const pinLocation = this.symbolManager.getPinLocation(component.symbol, pin.number);
        if (!pinLocation) {
            return null;
        }

        const { x: relX, y: relY } = pinLocation;
        const rotation = component.sch.rotation ?? 0;
        const compX = component.sch.x;
        const compY = component.sch.y;

        const angleRad = rotation * Math.PI / 180;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);

        const rotatedX = relX * cosA - relY * sinA;
        const rotatedY = relX * sinA + relY * cosA;

        const absX = compX + rotatedX;
        const absY = compY - rotatedY;

        const snappedX = GRID_UNIT_MM * Math.round(absX / GRID_UNIT_MM);
        const snappedY = GRID_UNIT_MM * Math.round(absY / GRID_UNIT_MM);

        return [snappedX, snappedY];
    }

    net(node: SchematicNode): void {
        if (node.nodes.length === 0) {
            logWarning(`Net "${node.name}" has no pins. Skipping.`);
            return;
        }

        const label_compiler = Handlebars.compile(label_template, { noEscape: true });
        const netName = node.name.replaceAll(' ', '_');

        for (const pinDef of node.nodes) {
            if (!pinDef.owner) {
                logWarning(`Net "${netName}", pin ${pinDef.number}: Pin has no owner. Skipping label.`);
                continue;
            }

            const absCoords = this.getAbsolutePinCoordinates(pinDef.owner, pinDef);
            if (!absCoords) {
                logWarning(`Net "${netName}", pin ${pinDef.owner?.reference}:${pinDef.number}: Could not get absolute coordinates. Skipping label.`);
                continue;
            }

            const labelX = absCoords[0];
            const labelY = absCoords[1];
            let label_rotation = 0;
            let justifyHorizontal = 'left';
            let justifyVertical = 'bottom';

            const pinLocation = this.symbolManager.getPinLocation(pinDef.owner!.symbol!, pinDef.number);

            if (pinLocation) {
                const pinSymbolAngle = pinLocation.angle;
                const compRotation = pinDef.owner?.sch?.rotation ?? 0;
                let effectivePinSymbolAngle = pinSymbolAngle;

                if (compRotation === 90) {
                    if (pinSymbolAngle === 0) effectivePinSymbolAngle = 90;
                    else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 180;
                    else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 270;
                    else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 0;
                } else if (compRotation === 180) {
                    if (pinSymbolAngle === 0) effectivePinSymbolAngle = 180;
                    else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 270;
                    else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 0;
                    else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 90;
                } else if (compRotation === 270) {
                    if (pinSymbolAngle === 0) effectivePinSymbolAngle = 270;
                    else if (pinSymbolAngle === 90) effectivePinSymbolAngle = 0;
                    else if (pinSymbolAngle === 180) effectivePinSymbolAngle = 90;
                    else if (pinSymbolAngle === 270) effectivePinSymbolAngle = 180;
                }

                switch (effectivePinSymbolAngle) {
                    case 0:
                        label_rotation = 180;
                        justifyHorizontal = 'right';
                        justifyVertical = 'bottom';
                        break;
                    case 90:
                        label_rotation = 270;
                        justifyHorizontal = 'right';
                        justifyVertical = 'bottom';
                        break;
                    case 180:
                        label_rotation = 0;
                        justifyHorizontal = 'left';
                        justifyVertical = 'bottom';
                        break;
                    case 270:
                        label_rotation = 90;
                        justifyHorizontal = 'left';
                        justifyVertical = 'bottom';
                        break;
                    default:
                        logWarning(`Net "${netName}", pin ${pinDef.owner?.reference}:${pinDef.number}: Unknown effective pin angle ${effectivePinSymbolAngle}. Using default label placement.`);
                        break;
                }
            } else {
                logWarning(`Net "${netName}", pin ${pinDef.owner?.reference}:${pinDef.number}: Could not get pin location details. Using default label placement.`);
            }

            this.labels.push(label_compiler({
                net_name: netName,
                x: labelX,
                y: labelY,
                label_rotation,
                justify_horizontal: justifyHorizontal,
                justify_vertical: justifyVertical,
                uuid: randomUUID()
            }));
        }
    }
}
