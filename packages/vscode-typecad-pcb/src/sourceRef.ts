// ---------------------------------------------------------------------------
// Reverse probing: the viewer reports a reference; the board model's "Code"
// property (embedded by the typeCAD serializer at build time) maps it back to
// the declaring source line — "src/rd_skeleton.ts:16". This module turns that
// string plus the hw folder into an absolute reveal target.
// ---------------------------------------------------------------------------

import path from 'node:path';

export interface SourceLocation {
  /** Absolute path of the declaring file. */
  fsPath: string;
  /** 1-based line number; 0 when the board carried no line info. */
  line: number;
}

/**
 * Parse a `<relative path>[:<line>]` source location against the hw folder.
 * Returns null for absent/empty metadata. Malformed paths (absolute or
 * escaping the project) are rejected so a crafted board file can't point the
 * editor outside the workspace.
 */
export function parseSourceLocation(hwFolder: string, source: string | undefined): SourceLocation | null {
  if (!source || source.trim() === '') return null;
  const sep = source.lastIndexOf(':');
  const file = sep === -1 ? source : source.slice(0, sep);
  const line = sep === -1 ? 0 : Number.parseInt(source.slice(sep + 1), 10);
  if (file.trim() === '' || Number.isNaN(line) || line < 0) return null;

  const absolute = path.resolve(hwFolder, file);
  const root = path.resolve(hwFolder);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null;

  return { fsPath: absolute, line };
}
