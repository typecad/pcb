import chalk from 'chalk';
import type { PCB } from '../pcb/pcb.js';
import type { TrackBuilder } from '../pcb/pcb_track_builder.js';
import { DEFAULT_NET_PREFIX } from '../utils/constants.js';
import logger from '../utils/logging.js';
import type {
  KicadIR,
  KicadFootprintIR,
  KicadSegmentIR,
  KicadTextIR,
  KicadViaIR,
  KicadNetIR,
  KicadOutlineIR,
  KicadStackupIR,
  KicadZoneIR,
  TextLayoutIR,
} from './types.js';

/** Helper for colored console output */
export interface ChalkHelpers {
  chKey: (s: string) => string;
  chProp: (s: string) => string;
  chStr: (s: string) => string;
  chNum: (n: number) => string;
  chPunc: (s: string) => string;
  chVar: (s: string) => string;
}

/** Default chalk helpers */
export const DEFAULT_CH: ChalkHelpers = {
  chKey: chalk.cyan,
  chProp: chalk.magenta,
  chStr: chalk.green,
  chNum: chalk.yellow,
  chPunc: chalk.gray,
  chVar: chalk.blueBright,
};

/** Round a number to 3 decimal places (mm precision for display). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Identity helpers — renders generator output as plain source text. */
export const PLAIN_CH: ChalkHelpers = {
  chKey: (s: string) => s,
  chProp: (s: string) => s,
  chStr: (s: string) => s,
  chNum: (n: number) => String(n),
  chPunc: (s: string) => s,
  chVar: (s: string) => s,
};

/** One contiguous routed run: a from() point, to() vertices, optional end via. */
export interface TrackChain {
  start: { x: number; y: number };
  layer: string;
  width: number;
  steps: Array<{ x: number; y: number; layer: string; width: number }>;
  via?: { size: number; drill: number };
}

/** A net's routed chains plus the variable the generated code collects them in. */
export interface TrackNetGroup {
  netKey: string;
  netName: string;
  netNumber?: number;
  isUnnamed: boolean;
  variableName: string;
  chains: TrackChain[];
}

/**
 * Group segments into per-net TrackBuilder chains — the single source of
 * truth shared by the console generator and the --apply rewriter.
 */
export function buildTrackChains(ir: KicadIR): TrackNetGroup[] {
  const netMap = new Map<number, string>();
  ir.nets.forEach((net) => {
    netMap.set(net.number, net.name);
  });

  // Net identity per segment: inline `(net "NAME")` (kicad-cli resave
  // strips the net table) or a net-table number. Segments with no
  // resolvable name stay unnamed and group per net code.
  const netNameOf = (segment: KicadSegmentIR): string => {
    if (segment.netName) return segment.netName;
    if (segment.net !== undefined) return netMap.get(segment.net) || '';
    return '';
  };
  const isUnnamedName = (name: string): boolean => !name || name.startsWith(DEFAULT_NET_PREFIX);

  const segmentsByNet = new Map<string, KicadSegmentIR[]>();
  ir.segments.forEach((segment) => {
    const name = netNameOf(segment);
    const key = isUnnamedName(name) ? `unnamed:${segment.net ?? 0}` : name;
    if (!segmentsByNet.has(key)) segmentsByNet.set(key, []);
    segmentsByNet.get(key)!.push(segment);
  });

  const groups: TrackNetGroup[] = [];
  segmentsByNet.forEach((netSegments, netKey) => {
    const netName = netKey.startsWith('unnamed:') ? '' : netKey;
    const netNumber = netKey.startsWith('unnamed:') ? Number(netKey.slice('unnamed:'.length)) : undefined;
    const isUnnamed = isUnnamedName(netName);
    const variableName = isUnnamed ? 'unnamed_Track' : `track_${sanitizeNetNameForVariable(netName)}`;

    const chains: TrackChain[] = [];
    let current: TrackChain | null = null;
    let lastEndPoint: { x: number; y: number } | null = null;

    netSegments.forEach((segment) => {
      if (!current || !lastEndPoint || lastEndPoint.x !== segment.start.x || lastEndPoint.y !== segment.start.y) {
        current = {
          start: { x: segment.start.x, y: segment.start.y },
          layer: segment.layer,
          width: segment.width,
          steps: [],
        };
        chains.push(current);
      }
      current.steps.push({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
      lastEndPoint = segment.end;
    });

    groups.push({ netKey, netName, netNumber, isUnnamed, variableName, chains });
  });

  return groups;
}

/**
 * Attach chain-ending vias to their chains (greedy, in file order, matching
 * position and net identity) and mutate `chain.via`. Returns the indexes of
 * the consumed vias; every other via is standalone.
 */
export function attachChainVias(ir: KicadIR, groups: TrackNetGroup[]): Set<number> {
  const used = new Set<number>();
  const viaKey = (v: KicadViaIR): string =>
    v.netName && !v.netName.startsWith(DEFAULT_NET_PREFIX) ? v.netName : `unnamed:${v.net ?? 0}`;

  for (const group of groups) {
    for (const chain of group.chains) {
      const end = chain.steps[chain.steps.length - 1];
      if (!end) continue;
      for (let i = 0; i < ir.vias.length; i++) {
        if (used.has(i)) continue;
        const via = ir.vias[i];
        if (Math.abs(via.at.x - end.x) >= 0.001 || Math.abs(via.at.y - end.y) >= 0.001) continue;
        if (viaKey(via) !== group.netKey) continue;
        used.add(i);
        chain.via = { size: via.size, drill: via.drill };
        break;
      }
    }
  }
  return used;
}

/** Vias not consumed by any chain end (stitching, via-in-pad) — these emit as standalone typecad.via() calls. */
export function standaloneVias(ir: KicadIR, groups?: TrackNetGroup[]): KicadViaIR[] {
  const used = attachChainVias(ir, groups ?? buildTrackChains(ir));
  return ir.vias.filter((_, i) => !used.has(i));
}

/** Render one `X.push(typecad.track(...).from(...)...);` statement. */
export function pushStatementSource(
  variableName: string,
  netName: string | undefined,
  chain: TrackChain,
  ch: ChalkHelpers,
): string {
  const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;
  const optionsLog = netName === undefined ? '' : `{ ${chProp('net')}${chPunc(':')} ${chStr(`'${netName}'`)} }`;
  let log = `${chVar(variableName)}${chPunc('.')}${chKey('push')}${chPunc('(')}${chVar('typecad')}${chPunc('.')}${chKey('track')}${chPunc('(')}${optionsLog}${chPunc(')')}${chKey('.from')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(chain.start.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(chain.start.y)} }${chPunc(',')} ${chStr('"' + chain.layer + '"')}${chPunc(',')} ${chNum(chain.width)}${chPunc(')')}`;
  for (const step of chain.steps) {
    log += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(step.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(step.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + step.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(step.width)} }${chPunc(')')}`;
  }
  if (chain.via) {
    log += `${chKey('.via')}${chPunc('(')}{ ${chProp('size')}${chPunc(':')} ${chNum(chain.via.size)}${chPunc(',')} ${chProp('drill')}${chPunc(':')} ${chNum(chain.via.drill)} }${chPunc(')')}`;
  }
  return log + `${chPunc(')')}${chPunc(';')}`;
}

/**
 * The full routing block as plain source text: per-net declarations and
 * pushes, then standalone via calls. Shared by display and --apply.
 */
export function trackBlockSource(ir: KicadIR, ch: ChalkHelpers = PLAIN_CH): { block: string; variables: string[] } {
  const groups = buildTrackChains(ir);
  attachChainVias(ir, groups);
  const lines: string[] = [];
  const variables: string[] = [];

  groups.forEach((group) => {
    if (!variables.includes(group.variableName)) variables.push(group.variableName);
    if (group.isUnnamed) {
      lines.push(`// Unnamed nets (net${group.netNumber ?? ''})`);
    } else {
      lines.push(`// Net: ${group.netName}`);
    }
    const { chVar, chPunc, chKey } = ch;
    lines.push(
      `${chVar('let ' + group.variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`,
    );
    group.chains.forEach((chain) => {
      lines.push(pushStatementSource(group.variableName, group.isUnnamed ? undefined : group.netName, chain, ch));
    });
    lines.push('');
  });

  // No trailing blank after the last group — the region compare in --apply
  // must converge even when no standalone vias follow.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const vias = standaloneVias(ir, groups);
  if (vias.length > 0 && lines.length > 0) lines.push('');
  vias.forEach((via) => lines.push(standaloneViaSource(via, ch)));

  return { block: lines.join('\n'), variables };
}

