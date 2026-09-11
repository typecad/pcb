// ---------------------------------------------------------------------------
// Where does the extension run `typecad-pcb`? typeCAD projects are multi-root
// (the generated .code-workspace has hw/ and fw/ folders), so unlike the HAL
// extension the hw folder is never assumed to be workspaceFolders[0] — it is
// whichever workspace folder carries typecad.conf.ts.
// ---------------------------------------------------------------------------

import path from 'node:path';

export const CONF_FILE = 'typecad.conf.ts';

/**
 * First folder containing typecad.conf.ts, in the order VS Code presents
 * them. `exists` is injected so tests can fake the filesystem.
 */
export function findHwFolder(folders: string[], exists: (p: string) => boolean): string | null {
  for (const folder of folders) {
    if (exists(path.join(folder, CONF_FILE))) return folder;
  }
  return null;
}
