import { PCB, getPcbState } from './pcb.js';
import { normalizeNetName } from './pcb_utils.js';

type ViaComponentLike = {
  via?: boolean;
  viaData?: {
    at?: { x: number; y: number };
    net?: string;
  };
};

const pushComponents = (container: unknown, results: ViaComponentLike[]) => {
  if (Array.isArray(container)) {
    results.push(...container);
  }
};

export function collectManualViaFreeLocations(pcb: PCB, netName?: string): { x: number; y: number }[] {
  const normalizedTarget = normalizeNetName(netName);
  if (!normalizedTarget) {
    return [];
  }

  const state = getPcbState(pcb);
  const viaComponents: ViaComponentLike[] = [];
  pushComponents(state.components, viaComponents);
  pushComponents(state.stagedComponents, viaComponents);

  if (viaComponents.length === 0) {
    return [];
  }

  const dedup = new Set<string>();
  const freeVias: { x: number; y: number }[] = [];

  for (const comp of viaComponents) {
    if (!comp || comp.via !== true) {
      continue;
    }

    const viaData = comp.viaData;
    const at = viaData?.at;
    if (!at || typeof at.x !== 'number' || typeof at.y !== 'number') {
      continue;
    }

    const viaNet = normalizeNetName(viaData?.net);
    if (viaNet !== normalizedTarget) {
      continue;
    }

    const key = `${at.x.toFixed(4)}:${at.y.toFixed(4)}`;
    if (dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    freeVias.push({ x: at.x, y: at.y });
  }

  return freeVias;
}