/** The object-literal argument of a standalone via call (no `typecad.via(` wrapper). */
export function viaArgSource(via: KicadViaIR, ch: ChalkHelpers = PLAIN_CH): string {
  const { chProp, chNum, chPunc, chStr } = ch;
  // Keep the electrical identity of a via that sits outside any track
  // chain (stitching vias, via-in-pad): the net rides on the via itself.
  const netName = via.netName ?? '';
  const namedNet = netName !== '' && !netName.startsWith(DEFAULT_NET_PREFIX);
  let arg = ` ${chProp('at')}${chPunc(': {')} ${chProp('x')}${chPunc(':')} ${chNum(via.at.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(via.at.y)} ${chPunc('}')}${chPunc(',')}`;
  if (namedNet) {
    arg += ` ${chProp('net')}${chPunc(':')} ${chStr(`'${netName}'`)}${chPunc(',')}`;
  }
  arg += ` ${chProp('size')}${chPunc(':')} ${chNum(via.size)}${chPunc(',')}`;
  arg += ` ${chProp('drill')}${chPunc(':')} ${chNum(via.drill)}`;
  return arg;
}

/** Render one standalone `typecad.via({ ... });` statement. */
export function standaloneViaSource(via: KicadViaIR, ch: ChalkHelpers = PLAIN_CH): string {
  const { chKey, chPunc, chVar } = ch;
  return `${chVar('typecad')}${chPunc('.')}${chKey('via')}${chPunc('(')}${chPunc('{')}${viaArgSource(via, ch)}${chPunc(' }')}${chPunc(')')}${chPunc(';')}`;
}

/**
 * Generate TrackBuilder code display from IR segments and nets.
 * Returns the generated track variable names for use in create() statements.
 */
