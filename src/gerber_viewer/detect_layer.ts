import type { DrillImage, GerberImage } from './gerber/types.js';

export type LayerKind = 'copper' | 'paste' | 'mask' | 'silkscreen' | 'edge' | 'drill' | 'adhes' | 'fab' | 'other';

export type LayerSide = 'front' | 'back' | 'inner' | 'both' | null;

export interface LayerInfo {
  /** Stable id used in SVG data attributes and the HTML layer list. */
  id: string;
  /** Display name (file basename, possibly with a shared board prefix stripped). */
  name: string;
  /** Full original file name when `name` was shortened. */
  fullName?: string;
  kind: LayerKind;
  side: LayerSide;
  /** 0-based index from the bottom (0 = B_Cu); null when unknown. */
  copperIndex: number | null;
  drillPlated: boolean | null;
  color: string;
  defaultVisible: boolean;
  order: number;
}

const INNER_COLORS = ['#7d9a3c', '#3c9a7d', '#3c7d9a', '#5b3c9a', '#9a3c7d'];

const COLORS: Record<string, { front: string; back: string; both: string; inner: string }> = {
  copper: { front: '#c87533', back: '#8c5a2c', both: '#c87533', inner: INNER_COLORS[0]! },
  paste: { front: '#6d6d6d', back: '#4f4f4f', both: '#6d6d6d', inner: '#6d6d6d' },
  mask: { front: '#a02c8e', back: '#4318aa', both: '#a02c8e', inner: '#a02c8e' },
  silkscreen: { front: '#1a1a1a', back: '#555555', both: '#1a1a1a', inner: '#1a1a1a' },
  edge: { front: '#d4aa00', back: '#d4aa00', both: '#d4aa00', inner: '#d4aa00' },
  drill: { front: '#115e59', back: '#115e59', both: '#115e59', inner: '#115e59' },
  adhes: { front: '#e08b4a', back: '#c46a2e', both: '#e08b4a', inner: '#e08b4a' },
  fab: { front: '#5c6bc0', back: '#7986cb', both: '#5c6bc0', inner: '#5c6bc0' },
  other: { front: '#8a8a8a', back: '#8a8a8a', both: '#8a8a8a', inner: '#8a8a8a' },
};

const DEFAULT_VISIBLE: Record<LayerKind, boolean> = {
  copper: true,
  paste: false,
  mask: false,
  silkscreen: false,
  edge: true,
  drill: true,
  adhes: false,
  fab: false,
  other: false,
};

function colorFor(kind: LayerKind, side: LayerSide, innerIndex: number): string {
  if (kind === 'copper' && side === 'inner') {
    return INNER_COLORS[innerIndex % INNER_COLORS.length]!;
  }
  return COLORS[kind]![side ?? 'both'] ?? COLORS[kind]!.both;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'layer'
  );
}

// KiCad-style and generic filename tokens (checked on the lowercase basename)
const FILENAME_TOKENS: Array<{ re: RegExp; kind: LayerKind; side: LayerSide; copper?: number }> = [
  { re: /(^|[-_.])f_cu(?=$|[-_.])/, kind: 'copper', side: 'front', copper: Number.POSITIVE_INFINITY },
  { re: /(^|[-_.])b_cu(?=$|[-_.])/, kind: 'copper', side: 'back', copper: 0 },
  { re: /(^|[-_.])in(\d+)_cu(?=$|[-_.])/, kind: 'copper', side: 'inner' },
  { re: /(^|[-_.])(f_mask|front_mask)(?=$|[-_.])/, kind: 'mask', side: 'front' },
  { re: /(^|[-_.])(b_mask|back_mask)(?=$|[-_.])/, kind: 'mask', side: 'back' },
  { re: /(^|[-_.])(f_silkscreen|f_silks|front_silkscreen)(?=$|[-_.])/, kind: 'silkscreen', side: 'front' },
  { re: /(^|[-_.])(b_silkscreen|b_silks|back_silkscreen)(?=$|[-_.])/, kind: 'silkscreen', side: 'back' },
  { re: /(^|[-_.])(f_paste|front_paste)(?=$|[-_.])/, kind: 'paste', side: 'front' },
  { re: /(^|[-_.])(b_paste|back_paste)(?=$|[-_.])/, kind: 'paste', side: 'back' },
  { re: /(^|[-_.])(f_adhes|front_adhes)(?=$|[-_.])/, kind: 'adhes', side: 'front' },
  { re: /(^|[-_.])(b_adhes|back_adhes)(?=$|[-_.])/, kind: 'adhes', side: 'back' },
  { re: /(^|[-_.])(f_fab|front_fab)(?=$|[-_.])/, kind: 'fab', side: 'front' },
  { re: /(^|[-_.])(b_fab|back_fab)(?=$|[-_.])/, kind: 'fab', side: 'back' },
  { re: /(^|[-_.])(edge_cuts|edge|outline|profile|boardoutline)(?=$|[-_.])/, kind: 'edge', side: 'both' },
  { re: /(^|[-_.])(drill|npth|pth)(?=$|[-_.])/, kind: 'drill', side: 'both' },
];

