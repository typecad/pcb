import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Config, loadConfig, clearConfigCache, defineConfig } from '../src/config.js';

describe('defineConfig', () => {
  it('should return the config object as-is', () => {
    const config = defineConfig({ entry: './src/main.ts', verbose: true });
    expect(config.entry).toBe('./src/main.ts');
    expect(config.verbose).toBe(true);
  });

  it('should allow arbitrary keys', () => {
    const config = defineConfig({ custom: 'value' });
    expect((config as any).custom).toBe('value');
  });
});

describe('loadConfig', () => {
  const tmpDir = path.join(os.tmpdir(), `typecad-conf-test-${Date.now()}`);
  let originalCwd: string;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    clearConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty config when no config file exists', () => {
    const config = loadConfig();
    expect(config.entry).toBeUndefined();
  });

  it('should load a typecad.conf.ts file', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.conf.ts'), `export default { entry: './src/app.ts' };\n`);
    const config = loadConfig();
    expect(config.entry).toBe('./src/app.ts');
  });

  it('should fall back to typecad.json when no conf file exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.json'), JSON.stringify({ entry: './src/fallback.ts' }));
    const config = loadConfig();
    expect(config.entry).toBe('./src/fallback.ts');
  });

  it('should prefer typecad.conf.ts over typecad.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.conf.ts'), `export default { entry: './src/from-conf.ts' };\n`);
    fs.writeFileSync(path.join(tmpDir, 'typecad.json'), JSON.stringify({ entry: './src/from-json.ts' }));
    const config = loadConfig();
    expect(config.entry).toBe('./src/from-conf.ts');
  });

  it('should cache the config result', () => {
    const c1 = loadConfig();
    const c2 = loadConfig();
    expect(c1).toBe(c2);
  });

  it('should throw on malformed typecad.conf.ts', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.conf.ts'), 'this is {{{ not valid JS');
    expect(() => loadConfig()).toThrow(/Cannot load typecad\.conf\.ts/);
  });

  it('clearConfigCache should force reload', () => {
    loadConfig();
    clearConfigCache();
    const c = loadConfig();
    expect(c).toBeDefined();
  });
});

describe('Config (legacy)', () => {
  const tmpDir = path.join(os.tmpdir(), `typecad-config-legacy-${Date.now()}`);
  let originalCwd: string;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    clearConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty string for missing key when no config file exists', () => {
    const config = new Config();
    expect(config.get('nonexistent')).toBe('');
  });

  it('should read a value from typecad.json fallback', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.json'), JSON.stringify({ kicad_cli: '/usr/bin/kicad-cli' }));
    const config = new Config();
    expect(config.get('kicad_cli')).toBe('/usr/bin/kicad-cli');
  });

  it('should return empty string for a key not in the config', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.json'), JSON.stringify({ kicad_cli: '/usr/bin/kicad-cli' }));
    const config = new Config();
    expect(config.get('other_key')).toBe('');
  });

  it('should write a value and read it back via typecad.json', () => {
    const config = new Config();
    expect(config.set('test_key', 'test_value')).toBe(true);
    clearConfigCache();
    const config2 = new Config();
    expect(config2.get('test_key')).toBe('test_value');
  });

  it('should handle malformed JSON gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'typecad.json'), '{ invalid json');
    const config = new Config();
    expect(config.get('any_key')).toBe('');
  });
});