export function generateTrackCode(
  ir: KicadIR,
  pcb: PCB,
  sourceDescription: string,
  ch: ChalkHelpers = DEFAULT_CH,
): string[] {
  const groups = buildTrackChains(ir);
  const usedViaIndexes = attachChainVias(ir, groups);
  const trackVariableNames: string[] = [];

  if (ir.segments.length > 0) {
    logger.log(
      `Found ${ir.segments.length} segments. Generating TrackBuilder chains organized by nets from ${sourceDescription}.`,
    );

    const allNetTrackLogs: string[] = [];

    groups.forEach((group) => {
      if (!trackVariableNames.includes(group.variableName)) trackVariableNames.push(group.variableName);

      if (group.isUnnamed) {
        allNetTrackLogs.push(chalk.gray(`// Unnamed nets (net${group.netNumber ?? ''})`));
      } else {
        allNetTrackLogs.push(chalk.gray(`// Net: ${group.netName}`));
      }
      const { chVar, chPunc, chKey } = ch;
      allNetTrackLogs.push(
        `${chVar('let ' + group.variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`,
      );

      group.chains.forEach((chain) => {
        // Named nets keep their electrical identity through import: the
        // net rides on the TrackBuilder itself (vias inherit it), not
        // just in the comment above the chain.
        const builder = pcb
          .track(group.isUnnamed ? undefined : { net: group.netName })
          .from({ x: chain.start.x, y: chain.start.y }, chain.layer, chain.width);
        chain.steps.forEach((step) => {
          builder.to({ x: step.x, y: step.y, layer: step.layer, width: step.width });
        });
        if (chain.via) builder.via({ size: chain.via.size, drill: chain.via.drill });

        allNetTrackLogs.push(
          pushStatementSource(group.variableName, group.isUnnamed ? undefined : group.netName, chain, ch),
        );
      });
      allNetTrackLogs.push('');
    });

    if (allNetTrackLogs.length > 0) {
      logger.log(chalk.bold(`\n--- Generated typeCAD TrackBuilder Code from ${sourceDescription} ---`));
      allNetTrackLogs.forEach((log) => logger.log(log));
      logger.log(chalk.bold('---------------------------------------------------------'));
    }

    showStandaloneVias(ir, usedViaIndexes, sourceDescription, ch);
  } else if (ir.vias.length > 0) {
    showStandaloneVias(ir, usedViaIndexes, sourceDescription, ch);
  } else {
    logger.log(`No segments found in ${sourceDescription} content.`);
  }

  return trackVariableNames;
}

/**
 * Generate placement code display from IR footprints.
 * Shows `.pcb = { ... }` assignments and Component constructor code.
 */