// legacy Protel/Altium gerber extensions
const LEGACY_EXTENSIONS: Record<string, { kind: LayerKind; side: LayerSide }> = {
  '.gtl': { kind: 'copper', side: 'front' },
  '.gbl': { kind: 'copper', side: 'back' },
  '.gtp': { kind: 'paste', side: 'front' },
  '.gbp': { kind: 'paste', side: 'back' },
  '.gts': { kind: 'mask', side: 'front' },
  '.gbs': { kind: 'mask', side: 'back' },
  '.gto': { kind: 'silkscreen', side: 'front' },
  '.gbo': { kind: 'silkscreen', side: 'back' },
  '.gko': { kind: 'edge', side: 'both' },
  '.gm1': { kind: 'edge', side: 'both' },
  '.gml': { kind: 'edge', side: 'both' },
  '.drl': { kind: 'drill', side: 'both' },
  '.drd': { kind: 'drill', side: 'both' },
  '.txt': { kind: 'drill', side: 'both' },
};

export function detectLayer(fileName: string, image: GerberImage | DrillImage): LayerInfo {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const name = base;
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const stem = dot === -1 ? lower : lower.slice(0, dot);
  const ext = dot === -1 ? '' : lower.slice(dot);

  let kind: LayerKind | null = null;
  let side: LayerSide = null;
  let copperIndex: number | null = null;
  let drillPlated: boolean | null = null;

  // 1) X2 file function attributes win when present
  const ff = image.attributes.fileFunction;
  if (ff) {
    const fields = ff.split(',');
    const head = fields[0]?.toLowerCase();
    // drill functions look like "Plated,1,2,PTH,Drill" / "NonPlated,1,1,NPTH,Drill"
    if (fields.some((f) => f.toLowerCase() === 'drill')) {
      kind = 'drill';
      side = 'both';
      drillPlated = /^plated/i.test(fields[0] ?? '');
    }
    const where = fields.slice(1).find((f) => ['top', 'bot', 'bottom', 'inr'].includes(f.toLowerCase()));
    const sideFromAttr: LayerSide =
      where === undefined
        ? null
        : /top/i.test(where) && !/bot/i.test(where)
          ? 'front'
          : /bot/i.test(where)
            ? 'back'
            : 'inner';
    switch (head) {
      case 'copper':
        kind = 'copper';
        side = sideFromAttr;
        if (ff.includes(',L1,')) side = 'front';
        if (ff.includes(',Bottom')) side = 'back';
        break;
      case 'profile':
        kind = 'edge';
        side = 'both';
        break;
      case 'soldermask':
        kind = 'mask';
        side = sideFromAttr;
        break;
      case 'legend':
        kind = 'silkscreen';
        side = sideFromAttr;
        break;
      case 'paste':
        kind = 'paste';
        side = sideFromAttr;
        break;
      case 'glue':
        kind = 'adhes';
        side = sideFromAttr;
        break;
      case 'drill':
        kind = 'drill';
        side = 'both';
        drillPlated = /plated/i.test(ff);
        break;
      default:
        break;
    }
  }

  // 2) filename tokens / legacy extensions fill in the rest
  if (kind === null || (kind === 'copper' && copperIndex === null)) {
    for (const token of FILENAME_TOKENS) {
      const m = token.re.exec(stem);
      if (!m) continue;
      if (kind === null) {
        kind = token.kind;
        side = token.side;
      }
      if (kind === 'copper') {
        if (token.side === 'back') copperIndex = 0;
        else if (token.side === 'inner') {
          side = 'inner';
          copperIndex = parseInt(m[2] ?? '1', 10);
        } else if (token.side === 'front') {
          side = 'front';
        }
      }
      break;
    }
  }
  if (kind === null && LEGACY_EXTENSIONS[ext]) {
    kind = LEGACY_EXTENSIONS[ext]!.kind;
    side = LEGACY_EXTENSIONS[ext]!.side;
  }
  if (kind === null) kind = 'other';

  const innerIndex = copperIndex && copperIndex > 0 ? copperIndex - 1 : 0;
  return {
    id: slugify(base),
    name,
    kind,
    side,
    copperIndex,
    drillPlated,
    color: colorFor(kind, side, innerIndex),
    defaultVisible: DEFAULT_VISIBLE[kind],
    order: 0,
  };
}

/**
 * Resolve front-copper ordering (F_Cu sits above the highest inner layer),
 * assign render order (painter's order: edge first, then copper bottom-up,
 * paste/silk/mask, drills, drawings) and return a sorted copy.
 */
export function finalizeAndSortLayers(layers: LayerInfo[]): LayerInfo[] {
  const maxInner = layers.reduce(
    (max, l) => (l.kind === 'copper' && l.side === 'inner' && l.copperIndex ? Math.max(max, l.copperIndex) : max),
    0,
  );
  const withOrder = layers.map((l) => {
    let order: number;
    if (l.kind === 'edge') order = 0;
    else if (l.kind === 'copper') {
      const idx = l.side === 'front' ? maxInner + 1 : (l.copperIndex ?? 1);
      order = 10 + idx * 2;
    } else if (l.kind === 'adhes') order = l.side === 'back' ? 1 : 2;
    else if (l.kind === 'paste') order = l.side === 'back' ? 3 : 31;
    else if (l.kind === 'silkscreen') order = l.side === 'back' ? 4 : 41;
    else if (l.kind === 'mask') order = l.side === 'back' ? 5 : 51;
    else if (l.kind === 'drill') order = 60;
    else if (l.kind === 'fab') order = l.side === 'back' ? 70 : 71;
    else order = 80;
    return { ...l, order };
  });
  return withOrder.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}
