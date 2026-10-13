import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildViewerFromFiles, collectGerberFiles, parseBoardLabels, parseBoardZones, renderViewPart } from '../src/gerber_viewer/build.js';
import { buildViewerHtml } from '../src/gerber_viewer/render/viewer_html.js';
import { renderSvg } from '../src/gerber_viewer/render/svg.js';
import { detectLayer } from '../src/gerber_viewer/detect_layer.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';
import { calculateMinTraceWidth, calculateViaCurrentCapacity } from '../src/pcb/pcb_routing_calculations.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

describe('buildViewerHtml', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], { title: 'demo board' });

  it('parseBoardLabels anchors a rotated footprint\u2019s labels where KiCad plots them', () => {
    // U3 from mod-ec verbatim: footprint at (137.6, 84.8, 90), reference at
    // local (0, 2.9, 180) on F.SilkS. The plotted ink lands at board
    // (139.86..141.0, 84.39..85.14) — centered on origin + R(-90)·(0, 2.9)
    // = (140.5, 84.8), with the text angle ABSOLUTE (180, horizontal after
    // keep-upright). The pads prove the frame: pad 3 at local (-1.76, 0)
    // plots at board (137.6, 86.56). The old R(+90) + (lrot+prot) math
    // anchored the label at (134.7, 84.8) — 5.7mm from its own ink, its
    // claim radius unable to reach it, the designator unselectable
    const board = [
      '(footprint "P" (at 137.6 84.8 90) (layer "F.Cu")',
      '  (property "Reference" "U3" (at 0 2.9 180) (layer "F.SilkS") (effects (font (size 0.75 0.75) (thickness 0.1))))',
      '  (property "Value" "TS3A24159DRC" (at 0 2.9 90) (layer "F.Fab") (effects (font (size 0.75 0.75))))',
      '  (fp_text user "${REFERENCE}" (at 0 0 90) (layer "F.Fab") (effects (font (size 0.75 0.75))))',
      '  (pad "3" smd rect (at -1.76 0 90) (size 0.28 0.28) (layers "F.Cu"))',
      ')',
    ].join('\n');
    const labels = parseBoardLabels(board)['U3']!;
    const ref = labels.find((l) => l.kind === 'reference')!;
    expect(ref.x).toBeCloseTo(140.5, 3);
    expect(ref.y).toBeCloseTo(-84.8, 3);
    expect(ref.rot).toBe(180); // absolute — the footprint angle never adds
    const val = labels.find((l) => l.kind === 'value')!;
    expect(val.x).toBeCloseTo(140.5, 3);
    expect(val.rot).toBe(90);
    const fab = labels.find((l) => l.kind === 'fab')!;
    expect(fab.x).toBeCloseTo(137.6, 3);
    expect(fab.y).toBeCloseTo(-84.8, 3);
    expect(fab.rot).toBe(90);
    // a rot-180 part is its own mirror — anchors unchanged by the sign fix
    const r5 = parseBoardLabels(
      '(footprint "P" (at 133.597 81.72 180) (layer "F.Cu")' +
        '  (property "Reference" "R5" (at 0 -1.43 -90) (layer "F.SilkS") (effects (font (size 0.75 0.75)))))',
    )['R5']![0]!;
    expect(r5.x).toBeCloseTo(133.597, 3);
    expect(r5.y).toBeCloseTo(-83.15, 3);
  });

  it('is fully self-contained (no external references)', () => {
    expect(html).not.toMatch(/src="http/i);
    expect(html).not.toMatch(/href="http/i);
    expect(html).toContain('<script>');
    expect(html).toContain('#board');
  });

  it('stamps the generator identity when given (the restore fast path keys on it)', () => {
    const stamped = buildViewerHtml(svg, [info], { title: 'demo board', generatorVersion: '9.9.9' });
    expect(stamped).toContain('<meta name="tc-viewer-generator" content="9.9.9">');
    // unstamped pages carry an empty content — the extension treats a
    // missing stamp as stale and regenerates
    expect(html).toContain('<meta name="tc-viewer-generator" content="">');
  });

  it('makes board text unselectable (silk/fab/refdes labels never highlight)', () => {
    expect(html).toContain('#board, #board text { -webkit-user-select: none; user-select: none; }');
  });

  it('a host status lock goes stale instead of freezing the readout forever', () => {
    // the extension's render notices lock the status line with a timestamp
    // (data-locked-at, set by the injected probe client); the page must
    // reclaim the line once the promised render is 2 minutes late — a
    // stalled rebuild chain must not freeze the readout permanently
    expect(html).toContain("getAttribute('data-locked-at')");
    expect(html).toContain('120000');
  });

  it('a via under a component body is clickable and Tab-cyclable', () => {
    // the part's own graphics swallow DOM hits, so element-based picking
    // never reaches copper beneath the body: the click path under
    // .layout-comp checks the via BARREL before falling through to
    // segments, and the Tab cycle carries a via candidate
    expect(html).toContain('function viaUnderCursor(');
    expect(html).toContain('via = viaUnderCursor(gerberAt(ev.clientX, ev.clientY))');
    expect(html).toContain("cands.push({ kind: 'via', el: cycleVia })");
  });

  it('a Tab-selected text shows an overlay selection box, not just a glyph recolor', () => {
    // texts under a pour/trace/part body are only reachable through the Tab
    // cycle — and the cycle's selection must READ. Recoloring claimed
    // strokes alone is invisible where the ink is already the selection
    // color (white silk/fab on the dark theme's white --sel) or where the
    // label's strokes were claimed away (an off-anchor reference in a dense
    // corridor), so selection owns an overlay box at the text's live anchor
    expect(html).toContain('function layoutTextSelBoxSync()');
    expect(html).toContain("getElementById('layout-text-sel-box')");
    expect(html).toContain('#layout-text-sel-box {');
    expect(html).toContain('vector-effect: non-scaling-stroke');
    // the box draws and clears through markTextSel — every selection path
    // (Tab cycle, glyph press, E-panel retarget) funnels through it
    expect(html).toContain('layoutTextSelBoxSync();');
    // the box rides pending moves: its own drag (syncTextVisual) and the
    // part drag transporting it (renderLayoutMoves)
    expect(html).toContain('if (i === layoutTextSel) layoutTextSelBoxSync();');
    // cycling to another kind (pad/segment/via/zone/part) takes the text
    // selection with it — a stale box surviving onto the pour reads as two
    // selections at once
    expect(html).toContain('function textSelClear()');
    expect(html).toContain('textSelClear(); // the cycled-to kind owns the board alone');
    expect(html).toContain("textSelClear(); // the zone owns the selection");
    expect(html).toContain('textSelClear(); // a part selection replaces any text selection');
    expect(html).toContain('textSelClear(); // copper owns this press');
  });

  it("the hovered part's own labels join the Tab cycle (a buried designator is selectable over its part)", () => {
    // a reference's plotted ink may sit under the part handle or be missing
    // from the plot entirely, and the anchor disc cannot reach mid-body —
    // over the BODY is where the user aims at the designator (U3 in mod-ec's
    // corridor: silk layer off, no plotted strokes, pour and trace through
    // the area, the cycle showing only zone/segment). KiCad's Tab steps
    // through a footprint's fields the same way
    expect(html).toContain("tl2.ref !== compG.__lc.ref || seenLbl[li2]) continue;");
    expect(html).toContain("if (tl2.kind !== 'reference' && !textLayerVisible(tl2)) continue;");
    // the hovered comp itself is found geometrically too — pad labels and
    // fab ink above the handle swallow the DOM hit, which starved the cycle
    // of the part (and with it, its labels)
    expect(html).toContain('var gb = compAABB(gs.c, gs.x, gs.y, gs.rot);');
    // the anchor disc tracks the LIVE label position (comp-transported +
    // own offset), not the authored one
    expect(html).toContain('var live = textState(i);');
    // the selection box is a drag target in its own right — a Tab-selected
    // text with no claimed strokes still honors "drag to move"
    expect(html).toContain("r.addEventListener('pointerdown', function (ev) {");
    expect(html).toContain('cursor: move;');
  });

  it('a press on claimed glyph ink selects its text over the copper beneath', () => {
    // layer groups carry pointer-events:none, so claimed text paths never
    // receive real presses — copper's generous capture ate them for the
    // trace running through the label. The layout-view capture path now
    // aim-tests the claimed ink (screen-space sampling sees through
    // pointer-events and transforms) before the near-segment search
    expect(html).toContain('if (viewMode === \'layout\') {');
    expect(html).toContain('var tstack = textStackNear(fgp);');
    expect(html).toContain('pointNearPathInk(tpaths[tp3], ev.clientX, ev.clientY, 6)');
    expect(html).toContain('textPointerDown(tstack[ts3], ev);');
  });

  it('cycle candidates come from directly under the cursor — no halos, no long-reach discs', () => {
    // pointer-events:all counts the STROKE band even when stroke is none —
    // the inherited default stroke-width of 1px (=1mm board units) made
    // every part handle hittable ~0.5mm outside its body
    expect(html).toContain('#layout-overlay .layout-comp rect,');
    expect(html).toContain('stroke-width: 0;');
    // a text with no claimable ink cycles only within a glyph-height-scaled
    // disc around its anchor — the old length-scaled radius reached 7+ mm
    // for long values, cycling labels nowhere near the cursor
    expect(html).toContain('if (!paths.length && !own) {');
    expect(html).toContain('var reach = Math.min(0.65 * (t.h || 1) * (String(t.text).length + 2), (t.h || 1) * 0.9 + 0.25);');
  });

  it('leader lines tie a selected part to its attached labels', () => {
    // on a busy board a designator sits millimeters from the body it names
    // and a fab value reads as orphaned ink — selecting a part (or one of
    // its labels) draws one dashed hairline per label, part center to the
    // label's live anchor, both ends tracking pending moves
    expect(html).toContain('function layoutLeaderSync()');
    expect(html).toContain("getElementById('layout-leaders')");
    expect(html).toContain('#layout-leaders line {');
    expect(html).toContain('stroke-dasharray: 0.9 0.6;');
    expect(html).toContain('layoutLeaderSync(); // leaders from the selected body(ies) to their labels');
    // a centered label (the fab reference mirror on the body) needs no line
    expect(html).toContain('if (Math.hypot(st3.x - c0.x, st3.y - c0.y) < 0.3) continue;');
    // and only labels on visible layers get one — a leader aims the eye at
    // ink, and a hidden rail leaves none to aim at
    expect(html).toContain('if (!lblVisible(t3)) continue;');
    expect(html).toContain('no rail to hide behind');
    // and the leaders re-anchor on every move commit and selection sync
    expect(html).toContain('layoutTextSelBoxSync();\n    layoutLeaderSync();');
  });

  it('revert asks for confirmation, then refreshes to the source render', () => {
    // webviews suppress window.confirm, so the dialog is the page's own:
    // OK reverts the session and asks the host to re-serve the page (a
    // true refresh — the webview reloads to the source's own render);
    // without a host the in-page reset is the whole revert. The dialog is
    // modal — every key but Esc/Enter dies behind the dim
    expect(html).toContain('function revertAskShow()');
    expect(html).toContain("revertAskEl.id = 'revert-confirm'");
    expect(html).toContain('if (revertAskOpen()) {');
    expect(html).toContain('typeof window.typecadRefresh');
    expect(html).toContain('#revert-confirm .rc-ok');
    // and the button only asks when there is something to lose
    expect(html).toContain('function layoutPendingEdits()');
    expect(html).toContain('if (!layoutPendingEdits()) {');
  });

  it('a selected via shows its ring even under a component body', () => {
    // the in-element selection ring paints in the copper group — beneath
    // part graphics — so viaHiSync mirrors every selected via into an
    // on-top group that re-appends itself as the flip host's last child
    // (last child = top of the SVG paint order) on every sync
    expect(html).toContain('function viaSelTopGroup(');
    expect(html).toContain("id', 'via-sel-top'");
    expect(html).toContain('flipHost.appendChild(g)');
    expect(html).toContain('route-via-sel-top');
  });

  it('routing keys: V arms a via for the next click, Tab cycles the copper layer', () => {
    // KiCad's rhythm: V records intent, the next CLICK anchors the segment
    // and places the via at that point (the old V fired instantly at the
    // hover position); Tab during a live route cycles the layer the next
    // segment draws on — at the route start and on the continuation piece
    // after a via, whose target layer follows the choice
    expect(html).toContain('routeState.viaArmed = !routeState.viaArmed');
    expect(html).toContain('placeViaCore(routeState.sx, routeState.sy, curPiece())');
    expect(html).toContain('if (routeState) cycleRouteLayer();');
    expect(html).toContain('function cycleRouteLayer()');
    expect(html).toContain('v.to = next;');
  });

  it('the armed via shows its keep-out ring before the click', () => {
    // the preview rides the placed-via halo class (so the live clear/red
    // tint and via-size resizes apply to it) plus a dashed barrel ghost,
    // tracks the walk end on every follow, and is cleared on disarm,
    // placement, commit, and cancel
    expect(html).toContain('function viaArmPreviewMake()');
    expect(html).toContain("'route-via-halo route-via-preview'");
    expect(html).toContain('route-via-arm-ghost');
    expect(html).toContain('viaArmPreviewSync(wend.x, wend.y)');
    expect(html).toContain('function viaArmPreviewClear()');
    // the tint must TOGGLE the bad class, never replace the class list —
    // a swap stripped route-via-preview from the halo, freezing the ring
    // where V was pressed and stranding it beyond cleanup
    expect(html).toContain("classList.toggle('bad', state === 'bad')");
  });

  it('the armed via checks its OWN barrel clearance — tint and refusal', () => {
    // the preview's red is the barrel's margin (a degenerate segment of
    // the via's width over the same obstacles and rule a trace uses), not
    // the trace walk's — and a click that would land the barrel on netted
    // foreign copper is refused whole, matching trace-anchor behavior
    expect(html).toContain('function viaArmMarginAt(');
    expect(html).toContain('routeState.viaMargin = viaArmMarginAt(wend.x, wend.y)');
    expect(html).toContain('function viaHitsNettedCopper(');
    expect(html).toContain('if (routeState.viaArmed && viaHitsNettedCopper(g.x, g.y))');
    expect(html).toContain('.route-via-arm-ghost.bad');
  });

  it('a press on a part body claims the PART, not the silk label under it', () => {
    // elementsFromPoint ignores pointer-events and paint order, so a refdes
    // glyph stacked beneath a part handle made every body press delegate
    // to the text handler — small parts (refdes under the whole body) were
    // always hijacked (their text ghost engaged, reading mirrored) and
    // U3 was unselectable. Delegation now requires the press to be ON the
    // glyph's ink (screen-space stroke sampling)
    expect(html).toContain('function pointNearPathInk(');
    expect(html).toContain('stacked under the pointer is not the same as AIMED at');
    expect(html).toContain("if (se.tagName === 'path' && !pointNearPathInk(se, ev.clientX, ev.clientY, 6)) continue;");
  });

  it('a part body always reads movable and owns its press', () => {
    // KiCad parity: the move cursor shows on HOVER over any part body, not
    // only on the selected one (unselected bodies kept the board crosshair
    // and read as unmovable). And pressing a part selects the PART — the
    // capture listener no longer claims an underlying segment for the
    // trace selector (in dense corridors that made U3 unselectable); a via
    // barrel under the body still claims its press, and traces under parts
    // stay reachable through the Tab cycle
    expect(html).toContain('#layout-overlay .layout-comp { cursor: move; }');
    expect(html).toContain('the part OWNS its body');
    expect(html).not.toContain('hitLine = segAt(gpPart)');
  });

  it('the via keep-out sees copper on EVERY layer — traces and pads', () => {
    // a via spans the stack: its obstacle world is every copper group's
    // foreign ink PLUS the pad manifest's exact rects (N/C pads included —
    // unconnected pad copper is real copper), so the ring reddens over
    // parts whose pads are mostly unconnected (seen live: nothing red over
    // U1 while U3's trace reddened). And the halo rings carry a thin
    // BOARD-UNIT stroke — an unsized SVG stroke is 1 user unit = 1mm of
    // board, which read as a ~1.8mm band for a 0.85mm keep-out
    expect(html).toContain('function viaObstacles()');
    expect(html).toContain('buildObstacles(gs[gi], routeState.net)');
    expect(html).toContain('padEffBoard(p)');
    expect(html).toContain('routeState.viaObsCache');
    expect(html).toMatch(/\.route-via-halo \{[^}]*stroke-width: 0\.05/);
    expect(html).toMatch(/\.route-via-arm-ghost \{[^}]*stroke-width: 0\.05/);
  });

  it('excludes the fat route-hit click twins from the live routing obstacle scan', () => {
    // every trace path gets an invisible stroke:max(w,0.5) twin for segment
    // selection; counting those as copper inflated each track to ~4x its
    // width and flagged phantom clearance violations all over dense boards
    // (U3 pin 2's corridor sat 0.25mm from a 0.5mm phantom of a 0.127mm VCC
    // trace — permanently red until the twin was skipped)
    expect(html).toContain("el.classList.contains('route-hit')");
  });

  it('keeps the pad-snap magnet pad-scaled, not corridor-scaled', () => {
    // at fit-to-board zoom the zoom-adaptive term is enormous and only the
    // world clamp governs; at 1.2mm every pad around a fine-pitch part won
    // the snap (composite pad pairs sit 0.285mm apart) and the walk refused
    // to enter open space until deeply zoomed in
    expect(html).toContain('return Math.min(0.5, Math.max(0.15, 14 / k));');
    expect(html).toContain('return Math.min(0.4, Math.max(0.1, 10 / k));');
  });

  it('gates ink nudges on clearance and measures tracks by their true centerline', () => {
    // arrow-key nudges used to tunnel segments straight through obstacles;
    // the gate reuses the drag's rule (refuse + red flash). The distance
    // measure itself uses the track's polyline — a diagonal's bbox is far
    // fatter than its copper and refused nudges that were ~0.5mm clear
    expect(html).toContain("'nudge refused \\u2014 clearance violation'");
    expect(html).toContain('function ptSegDist(');
    expect(html).toContain('dist -= o.hw;');
  });

  it('gates PART nudges with the same poly-aware measure — pads walk their perimeter', () => {
    // the part nudge gate measured every obstacle by its bounding box, so
    // diagonal tracks read as their fat boxes and whole corridors refused
    // all four directions (seen live: C6/U3 between VCC diagonals). Pads
    // now measure through the shared margin walk — perimeter samples,
    // true centerlines for tracks, same-net copper connects — and the
    // verdict is ADVISORY, not a gate: the M-drag lands ungated, and a
    // hard nudge gate boxed densely routed parts in completely (traces
    // genuinely between C6's pads). The part lands; the ghost flashes red
    // and the status says DRC when a pad sits in violation. The board
    // edge is no part obstacle either (edge connectors overhang the
    // outline by design)
    expect(html).toContain('function padObstacleMargin(');
    expect(html).toContain('return clearanceMargin(obs, per, 0, true);');
    expect(html).toContain('function partNudgeWarning(');
    expect(html).toContain('if (next < 0) return true;');
    expect(html).toContain("var nudgeBad = partNudgeWarning(nudgeRefs, d[0], d[1]);");
    expect(html).toContain("' \\u2014 clearance violation, DRC will flag it'");
    expect(html).toContain('function clearanceMargin(obs, pts, w, skipEdge)');
    expect(html).toContain('if (!skipEdge) {');
    // the perimeter closes (5 points = 4 walked edges around the pad)
    expect((html.match(/hw, y: pgy - hh/g) || []).length).toBeGreaterThanOrEqual(2);
    // the old absolute bbox test and the hard part refusal are gone (the
    // INK nudge keeps its own — it is the trace's, asserted above)
    expect(html).not.toContain('if (Math.hypot(ddx, ddy) < clr) return true;');
    expect((html.match(/nudge refused/g) || []).length).toBe(1);
    // a landed nudge answers in the status bar like the M-drag
    expect(html).toContain('fmtPos(nudgeLast.__lx)');
  });

  it('obstacles track moved parts — ghost transforms fold in, ripped ink skips', () => {
    // a moved part's ink carries its ghost as the element's OWN transform,
    // which getBBox ignores: every clearance verdict kept testing the part
    // at its authored spot — traces through the OLD position stayed red,
    // the NEW position welcomed them (seen live after a part move). The
    // obstacle build folds the transform into both the bbox (boxInParent)
    // and the track centerline verts, skips display:none ink (a moved
    // part's ripped routing is not copper until the rebuild), and a live
    // route's cached obstacle lists rebuild when a move commits
    expect(html).toContain('bb = boxInParent(el);');
    expect(html).toContain('poly.push([tm.a * vx + tm.c * vy + tm.e, tm.b * vx + tm.d * vy + tm.f]);');
    expect(html).toContain('ripped ink (a moved part');
    expect(html).toContain("if (el.getAttribute('display') === 'none') continue;");
    expect(html).toContain('routeState.viaObsCache = null;');
    expect(html).toContain('rpiece.obstacles = buildObstacles(rpiece.layerGroup, routeState.net);');
  });

  it('walk ties are layer-local — no snapping onto other layers\' copper', () => {
    // routeEndpoint gathered tie candidates from ALL copper groups, so a
    // walk on one layer snapped its anchors onto traces buried on another
    // (seen live: an anchor just north of U1.9 kept capturing to an In2
    // trace under it — no via, no connection, not copper on this layer).
    // Trace ties and barrel ties now require their ink in the CURRENT
    // piece's layer group (a barrel qualifies through its flash there)
    expect(html).toContain('ties are LAYER-LOCAL');
    expect(html).toContain("vink[vi2].closest(\"g[data-kind='copper']\") !== pieceLg") ;
    expect(html).toContain("segs[si2].closest(\"g[data-kind='copper']\") !== pieceLg");
  });

  it('V outside a route arms a FREE VIA — keep-out ring, net adopted from copper, click places', () => {
    // V with no route live now does what it does mid-route: the barrel's
    // DRC keep-out ring follows the cursor, reddening on the same
    // violations (stacked foreign copper, via-on-via), and the click
    // places a through-via ANYWHERE — the net comes from the copper under
    // the ring (pad, barrel, any layer's trace, POUR REGION — a stitching
    // via takes the pour's net), and off copper the via places FLOATING
    // (the library's net is optional; the canonical statement omits it)
    expect(html).toContain('function freeViaArm()');
    expect(html).toContain('function freeViaNetAt(gx, gy)');
    expect(html).toContain('function freeViaPlace()');
    expect(html).toContain('else freeViaArm();');
    expect(html).toContain('if (freeVia) {\n      var fg = gerberAt(ev.clientX, ev.clientY);');
    expect(html).toContain('freeViaPlace();\n      return;');
    expect(html).toContain("freeViaClear('via cancelled');");
    expect(html).toContain('freeViaClear(); // a route starting disarms any free via');
    // pour adoption: a pour region is copper too (isPointInFill)
    expect(html).toContain('pours3[po].isPointInFill(pourPt)) return pnet;');
    // floating placement: no copper under the ring still places
    expect(html).toContain('no copper under it: a FLOATING via');
    expect(html).toContain("' (floating \\u2014 no net)");
    // the E panel edits the via's NET: a select over the board's nets plus
    // floating, applied as delete + re-place netted (works for session
    // and board-built barrels — both ride the existing payloads)
    expect(html).toContain('function setViaNet(v, newNet, size, drill)');
    expect(html).toContain('<select id="vp-net"');
    expect(html).toContain('\\u2205 none (floating)');
    expect(html).toContain("'via net \\u2192 '");
    // a netted via is a ratsnest NODE: a barrel stranded from its net's
    // copper owes a wire like a pad does (assigning a net to a free via
    // drew nothing — the via's component held no pad and was read as a
    // dead stub)
    expect(html).toContain('a barrel is a CONNECTION POINT like a pad');
    expect(html).toContain('if (!els[rv].via) continue;');
    // the preview elements must NOT carry route-via-preview — the armed
    // route via's sweeps (viaArmPreviewClear) must not eat the free ring
    expect(html).not.toContain("'route-via-halo route-via-preview free-via'");
  });

  it('Tab to another copper layer rebuilds the walk\'s obstacle world', () => {    // cycleRouteLayer switched the piece's canon/layerGroup/ink but left
    // the obstacle list built for the ORIGINAL layer — a route Tabbed to
    // In1 kept measuring against F.Cu copper and reddened over crossings
    // the new layer doesn't carry (seen live: every F.Cu obstacle tripped
    // an In1 walk)
    expect(html).toContain('piece.obstacles = buildObstacles(lg, routeState.net);');
    expect(html).toContain('the obstacle list was built for the layer the piece STARTED on');
  });

  it('never lets a barrel overlap another barrel, same net or not', () => {    // the armed via's refusal tested NETTED copper only — the route's own
    // net is exempt there (via-in-pad, via-on-trace are connections), so a
    // via sailed straight onto a same-net via (seen live). The overlap test
    // has NO net exemption, tints the arm preview red, refuses the click
    // with its own message, and includes this route's already-placed
    // barrels (their data-route stamp only lands at commit)
    expect(html).toContain('function viaOverlapsVia(');
    expect(html).toContain("routeUi.querySelectorAll('circle.route-via')");
    // red and refusal begin where the OUTER keep-out ring meets the other
    // barrel — barrel radii PLUS clearance, not copper-to-copper contact
    expect(html).toContain('if (Math.hypot(p.x - x, p.y - y) < (size + other) / 2 + clr) return true;');
    expect(html).toContain('if (viaOverlapsVia(wend.x, wend.y, routeState.via.size)) routeState.viaMargin = -1;');
    expect(html).toContain('routeState.viaArmed && viaOverlapsVia(g.x, g.y, routeState.via.size)');
    expect(html).toContain("'via keep-out violation \\u2014 another barrel is inside the ring; move it before clicking'");
  });

  it('rats nest: a pin numbered on two pads is one node — no wire between them', () => {
    // dual-row connectors (J1/J2 on the live board) plot every pin twice;
    // the duplicate pads are joined inside the footprint, but the ratsnest
    // treated them as separate nodes — they owed each other a wire at rest,
    // and only a perfectly-snapped finish cleared it when routed. Same-pin
    // pads now union into one node (pin resolved from the pad manifest by
    // authored position when the island pad carries none), wired-ness
    // propagates to twins, and a route reaching EITHER pad satisfies the pin
    expect(html).toContain('var uPin = uIslandPad.pin !== undefined ? String(uIslandPad.pin) : null;');
    expect(html).toContain('a pin numbered on more than one pad is ONE node');
    expect(html).toContain('pads[pj].ref === pads[pk2].ref && pads[pj].pin === pads[pk2].pin');
    expect(html).toContain('same-pin propagation');
  });

  it('an apply in flight owns the pipeline — disabled cursor, dead clicks and keybinds', () => {
    // a click landing mid-build (a part grab, a route anchor) edits state
    // the rebuild is about to replace, and its undo entry outlives a page
    // it no longer describes. The apply click locks input until the host's
    // callback lands: body.applying paints the not-allowed cursor on
    // everything, the window pointerdown CAPTURE swallows every press
    // before any downstream handler, and the keydown handlers (layout
    // keybinds, Escape cascade, view keys) return at their tops. A
    // three-minute failsafe unlocks a host that never answers.
    expect(html).toContain('function applyLockSet(on)');
    expect(html).toContain("document.body.classList.toggle('applying', on);");
    expect(html).toContain('body.applying, body.applying * { cursor: not-allowed !important; }');
    expect(html).toContain('if (applyBusy) return; // an apply owns the pipeline — keybinds are dead until it lands');
    expect(html).toContain('if (applyBusy) return; // an apply owns the pipeline — even Escape waits');
    expect(html).toContain('if (applyBusy) return; // view keys too — the page is mid-rebuild');
    expect(html).toContain('if (applyBusy) {');
    expect(html).toContain('}, 180000);');
  });

  it('hosts the zone tool in the E properties panel, not the sidebar', () => {
    // the sidebar's draw-zone row (button + kind/layer/net selects, which
    // read as empty until armed) moved into the nothing-selected properties
    // panel — populated on open, prefs surviving panel rebuilds
    expect(html).not.toContain('<div id="zone-tools">');
    expect(html).toContain('function zoneToolsBind()');
    expect(html).toContain('var zonePrefs = { kind: ');
  });

  it('hosts artwork placement in the E properties panel with I as its key', () => {
    // the place-image row left the sidebar the same way; plain I arms it
    // when the eyedropper has nothing to grab (no selection, no route, no
    // trace under the cursor) — over copper the eyedropper keeps the key
    expect(html).not.toContain('<div id="image-tools">');
    expect(html).toContain('function imageToolsBind()');
    expect(html).toContain('imageArm();');
  });

  it('does not persist un-applied board edits across sessions', () => {
    // invisible state returning after a reload is impossible to track —
    // the pending store is gone, and a load-time scrub removes any store a
    // previous version left behind
    expect(html).not.toContain('function persistPending()');
    expect(html).not.toContain('function restorePending()');
    expect(html).toContain("lkey.indexOf('typecadPending:')");
  });

  it('persists layer settings to localStorage keyed per board', () => {
    expect(html).toContain("gerber-viewer:v1:' + document.title");
    expect(html).toContain('localStorage.getItem');
    expect(html).toContain('localStorage.setItem');
    // every mutation path saves: checkbox, opacity slider, All/None buttons
    expect(html).toMatch(/syncLayer\(cb\);[\s\S]{0,200}persist\(\);/);
    expect(html).toMatch(/syncOpacity\(slider\); persist\(\)/);
    expect(html).toMatch(/function setAll\(on\) \{[\s\S]*?persist\(\);/);
  });

  it('has a dark/light theme selector that persists and respects the OS preference', () => {
    expect(html).toContain('id="btn-theme"');
    expect(html).toContain("'gerber-viewer:theme:v1'");
    // light theme overrides via a body class; OS preference is the first-visit default
    expect(html).toMatch(/body\.light\s*\{/);
    expect(html).toContain('prefers-color-scheme: light');
    expect(html).toMatch(/applyTheme\(savedTheme\)/);
  });

  it('themes the board canvas and keeps clear-polarity cutouts in sync', () => {
    // dark canvas by default, white in light theme
    expect(html).toMatch(/--page:\s*#16181d/);
    expect(html).toMatch(/body\.light\s*\{[\s\S]*?--page:\s*#ffffff/);
    // the svg's clear-polarity var follows the computed canvas color
    expect(html).toContain("svg.style.setProperty('--bg'");
    // near-black layer kinds are recolored on the dark canvas, cutouts exempt
    expect(html).toMatch(/\[data-kind="silkscreen"\]/);
    expect(html).toMatch(/\[data-kind="drill"\]/);
    expect(html).toMatch(/\[data-kind\] \.cut\s*\{/);
    // region paths carry stroke="none" — they must NOT get the recolor stroke
    // or TrueType text glyphs balloon with a 1-unit outline
    expect(html).toMatch(/\[stroke\]:not\(\[stroke='none'\]\)/);
    // sidebar chips follow the dark-theme recoloring
    expect(html).toMatch(/\.layer-row\[data-kind="silkscreen"\] \.chip/);
  });

  it('lists layers with toggles and opacity sliders', () => {
    expect(html).toContain('demo-F_Cu.gbr');
    expect(html).toContain('class="layer-vis"');
    expect(html).toContain('class="layer-opacity"');
    expect(html).toContain('data-layer-id="demo-f_cu-gbr"');
  });

  it('collects KiCad inner-copper .g1…g30 plots and lists them as inner copper layers', () => {
    // a 4-layer fabrication set shape: numbered inner plots ride .g1/.g2 —
    // the static extension allowlist used to skip them silently, leaving a
    // 4-layer board rendered (and layer-listed) as if it were 2-layer
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-inner-'));
    try {
      const trace = read('traces.gbr');
      for (const name of ['demo-F_Cu.gtl', 'demo-In1_Cu.g1', 'demo-In2_Cu.g2', 'demo-B_Cu.gbl']) {
        fs.writeFileSync(path.join(dir, name), trace);
      }
      const collected = collectGerberFiles([dir]);
      expect(collected.files).toHaveLength(4);
      const result = buildViewerFromFiles([dir], { title: 'inner demo' });
      const inners = result.layers.filter((l) => l.side === 'inner');
      // display names drop the shared board prefix; ids keep the full basename
      expect(inners.map((l) => l.name).sort()).toEqual(['In1_Cu', 'In2_Cu']);
      expect(inners.every((l) => l.kind === 'copper')).toBe(true);
      expect(result.html).toContain('data-layer-id="demo-in1_cu-g1"');
      expect(result.html).toContain('data-layer-id="demo-in2_cu-g2"');
      // painter's order keeps the stack readable: B_Cu, In1, In2, F_Cu
      const copperOrder = result.layers.filter((l) => l.kind === 'copper').map((l) => l.name);
      expect(copperOrder).toEqual(['B_Cu', 'In1_Cu', 'In2_Cu', 'F_Cu']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('embeds the svg with a board id and panzoom group', () => {
    expect(html).toContain('id="board"');
    expect(html).toContain('id="panzoom"');
    expect(html).toContain('id="yflip"');
  });

  it('uses a crosshair cursor on the board canvas', () => {
    expect(html).toMatch(/#board\s*\{[^}]*cursor:\s*crosshair/);
    expect(html).not.toContain("cursor = 'grab'");
    // crosshair everywhere — also while the ruler tool is armed
    expect(html).not.toContain('cursor: cell');
  });

  it('has a measurement tool that sticks rulers, clears on Escape, and follows the theme', () => {
    // the toolbar button is retired — the overlay machinery remains
    expect(html).not.toContain('id="btn-measure"');
    // overlay group rides inside panzoom (injected after the y-flip group)
    expect(html).toContain('id="yflip"');
    expect(html).toMatch(/<\/g><g id="measure"><\/g><g id="drc"><\/g><g id="typecad-probe"><\/g><g id="asm-halo"[^>]*><\/g><\/g><\/svg>/);
    // click-to-start / click-to-stick state machine + Escape clears all
    expect(html).toContain('measureStart = p;');
    expect(html).toContain('rulers.push(');
    expect(html).toMatch(/ev\.key === 'Escape'[\s\S]*?rulers = \[\]/);
    // theme-following ruler colors
    expect(html).toMatch(/--measure:\s*#6db3f2/);
    expect(html).toMatch(/body\.light\s*\{[\s\S]*?--measure:\s*#0b62c4/);
    expect(html).toMatch(/#measure line\s*\{[^}]*var\(--measure\)/);
    // shift snaps the endpoint to 45-degree increments (live and on stick)
    expect(html).toContain('function snapToAngles');
    expect(html).toMatch(/if \(ev\.shiftKey\) mouseBoard = snapToAngles\(measureStart, mouseBoard\)/);
    expect(html).toMatch(/if \(ev\.shiftKey\) p = snapToAngles\(measureStart, p\)/);
    // an armed ruler takes click precedence over everything on the board:
    // the capture guard outruns the part/pad/text/segment/marquee
    // pointerdown handlers (whose preventDefault suppresses the mousedown
    // this tool clicks ride on), so a ruler starts on a trace or a part
    // body as readily as on empty space — and a fast click pair never
    // opens the part value editor over the stuck ruler
    expect(html).toMatch(
      /window\.addEventListener\('pointerdown', function \(ev\) \{[\s\S]*?if \(!measuring \|\| ev\.button !== 0\) return;[\s\S]*?svg\.contains\(ev\.target\)\) return;[\s\S]*?ev\.stopPropagation\(\);[\s\S]*?\}, true\);/,
    );
    expect(html).toMatch(/window\.addEventListener\('dblclick', function \(ev\) \{[\s\S]*?if \(!measuring\) return;[\s\S]*?ev\.stopPropagation\(\);[\s\S]*?\}, true\);/);
  });

  it('exposes the cross-probe API for embedded surfaces (vscode webview)', () => {
    // the vscode extension's injected client calls these to select components
    // from the editor and highlight nets — must feature-check, browser tabs
    // also load this page
    expect(html).toContain('window.typecadViewer');
    expect(html).toMatch(
      /window\.typecadViewer = \{[^}]*searchRefs: searchRefs[^}]*highlightNet: highlightNet[^}]*clearNetHighlight: clearNetHighlight[^}]*\}/,
    );
  });

  it('folds each hit own transform into the search bbox (pcba glyphs are translate/rotate groups)', () => {
    // getBBox ignores an element's own transform; pcba glyph groups carry
    // translate(centroid) rotate(angle), so their local boxes must be
    // transformed into the board frame before unioning with the pads' —
    // otherwise the fit spans origin-to-part and the view lands zoomed out
    expect(html).toContain('function boxInParent');
    expect(html).toMatch(/transform\.baseVal\.consolidate/);
    expect(html).toContain('b = boxInParent(hits[j])');
  });

  it('appends the source variable to the hover readout when the host provides it', () => {
    // the vscode extension's injected client installs window.typecadVarFor;
    // the readout reads "R1 { source r1 }" instead of the bare designator
    expect(html).toContain('window.typecadVarFor');
    expect(html).toContain("' { source ' + vn + ' }'");
  });


  it('brightens the matched net at zero transparency, zone fills excepted', () => {
    // the highlight color is per-view: pure white on the blueprint paper,
    // elsewhere the color copper already uses — resolved PER ELEMENT from
    // its nearest filled ancestor (a global querySelector would find the
    // mask def's black <g> first). Pads recolor, traces restroke, pours
    // (fill-rule evenodd) keep their color; everything restores on clear
    expect(html).toContain('netWhitened');
    expect(html).toContain("me.getAttribute('fill-rule') === 'evenodd'");
    expect(html).toContain("var hlColor = '#ffffff'");
    expect(html).toMatch(/var af = anc\.getAttribute\('fill'\)/);
    expect(html).toContain("me.setAttribute('fill', hlColor)");
    expect(html).toContain("me.setAttribute('stroke', hlColor)");
    expect(html).toContain("me.setAttribute('opacity', '1')");
    // unmatched copper dims to the floor — never below authored visibility
    // (0.06 blacked the pour out on the dark theme; the floor dims TO 0.35
    // but leaves sub-floor authored opacities like a 0.18 pour untouched) —
    // and the composite views dim per element — never a group containing the
    // match (group opacity would composite over the forced opacity 1 and
    // FADE the clicked net)
    expect(html).toContain('function netDimOpacity(el)');
    expect(html).toContain('Math.min(isFinite(o) ? o : 1, 0.35)');
    expect(html).toContain('netDimOpacity(hits[i])');
    expect(html).toContain('var dimBelow = function (el)');
    expect(html).toContain("el.getAttribute(attr) === value) return");
    // restore path: original fill/stroke remembered, opacity removed
    expect(html).toContain("item.el.removeAttribute('opacity')");
  });

  it('ships a schematic view with the ngspice operating-point hover', () => {
    const tiny =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="board"><path data-net="net2" stroke="#101010" d="M0 0h4v4h0z"/></g></svg>';
    const withSch = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: tiny,
      schematicSvg: tiny,
      netOp: {
        solved: true,
        nets: { net2: 3.3 },
        devices: { R1: { current: 0.0012, power: 0.004 } },
        branches: { net2: [{ ref: 'R1', pin: '1', i: -0.0012 }] },
      },
    });
    expect(withSch).toContain('<option value="schematic">ngspice view</option>');
    expect(withSch).toContain('id="view-schematic"');
    expect(withSch).toContain('id="net-op"');
    expect(withSch).toContain('"net2":3.3');
    // the hover appends the net voltage (engineering notation) and device
    // readout; island keys are normalized lowercase because ngspice
    // lowercases names while the gerber attributes keep schematic case
    expect(withSch).toContain("netOp.nets[net.toLowerCase()]");
    expect(withSch).toContain("fmtEng(vnet) + 'V'");
    expect(withSch).toContain("netOp.devices[pr.toLowerCase()]");
    expect(withSch).toContain("fmtEng(d.current) + 'A ' + fmtEng(d.power) + 'W'");
    // trace heat map: continuous interpolation over the solved voltage range
    // (gray for nets outside the solve, legend bar mirroring the ramp) —
    // and the SAME anchors as the power ramp, purple on top for both
    expect(withSch).toContain(
      "var VOLT_STOPS = ['#000000', '#2060ff', '#00b400', '#ffdd00', '#ff8c00', '#ff0000', '#a020f0']",
    );
    expect(withSch).toContain('#sch-copper [data-net]');
    expect(withSch).toContain('voltColor(v)');
    expect(withSch).toContain("voltRange = [Math.min.apply(null, vals), Math.max.apply(null, vals)]");
    expect(withSch).toContain("'#9aa0a6' : voltColor(v)");
    expect(withSch).toContain('id="volt-legend-box"');
    expect(withSch).toContain('linear-gradient(to right, ');
    // component power heat map: purple tops the ramp (the single hottest
    // part), overlays ride above the glyph layer without intercepting the
    // pointer, and its legend mirrors the same interpolation
    expect(withSch).toContain(
      "var POWER_STOPS = ['#000000', '#2060ff', '#00b400', '#ffdd00', '#ff8c00', '#ff0000', '#a020f0']",
    );
    expect(withSch).toContain('#sch-board > #sch-components');
    expect(withSch).toContain("setAttribute('id', 'sch-power-overlay')");
    expect(withSch).toContain("setAttribute('pointer-events', 'none')");
    expect(withSch).toContain('powerColor(dev.power)');
    expect(withSch).toContain('id="power-legend-box"');
    expect(withSch).toContain('Component power');
    // the overlay hugs the component body (largest filled shape — not the
    // group bbox, which would span THT lead wires), circles staying circles
    expect(withSch).toContain("tagName.toLowerCase() === 'clippath'");
    expect(withSch).toContain('bodyOverlayShape(');
    expect(withSch).toContain("body.tagName.toLowerCase() === 'circle'");
    // hovering a component body reads the device's own operating point
    expect(withSch).toContain('netOp.devices[ref.toLowerCase()]');
    expect(withSch).toContain("fmtEng(dev.current) + 'A'");
    // current-flow particles: conventional-current direction from per-pad
    // injections, log-scaled speed/size, pausable via a toggle
    expect(withSch).toContain('"branches"');
    expect(withSch).toContain('flowNetData');
    expect(withSch).toContain("setAttribute('id', 'sch-flow')");
    expect(withSch).toContain('requestAnimationFrame(flowFrame)');
    // particles only show in the ngspice view — not over the thermal board
    expect(withSch).toContain("flowLayer.style.display = viewMode === 'schematic'");
    // open wires only — the GND pour outline is one giant closed contour
    expect(withSch).toContain("indexOf('Z') !== -1");
    expect(withSch).toContain('flowParticles.length < 400');
    // per-branch flow on the route graph: wires are resistors (R = Rs·L/w)
    // and a node-voltage solve shares parallel paths by conductance —
    // zero-current wires get no particles
    expect(withSch).toContain('DT_RS * e4.len');
    expect(withSch).toContain('e5.cur = (Vv[e5.a.idx] - Vv[e5.b.idx]) * edgeG[ei5]');
    expect(withSch).toContain('if (!ed.cur) continue;');
    expect(withSch).toContain('(Math.log(mag2) - Math.log(lo))');
    expect(withSch).toContain('id="flow-toggle"');
    expect(withSch).toContain('animate current flow');
    // speed slider: a rate multiplier over the log-scaled base speeds, 0 parks
    expect(withSch).toContain('id="flow-speed"');
    expect(withSch).toContain('p.speed * flowRate * dt');
    expect(withSch).toContain("flowSpeedVal.textContent = flowRate.toFixed(1) + 'x'");
    // flow settings persist in the per-board localStorage store
    expect(withSch).toContain('state.__flowRate = flowRate');
    expect(withSch).toContain('state.__flowOn = flowToggle ? flowToggle.checked : true');
    expect(withSch).toContain('saved.__flowRate');
    // copper ΔT view: inverted IPC-2221 on per-wire solved currents, a 2D
    // sheet solve over the pour fill polygon, graphite board + incandescent
    // ramp, ambient/allowed/margin controls
    expect(withSch).toContain('<option value="thermal">Copper ΔT</option>');
    expect(withSch).toContain('dtFromI(Math.abs(cur), w');
    // stackup-aware: internal (buried) layers use the IPC internal constant
    // (k=0.024) instead of the external-layer one (k=0.048)
    expect(withSch).toContain('inner ? 0.024 : 0.048');
    expect(withSch).toContain("el.hasAttribute('data-inner')");
    expect(withSch).toContain('isPointInFill(new DOMPoint(px, py))');
    expect(withSch).toContain('el.__edgeCur');
    expect(withSch).toContain('id="dt-legend-box"');
    expect(withSch).toContain('color by margin');
    // a thermally quiet board (every rise in millidegrees) must not paint its
    // relatively-hottest trace full-scale white: the auto ramp is floored (the
    // margin path stays user-specified), and the hover rise prints in
    // engineering notation so a millidegree hotspot reads "+3.71m°C", never
    // "+0.0°C" while its color says ramp max
    expect(withSch).toContain('var DT_AUTO_FLOOR = 1;');
    expect(withSch).toContain('Math.max(dtItems.maxDT, DT_AUTO_FLOOR)');
    expect(withSch).toContain("fmtEng(dtHover.v) + '\\u00B0C'");
    // board (FR4) temperature: stacked steady-state solve; the image paints
    // the ENTIRE board (no trace gap) on a 3x-fine grid with bilinear
    // sampling of the solved field — only the outline and the near-zero
    // threshold hold paint back
    expect(withSch).toContain('sch-board-temp');
    expect(withSch).toContain('buildBoardTemp');
    expect(withSch).toContain('var FX = 3;');
    expect(withSch).toContain('if (!fIn[fc2]) continue');
    expect(withSch).toContain('T[0][cA] * wA + T[0][cB] * wB + T[0][cC] * wC + T[0][cD] * wD');
    // component self-heating: each device's solved watts injected at its
    // pads (deduped per pin), and via barrels conduct between the layers
    expect(withSch).toContain('if (Pd && Pd > 1e-6) devP[dk2] = Pd;');
    expect(withSch).toContain("pr.toLowerCase() + '|' + (pel.getAttribute('data-pin') || '')");
    expect(withSch).toContain('parts.push({ c: hc2 - 1, f: 0.125 })');
    expect(withSch).toContain('gz[vc2] += (viaG * drill) / 0.153;');
    expect(withSch).toContain('var gzT = gZ + gz[c3]; // FR4 core + via barrels');
    // thermal hover: the status bar reports the temperature under the cursor
    // — the trace/via's own rise over copper, the bilinear FR4 field elsewhere
    expect(withSch).toContain('el.__wireDT = wdt;');
    expect(withSch).toContain('vel.__viaDT = vdt;');
    expect(withSch).toContain("if (el.__wireDT !== undefined) dtHover = { v: el.__wireDT, what: 'trace' };");
    expect(withSch).toContain('boardTemp.inB[cAH] || boardTemp.inB[cBH] ||');
    expect(withSch).toContain("dtHover = { v: Math.max(tv0, tv1), what: 'board' };");
    // via thermal model: barrels are resistive edges in the network — the
    // SOLVED current drives each via's ΔT (equal-split only as fallback)
    expect(withSch).toContain('dtViaFromI(iVia, drill)');
    expect(withSch).toContain('e5.viaEl.__viaCur = e5.cur');
    expect(withSch).toContain('(Math.PI * e4.drill * 3.5e-8) / 2.7584e-11');
    expect(withSch).toContain('carry solved currents');
    expect(withSch).toContain('Math.PI * (dMil + tkMil) * tkMil');
    // no island content when no simulation ran
    const plain = buildViewerHtml(svg, [info], { title: 'demo board' });
    expect(plain).not.toContain('id="view-schematic"');
    // and no heat-map legends without operating-point data
    expect(plain).not.toContain('id="volt-legend-box"');
    expect(plain).not.toContain('id="power-legend-box"');
    expect(plain).not.toContain('id="flow-box"');
    expect(plain).not.toContain('id="dt-legend-box"');
  });

  it('ships a pcba theme picker: combo, color table, client-side remap', () => {
    const tinyPcba =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><mask id="pcba-open"><g fill="#000000"><path d="M0 0h1v1z"/></g></mask></defs><g id="board"><g fill="#1a7a44"><use data-ref="R1" href="#x"/></g></g></svg>';
    const withThemes = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: tinyPcba,
      pcbaThemes: [
        { id: 'green-enig', label: 'Green ENIG', colors: { clad: '#1a7a44', pads: '#cf8a4d' } },
        { id: 'oshpark-after-dark', label: 'OSH Park After Dark', colors: { clad: '#0b0b0e', pads: '#d4af5a' } },
      ],
    });
    // the combo lives in the toolbar — one theme control for every view
    expect(withThemes).toContain('<select id="pcba-theme" title="pcba theme">');
    expect(withThemes).toContain('<option value="oshpark-after-dark">OSH Park After Dark</option>');
    // the color table rides as a JSON island (default = first theme)
    expect(withThemes).toContain('id="pcba-themes"');
    // the remap covers the assembly view's bare board too
    expect(withThemes).toContain('viewGroups.pcba, viewGroups.assembly');
    // the retired chrome is really gone: the KiCad layer-theme select, its
    // island, and the measure/DRC toolbar buttons
    expect(withThemes).not.toContain('id="layer-theme"');
    expect(withThemes).not.toContain('id="layer-themes"');
    expect(withThemes).not.toContain('id="btn-measure"');
    expect(withThemes).not.toContain('id="btn-drc"');
    // the remap skips mask-luminance ink and persists the pick
    expect(withThemes).toContain('function applyPcbaTheme(id)');
    expect(withThemes).toContain("els[i].closest('mask')) continue");
    expect(withThemes).toContain('state.__pcbaTheme = id');
    expect(withThemes).toContain("saved.__pcbaTheme && saved.__pcbaTheme !== 'green-enig'");
    // no picker without themes
    const plain = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: tinyPcba });
    expect(plain).not.toContain('id="pcba-theme"');
  });

  it('gates its own status readouts behind a host-notice lock', () => {
    // a render notice ("generating new render…") sets data-locked on #status
    // and owns the line; every viewer-internal write stands down until the
    // lock clears (or the page reloads) so a moved mouse cannot overwrite it
    expect(html).toContain('function statusLocked()');
    expect(html).toMatch(/statusEl\.hasAttribute\('data-locked'\)/);
    // mouse-move coordinate readout
    expect(html).toMatch(/if \(!statusLocked\(\)\) \{\s*statusEl\.textContent =/);
    // click-probe hint, search miss, search hit count
    expect(html).toMatch(/if \(!statusLocked\(\)\) statusEl\.textContent = 'net ' \+ net/);
    expect(html).toMatch(/if \(!statusLocked\(\)\) statusEl\.textContent = '"'\s*\+ q \+ '" not found'/);
    expect(html).toMatch(/if \(!statusLocked\(\)\) statusEl\.textContent = hits\.length/);
  });
});

describe('buildViewerFromFiles', () => {
  it('assembles a viewer from a directory of mixed fab files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerview-'));
    fs.writeFileSync(path.join(dir, 'demo-F_Cu.gbr'), read('traces.gbr'));
    fs.writeFileSync(path.join(dir, 'demo-Edge_Cuts.gbr'), read('edge.gbr'));
    fs.writeFileSync(path.join(dir, 'demo.drl'), read('drill.drl'));
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'not a drill file');

    const result = buildViewerFromFiles([dir], { title: 'demo' });
    // the shared "demo-" board prefix is stripped for display, kept as fullName
    expect(result.layers.map((l) => l.name)).toEqual(['Edge_Cuts', 'F_Cu', 'Drill']);
    expect(result.layers.every((l) => l.fullName!.startsWith('demo'))).toBe(true);
    expect(result.html).toContain('3 layers');
    expect(result.html).toContain('M 0 0 L 8 0 L 8 6 L 0 6 Z');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws a helpful error when nothing parses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerview-'));
    fs.writeFileSync(path.join(dir, 'noise.gbr'), 'this is not a gerber\n');
    expect(() => buildViewerFromFiles([dir])).toThrow(/could be parsed/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('view switcher (gerber / pcba)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  // a plausible pcba render for the same layer (any inner content works)
  const pcbaSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -7 10 8"><defs><mask id="pcba-open"/></defs><g id="board"><g clip-path="url(#pcba-clip)"><rect width="8" height="6" fill="#1a7a44"/></g><g id="components"><g data-ref="U1"><rect width="2" height="2" fill="#2b2f33"/></g></g></g></svg>';
  const blueprintSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -7 10 8"><defs><pattern id="pcba-grid"/></defs><g id="board"><rect width="8" height="6" fill="#1c3a5e"/><g fill="none" stroke="#d9e7f6"><use data-ref="U1" href="#x"/></g></g><g id="labels"><text>R1</text></g></svg>';
  const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg, blueprintSvg });

  it('embeds both views in one svg with the pcba hidden', () => {
    expect((html.match(/<svg id="board"/g) ?? []).length).toBe(1); // one root
    expect(html).toContain('<g id="view-gerber"><g id="yflip"');
    expect(html).toContain('<g id="view-pcba" style="display:none">');
    expect(html).toContain('data-ref="U1"'); // pcba glyphs present
    expect(html).toContain('id="pcba-open"'); // pcba defs merged
    // overlays stay siblings of both views
    expect(html).toContain('<g id="measure"></g><g id="drc"></g><g id="typecad-probe"></g>');
  });

  it('unions the two viewBoxes so neither view clips', () => {
    // gerber viewBox bottoms out near y=-0.6; pcba fixture reaches y=-7
    const root = /<svg id="board"([^>]*)>/.exec(html)![1]!;
    const viewBox = /viewBox="([^"]+)"/.exec(root)![1]!;
    const [, y, , h] = viewBox.split(' ').map(Number);
    expect(y).toBeLessThanOrEqual(-7); // pcba top
    expect(y + h).toBeGreaterThanOrEqual(1); // gerber bottom
  });

  it('offers the combo box and view-switching machinery', () => {
    expect(html).toContain('id="view-mode"');
    expect(html).toContain('<option value="gerber">Gerber view</option>');
    expect(html).toContain('<option value="pcba">PCBA view</option>');
    expect(html).toContain('<option value="blueprint">Blueprint view</option>');
    expect(html).toContain('function setView(mode)');
    // one display-toggle loop covers every view group; the layout view
    // shares the gerber stack
    expect(html).toContain("(viewMode === 'layout' && name === 'gerber') ? '' : 'none';");
    // the layout view: overlay from gerber-derived components, rip-up on
    // move, TrackBuilder-vs-autorouter trace indication, apply via the host
    expect(html).toContain("document.getElementById('layout-comps')");
    expect(html).toContain('function buildLayoutOverlay()');
    expect(html).toContain('function commitLayoutMove(g)');
    // rip-up HIDES autorouter ink (the net goes back on the ratsnest until
    // the rebuild re-routes it); manual/mixed nets stay exactly as drawn
    expect(html).toContain("el.setAttribute('display', 'none')");
    expect(html).toContain("if (rprov === 'manual' || rprov === 'mixed') continue;");
    // autorouter tracks candy-cane: WHITE dashed overlay lightens alternate
    // bands (a same-ink overlay would be invisible over its own stroke)
    expect(html).toContain("stripe.setAttribute('class', 'route-auto-stripe')");
    expect(html).toContain("stripe.setAttribute('stroke', '#ffffff')");
    expect(html).toContain('.route-auto-stripe { opacity: 0.45; stroke-dasharray: 1.2 1.2; }');
    // the ratsnest is CONNECTIVITY-based: per-net components of pads + ink
    // (union-find) decide wires — a route broken in the middle no longer
    // counts as wired at both ends, and each M-subpath is its own conductor
    expect(html).toContain('CONNECTIVITY components per net');
    expect(html).toContain('var ufFind = function (parent, i)');
    expect(html).toContain("var wSubs = (wel.getAttribute('d') || '').split(/(?=M)/);");
    expect(html).toContain("if (net) p.setAttribute('data-net', net);");
    expect(html).toContain('window.typecadLayoutApply(moves, texts, values, labels, renames, routedTracks, routedDeletes, partDeletes, zones, outlinePayload, zoneEditsPayload, zoneDeletesPayload, images, imageEditsPayload, imageDeletesPayload, classEditsPayload, textDeletesPayload, function (err, fast)');
    expect(html).toContain('moves.push({');
    expect(html).toContain('rot: (m2.rot || 0) * 90,');
    expect(html).toContain('pads: padsByRef[mr2] || [],');
    expect(html).toContain('__viewMode'); // persisted selection
    // cross-probe dimming covers the non-gerber views
    expect(html).toContain("'#view-pcba > #pcba-board'");
    expect(html).toContain("'#view-blueprint > #bp-board'");
  });

  it('embeds the blueprint view hidden, ids de-duplicated', () => {
    expect(html).toContain('<g id="view-blueprint" style="display:none">');
    expect(html).toContain('id="bp-board"');
    expect(html).toContain('id="bp-labels"');
    // search/zoom scopes to whichever non-gerber view is active
    expect(html).toContain("viewMode !== 'gerber' && activeGroup");
  });

  it('omits the switcher when no pcba svg is given', () => {
    const plain = buildViewerHtml(svg, [info], { title: 'demo board' });
    expect(plain).not.toContain('id="view-mode"');
    expect(plain).not.toContain('id="view-pcba"');
    expect(plain).toContain('id="view-gerber"'); // gerber still wrapped
    expect(plain).toContain('data-layer-id="demo-f_cu-gbr"'); // gerber intact
  });
});

describe('viewer tooling (probing, search, report, DRC, export)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], {
    title: 'demo board',
    report: {
      units: 'mm',
      board: { width: 29.17, height: 23.17 },
      copper: [{ layer: 'F_Cu.gtl', traceLength: 4.414, minWidth: 0.5, maxWidth: 0.5, flashes: 2 }],
      drills: [{ diameter: 0.6, count: 3, plated: true }],
      holes: 3,
      slots: 1,
    },
    drcMarkers: [{ x: 10, y: 20, description: 'clearance — pad of J1' }],
  });

  it('does not render the fab report panel (removed from the sidebar)', () => {
    // The stats still flow through options.report; the sidebar panel itself
    // was removed by request — nothing of it may reach the page.
    expect(html).not.toContain('id="fab-report"');
    expect(html).not.toContain('29.17 × 23.17 mm');
  });

  
  it('embeds DRC markers as JSON and renders them client-side (the toggle button is retired)', () => {
    expect(html).toContain('id="drc-data"');
    expect(html).toContain('clearance — pad of J1');
    expect(html).not.toContain('id="btn-drc"');
    expect(html).toContain('function renderDrc');
  });

  it('has component search, net highlighting, hover probing, and exports', () => {
    expect(html).toContain('id="comp-search"');
    expect(html).toMatch(/highlightNet\('data-net', net\)/);
    expect(html).toMatch(/closest\('\[data-net\],\[data-ref\],\[data-pin\]'\)/);
    // export/zoom buttons were removed from the toolbar by request; wheel
    // zoom and keyboard +/− remain the zoom path
    expect(html).not.toContain('id="btn-svg"');
    expect(html).not.toContain('id="btn-png"');
    expect(html).not.toContain('id="btn-in"');
    expect(html).not.toContain('id="btn-out"');
  });

  it('emits data-net/ref/pin attributes on attributed geometry', () => {
    const attributed = parseGerber(
      [
        '%FSLAX36Y36*%',
        '%MOMM*%',
        '%ADD10C,1*%',
        '%TO.N,GND*%',
        'D10*',
        'X1000000Y1000000D02*',
        'X2000000Y1000000D01*',
        '%TD*%',
        '%TO.P,U1,3*%',
        'X3000000Y2000000D03*',
        'M02*',
      ].join('\n'),
    );
    const out = renderSvg([{ info: detectLayer('x-F_Cu.gtl', attributed), image: attributed }]);
    expect(out).toContain('data-net="GND"');
    expect(out).toContain('data-ref="U1"');
    expect(out).toContain('data-pin="3"');
  });

  it('reports mouse position in board coordinates (y-down), not gerber (y-up)', () => {
    // the viewBox is post-yflip, so viewBox y already equals board y —
    // negating it mirrors every readout vs a component's pcb placement
    expect(html).toContain('var by = (v.y - ty) / k;');
    expect(html).not.toContain('var by = -((v.y - ty) / k);');
  });

  it('persists the viewport across reloads, merged with layer settings', () => {
    // the dev server and the vscode panel reload on every build — the view
    // must come back where it was, under a reserved key in the same store
    expect(html).toContain('state.__view = { k: k, tx: tx, ty: ty }');
    expect(html).toContain('saved.__view');
    // a layer-settings save must not wipe the stored view
    expect(html).toMatch(/function persist\(\)[\s\S]*?JSON\.parse\(localStorage\.getItem\(storeKey/);
  });
});

/**
 * Pull a pure helper function out of the generated viewer's script block and
 * evaluate it. The thermal loss/rise kernels are self-contained (no DOM), so
 * this exercises the exact expression the browser runs — not a reimplementation.
 */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in generated viewer`);
  let depth = 0;
  let i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

describe('thermal math (evaluated from the generated viewer)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], { title: 'demo board' });
  const fn = <T extends (...args: any[]) => number>(name: string): T =>
    new Function(`return (${extractFunction(html, name)});`)() as T;

  it('computes sheet-cell copper loss in watts (the 1e6 unit fix)', () => {
    const loss = fn('sheetCellLossW');
    // 1 A/mm through a 1×1 mm cell of a 1-oz sheet (Rs = 0.493 mΩ/□) is
    // 0.493 mW — the previous code multiplied by an extra 1e-6.
    expect(loss(1, 0.000493, 1, 1)).toBeCloseTo(0.000493, 12);
    expect(loss(2, 0.000493, 1, 1)).toBeCloseTo(4 * 0.000493, 12); // I²
    expect(loss(1, 0.000493, 0.6, 0.6)).toBeCloseTo(0.000493 * 0.36, 12); // area
  });

  it('computes wire I²R loss in watts', () => {
    const loss = fn('wireLossW');
    expect(loss(1, 0.000493, 1, 1)).toBeCloseTo(0.000493, 12);
    expect(loss(1, 0.000493, 10, 1)).toBeCloseTo(0.00493, 12); // length
    expect(loss(2, 0.000493, 1, 1)).toBeCloseTo(0.001972, 12); // I²
  });

  it('computes via barrel electrical conductance near the ~600 S reference', () => {
    const cond = fn('viaBarrelCondS');
    // σ·π·d·t/L at 0.15 mm drill, 35 µm plating, 1.6 mm board ≈ 598 S
    expect(cond(0.15, 35, 1.6)).toBeGreaterThan(590);
    expect(cond(0.15, 35, 1.6)).toBeLessThan(610);
  });

  it('applies the internal-layer IPC constant (halved k → 2^(1/0.44) × rise)', () => {
    const dt = fn('dtFromI');
    const ratio = Math.pow(2, 1 / 0.44);
    expect(dt(1, 0.5, true) / dt(1, 0.5, false)).toBeCloseTo(ratio, 9);
  });

  it('inverts the library trace-width sizer (round-trip)', () => {
    const dt = fn('dtFromI');
    for (const width of [0.2, 0.5, 1.0, 2.5]) {
      const rise = dt(1, width, false);
      expect(calculateMinTraceWidth(1, 'F.Cu', rise, 35)).toBeCloseTo(width, 5);
    }
  });

  it('inverts the library via sizer (round-trip)', () => {
    const dtVia = fn('dtViaFromI');
    for (const drill of [0.3, 0.5, 1.0]) {
      const rise = dtVia(1, drill);
      expect(calculateViaCurrentCapacity(0.6, drill, 35, 1.6, rise)).toBeCloseTo(1, 4);
    }
  });

  it('scales trace rise by copper weight (2 oz reduces the rise)', () => {
    const dt = fn('dtFromI');
    // 70 µm (2 oz) has 2× the cross-section; ΔT ∝ A^(−0.725/0.44), so the
    // rise falls by 2^(0.725/0.44)
    const ratio = Math.pow(2, 0.725 / 0.44);
    expect(dt(1, 0.5, false, 35) / dt(1, 0.5, false, 70)).toBeCloseTo(ratio, 9);
  });

  it('models copper resistivity temperature coefficient', () => {
    const rho = fn('cuResistivityOhmM');
    // cuSheetResist delegates to cuResistivityOhmM — evaluate it with the
    // dependency in scope
    const rs = new Function('cuResistivityOhmM', `return (${extractFunction(html, 'cuSheetResist')});`)(
      rho,
    ) as (tMm: number, tempC: number) => number;
    expect(rho(20)).toBeCloseTo(1.724e-8, 14);
    // +0.393%/°C: a 45 °C rise is ~17.7% more resistance
    expect(rho(65) / rho(20)).toBeCloseTo(1 + 0.00393 * 45, 12);
    // sheet resistance halves when the copper thickness doubles
    expect(rs(0.035, 20) / rs(0.07, 20)).toBeCloseTo(2, 12);
  });

  it('computes physically-grounded convection and radiation coefficients', () => {
    const hConv = fn('naturalConvectionH');
    const hRad = fn('radH');
    // natural convection on a vertical plate, 50 mm, 30 °C rise → ~6-8 W/m²·K
    expect(hConv(30, 50, 'v')).toBeGreaterThan(4);
    expect(hConv(30, 50, 'v')).toBeLessThan(15);
    // heated-face-up convects better than heated-face-down
    expect(hConv(30, 50, 'hUp')).toBeGreaterThan(hConv(30, 50, 'hDn'));
    // radiation near room temp is ~5-6 W/m²·K (linearized)
    expect(hRad(50, 25, 0.9)).toBeGreaterThan(5);
    expect(hRad(50, 25, 0.9)).toBeLessThan(7);
    // no convection without a temperature excess
    expect(hConv(0, 50, 'v')).toBe(0);
  });
});

describe('stackup island', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const stackup = {
    layerCount: 4,
    copperLayers: ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'],
    boardThicknessMm: 1.6,
    copperThicknessMm: [0.035, 0.0175, 0.0175, 0.035],
    dielectrics: [
      { name: 'dielectric 1', type: 'prepreg', thicknessMm: 0.21, material: 'FR4' },
      { name: 'dielectric 2', type: 'core', thicknessMm: 1.11, material: 'FR4' },
      { name: 'dielectric 3', type: 'prepreg', thicknessMm: 0.21, material: 'FR4' },
    ],
  };

  it('embeds the stackup as a JSON island when provided', () => {
    const html = buildViewerHtml(svg, [info], { title: 'demo board', stackup });
    expect(html).toContain('id="stackup"');
    expect(html).toContain('"copperThicknessMm":[0.035,0.0175,0.0175,0.035]');
    // the thermal model reads the island and falls back without it
    expect(html).toContain("getElementById('stackup')");
    expect(html).toContain('var stackup = null;');
  });

  it('omits the island (and keeps legacy defaults) without a stackup', () => {
    const plain = buildViewerHtml(svg, [info], { title: 'demo board' });
    expect(plain).not.toContain('"copperThicknessMm"');
  });
});


describe('layout view (component overlay from the gerbers)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const layoutComponents = [
    { ref: 'R1', x: 10, y: -20, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: ['VCC', 'GND'] },
    { ref: 'U1', x: 30, y: -40, rot: 90, w: 4, h: 4, side: 'back' as const, nets: ['net5'] },
  ];

  it('offers the Layout option and embeds the overlay island when components exist', () => {
    const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
    expect(html).toContain('<option value="layout">Layout</option>');
    expect(html).toContain('id="layout-comps"');
    expect(html).toContain('"ref":"R1"');
    // the panel rides with the data — no components, no panel
    expect(html).toContain('id="layout-apply"');
  });

  it('omits the option and panel without components', () => {
    const plain = buildViewerHtml(svg, [info], { title: 'demo board' });
    expect(plain).not.toContain('<option value="layout">Layout</option>');
    expect(plain).not.toContain('id="layout-apply"');
  });

  it('candy-canes AUTOROUTER nets from the routes island; manual/mixed stay solid', () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      routes: { nets: { VCC: { provenance: 'manual' }, GND: { provenance: 'mixed' }, net5: { provenance: 'auto' } } },
    });
    expect(html).toContain('id="routes"');
    expect(html).toContain("routesProv[rpk.toLowerCase()] = rawRt.nets[rpk];");
    // the stripe is the ONLY provenance indication, and it marks auto alone;
    // the old layout-phase styling dashed manual traces — the exact
    // opposite — and must stay gone
    expect(html).toContain("if (tnet && routeProvenance[tnet] === 'auto')");
    expect(html).not.toContain("'4 2.2'");
  });

  it('draws the drag handle as the exact footprint outline when one is carried', () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents: [
        {
          ...layoutComponents[0]!,
          outline: [
            { x: -1.3, y: -0.55 },
            { x: 1.3, y: -0.55 },
            { x: 1.3, y: 0.55 },
            { x: -1.3, y: 0.55 },
          ],
        },
      ],
    });
    expect(html).toContain("createElementNS(SVGNSL, 'polygon')");
    expect(html).toContain("poly.setAttribute('points', pts.join(' '))");
    expect(html).toContain('"outline":[{"x":-1.3,"y":-0.55}');
    // the generic rounded box stays as the fallback for outline-less data
    expect(html).toContain("createElementNS(SVGNSL, 'rect')");
    expect(html).toContain('#layout-overlay .layout-comp polygon');
  });

  it('moves the whole footprint with the handle (ghost) and never greys pads', () => {
    const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
    expect(html).toContain('function applyCompGhost(g)');
    expect(html).toContain('function compEls(ref)');
    // drills carry no X2 attributes — they are claimed by matching pad centers
    expect(html).toContain('g[data-kind="drill"] circle');
    // footprints travel bright; only un-attributed routing greys out
    expect(html).toContain("if (netEls[re].getAttribute('data-ref')) continue;");
  });

  it('keep-upright flips labels only when presses cross the boundary — a plain move never flips', () => {
    const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
    // the plotter's boundary, evaluated from the page: (90, 270] flips
    const kup = new Function(`return (${extractFunction(html, 'kupFlipDeg')});`)() as (d: number) => number;
    expect(kup(0)).toBe(0);
    expect(kup(90)).toBe(0);
    expect(kup(180)).toBe(180);
    expect(kup(270)).toBe(180);
    expect(kup(360)).toBe(0);
    expect(kup(-90)).toBe(180); // -90 ≡ 270
    // the ghost compares the pending total against the AUTHORED baseline —
    // rot-180 labels (C6/C3/D1-class passives) plot pre-flipped/upright and
    // must not flip again just because their part moved (seen live as a
    // glyph-identical-to-mirror "6C")
    expect(html).toContain('if (kupFlipDeg(total) !== kupFlipDeg(t.rot || 0))');
    expect(html).not.toContain('var tn = ((total % 360) + 360) % 360;');
    // the edited-value preview rotates to the plot direction (keep-upright
    // folded in, part presses included) instead of flipping authored-upright
    // glyphs; board-level texts keep their own-presses rotation
    expect(html).toContain('if (tt > 90 && tt <= 270) tt -= 180;');
    expect(html).toContain("tr += ' rotate(' + tt * flip + ')';");
    expect(html).toContain("tr += ' rotate(' + m.rot * 90 * flip + ')';");
  });

  it('keeps an open E properties panel following the clicked element', () => {
    const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
    // an open panel refreshes on every selection change: the three selection
    // syncs (part/trace/via gestures) and the move-commit funnel all feed it
    expect(html).toContain('function propsSync(kind)');
    expect(html).toContain("propsSync('part');");
    expect(html).toContain("propsSync('trace');");
    expect(html).toContain("propsSync('via');");
    expect(html).toContain('propsSync();');
    // the refresh rebuilds through propsBuild, gated by a signature so a
    // no-op sync never clobbers fields mid-edit
    expect(html).toContain('function propsSig()');
    expect(html).toContain('if (sig === propsSigLast) return;');
    // the most recent gesture owns the panel — a trace click switches an
    // open part panel to the trace editor and back
    expect(html).toContain("if (propsKind === 'via' && viaSel.size)");
    expect(html).toContain("if (propsKind === 'trace' && segSel.size)");
    // auto-refresh must not steal focus from the canvas keys
    expect(html).toContain('deliberately no focus');
    // the ? help dialog: one row per binding — bold key column, dash,
    // explanation — generated from the HELP_ROWS table
    expect(html).toContain('HELP_ROWS');
    expect(html).toContain('#keys-help .hrow');
    expect(html).toContain('grid-template-columns: 136px 1fr');
    // Esc closes it before anything else claims the key
    expect(html).toContain("ev.key === 'Escape' && helpEl.style.display !== 'none'");
    // full property coverage: text/label editing rides the same panel, and
    // net classes + impedance read-outs come from the rules/stackup islands
    expect(html).toContain('function propsTextBuild');
    expect(html).toContain('function netClassLine');
    expect(html).toContain('annular ring');
    // a claimed text glyph owns its press — the trace fallthrough must not
    // eat it (capture-phase stopPropagation would kill the text handler)
    expect(html).toContain("t.closest('[data-text]')");
  });

  it('offers silk/fab text dragging and in-place editing when texts ride along', () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      layoutTexts: [{ text: 'hello', x: 10, y: -20, rot: 0, side: 'front', h: 1.5 }],
    });
    expect(html).toContain('id="layout-texts"');
    expect(html).toContain('"text":"hello"');
    expect(html).toContain('function buildTextOverlay()');
    expect(html).toContain('function beginTextEdit(i)');
    expect(html).toContain("addEventListener('dblclick'");
    expect(html).toContain('layout-text-edit');
    // apply carries text edits alongside component moves
    expect(html).toContain('window.typecadLayoutApply(moves, texts, values, labels, renames, routedTracks, routedDeletes, partDeletes, zones, outlinePayload, zoneEditsPayload, zoneDeletesPayload, images, imageEditsPayload, imageDeletesPayload, classEditsPayload, textDeletesPayload, function (err, fast)');
  });

  it('derives handles from the fab contour (chamfers kept) and the pad-land hull', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gelayout-'));
    // R1: two 1.2x0.8 pads at (3,3)/(5.2,3); U2: same, far right; U3: same
    // pads stacked vertically -> PCA angle 90 (frame-rotation coverage)
    const copper = `%FSLAX36Y36*%
%MOMM*%
%ADD10R,1.2X0.8*%
%ADD12R,0.6X1.4*%
D10*
%TO.P,R1,1*%
X3000000Y3000000D03*
%TD*%
%TO.P,R1,2*%
X5200000Y3000000D03*
%TD*%
%TO.P,U2,1*%
X10000000Y3000000D03*
%TD*%
%TO.P,U2,2*%
X12200000Y3000000D03*
%TD*%
D12*
%TO.P,U3,1*%
X20000000Y3000000D03*
%TD*%
%TO.P,U3,2*%
X20000000Y5200000D03*
%TD*%
M02*
`;
    // R1's body outline on Fab: 2.6 x 1.1 with a chamfer at the pin-1 corner
    // (the exact-quirk case the rounded box could never show) — %TO.C makes
    // every outline stroke addressable as R1's own ink
    const fab = `%FSLAX36Y36*%
%MOMM*%
%ADD10C,0.12*%
D10*
%TO.C,R1*%
X5400000Y3550000D02*
X3300000Y3550000D01*
X2800000Y3050000D01*
X2800000Y2450000D01*
X5400000Y2450000D01*
X5400000Y3550000D01*
%TD*%
M02*
`;
    const netlist = `(export (version "E")
  (components
    (comp (ref "R1") (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "U2") (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "U3") (footprint "Resistor_SMD:R_0603_1608Metric"))
  )
  (nets
    (net (code "1") (name "VCC") (node (ref "R1") (pin "1")) (node (ref "U2") (pin "1")) (node (ref "U3") (pin "1")))
    (net (code "2") (name "GND") (node (ref "R1") (pin "2")) (node (ref "U2") (pin "2")) (node (ref "U3") (pin "2")))
  )
)
`;
    fs.writeFileSync(path.join(dir, 'demo-F_Cu.gbr'), copper);
    fs.writeFileSync(path.join(dir, 'demo-F_Fab.gbr'), fab);
    fs.writeFileSync(path.join(dir, 'demo-Edge_Cuts.gbr'), read('edge.gbr'));
    fs.writeFileSync(path.join(dir, 'demo.net'), netlist);
    fs.writeFileSync(
      path.join(dir, 'demo.kicad_pcb'),
      `(kicad_pcb (version 20221018)
  (gr_text "hello silk" (at 6.5 7.5 0) (layer "F.SilkS") (uuid "x1") (effects (font "DejaVu Sans" (size 1.8 1.5) (thickness 0.22) italic) (justify left mirror)))
  (gr_text "hidden" (at 9 9) (layer "B.Fab") (uuid "x2") (effects (font (size 1 1)) (hide)))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 4.1 3 0)
    (property "Reference" "R1" (at 0 -1.6 0) (layer "F.SilkS") (uuid "p1") (effects (font (size 1.1 1) (thickness 0.16) italic) (justify left)))
    (property "Value" "1k" (at 0 1.6 0) (layer "F.Fab") (uuid "p2") (effects (font (size 1 1))))
  )
)
`,
    );

    const result = buildViewerFromFiles([dir], { title: 'demo', netlistPath: path.join(dir, 'demo.net') });
    fs.rmSync(dir, { recursive: true, force: true });
    const json = /<script id="layout-comps" type="application\/json">([\s\S]*?)<\/script>/.exec(result.html)![1]!;
    const comps = JSON.parse(json) as Array<{
      ref: string;
      x: number;
      y: number;
      rot: number;
      w: number;
      h: number;
      outline?: Array<{ x: number; y: number }>;
    }>;
    const r1 = comps.find((c) => c.ref === 'R1')!;
    const u2 = comps.find((c) => c.ref === 'U2')!;
    const u3 = comps.find((c) => c.ref === 'U3')!;
    expect(r1).toBeDefined();
    expect(u2).toBeDefined();
    expect(u3).toBeDefined();

    // R1 rides the fab contour: 5 corners (the chamfer survives), sized to
    // the body, centered on the pads-bbox center (4.1, 3) in its local frame
    expect(r1.outline).toBeDefined();
    expect(r1.outline!.length).toBeGreaterThanOrEqual(5);
    expect(r1.w).toBeCloseTo(2.6, 1);
    expect(r1.h).toBeCloseTo(1.1, 1);
    for (const p of r1.outline!) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.35);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.6);
    }

    // U2 (no fab content assigned) falls back to the land-pattern hull:
    // exactly 4 corners spanning pads + pad sizes (2.2 pitch + 1.2 x 0.8)
    expect(u2.outline).toHaveLength(4);
    expect(u2.w).toBeCloseTo(3.4, 2);
    expect(u2.h).toBeCloseTo(0.8, 2);

    // U3 sits at PCA angle 90: the hull must be long along the group's LOCAL
    // x (the gerber y-span rotates into it) — pad extents transpose too
    expect(u3.rot).toBeCloseTo(90, 0);
    expect(u3.outline).toHaveLength(4);
    expect(u3.w).toBeCloseTo(3.6, 2); // 2.2 pitch + 1.4 pad long side
    expect(u3.h).toBeCloseTo(0.6, 2);

    // %TO.C rides the Fab outline strokes too — the whole footprint (not
    // just pad flashes) is addressable, so a move can carry every layer
    expect(result.html).toMatch(/<path[^>]*data-ref="R1"[^>]*fill="none"/);

    // board texts: gr_texts from the .kicad_pcb ride as the layout-texts
    // island (gerber y-up frame), hidden ones excluded — the full style
    // block (face, size, thickness, italic, justification) travels too, it
    // is what the properties panel edits
    const ltMatch = /<script id="layout-texts" type="application\/json">([\s\S]*?)<\/script>/.exec(result.html)![1]!;
    const layoutTexts = JSON.parse(ltMatch) as Array<{
      text: string;
      x: number;
      y: number;
      h: number;
      w?: number;
      thickness?: number;
      italic?: boolean;
      font?: string;
      justify?: { horizontal?: string; mirror?: boolean };
    }>;
    expect(layoutTexts).toHaveLength(1);
    expect(layoutTexts[0]).toMatchObject({ text: 'hello silk', x: 6.5, y: -7.5 });
    expect(layoutTexts[0]!.h).toBeCloseTo(1.5, 5);
    expect(layoutTexts[0]!.w).toBeCloseTo(1.8, 5);
    expect(layoutTexts[0]!.thickness).toBeCloseTo(0.22, 5);
    expect(layoutTexts[0]!.italic).toBe(true);
    expect(layoutTexts[0]!.font).toBe('DejaVu Sans');
    expect(layoutTexts[0]!.justify).toEqual({ horizontal: 'left', mirror: true });

    // part labels carry their style block too — the properties panel edits
    // it through the Component's referenceLayout/valueLayout options
    const r1Labels = (comps.find((c) => c.ref === 'R1') as { labels?: Array<Record<string, unknown>> }).labels ?? [];
    const refLabel = r1Labels.find((l) => l.kind === 'reference');
    expect(refLabel).toBeDefined();
    expect(refLabel!.w).toBeCloseTo(1.1, 5);
    expect(refLabel!.thickness).toBeCloseTo(0.16, 5);
    expect(refLabel!.italic).toBe(true);
    expect(refLabel!.justify).toEqual({ horizontal: 'left' });
  });

  it('derives the layout overlay without nets — a fresh board still gets the layout view', () => {
    // the scaffolded first board: one resistor, nothing connected — no
    // netlist file at all, or one whose (nets) section is empty. The overlay
    // comes from the gerbers' X2 pad attributes alone; nets are enrichment
    const copper = `%FSLAX36Y36*%
