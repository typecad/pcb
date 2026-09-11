// ---------------------------------------------------------------------------
// editor-integration.ts — create-time VS Code bundling for pin-level hovers
//
// The compiled vscode-typecad-pcb extension (developed in the monorepo under
// packages/vscode-typecad-pcb) ships inside this npm package under
// assets/editor-extensions/, and `typecad-pcb create` copies it into the new
// project's hw/.vscode/extensions/ folder:
//
//   typecad-pcb    — hover a component variable in src/ to see its pads,
//                    nets, and unconnected pins from the compiled board
//                    (thin shell over `typecad-pcb query`).
//
// VS Code (1.89+, trusted workspaces) detects workspace-bundled extensions
// and installs them scoped to that workspace. The companion
// .vscode/extensions.json carries forceInstall entries so VS Code builds with
// that feature skip the approval prompt; older builds show a one-time install
// prompt instead.
//
// Best-effort like the rest of create: a missing or unreadable asset tree
// warns and skips rather than failing project creation — a project without
// the extension builds fine.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../../utils/logging.js';

/** VS Code extension identifier (publisher.name) of the bundled extension. */
export const BUNDLED_EXTENSION_ID = 'typecad.vscode-typecad-pcb';

/** Bundled folder name under assets/editor-extensions/ and in hw/.vscode/extensions/. */
export const BUNDLED_EXTENSION_DIR = 'typecad-pcb';

/**
 * Source location of the unpacked bundled extension inside the @typecad/pcb
 * package. Resolved from this module's location so it works from both src/
 * (dev and tests) and dist/ (the published CLI): both are three levels below
 * the package root (src/cli/create-typecad, dist/cli/create-typecad).
 */
export function bundledExtensionSourceDir(assetsRoot?: string): string {
  const root =
    assetsRoot ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', 'editor-extensions');
  return path.join(root, BUNDLED_EXTENSION_DIR);
}

/** Content of .vscode/extensions.json — auto-installs the bundled extension. */
export function extensionsJson(forceInstall: ReadonlyArray<string> = []): string {
  return `${JSON.stringify({ forceInstall }, null, 2)}\n`;
}

/**
 * Copy the bundled extension into <hwDir>/.vscode/extensions/, then write the
 * companion extensions.json (merging any existing forceInstall entries).
 * Returns the paths written, or [] when the asset tree is missing (warns,
 * never throws). `assetsRoot` overrides the bundled-asset location (tests).
 */
export function writeEditorIntegration(hwDir: string, assetsRoot?: string): string[] {
  const sourceDir = bundledExtensionSourceDir(assetsRoot);
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    logger.warn(`! Editor integration: ${BUNDLED_EXTENSION_DIR} extension assets not found at ${sourceDir} — skipped`);
    return [];
  }

  const vscodeDir = path.join(hwDir, '.vscode');
  const extensionDir = path.join(vscodeDir, 'extensions', BUNDLED_EXTENSION_DIR);
  fs.mkdirSync(extensionDir, { recursive: true });
  // Replace, never merge: a stale file from an older bundled layout would
  // otherwise survive re-creation and extension upgrades.
  fs.rmSync(extensionDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, extensionDir, { recursive: true });

  const extensionsPath = path.join(vscodeDir, 'extensions.json');
  let forceInstall: string[] = [];
  if (fs.existsSync(extensionsPath)) {
    try {
      const doc: unknown = JSON.parse(fs.readFileSync(extensionsPath, 'utf-8'));
      if (doc && typeof doc === 'object' && Array.isArray((doc as { forceInstall?: unknown }).forceInstall)) {
        forceInstall = (doc as { forceInstall: unknown[] }).forceInstall.filter(
          (id): id is string => typeof id === 'string',
        );
      }
    } catch {
      // malformed — start fresh
    }
  }
  if (!forceInstall.includes(BUNDLED_EXTENSION_ID)) {
    forceInstall.push(BUNDLED_EXTENSION_ID);
  }
  fs.writeFileSync(extensionsPath, extensionsJson(forceInstall), 'utf-8');

  return [extensionDir, extensionsPath, writeNpmHiddenSettings(vscodeDir)];
}

// -- npm/scripts hiding -------------------------------------------------------

/**
 * Folder pattern matching the workspace-bundled extension copy. The bundled
 * extension carries its own package.json manifest, which VS Code otherwise
 * picks up as a second npm package in the project.
 */
const BUNDLED_EXTENSION_GLOB = '**/.vscode/extensions/**';

/**
 * Settings that keep the NPM Scripts pane on the PROJECT's scripts (build,
 * gerber_viewer, …) while hiding the workspace-bundled extension's manifest:
 * its folder is excluded from npm detection (no second package appears) and
 * hidden from the Explorer and search — it is internal scaffolding, not user
 * code. `npm.autoDetect` is set to 'on' EXPLICITLY: writing 'off' blanks the
 * NPM Scripts pane, and the explicit value also heals settings written that
 * way by older scaffolds.
 *
 * `npm.exclude` must be a FOLDER glob, no `/package.json` suffix: VS Code
 * (extensions/npm/src/tasks.ts, isExcluded) minimatch's each discovered
 * package.json's PARENT DIRECTORY against the pattern with { dot: true },
 * so a pattern ending in a file name can never match. minimatch normalizes
 * Windows separators in the tested path, so the single forward-slash glob
 * covers both platforms.
 */
const END_USER_NPM_SETTINGS: Record<string, unknown> = {
  'npm.autoDetect': 'on',
  'npm.exclude': BUNDLED_EXTENSION_GLOB,
  'debug.javascript.codelens.npmScripts': 'never',
  'files.exclude': { '.vscode/extensions': true },
  'search.exclude': { '**/.vscode/extensions': true },
};

/**
 * Read-merge-write .vscode/settings.json with the npm-hiding settings.
 * Nested objects (files.exclude, search.exclude) merge key-by-key so user
 * entries in the same map survive; scalars are overwritten. Merge-safe by
 * design — other tooling may contribute settings to the same file.
 */
function writeNpmHiddenSettings(vscodeDir: string): string {
  const settingsPath = path.join(vscodeDir, 'settings.json');
  let doc: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        doc = parsed as Record<string, unknown>;
      }
    } catch {
      // malformed — start fresh
    }
  }
  for (const [key, value] of Object.entries(END_USER_NPM_SETTINGS)) {
    const existingValue = doc[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existingValue &&
      typeof existingValue === 'object' &&
      !Array.isArray(existingValue)
    ) {
      doc[key] = { ...(existingValue as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      doc[key] = value;
    }
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  return settingsPath;
}
