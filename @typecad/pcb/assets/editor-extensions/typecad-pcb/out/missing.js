"use strict";
// ---------------------------------------------------------------------------
// Declaration scanning for the missing-from-board hint.
//
// When a hovered identifier is not on the compiled board, the useful hover
// depends on whether it is a component declaration in the file being edited:
//
//   const r1 = new Resistor({ value: '1kohm' });
//
// Silence here reads as "extension broken", when the real cause is a stale
// build or a component that never reaches create(). `new PCB(...)` and
// `new Schematic(...)` are containers, not components, and never hint.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDeclaration = findDeclaration;
exports.renderMissingHint = renderMissingHint;
const DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
/** Classes that are design containers, not board components. */
const NON_COMPONENTS = new Set(['PCB', 'Schematic']);
/**
 * Find `new <Ctor>` declaration of `word` in the document source, or null.
 * Any occurrence of the word hints, not just the declaration line — the
 * board either contains the component or it doesn't.
 */
function findDeclaration(source, word) {
    DECLARATION.lastIndex = 0;
    let match;
    while ((match = DECLARATION.exec(source)) !== null) {
        if (match[1] === word && !NON_COMPONENTS.has(match[2])) {
            return { variable: match[1], ctor: match[2] };
        }
    }
    return null;
}
/** The hint markdown shown for a declared component missing from the board. */
function renderMissingHint(declaration) {
    return [
        `$(warning) \`${declaration.variable}\` (\`${declaration.ctor}\`) is declared here but is not on the compiled board.`,
        '',
        'Either it never reaches `typecad.create(...)`, or the build is stale.',
        'Run `npm run build` in the hw folder to refresh, then hover again.',
    ].join('\n');
}
//# sourceMappingURL=missing.js.map