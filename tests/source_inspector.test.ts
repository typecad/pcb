import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inspectSource } from '../src/utils/source_inspector.js';

describe('inspectSource', () => {
  const tmpDir = path.join(os.tmpdir(), `typecad-inspector-test-${Date.now()}`);
  let originalCwd: string;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSource(filename: string, content: string): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should extract variable name from const declaration', () => {
    const filePath = writeSource(
      'test1.ts',
      `import { Component } from './component.js'
const resistor = new Component({ reference: 'R1', value: '10k' })
console.log(resistor)
`,
    );

    const result = inspectSource(filePath, 2);
    expect(result.variable).toBe('resistor');
  });

  it('should extract params from constructor call', () => {
    const filePath = writeSource(
      'test2.ts',
      `import { Component } from './component.js'
const resistor = new Component({ reference: 'R1', value: '10k' })
console.log(resistor)
`,
    );

    const result = inspectSource(filePath, 2);
    expect(result.variable).toBe('resistor');
    expect(result.params).toBeDefined();
    expect(result.params?.reference).toBe('R1');
    expect(result.params?.value).toBe('10k');
  });

  it('should extract params with numeric values', () => {
    const filePath = writeSource(
      'test3.ts',
      `const cap = new Component({ reference: 'C1', voltage: 25 })
`,
    );

    const result = inspectSource(filePath, 1);
    expect(result.variable).toBe('cap');
    expect(result.params?.reference).toBe('C1');
    expect(result.params?.voltage).toBe(25);
  });

  it('should return empty object for missing file', () => {
    const result = inspectSource('/nonexistent/file.ts', 1);
    expect(result).toEqual({});
  });

  it('should return empty object for line number out of range', () => {
    const filePath = writeSource('test4.ts', `const x = 1\n`);
    const result = inspectSource(filePath, 999);
    expect(result).toBeDefined();
  });

  it('should handle new expression without assignment', () => {
    const filePath = writeSource(
      'test5.ts',
      `new Component({ reference: 'R1' })
`,
    );

    const result = inspectSource(filePath, 1);
    expect(result.variable).toBeUndefined();
  });

  it('should handle source with no matching pattern', () => {
    const filePath = writeSource(
      'test6.ts',
      `const x = 42
const y = "hello"
console.log(x + y)
`,
    );

    const result = inspectSource(filePath, 1);
    expect(result).toEqual({});
  });

  it('should handle assignment expression (not declaration)', () => {
    const filePath = writeSource(
      'test7.ts',
      `let comp
comp = new Component({ reference: 'U1' })
`,
    );

    const result = inspectSource(filePath, 2);
    expect(result.variable).toBe('comp');
  });

  it('should handle empty constructor call', () => {
    const filePath = writeSource(
      'test8.ts',
      `const comp = new Component()
`,
    );

    const result = inspectSource(filePath, 1);
    expect(result.variable).toBe('comp');
    expect(result.params).toBeUndefined();
  });
});
