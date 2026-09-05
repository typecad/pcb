import fs from 'node:fs';
import { parseAsList, prettyPrint, Sym } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { KiCAD } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import logger from '../utils/logging.js';
import { executeKiCADCommandSync } from '../kicad_commands.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';

export function loadFootprintLib(
  footprint: string,
  reference: string,
  value: string,
  cachedContent: string | undefined,
): string {
  if (cachedContent && cachedContent !== '') return cachedContent;

  const footprint_file_name = footprint.split(LIBRARY_SEPARATOR);

  const kicad = KiCAD.instance;
  const libraryPaths = kicad.getLibraryPaths();
  const kicad_footprint = libraryPaths.footprints;

  const kicadFootprintPath = kicad_footprint
    ? `${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`
    : '';

  logger.debug(
    `[FootprintLoader] footprint=${footprint}, isFlatpak=${kicad.isFlatpak}, footprints_dir=${kicad_footprint || '(empty)'}, resolved=${kicadFootprintPath || '(none)'}, exists=${kicadFootprintPath ? fs.existsSync(kicadFootprintPath) : 'N/A'}`,
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

  try {
    executeKiCADCommandSync('fp', ['upgrade', '--output', './build/lib/footprints/', './build/lib/footprints/'], {
      stdio: 'ignore',
    });
  } catch (e) {
    if (process.env.TYPECAD_DEBUG === '1') {
      logger.warn('[typeCAD] Footprint upgrade failed:', e instanceof Error ? e.message : String(e));
    }
  }

  const buildFootprintPath = `./build/lib/footprints/${footprint_file_name[1]}.kicad_mod`;
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

  const searched = [kicadFootprintPath || '(no KiCad footprint path resolved)', buildFootprintPath]
    .filter(Boolean)
    .join(', ');

  const site = getCallSite();
  const error = new ComponentError(
    formatSourceError(
      `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] Footprint file not found. Searched: ${searched}. ` +
        `isFlatpak=${kicad.isFlatpak}, footprints_dir="${kicad_footprint || '(empty)'}". ` +
        `Ensure KiCad footprint libraries are installed.`,
      site,
    ),
  );
  error.stack = error.message;
  throw error;
}
