import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildViewerFromFiles } from '../src/gerber_viewer/build.js';
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

  it('is fully self-contained (no external references)', () => {
    expect(html).not.toMatch(/src="http/i);
    expect(html).not.toMatch(/href="http/i);
    expect(html).toContain('<script>');
    expect(html).toContain('#board');
  });

  it('makes board text unselectable (silk/fab/refdes labels never highlight)', () => {
    expect(html).toContain('#board, #board text { -webkit-user-select: none; user-select: none; }');
  });

  it('persists layer settings to localStorage keyed per board', () => {
    expect(html).toContain("gerber-viewer:v1:' + document.title");
    expect(html).toContain('localStorage.getItem');
    expect(html).toContain('localStorage.setItem');
    // every mutation path saves: checkbox, opacity slider, All/None buttons
    expect(html).toMatch(/syncLayer\(cb\); persist\(\)/);
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
    expect(html).toContain('id="btn-measure"');
    // overlay group rides inside panzoom (injected after the y-flip group)
    expect(html).toContain('id="yflip"');
    expect(html).toMatch(/<\/g><g id="measure"><\/g><g id="drc"><\/g><g id="typecad-probe"><\/g><\/g><\/svg>/);
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

  it('bakes page-CSS styling into exports (cut polarity, DRC markers)', () => {
    // the exported file carries no page stylesheet: class-only styling
    // would fall back to SVG-default black fills
    expect(html).toContain("clone.querySelectorAll('.cut')");
    expect(html).toContain("clone.querySelectorAll('.drc-mark circle.outer')");
    expect(html).toContain("'rgba(229, 72, 77, 0.22)'");
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
    // unmatched copper dims harder (0.06), and the composite views dim per
    // element — never a group containing the match (group opacity would
    // composite over the forced opacity 1 and FADE the clicked net)
    expect(html).toContain("'0.06'");
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
    // the combo ships hidden — the pcba view owns it
    expect(withThemes).toContain('<div id="pcba-theme-box" style="display:none">');
    expect(withThemes).toContain('<option value="oshpark-after-dark">OSH Park After Dark</option>');
    // the color table rides as a JSON island (default = first theme)
    expect(withThemes).toContain('id="pcba-themes"');
    // setView shows the box only in pcba mode
    expect(withThemes).toContain("themeBox.style.display = viewMode === 'pcba'");
    // the remap skips mask-luminance ink and persists the pick
    expect(withThemes).toContain('function applyPcbaTheme(id)');
    expect(withThemes).toContain("els[i].closest('mask')) continue");
    expect(withThemes).toContain('state.__pcbaTheme = id');
    expect(withThemes).toContain("saved.__pcbaTheme && saved.__pcbaTheme !== 'green-enig'");
    // no picker without themes
    const plain = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: tinyPcba });
    expect(plain).not.toContain('id="pcba-theme-box"');
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
    expect(result.layers.map((l) => l.name)).toEqual(['Edge_Cuts.gbr', 'F_Cu.gbr', 'drl']);
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
    expect(html).toContain("el.setAttribute('opacity', '0.22')");
    expect(html).toContain("traces[t2].setAttribute('stroke-dasharray', '4 2.2')");
    expect(html).toContain('window.typecadLayoutApply(moves, texts, values, labels, renames, routedTracks, function (err)');
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

  
  it('embeds DRC markers as JSON and renders them client-side with a toggle', () => {
    expect(html).toContain('id="drc-data"');
    expect(html).toContain('clearance — pad of J1');
    expect(html).toContain('id="btn-drc"');
    expect(html).toMatch(/drcGroup\.classList\.toggle\('hidden'\)/);
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

  it('marks TrackBuilder-built traces dashed from the routes island (manual + mixed, never auto)', () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      routes: { nets: { VCC: { provenance: 'manual' }, GND: { provenance: 'mixed' }, net5: { provenance: 'auto' } } },
    });
    expect(html).toContain('id="routes"');
    expect(html).toContain("routesProv[rpk.toLowerCase()] = rawRt.nets[rpk];");
    expect(html).toContain("if (pr && pr.provenance !== 'auto') traces[t2].setAttribute('stroke-dasharray', '4 2.2');");
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
    expect(html).toContain('window.typecadLayoutApply(moves, texts, values, labels, renames, routedTracks, function (err)');
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
  (gr_text "hello silk" (at 6.5 7.5 0) (layer "F.SilkS") (uuid "x1") (effects (font (size 1.5 1.5)) (justify)))
  (gr_text "hidden" (at 9 9) (layer "B.Fab") (uuid "x2") (effects (font (size 1 1)) (hide)))
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
    // island (gerber y-up frame), hidden ones excluded
    const ltMatch = /<script id="layout-texts" type="application\/json">([\s\S]*?)<\/script>/.exec(result.html)![1]!;
    const layoutTexts = JSON.parse(ltMatch) as Array<{ text: string; x: number; y: number }>;
    expect(layoutTexts).toHaveLength(1);
    expect(layoutTexts[0]).toMatchObject({ text: 'hello silk', x: 6.5, y: -7.5 });
  });
});
