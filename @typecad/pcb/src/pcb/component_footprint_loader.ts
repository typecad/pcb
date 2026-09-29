import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAsList, prettyPrint, Sym } from '../sexpr/index.js';
import { libraryRoots } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import logger from '../utils/logging.js';
import { upgradeFootprintLibrary } from './footprint_upgrade.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';
import { getBuildDir } from '../utils/constants.js';

/**
 * Footprints shipped inside @typecad/pcb (`bundled/footprints/` at the
 * package root) — the chip passives the size tables default to, resolved
 * as the last resort after install/conf and the project's build/lib.
 */
function bundledFootprintPath(footprintName: string): string {
  return fileURLToPath(new URL(`../../bundled/footprints/${footprintName}.kicad_mod`, import.meta.url));
}

/** read + normalize a .kicad_mod (legacy `(module` heads become `(footprint`) */
function readFootprintFile(filePath: string): string {
  const footprint_file_contents = fs.readFileSync(filePath, 'utf8');
  const l = parseAsList(footprint_file_contents);
  if (Sym.isSym(l[0]) && l[0].name === 'module') {
    l[0] = Sym.for('footprint');
  }
  return prettyPrint(l);
}

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
      return readFootprintFile(buildFootprintPath);
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

  // bundled chip passives (Resistor/Capacitor/Inductor/Diode/LED/Fuse size
  // presets) — the out-of-box `new Resistor()` works with no install
  const bundledPath = bundledFootprintPath(footprint_file_name[1]!);
  if (fs.existsSync(bundledPath)) {
    try {
      return readFootprintFile(bundledPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const site = getCallSite();
      const error = new ComponentError(
        formatSourceError(
          `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${footprint}] Error reading bundled footprint from ${bundledPath}: ${msg}`,
          site,
        ),
      );
      error.stack = error.message;
      throw error;
    }
  }

  const searched = [
    kicadFootprintPath || '(no install/conf footprint dir)',
    buildFootprintPath,
    bundledFootprintPath(footprint_file_name[1]!),
  ]
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
