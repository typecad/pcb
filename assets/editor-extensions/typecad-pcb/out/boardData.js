"use strict";
// ---------------------------------------------------------------------------
// Board data with caching, on top of an injected query runner so tests fake
// the spawn. Two cached layers: the component index (one `query components`
// per build) and per-reference details (`query component <ref>`) fetched the
// first time a component is hovered. The extension invalidates everything
// when build/*.kicad_pcb changes.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoardDataService = exports.DEFAULT_TIMEOUT_MS = void 0;
const query_js_1 = require("./query.js");
const match_js_1 = require("./match.js");
exports.DEFAULT_TIMEOUT_MS = 15_000;
class BoardDataService {
    constructor(run, timeoutMs = exports.DEFAULT_TIMEOUT_MS) {
        this.run = run;
        this.timeoutMs = timeoutMs;
        this.cwd = null;
        this.indexCache = null;
        this.indexInFlight = null;
        this.detailCache = new Map();
        this.detailInFlight = new Map();
    }
    /** Point the service at a hw folder; switching folders drops the cache. */
    setFolder(cwd) {
        if (this.cwd !== cwd) {
            this.invalidate();
            this.cwd = cwd;
        }
    }
    invalidate() {
        this.indexCache = null;
        this.indexInFlight = null;
        this.detailCache.clear();
        this.detailInFlight.clear();
    }
    /** Every component on the compiled board. Concurrent callers share one query. */
    async components() {
        if (this.indexCache)
            return this.indexCache;
        if (!this.indexInFlight) {
            const inFlight = this.query((0, query_js_1.indexCommand)()).then(query_js_1.parseComponentIndex);
            this.indexInFlight = inFlight;
            inFlight.then((index) => {
                // Identity check: a query that raced an invalidate() must not
                // repopulate the cache with pre-invalidation data, and must not
                // clear a newer query's slot.
                if (this.indexInFlight === inFlight) {
                    this.indexCache = index;
                    this.indexInFlight = null;
                }
            }, () => {
                if (this.indexInFlight === inFlight)
                    this.indexInFlight = null;
            });
        }
        return this.indexInFlight;
    }
    /**
     * Resolve a hovered identifier to its pad-level detail, or null when the
     * word is not a component in this project. Concurrent resolves of the same
     * reference share one query (a hover plus a viewer reveal, say).
     */
    async resolve(word) {
        const index = await this.components();
        const match = (0, match_js_1.matchComponent)(index, word);
        if (!match)
            return null;
        const cached = this.detailCache.get(match.reference);
        if (cached)
            return cached;
        let inFlight = this.detailInFlight.get(match.reference);
        if (!inFlight) {
            inFlight = this.query((0, query_js_1.detailCommand)(match.reference)).then(query_js_1.parseComponentDetail);
            this.detailInFlight.set(match.reference, inFlight);
            inFlight.then((detail) => {
                if (this.detailInFlight.get(match.reference) === inFlight) {
                    this.detailCache.set(match.reference, detail);
                    this.detailInFlight.delete(match.reference);
                }
            }, () => {
                if (this.detailInFlight.get(match.reference) === inFlight) {
                    this.detailInFlight.delete(match.reference);
                }
            });
        }
        return inFlight;
    }
    async query(command) {
        if (!this.cwd)
            throw new query_js_1.QueryError('No typeCAD project folder (typecad.conf.ts) found in this workspace');
        try {
            return await this.run(this.cwd, command, this.timeoutMs);
        }
        catch (err) {
            const text = err instanceof Error ? err.message : String(err);
            throw new query_js_1.QueryError(text, /no \.kicad_pcb/i.test(text));
        }
    }
}
exports.BoardDataService = BoardDataService;
//# sourceMappingURL=boardData.js.map