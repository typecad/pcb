import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUNDLED_EXTENSION_DIR,
  BUNDLED_EXTENSION_ID,
  extensionsJson,
  writeEditorIntegration,
} from '../editor_integration.js';

let tmp: string;
let hwDir: string;
let assetsRoot: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-integration-'));
  hwDir = path.join(tmp, 'hw');
  fs.mkdirSync(hwDir, { recursive: true });
  // Fixture asset tree shaped like the real bundled extension.
  assetsRoot = path.join(tmp, 'assets', 'editor-extensions');
  const extDir = path.join(assetsRoot, BUNDLED_EXTENSION_DIR);
  fs.mkdirSync(path.join(extDir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(extDir, 'package.json'), '{"name":"vscode-typecad-pcb"}');
  fs.writeFileSync(path.join(extDir, 'out', 'extension.js'), '// compiled');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('extensionsJson', () => {
  it('carries the forceInstall entry VS Code reads', () => {
    expect(JSON.parse(extensionsJson([BUNDLED_EXTENSION_ID]))).toEqual({
      forceInstall: [BUNDLED_EXTENSION_ID],
    });
  });
});

describe('writeEditorIntegration', () => {
  it('copies the bundled extension and writes extensions.json + npm-hiding settings', () => {
    const written = writeEditorIntegration(hwDir, assetsRoot);
    expect(written).toHaveLength(3);
    expect(fs.existsSync(path.join(hwDir, '.vscode', 'extensions', BUNDLED_EXTENSION_DIR, 'out', 'extension.js'))).toBe(
      true,
    );
    expect(JSON.parse(fs.readFileSync(path.join(hwDir, '.vscode', 'extensions.json'), 'utf-8'))).toEqual({
      forceInstall: [BUNDLED_EXTENSION_ID],
    });
  });

  it('hides the bundled extension from the NPM Scripts pane and Explorer', () => {
    writeEditorIntegration(hwDir, assetsRoot);
    const doc = JSON.parse(fs.readFileSync(path.join(hwDir, '.vscode', 'settings.json'), 'utf-8'));
    // explicit 'on' — 'off' would blank the pane entirely
    expect(doc['npm.autoDetect']).toBe('on');
    // folder glob, no /package.json suffix (VS Code matches parent dirs)
    expect(doc['npm.exclude']).toBe('**/.vscode/extensions/**');
    expect(doc['debug.javascript.codelens.npmScripts']).toBe('never');
    expect(doc['files.exclude']).toEqual({ '.vscode/extensions': true });
    expect(doc['search.exclude']).toEqual({ '**/.vscode/extensions': true });
  });

  it('merges settings key-by-key so user entries survive', () => {
    const vscodeDir = path.join(hwDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({ 'files.exclude': { '**/build': true }, 'editor.formatOnSave': true }, null, 2),
    );
    writeEditorIntegration(hwDir, assetsRoot);
    const doc = JSON.parse(fs.readFileSync(path.join(vscodeDir, 'settings.json'), 'utf-8'));
    expect(doc['files.exclude']).toEqual({ '**/build': true, '.vscode/extensions': true });
    expect(doc['editor.formatOnSave']).toBe(true);
  });

  it('heals an npm.autoDetect: off written by older scaffolds', () => {
    const vscodeDir = path.join(hwDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify({ 'npm.autoDetect': 'off' }));
    writeEditorIntegration(hwDir, assetsRoot);
    const doc = JSON.parse(fs.readFileSync(path.join(vscodeDir, 'settings.json'), 'utf-8'));
    expect(doc['npm.autoDetect']).toBe('on');
  });

  it('preserves forceInstall entries written by other tooling', () => {
    const vscodeDir = path.join(hwDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'extensions.json'),
      JSON.stringify({ forceInstall: ['typecad.typecad-ui'] }, null, 2),
    );
    writeEditorIntegration(hwDir, assetsRoot);
    const doc = JSON.parse(fs.readFileSync(path.join(vscodeDir, 'extensions.json'), 'utf-8'));
    expect(doc.forceInstall).toEqual(['typecad.typecad-ui', BUNDLED_EXTENSION_ID]);
  });

  it('is idempotent — re-running does not duplicate the id', () => {
    writeEditorIntegration(hwDir, assetsRoot);
    writeEditorIntegration(hwDir, assetsRoot);
    const doc = JSON.parse(fs.readFileSync(path.join(hwDir, '.vscode', 'extensions.json'), 'utf-8'));
    expect(doc.forceInstall).toEqual([BUNDLED_EXTENSION_ID]);
  });

  it('replaces a malformed extensions.json instead of failing', () => {
    const vscodeDir = path.join(hwDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'extensions.json'), '{ not json');
    expect(() => writeEditorIntegration(hwDir, assetsRoot)).not.toThrow();
  });

  it('skips with [] when the asset tree is missing', () => {
    const written = writeEditorIntegration(hwDir, path.join(tmp, 'nowhere'));
    expect(written).toEqual([]);
    expect(fs.existsSync(path.join(hwDir, '.vscode', 'extensions', BUNDLED_EXTENSION_DIR))).toBe(false);
  });
});
