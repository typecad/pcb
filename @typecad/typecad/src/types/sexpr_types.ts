// S-expression AST node type for parsed KiCad data.
// Uses `unknown[]` with a self-referential element type to allow
// indexing while still being stricter than `any[]`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SexprNode = any[];
