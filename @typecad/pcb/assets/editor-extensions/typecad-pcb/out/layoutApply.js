"use strict";
// ---------------------------------------------------------------------------
// Layout-apply orchestration: the layout view's one "apply & rebuild"
// gesture carries moves, text/value/label/rename edits, new routes, and
// segment deletes TOGETHER. Each kind is planned by its pure module
// (layoutEdits, routeEdits); this module sequences them into STAGES so no
// two planned edits ever overlap in one application — every stage's
// offsets are computed against the text as it stands AFTER the previous
// stage applied (route blocks shift create()'s closer, endpoint literals
// live inside blocks the delete stage rewrites, placements feed the label
// conversion). vscode-free: the unit tests exercise exactly what
// `typecad/layout-rebuild` runs; the viewer applies stage by stage with
// one WorkspaceEdit each and re-reads the document in between.
// ---------------------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.planLayoutApply = planLayoutApply;
const layoutEdits_js_1 = require("./layoutEdits.js");
const routeEdits_js_1 = require("./routeEdits.js");
const imageEdits_js_1 = require("./imageEdits.js");
const node_path_1 = __importDefault(require("node:path"));
const syncFile_js_1 = require("./syncFile.js");
const componentDelete_js_1 = require("./componentDelete.js");
/**
 * Coalesce touching/overlapping edits into single range replacements so a
 * stage never hands its applier ambiguous ranges (a zero-width insert at
 * the same offset as a replace, say). The gap text between two merged
 * edits is carried over verbatim.
 */
function mergeEdits(text, edits) {
    if (edits.length < 2)
        return edits;
    const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i];
        const last = out[out.length - 1];
        if (cur.start > last.end) {
            out.push({ ...cur });
            continue;
        }
        last.line = last.line + text.slice(last.end, cur.start) + cur.line;
        last.end = Math.max(last.end, cur.end);
    }
    return out;
}
const textKey = (t) => (0, layoutEdits_js_1.textEditRef)(t);
const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]\s*;?/g;
/**
 * Maintain the create()-owning file's import list alongside its args:
 * dropped route names leave their import (a fully-emptied import statement
 * goes away), split halves join the import that already names their
 * sibling. Names with no anchor import come back unresolved — reported,
 * never silently dropped (the build must not find a missing identifier).
 */
function planImportNamesEdit(text, add, remove) {
    const edits = [];
    const unresolved = [];
    let pendingAdd = [...add];
    const pendingRemove = new Set(remove);
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text)) !== null) {
        const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        const kept = names.filter((n) => !pendingRemove.delete(n));
        const here = pendingAdd.filter((a) => names.includes(a.sibling) && !names.includes(a.name));
        pendingAdd = pendingAdd.filter((a) => !here.includes(a));
        if (kept.length === names.length && here.length === 0)
            continue;
        if (kept.length === 0 && here.length === 0) {
            edits.push({ start: m.index, end: m.index + m[0].length, line: '' }); // emptied import: drop it
            continue;
        }
        const merged = [...kept, ...here.map((a) => a.name)];
        edits.push({
            start: m.index,
            end: m.index + m[0].length,
            line: `import { ${merged.join(', ')} }` + m[0].slice(m[0].indexOf('}') + 1),
        });
    }
    for (const a of pendingAdd)
        unresolved.push(a.name);
    return { edits, unresolved };
}
/**
 * Plan the whole apply across the project's source files. `files` order is
 * the search order — a ref resolves in the first file that matches it.
 */
