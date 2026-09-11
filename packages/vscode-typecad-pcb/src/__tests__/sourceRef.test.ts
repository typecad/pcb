import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseSourceLocation } from '../sourceRef.js';

describe('parseSourceLocation', () => {
  it('resolves a relative path and 1-based line against the hw folder', () => {
    const loc = parseSourceLocation('C:/proj/hw', 'src/rd_skeleton.ts:16');
    expect(loc).toEqual({ fsPath: path.resolve('C:/proj/hw', 'src/rd_skeleton.ts'), line: 16 });
  });

  it('handles Windows drive-colon paths by splitting on the last colon', () => {
    const loc = parseSourceLocation('C:/proj/hw', 'src/a.ts:3');
    expect(loc?.line).toBe(3);
  });

  it('returns line 0 when the board carried no line info', () => {
    expect(parseSourceLocation('C:/proj/hw', 'src/a.ts')?.line).toBe(0);
  });

  it('rejects absent, empty, and malformed metadata', () => {
    expect(parseSourceLocation('C:/proj/hw', undefined)).toBeNull();
    expect(parseSourceLocation('C:/proj/hw', '')).toBeNull();
    expect(parseSourceLocation('C:/proj/hw', 'src/a.ts:notaline')).toBeNull();
  });

  it('rejects paths that escape the project', () => {
    expect(parseSourceLocation('C:/proj/hw', '../outside.ts:1')).toBeNull();
    expect(parseSourceLocation('C:/proj/hw', path.resolve(path.sep, 'elsewhere', 'a.ts') + ':1')).toBeNull();
  });
});
