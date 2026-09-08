import { Component } from '../component.js';
import { Schematic } from '../schematic.js';
import type { ISchematicNetDefinition } from '../net_manager.js';
import { Pin } from '../pin.js';
import { exportContract } from '../contract.js';
import type { ContractOptions } from '../contract.js';
import type { PCB } from './pcb.js';

export function pcbNet(schematic: Schematic, ...pins: Pin[]): ISchematicNetDefinition {
  return schematic.net(...pins);
}

export function pcbNamed(schematic: Schematic, name: string) {
  return schematic.named(name);
}

export function pcbBom(schematic: Schematic | undefined, output_folder?: string): void {
  if (schematic) {
    schematic.bom(output_folder);
  }
}

export function pcbContract(pcb: PCB, options: ContractOptions): void {
  const outputPath = options.outputPath ?? `./build/${pcb.boardName}.contract.json`;
  exportContract(pcb, { ...options, outputPath });
}

export function pcbAdd(schematic: Schematic | undefined, ...components: Component[]): void {
  if (schematic) {
    schematic.add(...components);
  }
}
