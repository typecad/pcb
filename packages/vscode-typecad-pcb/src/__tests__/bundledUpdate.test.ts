// Bundled-extension self-update: the version comparison and update planning
// that keep workspace copies from rotting at their scaffold-time version.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExtensionUpdate, compareVersions, planExtensionUpdate, shouldUpdate } from '../bundledUpdate.js';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tcupd-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('compareVersions', () => {
  it('orders releases and pre-releases the semver way', () => {
    expect(compareVersions('0.12.0', '0.12.1')).toBeLessThan(0);
    expect(compareVersions('0.13.0', '0.12.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBeLessThan(0);
    expect(compareVersions('1.0.0-alpha.9', '1.0.0-alpha.10')).toBeLessThan(0);
    expect(compareVersions('1.0.0-alpha.3', '1.0.0')).toBeLessThan(0); // release outranks pre-release
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
  it('falls back to string order for unparsable versions', () => {
    expect(compareVersions('banana', 'cherry')).toBeLessThan(0);
  });
});

describe('shouldUpdate', () => {
  it('updates only when the asset is strictly newer', () => {
    expect(shouldUpdate('0.12.0-alpha.3', '0.12.0-alpha.4')).toBe(true);
    expect(shouldUpdate('0.12.0-alpha.4', '0.12.0-alpha.4')).toBe(false);
    expect(shouldUpdate('0.13.0', '0.12.0')).toBe(false); // never downgrade
  });
});

describe('planExtensionUpdate / applyExtensionUpdate', () => {
  const makeCopy = (root: string, version: string) => {
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'vscode-typecad-pcb', version }));
    fs.writeFileSync(path.join(root, 'out', 'extension.js'), `// ${version}`);
  };

  it('plans an update when the workspace asset is newer', () => {
    const hw = tmp();
    const assetRoot = path.join(hw, 'node_modules', '@typecad', 'pcb', 'assets', 'editor-extensions', 'typecad-pcb');
    makeCopy(assetRoot, '0.12.0-alpha.4');
    const self = path.join(hw, '.vscode', 'extensions', 'typecad-pcb');
    makeCopy(self, '0.12.0-alpha.3');
    const plan = planExtensionUpdate(hw, self);
    expect(plan).not.toBeNull();
    expect(plan!.toVersion).toBe('0.12.0-alpha.4');
    applyExtensionUpdate(plan!);
    expect(fs.readFileSync(path.join(self, 'out', 'extension.js'), 'utf8')).toContain('0.12.0-alpha.4');
    expect(JSON.parse(fs.readFileSync(path.join(self, 'package.json'), 'utf8')).version).toBe('0.12.0-alpha.4');
  });

  it('no plan when equal (the dev-monorepo case: the asset IS the source)', () => {
    const hw = tmp();
    const assetRoot = path.join(hw, 'node_modules', '@typecad', 'pcb', 'assets', 'editor-extensions', 'typecad-pcb');
    makeCopy(assetRoot, '0.12.0-alpha.3');
    const self = tmp();
    makeCopy(self, '0.12.0-alpha.3');
    expect(planExtensionUpdate(hw, self)).toBeNull();
  });

  it('no plan without the dependency asset (plain editor install)', () => {
    const hw = tmp(); // no node_modules at all
    const self = tmp();
    makeCopy(self, '0.12.0-alpha.3');
    expect(planExtensionUpdate(hw, self)).toBeNull();
  });
});