export function generatePlacementCode(
  footprints: KicadFootprintIR[],
  sourceDescription: string,
  ch: ChalkHelpers = DEFAULT_CH,
): void {
  const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;

  if (footprints.length > 0) {
    logger.log(`Found ${footprints.length} footprints. Generating placement code from ${sourceDescription}.`);
    const groups: Record<string, KicadFootprintIR[]> = {};

    // Group by any available source hint (footprint name for display)
    footprints.forEach((fp) => {
      const key = fp.footprintName || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(fp);
    });

    logger.log(chalk.bold(`\n--- Generated Component Placement Code from ${sourceDescription} ---`));
    for (const [key, fps] of Object.entries(groups)) {
      logger.log(chalk.yellow(`\n// Footprint: ${key}`));
      fps.forEach((fp) => {
        const variableName = fp.reference;
        const prefix = '';
        let placementLog = `${chVar(prefix + variableName)}${chPunc('.')}${chProp('pcb')} ${chPunc('=')} ${chPunc('{')}`;
        placementLog += ` ${chProp('x')}${chPunc(':')} ${chNum(fp.position.x)}${chPunc(',')}`;
        placementLog += ` ${chProp('y')}${chPunc(':')} ${chNum(fp.position.y)}${chPunc(',')}`;
        placementLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(fp.position.rotation)}`;
        if (fp.side === 'back') placementLog += `${chPunc(',')} ${chProp('side')}${chPunc(':')} ${chStr("'back'")}`;
        placementLog += ` ${chPunc('}')}${chPunc(';')}`;
        logger.log(placementLog);

        if (fp.referenceLayout) {
          logLayoutAssignment(ch, prefix + variableName, 'referenceLayout', fp.referenceLayout);
        }
        if (fp.valueLayout) {
          logLayoutAssignment(ch, prefix + variableName, 'valueLayout', fp.valueLayout);
        }
        if (fp.fabLayout) {
          logLayoutAssignment(ch, prefix + variableName, 'fabLayout', fp.fabLayout);
        }
      });
    }
    logger.log(chalk.bold('\n-------------------------------------------------------------'));
  } else {
    logger.log(`No footprints found in ${sourceDescription} content.`);
  }

  const componentsWithDetails = footprints.filter((fp) => fp.referenceProperty);
  if (componentsWithDetails.length > 0) {
    logger.log(
      `Found ${componentsWithDetails.length} component(s) with reference properties. Generating Component constructor code.`,
    );
    logger.log(chalk.bold(`\n--- Generated Component Constructor Code from ${sourceDescription} ---`));

    componentsWithDetails.forEach((fp) => {
      const variableName = fp.reference;
      const prefix = '';

      logger.log(`${chVar(prefix + variableName)} ${chPunc('=')} ${chKey('new')} ${chKey('Component')}({`);
      if (fp.footprintName) {
        logger.log(`    ${chProp('footprint')}${chPunc(':')} ${chStr("'" + fp.footprintName + "'")}${chPunc(',')}`);
      }
      logger.log(`    ${chProp('reference')}${chPunc(':')} ${chStr("'" + fp.reference + "'")}${chPunc(',')}`);

      logger.log(`${chPunc('});')}`);
    });
    logger.log(chalk.bold('\n-------------------------------------------------------------'));
  }
}

/**
 * Generate text element code display from IR text elements.
 */
export function generateTextCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;
  const textElements = ir.textElements;

  if (textElements.length > 0) {
    logger.log(`Found ${textElements.length} text element(s). Generating typeCAD code from ${sourceDescription}.`);
    logger.log(chalk.bold(`\n--- Generated Text Element Code from ${sourceDescription} ---`));
    textElements.forEach((t) => {
      logger.log(chalk.gray(`// Text: "${t.text}"`));
      let textLog = `${chVar('typecad')}${chPunc('.')}${chKey('text')}${chPunc('({ ')}`;
      textLog += `${chProp('text')}${chPunc(':')} ${chStr('"' + t.text + '"')}${chPunc(',')}`;
      textLog += ` ${chProp('x')}${chPunc(':')} ${chNum(t.x)}${chPunc(',')}`;
      textLog += ` ${chProp('y')}${chPunc(':')} ${chNum(t.y)}${chPunc(',')}`;
      if (t.rotation !== 0) textLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(t.rotation)}${chPunc(',')}`;
      if (t.layer !== 'F.SilkS')
        textLog += ` ${chProp('layer')}${chPunc(':')} ${chStr('"' + t.layer + '"')}${chPunc(',')}`;
      if (t.fontFace) textLog += ` ${chProp('font')}${chPunc(':')} ${chStr('"' + t.fontFace + '"')}${chPunc(',')}`;
      if (t.fontSize) {
        textLog += ` ${chProp('height')}${chPunc(':')} ${chNum(t.fontSize[0])}${chPunc(',')}`;
        textLog += ` ${chProp('width')}${chPunc(':')} ${chNum(t.fontSize[1])}${chPunc(',')}`;
      }
      if (t.thickness !== undefined)
        textLog += ` ${chProp('thickness')}${chPunc(':')} ${chNum(t.thickness)}${chPunc(',')}`;
      if (t.bold) textLog += ` ${chProp('bold')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
      if (t.italic) textLog += ` ${chProp('italic')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
      if (t.hide) textLog += ` ${chProp('hide')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
      if (t.justify) {
        const parts: string[] = [];
        if (t.justify.horizontal)
          parts.push(`${chProp('horizontal')}${chPunc(':')} ${chStr("'" + t.justify.horizontal + "'")}`);
        if (t.justify.vertical)
          parts.push(`${chProp('vertical')}${chPunc(':')} ${chStr("'" + t.justify.vertical + "'")}`);
        if (t.justify.mirror) parts.push(`${chProp('mirror')}${chPunc(':')} ${chVar('true')}`);
        if (parts.length > 0)
          textLog += ` ${chProp('justify')}${chPunc(':')} { ${parts.join(`${chPunc(',')}`)} }${chPunc(',')}`;
      }
      textLog = textLog.replace(/,$/, '');
      textLog += ` ${chPunc('})')}${chPunc(';')}`;
      logger.log(textLog);
    });
    logger.log(chalk.bold('----------------------------------------------------------'));
  } else {
    logger.log(`No text elements found in ${sourceDescription} content.`);
  }
}

function showStandaloneVias(
  ir: KicadIR,
  usedViaIndexes: Set<number>,
  sourceDescription: string,
  ch: ChalkHelpers,
): void {
  const standalone = ir.vias.filter((_, i) => !usedViaIndexes.has(i));
  if (standalone.length === 0) return;

  logger.log(`Found ${standalone.length} standalone via(es). Generating typeCAD code from ${sourceDescription}.`);
  logger.log(chalk.bold(`
--- Generated typeCAD Via Code from ${sourceDescription} ---`));
  standalone.forEach((via) => logger.log(standaloneViaSource(via, ch)));
  logger.log(chalk.bold('-----------------------------------------------------'));
}

/**
 * Generate board outline code display from IR outlines.
 */
/** One board-outline call the import derives: method plus literal args. */
export interface DerivedOutlineCall {
  method: 'outline' | 'outlineCircle' | 'outlinePolygon' | 'cutout' | 'cutoutCircle';
  /** numbers for outline/outlineCircle, point arrays for polygon/cutout */
  args: Array<number | Array<{ x: number; y: number }>>;
}

function outlineArgsSource(args: DerivedOutlineCall['args'], ch: ChalkHelpers): string {
  const { chProp, chNum, chPunc } = ch;
  return args
    .map((arg) => {
      if (typeof arg === 'number') return chNum(arg);
      const pts = arg
        .map(
          (p) =>
            `${chPunc('{')} ${chProp('x')}${chPunc(':')} ${chNum(p.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(p.y)} ${chPunc('}')}`,
        )
        .join(`${chPunc(',')} `);
      return `${chPunc('[')}${pts}${chPunc(']')}`;
    })
    .join(`${chPunc(',')} `);
}

/** A full outline-family call statement, e.g. `typecad.outline(0, 0, 10, 20);`. */
export function outlineCallSource(
  call: DerivedOutlineCall,
  ch: ChalkHelpers = PLAIN_CH,
  objectName = 'typecad',
): string {
  const { chVar, chPunc, chKey } = ch;
  return (
    `${chVar(objectName)}${chPunc('.')}${chKey(call.method)}${chPunc('(')}` +
    `${outlineArgsSource(call.args, ch)}${chPunc(')')}${chPunc(';')}`
  );
}

/**
 * Derive the outline-family calls the import would emit for the board's
 * Edge.Cuts geometry — shared by the console generator and --apply so both
 * always reason about the same canonical form. `skipped` counts elements
 * whose shape did not map to a call.
 */
export function deriveOutlineCalls(ir: KicadIR): { calls: DerivedOutlineCall[]; skipped: number } {
  const outlines = ir.outlines;
  const calls: DerivedOutlineCall[] = [];
  let skipped = 0;
  if (outlines.length === 0) return { calls, skipped };

  const rectOutlines = outlines.filter((o) => o.type === 'rect');
  const lineOutlines = outlines.filter((o) => o.type === 'line');
  const polyOutlines = outlines.filter((o) => o.type === 'poly');
  const circleOutlines = outlines.filter((o) => o.type === 'circle');
  const arcOutlines = outlines.filter((o) => o.type === 'arc');
  const hasRectOutline =
    rectOutlines.length === 1 || lineOutlines.length === 4 || lineOutlines.length + arcOutlines.length >= 4;

  if (rectOutlines.length === 1 && polyOutlines.length === 0 && circleOutlines.length === 0) {
    const rect = rectOutlines[0];
    if (rect.start && rect.end && rect.width && rect.height) {
      const x = Math.min(rect.start.x, rect.end.x);
      const y = Math.min(rect.start.y, rect.end.y);
      calls.push({ method: 'outline', args: [x, y, rect.width, rect.height] });
    }
    return { calls, skipped };
  }

  if (hasRectOutline && polyOutlines.length === 0 && circleOutlines.length === 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    lineOutlines.forEach((line) => {
      if (line.start && line.end) {
        minX = Math.min(minX, line.start.x, line.end.x);
        minY = Math.min(minY, line.start.y, line.end.y);
        maxX = Math.max(maxX, line.start.x, line.end.x);
        maxY = Math.max(maxY, line.start.y, line.end.y);
      }
    });
    arcOutlines.forEach((arc) => {
      if (arc.start && arc.end) {
        minX = Math.min(minX, arc.start.x, arc.end.x);
        minY = Math.min(minY, arc.start.y, arc.end.y);
        maxX = Math.max(maxX, arc.start.x, arc.end.x);
        maxY = Math.max(maxY, arc.start.y, arc.end.y);
      }
      if (arc.mid) {
        minX = Math.min(minX, arc.mid.x);
        minY = Math.min(minY, arc.mid.y);
        maxX = Math.max(maxX, arc.mid.x);
        maxY = Math.max(maxY, arc.mid.y);
      }
    });

    if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      const width = Math.round((maxX - minX) * 1000) / 1000;
      const height = Math.round((maxY - minY) * 1000) / 1000;
      const args: Array<number | Array<{ x: number; y: number }>> = [minX, minY, width, height];
      if (arcOutlines.length === 4) {
        const radii = arcOutlines
          .map((arc) => {
            if (arc.start && arc.end && arc.mid) {
              const ax = arc.start.x,
                ay = arc.start.y;
              const bx = arc.mid.x,
                by = arc.mid.y;
              const cx = arc.end.x,
                cy = arc.end.y;
              const a = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
              const b = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);
              const c = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
              const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
              if (area > 0) return (a * b * c) / (4 * area);
            }
            return 0;
          })
          .filter((r) => r > 0);
        if (radii.length > 0) {
          args.push(Math.round((radii.reduce((a, b) => a + b, 0) / radii.length) * 1000) / 1000);
        }
      }
      calls.push({ method: 'outline', args });
    }
    return { calls, skipped };
  }

  // Non-rectangular outlines: a circle/poly that appears alongside a
  // rectangular outer contour is treated as a cutout; otherwise it's the
  // board outline itself.
  const hasOuterRect = rectOutlines.length === 1;
  const hasOuter4Line = lineOutlines.length === 4 || lineOutlines.length + arcOutlines.length >= 4;
  const hasOuter = hasOuterRect || hasOuter4Line;

  if (hasOuterRect) {
    const rect = rectOutlines[0];
    if (rect.start && rect.end && rect.width && rect.height) {
      const x = Math.min(rect.start.x, rect.end.x);
      const y = Math.min(rect.start.y, rect.end.y);
      calls.push({ method: 'outline', args: [x, y, rect.width, rect.height] });
    }
  } else if (hasOuter4Line) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    lineOutlines.forEach((line) => {
      if (line.start && line.end) {
        minX = Math.min(minX, line.start.x, line.end.x);
        minY = Math.min(minY, line.start.y, line.end.y);
        maxX = Math.max(maxX, line.start.x, line.end.x);
        maxY = Math.max(maxY, line.start.y, line.end.y);
      }
    });
    arcOutlines.forEach((arc) => {
      if (arc.start) {
        minX = Math.min(minX, arc.start.x);
        minY = Math.min(minY, arc.start.y);
        maxX = Math.max(maxX, arc.start.x);
        maxY = Math.max(maxY, arc.start.y);
      }
      if (arc.end) {
        minX = Math.min(minX, arc.end.x);
        minY = Math.min(minY, arc.end.y);
        maxX = Math.max(maxX, arc.end.x);
        maxY = Math.max(maxY, arc.end.y);
      }
    });
    if (isFinite(minX) && isFinite(maxX)) {
      const width = Math.round((maxX - minX) * 1000) / 1000;
      const height = Math.round((maxY - minY) * 1000) / 1000;
      calls.push({ method: 'outline', args: [minX, minY, width, height] });
    }
  }

  for (const circle of circleOutlines) {
    if (!circle.center || !circle.end) continue;
    const radius = Math.sqrt((circle.end.x - circle.center.x) ** 2 + (circle.end.y - circle.center.y) ** 2);
    calls.push({
      method: hasOuter ? 'cutoutCircle' : 'outlineCircle',
      args: [circle.center.x, circle.center.y, round3(radius)],
    });
  }

  for (const poly of polyOutlines) {
    if (!poly.points || poly.points.length < 3) continue;
    calls.push({ method: hasOuter ? 'cutout' : 'outlinePolygon', args: [poly.points] });
  }

  const handled = new Set<string>(['rect', 'line', 'arc', 'circle', 'poly']);
  skipped = outlines.filter((o) => !handled.has(o.type)).length;
  return { calls, skipped };
}

