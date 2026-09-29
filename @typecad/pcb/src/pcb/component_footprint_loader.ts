import fs from 'node:fs';
import { parseAsList, prettyPrint, Sym } from '../sexpr/index.js';
import { libraryRoots } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import logger from '../utils/logging.js';
import { upgradeFootprintLibrary } from './footprint_upgrade.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';
import { getBuildDir } from '../utils/constants.js';

export function loadFootprintLib(
  footprint: string,
  reference: string,
  value: string,
  cachedContent: string | undefined,
): string {
  if (cachedContent && cachedContent !== '') return cachedContent;

  const footprint_file_name = footprint.split(LIBRARY_SEPARATOR);

  // Library roots, not the CLI: with no install the project's
  // build/lib/footprints/ carries the footprint.
  const kicad_footprint = libraryRoots().footprints ?? '';

  const kicadFootprintPath = kicad_footprint
    ? `${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`
    : '';

  logger.debug(
    `[FootprintLoader] footprint=${footprint}, footprints_dir=${kicad_footprint || '(empty)'}, resolved=${kicadFootprintPath || '(none)'}, exists=${kicadFootprintPath ? fs.existsSync(kicadFootprintPath) : 'N/A'}`,
  );

  if (kicadFootprintPath && fs.existsSync(kicadFootprintPath)) {
    try {
      const footprint_file_contents = fs.readFileSync(kicadFootprintPath, 'utf8');
      const l = parseAsList(footprint_file_contents);
      if (Sym.isSym(l[0]) && l[0].name === 'module') {
        l[0] = Sym.for('footprint');
      }
      return prettyPrint(l);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const site = getCallSite();
      const error = new ComponentError(
        formatSourceError(
          `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] Error reading footprint from ${kicadFootprintPath}: ${msg}`,
          site,
        ),
      );
      error.stack = error.message;
      throw error;
    }
  }

  logger.debug(`[FootprintLoader] KiCad path not available, trying fallback ./build/lib/footprints/`);

  // the old kicad-cli call here passed --output equal to the input, which
  // kicad-cli always rejects ("output path must not conflict") — it never
  // did anything. The native upgrader upgrades the local lib copy in place.
  try {
    const libDir = `${getBuildDir()}/lib/footprints/`;
    if (fs.existsSync(libDir)) {
      const upgraded = upgradeFootprintLibrary(libDir);
      if (upgraded.errors > 0 && process.env.TYPECAD_DEBUG === '1') {
        logger.warn(
          '[typeCAD] Footprint upgrade issues:',
          upgraded.files.filter((f) => f.status === 'error'),
        );
      }
    }
  } catch (e) {
    if (process.env.TYPECAD_DEBUG === '1') {
      logger.warn('[typeCAD] Footprint upgrade failed:', e instanceof Error ? e.message : String(e));
    }
  }

  const buildFootprintPath = `${getBuildDir()}/lib/footprints/${footprint_file_name[1]}.kicad_mod`;
  if (fs.existsSync(buildFootprintPath)) {
    try {
      const footprint_file_contents = fs.readFileSync(buildFootprintPath, 'utf8');
      const l = parseAsList(footprint_file_contents);
      if (Sym.isSym(l[0]) && l[0].name === 'module') {
        l[0] = Sym.for('footprint');
      }
      return prettyPrint(l);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const site = getCallSite();
      const error = new ComponentError(
        formatSourceError(
          `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] Error reading fallback footprint from ${buildFootprintPath}: ${msg}`,
          site,
        ),
      );
      error.stack = error.message;
      throw error;
    }
  }

  const searched = [kicadFootprintPath || '(no install/conf footprint dir)', buildFootprintPath]
    .filter(Boolean)
    .join(', ');

  const site = getCallSite();
  const error = new ComponentError(
    formatSourceError(
      `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] Footprint file not found. Searched: ${searched}. ` +
        `Add it to the project with: typecad-pcb lib add --footprint ${footprint}`,
      site,
    ),
  );
  error.stack = error.message;
  throw error;
}
