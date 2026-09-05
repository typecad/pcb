import { Sym } from './sym.js';
import type { SExpr, SList } from './types.js';

export function sym(name: string): Sym {
  return Sym.for(name);
}

export function str(value: string): string {
  return value;
}

export function num(value: number): number {
  return value;
}

export function s(tag: string, ...children: SExpr[]): SList {
  const result: SList = [Sym.for(tag)];
  for (let i = 0; i < children.length; i++) {
    result.push(children[i]);
  }
  return result;
}

export function ss(...children: SExpr[]): SList {
  return children as SList;
}

export function yes(): Sym {
  return Sym.for('yes');
}
export function no(): Sym {
  return Sym.for('no');
}
