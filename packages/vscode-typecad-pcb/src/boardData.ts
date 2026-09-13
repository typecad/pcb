// ---------------------------------------------------------------------------
// Board data with caching, on top of an injected query runner so tests fake
// the spawn. Two cached layers: the component index (one `query components`
// per build) and per-reference details (`query component <ref>`) fetched the
// first time a component is hovered. The extension invalidates everything
// when build/*.kicad_pcb changes.
// ---------------------------------------------------------------------------

import {
  indexCommand,
  detailCommand,
  netsCommand,
  parseComponentIndex,
  parseComponentDetail,
  parseNetIndex,
  QueryError,
} from './query.js';
import { matchComponent } from './match.js';
import type { ComponentDetail, ComponentSummary, NetSourceSummary } from './types.js';

/** Resolves with stdout; rejects with an Error carrying stderr/output tails. */
export type QueryRunner = (cwd: string, command: string, timeoutMs: number) => Promise<string>;

export const DEFAULT_TIMEOUT_MS = 15_000;

export class BoardDataService {
  private cwd: string | null = null;
  private indexCache: ComponentSummary[] | null = null;
  private indexInFlight: Promise<ComponentSummary[]> | null = null;
  private netsCache: NetSourceSummary[] | null = null;
  private netsInFlight: Promise<NetSourceSummary[]> | null = null;
  private detailCache = new Map<string, ComponentDetail>();
  private detailInFlight = new Map<string, Promise<ComponentDetail>>();

  constructor(
    private readonly run: QueryRunner,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Point the service at a hw folder; switching folders drops the cache. */
  setFolder(cwd: string): void {
    if (this.cwd !== cwd) {
      this.invalidate();
      this.cwd = cwd;
    }
  }

  invalidate(): void {
    this.indexCache = null;
    this.indexInFlight = null;
    this.netsCache = null;
    this.netsInFlight = null;
    this.detailCache.clear();
    this.detailInFlight.clear();
  }

  /** Every component on the compiled board. Concurrent callers share one query. */
  async components(): Promise<ComponentSummary[]> {
    if (this.indexCache) return this.indexCache;
    if (!this.indexInFlight) {
      const inFlight = this.query(indexCommand()).then(parseComponentIndex);
      this.indexInFlight = inFlight;
      inFlight.then(
        (index) => {
          // Identity check: a query that raced an invalidate() must not
          // repopulate the cache with pre-invalidation data, and must not
          // clear a newer query's slot.
          if (this.indexInFlight === inFlight) {
            this.indexCache = index;
            this.indexInFlight = null;
          }
        },
        () => {
          if (this.indexInFlight === inFlight) this.indexInFlight = null;
        },
      );
    }
    return this.indexInFlight;
  }

  /** Net source provenance (query nets), cached with the component index. */
  async netSources(): Promise<NetSourceSummary[]> {
    if (this.netsCache) return this.netsCache;
    if (!this.netsInFlight) {
      const inFlight = this.query(netsCommand()).then(parseNetIndex);
      this.netsInFlight = inFlight;
      inFlight.then(
        (nets) => {
          if (this.netsInFlight === inFlight) {
            this.netsCache = nets;
            this.netsInFlight = null;
          }
        },
        () => {
          if (this.netsInFlight === inFlight) this.netsInFlight = null;
        },
      );
    }
    return this.netsInFlight;
  }

  /**
   * Resolve a hovered identifier to its pad-level detail, or null when the
   * word is not a component in this project. Concurrent resolves of the same
   * reference share one query (a hover plus a viewer reveal, say).
   */
  async resolve(word: string): Promise<ComponentDetail | null> {
    const index = await this.components();
    const match = matchComponent(index, word);
    if (!match) return null;

    const cached = this.detailCache.get(match.reference);
    if (cached) return cached;

    let inFlight = this.detailInFlight.get(match.reference);
    if (!inFlight) {
      inFlight = this.query(detailCommand(match.reference)).then(parseComponentDetail);
      this.detailInFlight.set(match.reference, inFlight);
      inFlight.then(
        (detail) => {
          if (this.detailInFlight.get(match.reference) === inFlight) {
            this.detailCache.set(match.reference, detail);
            this.detailInFlight.delete(match.reference);
          }
        },
        () => {
          if (this.detailInFlight.get(match.reference) === inFlight) {
            this.detailInFlight.delete(match.reference);
          }
        },
      );
    }
    return inFlight;
  }

  private async query(command: string): Promise<string> {
    if (!this.cwd) throw new QueryError('No typeCAD project folder (typecad.conf.ts) found in this workspace');
    try {
      return await this.run(this.cwd, command, this.timeoutMs);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      throw new QueryError(text, /no \.kicad_pcb/i.test(text));
    }
  }
}
