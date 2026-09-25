import { Component, type ComponentInit } from '../component.js';

export class TestPoint extends Component {
  constructor(opts: ComponentInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || 'TestPoint:TestPoint_Pad_D1.0mm',
      symbol: opts.symbol || 'Connector:TestPoint',
      prefix: 'TP',
    });
  }
}

/** Options for the MountingHole factory. */
export interface MountingHoleInit extends ComponentInit {
  /** Thread size preset (default: 'M2'). An explicit `footprint` wins. */
  size?: 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8';
}

const sizeToFootprint: Record<NonNullable<MountingHoleInit['size']>, string> = {
  M2: 'MountingHole:MountingHole_2.2mm_M2',
  'M2.5': 'MountingHole:MountingHole_2.7mm_M2.5',
  M3: 'MountingHole:MountingHole_3.2mm_M3',
  M4: 'MountingHole:MountingHole_4.3mm_M4',
  M5: 'MountingHole:MountingHole_5.3mm_M5',
  M6: 'MountingHole:MountingHole_6.4mm_M6',
  M8: 'MountingHole:MountingHole_8.4mm_M8',
};

export class MountingHole extends Component {
  constructor({ size = 'M2', ...opts }: MountingHoleInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizeToFootprint[size],
      symbol: opts.symbol || 'Mechanical:MountingHole_Pad',
      prefix: 'MH',
    });
  }
}
