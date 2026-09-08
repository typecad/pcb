import type { DrillImage, Point, Units } from './types.js';

export interface ParseExcellonOptions {
  name?: string;
}

/**
 * Parse an Excellon (FMAT,2) drill file. Supports absolute point drilling and
 * basic routed slots (G00/M15/G01/M16). Decimal-point coordinates are used
 * when present (KiCad writes them); otherwise the header LZ/TZ mode applies.
 */
export function parseExcellon(source: string, options: ParseExcellonOptions = {}): DrillImage {
  const image: DrillImage = {
    sourceName: options.name ?? 'drill',
    units: 'in',
    tools: new Map(),
    holes: [],
    slots: [],
    attributes: {},
    warnings: [],
  };
  const warnings = image.warnings;

  let inHeader = false;
  let zeroMode: 'L' | 'T' = 'L'; // LZ: leading zeros suppressed (pad left)
  let sawZeroMode = false;
  let integerDigits = 2;
  let decimalDigits = 4;
  let currentTool: number | null = null;
  let mode: 'drill' | 'route' = 'drill';
  let penDown = false;
  let last: Point | null = null;

  const coord = (raw: string): number => {
    if (raw.includes('.')) return parseFloat(raw);
    const negative = raw.startsWith('-');
    let digits = raw.replace(/^[+-]/, '');
    const total = integerDigits + decimalDigits;
    if (zeroMode === 'T' && digits.length < total) digits = digits.padEnd(total, '0');
    const value = parseInt(digits || '0', 10) / Math.pow(10, decimalDigits);
    return negative ? -value : value;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // X2 attributes embedded as ";#@! TF..." comments
    const attrMatch = /^(?:;|\/)?\s*#@!\s*(TF\..*)$/.exec(line);
    if (attrMatch) {
      const fields = attrMatch[1]!.slice(3).split(',');
      if (fields[0] === 'FileFunction') image.attributes.fileFunction = fields.slice(1).join(',');
      else if (fields[0] === 'FilePolarity') image.attributes.filePolarity = fields.slice(1).join(',');
      continue;
    }
    if (line.startsWith(';') || line.startsWith('/')) continue; // plain comment

    if (line === 'M48') {
      inHeader = true;
      continue;
    }
    if (line === '%') {
      inHeader = false;
      continue;
    }
    if (line === 'M30' || line === 'M00') break;

    if (inHeader) {
      if (line.startsWith('METRIC') || line.startsWith('INCH')) {
        const isMetric = line.startsWith('METRIC');
        image.units = (isMetric ? 'mm' : 'in') as Units;
        integerDigits = isMetric ? 3 : 2;
        decimalDigits = isMetric ? 3 : 4;
        const mode = /,(LZ|TZ)/.exec(line);
        if (mode) {
          zeroMode = mode[1] === 'LZ' ? 'L' : 'T';
          sawZeroMode = true;
        }
        continue;
      }
      if (line.startsWith('FMAT')) continue;
      const tool = /^T(\d+)(?:C([\d.]+))?/.exec(line);
      if (tool && tool[2] !== undefined) {
        image.tools.set(parseInt(tool[1]!, 10), {
          code: parseInt(tool[1]!, 10),
          diameter: parseFloat(tool[2]!),
        });
        continue;
      }
      if (/^(ICI|ATC|VER|R,T|M95|DETECT)/i.test(line)) continue;
      continue; // unknown header lines are ignored
    }

    // ---- body ----
    if (line.startsWith('VER') || line.startsWith('FMAT')) continue;
    if (/^R\d/.test(line)) {
      warnings.push(`hole repetition "${line}" is not supported and was skipped`);
      continue;
    }

    // G-code possibly glued to coordinates on the same line ("G00X5.0Y5.0")
    const gPrefix = /^G(\d+)(.*)$/.exec(line);
    if (gPrefix) {
      const g = parseInt(gPrefix[1]!, 10);
      if (g === 5) {
        if (penDown) penDown = false; // implicit retract
        mode = 'drill';
      } else if (g === 0) {
        mode = 'route';
      } else if (g === 1) {
        // linear route move
      } else if (g === 90) {
        // absolute (assumed)
      } else if (g === 91) {
        warnings.push('incremental drilling coordinates (G91) are not supported');
      } else {
        warnings.push(`unsupported code G${g} ignored`);
      }
      line = gPrefix[2]!.trim();
      if (!line) continue;
    }
    if (line === 'M15') {
      penDown = true;
      continue;
    }
    if (line === 'M16' || line === 'M17') {
      penDown = false;
      continue;
    }

    const toolSelect = /^T(\d+)$/.exec(line);
    if (toolSelect) {
      const code = parseInt(toolSelect[1]!, 10);
      if (code === 0) {
        currentTool = null; // T0 = no tool
      } else {
        currentTool = code;
        if (!image.tools.has(code)) warnings.push(`tool T${code} selected but never defined`);
      }
      continue;
    }
    // tool redefinition in body (rare): T1C0.6
    const toolDef = /^T(\d+)C([\d.]+)/.exec(line);
    if (toolDef) {
      image.tools.set(parseInt(toolDef[1]!, 10), {
        code: parseInt(toolDef[1]!, 10),
        diameter: parseFloat(toolDef[2]!),
      });
      currentTool = parseInt(toolDef[1]!, 10);
      continue;
    }

    const hasCoords = /[XY]/.test(line);
    if (!hasCoords) continue;
    if (mode === 'drill' && !sawZeroMode && !/[XY]-?\d*\./.test(line)) {
      warnings.push('no decimal points and no LZ/TZ mode; assuming leading-zero suppression');
      sawZeroMode = true;
    }
    const xm = /X([+-]?[\d.]+)/.exec(line);
    const ym = /Y([+-]?[\d.]+)/.exec(line);
    const pt: Point = {
      x: xm ? coord(xm[1]!) : (last?.x ?? 0),
      y: ym ? coord(ym[1]!) : (last?.y ?? 0),
    };
    if (currentTool === null) {
      warnings.push(`coordinates without a tool selected: "${line}"`);
      last = pt;
      continue;
    }
    if (mode === 'drill') {
      image.holes.push({ tool: currentTool, at: pt });
    } else if (penDown && last) {
      image.slots.push({ tool: currentTool, from: last, to: pt });
    }
    last = pt;
  }

  if (penDown) warnings.push('file ended with the route pen still down');
  return image;
}
