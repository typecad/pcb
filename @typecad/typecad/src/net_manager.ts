import { Pin } from './pin.js';
import { DEFAULT_NET_PREFIX } from './utils/constants.js';
import type { ISchematicNode } from './types/schematic_types.js';
import { renderNets } from './renderers/sexp_renderers.js';
import type { Component } from './component.js';
import { TypeCadError } from './utils/errors.js';
import { getCallSite } from './utils/stack_trace.js';
import { formatSourceError } from './utils/error_reporter.js';

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

interface IPinIndexEntry {
  nodeName: string;
  nodeIndex: number;
  nodeCode: number;
}

/** @internal */
export class NetManager {
  nodes: ISchematicNode[] = [];
  merged_nets: { old_name: string; merged_to_number: number }[] = [];
  private code_counter = 0;
  private _chained_name: string = '';
  private net_prefix: string;
  private sexp_nets: string[] = [];
  private pinToNetIndex: Map<string, IPinIndexEntry> = new Map();

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
    const mergedIntoIdx = this.mergeAndDeduplicateNodes();
    this.rebuildPinIndex(mergedIntoIdx);

    const definition = this.buildNetDefinition(node_name, pins);
    this._chained_name = '';
    return definition;
  }

  renderNets(): string {
    const _nets = renderNets(this.nodes);
    this.sexp_nets.push(_nets);
    return _nets;
  }

  private storeNetParams(name: string, code: number, ...nodes: Pin[]): void {
    this.nodes.push({ name, code, nodes, owner: null });
  }

  private buildNetDefinition(name: string, fallbackPins: Pin[]): ISchematicNetDefinition {
    const schematicNode = this.nodes.find((node) => node.name === name);
    const pins = (schematicNode?.nodes ?? fallbackPins).filter((pin): pin is Pin => Boolean(pin));
    return {
      name: schematicNode?.name ?? name,
      code: schematicNode?.code ?? this.code_counter,
      pins: [...pins],
      connections: pins.map((pin) => ({
        reference: pin.reference,
        pin: pin.number,
        type: pin.type || 'unspecified',
      })),
    };
  }

  private resolveNetName(node_name: string, pins: Pin[], codeCounter: number): string {
    let resolvedName = node_name;

    for (const pin of pins) {
      if (!pin || typeof pin !== 'object' || !('number' in pin) || !('reference' in pin)) {
        const site = getCallSite();
        const err = new TypeCadError(
          formatSourceError(`Invalid object passed to net(). Expected Pin, received ${typeof pin}`, site),
        );
        err.stack = err.message;
        throw err;
      }
      const key = `${pin.reference}:${pin.number}`;
      const existing = this.pinToNetIndex.get(key);
      if (existing) {
        const currentIsNamed = !resolvedName.startsWith(this.net_prefix);
        const existingIsNamed = !existing.nodeName.startsWith(this.net_prefix);

        let finalNetName: string;
        let mergedNetInfo: { old_name: string; merged_to_number: number };

        if (currentIsNamed && !existingIsNamed) {
          finalNetName = resolvedName;
          mergedNetInfo = { old_name: existing.nodeName, merged_to_number: codeCounter };
          this.nodes[existing.nodeIndex].name = finalNetName;
        } else {
          finalNetName = existing.nodeName;
          mergedNetInfo = { old_name: resolvedName, merged_to_number: existing.nodeCode };
        }

        this.merged_nets.push(mergedNetInfo);
        resolvedName = finalNetName;
      }
    }

    return resolvedName;
  }

  private mergeAndDeduplicateNodes(): number | undefined {
    const lastNode = this.nodes[this.nodes.length - 1];
    if (!lastNode) return undefined;

    const existingIdx = this.nodes.findIndex((node, idx) => idx < this.nodes.length - 1 && node.name === lastNode.name);

    if (existingIdx >= 0) {
      const existing = this.nodes[existingIdx];
      const seen = new Set<string>();
      for (const pin of existing.nodes) {
        if (pin) seen.add(`${pin.reference}:${pin.number}`);
      }
      for (const pin of lastNode.nodes) {
        if (!pin) continue;
        const key = `${pin.reference}:${pin.number}`;
        if (!seen.has(key)) {
          existing.nodes.push(pin);
          seen.add(key);
        }
      }
      this.nodes.pop();
      return existingIdx;
    } else {
      const seen = new Set<string>();
      lastNode.nodes = lastNode.nodes.filter((pin) => {
        if (!pin) return false;
        const key = `${pin.reference}:${pin.number}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return undefined;
    }
  }

  private rebuildPinIndex(mergedIntoIdx?: number): void {
    if (mergedIntoIdx !== undefined) {
      for (const pin of this.nodes[mergedIntoIdx].nodes) {
        if (pin) {
          const key = `${pin.reference}:${pin.number}`;
          this.pinToNetIndex.set(key, {
            nodeName: this.nodes[mergedIntoIdx].name,
            nodeIndex: mergedIntoIdx,
            nodeCode: this.nodes[mergedIntoIdx].code,
          });
        }
      }
      return;
    }

    const lastNode = this.nodes[this.nodes.length - 1];
    if (lastNode) {
      const idx = this.nodes.length - 1;
      for (const pin of lastNode.nodes) {
        if (pin) {
          const key = `${pin.reference}:${pin.number}`;
          this.pinToNetIndex.set(key, {
            nodeName: lastNode.name,
            nodeIndex: idx,
            nodeCode: lastNode.code,
          });
        }
      }
    }
  }
}
