import { Component } from '../component.js';
import type { IVia } from './pcb_interfaces.js';
import { generateUuid } from './pcb_utils.js';

export function createVia(
  offset: { x: number; y: number },
  stageFn: (component: Component) => void,
  options: Omit<IVia, 'uuid' | 'netCode' | 'layers'> = {},
): Component {
  const viaPosition = {
    x: (options.at?.x ?? 0) + offset.x,
    y: (options.at?.y ?? 0) + offset.y,
  };

  // Geometry-derived: two vias at the same spot with the same geometry are
  // the same via, so identical designs produce identical output.
  const viaUuid = generateUuid(
    'via',
    viaPosition.x,
    viaPosition.y,
    options.size || 0.8,
    options.drill || 0.4,
    options.net ?? '',
  );
  const viaComponent = Component._create({
    via: true,
    prefix: 'V',
    uuid: viaUuid,
    footprint: '',
    pcb: { x: viaPosition.x, y: viaPosition.y, rotation: 0, side: 'front' },
    viaData: {
      uuid: viaUuid,
      at: viaPosition,
      size: options.size || 0.8,
      drill: options.drill || 0.4,
      layers: ['F.Cu', 'B.Cu'],
      net: options.net,
      powerInfo: options.powerInfo,
    },
  });

  stageFn(viaComponent);

  return viaComponent;
}
