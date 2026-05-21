// S-expression AST node type for parsed KiCad data.
// Uses `any[]` to allow flexible indexing and array method access on
// nested S-expression nodes, which are inherently dynamic structures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SexprNode = any[];
