import { Component } from '../component.js';
import { Schematic } from '../schematic.js';
import logger from '../utils/logging.js';
import {
  IPcbOptions,
  INetResolution,
  IAutorouteOptions,
  IAutorouteResult,
  IOutline,
  IGrLine,
  IVia,
} from './pcb_interfaces.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { PcbInternalState } from './pcb_state.js';

export interface IPcbBoardContext {
  readonly boardName: string;
  readonly schematic: Schematic | undefined;
  readonly options: IPcbOptions;

  /** @internal Direct access to mutable internal state for extracted modules. */
  readonly state: PcbInternalState;

  outlines: IOutline[];
  tracks: IOutline[];
  readonly copper_thickness: number;

  track(opts: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder;
  _track(
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number,
    layer: string,
    locked: boolean,
    uuid?: string,
    net?: string,
  ): string;
  _getTrackData(uuid: string): IGrLine | null;
  place(...components: Component[]): void;
  via(params: Omit<IVia, 'uuid' | 'netCode' | 'layers'>): Component;
  route(options: IAutorouteOptions): Promise<IAutorouteResult>;
  resolveNet(
    componentReference: string,
    pinNumber: string,
    componentUuid?: string,
    boardNetNameToCodeMap?: Map<string, number>,
    fallbackNetName?: string,
  ): INetResolution;
}

export { logger };
