import { describe, expect, it } from 'vitest';
import { isBoardSourceFile } from '../boardSource.js';

const HW = 'C:/proj/demo/hw';

describe('isBoardSourceFile', () => {
  it('accepts TypeScript files under the hw folder (any separator/case)', () => {
    expect(isBoardSourceFile('C:/proj/demo/hw/src/board.ts', HW)).toBe(true);
    expect(isBoardSourceFile('C:\\proj\\demo\\hw\\src\\board.ts', HW)).toBe(true);
    expect(isBoardSourceFile('C:/PROJ/DEMO/HW/src/board.ts', 'c:/proj/demo/hw/')).toBe(true);
  });

  it('rejects files outside the hw folder, non-TS files, and no project', () => {
    // prefix must be a folder boundary — a sibling like hw2/ does not count
    expect(isBoardSourceFile('C:/proj/demo/hw2/board.ts', HW)).toBe(false);
    expect(isBoardSourceFile('C:/proj/demo/fw/src/main.ts', HW)).toBe(false);
    expect(isBoardSourceFile('C:/proj/demo/hw/src/board.js', HW)).toBe(false);
    expect(isBoardSourceFile('C:/proj/demo/hw/src/board.ts', null)).toBe(false);
  });
});
