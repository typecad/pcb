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
    expect(withSch).toContain('dtFromI(Math.abs(cur), w)');
    expect(withSch).toContain('i / (0.048 * Math.pow(area, 0.725))');
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
    expect(withSch).toContain('gz[vc2] += (BD.viaG * drill) / 0.153;');
    expect(withSch).toContain('var gzT = gZ + gz[c3]; // FR4 core + via barrels');
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
    // one display-toggle loop covers every view group
    expect(html).toContain("viewGroups[name].style.display = name === viewMode ? '' : 'none'");
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

  it('renders the fab report panel from the computed stats', () => {
    expect(html).toContain('id="fab-report"');
    expect(html).toContain('29.17 × 23.17 mm');
    expect(html).toContain('F_Cu.gtl');
    expect(html).toContain('⌀ 0.60');
    expect(html).toContain('3 holes, 1 slots');
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
    expect(html).toContain('id="btn-svg"');
    expect(html).toContain('id="btn-png"');
    expect(html).toMatch(/exportSvgString/);
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
