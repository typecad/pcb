import type { SexprNode } from './sexpr_types.js';

export default SExpr;

declare class SExpr {
    constructor(options?: Record<string, unknown>);
    logVerbose: boolean;
    logTrace: boolean;
    Type: {
        Atom: string;
    };
    truthy: string[];
    falsy: string[];
    nully: string[];
    ATOM: string;
    BOOLEAN: string;
    NUMBER: string;
    STRING: string;
    EMPTY: string;
    FUNCTION: string;
    NULL: string;
    ROOT: string;
    parse(str: string, opts?: { includedRootParentheses?: boolean }): SexprNode;
    serialize(ast: SexprNode, opts?: { includingRootParentheses?: boolean }, level?: number): string;
    stripComments(str: string): string;
    identifier(id: string): string;
    isAtom(e: SexprNode, id?: string): boolean;
    isEqual(a: SexprNode, b: SexprNode): boolean;
    expression(...exps: SexprNode[]): SexprNode;
    isExpression(e: SexprNode, s?: SexprNode): boolean;
    boolean(v: boolean): string;
    isBoolean(e: SexprNode, b?: boolean): boolean;
    isTruthy(e: SexprNode): boolean;
    isMissing(e: SexprNode): boolean;
    null(): string;
    isNull(e: SexprNode): boolean;
    number(n: number): number;
    isNumber(e: SexprNode, n?: number): boolean;
    string(str: string): string;
    isString(e: SexprNode, s?: string): boolean;
    valueOf(e: SexprNode): string | number | boolean | null;
    first(e: SexprNode): SexprNode;
    second(e: SexprNode): SexprNode;
    third(e: SexprNode): SexprNode;
    fourth(e: SexprNode): SexprNode;
    fifth(e: SexprNode): SexprNode;
    sixth(e: SexprNode): SexprNode;
    seventh(e: SexprNode): SexprNode;
    eighth(e: SexprNode): SexprNode;
    ninth(e: SexprNode): SexprNode;
    tenth(e: SexprNode): SexprNode;
    nth(e: SexprNode, n: number): SexprNode;
    rest(e: SexprNode): SexprNode[];
}
