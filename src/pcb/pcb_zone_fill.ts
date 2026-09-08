import fs from 'node:fs';
import path from 'node:path';
import { executeKiCADCommandSync } from '../kicad_commands.js';
import { KiCadCommandError, KiCadNotFoundError } from '../utils/errors.js';
import logger from '../utils/logging.js';
import type { PCB } from './pcb.js';
import type { PcbInternalState } from './pcb_state.js';

/**
 * Zone fills are declarations in typeCAD (`pcb.zone({ fill: ... })` writes
 * the fill configuration), but the fill geometry itself is computed by
 * KiCad — there is no in-process filler. After create() writes the board,
 * this materializes the declared fills by round-tripping the file through
 * `kicad-cli pcb drc --refill-zones --save-board`, which is KiCad's
 * supported way to fill zones headlessly (KiCad ≥ 9; typeCAD supports 10).
 *
 * Because KiCad computes both this fill and the DRC that validates it, the
 * written geometry and the checker can never disagree. The refill is
 * deterministic: identical boards fill to byte-identical files.
 */

/** True when at least one copper pour requests filling. */
export function zoneFillRequested(state: PcbInternalState): boolean {
  return state.zones.some((z) => (z as { filled?: boolean }).filled === true);
}

function boardFilePath(pcb: PCB): string {
  return path.resolve('./build', `${pcb.boardName}.kicad_pcb`);
}

function boardHasFilledPolygons(boardPath: string): boolean {
  try {
    return fs.readFileSync(boardPath, 'utf8').includes('(filled_polygon');
  } catch {
    return false;
  }
}

/** Global opt-out (`new PCB(name, { fill_zones: false })`). */
function fillZonesEnabled(state: PcbInternalState): boolean {
  return state.options.fill_zones !== false;
}

/**
 * Materialize declared zone fills on the written board. Best-effort by
 * design: without kicad-cli (or when it fails) the board is still valid —
 * zones carry their fill configuration and KiCad fills them on demand —
 * but fabrication exports will lack the pour copper until a fill runs, so
 * the skip is always surfaced in a warning.
 */
export function materializeZoneFills(pcb: PCB, state: PcbInternalState): void {
  if (!fillZonesEnabled(state)) return;
  if (!zoneFillRequested(state)) return;

  // Test/CI escape hatch: environments that deliberately run without KiCad.
  if (process.env.KICAD_NOT_AVAILABLE === '1') {
    logger.debug('pcb_zone_fill: KICAD_NOT_AVAILABLE=1 — skipping zone fill');
    return;
  }

  const boardPath = boardFilePath(pcb);
  if (!fs.existsSync(boardPath)) {
    logger.warn('[ZoneFill] Board file not found after write — zone fills left unmaterialized.');
    return;
  }

  const reportPath = path.resolve('./build', `${pcb.boardName}_drc.json`);
  try {
    executeKiCADCommandSync(
      'pcb',
      ['drc', '--refill-zones', '--save-board', '--format', 'json', '-o', reportPath, boardPath],
      { stdio: 'pipe', timeout: 180_000 },
    );
    logger.info('⏦ Zone fills materialized (kicad-cli --refill-zones --save-board).');
    return;
  } catch (error) {
    if (error instanceof KiCadNotFoundError) {
      logger.warn(
        '[ZoneFill] kicad-cli not found — zones are declared but their fill polygons were not computed. ' +
          'Install KiCad 10 or set kicad_cli in typecad.conf.ts; until then exports will not include pour copper.',
      );
      return;
    }
    // kicad-cli pcb drc exits non-zero when the board has violations — even
    // though --save-board has already persisted the refill. Judge success by
    // the file, not the exit code.
    if (error instanceof KiCadCommandError && boardHasFilledPolygons(boardPath)) {
      logger.info('⏦ Zone fills materialized (DRC in the same pass found violations — see the check command).');
      return;
    }
    logger.warn(
      `[ZoneFill] kicad-cli zone fill failed — zones left unmaterialized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
