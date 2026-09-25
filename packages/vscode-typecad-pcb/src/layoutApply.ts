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

import {
  applyPlacementEdits,
  parsePlacementLiteral,
  planComponentEdits,
  planEndpointEdits,
  planPlacementEdits,
  planTextEdits,
  textEditRef,
  type ComponentEditSpec,
  type LayoutMove,
  type TextEditInput,
} from './layoutEdits.js';
import { planCreateArgsEdit, planRouteDeletes, planRouteEdits, type PlannedEdit, type RouteDeleteInput, type RouteInput } from './routeEdits.js';

export interface LayoutApplyInput {
  moves: LayoutMove[];
  texts?: TextEditInput[];
  values?: Array<{ ref: string; value: string }>;
  labels?: Array<{ ref: string; kind: 'reference' | 'value' | 'fab'; x: number; y: number; rot: number }>;
  renames?: Array<{ ref: string; newRef: string }>;
  routes?: RouteInput[];
  deletes?: RouteDeleteInput[];
  /** board reference -> the source variable that created it */
  variableOf: (ref: string) => string | undefined;
  /** every component reference on the board (rename collision guard) */
  allRefs: Set<string>;
}

export interface LayoutApplyFile {
  uri: string;
  text: string;
}

export interface LayoutApplyCounts {
  moves: number;
  endpoints: number;
  texts: number;
  values: number;
  labels: number;
  renames: number;
  routes: number;
  deletes: number;
}

export interface LayoutApplyResult {
  /** stage-major edit batches; a stage's offsets apply to the text as of that stage */
  stages: Array<Array<{ uri: string; edits: PlannedEdit[] }>>;
  /** refs/inputs that could not be applied, with reasons (one entry each) */
  skipped: string[];
  counts: LayoutApplyCounts;
  /** every uri an edit landed on */
  touched: string[];
}

/**
 * Coalesce touching/overlapping edits into single range replacements so a
 * stage never hands its applier ambiguous ranges (a zero-width insert at
 * the same offset as a replace, say). The gap text between two merged
 * edits is carried over verbatim.
 */
function mergeEdits(text: string, edits: PlannedEdit[]): PlannedEdit[] {
  if (edits.length < 2) return edits;
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: PlannedEdit[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start > last.end) {
      out.push({ ...cur });
      continue;
    }
    last.line = last.line + text.slice(last.end, cur.start) + cur.line;
    last.end = Math.max(last.end, cur.end);
  }
  return out;
}

const textKey = (t: TextEditInput): string => textEditRef(t);

const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]\s*;?/g;

/**
 * Maintain the create()-owning file's import list alongside its args:
 * dropped route names leave their import (a fully-emptied import statement
 * goes away), split halves join the import that already names their
 * sibling. Names with no anchor import come back unresolved — reported,
 * never silently dropped (the build must not find a missing identifier).
 */
function planImportNamesEdit(
  text: string,
  add: Array<{ name: string; sibling: string }>,
  remove: string[],
): { edits: PlannedEdit[]; unresolved: string[] } {
  const edits: PlannedEdit[] = [];
  const unresolved: string[] = [];
  let pendingAdd = [...add];
  const pendingRemove = new Set(remove);
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const names = m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
    const kept = names.filter((n) => !pendingRemove.delete(n));
    const here = pendingAdd.filter((a) => names.includes(a.sibling) && !names.includes(a.name));
    pendingAdd = pendingAdd.filter((a) => !here.includes(a));
    if (kept.length === names.length && here.length === 0) continue;
    if (kept.length === 0 && here.length === 0) {
      edits.push({ start: m.index, end: m.index + m[0]!.length, line: '' }); // emptied import: drop it
      continue;
    }
    const merged = [...kept, ...here.map((a) => a.name)];
    edits.push({
      start: m.index,
      end: m.index + m[0]!.length,
      line: `import { ${merged.join(', ')} }` + m[0]!.slice(m[0]!.indexOf('}') + 1),
    });
  }
  for (const a of pendingAdd) unresolved.push(a.name);
  return { edits, unresolved };
}

/**
 * Plan the whole apply across the project's source files. `files` order is
 * the search order — a ref resolves in the first file that matches it.
 */
