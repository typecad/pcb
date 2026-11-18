import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

/**
 * Watch support for `typecad-pcb build --watch`: tracks the entry file plus
 * its local (relative) import graph and fires one debounced callback per
 * change batch, mirroring typeCAD HAL's transpile watcher.
 */

interface ImportishNode {
  type: string;
  source?: { value?: string } | null;
}

/** All files in the entry's local import graph (the entry itself included). */
export function collectLocalDependencies(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [path.resolve(entry)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importSpecifiersOf(file)) {
      const resolved = resolveSpecifier(spec, path.dirname(file));
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

function importSpecifiersOf(file: string): string[] {
  if (!/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)) return [];
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return []; // syntax error — the rebuild will surface it properly
  }
  const specifiers: string[] = [];
  for (const node of (ast as unknown as { body: ImportishNode[] }).body) {
    if (
      (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      typeof node.source?.value === 'string'
    ) {
      specifiers.push(node.source.value);
    }
  }
  return specifiers;
}

/** Resolve a relative import specifier to a file on disk, TS-style. */
function resolveSpecifier(spec: string, fromDir: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare package / URL — not watchable
  const base = spec.startsWith('/') ? spec : path.join(fromDir, spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    // TypeScript sources import './x.js' — the file on disk is x.ts; the
    // same ESM/CJS mapping applies to .mjs → .mts and .cjs → .cts
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.mjs$/, '.mts'),
    base.replace(/\.cjs$/, '.cts'),
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return path.resolve(candidate);
    } catch {
      /* keep trying */
    }
  }
  return null;
}

export interface WatchHandle {
  close(): void;
}

/**
 * Watches the entry and its local imports, invoking `onChange` (debounced,
 * coalesced) with the changed file. Watchers re-arm after every callback —
 * editors that save atomically replace files and orphan their watchers.
 */
/** The union of every entry's local import graph — multi-board watches
 *  cover all boards' sources. */
export function watchDeps(entries: string | string[]): string[] {
  const list = Array.isArray(entries) ? entries : [entries];
  const seen = new Set<string>();
  for (const e of list) for (const f of collectLocalDependencies(e)) seen.add(f);
  return [...seen];
}

export function startWatchLoop(
  entry: string | string[],
  onChange: (changed: string) => void,
  debounceMs = 200,
): WatchHandle {
  let watchers: fs.FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const arm = () => {
    for (const watcher of watchers) watcher.close();
    watchers = [];
    for (const file of watchDeps(entry)) {
      try {
        watchers.push(fs.watch(file, (event) => handle(file, event)));
      } catch {
        /* file vanished mid-arm; next event/rebuild re-arms */
      }
    }
  };

  const handle = (file: string, _event: string) => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      try {
        onChange(file);
      } finally {
        arm();
      }
    }, debounceMs);
  };

  arm();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      watchers = [];
    },
  };
}

export interface RebuildQueue {
  /**
   * Ask for a rebuild. If one is running, exactly one more run is queued
   * (any number of requests during a run coalesce into it). The promise
   * resolves when the queue is idle again.
   */
  request(): Promise<void>;
}

/**
 * Serializes watch-mode rebuilds: two quick saves never run two builds at
 * once (their output would interleave); the second waits for the first and
 * then runs once more, so the final state always reflects the last save.
 * `task` should handle its own errors — a throw is swallowed so the queue
 * keeps working.
 */
export function createRebuildQueue(task: () => Promise<void>): RebuildQueue {
  let running: Promise<void> | undefined;
  let pending = false;

  const drain = async (): Promise<void> => {
    try {
      do {
        pending = false;
        try {
          await task();
        } catch {
          /* the task reports its own failures */
        }
      } while (pending);
    } finally {
      running = undefined;
    }
  };

  return {
    request() {
      if (running) {
        pending = true;
        return running;
      }
      running = drain();
      return running;
    },
  };
}
