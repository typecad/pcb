import fs from 'node:fs';
import path from 'node:path';
import type { KiCadCheckResult, KiCadViolation } from './pipeline.js';
import { computeNativeDrc } from './commands/drc.js';

/**
 * Native ERC as a check step — reads the report the build wrote (the build
 * runs the engine over the typeCAD object model and persists
 * <name>_erc.json next to the schematic). The report must be at least as
 * fresh as the schematic: a report older than the .kicad_sch is from a
 * previous build and is not this board's result.
 */
export function nativeErcStep(schPath: string): KiCadCheckResult {
  const reportPath = path.join(
    path.dirname(schPath),
    path.basename(schPath, '.kicad_sch') + '_erc.json',
  );
  try {
    if (
      !fs.existsSync(reportPath) ||
      fs.statSync(reportPath).mtimeMs < fs.statSync(schPath).mtimeMs
    ) {
      return {
        ran: false,
        passed: false,
        reason: 'No native ERC report from a current build — build first, or pass --kicad',
        errors: 0,
        warnings: 0,
        violations: [],
      };
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      sheets?: Array<{ violations?: KiCadViolation[] }>;
    };
    const violations: KiCadViolation[] = [];
    for (const sheet of report.sheets ?? []) {
      violations.push(...(sheet.violations ?? []));
    }
    let errors = 0;
    let warnings = 0;
    for (const v of violations) {
      if (v.severity === 'error') errors++;
      else if (v.severity === 'warning') warnings++;
    }
    return {
      ran: true,
      passed: errors === 0 && warnings === 0,
      errors,
      warnings,
      violations,
      reportPath,
    };
  } catch (e) {
    return {
      ran: false,
      passed: false,
      reason: e instanceof Error ? e.message : String(e),
      errors: 0,
      warnings: 0,
      violations: [],
    };
  }
}

/** Native DRC as a check step — runs the engine (constraints from the
 *  board's .kicad_pro) and shapes the report like a kicad-cli result. */
export async function nativeDrcStep(pcbPath: string): Promise<KiCadCheckResult> {
  try {
    const { report, reportPath } = await computeNativeDrc(pcbPath);
    let errors = 0;
    let warnings = 0;
    const violations = report.violations.map((v) => ({
      type: v.type,
      severity: v.severity,
      description: v.description,
      items: v.items,
    }));
    for (const v of report.violations) {
      if (v.severity === 'error') errors++;
      else if (v.severity === 'warning') warnings++;
    }
    const unconnectedItems = report.unconnected_items.length;
    return {
      ran: true,
      passed: errors === 0 && warnings === 0 && unconnectedItems === 0,
      errors,
      warnings,
      violations,
      unconnectedItems,
      reportPath,
    };
  } catch (e) {
    return {
      ran: false,
      passed: false,
      reason: e instanceof Error ? e.message : String(e),
      errors: 0,
      warnings: 0,
      violations: [],
    };
  }
}
