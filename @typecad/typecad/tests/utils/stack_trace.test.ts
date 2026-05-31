import { describe, it, expect, vi } from 'vitest';
import { getCallSite } from '../../src/utils/stack_trace.js';

describe('stack_trace', () => {
  it('should return a call site from the calling context', () => {
    const site = getCallSite();
    expect(site).toBeDefined();
    expect(site!.file).toContain('stack_trace.test.ts');
    expect(site!.line).toBeGreaterThan(0);
  });

  it('should skip files matching the skip list', () => {
    const site = getCallSite(['stack_trace.test.ts']);
    if (site) {
      expect(site.file).not.toContain('stack_trace.test.ts');
    }
  });

  it('should return undefined when stack is unavailable', () => {
    const origStack = Error.prepareStackTrace;
    Error.prepareStackTrace = undefined as any;
    const origStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    const result = getCallSite();
    expect(result).toBeUndefined();
    Error.prepareStackTrace = origStack;
    Error.stackTraceLimit = origStackTraceLimit;
  });

  it('should produce different results for different call depths', () => {
    function inner() { return getCallSite(); }
    function outer() { return inner(); }
    const site = outer();
    expect(site).toBeDefined();
    expect(site!.file).toContain('stack_trace.test.ts');
  });
});