/**
 * Generate board outline code display from IR outlines.
 */
export function generateOutlineCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  const outlines = ir.outlines;
  const { calls, skipped } = deriveOutlineCalls(ir);

  if (outlines.length > 0) {
    logger.log(
      `Found ${outlines.length} board outline element(s) on Edge.Cuts layer. Generating typeCAD code from ${sourceDescription}.`,
    );
    const allOutlineLogs: string[] = [];

    for (const call of calls) {
      allOutlineLogs.push(outlineCallSource(call, ch));
    }
    if (skipped > 0) {
      allOutlineLogs.push(chalk.yellow(`// Note: ${skipped} outline element(s) of an unrecognized type were skipped.`));
    }

    if (allOutlineLogs.length > 0) {
      logger.log(chalk.bold(`\n--- Generated typeCAD Board Outline Code from ${sourceDescription} ---`));
      allOutlineLogs.forEach((log) => logger.log(log));
      logger.log(chalk.bold('---------------------------------------------------------------'));
    }
  } else {
    logger.log(`No board outline found in ${sourceDescription} content (looking for Edge.Cuts layer).`);
  }
}

/**
 * Generate `typecad.stackup(...)` code from the parsed stackup IR.
 * Emits nothing if no stackup was found in the board.
 */
export function generateStackupCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  const { chKey, chStr, chProp, chNum, chPunc, chVar } = ch;
  const stackup = ir.stackup;
  if (!stackup || stackup.copperLayerCount < 2) {
    return;
  }

  logger.log(
    `Found layer stackup (${stackup.copperLayerCount} copper layers) in ${sourceDescription}. Generating typeCAD code.`,
  );

  const parts: string[] = [`${chNum(stackup.copperLayerCount)}`];

  // Emit options only when non-default.
  const opts: string[] = [];
  if (stackup.copperFinish && stackup.copperFinish !== 'None') {
    opts.push(`${chProp('copper_finish')}${chPunc(':')} ${chStr(`'${stackup.copperFinish}'`)}`);
  }
  if (stackup.dielectricConstraints === true) {
    opts.push(`${chProp('dielectric_constraints')}${chPunc(':')} ${chStr('true')}`);
  }
  if (opts.length > 0) {
    parts.push(`${chPunc('{')} ${opts.join(`${chPunc(',')} `)} ${chPunc('}')}`);
  }

  let log = `${chVar('typecad')}${chPunc('.')}${chKey('stackup')}${chPunc('(')}`;
  log += parts.join(`${chPunc(',')} `);
  log += `${chPunc(')')}${chPunc(';')}`;

  logger.log(chalk.bold(`\n--- Generated typeCAD Stackup Code from ${sourceDescription} ---`));
  logger.log(log);
  logger.log(chalk.bold('-----------------------------------------------------------'));
}

