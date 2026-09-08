import fs from 'node:fs';
import { parse, Sym } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';

export function loadExistingBoardElements(boardname: string): SExpr[] {
  const boardFilePath = `./build/${boardname}.kicad_pcb`;

  if (fs.existsSync(boardFilePath)) {
    try {
      let board_contents_str = fs.readFileSync(boardFilePath, 'utf8');
      board_contents_str = board_contents_str.replace(/[±]/g, '');

      const parsed = parse(board_contents_str);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        Array.isArray(parsed[0]) &&
        Sym.isSym(parsed[0][0]) &&
        parsed[0][0].name === 'kicad_pcb'
      ) {
        const existing_board_contents = parsed[0];
        return existing_board_contents.slice(1);
      } else {
        return [];
      }
    } catch {
      return [];
    }
  } else {
    return [];
  }
}
