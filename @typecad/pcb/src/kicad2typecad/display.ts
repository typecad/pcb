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
  const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;
  const segments = ir.segments;
  const nets = ir.nets;
  const vias = ir.vias;
  const trackVariableNames: string[] = [];

  if (segments.length > 0) {
    logger.log(
      `Found ${segments.length} segments. Generating TrackBuilder chains organized by nets from ${sourceDescription}.`,
    );

    const netMap = new Map<number, string>();
    nets.forEach((net) => {
      netMap.set(net.number, net.name);
    });

    const segmentsByNet = new Map<number, KicadSegmentIR[]>();
    segments.forEach((segment) => {
      const netNum = segment.net ?? 0;
      if (!segmentsByNet.has(netNum)) segmentsByNet.set(netNum, []);
      segmentsByNet.get(netNum)!.push(segment);
    });

    const allNetTrackLogs: string[] = [];
    const usedViaIndexes = new Set<number>();

    segmentsByNet.forEach((netSegments, netNum) => {
      const netName = netMap.get(netNum) || '';
      const isUnnamedNet = !netName || netName.startsWith(DEFAULT_NET_PREFIX) || netName === '';

      let variableName: string;
      if (isUnnamedNet) {
        variableName = 'unnamed_Track';
      } else {
        variableName = `track_${sanitizeNetNameForVariable(netName)}`;
      }

      if (!trackVariableNames.includes(variableName)) trackVariableNames.push(variableName);

      if (isUnnamedNet) {
        allNetTrackLogs.push(chalk.gray(`// Unnamed nets (net${netNum})`));
      } else {
        allNetTrackLogs.push(chalk.gray(`// Net: ${netName}`));
      }
      allNetTrackLogs.push(
        `${chVar('let ' + variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`,
      );

      let currentTrackBuilder: TrackBuilder | null = null;
      let lastEndPoint: { x: number; y: number } | null = null;
      let currentChainLog = '';

      netSegments.forEach((segment) => {
        if (
          !currentTrackBuilder ||
          !lastEndPoint ||
          lastEndPoint.x !== segment.start.x ||
          lastEndPoint.y !== segment.start.y
        ) {
          if (currentTrackBuilder && currentChainLog) {
            allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
          }
          currentTrackBuilder = pcb.track().from(segment.start, segment.layer, segment.width);
          currentChainLog = `${chVar(variableName)}${chPunc('.')}${chKey('push')}${chPunc('(')}${chVar('typecad')}${chPunc('.')}${chKey('track')}${chPunc('()')}${chKey('.from')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.start.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.start.y)} }${chPunc(',')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chNum(segment.width)}${chPunc(')')}`;
          currentTrackBuilder.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
          currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
        } else {
          currentTrackBuilder!.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
          currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
        }
        lastEndPoint = segment.end;

        const viaIdx = findViaAtPosition(vias, segment.end.x, segment.end.y, netNum, usedViaIndexes);
        if (viaIdx !== -1) {
          const via = vias[viaIdx];
          usedViaIndexes.add(viaIdx);
          currentChainLog += `${chKey('.via')}${chPunc('(')}{ ${chProp('size')}${chPunc(':')} ${chNum(via.size)}${chPunc(',')} ${chProp('drill')}${chPunc(':')} ${chNum(via.drill)} }${chPunc(')')}`;
        }
      });

      if (currentChainLog) allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
      allNetTrackLogs.push('');
    });

    if (allNetTrackLogs.length > 0) {
      logger.log(chalk.bold(`\n--- Generated typeCAD TrackBuilder Code from ${sourceDescription} ---`));
      allNetTrackLogs.forEach((log) => logger.log(log));
      logger.log(chalk.bold('---------------------------------------------------------'));
    }

    showStandaloneVias(vias, usedViaIndexes, sourceDescription, ch);
  } else if (vias.length > 0) {
    showStandaloneVias(vias, new Set(), sourceDescription, ch);
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

function findViaAtPosition(vias: KicadViaIR[], x: number, y: number, net: number, used: Set<number>): number {
  for (let i = 0; i < vias.length; i++) {
    if (used.has(i)) continue;
    const v = vias[i];
    if (Math.abs(v.at.x - x) < 0.001 && Math.abs(v.at.y - y) < 0.001) {
      if (v.net !== undefined && v.net !== net) continue;
      return i;
    }
  }
  return -1;
}

function showStandaloneVias(
  vias: KicadViaIR[],
  usedViaIndexes: Set<number>,
  sourceDescription: string,
  ch: ChalkHelpers,
): void {
  const standalone = vias.filter((_, i) => !usedViaIndexes.has(i));
  if (standalone.length === 0) return;

  const { chKey, chProp, chNum, chPunc, chVar } = ch;
  logger.log(`Found ${standalone.length} standalone via(es). Generating typeCAD code from ${sourceDescription}.`);
  logger.log(chalk.bold(`\n--- Generated typeCAD Via Code from ${sourceDescription} ---`));
  standalone.forEach((via) => {
    let viaLog = `${chVar('typecad')}${chPunc('.')}${chKey('via')}${chPunc('({')}`;
    viaLog += ` ${chProp('at')}${chPunc(': {')} ${chProp('x')}${chPunc(':')} ${chNum(via.at.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(via.at.y)} ${chPunc('}')}${chPunc(',')}`;
    viaLog += ` ${chProp('size')}${chPunc(':')} ${chNum(via.size)}${chPunc(',')}`;
    viaLog += ` ${chProp('drill')}${chPunc(':')} ${chNum(via.drill)}`;
    viaLog += ` ${chPunc('})')}${chPunc(';')}`;
    logger.log(viaLog);
  });
  logger.log(chalk.bold('-----------------------------------------------------'));
}

/**
 * Generate board outline code display from IR outlines.
 */
export function generateOutlineCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  const { chKey, chStr, chProp, chNum, chPunc, chVar } = ch;
  const outlines = ir.outlines;

  if (outlines.length > 0) {
    logger.log(
      `Found ${outlines.length} board outline element(s) on Edge.Cuts layer. Generating typeCAD code from ${sourceDescription}.`,
    );
    const allOutlineLogs: string[] = [];

    const rectOutlines = outlines.filter((o) => o.type === 'rect');
    const lineOutlines = outlines.filter((o) => o.type === 'line');
    const polyOutlines = outlines.filter((o) => o.type === 'poly');
    const circleOutlines = outlines.filter((o) => o.type === 'circle');
    const hasRectOutline =
      rectOutlines.length === 1 ||
      lineOutlines.length === 4 ||
      lineOutlines.length + outlines.filter((o) => o.type === 'arc').length >= 4;

    if (rectOutlines.length === 1 && polyOutlines.length === 0 && circleOutlines.length === 0) {
      const rect = rectOutlines[0];
      if (rect.start && rect.end && rect.width && rect.height) {
        const x = Math.min(rect.start.x, rect.end.x);
        const y = Math.min(rect.start.y, rect.end.y);
        let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
        outlineLog += `${chNum(x)}${chPunc(',')} ${chNum(y)}${chPunc(',')} ${chNum(rect.width)}${chPunc(',')} ${chNum(rect.height)}`;
        outlineLog += `${chPunc(')')}${chPunc(';')}`;
        allOutlineLogs.push(outlineLog);
      }
    } else if (hasRectOutline && polyOutlines.length === 0 && circleOutlines.length === 0) {
      const arcOutlines = outlines.filter((o) => o.type === 'arc');
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
        let filletRadius: number | null = null;
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
            filletRadius = Math.round((radii.reduce((a, b) => a + b, 0) / radii.length) * 1000) / 1000;
          }
        }

        let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
        outlineLog += `${chNum(minX)}${chPunc(',')} ${chNum(minY)}${chPunc(',')} ${chNum(width)}${chPunc(',')} ${chNum(height)}`;
        if (filletRadius !== null && filletRadius > 0) outlineLog += `${chPunc(',')} ${chNum(filletRadius)}`;
        outlineLog += `${chPunc(')')}${chPunc(';')}`;
        allOutlineLogs.push(outlineLog);
      }
    } else {
      // Non-rectangular outlines: emit executable typeCAD builder calls.
      // A circle/poly that appears alongside a rectangular outer contour
      // is treated as a cutout; otherwise it's the board outline itself.
      const hasOuterRect = rectOutlines.length === 1;
      const arcOutlines = outlines.filter((o) => o.type === 'arc');
      const hasOuter4Line = lineOutlines.length === 4 || lineOutlines.length + arcOutlines.length >= 4;
      const hasOuter = hasOuterRect || hasOuter4Line;

      // Emit the outer rectangular contour first (if present alongside
      // cutouts), so the generated code reads outline → cutout.
      if (hasOuterRect) {
        const rect = rectOutlines[0];
        if (rect.start && rect.end && rect.width && rect.height) {
          const x = Math.min(rect.start.x, rect.end.x);
          const y = Math.min(rect.start.y, rect.end.y);
          let log = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
          log += `${chNum(x)}${chPunc(',')} ${chNum(y)}${chPunc(',')} ${chNum(rect.width)}${chPunc(',')} ${chNum(rect.height)}`;
          log += `${chPunc(')')}${chPunc(';')}`;
          allOutlineLogs.push(log);
        }
      } else if (hasOuter4Line) {
        // Emit the 4-line rectilinear rectangle as an outline too.
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
          let log = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
          log += `${chNum(minX)}${chPunc(',')} ${chNum(minY)}${chPunc(',')} ${chNum(width)}${chPunc(',')} ${chNum(height)}`;
          log += `${chPunc(')')}${chPunc(';')}`;
          allOutlineLogs.push(log);
        }
      }

      for (const circle of circleOutlines) {
        if (!circle.center || !circle.end) continue;
        const radius = Math.sqrt((circle.end.x - circle.center.x) ** 2 + (circle.end.y - circle.center.y) ** 2);
        const method = hasOuter ? 'cutoutCircle' : 'outlineCircle';
        let log = `${chVar('typecad')}${chPunc('.')}${chKey(method)}${chPunc('(')}`;
        log += `${chNum(circle.center.x)}${chPunc(',')} ${chNum(circle.center.y)}${chPunc(',')} ${chNum(round3(radius))}`;
        log += `${chPunc(')')}${chPunc(';')}`;
        allOutlineLogs.push(log);
      }

      for (const poly of polyOutlines) {
        if (!poly.points || poly.points.length < 3) continue;
        const method = hasOuter ? 'cutout' : 'outlinePolygon';
        const ptsStr = poly.points
          .map(
            (p) =>
              `${chPunc('{')} ${chProp('x')}${chPunc(':')} ${chNum(p.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(p.y)} ${chPunc('}')}`,
          )
          .join(`${chPunc(',')} `);
        let log = `${chVar('typecad')}${chPunc('.')}${chKey(method)}${chPunc('(')}`;
        log += `${chPunc('[')}${ptsStr}${chPunc(']')}`;
        log += `${chPunc(')')}${chPunc(';')}`;
        allOutlineLogs.push(log);
      }

      // Emit a comment for any remaining unsupported element types so the
      // user knows something was skipped (e.g. standalone arcs/lines not
      // forming a recognized rectangle).
      const handled = new Set<string>(['rect', 'line', 'arc', 'circle', 'poly']);
      const leftovers = outlines.filter((o) => !handled.has(o.type));
      if (leftovers.length > 0) {
        allOutlineLogs.push(
          chalk.yellow(`// Note: ${leftovers.length} outline element(s) of an unrecognized type were skipped.`),
        );
      }
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
export function generateZoneCode(ir: KicadIR, sourceDescription: string, ch: ChalkHelpers = DEFAULT_CH): void {
  const { chKey, chStr, chProp, chNum, chPunc, chVar } = ch;
  if (ir.zones.length === 0) return;

  logger.log(`Found ${ir.zones.length} zone(s) in ${sourceDescription}. Generating typeCAD code.`);

  logger.log(chalk.bold(`\n--- Generated typeCAD Zone Code from ${sourceDescription} ---`));

  for (const zone of ir.zones) {
    const props: string[] = [];

    if (zone.keepout) {
      // Rule area
      props.push(
        `${chProp('layers')}${chPunc(':')} ${chPunc('[')}${zone.layers.map((l) => chStr(`'${l}'`)).join(`${chPunc(',')} `)}${chPunc(']')}`,
      );
      props.push(`${chProp('points')}${chPunc(':')} ${pointsExpr(zone, ch)}`);
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
      logger.log(
        `${chVar('typecad')}${chPunc('.')}${chKey('keepout')}${chPunc('(')}{ ${props.filter(Boolean).join(`${chPunc(',')} `)} ${chPunc('}')}${chPunc(')')}${chPunc(';')}`,
      );
    } else {
      // Filled pour
      if (zone.netName) props.push(`${chProp('net')}${chPunc(':')} ${chStr(`'${zone.netName}'`)}`);
      props.push(
        `${chProp('layers')}${chPunc(':')} ${chPunc('[')}${zone.layers.map((l) => chStr(`'${l}'`)).join(`${chPunc(',')} `)}${chPunc(']')}`,
      );
      props.push(`${chProp('points')}${chPunc(':')} ${pointsExpr(zone, ch)}`);
      if (zone.name) props.push(`${chProp('name')}${chPunc(':')} ${chStr(`'${zone.name}'`)}`);
      if (zone.priority) props.push(`${chProp('priority')}${chPunc(':')} ${chNum(zone.priority)}`);
      if (zone.locked) props.push(`${chProp('locked')}${chPunc(':')} ${chVar('true')}`);
      if (zone.filledAreasThickness !== undefined) {
        props.push(
          `${chProp('filledAreasThickness')}${chPunc(':')} ${chVar(zone.filledAreasThickness ? 'true' : 'false')}`,
        );
      }
      if (zone.hatchStyle && zone.hatchStyle !== 'edge') {
        props.push(`${chProp('hatchStyle')}${chPunc(':')} ${chStr(`'${zone.hatchStyle}'`)}`);
      }
      if (zone.hatchPitch !== undefined && zone.hatchPitch !== 0.508) {
        props.push(`${chProp('hatchPitch')}${chPunc(':')} ${chNum(zone.hatchPitch)}`);
      }
      props.push(sharedZoneProps(zone, ch));
      logger.log(
        `${chVar('typecad')}${chPunc('.')}${chKey('zone')}${chPunc('(')}{ ${props.filter(Boolean).join(`${chPunc(',')} `)} ${chPunc('}')}${chPunc(')')}${chPunc(';')}`,
      );
    }
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