/**
 * Generate `typecad.zone(...)` / `typecad.keepout(...)` code from parsed
 * zones: filled pours use the grouped `fill` object; rule areas map their
 * keepout restrictions. Emits nothing when the board has no zones.
 */
/** Inner options of a zone/keepout call (no braces) — shared by display and --apply. */
export function zonePropsSource(zone: KicadZoneIR, ch: ChalkHelpers): string {
  const { chKey, chStr, chProp, chNum, chPunc, chVar } = ch;
  const props: string[] = [];

  if (zone.keepout) {
    // Rule area
    props.push(
      `${chProp('layers')}${chPunc(':')} ${chPunc('[')}${zone.layers.map((l) => chStr(`'${l}'`)).join(`${chPunc(',')} `)}${chPunc(']')}`,
    );
    props.push(geometryProps(zone, ch));
    const r = zone.keepout;
    if (r.tracks || r.vias || r.pads || r.copperpour || r.footprints) {
      const restrictions: string[] = [];
      if (r.tracks) restrictions.push(`${chProp('tracks')}${chPunc(':')} ${chVar('true')}`);
      if (r.vias) restrictions.push(`${chProp('vias')}${chPunc(':')} ${chVar('true')}`);
      if (r.pads) restrictions.push(`${chProp('pads')}${chPunc(':')} ${chVar('true')}`);
      if (r.copperpour) restrictions.push(`${chProp('copperpour')}${chPunc(':')} ${chVar('true')}`);
      if (r.footprints) restrictions.push(`${chProp('footprints')}${chPunc(':')} ${chVar('true')}`);
      props.push(
        `${chProp('restrictions')}${chPunc(':')} ${chPunc('{')} ${restrictions.join(`${chPunc(',')} `)} ${chPunc('}')}`,
      );
    }
    if (zone.placement === true) props.push(`${chProp('placement')}${chPunc(':')} ${chVar('true')}`);
    if (zone.priority) props.push(`${chProp('priority')}${chPunc(':')} ${chNum(zone.priority)}`);
    if (zone.name) props.push(`${chProp('name')}${chPunc(':')} ${chStr(`'${zone.name}'`)}`);
    if (zone.locked) props.push(`${chProp('locked')}${chPunc(':')} ${chVar('true')}`);
    if (zone.hatchStyle && zone.hatchStyle !== 'edge') {
      props.push(`${chProp('hatchStyle')}${chPunc(':')} ${chStr(`'${zone.hatchStyle}'`)}`);
    }
    if (zone.hatchPitch !== undefined && zone.hatchPitch !== 0.508) {
      props.push(`${chProp('hatchPitch')}${chPunc(':')} ${chNum(zone.hatchPitch)}`);
    }
    // Note: rule areas carry min_thickness / fill blocks in KiCad files,
    // but pcb.keepout() has no such options — nothing else is emitted.
    return props.filter(Boolean).join(`${chPunc(',')} `);
  }

  // Filled pour
  if (zone.netName) props.push(`${chProp('net')}${chPunc(':')} ${chStr(`'${zone.netName}'`)}`);
  props.push(
    `${chProp('layers')}${chPunc(':')} ${chPunc('[')}${zone.layers.map((l) => chStr(`'${l}'`)).join(`${chPunc(',')} `)}${chPunc(']')}`,
  );
  props.push(geometryProps(zone, ch));
  if (zone.name) props.push(`${chProp('name')}${chPunc(':')} ${chStr(`'${zone.name}'`)}`);
  if (zone.priority) props.push(`${chProp('priority')}${chPunc(':')} ${chNum(zone.priority)}`);
  if (zone.locked) props.push(`${chProp('locked')}${chPunc(':')} ${chVar('true')}`);
  if (zone.filledAreasThickness !== undefined) {
    props.push(`${chProp('filledAreasThickness')}${chPunc(':')} ${chVar(zone.filledAreasThickness ? 'true' : 'false')}`);
  }
  if (zone.hatchStyle && zone.hatchStyle !== 'edge') {
    props.push(`${chProp('hatchStyle')}${chPunc(':')} ${chStr(`'${zone.hatchStyle}'`)}`);
  }
  if (zone.hatchPitch !== undefined && zone.hatchPitch !== 0.508) {
    props.push(`${chProp('hatchPitch')}${chPunc(':')} ${chNum(zone.hatchPitch)}`);
  }
  props.push(sharedZoneProps(zone, ch));
  return props.filter(Boolean).join(`${chPunc(',')} `);
}

