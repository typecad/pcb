import { Pin } from "./pin.js";
import { DEFAULT_NET_PREFIX } from './constants.js';
import type { ISchematicNode } from "./types/schematic_types.js";
import { renderNets } from "./renderers/sexp_renderers.js";
import type { Component } from './component.js';

export interface INetConnectionInfo {
    reference: string;
    pin: number | string;
    type: string;
}

export interface ISchematicNetDefinition {
    name: string;
    code: number;
    pins: Pin[];
    connections: INetConnectionInfo[];
}

export class NetManager {
    Nodes: ISchematicNode[] = [];
    merged_nets: { old_name: string, merged_to_number: number }[] = [];
    private code_counter = 0;
    private _chained_name: string = '';
    private net_prefix: string;
    private sexp_nets: string[] = [];

    constructor(net_prefix: string = DEFAULT_NET_PREFIX) {
        this.net_prefix = net_prefix;
    }

    setChainedName(name: string): void {
        this._chained_name = name;
    }

    addNet(pins: Pin[]): ISchematicNetDefinition {
        this.code_counter++;

        let node_name = this._chained_name ? this._chained_name : `${this.net_prefix}${this.code_counter}`;
        node_name = this.resolveNetName(node_name, pins, this.code_counter);

        this.storeNetParams(node_name, this.code_counter, ...pins);
        this.mergeAndDeduplicateNodes();

        const definition = this.buildNetDefinition(node_name, pins);
        this._chained_name = '';
        return definition;
    }

    renderNets(): string {
        const _nets = renderNets(this.Nodes);
        this.sexp_nets.push(_nets);
        return _nets;
    }

    private storeNetParams(name: string, code: number, ...nodes: Pin[]): void {
        this.Nodes.push({ name, code, nodes, owner: null });
    }

    private buildNetDefinition(name: string, fallbackPins: Pin[]): ISchematicNetDefinition {
        const schematicNode = this.Nodes.find((node) => node.name === name);
        const pins = (schematicNode?.nodes ?? fallbackPins).filter((pin): pin is Pin => Boolean(pin));
        return {
            name: schematicNode?.name ?? name,
            code: schematicNode?.code ?? this.code_counter,
            pins: [...pins],
            connections: pins.map((pin) => ({
                reference: pin.reference,
                pin: pin.number,
                type: pin.type || 'unspecified'
            }))
        };
    }

    private resolveNetName(node_name: string, pins: Pin[], codeCounter: number): string {
        let resolvedName = node_name;

        pins.forEach((pin) => {
            if (!pin || typeof pin !== 'object' || !('number' in pin) || !('reference' in pin)) {
                throw new Error(`Invalid object passed to net(). Expected Pin, received ${typeof pin}`);
            }
            this.Nodes.forEach((netParam, index) => {
                netParam.nodes.forEach((netParamPin) => {
                    if (netParamPin.reference === pin.reference && netParamPin.number === pin.number) {
                        const currentIsNamed = !resolvedName.startsWith(this.net_prefix);
                        const existingIsNamed = !netParam.name.startsWith(this.net_prefix);

                        let finalNetName: string;
                        let mergedNetInfo: { old_name: string, merged_to_number: number };

                        if (currentIsNamed && !existingIsNamed) {
                            finalNetName = resolvedName;
                            mergedNetInfo = { old_name: netParam.name, merged_to_number: codeCounter };
                            this.Nodes[index].name = finalNetName;
                        } else {
                            finalNetName = netParam.name;
                            mergedNetInfo = { old_name: resolvedName, merged_to_number: this.Nodes[index].code };
                        }

                        this.merged_nets.push(mergedNetInfo);
                        resolvedName = finalNetName;
                    }
                });
            });
        });

        return resolvedName;
    }

    private mergeAndDeduplicateNodes(): void {
        const nodeMap: { [key: string]: ISchematicNode } = {};
        this.Nodes.forEach((node) => {
            if (nodeMap[node.name]) {
                nodeMap[node.name].nodes.push(...node.nodes);
            } else {
                nodeMap[node.name] = { ...node, nodes: [...node.nodes] };
            }
        });

        Object.values(nodeMap).forEach((node) => {
            const seen = new Map<string, boolean>();
            node.nodes = node.nodes.filter((pin) => {
                if (!pin) return false;
                const key = `${pin.reference}:${pin.number}`;
                if (seen.has(key)) return false;
                seen.set(key, true);
                return true;
            });
        });

        this.Nodes = Object.values(nodeMap);
    }
}
