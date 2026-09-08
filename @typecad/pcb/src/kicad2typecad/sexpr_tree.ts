import { parse as newParse, SNode as NewSNode, Sym } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';

export class SExprNode {
  private _node: NewSNode;

  constructor(raw: SExpr[]) {
    this._node = new NewSNode(raw);
  }

  static parse(content: string): SExprNode {
    const parsed = newParse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Failed to parse S-expression: root is not an array');
    }
    return new SExprNode(parsed);
  }

  get name(): string {
    return this._node.name;
  }

  is(name: string): boolean {
    return this._node.is(name);
  }

  child(name: string): SExprNode | null {
    const c = this._node.child(name);
    return c ? new SExprNode(c.raw) : null;
  }

  children(name?: string): SExprNode[] {
    return this._node.children(name).map((c) => new SExprNode(c.raw));
  }

  hasChild(name: string): boolean {
    return this._node.hasChild(name);
  }

  findAll(name: string): SExprNode[] {
    return this._node.findAll(name).map((c) => new SExprNode(c.raw));
  }

  rawAt(index: number): unknown {
    return this._node.rawAt(index);
  }

  getNumber(index: number, fallback: number = 0): number {
    return this._node.getNumber(index, fallback);
  }

  getString(index: number): string | null {
    return this._node.getString(index);
  }

  getBool(index: number): boolean | null {
    return this._node.getBool(index);
  }

  get stringValue(): string | null {
    return this._node.stringValue;
  }

  get joinedStringValue(): string {
    return this._node.joinedStringValue;
  }

  toArray(): unknown[] {
    return this._node.toArray();
  }

  get length(): number {
    return this._node.length;
  }
}