export function planLayoutApply(files: LayoutApplyFile[], input: LayoutApplyInput): LayoutApplyResult {
  // working texts, updated as each stage's edits apply — later stages plan
  // against exactly what the applier will see
  const textOf = new Map(files.map((f) => [f.uri, f.text]));
  const stages: LayoutApplyResult['stages'] = [];
  const skipped: string[] = [];
  const touched = new Set<string>();
  const counts: LayoutApplyCounts = { moves: 0, endpoints: 0, texts: 0, values: 0, labels: 0, renames: 0, routes: 0, deletes: 0 };

  // the page keys moves by ref — normalize, first wins
  const moves: LayoutMove[] = [];
  const seenRefs = new Set<string>();
  for (const m of input.moves) {
    if (seenRefs.has(m.ref)) continue;
    seenRefs.add(m.ref);
    moves.push(m);
  }

  const commit = (raw: Array<{ uri: string; edits: PlannedEdit[] }>): void => {
    const withEdits = raw.filter((b) => b.edits.length > 0);
    if (withEdits.length === 0) return;
    for (const b of withEdits) {
      b.edits = mergeEdits(textOf.get(b.uri)!, b.edits);
    }
    stages.push(withEdits);
    for (const b of withEdits) {
      textOf.set(b.uri, applyPlacementEdits(textOf.get(b.uri)!, b.edits));
      touched.add(b.uri);
    }
  };

  // -- stage 1: placement literals (`<var>.pcb = { x, y, … }`) by delta --
  const appliedRefs = new Set<string>();
  {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    // 'no literal found' only becomes final once every file has been tried;
    // concrete reasons (computed placement, no variable) are final at once
    const reasonByRef = new Map<string, string>();
    const finalRefs = new Set<string>();
    for (const file of files) {
      const pending = moves.filter((m) => !appliedRefs.has(m.ref) && !finalRefs.has(m.ref));
      if (pending.length === 0) continue;
      const plan = planPlacementEdits(textOf.get(file.uri)!, pending, input.variableOf);
      for (const sk of plan.skipped) {
        const deferred = sk.reason.startsWith('no `');
        if (deferred) {
          if (!reasonByRef.has(sk.ref)) reasonByRef.set(sk.ref, sk.reason);
        } else {
          reasonByRef.set(sk.ref, sk.reason);
          finalRefs.add(sk.ref);
        }
      }
      for (const e of plan.edits) appliedRefs.add(e.ref);
      if (plan.edits.length > 0) batch.push({ uri: file.uri, edits: plan.edits });
    }
    for (const m of moves) {
      if (appliedRefs.has(m.ref) || reasonByRef.has(m.ref)) continue;
      reasonByRef.set(m.ref, `no \`${input.variableOf(m.ref) ?? m.ref}\`.pcb literal found`);
    }
    // a ref that applied in a later file must not also carry the deferred
    // "no literal" verdict an earlier file recorded for it
    for (const [ref, reason] of reasonByRef) {
      if (!appliedRefs.has(ref)) skipped.push(`${ref} (${reason})`);
    }
    counts.moves = appliedRefs.size;
    commit(batch);
  }

  // -- stage 2: component constructor edits (value / rename / label) --
  // placements already applied above: labels convert against the FINAL
  // literal, so no move delta is re-added here
  const specByRef = new Map<string, ComponentEditSpec>();
  for (const v of input.values ?? []) specByRef.set(v.ref, { ref: v.ref, value: v.value });
  for (const r of input.renames ?? []) {
    const spec = specByRef.get(r.ref) ?? { ref: r.ref };
    spec.newRef = r.newRef;
    specByRef.set(r.ref, spec);
  }
  for (const l of input.labels ?? []) {
    const spec = specByRef.get(l.ref) ?? { ref: l.ref };
    spec.label = { kind: l.kind, x: l.x, y: l.y, rot: l.rot };
    specByRef.set(l.ref, spec);
  }
  const specs = [...specByRef.values()];
  if (specs.length > 0) {
    const placementCache = new Map<string, { x: number; y: number; rot: number } | null>();
    const placementOf = (ref: string): { x: number; y: number; rot: number } | null => {
      if (placementCache.has(ref)) return placementCache.get(ref)!;
      let found: { x: number; y: number; rot: number } | null = null;
      for (const file of files) {
        found = parsePlacementLiteral(textOf.get(file.uri)!, input.variableOf(ref) ?? '');
        if (found) break;
      }
      placementCache.set(ref, found);
      return found;
    };
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    const doneRefs = new Set<string>();
    for (const file of files) {
      const pending = specs.filter((sp) => !doneRefs.has(sp.ref));
      if (pending.length === 0) continue;
      const plan = planComponentEdits(textOf.get(file.uri)!, pending, placementOf, input.allRefs);
      // 'no constructor literal' defers to later files; the other reasons
      // (rename collision, missing placement) belong to the one file that
      // owns the constructor and are final
      for (const sk of plan.skipped) {
        if (sk.reason === 'no Component constructor literal found') continue;
        skipped.push(`${sk.ref} (${sk.reason})`);
        doneRefs.add(sk.ref);
      }
      for (const edit of plan.edits) {
        const spec = pending.find((sp) => edit.ref === sp.ref);
        if (!spec) continue;
        doneRefs.add(spec.ref);
        if (spec.value !== undefined) counts.values++;
        if (spec.newRef) counts.renames++;
        if (spec.label) counts.labels++;
      }
      if (plan.edits.length > 0) batch.push({ uri: file.uri, edits: plan.edits });
    }
    for (const sp of specs) {
      if (!doneRefs.has(sp.ref)) skipped.push(`${sp.ref} (no Component constructor literal found)`);
    }
    commit(batch);
  }

  // -- stage 3: silk/fab .text({ … }) literals, matched per file --
  if (input.texts && input.texts.length > 0) {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    const done = new Set<string>();
    for (const file of files) {
      const pending = input.texts.filter((t) => !done.has(textKey(t)));
      if (pending.length === 0) continue;
      const plan = planTextEdits(textOf.get(file.uri)!, pending);
      for (const edit of plan.edits) {
        counts.texts++;
        done.add(edit.ref); // a planned text edit reports exactly its textKey
      }
      if (plan.edits.length > 0) batch.push({ uri: file.uri, edits: plan.edits });
    }
    // unmatched anywhere — reported regardless of how many files were tried
    for (const t of input.texts) {
      if (!done.has(textKey(t))) skipped.push(`text "${t.text0}" (no .text({…}) literal matches its authored value/anchor)`);
    }
    commit(batch);
  }

  // -- stage 4: segment deletes rewrite existing TrackBuilder chains --
  // names the delete stage could not maintain itself (route blocks in a
  // file without create()) carry into stage 5b
  const carryAdd: Array<{ name: string; sibling: string }> = [];
  const carryRemove: string[] = [];
  if (input.deletes && input.deletes.length > 0) {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    let unmatchedSkips: string[] | null = null;
    for (const file of files) {
      const plan = planRouteDeletes(textOf.get(file.uri)!, input.deletes);
      if (plan.edits.length > 0) {
        counts.deletes = plan.applied;
        for (const sk of plan.skipped) skipped.push(`delete: ${sk}`);
        carryAdd.push(...plan.unhandledAdditions);
        carryRemove.push(...plan.unhandledRemovals);
        batch.push({ uri: file.uri, edits: plan.edits });
        break; // one declaration site: the entry that owns the routes
      }
      // files without routes/create only get to speak when nothing matched
      // anywhere — their verdict is the deferred one
      if (unmatchedSkips === null) unmatchedSkips = plan.skipped;
    }
    if (batch.length === 0 && unmatchedSkips) {
      for (const sk of unmatchedSkips) skipped.push(`delete: ${sk}`);
    }
    commit(batch);
  }

  // -- stage 5: new routes — planned against the post-delete text, so the
  // create() rewrite above and the paren insertion here never overlap --
  if (input.routes && input.routes.length > 0) {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    let noCreateSkips: string[] | null = null;
    for (const file of files) {
      const plan = planRouteEdits(textOf.get(file.uri)!, input.routes);
      if (plan.edits.length > 0) {
        counts.routes = plan.applied;
        for (const sk of plan.skipped) skipped.push(`route ${sk}`);
        batch.push({ uri: file.uri, edits: plan.edits });
        break; // one declaration site: the entry that owns create()
      }
      if (noCreateSkips === null) noCreateSkips = plan.skipped;
    }
    if (batch.length === 0 && noCreateSkips) {
      for (const sk of noCreateSkips) skipped.push(`route ${sk}`);
    }
    commit(batch);
  }

  // -- stage 5b: cross-file create() maintenance — deletes that rewrote
  // route blocks in a file WITHOUT create() leave the create()-owning file
  // stale: emptied names dangle, split halves are neither passed to
  // create() nor imported. Fix both where create() lives, on the text as
  // it stands after every prior stage --
  if (carryAdd.length > 0 || carryRemove.length > 0) {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    for (const file of files) {
      const text = textOf.get(file.uri)!;
      const argsEdit = planCreateArgsEdit(
        text,
        carryAdd.map((a) => a.name),
        carryRemove,
      );
      if (!argsEdit) continue;
      const edits: PlannedEdit[] = [argsEdit];
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

  // -- stage 6: sticky TrackBuilder endpoints — LAST, against the final
  // route blocks (regenerated or freshly added alike): literals sitting on
  // a moved component's ORIGINAL pads translate by the same delta --
  {
    const batch: Array<{ uri: string; edits: PlannedEdit[] }> = [];
    const moved = moves.filter((m) => appliedRefs.has(m.ref) && (m.pads?.length ?? 0) > 0);
    for (const file of files) {
      const fileEdits: PlannedEdit[] = [];
      const seen = new Set<number>();
      for (const m of moved) {
        for (const e of planEndpointEdits(textOf.get(file.uri)!, m)) {
          if (seen.has(e.start)) continue; // one literal follows one move
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

  return { stages, skipped, counts, touched: [...touched] };
}