/** A full `typecad.zone({...});` / `typecad.keepout({...});` statement. */
export function zoneCallSource(zone: KicadZoneIR, ch: ChalkHelpers = PLAIN_CH, objectName = 'typecad'): string {
  const { chVar, chPunc, chKey } = ch;
  const method = zone.keepout ? 'keepout' : 'zone';
  return `${chVar(objectName)}${chPunc('.')}${chKey(method)}${chPunc('(')}{ ${zonePropsSource(zone, ch)} ${chPunc('}')}${chPunc(')')}${chPunc(';')}`;
}

export function generateZoneCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  if (ir.zones.length === 0) return;

  logger.log(`Found ${ir.zones.length} zone(s) in ${sourceDescription}. Generating typeCAD code.`);

  logger.log(chalk.bold(`
--- Generated typeCAD Zone Code from ${sourceDescription} ---`));

  for (const zone of ir.zones) {
    logger.log(zoneCallSource(zone, ch));
  }

  logger.log(chalk.bold('-----------------------------------------------------------'));
}

/** Polygon vertices as a `{ x, y }` array literal. */
function pointsExpr(zone: KicadZoneIR, ch: ChalkHelpers): string {
  const { chProp, chNum, chPunc } = ch;
  const pts = zone.polygon
    .map(
      (p) =>
        `{ ${chProp('x')}${chPunc(':')} ${chNum(round3(p.x))}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(round3(p.y))} }`,
    )
    .join(`${chPunc(',')} `);
  return `${chPunc('[')}${pts}${chPunc(']')}`;
}

/**
 * Geometry props for a zone: axis-aligned quadrilateral polygons collapse to
 * the rect form (x/y/width/height, the shape the docs' examples teach);
 * every other polygon keeps its explicit points.
 */
function geometryProps(zone: KicadZoneIR, ch: ChalkHelpers): string {
  const { chProp, chNum, chPunc } = ch;
  const rect = rectFromPolygon(zone.polygon);
  if (rect) {
    return [
      `${chProp('x')}${chPunc(':')} ${chNum(rect.x)}`,
      `${chProp('y')}${chPunc(':')} ${chNum(rect.y)}`,
      `${chProp('width')}${chPunc(':')} ${chNum(rect.width)}`,
      `${chProp('height')}${chPunc(':')} ${chNum(rect.height)}`,
    ].join(`${chPunc(',')} `);
  }
  return `${chProp('points')}${chPunc(':')} ${pointsExpr(zone, ch)}`;
}

/** Rect equivalent of an axis-aligned (closed or open) quadrilateral, else null. */
export function rectFromPolygon(
  points: Array<{ x: number; y: number }>,
): { x: number; y: number; width: number; height: number } | null {
  const pts =
    points.length >= 5 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y
      ? points.slice(0, -1)
      : points;
  if (pts.length !== 4) return null;
  const xs = new Set(pts.map((p) => p.x));
  const ys = new Set(pts.map((p) => p.y));
  if (xs.size !== 2 || ys.size !== 2) return null;
  if (new Set(pts.map((p) => `${p.x},${p.y}`)).size !== 4) return null;
  const [x0, x1] = [...xs];
  const [y0, y1] = [...ys];
  return {
    x: round3(Math.min(x0, x1)),
    y: round3(Math.min(y0, y1)),
    width: round3(Math.abs(x1 - x0)),
    height: round3(Math.abs(y1 - y0)),
  };
}

/**
 * Options shared by both zone kinds: min thickness, pad connection, fill
 * settings (grouped `fill` object for pours).
 */