%MOMM*%
%ADD10R,1.2X0.8*%
D10*
%TO.P,R1,1*%
X3000000Y3000000D03*
%TD*%
%TO.P,R1,2*%
X5200000Y3000000D03*
%TD*%
M02*
`;
    const emptyNets = `(export (version "E")
  (components
    (comp (ref "R1") (footprint "Resistor_SMD:R_0603_1608Metric"))
  )
  (nets

))
`;
    const cases: Array<{ label: string; netlistPath?: string }> = [
      { label: 'no netlist' },
      { label: 'empty-nets netlist' },
    ];
    for (const first of cases) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genonets-'));
      fs.writeFileSync(path.join(dir, 'demo-F_Cu.gbr'), copper);
      fs.writeFileSync(path.join(dir, 'demo-Edge_Cuts.gbr'), read('edge.gbr'));
      if (first.label === 'empty-nets netlist') {
        fs.writeFileSync(path.join(dir, 'demo.net'), emptyNets);
        first.netlistPath = path.join(dir, 'demo.net');
      }
      const result = buildViewerFromFiles([dir], {
        title: 'demo',
        netlistPath: first.netlistPath,
        pcbaSvg: '<svg/>', // the view dropdown needs a second render
      });
      fs.rmSync(dir, { recursive: true, force: true });
      const json = /<script id="layout-comps" type="application\/json">([\s\S]*?)<\/script>/.exec(result.html)![1]!;
      const comps = JSON.parse(json) as Array<{ ref: string; nets: string[] }>;
      expect(comps, first.label).toHaveLength(1);
      expect(comps[0]!.ref, first.label).toBe('R1');
      expect(comps[0]!.nets, first.label).toEqual([]);
      // the dropdown carries the layout entry — no nets required anymore
      expect(result.html, first.label).toContain('<option value="layout">Layout</option>');
      // and the ratsnest wires are the layout view's alone: every other
      // view renders the fabricated board without them
      expect(result.html, first.label).toContain("rats.style.display = viewMode === 'layout' ? '' : 'none';");
    }
  });
});

describe('removeViasAt mask openings', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], { title: 'demo board' });

  it('deleting a via takes its solder-mask openings too', () => {
    // a rebuilt via renders one mask opening per mask layer beside its
    // copper flashes; removeViasAt cleared the flashes and the drill hole
    // but left the openings — a white ring where the via was until the
    // next rebuild regenerated the page (seen live)
    expect(html).toContain('g[data-kind=\"mask\"] circle, g[data-kind=\"mask\"] use');
    expect(html).toContain('the solder-mask OPENINGS outlive the barrel');
  });

  it('deleting a via recomputes the pour live — whole zone, real clearances', () => {
    // the old patch painted a measured disc over the barrel's hole
    // (ray-marched radius, masked rim, fragment clones — three rounds of
    // "the circle is still visible"). The recompute replaces the zone's
    // SERVER fragments wholesale: the zone polygon from the zones island,
    // masked by the fill engine's own discipline rebuilt from live ink.
    // The zone's clearance and thermal numbers ride the island too.
    expect(html).toContain('function recomputeZoneFill(lg, zone)');
    expect(html).toContain('path[data-live-fill], path[fill-rule]');
    expect(html).toContain("live.setAttribute('data-live-fill', '1')");
    // the mask discipline: foreign traces as fat strokes, foreign barrels
    // as grown rects, same-net pads as thermal reliefs with white spokes
    expect(html).toContain("bl.setAttribute('stroke-width', (tw + 2 * clr).toFixed(3));");
    expect(html).toContain('// spokes paint LAST: over the black relief rings');
    // the delete path fires the recompute instead of painting
    expect(html).toContain('recomputeZonesAt(bx, -by, flashGroups)');
    expect(html).toContain('recomputeZonesOnLayers(zoneGroups)');
    // the old machinery is gone — no ray-march, no measured disc, no
    // fragment clones
    expect(html).not.toContain('pour-patch-');
    expect(html).not.toContain('var discR =');
    expect(html).not.toContain('fcEl.setAttribute');
    expect(html).not.toContain('pourCovers');
  });

  it("zone outlines carry the fill engine's clearance and thermal numbers", () => {
    // parseBoardZones captures (clearance …) and the (fill (thermalGap …)
    // thermalBridgeWidth …)) sub-list — what the live recompute builds its
    // holes and reliefs from
    const board = `(kicad_pcb (version 20260206)
      (footprint "Resistor:R" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net "GND")))
      (zone
        (net "GND")
        (layer "F.Cu")
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10)))
        (clearance 0.35)
        (fill (thermalGap 0.3) (thermalBridgeWidth 0.5)))
    )`;
    const zones = parseBoardZones(board);
    expect(zones).toHaveLength(1);
    expect(zones[0]!.clearance).toBeCloseTo(0.35, 5);
    expect(zones[0]!.thermalGap).toBeCloseTo(0.3, 5);
    expect(zones[0]!.thermalBridgeWidth).toBeCloseTo(0.5, 5);
    expect(zones[0]!.pts.map((q) => q.y)).toEqual([-0, -0, -10, -10].map(Number)); // gerber y-up
  });

  it('deleting a via never leaves its selection mirror ring behind', () => {
    // a selected via's ring is MIRRORED into an on-top group (above part
    // graphics); the mirrors are plain circles that die only at the next
    // viaHiSync. Deleting a segment whose endpoint carried the ONLY
    // selected via emptied viaSel inside removeViasAt, so the Delete
    // handler's conditional sync never ran and the white ring stayed
    // painted where the barrel was (seen live, intermittently — it took
    // a segment delete with an endpoint via selected to trigger)
    expect(html).toContain('selection mirrors outlive their barrel');
    expect(html).toContain("var topRings = viaSelTopGroup().querySelectorAll('circle');");
    expect(html).toContain('tc.remove();');
    // and the segment delete itself refreshes the mirrors: its endpoint
    // sweep is the one path that empties the selection set without its
    // own sync
    expect(html).toContain('left a white selection ring where the barrel was');
  });
});

describe('assembly view (the BOM checklist)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const asmSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -7 10 8"><defs><mask id="pcba-open"/></defs><g id="board"><g id="components"><g data-ref="R1" class="asm-part" style="display:none" transform="translate(3 3)"><rect width="1" height="1" fill="#2b2f33"/></g></g></g></svg>';
  const asmBack =
    '<g id="asm-back" style="display:none"><g id="asm-board-b" transform="scale(-1,-1)"><g id="components"><g data-ref="D1" class="asm-part" style="display:none" transform="translate(2 2)"><rect width="1" height="1" fill="#2b2f33"/></g></g></g></g>';
  const comps = [
    { ref: 'R1', x: 3, y: -3, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: [], value: '10k', footprint: 'R0603', glyph: 1 },
    { ref: 'C1', x: 5, y: -4, rot: 0, w: 1.2, h: 0.7, side: 'front' as const, nets: [], value: '100nF', footprint: 'C0402', glyph: 1 },
    { ref: 'C2', x: 6, y: -4, rot: 0, w: 1.2, h: 0.7, side: 'front' as const, nets: [], value: '100nF', footprint: 'C0402', glyph: 1 },
    // a mounting hole draws no glyph — it never joins the checklist
    { ref: 'H1', x: 1, y: -1, rot: 0, w: 2, h: 2, side: 'front' as const, nets: [] },
  ];

  it('eager: option, panel, halo overlay, both flip pairs, twin embedded', () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      assemblySvg: asmSvg,
      assemblyBackSvg: asmBack,
      layoutComponents: comps,
    });
    expect(html).toContain('<option value="assembly">Assembly view</option>');
    expect(html).toContain('id="asm-box"');
    expect(html).toContain('id="asm-list"');
    expect(html).toContain('id="asm-reset"');
    // the eager view group carries the front board and the twin
    expect(html).toContain('<g id="asm-board"');
    expect(html).toContain('id="asm-back"');
    // both two-sided views join the flip swap
    expect(html).toContain("['pcba-board', 'pcba-back', 'pcba-labels']");
    expect(html).toContain("['asm-board', 'asm-back', 'asm-labels']");
    // the hover-outline overlay group ships in every page
    expect(html).toContain('<g id="asm-halo"');
  });

  it('deferred: placeholder + option, and the checklist gates on glyph parts', () => {
    const lazy = buildViewerHtml(svg, [info], {
      title: 'demo board',
      deferredViews: ['pcba', 'blueprint', 'schematic', 'assembly'],
      layoutComponents: comps,
    });
    expect(lazy).toContain('<g id="view-assembly" class="view-deferred" style="display:none"></g>');
    expect(lazy).toContain('<option value="assembly">Assembly view</option>');
    expect(lazy).toContain("assembly: 'rendering the assembly view'");
    // the page builds the checklist only from glyph-bearing comps
    expect(lazy).toContain('if (!c.glyph) continue;');
  });
});

describe('deferred views (lazy renders)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);

  it('deferViews ships empty placeholders, the switcher, and the spinner bootstrap', () => {
    const result = buildViewerFromFiles([fixtures], { deferViews: ['pcba', 'blueprint', 'schematic'] });
    // the default (gerber/layout) render is still fully there
    expect(result.html).toContain('<g id="view-gerber"><g id="yflip"');
    // the three deferred views are EMPTY placeholder groups, not renders
    expect(result.html).toContain('<g id="view-pcba" class="view-deferred" style="display:none"></g>');
    expect(result.html).toContain('<g id="view-blueprint" class="view-deferred" style="display:none"></g>');
    expect(result.html).toContain('<g id="view-schematic" class="view-deferred" style="display:none"></g>');
    expect(result.html).not.toContain('id="pcba-board"');
    expect(result.html).not.toContain('id="bp-board"');
    expect(result.html).not.toContain('id="sch-board"');
    // the switcher still offers every view (the ngspice/thermal pair rides
    // the schematic part) and the boot island names what is deferred
    expect(result.html).toContain('<option value="pcba">PCBA view</option>');
    expect(result.html).toContain('<option value="blueprint">Blueprint view</option>');
    expect(result.html).toContain('<option value="schematic">ngspice view</option>');
    expect(result.html).toContain('<option value="thermal">Copper ΔT</option>');
    expect(result.html).toContain('<script id="deferred-views" type="application/json">["pcba","blueprint","schematic"]</script>');
    // the spinner overlay and its CSS ship with the page
    expect(result.html).toContain('id="view-busy"');
    expect(result.html).toContain('.busy-ring');
    expect(result.html).toContain("@keyframes busy-spin");
  });

  it('renderViewPart produces the mountable fragment with renamed ids', () => {
    const { fragment, viewBox } = renderViewPart([fixtures], 'pcba', {});
    expect(fragment.startsWith('<g id="view-pcba" data-viewbox="')).toBe(true);
    expect(fragment).toContain('style="display:none"');
    // the inner board/labels groups carry the renamed ids the eager
    // injection uses — the root svg stays the only #board
    expect(fragment).toContain('<g id="pcba-board"');
    expect(fragment).not.toContain('<g id="board"');
    expect(viewBox).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    const bp = renderViewPart([fixtures], 'blueprint', {});
    expect(bp.fragment).toContain('<g id="bp-board"');
    const sch = renderViewPart([fixtures], 'schematic', {});
    expect(sch.fragment).toContain('<g id="sch-board"');
  });

  it('the page carries the loader: host bridge first, fetch fallback, spinner text', () => {
    const result = buildViewerFromFiles([fixtures], { deferViews: ['pcba'] });
    expect(result.html).toContain('window.typecadViewPart');
    expect(result.html).toContain("fetch('view-' + part + '.html')");
    expect(result.html).toContain('solving the ngspice operating point');
    expect(result.html).toContain('rendering the pcba view');
    expect(result.html).toContain("viewBusyShow('calculating copper");
    // thermal solve yields a frame so the spinner paints first
    expect(result.html).toContain('viewBusyShow(\'calculating copper');
  });
});
