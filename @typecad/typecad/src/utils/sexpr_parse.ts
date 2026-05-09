import fsexp from 'fast-sexpr';

export function parseSExpr(content: string): unknown {
    return fsexp(content.replaceAll('"', '`')).pop();
}
