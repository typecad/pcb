// Assert that source text produced by an edit planner still parses as
// TypeScript. The route/layout planners rewrite user source; a plan that
// only looks right at the string level (a swallowed `()`, a spliced token)
// must fail here, not in the user's build.
import ts from 'typescript';

export function expectValidTs(text: string): void {
  const { diagnostics } = ts.transpileModule(text, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const errors = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(
      'planned source has syntax errors:\n' +
        text +
        '\n---\n' +
        errors.map((d) => `${d.start ?? '?'}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`).join('\n'),
    );
  }
}
