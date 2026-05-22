import type { Sym } from './sym.js';

export type SExpr = Sym | string | number | SList;
export type SList = SExpr[];
