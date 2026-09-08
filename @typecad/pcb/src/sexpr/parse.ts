import { Sym } from './sym.js';
import type { SExpr } from './types.js';

export class ParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.name = 'ParseError';
    this.position = position;
  }
}

export function parse(input: string): SExpr {
  const len = input.length;
  let pos = 0;

  function skipWhitespaceAndComments(): void {
    while (pos < len) {
      const ch = input.charCodeAt(pos);
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
        pos++;
        continue;
      }
      if (ch === 35 || ch === 59) {
        while (pos < len && input.charCodeAt(pos) !== 10) {
          pos++;
        }
        continue;
      }
      break;
    }
  }

  function readString(): string {
    pos++;
    const parts: string[] = [];
    const start = pos;
    let segStart = pos;
    while (pos < len) {
      const ch = input.charCodeAt(pos);
      if (ch === 34) {
        if (segStart < pos) {
          parts.push(input.substring(segStart, pos));
        }
        pos++;
        return parts.length === 0 ? input.substring(start, pos - 1) : parts.join('');
      }
      if (ch === 92) {
        if (segStart < pos) {
          parts.push(input.substring(segStart, pos));
        }
        pos++;
        if (pos < len) {
          parts.push(input[pos]);
        }
        pos++;
        segStart = pos;
        continue;
      }
      pos++;
    }
    throw new ParseError('Unterminated string', start - 1);
  }

  function readAtom(): SExpr {
    const start = pos;
    let hasDot = false;
    let hasExp = false;
    let isNeg = false;
    let digitCount = 0;

    if (pos < len && input.charCodeAt(pos) === 45) {
      isNeg = true;
      pos++;
    }

    while (pos < len) {
      const ch = input.charCodeAt(pos);
      if (
        ch === 32 ||
        ch === 9 ||
        ch === 10 ||
        ch === 13 ||
        ch === 40 ||
        ch === 41 ||
        ch === 34 ||
        ch === 35 ||
        ch === 59
      ) {
        break;
      }
      if (ch === 46) hasDot = true;
      if (ch === 101 || ch === 69) hasExp = true;
      if (ch >= 48 && ch <= 57) digitCount++;
      pos++;
    }

    const raw = input.substring(start, pos);
    if (raw.length === 0) {
      throw new ParseError('Unexpected end of input', start);
    }

    if (isNeg && digitCount === 0 && raw.length === 1) {
      return Sym.for(raw);
    }

    if (digitCount > 0 && (digitCount === raw.length || (isNeg && digitCount === raw.length - 1) || hasDot || hasExp)) {
      const num = Number(raw);
      if (!isNaN(num)) return num;
    }

    return Sym.for(raw);
  }

  function readExpr(): SExpr {
    skipWhitespaceAndComments();
    if (pos >= len) {
      throw new ParseError('Unexpected end of input', pos);
    }

    const ch = input.charCodeAt(pos);

    if (ch === 40) {
      pos++;
      const list: SExpr[] = [];
      while (true) {
        skipWhitespaceAndComments();
        if (pos >= len) {
          throw new ParseError('Unterminated list', pos);
        }
        if (input.charCodeAt(pos) === 41) {
          pos++;
          return list;
        }
        list.push(readExpr());
      }
    }

    if (ch === 41) {
      throw new ParseError('Unexpected closing parenthesis', pos);
    }

    if (ch === 34) {
      return readString();
    }

    return readAtom();
  }

  skipWhitespaceAndComments();
  if (pos >= len) {
    throw new ParseError('Empty input', 0);
  }

  const results: SExpr[] = [];
  while (pos < len) {
    skipWhitespaceAndComments();
    if (pos >= len) break;
    results.push(readExpr());
  }

  if (results.length === 1) return results[0];
  return results;
}

export function parseAsList(input: string): SExpr[] {
  const result = parse(input);
  if (Array.isArray(result)) return result;
  throw new ParseError('Expected a list expression', 0);
}
