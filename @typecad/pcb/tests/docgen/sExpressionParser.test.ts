import { describe, it, expect } from 'vitest';

type SExpr = string | SExpr[];

function parseSExpression(expr: string): SExpr {
  const quotedStrings: string[] = [];
  const exprWithPlaceholders = expr.replace(/"([^"]*)"/g, (match, content) => {
    quotedStrings.push(content);
    return `"${quotedStrings.length - 1}"`;
  });

  const tokens = exprWithPlaceholders.match(/\(|\)|[^()\s]+/g) || [];
  const stack: SExpr[][] = [];
  let depth = 0;

  for (const token of tokens) {
    if (token === '(') {
      stack.push([]);
      depth++;
    } else if (token === ')') {
      depth--;
      if (depth < 0) {
        throw new Error('Unexpected closing parenthesis in S-expression');
      }
      const top = stack.pop();
      if (stack.length > 0) {
        stack[stack.length - 1].push(top!);
      } else {
        return top!;
      }
    } else {
      const match = token.match(/^"(\d+)"$/);
      if (match) {
        const index = parseInt(match[1]);
        if (index >= quotedStrings.length) {
          throw new Error(`Invalid string placeholder index ${index} in S-expression`);
        }
        if (stack.length > 0) {
          stack[stack.length - 1].push(quotedStrings[index]);
        }
      } else {
        if (stack.length > 0) {
          stack[stack.length - 1].push(token);
        }
      }
    }
  }

  if (depth > 0) {
    throw new Error(`Unterminated parenthesis in S-expression (${depth} unclosed)`);
  }

  return stack[0];
}

describe('S-expression parser', () => {
  it('parses a simple atom', () => {
    const result = parseSExpression('(hello)');
    expect(result).toEqual(['hello']);
  });

  it('parses nested expressions', () => {
    const result = parseSExpression('(a (b c) d)');
    expect(result).toEqual(['a', ['b', 'c'], 'd']);
  });

  it('parses quoted strings', () => {
    const result = parseSExpression('(name "hello world")');
    expect(result).toEqual(['name', 'hello world']);
  });

  it('parses multiple quoted strings', () => {
    const result = parseSExpression('(name "first" "second")');
    expect(result).toEqual(['name', 'first', 'second']);
  });

  it('throws on unmatched closing paren', () => {
    expect(() => parseSExpression(')')).toThrow('Unexpected closing parenthesis');
  });

  it('throws on unmatched opening paren', () => {
    expect(() => parseSExpression('(unclosed')).toThrow('Unterminated parenthesis');
  });

  it('parses KiCad-style stackup', () => {
    const input = `(kicad_pcb
  (general (thickness 1.6))
  (stackup
    (layer "F.Cu" (type "Top Copper") (thickness 0.035))
    (layer "dielectric 1" (type "core") (thickness 1.5) (material "FR4"))
    (layer "B.Cu" (type "Bottom Copper") (thickness 0.035))
    (copper_finish "ENIG")
    (dielectric_constraints yes)
  )
)`;
    const result = parseSExpression(input) as SExpr[];
    expect(result[0]).toBe('kicad_pcb');

    const stackup = result.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'stackup');
    expect(stackup).toBeDefined();

    const layers = stackup!.filter((item): item is SExpr[] => Array.isArray(item) && item[0] === 'layer');
    expect(layers).toHaveLength(3);
    expect(layers[0][1]).toBe('F.Cu');
  });

  it('parses deeply nested structure', () => {
    const result = parseSExpression('(a (b (c (d))))') as SExpr[];
    expect(result).toEqual(['a', ['b', ['c', ['d']]]]);
  });

  it('handles empty expression', () => {
    const result = parseSExpression('()');
    expect(result).toEqual([]);
  });

  it('handles numeric values', () => {
    const result = parseSExpression('(thickness 0.035)');
    expect(result).toEqual(['thickness', '0.035']);
  });
});