function planLayoutApply(files, input) {
    // working texts, updated as each stage's edits apply — later stages plan
    // against exactly what the applier will see
    const textOf = new Map(files.map((f) => [f.uri, f.text]));
    const stages = [];
    const skipped = [];
    const touched = new Set();
    const counts = { moves: 0, endpoints: 0, texts: 0, values: 0, labels: 0, renames: 0, routes: 0, deletes: 0, partDeletes: 0, zones: 0, images: 0, outline: 0, zoneEdits: 0, zoneDeletes: 0, imageEdits: 0, imageDeletes: 0, classEdits: 0 };
    // -- the sync sidecar: one machine-owned home for auto-inserts ----------
    // placements/labels with no literal to rewrite and fresh routes land in
    // src/_sync.ts, whose syncBoard() call sits right before create() and so
    // always wins the code-order battle. Hand-written code keeps the edits it
    // already supports (literal rewrites, deletes, renames).
    const syncUri = input.syncUri && files.some((f) => f.uri === input.syncUri) ? input.syncUri : undefined;
    const entryUri = input.entryUri && files.some((f) => f.uri === input.entryUri) ? input.entryUri : undefined;
    // usability is decided UP FRONT: an absent/empty sidecar can be created,
    // an existing one must already speak the grammar — anything else at
    // src/_sync.ts belongs to the user and never gets hijacked, so its edits
    // take the legacy in-place paths instead
    const syncFileUsable = (() => {
        if (!syncUri)
            return false;
        const cur = textOf.get(syncUri);
        return cur.trim() === '' || (0, syncFile_js_1.isSyncFileText)(cur);
    })();
    if (syncUri && !syncFileUsable) {
        skipped.push('_sync.ts exists but is not a typeCAD sync file — its edits fell back to in-place');
    }
    const syncPartsVars = new Set();
    const syncSummary = { created: false, placements: 0, labels: 0, routes: 0, zones: 0, images: 0 };
    let syncUsed = false;
    const entryText = () => (entryUri ? textOf.get(entryUri) ?? '' : '');
    /** a variable is nameable at the syncBoard() call only when the entry file
     *  mentions it — components reach create() from there */
    const inScope = (variable) => {
        if (!entryUri)
            return false;
        return new RegExp(`\\b${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(entryText());
    };
    const canSyncRef = (ref) => {
        if (!syncUri || !entryUri || !syncFileUsable)
            return false;
        const variable = input.variableOf(ref);
        return !!variable && inScope(variable);
    };
    /** Create the sidecar scaffold when absent; refuse when something else
     *  already lives at src/_sync.ts (never overwrite a user's file). */
    const ensureSyncScaffold = () => {
        if (!syncUri)
            return false;
        const cur = textOf.get(syncUri);
        if ((0, syncFile_js_1.isSyncFileText)(cur))
            return true;
        if (cur.trim() !== '') {
            skipped.push('_sync.ts exists but is not a typeCAD sync file — its edits fell back to in-place');
            return false;
        }
        commit([{ uri: syncUri, edits: [{ start: 0, end: cur.length, line: (0, syncFile_js_1.renderSyncFile)({}) }] }]);
        syncSummary.created = true;
        syncUsed = true;
        return true;
    };
    /** entry-file wiring (import/call/spread) for the given parts vars */
    const planEntryIntegration = (needTracks, needArt = false) => {
        if (!syncUri || !entryUri)
            return { ok: false, edits: [] };
        // the sidecar's module name follows the board on multi-board projects
        // (_sync.<stem>.ts) — the import line written into the entry must match
        const stemMatch = syncUri ? /^_sync\.(.+)\.ts$/.exec(node_path_1.default.basename(syncUri.split(/[\/]/).pop() ?? '')) : null;
        const plan = (0, syncFile_js_1.planSyncEntryEdits)(entryText(), [...syncPartsVars], needTracks, stemMatch?.[1], needArt);
        if (!plan.receiver) {
            skipped.push('_sync.ts wiring needs a typecad.create() call in the entry file — nothing was written there');
            return { ok: false, edits: [] };
        }
        syncUsed = true;
        return { ok: true, edits: plan.edits };
    };
    // placement lookup over the live texts (shared by label frames) — cached
    // per ref and CLEARED whenever a stage writes new placements, so a part
    // whose placement just landed in the sidecar resolves for its label
    const placementCache = new Map();
    const placementOf = (ref) => {
        if (placementCache.has(ref))
            return placementCache.get(ref);
        let found = null;
        for (const file of files) {
            found = (0, layoutEdits_js_1.parsePlacementLiteral)(textOf.get(file.uri), input.variableOf(ref) ?? '');
            if (found)
                break;
        }
        placementCache.set(ref, found);
        return found;
    };
    // the page keys moves by ref — normalize, first wins
    const moves = [];
    const seenRefs = new Set();
    for (const m of input.moves) {
        if (seenRefs.has(m.ref))
            continue;
        seenRefs.add(m.ref);
        moves.push(m);
    }
    const commit = (raw) => {
        const withEdits = raw.filter((b) => b.edits.length > 0);
        if (withEdits.length === 0)
            return;
        for (const b of withEdits) {
            b.edits = mergeEdits(textOf.get(b.uri), b.edits);
        }
        stages.push(withEdits);
        for (const b of withEdits) {
            textOf.set(b.uri, (0, layoutEdits_js_1.applyPlacementEdits)(textOf.get(b.uri), b.edits));
            touched.add(b.uri);
        }
    };
    // -- stage 0: part deletions — a part deleted in the view leaves source
    // FIRST, so every later stage plans against the post-deletion texts. The
    // removal is the shared component-delete grammar (declaration, overrides,
    // create() arguments, syncBoard map, net pin references). Same safety
    // rails as the import's deletion pass: a variable name declared in more
    // than one file is ambiguous (name alone cannot tell the copies apart),
    // and a removal whose identifier would survive anywhere is refused
    // loudly — a dangling reference breaks the build. --
    const deletedRefs = new Set((input.partDeletes ?? []).map((r) => r.trim()).filter((r) => r !== ''));
    if (deletedRefs.size > 0) {
        const batch = [];
        for (const ref of deletedRefs) {
            const variable = input.variableOf(ref);
            if (!variable) {
                skipped.push(`${ref} (no source variable — cannot delete from source)`);
                continue;
            }
            const declaringUris = files.filter((f) => (0, componentDelete_js_1.declaresComponent)(textOf.get(f.uri), variable)).map((f) => f.uri);
            if (declaringUris.length > 1) {
                skipped.push(`${ref} (${variable} is declared in ${declaringUris.length} files — ambiguous, delete it by hand)`);
                continue;
            }
            const perFile = files.map((f) => ({
                uri: f.uri,
                text: textOf.get(f.uri),
                edits: (0, componentDelete_js_1.planComponentRemoval)(textOf.get(f.uri), variable),
            }));
            if (!perFile.some((p) => p.edits.length > 0)) {
                skipped.push(`${ref} (no removable statement found for ${variable})`);
                continue;
            }
            // after simulation the identifier must be gone from CODE in every file
            const sim = new Map(perFile.map((p) => [p.uri, (0, componentDelete_js_1.applyDeleteEdits)(p.text, p.edits)]));
            const residual = files.some((f) => (0, componentDelete_js_1.identifierInCode)(sim.get(f.uri), variable));
            if (residual) {
                skipped.push(`${ref} (${variable} is still referenced after removal — nothing deleted)`);
                continue;
            }
            for (const p of perFile) {
                if (p.edits.length > 0)
                    batch.push({ uri: p.uri, edits: p.edits });
            }
            counts.partDeletes++;
        }
        commit(batch);
        // a deleted part has no final placement to carry
        for (let i = moves.length - 1; i >= 0; i--) {
            if (deletedRefs.has(moves[i].ref))
                moves.splice(i, 1);
        }
    }
    // -- stage 1: placement literals (`<var>.pcb = { x, y, … }`) by delta --
    const appliedRefs = new Set();
    const syncPlacements = [];
    const syncLabels = [];
    {
        const batch = [];
        // 'no literal found' only becomes final once every file has been tried;
        // concrete reasons (computed placement, no variable) are final at once
        const reasonByRef = new Map();
        const finalRefs = new Set();
        const deferredByRef = new Map();
        for (const file of files) {
            // deferrals do NOT retire a move: a later file (the sidecar's
            // parts.<var>.pcb, the declaring module) can still match and rewrite
            const pending = moves.filter((m) => !appliedRefs.has(m.ref) && !finalRefs.has(m.ref));
            if (pending.length === 0)
                continue;
            const plan = (0, layoutEdits_js_1.planPlacementEdits)(textOf.get(file.uri), pending, input.variableOf, {
                deferInsert: (move) => canSyncRef(move.ref),
            });
            for (const d of plan.deferred ?? [])
                deferredByRef.set(d.ref, d);
            for (const sk of plan.skipped) {
                const deferred = sk.reason.startsWith('no `');
                if (deferred) {
                    if (!reasonByRef.has(sk.ref))
                        reasonByRef.set(sk.ref, sk.reason);
                }
                else {
                    reasonByRef.set(sk.ref, sk.reason);
                    finalRefs.add(sk.ref);
                }
            }
            for (const e of plan.edits)
                appliedRefs.add(e.ref);
            if (plan.edits.length > 0)
                batch.push({ uri: file.uri, edits: plan.edits });
        }
        // refs with no literal anywhere that CAN ride the sidecar do so; the
        // rest keep the legacy verdict below (an in-place insert already
        // happened in planPlacementEdits, or no constructor exists at all)
        for (const [ref, d] of deferredByRef) {
            if (appliedRefs.has(ref) || reasonByRef.has(ref))
                continue;
            syncPlacements.push(d);
            reasonByRef.set(ref, `__sync__`);
        }
        for (const m of moves) {
            if (appliedRefs.has(m.ref) || reasonByRef.has(m.ref))
                continue;
            reasonByRef.set(m.ref, `no \`${input.variableOf(m.ref) ?? m.ref}\`.pcb literal found`);
        }
        // a ref that applied in a later file must not also carry the deferred
        // "no literal" verdict an earlier file recorded for it
        for (const [ref, reason] of reasonByRef) {
            if (reason === `__sync__`)
                continue;
            if (!appliedRefs.has(ref))
                skipped.push(`${ref} (${reason})`);
        }
        counts.moves = appliedRefs.size;
        commit(batch);
    }
    // -- stage 1b: sidecar placements — a part with no literal anywhere gets
    // its whole placement written into _sync.ts (the machine-owned home), and
    // the entry file learns to call syncBoard() with its variable --
    if (syncPlacements.length > 0) {
        if (ensureSyncScaffold()) {
            const syncText = textOf.get(syncUri);
            const at = (0, syncFile_js_1.syncPlacementInsertAt)(syncText);
            if (at === null) {
                for (const p of syncPlacements)
                    skipped.push(`${p.ref} (_sync.ts has no usable syncBoard() body)`);
            }
            else {
                const edits = syncPlacements.map((p) => ({
                    start: at,
                    end: at,
                    line: `  parts.${p.variable}.pcb = { x: ${(0, layoutEdits_js_1.fmt)(p.x)}, y: ${(0, layoutEdits_js_1.fmt)(p.y)}${p.rot ? `, rotation: ${(0, layoutEdits_js_1.fmt)(p.rot)}` : ''}${p.side ? `, side: '${p.side}'` : ''} };\n`,
                }));
                for (const p of syncPlacements)
                    syncPartsVars.add(p.variable);
                const wiring = planEntryIntegration(false);
                if (wiring.ok) {
                    commit([
                        { uri: syncUri, edits },
                        { uri: entryUri, edits: wiring.edits },
                    ]);
                    counts.moves += syncPlacements.length;
                    syncSummary.placements += syncPlacements.length;
                    placementCache.clear(); // parts that just gained a literal resolve now
                }
                else {
                    for (const p of syncPlacements)
                        skipped.push(`${p.ref} (${input.variableOf(p.ref) ?? p.ref} cannot be wired into _sync.ts)`);
                }
            }
        }
        else {
            for (const p of syncPlacements)
                skipped.push(`${p.ref} (_sync.ts is not a typeCAD sync file)`);
        }
    }
    // -- stage 2: component constructor edits (value / rename / label) --
    // placements already applied above: labels convert against the FINAL
    // literal, so no move delta is re-added here
    const specByRef = new Map();
    for (const v of input.values ?? [])
        specByRef.set(v.ref, { ref: v.ref, value: v.value });
    for (const r of input.renames ?? []) {
        const spec = specByRef.get(r.ref) ?? { ref: r.ref };
        spec.newRef = r.newRef;
        specByRef.set(r.ref, spec);
    }
    for (const l of input.labels ?? []) {
        const spec = specByRef.get(l.ref) ?? { ref: l.ref };
        spec.label = { kind: l.kind, x: l.x, y: l.y, rot: l.rot, ...(l.style ? { style: l.style } : {}) };
        specByRef.set(l.ref, spec);
    }
    const specs = [...specByRef.values()];
    if (specs.length > 0) {
        // edits accumulate PER FILE and commit as ONE batch: every edit in a
        // stage is planned against the same pre-stage text, so a second batch
        // for the same file would apply at offsets the first batch already
        // shifted (seen as an assignment spliced into the next statement)
        const batch = [];
        const editsByUri = new Map();
        const pushEdits = (uri, edits) => {
            if (edits.length === 0)
                return;
            editsByUri.set(uri, [...(editsByUri.get(uri) ?? []), ...edits]);
        };
        const doneRefs = new Set();
        for (const file of files) {
            const pending = specs.filter((sp) => !doneRefs.has(sp.ref));
            if (pending.length === 0)
                continue;
            const plan = (0, layoutEdits_js_1.planComponentEdits)(textOf.get(file.uri), pending, placementOf, input.allRefs);
            // 'no constructor literal' defers to later files; the other reasons
            // (rename collision, missing placement) belong to the one file that
            // owns the constructor and are final
            for (const sk of plan.skipped) {
                if (sk.reason === 'no Component constructor literal found')
                    continue;
                skipped.push(`${sk.ref} (${sk.reason})`);
                doneRefs.add(sk.ref);
            }
            for (const edit of plan.edits) {
                // label edits can land on the standalone `<var>.<kind>Layout = {…}`
                // statement (it overrides the constructor option at runtime) —
                // those carry the `ref prop` key
                const spec = pending.find((sp) => edit.ref === sp.ref || (!!sp.label && edit.ref === `${sp.ref} ${sp.label.kind}Layout`));
                if (!spec)
                    continue;
                doneRefs.add(spec.ref);
                if (spec.value !== undefined)
                    counts.values++;
                if (spec.newRef)
                    counts.renames++;
                if (spec.label)
                    counts.labels++;
            }
            pushEdits(file.uri, plan.edits);
        }
        // fallback for label-only specs with no constructor literal to rewrite:
        // subclass factories (`new LED({…})`) and prefix-derived references
        // never carry `reference: 'D1'` — their layout lands as a public-field
        // assignment after the constructor, the same door `var.pcb = {…}` uses…
        // or in the sidecar, when the part can be wired into syncBoard()
        const labelPending = specs.filter((sp) => !!sp.label && !doneRefs.has(sp.ref));
        if (labelPending.length > 0) {
            for (const file of files) {
                const pending = labelPending.filter((sp) => !doneRefs.has(sp.ref) && !syncLabels.some((l) => l.ref === sp.ref));
                if (pending.length === 0)
                    break;
                const plan = (0, layoutEdits_js_1.planLabelAssignments)(textOf.get(file.uri), pending, input.variableOf, placementOf, {
                    deferInsert: (ref) => canSyncRef(ref),
                });
                for (const edit of plan.edits) {
                    const spec = pending.find((sp) => edit.ref === `${sp.ref} ${sp.label.kind === 'fab' ? 'fab' : `${sp.label.kind}Layout`}`);
                    if (!spec)
                        continue;
                    doneRefs.add(spec.ref);
                    counts.labels++;
                    pushEdits(file.uri, [edit]);
                }
                for (const d of plan.deferred ?? []) {
                    if (!syncLabels.some((l) => l.ref === d.ref))
                        syncLabels.push(d);
                }
                // skips defer to later files — the file owning the constructor
                // statement has the final say, collected after the loop
            }
            for (const sp of labelPending) {
                if (!doneRefs.has(sp.ref) && !syncLabels.some((l) => l.ref === sp.ref)) {
                    const variable = input.variableOf(sp.ref);
                    skipped.push(`${sp.ref} (${variable ? `no \`${variable}\` constructor statement found` : 'no source variable'})`);
                }
            }
        }
        for (const sp of specs) {
            if (!doneRefs.has(sp.ref) &&
                !skipped.some((s) => s.startsWith(`${sp.ref} (`)) &&
                !syncLabels.some((l) => l.ref === sp.ref))
                skipped.push(`${sp.ref} (no Component constructor literal found)`);
        }
        for (const [uri, edits] of editsByUri)
            batch.push({ uri, edits });
        commit(batch);
    }
    // -- stage 2b: sidecar labels — same door as stage 1b, for parts whose
    // label has no standalone statement and whose constructor cannot be
    // rewritten (or whose override already lives in the sidecar) --
    if (syncLabels.length > 0) {
        if (ensureSyncScaffold()) {
            const syncText = textOf.get(syncUri);
            const at = (0, syncFile_js_1.syncPlacementInsertAt)(syncText);
            if (at === null) {
                for (const l of syncLabels)
                    skipped.push(`${l.ref} (_sync.ts has no usable syncBoard() body)`);
            }
            else {
                const edits = [];
                for (const l of syncLabels) {
                    const part = placementOf(l.ref);
                    if (!part) {
                        skipped.push(`${l.ref} (no .pcb placement literal found)`);
                        continue;
                    }
                    edits.push({ start: at, end: at, line: `  ${(0, layoutEdits_js_1.syncLabelStatement)(l, part)}\n` });
                    syncPartsVars.add(l.variable);
                }
                const wiring = planEntryIntegration(false);
                if (wiring.ok && edits.length > 0) {
                    commit([
                        { uri: syncUri, edits },
                        { uri: entryUri, edits: wiring.edits },
                    ]);
                    counts.labels += edits.length;
                    syncSummary.labels += edits.length;
                }
                else if (edits.length > 0) {
                    for (const l of syncLabels)
                        skipped.push(`${l.ref} (${input.variableOf(l.ref) ?? l.ref} cannot be wired into _sync.ts)`);
                }
            }
        }
        else {
            for (const l of syncLabels)
                skipped.push(`${l.ref} (_sync.ts is not a typeCAD sync file)`);
        }
    }
    // -- stage 3: silk/fab .text({ … }) literals, matched per file --
    if (input.texts && input.texts.length > 0) {
        const batch = [];
        const done = new Set();
        for (const file of files) {
            const pending = input.texts.filter((t) => !done.has(textKey(t)));
            if (pending.length === 0)
                continue;
            const plan = (0, layoutEdits_js_1.planTextEdits)(textOf.get(file.uri), pending);
            for (const edit of plan.edits) {
                counts.texts++;
                done.add(edit.ref); // a planned text edit reports exactly its textKey
            }
            if (plan.edits.length > 0)
                batch.push({ uri: file.uri, edits: plan.edits });
        }
        // unmatched anywhere — reported regardless of how many files were tried
        for (const t of input.texts) {
            if (!done.has(textKey(t)))
                skipped.push(`text "${t.text0}" (no .text({…}) literal matches its authored value/anchor)`);
        }
        commit(batch);
    }
    // -- stage 4: segment deletes rewrite existing TrackBuilder chains --
    // names the delete stage could not maintain itself (route blocks in a
    // file without create()) carry into stage 5b
    const carryAdd = [];
    const carryRemove = [];
    /** deletes that matched no source segment, net-tagged with how many sit
     *  NEAR source copper of their net — the caller refuses only those (the
     *  far ones are via-bookkeeping noise the page pushes at every deleted
     *  segment endpoint, most carrying no via) */
    let unmatchedDeletes = [];
    if (input.deletes && input.deletes.length > 0) {
        const byNetOf = (unmatched) => {
            const byNet = new Map();
            for (const d of unmatched) {
                const e = byNet.get(d.net) ?? { count: 0, near: 0 };
                e.count++;
                if (d.nearSource)
                    e.near++;
                byNet.set(d.net, e);
            }
            return [...byNet.entries()].map(([net, e]) => ({ net, count: e.count, near: e.near }));
        };
        const batch = [];
        let unmatchedSkips = null;
        let deferredUnmatched = [];
        for (const file of files) {
            const plan = (0, routeEdits_js_1.planRouteDeletes)(textOf.get(file.uri), input.deletes, 
            // sidecar routes ride collect lines, not create() arguments
            file.uri === syncUri ? { collectVar: syncFile_js_1.SYNC_TRACKS_NAME } : undefined);
            if (plan.edits.length > 0) {
                counts.deletes = plan.applied;
                for (const sk of plan.skipped)
                    skipped.push(`delete: ${sk}`);
                unmatchedDeletes = byNetOf(plan.unmatched);
                carryAdd.push(...plan.unhandledAdditions);
                carryRemove.push(...plan.unhandledRemovals);
                batch.push({ uri: file.uri, edits: plan.edits });
                break; // one declaration site: the entry that owns the routes
            }
            // files without routes/create only get to speak when nothing matched
            // anywhere — their verdict is the deferred one
            if (unmatchedSkips === null) {
                unmatchedSkips = plan.skipped;
                deferredUnmatched = byNetOf(plan.unmatched);
            }
        }
        if (batch.length === 0 && unmatchedSkips) {
            for (const sk of unmatchedSkips)
                skipped.push(`delete: ${sk}`);
            unmatchedDeletes = deferredUnmatched;
        }
        commit(batch);
    }
    // -- stage 5: new routes — planned against the post-delete text, so the
    // create() rewrite above and the paren insertion here never overlap.
    // Sidecar-first: when _sync.ts is available, declarations land inside
    // syncBoard() and reach the board through the `...syncTracks` spread --
    // hand-written files are not touched at all. The plan runs against the
    // scaffold the sidecar WOULD have, and the file is only created when a
    // route actually lands in it (an all-duplicates apply must not orphan an
    // empty _sync.ts beside an entry that never wires it) --
    if (input.routes && input.routes.length > 0 && syncUri && entryUri && syncFileUsable) {
        const current = textOf.get(syncUri);
        const plan = (0, routeEdits_js_1.planSyncRouteEdits)(current.trim() === '' ? (0, syncFile_js_1.renderSyncFile)({}) : current, input.routes, textOf.get(entryUri));
        counts.routes = plan.applied;
        for (const sk of plan.skipped)
            skipped.push(`route ${sk}`);
        if (plan.edits.length > 0 && ensureSyncScaffold()) {
            const wiring = planEntryIntegration(true);
            if (wiring.ok) {
                commit([
                    { uri: syncUri, edits: plan.edits },
                    { uri: entryUri, edits: wiring.edits },
                ]);
                syncSummary.routes += plan.applied;
            }
            else {
                for (const r of input.routes)
                    skipped.push(`route ${r.from.ref}.${r.from.pin} (_sync.ts wiring failed — no create() call in the entry file)`);
                counts.routes = 0;
            }
        }
    }
    else if (input.routes && input.routes.length > 0) {
        const batch = [];
        let noCreateSkips = null;
        for (const file of files) {
            const plan = (0, routeEdits_js_1.planRouteEdits)(textOf.get(file.uri), input.routes);
            if (plan.edits.length > 0) {
                counts.routes = plan.applied;
                for (const sk of plan.skipped)
                    skipped.push(`route ${sk}`);
                batch.push({ uri: file.uri, edits: plan.edits });
                break; // one declaration site: the entry that owns create()
            }
            if (noCreateSkips === null)
                noCreateSkips = plan.skipped;
        }
        if (batch.length === 0 && noCreateSkips) {
            for (const sk of noCreateSkips)
                skipped.push(`route ${sk}`);
        }
        commit(batch);
    }
    // -- stage 5b: cross-file create() maintenance — deletes that rewrote
    // route blocks in a file WITHOUT create() leave the create()-owning file
    // stale: emptied names dangle, split halves are neither passed to
    // create() nor imported. Fix both where create() lives, on the text as
    // it stands after every prior stage --
    if (carryAdd.length > 0 || carryRemove.length > 0) {
        const batch = [];
        for (const file of files) {
            const text = textOf.get(file.uri);
            const argsEdit = (0, routeEdits_js_1.planCreateArgsEdit)(text, carryAdd.map((a) => a.name), carryRemove);
            if (!argsEdit)
                continue;
            const edits = [argsEdit];
            const imports = planImportNamesEdit(text, carryAdd, carryRemove);
            edits.push(...imports.edits);
            for (const name of imports.unresolved) {
                skipped.push(`${name} (added to create() but no import names its sibling — import it manually)`);
            }
            batch.push({ uri: file.uri, edits });
            break;
        }
        commit(batch);
    }
    // -- stage 5c: create() consistency guard — every declared TrackBuilder
    // route must be passed to create(). The stages above maintain that
    // invariant one edit at a time; a name that slips through (seen once: an
    // UNTOUCHED route's argument dropped while its declaration survived a
    // multi-route rewrite) silently removes the route from the board — its
    // traces vanish from the viewer, unclickable, with nothing in the log.
    // Re-add every declared-but-uncreated name, on the text as it stands
    // after every prior stage. Only route/delete applies run it: it heals
    // this pipeline's own drift, not hand-edits outside it.
    if ((input.routes?.length ?? 0) > 0 || (input.deletes?.length ?? 0) > 0) {
        for (const file of files) {
            const text = textOf.get(file.uri);
            const missing = (0, routeEdits_js_1.uncreatedRouteNames)(text);
            if (!missing || missing.length === 0)
                continue;
            const argsEdit = (0, routeEdits_js_1.planCreateArgsEdit)(text, missing, []);
            if (!argsEdit)
                continue;
            commit([{ uri: file.uri, edits: [argsEdit] }]);
            break;
        }
    }
    // -- stage 5c2: zone geometry edits + deletions from the layout view —
    // rewrites / removes the matching typecad.zone() literals in the files
    // that hold them (the sidecar included), planned BEFORE new inserts so
    // both stages' offsets see stable texts --
    if ((input.zoneEdits && input.zoneEdits.length > 0) || (input.zoneDeletes && input.zoneDeletes.length > 0)) {
        const batch = [];
        const pendingEdits = [...(input.zoneEdits ?? [])];
        const pendingDeletes = [...(input.zoneDeletes ?? [])];
        for (const file of files) {
            if (pendingEdits.length === 0 && pendingDeletes.length === 0)
                break;
            const text = textOf.get(file.uri);
            const editPlan = pendingEdits.length > 0 ? (0, layoutEdits_js_1.planZoneGeometryEdits)(text, pendingEdits) : { edits: [], skipped: [] };
            const delPlan = pendingDeletes.length > 0 ? (0, layoutEdits_js_1.planZoneDeletions)(text, pendingDeletes) : { edits: [], skipped: [] };
            const all = [...editPlan.edits, ...delPlan.edits];
            if (all.length > 0) {
                batch.push({ uri: file.uri, edits: all });
                counts.zoneEdits += editPlan.edits.length;
                counts.zoneDeletes += delPlan.edits.length;
                // matched inputs retire (each edit's ref names its rect); unmatched
                // ones carry to the next file and turn final skips after the loop
                const matched = new Set(all.map((e) => e.ref));
                const retire = (list, rectOf) => {
                    for (let i = list.length - 1; i >= 0; i--) {
                        const r = rectOf(list[i]);
                        if (matched.has(`zone (${r.layer} @ ${r.x},${r.y})`))
                            list.splice(i, 1);
                    }
                };
                retire(pendingEdits, (e) => e.original);
                retire(pendingDeletes, (d) => d);
            }
            for (const sk of editPlan.skipped)
                skipped.push(`zone edit: ${sk}`);
            for (const sk of delPlan.skipped)
                skipped.push(`zone delete: ${sk}`);
        }
        for (const e of pendingEdits)
            skipped.push(`zone edit: no literal matches (${e.original.layer} @ ${e.original.x},${e.original.y})`);
        for (const d of pendingDeletes)
            skipped.push(`zone delete: no literal matches (${d.layer} @ ${d.x},${d.y})`);
        commit(batch);
    }
    // -- stage 5c3: applied artwork edits + deletions — rewrites / removes
    // the matching syncArt statements in the files that hold them (the
    // sidecar included), planned BEFORE new image inserts so both stages'
    // offsets see stable texts --
    if ((input.imageEdits && input.imageEdits.length > 0) || (input.imageDeletes && input.imageDeletes.length > 0)) {
        const batch = [];
        let pendingEdits = [...(input.imageEdits ?? [])];
        let pendingDeletes = [...(input.imageDeletes ?? [])];
        for (const file of files) {
            if (pendingEdits.length === 0 && pendingDeletes.length === 0)
                break;
            const text = textOf.get(file.uri);
            const plan = (0, imageEdits_js_1.planImageSourceEdits)(text, pendingEdits.filter((e) => !!e), pendingDeletes.filter((d) => !!d));
            const all = [...plan.edits, ...plan.deletes];
            if (all.length > 0) {
                batch.push({ uri: file.uri, edits: all });
                // spans overcount (one edit = several surgical spans) — count the
                // consumed INPUTS by their match-key refs
                counts.imageEdits += new Set(plan.edits.map((e) => e.ref)).size;
                counts.imageDeletes += new Set(plan.deletes.map((d) => d.ref)).size;
                // retire consumed inputs by their match-key refs (stable across
                // the per-file filtering, unlike array indices)
                const usedEditKeys = new Set(plan.edits.map((e) => e.ref));
                const usedDeleteKeys = new Set(plan.deletes.map((d) => d.ref));
                pendingEdits = pendingEdits.filter((e) => !e || !usedEditKeys.has(`edit:${e.match.file}@${e.match.x},${e.match.y}`));
                pendingDeletes = pendingDeletes.filter((d) => !d || !usedDeleteKeys.has(`delete:${d.file}@${d.x},${d.y}`));
                pendingEdits = pendingEdits.filter((e) => !!e);
                pendingDeletes = pendingDeletes.filter((d) => !!d);
            }
            for (const sk of plan.skipped)
                skipped.push(`artwork ${sk}`);
        }
        for (const e of pendingEdits)
            if (e)
                skipped.push(`artwork edit: no statement matches ${e.match.file} @ ${e.match.x},${e.match.y}`);
        for (const d of pendingDeletes)
            if (d)
                skipped.push(`artwork delete: no statement matches ${d.file} @ ${d.x},${d.y}`);
        commit(batch);
    }
    // -- stage 5d: zones drawn in the layout view — pours and keepouts land
    // as typecad.zone()/typecad.keepout() calls in the sidecar (they have no
    // source literal to rewrite; syncBoard() runs right before create(), so
    // the calls always reach the board). Fill settings are the API defaults;
    // the build's zone-fill materialization refills them at export. --
    if (input.zones && input.zones.length > 0) {
        // Each new pour out-ranks every zone already in source: KiCad fills by
        // DECREASING priority and a lower-priority zone keeps its clearance
        // from higher-priority copper — a pour inside a GND plane at equal
        // priority 0 loses the fill to the plane entirely (seen live: the pour
        // rendered nothing, reading as a pour touching ground with no gap).
        // Ascending across multiple inserts keeps the newest pour topmost.
        let nextPriority = 0;
        for (const file of files)
            nextPriority = Math.max(nextPriority, (0, layoutEdits_js_1.maxZonePriority)(textOf.get(file.uri)));
        const zoneStmt = (z, priority) => {
            const esc = z.net ? z.net.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
            const geo = z.points && z.points.length >= 3
                ? `layers: ['${z.layer}'], points: [${z.points.map((pt) => `{ x: ${(0, layoutEdits_js_1.fmt)(pt.x)}, y: ${(0, layoutEdits_js_1.fmt)(pt.y)} }`).join(', ')}]`
                : `layers: ['${z.layer}'], x: ${(0, layoutEdits_js_1.fmt)(z.x)}, y: ${(0, layoutEdits_js_1.fmt)(z.y)}, width: ${(0, layoutEdits_js_1.fmt)(z.w)}, height: ${(0, layoutEdits_js_1.fmt)(z.h)}`;
            const prio = priority && priority > 0 ? `, priority: ${priority}` : '';
            if (z.kind === 'keepout')
                return `  typecad.keepout({ ${geo} });`;
            return `  typecad.zone({ ${z.net ? `net: '${esc}', ` : ''}${geo}${prio} });`;
        };
        if (!syncUri || !entryUri || !syncFileUsable || !ensureSyncScaffold()) {
            for (const z of input.zones)
                skipped.push(`zone (${z.kind} on ${z.layer} needs the _sync.ts sidecar — no create() call found to wire it)`);
        }
        else {
            const at = (0, syncFile_js_1.syncZoneInsertAt)(textOf.get(syncUri));
            if (at === null) {
                for (const z of input.zones)
                    skipped.push(`zone (${z.kind} on ${z.layer} — _sync.ts has no usable syncBoard() body)`);
            }
            else {
                const edits = input.zones.map((z) => {
                    const priority = z.kind === 'pour' ? ++nextPriority : undefined;
                    return { start: at, end: at, line: zoneStmt(z, priority) + '\n' };
                });
                const wiring = planEntryIntegration(false);
                if (wiring.ok) {
                    commit([{ uri: syncUri, edits }, { uri: entryUri, edits: wiring.edits }]);
                    counts.zones = input.zones.length;
                    syncSummary.zones += input.zones.length;
                }
                else {
                    for (const z of input.zones)
                        skipped.push(`zone (${z.kind} on ${z.layer} cannot be wired into _sync.ts — no create() call in the entry file)`);
                }
            }
        }
    }
    // -- stage 5c2: net-class dimension edits from the layout view’s rules
    // panel — the matching netClass(’name’, { … }) literal is rewritten in
    // place; a class with no literal is reported (new classes are authored
    // in source, where their net-pattern assignment lives) --
    if (input.classEdits && input.classEdits.length > 0) {
        const pendingClassEdits = [...input.classEdits];
        for (const file of files) {
            if (pendingClassEdits.length === 0)
                break;
            const text = textOf.get(file.uri);
            const plan = (0, layoutEdits_js_1.planNetClassEdits)(text, pendingClassEdits);
            if (plan.edits.length > 0) {
                commit([{ uri: file.uri, edits: plan.edits }]);
                counts.classEdits += plan.edits.length;
                for (const done of plan.edits) {
                    const idx = pendingClassEdits.findIndex((e) => `net class ${e.name}` === done.ref);
                    if (idx >= 0)
                        pendingClassEdits.splice(idx, 1);
                }
            }
            skipped.push(...plan.skipped);
            if (pendingClassEdits.length === 0)
                break;
        }
        for (const e of pendingClassEdits)
            skipped.push(`net class ${e.name} not found in any source file`);
    }
    // -- stage 5d2: artwork images placed in the layout view — land as
    // `syncArt.push(new Image({ … }))` statements in the sidecar, which the
    // entry's `...syncArt` create() spread picks up (create() evaluates the
    // spread after syncBoard() ran, so every push is visible). The sidecar's
    // syncArt declaration and Image import are ensured first — older sidecars
    // predate the artwork grammar. `file` is already project-relative (the
    // caller copied the picked PNG into art/ before planning). --
    if (input.images && input.images.length > 0) {
        if (!syncUri || !entryUri || !syncFileUsable || !ensureSyncScaffold()) {
            for (const img of input.images)
                skipped.push(`image ${img.name} (needs the _sync.ts sidecar — no create() call found to wire it)`);
        }
        else {
            // ensure the declaration/import first (its own commit: the statement
            // anchor is computed against the text WITH the declaration present)
            const decl = (0, syncFile_js_1.planSyncArtDeclarationEdits)(textOf.get(syncUri));
            if (decl.length > 0)
                commit([{ uri: syncUri, edits: decl }]);
            const at = (0, syncFile_js_1.syncImageInsertAt)(textOf.get(syncUri));
            if (at === null) {
                for (const img of input.images)
                    skipped.push(`image ${img.name} (_sync.ts has no usable syncBoard() body)`);
            }
            else {
                const edits = input.images.map((img) => {
                    const esc = img.file.replace(/\\/g, '/').replace(/'/g, "\\'");
                    const geo = `file: '${esc}', at: { x: ${(0, layoutEdits_js_1.fmt)(img.x)}, y: ${(0, layoutEdits_js_1.fmt)(img.y)} }, size: [${(0, layoutEdits_js_1.fmt)(img.w)}, ${(0, layoutEdits_js_1.fmt)(img.h)}]`;
                    const side = img.side === 'back' ? `, side: 'back'` : '';
                    return { start: at, end: at, line: `  ${syncFile_js_1.SYNC_ART_NAME}.push(new Image({ ${geo}${side} }));\n` };
                });
                const wiring = planEntryIntegration(false, true);
                if (wiring.ok) {
                    commit([{ uri: syncUri, edits }, { uri: entryUri, edits: wiring.edits }]);
                    counts.images = input.images.length;
                    syncSummary.images += input.images.length;
                }
                else {
                    for (const img of input.images)
                        skipped.push(`image ${img.name} cannot be wired into _sync.ts — no create() call in the entry file`);
                }
            }
        }
    }
    // -- stage 5e: the board outline edit — rewrites the pcb.outline() call
    // in the file that owns it (a second outline in the sidecar would read as
    // a KiCad cutout, so there is no sidecar fallback: no match reports) --
    if (input.outline) {
        let planned = false;
        let reason = null;
        for (const file of files) {
            const plan = (0, layoutEdits_js_1.planOutlineEdits)(textOf.get(file.uri), input.outline.original, input.outline.rect);
            if (plan.edits.length > 0) {
                commit([{ uri: file.uri, edits: plan.edits }]);
                counts.outline = 1;
                planned = true;
                break;
            }
            if (plan.reason)
                reason = plan.reason;
        }
        if (!planned)
            skipped.push(`outline (${reason ?? 'no .outline( literal found'})`);
    }
    // -- stage 6: sticky TrackBuilder endpoints — LAST, against the final
    // route blocks (regenerated or freshly added alike): literals sitting on
    // a moved component's ORIGINAL pads translate by the same delta --
    {
        const batch = [];
        const moved = moves.filter((m) => appliedRefs.has(m.ref) && (m.pads?.length ?? 0) > 0);
        for (const file of files) {
            const fileEdits = [];
            const seen = new Set();
            for (const m of moved) {
                for (const e of (0, layoutEdits_js_1.planEndpointEdits)(textOf.get(file.uri), m)) {
                    if (seen.has(e.start))
                        continue; // one literal follows one move
                    seen.add(e.start);
                    fileEdits.push(e);
                }
            }
            if (fileEdits.length > 0) {
                counts.endpoints += fileEdits.length;
                batch.push({ uri: file.uri, edits: fileEdits });
            }
        }
        commit(batch);
    }
    return { stages, skipped, counts, touched: [...touched], unmatchedDeletes, syncFile: syncUsed ? syncSummary : null };
}
//# sourceMappingURL=layoutApply.js.map