function sharedZoneProps(zone: KicadZoneIR, ch: ChalkHelpers): string {
  const { chStr, chProp, chNum, chPunc } = ch;
  const props: string[] = [];
  if (zone.minThickness !== undefined)
    props.push(`${chProp('minThickness')}${chPunc(':')} ${chNum(zone.minThickness)}`);
  if (zone.connectPads) props.push(`${chProp('connectPads')}${chPunc(':')} ${chStr(`'${zone.connectPads}'`)}`);
  if (zone.clearance !== undefined) props.push(`${chProp('clearance')}${chPunc(':')} ${chNum(zone.clearance)}`);
  if (zone.fill) {
    const f: string[] = [];
    if (zone.fill.mode === 'hatched') f.push(`${chProp('mode')}${chPunc(':')} ${chStr("'hatched'")}`);
    if (zone.fill.thermalGap !== undefined)
      f.push(`${chProp('thermalGap')}${chPunc(':')} ${chNum(zone.fill.thermalGap)}`);
    if (zone.fill.thermalBridgeWidth !== undefined)
      f.push(`${chProp('thermalBridgeWidth')}${chPunc(':')} ${chNum(zone.fill.thermalBridgeWidth)}`);
    if (zone.fill.islandRemovalMode !== undefined)
      f.push(`${chProp('islandRemovalMode')}${chPunc(':')} ${chNum(zone.fill.islandRemovalMode)}`);
    if (zone.fill.islandAreaMin !== undefined)
      f.push(`${chProp('islandAreaMin')}${chPunc(':')} ${chNum(zone.fill.islandAreaMin)}`);
    if (zone.fill.smoothing) f.push(`${chProp('smoothing')}${chPunc(':')} ${chStr(`'${zone.fill.smoothing}'`)}`);
    if (zone.fill.smoothingRadius !== undefined)
      f.push(`${chProp('smoothingRadius')}${chPunc(':')} ${chNum(zone.fill.smoothingRadius)}`);
    if (zone.fill.hatchThickness !== undefined)
      f.push(`${chProp('hatchThickness')}${chPunc(':')} ${chNum(zone.fill.hatchThickness)}`);
    if (zone.fill.hatchGap !== undefined) f.push(`${chProp('hatchGap')}${chPunc(':')} ${chNum(zone.fill.hatchGap)}`);
    if (zone.fill.hatchOrientation !== undefined)
      f.push(`${chProp('hatchOrientation')}${chPunc(':')} ${chNum(zone.fill.hatchOrientation)}`);
    if (zone.fill.arcSegments !== undefined)
      f.push(`${chProp('arcSegments')}${chPunc(':')} ${chNum(zone.fill.arcSegments)}`);
    if (f.length > 0)
      props.push(`${chProp('fill')}${chPunc(':')} ${chPunc('{')} ${f.join(`${chPunc(',')} `)} ${chPunc('}')}`);
  }
  return props.join(`${chPunc(',')} `);
}

/**
 * Generate the `typecad.create(...)` statement that assembles all components and tracks.
 */
export function generateCreateStatement(
  footprints: KicadFootprintIR[],
  trackVariableNames: string[],
  sourceDescription: string,
  ch: ChalkHelpers = DEFAULT_CH,
): void {
  const { chKey, chPunc, chVar } = ch;
  const componentReferences = footprints.map((fp) => fp.reference);

  if (componentReferences.length > 0 || trackVariableNames.length > 0) {
    logger.log(chalk.bold(`\n--- Generated typecad.create() Statement from ${sourceDescription} ---`));
    let createStatement = `${chVar('typecad')}${chPunc('.')}${chKey('create')}${chPunc('(')}`;
    const allItems: string[] = [
      ...componentReferences.map((ref) => `${chVar(ref)}`),
      ...trackVariableNames.map((trackVar) => `${chPunc('...')}${chVar(trackVar)}`),
    ];
    if (allItems.length > 0) {
      createStatement += '\n';
      allItems.forEach((item, index) => {
        createStatement += `    ${item}`;
        createStatement += index < allItems.length - 1 ? `${chPunc(',')}\n` : '\n';
      });
    }
    createStatement += `${chPunc(')')}${chPunc(';')}`;
    logger.log(createStatement);
    logger.log(chalk.bold('--------------------------------------------------------------'));
  }
}

// === Utility helpers ===

function logLayoutAssignment(ch: ChalkHelpers, variableName: string, propertyName: string, layout: TextLayoutIR): void {
  const { chProp, chNum, chPunc, chVar, chStr } = ch;
  let log = `${chVar(variableName)}${chPunc('.')}${chProp(propertyName)} ${chPunc('=')} ${chPunc('{')}`;
  log += ` ${chProp('x')}${chPunc(':')} ${chNum(layout.x)}${chPunc(',')}`;
  log += ` ${chProp('y')}${chPunc(':')} ${chNum(layout.y)}`;
  if (layout.rotation !== undefined)
    log += `${chPunc(',')} ${chProp('rotation')}${chPunc(':')} ${chNum(layout.rotation)}`;
  if (layout.layer !== undefined)
    log += `${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr("'" + layout.layer + "'")}`;
  if (layout.width !== undefined) log += `${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(layout.width)}`;
  if (layout.height !== undefined) log += `${chPunc(',')} ${chProp('height')}${chPunc(':')} ${chNum(layout.height)}`;
  if (layout.thickness !== undefined)
    log += `${chPunc(',')} ${chProp('thickness')}${chPunc(':')} ${chNum(layout.thickness)}`;
  if (layout.show === false) log += `${chPunc(',')} ${chProp('show')}${chPunc(':')} ${chVar('false')}`;
  log += ` ${chPunc('}')}${chPunc(';')}`;
  logger.log(log);
}

function sanitizeNetNameForVariable(netName: string): string {
  // Strip quotes and replace non-alphanumeric chars with underscores
  return netName
    .replace(/[`'"]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
}
