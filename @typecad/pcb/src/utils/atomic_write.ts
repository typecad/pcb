import fs from 'node:fs';
import path from 'node:path';

/**
 * Write a file so a concurrent reader never sees it half-written: temp file
 * in the same directory + rename (atomic on one volume). The temp name keeps
 * the target's name as a PREFIX and never ends in the target's extension, so
 * extension-globbing watchers (`build/**\/*.kicad_pcb`) don't fire on it.
 *
 * If the rename is refused (Windows: the target is held open by a reader
 * without share-delete — KiCad, an antivirus scan) fall back to an in-place
 * write rather than failing the build; the atomicity is an optimization.
 */
export function writeFileAtomic(target: string, contents: string | Uint8Array, encoding: BufferEncoding = 'utf8'): void {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}`);
  try {
    fs.writeFileSync(tmp, contents, typeof contents === 'string' ? encoding : undefined);
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    fs.writeFileSync(target, contents, typeof contents === 'string' ? encoding : undefined);
  }
}
