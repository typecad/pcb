// ---------------------------------------------------------------------------
// Pure gate for the "Build Board" CodeLens: which files are board sources?
// vscode-free so the rule stays unit-testable.
// ---------------------------------------------------------------------------

/**
 * True for TypeScript files inside the project's hw folder — the folder that
 * carries typecad.conf.ts and the `npm run build` that compiles the board.
 * Firmware sources (fw/) and files outside the project get no lens.
 */
export function isBoardSourceFile(fsPath: string, hwFolder: string | null | undefined): boolean {
  if (!hwFolder) return false;
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const file = norm(fsPath);
  const folder = norm(hwFolder);
  return file.startsWith(folder + '/') && file.endsWith('.ts');
}
