import { Sym } from './sym.js';
import type { SExpr } from './types.js';

export class SNode {
  private _raw: SExpr[];

  constructor(raw: SExpr[]) {
    this._raw = raw;
  }

  static from(raw: SExpr[]): SNode {
    return new SNode(raw);
  }

  get raw(): SExpr[] {
    return this._raw;
  }

  get length(): number {
    return this._raw.length;
  }

  get name(): string {
    const first = this._raw[0];
    if (Sym.isSym(first)) return first.name;
    if (typeof first === 'string') return first;
    if (typeof first === 'number') return String(first);
    return '';
  }

  is(name: string): boolean {
    return this.name === name;
  }

  child(name: string): SNode | null {
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (Array.isArray(item) && item.length > 0) {
        const first = item[0];
        if ((Sym.isSym(first) && first.name === name) || (typeof first === 'string' && first === name)) {
          return new SNode(item);
        }
      }
    }
    return null;
  }

  children(name?: string): SNode[] {
    const result: SNode[] = [];
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (Array.isArray(item) && item.length > 0) {
        if (!name) {
          result.push(new SNode(item));
        } else {
          const first = item[0];
          if ((Sym.isSym(first) && first.name === name) || (typeof first === 'string' && first === name)) {
            result.push(new SNode(item));
          }
        }
      }
    }
    return result;
  }

  hasChild(name: string): boolean {
    return this.child(name) !== null;
  }

  findAll(name: string): SNode[] {
    const results: SNode[] = [];
    this._findAll(name, results);
    return results;
  }

  private _findAll(name: string, results: SNode[]): void {
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (Array.isArray(item) && item.length > 0) {
        const node = new SNode(item);
        if (node.name === name) {
          results.push(node);
        }
        node._findAll(name, results);
      }
    }
  }

  rawAt(index: number): SExpr {
    return this._raw[index];
  }

  getNumber(index: number, fallback: number = 0): number {
    const val = this._raw[index];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = parseFloat(val);
      return isNaN(n) ? fallback : n;
    }
    return fallback;
  }

  getString(index: number): string | null {
    const val = this._raw[index];
    if (typeof val === 'string') return val;
    if (Sym.isSym(val)) return val.name;
    return null;
  }

  getBool(index: number): boolean | null {
    const val = this._raw[index];
    if (Sym.isSym(val)) {
      if (val.name === 'yes' || val.name === 'true') return true;
      if (val.name === 'no' || val.name === 'false') return false;
    }
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'yes' || lower === 'true') return true;
      if (lower === 'no' || lower === 'false') return false;
    }
    return null;
  }

  get stringValue(): string | null {
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (typeof item === 'string') return item;
      if (Sym.isSym(item)) return item.name;
      if (typeof item === 'number') continue;
      break;
    }
    return null;
  }

  get joinedStringValue(): string {
    const parts: string[] = [];
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (typeof item === 'string') {
        parts.push(item);
      } else if (Sym.isSym(item)) {
        parts.push(item.name);
      } else {
        break;
      }
    }
    return parts.join(' ');
  }

  set(index: number, value: SExpr): void {
    this._raw[index] = value;
  }

  push(...children: SExpr[]): void {
    for (const c of children) {
      this._raw.push(c);
    }
  }

  removeChild(name: string): boolean {
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (Array.isArray(item) && item.length > 0) {
        const first = item[0];
        if ((Sym.isSym(first) && first.name === name) || (typeof first === 'string' && first === name)) {
          this._raw.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  }

  replaceChild(name: string, replacement: SExpr[]): boolean {
    for (let i = 1; i < this._raw.length; i++) {
      const item = this._raw[i];
      if (Array.isArray(item) && item.length > 0) {
        const first = item[0];
        if ((Sym.isSym(first) && first.name === name) || (typeof first === 'string' && first === name)) {
          this._raw[i] = replacement;
          return true;
        }
      }
    }
    return false;
  }

  toArray(): SExpr[] {
    return this._raw;
  }
}

export function isList(expr: SExpr): expr is SExpr[] {
  return Array.isArray(expr);
}

export function isSym(expr: SExpr): expr is Sym {
  return Sym.isSym(expr);
}

export function isString(expr: SExpr): expr is string {
  return typeof expr === 'string';
}

export function isNumber(expr: SExpr): expr is number {
  return typeof expr === 'number';
}

export function nameOf(expr: SExpr): string {
  if (Sym.isSym(expr)) return expr.name;
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'number') return String(expr);
  if (Array.isArray(expr) && expr.length > 0) return nameOf(expr[0]);
  return '';
}
