import type { LayerInfo } from '../detect_layer.js';
import type { DrcMarker, FabReport } from '../report.js';

export interface ViewerOptions {
  title?: string;
  /** fab report data for the sidebar panel (computed by the build pipeline) */
  report?: FabReport;
  /** DRC violation markers, already in gerber coordinates */
  drcMarkers?: DrcMarker[];
  /** optional second view: the flat PCBA render of the same layers */
  pcbaSvg?: string;
  /** optional third view: the engineering-drawing render of the same layers */
  blueprintSvg?: string;
  /** optional fourth view: the routing-focused render (white paper, black traces) */
  schematicSvg?: string;
  /**
   * ngspice operating point (build/<board>_op.json, written by
   * `typecad-pcb simulate`): per-net voltages and per-device current/power,
   * shown when the mouse hovers a trace. Null/absent = no readout.
   */
  netOp?: {
    solved?: boolean;
    nets?: Record<string, number>;
    devices?: Record<string, { current?: number; power?: number }>;
    /** signed current injected into each net at a component pad — flow animation */
    branches?: Record<string, Array<{ ref: string; pin: string; i: number }>>;
  } | null;
  /**
   * theme picker entries for the pcba view: surface colors per builtin. The
   * switcher remaps the embedded render's flat colors client-side — one
   * render serves every theme, no re-render needed
   */
  pcbaThemes?: Array<{ id: string; label: string; colors: Record<string, string> }>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Strip a rendered `<svg …>…</svg>` down to its inner content + viewBox. */
function splitSvg(svg: string): { inner: string; viewBox: string } {
  const open = svg.indexOf('>');
  const close = svg.lastIndexOf('</svg>');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 1 1';
  return { inner: svg.slice(open + 1, close), viewBox };
}

/** Union of two "minX minY w h" viewBox strings (min 2, max 4 numbers). */
function unionViewBox(a: string, b: string): string {
  const nums = (v: string): number[] => v.split(/\s+/).map(Number);
  const [ax, ay, aw, ah] = nums(a);
  const [bx, by, bw, bh] = nums(b);
  const x = Math.min(ax!, bx!);
  const y = Math.min(ay!, by!);
  const x2 = Math.max(ax! + aw!, bx! + bw!);
  const y2 = Math.max(ay! + ah!, by! + bh!);
  return `${fmtNum(x)} ${fmtNum(y)} ${fmtNum(x2 - x)} ${fmtNum(y2 - y)}`;
}
function fmtNum(n: number): string {
  return String(Number(n.toFixed(6)));
}

function reportPanel(report: FabReport | undefined): string {
  if (!report) return '';
  const dims = report.board
    ? `${report.board.width.toFixed(2)} × ${report.board.height.toFixed(2)} ${report.units}`
    : '—';
  const copper = report.copper
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.layer)}</td><td>${c.traceLength.toFixed(1)}</td>` +
        `<td>${c.minWidth ?? '—'}</td><td>${c.maxWidth ?? '—'}</td><td>${c.flashes}</td></tr>`,
    )
    .join('');
  const drills = report.drills
    .map(
      (d) =>
        `<tr><td>⌀ ${d.diameter.toFixed(2)}</td><td>${d.count}</td>` +
        `<td>${d.plated === null ? '—' : d.plated ? 'plated' : 'NPTH'}</td></tr>`,
    )
    .join('');
  return [
    '<details id="fab-report">',
    '<summary>fab report</summary>',
    '<div class="report-body">',
    `<div class="report-dim">board ${dims}</div>`,
    '<table><tr><th>cu</th><th>mm</th><th>min</th><th>max</th><th>pads</th></tr>',
    copper,
    '</table>',
    `<div class="report-dim">${report.holes} holes, ${report.slots} slots</div>`,
    drills ? '<table><tr><th>drill</th><th>#</th><th>type</th></tr>' + drills + '</table>' : '',
    '</div>',
    '</details>',
  ].join('');
}

/**
 * Wrap a rendered board SVG in a self-contained HTML page: layer toggles with
 * per-layer opacity, wheel zoom (about the cursor), drag panning, fit button
 * and a live coordinate readout in board units. No external assets, works from
 * file://.
 */
export function buildViewerHtml(svg: string, layers: LayerInfo[], options: ViewerOptions = {}): string {
  const title = options.title ?? 'gerber-viewer';

  const rows = layers
    .map((layer) => {
      const checked = layer.defaultVisible ? ' checked' : '';
      return [
        `<label class="layer-row" data-layer-id="${escapeHtml(layer.id)}" data-kind="${escapeHtml(layer.kind)}">`,
        `<input type="checkbox" class="layer-vis"${checked}>`,
        `<span class="chip" style="background:${layer.color}"></span>`,
        `<span class="layer-name" title="${escapeHtml(layer.fullName ?? layer.name)}">${escapeHtml(layer.name)}</span>`,
        `<input type="range" class="layer-opacity" min="0.1" max="1" step="0.05" value="1" title="opacity">`,
        `</label>`,
      ].join('');
    })
    .join('\n');

  const js = String.raw`
(function () {
  var svg = document.getElementById('board');
  var panzoom = document.getElementById('panzoom');
  if (!svg || !panzoom) return;
  var k = 1, tx = 0, ty = 0;
  var statusEl = document.getElementById('status');
  // A host render notice (the vscode extension's "generating new render…")
  // sets data-locked and owns the line until it is cleared or the page
  // reloads; the viewer's own readouts stand down so a moved mouse cannot
  // overwrite it.
  function statusLocked() {
    return !!statusEl && statusEl.hasAttribute('data-locked');
  }
  var units = svg.getAttribute('data-units') || 'mm';

  // ngspice operating point island (build/<board>_op.json via
  // \`typecad-pcb simulate\`): per-net volts + per-device amps/watts, shown
  // when a trace is hovered. Empty island = no simulation ran. ngspice
  // lowercases every name while the gerber X2 attributes keep the
  // schematic's case — normalize the island keys at parse so VCC finds vcc.
  var netOp = null;
  try {
    var rawOp = JSON.parse(document.getElementById('net-op').textContent);
    if (rawOp && rawOp.nets) {
      var lcNets = {};
      for (var nk in rawOp.nets) lcNets[nk.toLowerCase()] = rawOp.nets[nk];
      rawOp.nets = lcNets;
    }
    if (rawOp && rawOp.devices) {
      var lcDev = {};
      for (var dk in rawOp.devices) lcDev[dk.toLowerCase()] = rawOp.devices[dk];
      rawOp.devices = lcDev;
    }
    if (rawOp && rawOp.branches) {
      var lcBr = {};
      for (var bk in rawOp.branches) lcBr[bk.toLowerCase()] = rawOp.branches[bk];
      rawOp.branches = lcBr;
    }
    netOp = rawOp;
  } catch (e) {}
  // engineering notation for the readout: 0.0012 -> "1.2m", 5e-6 -> "5u"
  function fmtEng(v) {
    if (v === undefined || v === null || isNaN(v)) return '?';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1) return String(Math.round(v * 100) / 100);
    if (a >= 0.001) return String(parseFloat((v * 1e3).toFixed(2))) + 'm';
    return String(parseFloat((v * 1e6).toFixed(2))) + 'u';
  }

  // ---- view switching (gerber / pcba / blueprint / schematic share one coordinate frame) ----
  var viewMode = 'gerber';
  var lastViewMode = 'gerber';
  var viewGroups = {
    gerber: document.getElementById('view-gerber'),
    pcba: document.getElementById('view-pcba'),
    blueprint: document.getElementById('view-blueprint'),
    schematic: document.getElementById('view-schematic'),
  };
  var layersBox = document.getElementById('layers');
  var btnAllOn = document.getElementById('btn-all-on');
  var btnAllOff = document.getElementById('btn-all-off');
  function setView(mode) {
    if (!viewGroups.gerber) return;
    // only modes whose group exists (thermal shares the schematic group);
    // anything unknown is the gerber stack
    viewMode = (mode === 'thermal' || (viewGroups[mode] && mode !== 'gerber')) ? mode : 'gerber';
    for (var name in viewGroups) {
      if (viewGroups[name]) viewGroups[name].style.display = name === viewMode ? '' : 'none';
    }
    // thermal reuses the schematic render with its own copper coloring
    if (viewGroups.schematic)
      viewGroups.schematic.style.display = viewMode === 'schematic' || viewMode === 'thermal' ? '' : 'none';
    // layer visibility/opacity controls belong to the gerber stack only —
    // the ruler stays (all views share one coordinate frame)
    if (layersBox) layersBox.style.display = viewMode === 'gerber' ? '' : 'none';
    if (btnAllOn) btnAllOn.style.display = viewMode === 'gerber' ? '' : 'none';
    if (btnAllOff) btnAllOff.style.display = viewMode === 'gerber' ? '' : 'none';
    // the theme picker belongs to the pcba view alone
    var themeBox = document.getElementById('pcba-theme-box');
    if (themeBox) themeBox.style.display = viewMode === 'pcba' ? '' : 'none';
    // the voltage/power legends belong to the schematic view alone, and only
    // once the heat maps actually have solved data
    var voltLegend = document.getElementById('volt-legend-box');
    if (voltLegend) voltLegend.style.display = viewMode === 'schematic' && voltRange ? '' : 'none';
    var powerLegend = document.getElementById('power-legend-box');
    if (powerLegend) powerLegend.style.display = viewMode === 'schematic' && powerRange ? '' : 'none';
    // the power overlay and the current-flow particles need rendered
    // geometry — build them the first time the schematic view is shown
    if (viewMode === 'schematic') {
      buildPowerOverlay();
      buildFlow();
      flowStart();
    } else {
      flowStop();
    }
    // thermal shares the schematic render — without this the (frozen)
    // particles linger over the thermal board
    var flowLayer = document.getElementById('sch-flow');
    if (flowLayer) flowLayer.style.display = viewMode === 'schematic' ? '' : 'none';
    // thermal builds on the flow graph's per-wire currents
    if (viewMode === 'thermal') {
      buildFlow();
      buildThermal();
      enterThermal();
    } else if (lastViewMode === 'thermal') {
      exitThermal();
    }
    var dtBox = document.getElementById('dt-legend-box');
    if (dtBox) dtBox.style.display = viewMode === 'thermal' && dtReady ? '' : 'none';
    lastViewMode = viewMode;
    var flowBox = document.getElementById('flow-box');
    if (flowBox) flowBox.style.display = viewMode === 'schematic' && flowReady ? '' : 'none';
    var sel = document.getElementById('view-mode');
    if (sel) sel.value = viewMode;
    clearNetHighlight();
    renderMeasure();
    // remember the choice per board (same store as layer settings/viewport)
    try {
      var state = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
      state.__viewMode = viewMode;
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch (e) {}
  }
  var modeSelect = document.getElementById('view-mode');
  if (modeSelect) modeSelect.addEventListener('change', function () { setView(modeSelect.value); });

  // ---- schematic heat maps (traces by voltage, components by power): each
  // value is interpolated continuously across the board's own solved range
  // (no fixed buckets) — every value gets its own gradation. Both ramps
  // share the same anchors so the scales read alike: black (coldest/ground)
  // through blue, green, yellow and orange to red, with purple marking the
  // single hottest value. Nets/parts outside the solve read gray or get no
  // overlay, so "unsolved" never masquerades as a value.
  var VOLT_STOPS = ['#000000', '#2060ff', '#00b400', '#ffdd00', '#ff8c00', '#ff0000', '#a020f0'];
  var POWER_STOPS = ['#000000', '#2060ff', '#00b400', '#ffdd00', '#ff8c00', '#ff0000', '#a020f0'];
  var voltRange = null;
  var powerRange = null;
  var powerOverlayDone = false;
  function voltMix(a, b, f) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) + f * (((pb >> 16) & 255) - ((pa >> 16) & 255)));
    var g = Math.round(((pa >> 8) & 255) + f * (((pb >> 8) & 255) - ((pa >> 8) & 255)));
    var bl = Math.round((pa & 255) + f * ((pb & 255) - (pa & 255)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function interpColor(stops, lo, hi, v) {
    if (!(hi > lo)) return stops[Math.floor(stops.length / 2)];
    var t = (v - lo) / (hi - lo);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    // position along the stop list; the fractional part blends the two
    // neighboring anchors
    var s = t * (stops.length - 1);
    var i = Math.min(Math.floor(s), stops.length - 2);
    return voltMix(stops[i], stops[i + 1], s - i);
  }
  function voltColor(v) {
    if (!voltRange) return VOLT_STOPS[Math.floor(VOLT_STOPS.length / 2)];
    return interpColor(VOLT_STOPS, voltRange[0], voltRange[1], v);
  }
  function powerColor(p) {
    if (!powerRange) return POWER_STOPS[Math.floor(POWER_STOPS.length / 2)];
    return interpColor(POWER_STOPS, powerRange[0], powerRange[1], p);
  }
  // the legend bars mirror their ramps exactly: equally spaced CSS stops are
  // the same piecewise-linear interpolation the traces/overlays use
  function fillLegend(prefix, stops, lo, hi, unit) {
    var bar = document.getElementById(prefix + '-legend-bar');
    if (!bar) return;
    var css = [];
    for (var si = 0; si < stops.length; si++) {
      css.push(stops[si] + ' ' + Math.round((si * 100) / (stops.length - 1)) + '%');
    }
    bar.style.background = 'linear-gradient(to right, ' + css.join(', ') + ')';
    var mn = document.getElementById(prefix + '-legend-min');
    var mx = document.getElementById(prefix + '-legend-max');
    if (mn) mn.textContent = fmtEng(lo) + unit;
    if (mx) mx.textContent = fmtEng(hi) + unit;
  }
  function applyVoltageColors() {
    if (!viewGroups.schematic || !netOp || !netOp.solved || !netOp.nets) return;
    var vals = [];
    for (var vk in netOp.nets) if (isFinite(netOp.nets[vk])) vals.push(netOp.nets[vk]);
    if (!vals.length) return;
    voltRange = [Math.min.apply(null, vals), Math.max.apply(null, vals)];
    var traces = viewGroups.schematic.querySelectorAll('#sch-copper [data-net]');
    for (var ti = 0; ti < traces.length; ti++) {
      // secondary-layer traces keep their construction indication — the
      // electrical colors belong to the top layer
      if (traces[ti].getAttribute('data-sub')) continue;
      var v = netOp.nets[traces[ti].getAttribute('data-net').toLowerCase()];
      traces[ti].setAttribute('stroke', v === undefined ? '#9aa0a6' : voltColor(v));
    }
    fillLegend('volt', VOLT_STOPS, voltRange[0], voltRange[1], 'V');
    var legend = document.getElementById('volt-legend-box');
    if (legend && viewMode === 'schematic') legend.style.display = '';
  }
  applyVoltageColors();

  // ---- component power overlay: a translucent heat-map rectangle over each
  // solved component's glyph, drawn on top of the component layer (inside
  // the board group, so it shares the schematic frame and dims with the
  // board). pointer-events none — hover/click still reach the glyph pads.
  function applyPowerLegend() {
    if (!netOp || !netOp.solved || !netOp.devices) return;
    var vals = [];
    for (var dk in netOp.devices) {
      var p = netOp.devices[dk].power;
      if (p !== undefined && isFinite(p)) vals.push(p);
    }
    if (!vals.length) return;
    powerRange = [Math.min.apply(null, vals), Math.max.apply(null, vals)];
    fillLegend('power', POWER_STOPS, powerRange[0], powerRange[1], 'W');
    var legend = document.getElementById('power-legend-box');
    if (legend && viewMode === 'schematic') legend.style.display = '';
  }
  applyPowerLegend();

  // getBBox is rendering-independent but IGNORES the element's own transform
  // — a pcba glyph group sits at translate(centroid) rotate(angle), so its
  // local bbox would stretch any fit from the origin to the part. Fold the
  // element's own transform in; the result is a box in the parent (board)
  // frame. Shared by component search/zoom and the power overlay.
  function boxInParent(el) {
    var b = el.getBBox();
    var t = el.transform && el.transform.baseVal ? el.transform.baseVal.consolidate() : null;
    if (!t) return b;
    var m = t.matrix;
    var xs = [], ys = [];
    var corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ];
    for (var c = 0; c < 4; c++) {
      xs.push(m.a * corners[c][0] + m.c * corners[c][1] + m.e);
      ys.push(m.b * corners[c][0] + m.d * corners[c][1] + m.f);
    }
    var x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs);
    var y1 = Math.min.apply(null, ys), y2 = Math.max.apply(null, ys);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  function buildPowerOverlay() {
    if (powerOverlayDone || !powerRange || !viewGroups.schematic) return;
    powerOverlayDone = true;
    var comps = viewGroups.schematic.querySelector('#sch-board > #sch-components');
    if (!comps) return;
    var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('id', 'sch-power-overlay');
    overlay.setAttribute('pointer-events', 'none');
    overlay.setAttribute('opacity', '0.5');
    var glyphs = comps.querySelectorAll('g[data-ref]');
    for (var gi = 0; gi < glyphs.length; gi++) {
      var ref = glyphs[gi].getAttribute('data-ref');
      var dev = netOp.devices && netOp.devices[ref.toLowerCase()];
      if (!dev || dev.power === undefined || !isFinite(dev.power)) continue;
      // the overlay hugs the component BODY — the glyph's largest filled
      // shape. Lead wires, end caps and markings are all smaller: a group
      // bbox would stretch the overlay across the leads (a THT resistor
      // reads as its full pitch) and box a round can as its bounding square
      var body = null, bodyArea = 0;
      for (var ci = 0; ci < glyphs[gi].children.length; ci++) {
        var ch = glyphs[gi].children[ci];
        if (ch.tagName.toLowerCase() === 'clippath') continue;
        if (typeof ch.getBBox !== 'function') continue;
        var f = ch.getAttribute('fill');
        if (!f || f === 'none') continue;
        var cb;
        try { cb = ch.getBBox(); } catch (e) { continue; }
        if (!cb.width || !cb.height) continue;
        var area = cb.width * cb.height;
        if (area > bodyArea) { bodyArea = area; body = ch; }
      }
      var shape = null;
      try {
        shape = body ? bodyOverlayShape(glyphs[gi], body) : rectOverlayShape(boxInParent(glyphs[gi]));
      } catch (e) {
        continue;
      }
      if (!shape) continue;
      shape.setAttribute('fill', powerColor(dev.power));
      overlay.appendChild(shape);
    }
    if (overlay.childNodes.length) comps.parentNode.appendChild(overlay);
  }

  // overlay geometry for a glyph's body shape, mapped into the glyph's
  // parent (board) frame: compose the glyph's placement transform with the
  // shape's own. Placements are rigid translate/rotate, so a circle body
  // stays a circle at exactly the body radius.
  function bodyOverlayShape(glyph, body) {
    var mg = elMatrix(glyph), mb = elMatrix(body);
    var m = mg ? (mb ? matMul(mg, mb) : mg) : mb;
    if (body.tagName.toLowerCase() === 'circle') {
      var cx = body.cx.baseVal.value, cy = body.cy.baseVal.value, r = body.r.baseVal.value;
      var scale = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1;
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', m ? m.a * cx + m.c * cy + m.e : cx);
      circle.setAttribute('cy', m ? m.b * cx + m.d * cy + m.f : cy);
      circle.setAttribute('r', r * scale);
      return circle;
    }
    return rectOverlayShape(shapeBoxInFrame(body, m));
  }
  function rectOverlayShape(b) {
    if (!b || (!b.width && !b.height)) return null;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', b.x);
    rect.setAttribute('y', b.y);
    rect.setAttribute('width', b.width);
    rect.setAttribute('height', b.height);
    rect.setAttribute('rx', Math.min(b.width, b.height) * 0.15);
    return rect;
  }
  function elMatrix(el) {
    if (!el.transform || !el.transform.baseVal) return null;
    var t = el.transform.baseVal.consolidate();
    return t ? t.matrix : null;
  }
  function matMul(m1, m0) {
    return {
      a: m1.a * m0.a + m1.c * m0.b,
      b: m1.b * m0.a + m1.d * m0.b,
      c: m1.a * m0.c + m1.c * m0.d,
      d: m1.b * m0.c + m1.d * m0.d,
      e: m1.a * m0.e + m1.c * m0.f + m1.e,
      f: m1.b * m0.e + m1.d * m0.f + m1.f,
    };
  }
  function shapeBoxInFrame(el, m) {
    var b = el.getBBox();
    if (!m) return b;
    var xs = [], ys = [];
    var corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ];
    for (var c = 0; c < 4; c++) {
      xs.push(m.a * corners[c][0] + m.c * corners[c][1] + m.e);
      ys.push(m.b * corners[c][0] + m.d * corners[c][1] + m.f);
    }
    var x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs);
    var y1 = Math.min.apply(null, ys), y2 = Math.max.apply(null, ys);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  // ---- current flow: particles gliding along the schematic traces in the
  // conventional-current direction (the EE convention, not electron flow).
  // Each pad's signed injection (the island's branches) anchors direction —
  // particles leave the pads a net's current enters and head for the pads it
  // leaves. Speed and particle size encode the net's total current on a log
  // scale (boards span decades); zero-current nets stay still.
  var flowGroup = null;
  var flowParticles = [];
  var flowReady = false;
  var flowBuilt = false;
  var flowRaf = 0;
  var flowLast = 0;
  var flowToggle = document.getElementById('flow-toggle');
  // animation rate multiplier from the speed slider (0 pauses the loop)
  var flowRate = 1;
  var flowSpeedInput = document.getElementById('flow-speed');
  var flowSpeedVal = document.getElementById('flow-speed-val');
  function flowNetData(copper, net) {
    var entries = netOp.branches[net.toLowerCase()];
    if (!entries || !entries.length) return null;
    // net the injections per pad first — one pad can both feed and draw (a
    // rail pad hosting the source's + terminal behind a pulling resistor)
    var padSum = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var k = e.ref + '|' + e.pin;
      padSum[k] = (padSum[k] || 0) + e.i;
    }
    var pads = [];
    for (var kk in padSum) {
      if (!padSum[kk]) continue;
      var pp = kk.split('|');
      var padEl = copper.querySelector('[data-net="' + net + '"][data-ref="' + pp[0] + '"][data-pin="' + pp[1] + '"]');
      if (!padEl) continue;
      var b = padEl.getBBox();
      pads.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, q: padSum[kk] });
    }
    return pads.length ? pads : null;
  }
  function buildFlow() {
    if (flowBuilt || !viewGroups.schematic) return;
    flowBuilt = true;
    if (!netOp || !netOp.solved || !netOp.branches) return;
    var copper = viewGroups.schematic.querySelector('#sch-copper');
    if (!copper) return;
    var SVGNS = 'http://www.w3.org/2000/svg';
    var byNet = {};
    var els = copper.querySelectorAll('[data-net]');
    for (var i = 0; i < els.length; i++) {
      // open wires only: pads carry data-net too (closed shapes would orbit
      // the pad perimeter), and closed contours (d containing Z) are pads
      // and pour regions — the GND pour outline alone runs tens of
      // thousands of units and would bury the board in particles
      var tg = els[i].tagName.toLowerCase();
      if (tg !== 'path' && tg !== 'polyline' && tg !== 'line') continue;
      var dd = els[i].getAttribute('d');
      if (dd && dd.indexOf('Z') !== -1) continue;
      var n = els[i].getAttribute('data-net');
      if (!byNet[n]) byNet[n] = [];
      byNet[n].push(els[i]);
    }
    // Per-BRANCH flow on the route graph, not per-net guesses: each wire is
    // an edge between coincident endpoints, pads attach to the nearest node,
    // and every current-leaving pad draws its own solved current along its
    // path toward the nearest current-entering pad. A wire that carries
    // nothing (a rail stretch ending at a DC-open cap) gets no particles,
    // and direction is the actual current path, never endpoint heuristics.
    var edges = [];
    var lo = Infinity, hi = 0;
    for (var net in byNet) {
      var pads = flowNetData(copper, net);
      if (!pads) continue;
      var hasSrc = false, hasSnk = false;
      for (var pj = 0; pj < pads.length; pj++) {
        if (pads[pj].q > 0) hasSrc = true;
        else if (pads[pj].q < 0) hasSnk = true;
      }
      if (!hasSrc || !hasSnk) continue;
      var nodes = {};
      var nodeAt = function (x, y) {
        var key = Math.round(x * 10) / 10 + ',' + Math.round(y * 10) / 10;
        if (!nodes[key]) nodes[key] = { key: key, x: x, y: y, adj: [], depth: -1, parentEdge: -1, isSnk: 0 };
        return nodes[key];
      };
      var netEdges = [];
      for (var wi = 0; wi < byNet[net].length; wi++) {
        var el = byNet[net][wi];
        if (!el.getTotalLength) continue;
        var L = el.getTotalLength();
        if (!L) continue;
        var s0 = el.getPointAtLength(0);
        var s1 = el.getPointAtLength(L);
        var na = nodeAt(s0.x, s0.y);
        var nb = nodeAt(s1.x, s1.y);
        if (na === nb) continue;
        // layer membership drives via-barrel pairing (data-sub = secondary)
        var eSub = el.hasAttribute('data-sub');
        na.subLayer = na.subLayer || eSub;
        nb.subLayer = nb.subLayer || eSub;
        na.topLayer = na.topLayer || !eSub;
        nb.topLayer = nb.topLayer || !eSub;
        var eidx = netEdges.length;
        netEdges.push({ el: el, len: L, a: na, b: nb, cur: 0 });
        na.adj.push(eidx);
        nb.adj.push(eidx);
      }
      // attach pads to the route graph: every route node within reach of a
      // pad is electrically the SAME node (a pad is one piece of copper), so
      // merge them — this also bridges route fragments that meet inside a
      // pad, which the endpoint-coincidence graph alone can't see
      var padNodes = [];
      for (var pk = 0; pk < pads.length; pk++) {
        var near = [];
        for (var nk in nodes) {
          var nd = nodes[nk];
          var ddx = nd.x - pads[pk].x, ddy = nd.y - pads[pk].y;
          if (ddx * ddx + ddy * ddy < 12.25) near.push(nd);
        }
        if (!near.length) {
          padNodes.push({ pad: pads[pk], node: null });
          continue;
        }
        var canon = near[0];
        for (var mi = 1; mi < near.length; mi++) {
          var other = near[mi];
          for (var ei3 = 0; ei3 < netEdges.length; ei3++) {
            if (netEdges[ei3].a === other) netEdges[ei3].a = canon;
            if (netEdges[ei3].b === other) netEdges[ei3].b = canon;
          }
          canon.adj = canon.adj.concat(other.adj);
          other.depth = -2; // retired into canon
        }
        if (pads[pk].q < 0) canon.isSnk = 1;
        padNodes.push({ pad: pads[pk], node: canon });
      }
      // via pads tie the layers AND stitch into routes that merely cross
      // them: the crossed edge splits at the via center (two half-edges
      // sharing the SVG path with offset bases), so a mid-segment drop
      // genuinely branches into the via
      var viaPads1 = [];
      var seenVia = {};
      for (var vp = 0; vp < els.length; vp++) {
        var vpe = els[vp];
        if (vpe.getAttribute('data-ref') || !vpe.getAttribute('data-net')) continue;
        if (vpe.getAttribute('data-net') !== net) continue;
        var vptg = vpe.tagName.toLowerCase();
        if (vptg === 'path' || vptg === 'polyline' || vptg === 'line') continue;
        var vpb = vpe.getBBox();
        if (vpb.width > 1.2 || vpb.height > 1.2) continue;
        // one via flashes on every layer it spans — dedupe by position
        var vkey = Math.round(vpb.x * 20) / 20 + ',' + Math.round(vpb.y * 20) / 20;
        if (seenVia[vkey]) continue;
        seenVia[vkey] = 1;
        viaPads1.push({ x: vpb.x + vpb.width / 2, y: vpb.y + vpb.height / 2, el: vpe, dia: Math.max(vpb.width, vpb.height) });
      }
      for (var vp2 = 0; vp2 < viaPads1.length; vp2++) {
        var cV = viaPads1[vp2];
        // via barrel: the pad ties two layer-groups of route nodes through
        // a real resistor (R = ρ·boardT/(π·d·t_plating)) so the solve
        // yields the ACTUAL current through each via — no equal-split guess
        var Fcanon = null, Bcanon = null, bestF = 4, bestB = 4;
        for (var nk5 in nodes) {
          if (nodes[nk5].depth === -2) continue;
          var nvx = nodes[nk5].x - cV.x, nvy = nodes[nk5].y - cV.y;
          var nd5 = nvx * nvx + nvy * nvy;
          if (nd5 >= 4) continue;
          if (nodes[nk5].subLayer && !nodes[nk5].topLayer) {
            if (nd5 < bestB) { bestB = nd5; Bcanon = nodes[nk5]; }
          } else if (nodes[nk5].topLayer && !nodes[nk5].subLayer) {
            if (nd5 < bestF) { bestF = nd5; Fcanon = nodes[nk5]; }
          }
        }
        if (!Fcanon && !Bcanon) Fcanon = nodeAt(cV.x, cV.y);
        if (!Fcanon) Fcanon = Bcanon;
        if (!Bcanon) Bcanon = Fcanon;
        // split crossing edges at the via center, attaching the halves to
        // THEIR layer's canonical node (0.35 mm capture radius) — and
        // rewire the far endpoints' adjacency to the halves (the old edge
        // is dead; leaving the far adjacency on it orphans the network)
        for (var ev = netEdges.length - 1; ev >= 0; ev--) {
          var eS = netEdges[ev];
          var host = eS.el && eS.el.hasAttribute('data-sub') ? Bcanon : Fcanon;
          if (eS.dead || !eS.len || eS.a === host || eS.b === host) continue;
          var ebS = eS.el.getBBox();
          if (cV.x < ebS.x - 1 || cV.x > ebS.x + ebS.width + 1 || cV.y < ebS.y - 1 || cV.y > ebS.y + ebS.height + 1) continue;
          var hitS = -1;
          for (var sl = 0.3; sl < eS.len; sl += 0.25) {
            var spS = eS.el.getPointAtLength(sl);
            if (Math.abs(spS.x - cV.x) < 0.35 && Math.abs(spS.y - cV.y) < 0.35) {
              hitS = sl;
              break;
            }
          }
          if (hitS < 0.5 || hitS > eS.len - 0.5) continue;
          eS.dead = 1; // retired into its two halves
          var h1 = { el: eS.el, len: hitS, a: eS.a, b: host, cur: 0, base: eS.base || 0 };
          var h2 = { el: eS.el, len: eS.len - hitS, a: host, b: eS.b, cur: 0, base: (eS.base || 0) + hitS };
          netEdges.push(h1, h2);
          var i1 = netEdges.length - 2, i2 = netEdges.length - 1;
          host.adj.push(i1, i2);
          eS.a.adj.push(i1);
          eS.b.adj.push(i2);
        }
        // the barrel itself as an edge (only meaningful when the layers differ)
        if (Fcanon !== Bcanon) {
          // drill ≈ 45% of the annulus diameter (annular ring ~27% each side)
          var barrel = { barrel: 1, el: null, viaEl: viaPads1[vp2].el, len: 1, a: Fcanon, b: Bcanon, cur: 0, drill: 0.45 * viaPads1[vp2].dia };
          netEdges.push(barrel);
          Fcanon.adj.push(netEdges.length - 1);
          Bcanon.adj.push(netEdges.length - 1);
        }
      }
      // resistor-network solve: every wire is R = Rs·L/w (35 µm sheet
      // copper; Rs = 0.493 mΩ/□), pads inject their solved current, and a
      // SOR pass over the node voltages gives each edge its true current —
      // parallel paths (a mid-trace via dropping to a twin route on another
      // layer) share by conductance instead of one path taking everything
      var nodeArr = [];
      for (var nk4 in nodes) {
        if (nodes[nk4].depth === -2) continue; // retired into a pad canon
        nodes[nk4].idx = nodeArr.length;
        nodeArr.push(nodes[nk4]);
      }
      var nN = nodeArr.length;
      var inject = new Float64Array(nN);
      var refIdx2 = -1;
      for (var pk4 = 0; pk4 < padNodes.length; pk4++) {
        var pn4 = padNodes[pk4];
        if (!pn4.node) continue;
        inject[pn4.node.idx] += pn4.pad.q;
      }
      for (var ri = 0; ri < nN; ri++) {
        if (refIdx2 < 0 || inject[ri] < inject[refIdx2]) refIdx2 = ri;
      }
      if (refIdx2 < 0 || inject[refIdx2] >= 0) continue; // no sink to anchor
      var Vv = new Float64Array(nN);
      var gsum = new Float64Array(nN);
      var edgeG = new Float64Array(netEdges.length);
      for (var ei4 = 0; ei4 < netEdges.length; ei4++) {
        var e4 = netEdges[ei4];
        if (e4.dead) continue;
        if (e4.barrel) {
          // barrel conductance G = π·d·t/(ρ·boardT) in siemens:
          // π × d[mm]×1e-3 × 35e-6 / (1.724e-8 × 1.6e-3)
          edgeG[ei4] = (Math.PI * e4.drill * 3.5e-8) / 2.7584e-11;
        } else {
          var wE = parseFloat(e4.el.getAttribute('data-w') || e4.el.getAttribute('stroke-width')) || 0.2;
          edgeG[ei4] = wE / (DT_RS * e4.len || 1e-9); // S = w/(Rs·L)
        }
        gsum[e4.a.idx] += edgeG[ei4];
        gsum[e4.b.idx] += edgeG[ei4];
      }
      for (var it4 = 0; it4 < 4000; it4++) {
        var md4 = 0;
        for (var ni4 = 0; ni4 < nN; ni4++) {
          if (ni4 === refIdx2 || !gsum[ni4]) continue;
          var u4 = nodeArr[ni4];
          var s4 = inject[ni4];
          for (var ai4 = 0; ai4 < u4.adj.length; ai4++) {
            var gi = u4.adj[ai4];
            if (netEdges[gi].dead) continue;
            var other4 = netEdges[gi].a === u4 ? netEdges[gi].b : netEdges[gi].a;
            s4 += edgeG[gi] * Vv[other4.idx];
          }
          var nv4 = s4 / gsum[ni4];
          var dd4 = nv4 - Vv[ni4];
          Vv[ni4] += 1.5 * dd4;
          if (dd4 > md4) md4 = dd4;
          else if (-dd4 > md4) md4 = -dd4;
        }
        if (md4 < 1e-12) break;
      }
      // edge currents: positive = along the wire's own a->b order; barrels
      // publish their solved current on the via pad for the thermal view
      for (var ei5 = 0; ei5 < netEdges.length; ei5++) {
        var e5 = netEdges[ei5];
        if (e5.dead) continue;
        e5.cur = (Vv[e5.a.idx] - Vv[e5.b.idx]) * edgeG[ei5];
        if (e5.barrel && e5.viaEl) e5.viaEl.__viaCur = e5.cur;
      }
      for (var ei = 0; ei < netEdges.length; ei++) {
        var ed = netEdges[ei];
        if (ed.dead || ed.barrel) continue; // barrels have no element
        // the thermal view reuses the solved per-wire currents; split edges
        // share an element — keep the larger reading
        if (ed.el.__edgeCur === undefined || Math.abs(ed.cur) > Math.abs(ed.el.__edgeCur)) {
          ed.el.__edgeCur = ed.cur;
        }
        if (!ed.cur) continue;
        edges.push(ed);
        var mag = Math.abs(ed.cur);
        if (mag < lo) lo = mag;
        if (mag > hi) hi = mag;
      }
    }
    if (!edges.length) return;
    flowGroup = document.createElementNS(SVGNS, 'g');
    flowGroup.setAttribute('id', 'sch-flow');
    flowGroup.setAttribute('pointer-events', 'none');
    // particles per edge: count by wire length, size and speed by the log of
    // the edge's own current within the board's range — plus a global budget
    // so even a pathological trace count can never wedge the frame loop
    for (var ei2 = 0; ei2 < edges.length && flowParticles.length < 400; ei2++) {
      var ed2 = edges[ei2];
      if (!ed2.el) continue; // barrel edges have no drawable path
      var mag2 = Math.abs(ed2.cur);
      var t = hi > lo ? (Math.log(mag2) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : 0.5;
      var dir = ed2.cur > 0 ? 1 : -1;
      var count = Math.min(32, Math.max(1, Math.round(ed2.len / 2.5)));
      for (var ci = 0; ci < count && flowParticles.length < 400; ci++) {
        var dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('r', (0.16 + 0.2 * t).toFixed(3));
        dot.setAttribute('fill', '#ffffff');
        dot.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        dot.setAttribute('stroke-width', '0.05');
        flowGroup.appendChild(dot);
        flowParticles.push({ path: ed2.el, len: ed2.len, base: ed2.base || 0, dir: dir, off: (ed2.len * ci) / count, speed: 2.5 + 10 * t, dot: dot });
      }
    }
    if (flowParticles.length) copper.parentNode.insertBefore(flowGroup, copper.nextSibling);
    flowReady = true;
  }
  function flowFrame(ts) {
    flowRaf = 0;
    if (!flowToggle || !flowToggle.checked || viewMode !== 'schematic') {
      flowLast = 0;
      return;
    }
    var dt = flowLast ? Math.min(0.05, (ts - flowLast) / 1000) : 0;
    flowLast = ts;
    for (var i = 0; i < flowParticles.length; i++) {
      var p = flowParticles[i];
      p.off += p.dir * p.speed * flowRate * dt;
      if (p.off > p.len) p.off -= p.len;
      if (p.off < 0) p.off += p.len;
      var pt = p.path.getPointAtLength((p.base || 0) + p.off);
      p.dot.setAttribute('cx', pt.x);
      p.dot.setAttribute('cy', pt.y);
    }
    flowRaf = requestAnimationFrame(flowFrame);
  }
  function flowStart() {
    if (!flowReady || flowRaf) return;
    if (!flowToggle || !flowToggle.checked) return;
    flowRaf = requestAnimationFrame(flowFrame);
  }
  function flowStop() {
    if (flowRaf) cancelAnimationFrame(flowRaf);
    flowRaf = 0;
    flowLast = 0;
  }
  function saveFlowState() {
    try {
      var state = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
      state.__flowRate = flowRate;
      state.__flowOn = flowToggle ? flowToggle.checked : true;
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch (e) {}
  }
  if (flowToggle)
    flowToggle.addEventListener('change', function () {
      if (flowToggle.checked) flowStart();
      else flowStop();
      saveFlowState();
    });
  if (flowSpeedInput)
    flowSpeedInput.addEventListener('input', function () {
      flowRate = parseFloat(flowSpeedInput.value) || 0;
      if (flowSpeedVal) flowSpeedVal.textContent = flowRate.toFixed(1) + 'x';
      // 0x parks the loop; any movement restarts it (if the checkbox allows)
      if (flowRate > 0) flowStart();
      else flowStop();
      saveFlowState();
    });

  // ---- copper ΔT (thermal view): where is the layout thermally stressed?
  // Wires take the inverted IPC-2221 formula — the same constants the
  // library's powerInfo width sizer uses — from each wire's solved current
  // (the flow graph's per-edge value) and its real gerber width. Pours get
  // a 2D sheet-resistance solve over the actual fill polygon driven by the
  // per-pad current injections, so heating appears where the copper truly
  // funnels. Copper-loss estimate only: external-layer constants, no
  // component self-heating, no enclosure.
  var DT_STOPS = ['#3a3f45', '#6b4a33', '#9c5b2a', '#cc7a2e', '#f0993c', '#ffc46b', '#fff3d6'];
  var DT_RS = 0.000493; // ohms per square: 1.724e-8 Ω·m / 35 µm
  var DT_CELL = 0.6; // raster pitch, board mm
  var dtBuilt = false;
  var dtReady = false;
  var dtItems = null; // {wires:[{el,dt}], pours:[pour], maxDT}
  function dtFromI(i, widthMm) {
    if (!(i > 0) || !(widthMm > 0)) return 0;
    // cross-section in mil² (w·t) at 1 oz = 35 µm — matching the sizer
    var area = widthMm * 39.3701 * 1.378;
    var r = i / (0.048 * Math.pow(area, 0.725));
    return r > 0 ? Math.pow(r, 1 / 0.44) : 0;
  }
  function dtColor(dt, hi) {
    var t = hi > 0 ? dt / hi : 0;
    if (t > 1) t = 1;
    var s = t * (DT_STOPS.length - 1);
    var i = Math.min(Math.floor(s), DT_STOPS.length - 2);
    return voltMix(DT_STOPS[i], DT_STOPS[i + 1], s - i);
  }
  function dtViaFromI(i, drillMm) {
    if (!(i > 0) || !(drillMm > 0)) return 0;
    // barrel cross-section A = π·(D+Tk)·Tk in mil², plating 35 µm — the
    // same constants as the library's via sizer (IPC-2152 form)
    var dMil = drillMm * 39.3701;
    var tkMil = 1.378;
    var area = Math.PI * (dMil + tkMil) * tkMil;
    var r = i / (0.048 * Math.pow(area, 0.75));
    return r > 0 ? Math.pow(r, 1 / 0.44) : 0;
  }
  function dtHexRGB(hex) {
    var p = parseInt(hex.slice(1), 16);
    return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
  }
  // one pour: raster → solve → cell ΔT array + a paintable heat image
  function solvePourDT(copper, net, clipPolys) {
    var pads = flowNetData(copper, net);
    if (!pads) return null;
    var hasSrc = false, hasSnk = false;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i].q > 0) hasSrc = true;
      else if (pads[i].q < 0) hasSnk = true;
    }
    if (!hasSrc || !hasSnk) return null;
    var bb = null;
    for (var p = 0; p < clipPolys.length; p++) {
      var pb = clipPolys[p].getBBox();
      bb = bb
        ? {
            x: Math.min(bb.x, pb.x),
            y: Math.min(bb.y, pb.y),
            x2: Math.max(bb.x2, pb.x + pb.width),
            y2: Math.max(bb.y2, pb.y + pb.height),
          }
        : { x: pb.x, y: pb.y, x2: pb.x + pb.width, y2: pb.y + pb.height };
    }
    if (!bb) return null;
    var nx = Math.max(2, Math.min(420, Math.ceil((bb.x2 - bb.x) / DT_CELL)));
    var ny = Math.max(2, Math.min(420, Math.ceil((bb.y2 - bb.y) / DT_CELL)));
    var cellX = (bb.x2 - bb.x) / nx;
    var cellY = (bb.y2 - bb.y) / ny;
    var mask = new Uint8Array(nx * ny);
    var inj = new Float64Array(nx * ny);
    for (var j = 0; j < ny; j++) {
      for (var i2 = 0; i2 < nx; i2++) {
        var px = bb.x + (i2 + 0.5) * cellX;
        var py = bb.y + (j + 0.5) * cellY;
        for (var p2 = 0; p2 < clipPolys.length; p2++) {
          if (clipPolys[p2].isPointInFill(new DOMPoint(px, py))) {
            mask[j * nx + i2] = 1;
            break;
          }
        }
      }
    }
    var cellAt = function (x, y) {
      // nearest masked cell within a small radius of (x, y)
      var ci = Math.floor((x - bb.x) / cellX);
      var cj = Math.floor((y - bb.y) / cellY);
      for (var r = 0; r <= 2; r++) {
        for (var dj = -r; dj <= r; dj++) {
          for (var di = -r; di <= r; di++) {
            var ii = ci + di, jj = cj + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            if (mask[jj * nx + ii]) return jj * nx + ii;
          }
        }
      }
      return -1;
    };
    var refIdx = -1, refQ = 0;
    for (var k = 0; k < pads.length; k++) {
      var idx = cellAt(pads[k].x, pads[k].y);
      if (idx < 0) continue;
      inj[idx] += pads[k].q;
      if (pads[k].q < 0 && pads[k].q < refQ) {
        refQ = pads[k].q;
        refIdx = idx;
      }
    }
    if (refIdx < 0) return null;
    // SOR over the sheet network: Σ(Vn − Vc)/Rs = Ic → Vc = (ΣVn − Ic·Rs)/n
    var V = new Float64Array(nx * ny);
    var omega = 1.8;
    for (var iter = 0; iter < 3000; iter++) {
      var maxDelta = 0;
      for (var pass = 0; pass < 2; pass++) {
        for (var j2 = 0; j2 < ny; j2++) {
          for (var i3 = 0; i3 < nx; i3++) {
            var c = j2 * nx + i3;
            if (!mask[c] || c === refIdx || ((i3 + j2) & 1) !== pass) continue;
            var s = 0, n = 0;
            if (i3 > 0 && mask[c - 1]) { s += V[c - 1]; n++; }
            if (i3 < nx - 1 && mask[c + 1]) { s += V[c + 1]; n++; }
            if (j2 > 0 && mask[c - nx]) { s += V[c - nx]; n++; }
            if (j2 < ny - 1 && mask[c + nx]) { s += V[c + nx]; n++; }
            if (!n) continue;
            var nv = (s - inj[c] * DT_RS) / n;
            var d = nv - V[c];
            V[c] += omega * d;
            if (d > maxDelta) maxDelta = d;
            else if (-d > maxDelta) maxDelta = -d;
          }
        }
      }
      if (maxDelta < 1e-10) break;
    }
    // per-cell current density J = |∇V|/Rs (A per mm of width) and the
    // equivalent-conductor ΔT for a strip one cell wide
    var cells = new Float32Array(nx * ny);
    var cellQ = new Float32Array(nx * ny); // W per cell — board-solve source
    for (var j3 = 0; j3 < ny; j3++) {
      for (var i4 = 0; i4 < nx; i4++) {
        var c2 = j3 * nx + i4;
        if (!mask[c2]) continue;
        var vl = i4 > 0 && mask[c2 - 1] ? V[c2 - 1] : V[c2];
        var vr = i4 < nx - 1 && mask[c2 + 1] ? V[c2 + 1] : V[c2];
        var vu = j3 > 0 && mask[c2 - nx] ? V[c2 - nx] : V[c2];
        var vd = j3 < ny - 1 && mask[c2 + nx] ? V[c2 + nx] : V[c2];
        var jx = (vr - vl) / (2 * DT_RS * cellX);
        var jy = (vd - vu) / (2 * DT_RS * cellY);
        var mag = Math.hypot(jx, jy);
        cells[c2] = dtFromI(mag * cellX, cellX);
        // copper loss per area J²·Rs, per cell (mm² → m² for W)
        cellQ[c2] = (mag * mag * DT_RS) * (cellX * cellY * 1e-6);
      }
    }
    // heat image, hidden until the thermal view opens (the board group's
    // scale(1,-1) flips y — paint raster rows bottom-up to compensate)
    var canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('x', bb.x);
    img.setAttribute('y', bb.y);
    img.setAttribute('width', bb.x2 - bb.x);
    img.setAttribute('height', bb.y2 - bb.y);
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('clip-path', 'url(#pcba-sch-pourclip)');
    img.setAttribute('pointer-events', 'none');
    img.style.display = 'none';
    var boardG = viewGroups.schematic.querySelector('#sch-board');
    if (boardG) boardG.insertBefore(img, boardG.firstChild);
    return {
      img: img,
      canvas: canvas,
      nx: nx,
      ny: ny,
      bb: bb,
      cellX: cellX,
      cellY: cellY,
      mask: mask,
      cells: cells,
      q: cellQ,
    };
  }
  function paintPour(pour, hi) {
    var ctx = pour.canvas.getContext('2d');
    var data = ctx.createImageData(pour.nx, pour.ny);
    for (var j = 0; j < pour.ny; j++) {
      for (var i = 0; i < pour.nx; i++) {
        var c = j * pour.nx + i;
        var o = ((pour.ny - 1 - j) * pour.nx + i) * 4; // y-flip
        var dt = pour.cells[c];
        if (!pour.mask[c] || !(dt > 0)) continue;
        var t = hi > 0 ? Math.min(dt / hi, 1) : 0;
        var rgb = dtHexRGB(dtColor(dt, hi));
        data.data[o] = rgb[0];
        data.data[o + 1] = rgb[1];
        data.data[o + 2] = rgb[2];
        data.data[o + 3] = Math.round(255 * (0.55 + 0.45 * t));
      }
    }
    ctx.putImageData(data, 0, 0);
    pour.img.setAttribute('href', pour.canvas.toDataURL());
  }
  function applyThermalColors() {
    if (!dtItems) return;
    var marginBox = document.getElementById('dt-margin');
    var allowBox = document.getElementById('dt-allowed');
    var margin = marginBox && marginBox.checked;
    var allowed = allowBox ? parseFloat(allowBox.value) || 20 : 20;
    var hi = margin && allowed > 0 ? allowed : dtItems.maxDT;
    // monochrome copper first: everything not carrying solved current reads
    // as inert graphite-copper (pads/regions included — their electrical
    // heat-map colors don't belong on the thermal board)
    var copper = viewGroups.schematic.querySelector('#sch-copper');
    var neutral = copper ? copper.querySelectorAll('[data-net]') : [];
    for (var n = 0; n < neutral.length; n++) {
      if (neutral[n].getAttribute('data-sub')) continue; // layer indication stays
      var f = neutral[n].getAttribute('fill');
      if (f && f !== 'none') neutral[n].setAttribute('fill', '#3f444a');
      var st = neutral[n].getAttribute('stroke');
      if (st && st !== 'none') neutral[n].setAttribute('stroke', '#3f444a');
    }
    for (var i = 0; i < dtItems.wires.length; i++) {
      var wr = dtItems.wires[i];
      // secondary-layer wires carry solved current too — they take the
      // thermal ramp like any wire (their black stripes read over warm
      // colors; exitThermal restores the layer-indication gray)
      // zero-current wires read as cold copper, not as "cool"
      wr.el.setAttribute('stroke', wr.dt > 0 ? dtColor(wr.dt, hi) : '#454b52');
    }
    for (var p = 0; p < dtItems.pours.length; p++) paintPour(dtItems.pours[p], hi);
    // via pads color like wires — their ring IS the hotspot indicator
    for (var v = 0; v < dtItems.vias.length; v++) {
      var vv = dtItems.vias[v];
      var vc = vv.dt > 0 ? dtColor(vv.dt, hi) : '#454b52';
      var vf = vv.el.getAttribute('fill');
      if (vf && vf !== 'none') vv.el.setAttribute('fill', vc);
      var vs = vv.el.getAttribute('stroke');
      if (vs && vs !== 'none') vv.el.setAttribute('stroke', vc);
    }
    fillLegend('dt', DT_STOPS, 0, hi, '°C');
    var ambBox = document.getElementById('dt-ambient');
    var amb = ambBox ? parseFloat(ambBox.value) || 25 : 25;
    var abs = document.getElementById('dt-abs');
    if (abs)
      abs.textContent =
        'hottest copper \u2248 ' +
        (amb + dtItems.maxDT).toFixed(1) +
        '\u00B0C at ' +
        amb +
        '\u00B0C ambient' +
        dtItems.viaNote +
        (boardTemp ? ' \u00B7 board \u2248 +' + boardTemp.max.toFixed(1) + '\u00B0C (FR4)' : '');
  }
  function buildThermal() {
    if (dtBuilt || !viewGroups.schematic || !netOp || !netOp.solved || !netOp.branches) return;
    dtBuilt = true;
    var copper = viewGroups.schematic.querySelector('#sch-copper');
    if (!copper) return;
    var wires = [];
    var els = copper.querySelectorAll('[data-net]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tg = el.tagName.toLowerCase();
      if (tg !== 'path' && tg !== 'polyline' && tg !== 'line') continue;
      var dd = el.getAttribute('d');
      if (dd && dd.indexOf('Z') !== -1) continue;
      var cur = el.__edgeCur;
      if (cur === undefined) continue; // not part of the solved route graph
      // data-w carries the real width — centerline-rendered deeper layers
      // thin their visible stroke
      var w = parseFloat(el.getAttribute('data-w') || el.getAttribute('stroke-width')) || 0.2;
      wires.push({ el: el, dt: dtFromI(Math.abs(cur), w) });
    }
    // pours: the hatch clip holds the fill polygons; its stroked lines and
    // the closed region outlines carry the zone's net
    var clip = viewGroups.schematic.querySelector('#pcba-sch-pourclip');
    var clipPolys = clip ? Array.prototype.slice.call(clip.querySelectorAll('path')) : [];
    var pourNets = {};
    var hatchLines = viewGroups.schematic.querySelectorAll('g[clip-path="url(#pcba-sch-pourclip)"] [data-net]');
    for (var h = 0; h < hatchLines.length; h++) pourNets[hatchLines[h].getAttribute('data-net')] = true;
    for (var el2 = 0; el2 < els.length; el2++) {
      var e2 = els[el2];
      if (e2.tagName.toLowerCase() !== 'path') continue;
      var d2 = e2.getAttribute('d') || '';
      if (d2.indexOf('Z') === -1) continue;
      pourNets[e2.getAttribute('data-net')] = true;
    }
    var pours = [];
    if (clipPolys.length) {
      for (var pnet in pourNets) {
        var pour = solvePourDT(copper, pnet, clipPolys);
        if (pour) pours.push(pour);
      }
    }
    // vias: netted copper pads with no component ref (small, closed — not
    // wires). Actual current is an equal share of the net's total injection
    // (documented assumption — a coupled two-layer pour solve would compute
    // the true split). Drill from the smallest rendered drill mark inside
    // the pad, else estimated from the annulus.
    var vias = [];
    var viaNets = {};
    var seenViaKeys = {};
    for (var v = 0; v < els.length; v++) {
      var ve = els[v];
      if (ve.getAttribute('data-ref')) continue;
      var vtg = ve.tagName.toLowerCase();
      if (vtg === 'path' || vtg === 'polyline' || vtg === 'line') continue;
      var vn = ve.getAttribute('data-net');
      if (!vn) continue;
      var vbb = ve.getBBox();
      if (vbb.width > 1.2 || vbb.height > 1.2) continue;
      // one via flashes on every layer it spans — dedupe by position
      var vkey = Math.round(vbb.x * 20) / 20 + ',' + Math.round(vbb.y * 20) / 20;
      if (seenViaKeys[vkey]) continue;
      seenViaKeys[vkey] = 1;
      if (!viaNets[vn]) viaNets[vn] = [];
      viaNets[vn].push(ve);
    }
    var drillMarks = viewGroups.schematic.querySelectorAll('circle');
    var viaNote = '';
    for (var vn2 in viaNets) {
      var ventries = netOp.branches[vn2.toLowerCase()];
      if (!ventries) continue;
      var vsum = {}, vtot = 0;
      for (var q = 0; q < ventries.length; q++) {
        var vk = ventries[q].ref + '|' + ventries[q].pin;
        vsum[vk] = (vsum[vk] || 0) + ventries[q].i;
      }
      for (var vk2 in vsum) if (vsum[vk2] > 0) vtot += vsum[vk2];
      if (!(vtot > 0)) continue;
      var share = vtot / viaNets[vn2].length;
      // preferred: the SOLVED barrel current from the flow network; the
      // equal-split share is only the fallback for vias it couldn't stitch
      var anySolved = false;
      for (var v2 = 0; v2 < viaNets[vn2].length; v2++) {
        if (viaNets[vn2][v2].__viaCur !== undefined) anySolved = true;
      }
      viaNote += viaNote ? ' · ' : ' · ';
      viaNote += anySolved
        ? viaNets[vn2].length + ' ' + vn2 + ' via' + (viaNets[vn2].length > 1 ? 's carry solved currents' : ' carries solved current')
        : viaNets[vn2].length + ' ' + vn2 + ' via' + (viaNets[vn2].length > 1 ? 's' : '') + ' share ' + fmtEng(vtot) + 'A equally';
      for (var v2 = 0; v2 < viaNets[vn2].length; v2++) {
        var vel = viaNets[vn2][v2];
        var vb = vel.getBBox();
        var vc = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
        var drill = 0;
        for (var d = 0; d < drillMarks.length; d++) {
          var dm = drillMarks[d];
          var ddx = +dm.getAttribute('cx') - vc.x, ddy = +dm.getAttribute('cy') - vc.y;
          if (ddx * ddx + ddy * ddy < 0.09) {
            var dr = (+dm.getAttribute('r') || 0) * 2;
            if (dr > 0.05 && (drill === 0 || dr < drill)) drill = dr;
          }
        }
        if (!drill) drill = Math.max(0.1, Math.max(vb.width, vb.height) - 0.3);
        // solved barrel current when the network stitched this via
        var act = vel.__viaCur;
        var iVia = act !== undefined ? Math.abs(act) : share;
        vias.push({ el: vel, dt: dtViaFromI(iVia, drill) });
      }
    }
    var maxDT = 0;
    for (var w2 = 0; w2 < wires.length; w2++) if (wires[w2].dt > maxDT) maxDT = wires[w2].dt;
    for (var p2 = 0; p2 < pours.length; p2++) {
      var pc = pours[p2].cells;
      for (var c = 0; c < pc.length; c++) if (pc[c] > maxDT) maxDT = pc[c];
    }
    for (var v3 = 0; v3 < vias.length; v3++) if (vias[v3].dt > maxDT) maxDT = vias[v3].dt;
    dtItems = { wires: wires, pours: pours, vias: vias, viaNote: viaNote, maxDT: maxDT };
    dtReady = wires.length > 0 || pours.length > 0 || vias.length > 0;
  }
  function enterThermal() {
    var paper = document.getElementById('sch-paper');
    if (paper) paper.setAttribute('fill', '#26292d');
    // the substrate too — a light board washes out the pour heat image
    var fill = document.getElementById('sch-board-fill');
    if (fill) fill.setAttribute('fill', '#31363b');
    var comps = viewGroups.schematic.querySelector('#sch-components');
    if (comps) comps.style.display = 'none';
    var ov = document.getElementById('sch-power-overlay');
    if (ov) ov.style.display = 'none';
    var hatch = viewGroups.schematic.querySelector('g[clip-path="url(#pcba-sch-pourclip)"]');
    if (hatch) hatch.style.display = 'none';
    if (dtItems) {
      for (var p = 0; p < dtItems.pours.length; p++) dtItems.pours[p].img.style.display = '';
      applyThermalColors();
    }
    // the board (FR4) temperature field under everything
    buildBoardTemp();
    if (boardTemp) boardTemp.img.style.display = '';
  }
  function exitThermal() {
    var paper = document.getElementById('sch-paper');
    if (paper) paper.setAttribute('fill', '#ffffff');
    var fill = document.getElementById('sch-board-fill');
    if (fill) fill.setAttribute('fill', '#f3f4f6');
    var comps = viewGroups.schematic.querySelector('#sch-components');
    if (comps) comps.style.display = '';
    var ov = document.getElementById('sch-power-overlay');
    if (ov) ov.style.display = '';
    var hatch = viewGroups.schematic.querySelector('g[clip-path="url(#pcba-sch-pourclip)"]');
    if (hatch) hatch.style.display = '';
    if (dtItems) {
      for (var p = 0; p < dtItems.pours.length; p++) dtItems.pours[p].img.style.display = 'none';
    }
    if (boardTemp) boardTemp.img.style.display = 'none';
    // back to the electrical trace colors
    applyVoltageColors();
    // and the secondary layers back to their indication gray (the voltage
    // map skips them, so their thermal ramp color would otherwise linger)
    var copper2 = viewGroups.schematic.querySelector('#sch-copper');
    if (copper2) {
      var subs = copper2.querySelectorAll('[data-sub]');
      for (var s2 = 0; s2 < subs.length; s2++) subs[s2].setAttribute('stroke', '#b6bcc4');
    }
  }
  ['dt-margin', 'dt-allowed'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', applyThermalColors);
    if (el) el.addEventListener('change', applyThermalColors);
  });
  var dtAmbient = document.getElementById('dt-ambient');
  if (dtAmbient) dtAmbient.addEventListener('input', applyThermalColors);

  // ---- board (FR4) temperature: the copper-loss map heats the laminate —
  // a stacked two-layer steady-state solve, degrees ABOVE ambient. Sources
  // are the solved wire/via/pour losses; conduction is copper in-plane
  // (k·t ≈ 0.014 W/K per square), FR4 in-plane and through-plane, and via
  // barrels between layers; both faces convect+radiate to ambient
  // (h ≈ 12 W/m²·K, still air, both faces exposed). Copper cells are left
  // unpainted — a raster-pixel gap keeps the traces readable over the
  // board coloring. Idealized: no enclosure, mounting, airflow, or
  // component self-heating (a copper-loss floor, not a full thermal model).
  var boardTemp = null; // {img, max}
  var BD = {
    cell: 1.2, // mm raster — thermal gradients are smooth
    cuSheet: 400 * 35e-6, // W/K per square, copper layer
    fr4In: 0.8 * 1.6e-3, // in-plane W/K per square, full thickness
    fr4Z: 0.3 * 1e-6 / 1.53e-3, // through-plane W/K per mm²
    h: 12 * 1e-6, // W/K per mm², both faces
    viaG: (400 * Math.PI * 0.153 * 35e-6) / 1.6e-3, // barrel, W/K
  };
  function buildBoardTemp() {
    if (boardTemp || !dtItems || !viewGroups.schematic) return;
    var fill = document.getElementById('sch-board-fill');
    if (!fill) return;
    var bb = fill.getBBox();
    var nx = Math.max(2, Math.min(160, Math.ceil(bb.width / BD.cell)));
    var ny = Math.max(2, Math.min(160, Math.ceil(bb.height / BD.cell)));
    var cx = bb.width / nx, cy = bb.height / ny;
    var inBoard = new Uint8Array(nx * ny);
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        inBoard[j * nx + i] = fill.isPointInFill(
          new DOMPoint(bb.x + (i + 0.5) * cx, bb.y + (j + 0.5) * cy),
        )
          ? 1
          : 0;
      }
    }
    // copper marks + heat sources per layer (top / bottom by data-sub)
    var cu = [new Uint8Array(nx * ny), new Uint8Array(nx * ny)];
    var S = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var cellAt = function (x, y) {
      var ci = Math.floor((x - bb.x) / cx);
      var cj = Math.floor((y - bb.y) / cy);
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) return -1;
      var c = cj * nx + ci;
      return inBoard[c] ? c : -1;
    };
    var copper = viewGroups.schematic.querySelector('#sch-copper');
    if (copper) {
      for (var w = 0; w < dtItems.wires.length; w++) {
        var el = dtItems.wires[w].el;
        var cur = el.__edgeCur || 0;
        var lw = parseFloat(el.getAttribute('data-w') || el.getAttribute('stroke-width')) || 0.2;
        var len = el.getTotalLength ? el.getTotalLength() : 0;
        if (!len) continue;
        var P = cur * cur * DT_RS * (len / lw); // I²R in W
        var li = el.hasAttribute('data-sub') ? 1 : 0;
        for (var s = 0; s <= len; s += Math.max(0.4, len / 24)) {
          var pt = el.getPointAtLength(Math.min(s, len));
          var c = cellAt(pt.x, pt.y);
          if (c < 0) continue;
          var steps = Math.max(1, Math.round(len / Math.max(0.4, len / 24)));
          S[li][c] += P / steps;
          cu[li][c] = 1;
          // gap: mark neighbors of the wire cell
          if (c % nx > 0) cu[li][c - 1] = cu[li][c - 1] || inBoard[c - 1];
          if (c % nx < nx - 1) cu[li][c + 1] = cu[li][c + 1] || inBoard[c + 1];
          if (c >= nx) cu[li][c - nx] = cu[li][c - nx] || inBoard[c - nx];
          if (c < nx * (ny - 1)) cu[li][c + nx] = cu[li][c + nx] || inBoard[c + nx];
        }
      }
      // vias: source + barrel coupling mark on both layers
      var vSeen = {};
      for (var v = 0, vEls = copper.querySelectorAll('[data-net]'); v < vEls.length; v++) {
        var vel = vEls[v];
        if (vel.getAttribute('data-ref') || vel.tagName.toLowerCase() === 'path') continue;
        var vb = vel.getBBox();
        if (vb.width > 1.2 || vb.height > 1.2) continue;
        var vk = Math.round(vb.x * 2) + ',' + Math.round(vb.y * 2);
        if (vSeen[vk]) continue;
        vSeen[vk] = 1;
        var vc2 = cellAt(vb.x + vb.width / 2, vb.y + vb.height / 2);
        if (vc2 < 0) continue;
        var vI = vel.__viaCur;
        var drill = 0.45 * Math.max(vb.width, vb.height);
        var Gb = (400 * Math.PI * drill * 35e-6) / 1.6e-3;
        var Pv = vI !== undefined ? vI * vI / Gb : 0;
        S[0][vc2] += Pv / 2;
        S[1][vc2] += Pv / 2;
        cu[0][vc2] = 1;
        cu[1][vc2] = 1;
      }
    }
    // pour losses (split half to each layer — the zone spans both)
    for (var p = 0; p < dtItems.pours.length; p++) {
      var po = dtItems.pours[p];
      for (var pc = 0; pc < po.q.length; pc++) {
        if (!po.mask[pc] || !po.q[pc]) continue;
        // map pour cell center into board grid
        var pj = Math.floor(pc / po.nx);
        var pi = pc % po.nx;
        var px = po.bb.x + (pi + 0.5) * po.cellX;
        var py = po.bb.y + (pj + 0.5) * po.cellY;
        var bc = cellAt(px, py);
        if (bc < 0) continue;
        S[0][bc] += po.q[pc] / 2;
        S[1][bc] += po.q[pc] / 2;
        cu[0][bc] = cu[0][bc] || po.mask[pc];
        cu[1][bc] = cu[1][bc] || po.mask[pc];
      }
    }
    // steady-state SOR over T[2][n], ambient = 0
    var T = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var gCuXY = BD.cuSheet; // per edge (cell edge length/size cancels)
    var gFr4XY = BD.fr4In;
    var gZ = BD.fr4Z * cx * cy * 1e6 * 1e-6; // W/K per cell: k_z·A/t with mm²→m²
    gZ = (0.3 * (cx * cy * 1e-6)) / 1.53e-3;
    var gFace = BD.h * cx * cy; // h·A (mm²·1e-6 folded into h)
    gFace = 12 * (cx * cy * 1e-6);
    for (var it = 0; it < 2500; it++) {
      var md = 0;
      for (var L = 0; L < 2; L++) {
        for (var c3 = 0; c3 < nx * ny; c3++) {
          if (!inBoard[c3]) continue;
          var sum = S[L][c3];
          var gsum = 2 * gFace; // two faces convect
          var i5 = c3 % nx;
          var nb;
          nb = i5 > 0 ? c3 - 1 : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g1 = cu[L][c3] && cu[L][nb] ? gCuXY : gFr4XY;
            sum += g1 * T[L][nb];
            gsum += g1;
          }
          nb = i5 < nx - 1 ? c3 + 1 : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g2 = cu[L][c3] && cu[L][nb] ? gCuXY : gFr4XY;
            sum += g2 * T[L][nb];
            gsum += g2;
          }
          nb = c3 >= nx ? c3 - nx : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g3 = cu[L][c3] && cu[L][nb] ? gCuXY : gFr4XY;
            sum += g3 * T[L][nb];
            gsum += g3;
          }
          nb = c3 < nx * (ny - 1) ? c3 + nx : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g4 = cu[L][c3] && cu[L][nb] ? gCuXY : gFr4XY;
            sum += g4 * T[L][nb];
            gsum += g4;
          }
          sum += gZ * T[1 - L][c3];
          gsum += gZ;
          var nv = sum / gsum;
          var dd = nv - T[L][c3];
          T[L][c3] += 1.7 * dd;
          if (dd > md) md = dd;
          else if (-dd > md) md = -dd;
        }
      }
      if (md < 1e-4) break;
    }
    // paint: max across layers, copper cells left clear (the pixel gap)
    var maxT = 0;
    for (var c4 = 0; c4 < nx * ny; c4++) {
      if (!inBoard[c4]) continue;
      var tv = Math.max(T[0][c4], T[1][c4]);
      if (tv > maxT) maxT = tv;
    }
    var cv = document.createElement('canvas');
    cv.width = nx;
    cv.height = ny;
    var ctx = cv.getContext('2d');
    var data = ctx.createImageData(nx, ny);
    for (var j2 = 0; j2 < ny; j2++) {
      for (var i6 = 0; i6 < nx; i6++) {
        var c5 = j2 * nx + i6;
        var o = ((ny - 1 - j2) * nx + i6) * 4; // y-flip for the board group
        if (!inBoard[c5]) continue;
        if (cu[0][c5] || cu[1][c5]) continue; // the gap
        var tv2 = Math.max(T[0][c5], T[1][c5]);
        if (tv2 <= 0.01) continue;
        var rgb = dtHexRGB(dtColor(tv2, Math.max(maxT, 0.5)));
        data.data[o] = rgb[0];
        data.data[o + 1] = rgb[1];
        data.data[o + 2] = rgb[2];
        data.data[o + 3] = Math.round(255 * 0.5);
      }
    }
    ctx.putImageData(data, 0, 0);
    var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('id', 'sch-board-temp');
    img.setAttribute('x', bb.x);
    img.setAttribute('y', bb.y);
    img.setAttribute('width', bb.width);
    img.setAttribute('height', bb.height);
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('pointer-events', 'none');
    img.setAttribute('href', cv.toDataURL());
    img.style.display = 'none';
    var bf = document.getElementById('sch-board-fill');
    if (bf && bf.parentNode) bf.parentNode.insertBefore(img, bf.nextSibling);
    boardTemp = { img: img, max: maxT };
  }

  // ---- pcba theme picker: remap the embedded render's flat colors ----
  // one render serves every theme — the surface colors are plain attribute
  // values, so switching walks the pcba group once and rewrites fill/stroke
  // through a from->to map. Mask-luminance ink (inside <mask>) is skipped:
  // it must stay black/white regardless of theme.
  var pcbaThemeSel = document.getElementById('pcba-theme');
  var pcbaThemeData = null;
  try { pcbaThemeData = JSON.parse(document.getElementById('pcba-themes').textContent); } catch (e) {}
  var pcbaColorsNow = pcbaThemeData ? pcbaThemeData.default : null;
  function applyPcbaTheme(id) {
    if (!pcbaThemeData || !pcbaThemeData.themes[id] || !pcbaColorsNow || !viewGroups.pcba) return;
    var to = pcbaThemeData.themes[id];
    var map = {};
    for (var key in pcbaColorsNow) {
      if (pcbaColorsNow[key] && to[key] && pcbaColorsNow[key] !== to[key]) map[pcbaColorsNow[key]] = to[key];
    }
    clearNetHighlight();
    var els = viewGroups.pcba.querySelectorAll('[fill],[stroke]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest && els[i].closest('mask')) continue;
      var f = els[i].getAttribute('fill');
      if (f && map[f]) els[i].setAttribute('fill', map[f]);
      var st = els[i].getAttribute('stroke');
      if (st && map[st]) els[i].setAttribute('stroke', map[st]);
    }
    pcbaColorsNow = to;
    if (pcbaThemeSel) pcbaThemeSel.value = id;
    try {
      var state = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
      state.__pcbaTheme = id;
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch (e) {}
  }
  if (pcbaThemeSel) pcbaThemeSel.addEventListener('change', function () { applyPcbaTheme(pcbaThemeSel.value); });

  function apply() {
    panzoom.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    renderMeasure();
    renderDrc();
    scheduleSaveView();
  }
  // The viewport survives reloads (the vscode panel reloads on every build) — stored under a reserved key next to the layer
  // settings. Throttled: wheel zoom fires apply() far faster than a save
  // needs to happen.
  var saveViewTimer = null;
  function scheduleSaveView() {
    if (saveViewTimer) return;
    saveViewTimer = setTimeout(function () {
      saveViewTimer = null;
      try {
        var state = {};
        try {
          state = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
        } catch (e) {
          state = {};
        }
        state.__view = { k: k, tx: tx, ty: ty };
        localStorage.setItem(storeKey, JSON.stringify(state));
      } catch (e) {
        /* private mode etc. — the view just won't persist */
      }
    }, 200);
  }
  function clientToView(pt) {
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var p = svg.createSVGPoint();
    p.x = pt.x; p.y = pt.y;
    p = p.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function viewCenter() {
    var box = svg.getBoundingClientRect();
    return clientToView({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }
  function zoomAt(pt, factor) {
    var nk = Math.min(5000, Math.max(0.02, k * factor));
    if (nk === k) return;
    tx = pt.x - (pt.x - tx) * (nk / k);
    ty = pt.y - (pt.y - ty) * (nk / k);
    k = nk;
    apply();
  }
  function fit() { k = 1; tx = 0; ty = 0; apply(); }

  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var factor = Math.pow(1.0015, -ev.deltaY);
    zoomAt(clientToView({ x: ev.clientX, y: ev.clientY }), factor);
  }, { passive: false });

  var drag = null;
  svg.addEventListener('mousedown', function (ev) {
    drag = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty, moved: false };
  });
  window.addEventListener('mousemove', function (ev) {
    if (drag) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 3) drag.moved = true;
      var a = clientToView({ x: drag.x, y: drag.y });
      var b = clientToView({ x: ev.clientX, y: ev.clientY });
      tx = drag.tx + (b.x - a.x);
      ty = drag.ty + (b.y - a.y);
      apply();
    } else if (ev.target && svg.contains(ev.target)) {
      mouseBoard = boardCoords(ev);
      if (measuring && measureStart) {
        if (ev.shiftKey) mouseBoard = snapToAngles(measureStart, mouseBoard);
        renderMeasure();
      }
      var v = clientToView({ x: ev.clientX, y: ev.clientY });
      var bx = (v.x - tx) / k;
      // Board (KiCad/typeCAD) coordinates, y-down — the same numbers a
      // component's pcb placement uses. Gerber space is y-up, so the viewBox
      // y (post-yflip) reads directly; negating here would report the
      // pre-flip gerber value and show every position mirrored.
      var by = (v.y - ty) / k;
      if (!statusLocked()) {
        statusEl.textContent =
          (probe ? probe + '   ' : '') +
          bx.toFixed(3) + ', ' + by.toFixed(3) + ' ' + units + '   zoom ' + k.toFixed(2) + 'x';
      }
    }
  });
  window.addEventListener('mouseup', function (ev) {
    if (drag && !drag.moved && measuring) {
      // undo the sub-threshold pan so the ruler point lands where clicked
      tx = drag.tx;
      ty = drag.ty;
      apply();
      var p = boardCoords(ev);
      if (!measureStart) {
        measureStart = p; // first click: start measuring
      } else {
        if (ev.shiftKey) p = snapToAngles(measureStart, p);
        rulers.push({ ax: measureStart.x, ay: measureStart.y, bx: p.x, by: p.y });
        measureStart = null; // second click: stick the ruler, next click starts anew
      }
      renderMeasure();
    } else if (drag && !drag.moved && ev.target && svg.contains(ev.target)) {
      // plain click (ruler not armed): probe for net/component highlighting
      var el = ev.target.closest ? ev.target.closest('[data-net],[data-ref]') : null;
      if (el) {
        var net = el.getAttribute('data-net');
        var ref = el.getAttribute('data-ref');
        if (net && highlightNet('data-net', net)) {
          if (!statusLocked()) statusEl.textContent = 'net ' + net + ' — Esc or click empty space to clear';
        } else if (ref && highlightNet('data-ref', ref)) {
          if (!statusLocked()) statusEl.textContent = ref + ' — Esc or click empty space to clear';
        }
      } else if (netDimmed.length) {
        clearNetHighlight();
      }
    }
    drag = null;
  });

  // Measurement tool: arm with the ruler button, click start, move to see the
  // live dimension, click end to stick the ruler. Rulers accumulate; Escape
  // cancels the in-progress one, clears them all and disarms the tool.
  var measureGroup = document.getElementById('measure');
  var measureBtn = document.getElementById('btn-measure');
  var measuring = false;
  var rulers = [];
  var measureStart = null;
  var mouseBoard = null;

  function boardCoords(ev) {
    var v = clientToView({ x: ev.clientX, y: ev.clientY });
    return { x: (v.x - tx) / k, y: -((v.y - ty) / k) };
  }
  // shift-snap: constrain the measured endpoint to 45-degree increments from
  // the start point (0/45/90/...), keeping the radial distance
  function snapToAngles(start, p) {
    var dx = p.x - start.x, dy = p.y - start.y;
    var angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    var len = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }
  // viewBox units are board millimeters, not pixels — convert a desired
  // screen-pixel size into local units via the fit scale, then divide by the
  // user zoom so rulers keep a constant on-screen size at any zoom level
  function unitsPerPx() {
    var rect = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    if (!rect.width || !rect.height || !vb.width || !vb.height) return 1;
    var fitScale = Math.min(rect.width / vb.width, rect.height / vb.height); // px per unit at k=1
    return 1 / fitScale;
  }
  function drawRuler(ax, ay, bx, by) {
    // the overlay group sits inside panzoom but outside the y-flip, so
    // board->svg is just y negation; s converts screen px to local units
    var x1 = ax, y1 = -ay, x2 = bx, y2 = -by;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    var px = len ? -dy / len : 0, py = len ? dx / len : 0; // unit perpendicular
    var s = unitsPerPx() / k;
    var t = 5 * s;
    var label =
      len.toFixed(3) + ' ' + units +
      '  (dx ' + Math.abs(bx - ax).toFixed(3) + ', dy ' + Math.abs(by - ay).toFixed(3) + ')';
    return (
      '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke-width="' + 1.5 * s + '"></line>' +
      '<line x1="' + (x1 - px * t) + '" y1="' + (y1 - py * t) + '" x2="' + (x1 + px * t) + '" y2="' + (y1 + py * t) + '" stroke-width="' + 1.5 * s + '"></line>' +
      '<line x1="' + (x2 - px * t) + '" y1="' + (y2 - py * t) + '" x2="' + (x2 + px * t) + '" y2="' + (y2 + py * t) + '" stroke-width="' + 1.5 * s + '"></line>' +
      '<circle cx="' + x1 + '" cy="' + y1 + '" r="' + 2 * s + '" fill="var(--measure)"></circle>' +
      '<text x="' + ((x1 + x2) / 2 + px * 11 * s) + '" y="' + ((y1 + y2) / 2 + py * 11 * s) +
      '" font-size="' + 16 * s + '" text-anchor="middle" dominant-baseline="middle">' + label + '</text>'
    );
  }
  function renderMeasure() {
    var out = '';
    for (var i = 0; i < rulers.length; i++) {
      out += drawRuler(rulers[i].ax, rulers[i].ay, rulers[i].bx, rulers[i].by);
    }
    if (measuring && measureStart && mouseBoard) {
      out += drawRuler(measureStart.x, measureStart.y, mouseBoard.x, mouseBoard.y);
    }
    measureGroup.innerHTML = out;
  }
  measureBtn.addEventListener('click', function () {
    measuring = !measuring;
    measureBtn.classList.toggle('armed', measuring);
    measureStart = null;
    renderMeasure();
  });
  // the px->unit conversion changes when the window resizes
  window.addEventListener('resize', renderMeasure);
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (measuring || measureStart || rulers.length) {
        measuring = false;
        measureStart = null;
        rulers = [];
        measureBtn.classList.remove('armed');
        renderMeasure();
      }
      if (netDimmed.length) clearNetHighlight();
    }
  });

  // ---- net highlighting + hover probing (X2 object attributes) ----
  var netDimmed = []; // elements dimmed by an active highlight, restored on clear
  var netWhitened = []; // matched elements painted pure white, restored on clear
  function clearNetHighlight() {
    for (var i = 0; i < netDimmed.length; i++) netDimmed[i].removeAttribute('opacity');
    netDimmed = [];
    for (var w = 0; w < netWhitened.length; w++) {
      var item = netWhitened[w];
      if (item.fill === null) item.el.removeAttribute('fill');
      else item.el.setAttribute('fill', item.fill);
      if (item.stroke === null) item.el.removeAttribute('stroke');
      else item.el.setAttribute('stroke', item.stroke);
      item.el.removeAttribute('opacity');
    }
    netWhitened = [];
  }
  function highlightNet(attr, value) {
    clearNetHighlight();
    var hits = svg.querySelectorAll('[' + attr + ']');
    var any = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].getAttribute(attr) !== value) {
        hits[i].setAttribute('opacity', '0.06');
        netDimmed.push(hits[i]);
      } else {
        any = true;
      }
    }
    if (!any) {
      clearNetHighlight();
      return false;
    }
    // dim un-attributed geometry too so the net stands out
    var groups = svg.querySelectorAll('#yflip > g');
    for (var g = 0; g < groups.length; g++) {
      var kind = groups[g].getAttribute('data-kind');
      if (kind === 'copper' && !groups[g].querySelector('[' + attr + '="' + value + '"]')) {
        var kids = groups[g].children;
        // NB: loop var must not be k — that is the zoom factor above
        for (var ki = 0; ki < kids.length; ki++) {
          if (!kids[ki].hasAttribute(attr)) {
            kids[ki].setAttribute('opacity', '0.06');
            netDimmed.push(kids[ki]);
          }
        }
      }
    }
    // the composite views dim per element, NOT whole groups: a dimmed group
    // composites its opacity over the matched elements inside it, which
    // made the clicked net FADE instead of pop. dimBelow walks past groups
    // that contain the match and dims only the unmatched leaves
    var dimBelow = function (el) {
      if (el.getAttribute && el.getAttribute(attr) === value) return; // the match stays bright
      if (el.querySelector('[' + attr + '="' + value + '"]')) {
        var sub = el.children;
        for (var s = 0; s < sub.length; s++) dimBelow(sub[s]);
        return;
      }
      el.setAttribute('opacity', '0.25');
      netDimmed.push(el);
    };
    var dimWhole = ['#view-pcba > #pcba-board', '#view-blueprint > #bp-board', '#view-schematic > #sch-board'];
    for (var d = 0; d < dimWhole.length; d++) {
      var boardGroup = svg.querySelector(dimWhole[d]);
      if (!boardGroup) continue;
      var kids = boardGroup.children;
      for (var p = 0; p < kids.length; p++) {
        if (kids[p].id === 'components') continue;
        dimBelow(kids[p]);
      }
    }
    // the matched copper reads BRIGHT against the dimmed board: pure white
    // on the blueprint paper; elsewhere the color copper already uses there
    // — resolved PER ELEMENT from its nearest filled ancestor group (the
    // gerber layer group, the pcba pads / copper-ghost wrappers), never a
    // global querySelector guess (document order finds the mask def's black
    // <g> first). Pads recolor, traces restroke; zone fills (region paths,
    // fill-rule evenodd) keep their color — a filled pour is just a board
    var hlScope = viewGroups[viewMode] || viewGroups.gerber || svg;
    var matched = hlScope.querySelectorAll('[' + attr + '="' + value + '"]');
    for (var m = 0; m < matched.length; m++) {
      var me = matched[m];
      if (me.tagName === 'path' && me.getAttribute('fill-rule') === 'evenodd') continue;
      var hlColor = '#ffffff';
      if (viewMode !== 'blueprint') {
        var anc = me.parentElement;
        while (anc && anc.tagName !== 'svg') {
          var af = anc.getAttribute('fill');
          if (af && af !== 'none') { hlColor = af; break; }
          anc = anc.parentElement;
        }
      }
      netWhitened.push({ el: me, fill: me.getAttribute('fill'), stroke: me.getAttribute('stroke') });
      if (me.tagName === 'use') me.setAttribute('fill', hlColor);
      else if (me.tagName === 'path') me.setAttribute('stroke', hlColor);
      me.setAttribute('opacity', '1');
    }
    return true;
  }
  var probe = '';
  svg.addEventListener('mousemove', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-net],[data-ref],[data-pin]') : null;
    var next = '';
    var ref = '';
    if (el) {
      var net = el.getAttribute('data-net');
      ref = el.getAttribute('data-ref') || '';
      var pin = el.getAttribute('data-pin');
      next = (net || '') + (ref ? (net ? ' · ' : '') + ref + (pin || '') : '');
    }
    // embedded surfaces (the vscode webview) install window.typecadVarFor:
    // ref -> the source variable that created the component, shown beside
    // the designator so the readout reads "R1 { source r1 }"
    if (ref && typeof window.typecadVarFor === 'function') {
      var vn = window.typecadVarFor(ref);
      if (vn) next += ' { source ' + vn + ' }';
    } else if (!ref && net && typeof window.typecadNetSource === 'function') {
      // a pure trace hover (net, no component): show where its net/route
      // was declared — "net2 { source board.ts:83 }"
      var nsrc = window.typecadNetSource(net);
      if (nsrc) next += ' { source ' + nsrc + ' }';
    }
    // ngspice operating point (the #net-op island, written by the
    // "typecad-pcb simulate" command): hovering a trace shows the net's DC
    // voltage and the connected devices' current/power —
    // "net2 · 3.3V · R1 1.2mA 3.9mW"
    if (net && netOp && netOp.solved && netOp.nets) {
      var vnet = netOp.nets[net.toLowerCase()];
      if (vnet !== undefined) {
        next += ' · ' + fmtEng(vnet) + 'V';
        if (netOp.devices) {
          var refs = {};
          var pads = svg.querySelectorAll('[data-net="' + net + '"][data-ref]');
          for (var pi = 0; pi < pads.length; pi++) refs[pads[pi].getAttribute('data-ref')] = true;
          var shown = 0;
          for (var pr in refs) {
            var d = netOp.devices[pr.toLowerCase()];
            if (!d || shown >= 2) continue;
            shown++;
            next += ' · ' + pr + ' ' + fmtEng(d.current) + 'A ' + fmtEng(d.power) + 'W';
          }
        }
      }
    }
    // hovering a component BODY (a ref with no net — the glyph shapes carry
    // only data-ref): show the device's own operating point, its solved
    // current and dissipated power
    if (!net && ref && netOp && netOp.solved && netOp.devices) {
      var dev = netOp.devices[ref.toLowerCase()];
      if (dev && (dev.current !== undefined || dev.power !== undefined)) {
        next += ' · ' + (dev.current !== undefined ? fmtEng(dev.current) + 'A' : '?');
        if (dev.power !== undefined) next += ' ' + fmtEng(dev.power) + 'W';
      }
    }
    if (next !== probe) {
      probe = next;
      // refresh the readout immediately so the probe appears without moving
      var box = svg.getBoundingClientRect();
      if (!drag) {
        var v = clientToView({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
        statusEl.textContent = statusEl.textContent; // placeholder; next move recomposes
      }
    }
  });

  // ---- component search: locate, zoom, flash ----
  // Also driven programmatically by window.typecadViewer.searchRefs (the
  // cross-probe API the vscode extension's injected client calls).
  function searchRefs(rawQuery) {
    var q = rawQuery.trim().toUpperCase();
    if (!q) return false;
    // scope to the active view: browsers return garbage geometry for
    // elements inside display:none subtrees, so a hidden pcba/blueprint
    // glyph would otherwise blow the zoom-to-component bbox up (thermal
    // shares the schematic group)
    var activeGroup = viewMode === 'thermal' ? viewGroups.schematic : viewGroups[viewMode];
    var scope = viewMode !== 'gerber' && activeGroup ? activeGroup : (viewGroups.gerber || svg);
    var all = scope.querySelectorAll('[data-ref]');
    var hits = [];
    for (var i = 0; i < all.length; i++) {
      var ref = (all[i].getAttribute('data-ref') || '').toUpperCase();
      if (ref === q || ref.indexOf(q) === 0) hits.push(all[i]);
    }
    if (!hits.length) {
      if (!statusLocked()) statusEl.textContent = '"' + q + '" not found';
      return false;
    }
    // getBBox is rendering-independent (unlike client rects, which can be
    // 0x0 for <use> flashes) but IGNORES the element's own transform — a
    // pcba glyph group sits at translate(centroid) rotate(angle), so its
    // local bbox would union with the pads' board-frame boxes and stretch
    // the fit from the origin to the part (the whole board reads as
    // "zoomed out very far"). boxInParent (hoisted above the search code)
    // folds each hit's own transform in first.
    // union in the parent (board) frame; boxes are sanity-checked against
    // the viewBox: anything larger than the whole board (browser artifacts
    // for hidden/unrendered content) is discarded.
    var vbSpan = Math.max(svg.viewBox.baseVal.width, svg.viewBox.baseVal.height);
    var bb = null;
    for (var j = 0; j < hits.length; j++) {
      var b;
      try {
        b = boxInParent(hits[j]);
      } catch (e) {
        continue;
      }
      if (!b.width && !b.height) continue;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
      if (b.width > vbSpan * 2 || b.height > vbSpan * 2) continue;
      if (!bb) bb = { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height };
      else {
        bb.x1 = Math.min(bb.x1, b.x);
        bb.y1 = Math.min(bb.y1, b.y);
        bb.x2 = Math.max(bb.x2, b.x + b.width);
        bb.y2 = Math.max(bb.y2, b.y + b.height);
      }
    }
    if (bb) {
      var vb = svg.viewBox.baseVal;
      var w = Math.max(bb.x2 - bb.x1, 1e-6);
      var h = Math.max(bb.y2 - bb.y1, 1e-6);
      // target zoom: the component fills ~1/3 of the canvas
      var fitK = Math.min(vb.width / w, vb.height / h) * 0.3;
      fitK = Math.min(5000, Math.max(0.02, fitK));
      var cx = (bb.x1 + bb.x2) / 2;
      var cy = (bb.y1 + bb.y2) / 2;
      tx = vb.x + vb.width / 2 - fitK * cx;
      ty = vb.y + vb.height / 2 + fitK * cy; // yflip: view = t + k*(-y)
      k = fitK;
      apply();
    }
    for (var f = 0; f < hits.length; f++) {
      hits[f].classList.remove('search-flash');
      hits[f].classList.add('search-flash');
      setTimeout((function (el) { return function () { el.classList.remove('search-flash'); }; })(hits[f]), 2700);
    }
    if (!statusLocked()) statusEl.textContent = hits.length + ' pad(s) of ' + hits[0].getAttribute('data-ref');
    return true;
  }
  document.getElementById('comp-search').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    searchRefs(ev.target.value);
  });

  // ---- DRC markers (injected by the build pipeline) ----
  var drcGroup = document.getElementById('drc');
  var drcBtn = document.getElementById('btn-drc');
  var drcData = [];
  try {
    drcData = JSON.parse(document.getElementById('drc-data').textContent) || [];
  } catch (e) {
    drcData = [];
  }
  function renderDrc() {
    if (!drcData.length) return;
    var s = unitsPerPx() / k;
    var out = '';
    for (var i = 0; i < drcData.length; i++) {
      var m = drcData[i];
      var y = -m.y;
      out +=
        '<g class="drc-mark"><circle class="outer" cx="' + m.x + '" cy="' + y + '" r="' + 11 * s + '" stroke-width="' + 1.5 * s + '"></circle>' +
        '<circle class="inner" cx="' + m.x + '" cy="' + y + '" r="' + 2 * s + '"></circle>' +
        '<title>' + m.description.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title></g>';
    }
    drcGroup.innerHTML = out;
  }
  if (drcData.length) {
    drcBtn.hidden = false;
    drcBtn.title = 'toggle ' + drcData.length + ' DRC marker(s)';
    renderDrc();
    drcBtn.addEventListener('click', function () {
      drcGroup.classList.toggle('hidden');
      drcBtn.classList.toggle('armed');
    });
  }

  // ---- export the current view as SVG / PNG ----
  // pixelScale (png export) stamps explicit pixel dimensions at the target
  // raster size — a unit-less viewBox-sized svg would decode at that tiny
  // intrinsic resolution and the canvas would just upscale the blur
  function exportSvgString(pixelScale) {
    var clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    var vb = svg.viewBox.baseVal;
    clone.setAttribute('width', vb.width * (pixelScale || 1));
    clone.setAttribute('height', vb.height * (pixelScale || 1));
    // theme: resolve the canvas/cut color and copy dark-mode recolors
    var canvas = getComputedStyle(document.getElementById('board-area')).backgroundColor;
    clone.setAttribute('style', '--bg:' + canvas);
    var extra = '';
    if (!document.body.classList.contains('light')) {
      extra +=
        '[data-kind="silkscreen"],[data-kind="paste"]{fill:#d6d6d6;}' +
        '[data-kind="silkscreen"] [stroke]:not([stroke="none"]),[data-kind="paste"] [stroke]:not([stroke="none"]){stroke:#d6d6d6 !important;}' +
        '[data-kind="silkscreen"] [fill]:not([fill="none"]),[data-kind="paste"] [fill]:not([fill="none"]){fill:#d6d6d6 !important;}' +
        '[data-kind="drill"]{fill:#2fbfae;}' +
        '[data-kind="drill"] [stroke]:not([stroke="none"]){stroke:#2fbfae !important;}' +
        '[data-kind="drill"] [fill]:not([fill="none"]){fill:#2fbfae !important;}';
    }
    // bake current element opacities (layer sliders + net highlight) into the clone
    var live = svg.querySelectorAll('[opacity]');
    var copy = clone.querySelectorAll('[opacity]');
    for (var i = 0; i < live.length && i < copy.length; i++) copy[i].setAttribute('opacity', live[i].getAttribute('opacity'));
    // bake the page-CSS-styled elements into explicit attributes: the
    // exported file has no page stylesheet, so class-only styling would
    // fall back to SVG defaults (black fills) — clear-polarity shapes must
    // keep showing the canvas color and DRC markers must keep their red
    var cuts = clone.querySelectorAll('.cut');
    for (var ci = 0; ci < cuts.length; ci++) {
      cuts[ci].setAttribute('fill', canvas);
      cuts[ci].setAttribute('stroke', canvas);
    }
    var outers = clone.querySelectorAll('.drc-mark circle.outer');
    for (var oi = 0; oi < outers.length; oi++) {
      outers[oi].setAttribute('fill', 'rgba(229, 72, 77, 0.22)');
      outers[oi].setAttribute('stroke', '#e5484d');
    }
    var inners = clone.querySelectorAll('.drc-mark circle.inner');
    for (var ii = 0; ii < inners.length; ii++) inners[ii].setAttribute('fill', '#e5484d');
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    bg.textContent = 'svg{background:' + canvas + ';}' + extra;
    clone.insertBefore(bg, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  document.getElementById('btn-svg').addEventListener('click', function () {
    download((document.title || 'board') + '.svg', new Blob([exportSvgString()], { type: 'image/svg+xml' }));
  });
  document.getElementById('btn-png').addEventListener('click', function () {
    var vb = svg.viewBox.baseVal;
    // target ~1600px on the long edge (never below 2x viewBox units): a
    // percentage-sized svg decodes at a tiny default intrinsic size, so the
    // export clone below carries EXPLICIT pixel dims — the vector is
    // rasterized at full export resolution instead of upscaled
    var scale = Math.max(2, Math.round(1600 / Math.max(vb.width, vb.height, 1)));
    var img = new Image();
    img.onerror = function () {
      // silent failure is the worst outcome for an export button
      if (statusEl && !statusLocked()) statusEl.textContent = 'png export failed — the board image could not be rasterized';
    };
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = vb.width * scale;
      canvas.height = vb.height * scale;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.getElementById('board-area')).backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (blob) download((document.title || 'board') + '.png', blob);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportSvgString(scale));
  });

  document.getElementById('btn-fit').addEventListener('click', fit);
  document.getElementById('btn-in').addEventListener('click', function () {
    zoomAt(viewCenter(), 1.3);
  });
  document.getElementById('btn-out').addEventListener('click', function () {
    zoomAt(viewCenter(), 1 / 1.3);
  });
  function setAll(on) {
    document.querySelectorAll('.layer-vis').forEach(function (cb) { cb.checked = on; syncLayer(cb); });
    persist();
  }
  document.getElementById('btn-all-on').addEventListener('click', function () { setAll(true); });
  document.getElementById('btn-all-off').addEventListener('click', function () { setAll(false); });

  function syncLayer(cb) {
    var row = cb.closest('.layer-row');
    var id = row.getAttribute('data-layer-id');
    var group = svg.querySelector('[data-layer-id="' + id + '"]');
    if (!group) return;
    if (cb.checked) group.removeAttribute('display');
    else group.setAttribute('display', 'none');
  }
  function syncOpacity(slider) {
    var row = slider.closest('.layer-row');
    var id = row.getAttribute('data-layer-id');
    var group = svg.querySelector('[data-layer-id="' + id + '"]');
    if (!group) return;
    // Writing opacity="1" over the default is not a no-op for rendering: it
    // can push the group onto its own compositing layer, which rasterizes
    // sub-pixel glyph fills differently (they balloon). Leave untouched
    // layers attribute-free so a settings-restore render matches a fresh
    // load byte for byte. A missing attribute means opacity 1.
    if ((group.getAttribute('opacity') ?? '1') !== slider.value) {
      group.setAttribute('opacity', slider.value);
    }
  }

  // Layer settings survive rebuilds: the vscode panel reloads the page on
  // every build, so visibility/opacity are kept in localStorage keyed per board and
  // re-applied here. Unknown/new layers fall back to their defaults; stale
  // saved entries are overwritten on the next persist.
  var storeKey = 'gerber-viewer:v1:' + document.title;
  var saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
  } catch (e) {
    saved = {};
  }
  function persist() {
    // read-merge-write: the viewport lives in this store too (__view) and
    // must survive a layer-settings save
    var state = {};
    try {
      state = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
    } catch (e) {
      state = {};
    }
    document.querySelectorAll('.layer-row').forEach(function (row) {
      state[row.getAttribute('data-layer-id')] = {
        visible: row.querySelector('.layer-vis').checked,
        opacity: parseFloat(row.querySelector('.layer-opacity').value),
      };
    });
    state.__view = { k: k, tx: tx, ty: ty };
    try {
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch (e) {
      /* private mode etc. — settings just won't persist */
    }
  }
  document.querySelectorAll('.layer-row').forEach(function (row) {
    var state = saved[row.getAttribute('data-layer-id')];
    if (!state) return;
    var cb = row.querySelector('.layer-vis');
    var slider = row.querySelector('.layer-opacity');
    if (typeof state.visible === 'boolean') cb.checked = state.visible;
    if (Number.isFinite(state.opacity)) slider.value = state.opacity;
    syncLayer(cb);
    syncOpacity(slider);
  });
  document.querySelectorAll('.layer-vis').forEach(function (cb) {
    cb.addEventListener('change', function () { syncLayer(cb); persist(); });
  });
  document.querySelectorAll('.layer-opacity').forEach(function (slider) {
    slider.addEventListener('input', function () { syncOpacity(slider); persist(); });
  });

  // restore the saved viewport (k/tx/ty) after the layer settings — apply()
  // then puts the reload back exactly where the last session was zoomed
  (function () {
    var view = saved.__view;
    if (!view || !Number.isFinite(view.k) || !Number.isFinite(view.tx) || !Number.isFinite(view.ty)) return;
    k = Math.min(5000, Math.max(0.02, view.k));
    tx = view.tx;
    ty = view.ty;
    apply();
  })();

  // restore the flow animation settings first — the view restore below runs
  // setView/flowStart, and a paused or re-scaled animation should load that
  // way from the first frame
  if (saved.__flowRate !== undefined && isFinite(saved.__flowRate)) {
    flowRate = saved.__flowRate;
    if (flowSpeedInput) flowSpeedInput.value = String(flowRate);
    if (flowSpeedVal) flowSpeedVal.textContent = flowRate.toFixed(1) + 'x';
  }
  if (flowToggle && saved.__flowOn === false) flowToggle.checked = false;
  // restore the last selected view (after the viewport, so fit state holds)
  if (saved.__viewMode && saved.__viewMode !== 'gerber') setView(saved.__viewMode);
  // and the last pcba theme (the embedded render starts on the default)
  if (saved.__pcbaTheme && saved.__pcbaTheme !== 'green-enig') applyPcbaTheme(saved.__pcbaTheme);

  window.addEventListener('keydown', function (ev) {
    if (ev.key === '0' || ev.key === 'f') fit();
    if (ev.key === '+') zoomAt(viewCenter(), 1.3);
    if (ev.key === '-') zoomAt(viewCenter(), 1 / 1.3);
  });

  // Dark/light theme: saved per browser (shared across boards); falls back to
  // the OS preference on first visit. The canvas follows the theme, and the
  // SVG's clear-polarity background var stays synced to the canvas color so
  // cutouts never show as boxes. Near-black layer colors (silkscreen, paste,
  // drill) are recolored for the dark canvas via the data-kind CSS rules.
  var THEME_KEY = 'gerber-viewer:theme:v1';
  var themeBtn = document.getElementById('btn-theme');
  var boardArea = document.getElementById('board-area');
  function applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
    // the button shows the mode you would switch to
    themeBtn.textContent = theme === 'light' ? '\u263E' : '\u2600';
    themeBtn.title = theme === 'light' ? 'switch to dark theme' : 'switch to light theme';
    svg.style.setProperty('--bg', getComputedStyle(boardArea).backgroundColor);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme !== 'light' && savedTheme !== 'dark') {
    savedTheme = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(savedTheme);
  themeBtn.addEventListener('click', function () {
    applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
  });

  // Embedding surface (the vscode extension's webview client calls these to
  // cross-probe: select a component from the editor, click a pad to jump
  // back). Absent in a plain browser tab; callers must feature-check.
  window.typecadViewer = {
    searchRefs: searchRefs,
    highlightNet: highlightNet,
    clearNetHighlight: clearNetHighlight,
  };
})();
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; font: 13px/1.4 system-ui, sans-serif; }
  body {
    display: flex;
    --chrome-bg: #1e1e1e;
    --chrome-fg: #ddd;
    --muted: #888;
    --chrome-border: #333;
    --row-hover: #2a2a2a;
    --btn-bg: #333;
    --btn-border: #444;
    --btn-hover: #444;
    --page: #16181d;
    --measure: #6db3f2;
  }
  body.light {
    --chrome-bg: #f7f7f7;
    --chrome-fg: #333;
    --muted: #666;
    --chrome-border: #ddd;
    --row-hover: #ebebeb;
    --btn-bg: #fff;
    --btn-border: #ccc;
    --btn-hover: #eee;
    --page: #ffffff;
    --measure: #0b62c4;
  }
  /* layers whose palette colors are near-black would vanish on the dark
     canvas — recolor them (and their sidebar chips) in dark theme; strokes
     and non-none fills carry explicit attributes, so override those too.
     stroke="none" must be excluded: region paths (TrueType text glyphs, pour
     outlines) carry it and would gain a 1-unit outline — ballooned glyphs */
  body:not(.light) #board [data-kind="silkscreen"],
  body:not(.light) #board [data-kind="paste"] {
    fill: #d6d6d6;
  }
  body:not(.light) #board [data-kind="silkscreen"] [stroke]:not([stroke='none']),
  body:not(.light) #board [data-kind='paste'] [stroke]:not([stroke='none']) {
    stroke: #d6d6d6 !important;
  }
  body:not(.light) #board [data-kind='silkscreen'] [fill]:not([fill='none']),
  body:not(.light) #board [data-kind='paste'] [fill]:not([fill='none']) {
    fill: #d6d6d6 !important;
  }
  body:not(.light) #board [data-kind='drill'] {
    fill: #2fbfae;
  }
  body:not(.light) #board [data-kind='drill'] [stroke]:not([stroke='none']) {
    stroke: #2fbfae !important;
  }
  body:not(.light) #board [data-kind='drill'] [fill]:not([fill='none']) {
    fill: #2fbfae !important;
  }
  /* clear-polarity shapes must always paint the canvas color, not the override */
  #board [data-kind] .cut { fill: var(--bg) !important; stroke: var(--bg) !important; }
  /* region fills (TrueType glyph outlines etc.) must never gain a stroke —
     stroking those outlines balloons the letters. The .cut rule above is more
     specific, so clear-polarity regions keep their canvas-color stroke. */
  #board path[fill-rule] { stroke: none !important; }
  body:not(.light) .layer-row[data-kind="silkscreen"] .chip,
  body:not(.light) .layer-row[data-kind="paste"] .chip { background: #d6d6d6 !important; }
  body:not(.light) .layer-row[data-kind="drill"] .chip { background: #2fbfae !important; }
  #sidebar { width: 260px; min-width: 260px; background: var(--chrome-bg); color: var(--chrome-fg); display: flex; flex-direction: column; border-right: 1px solid var(--chrome-border); }
  #sidebar header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; font-weight: 600; border-bottom: 1px solid var(--chrome-border); }
  #sidebar header .title { min-width: 0; }
  #sidebar header small { display: block; font-weight: 400; color: var(--muted); margin-top: 2px; }
  .icon-btn { flex: none; width: 28px; height: 28px; line-height: 1; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; cursor: pointer; font: 14px/1 system-ui, sans-serif; }
  .icon-btn:hover { background: var(--btn-hover); }
  #layers { flex: 1; overflow-y: auto; padding: 6px 0; }
  .layer-row { display: flex; align-items: center; gap: 8px; padding: 5px 14px; cursor: pointer; }
  .layer-row:hover { background: var(--row-hover); }
  .chip { width: 12px; height: 12px; border-radius: 3px; flex: none; border: 1px solid #0006; }
  .layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer-opacity { width: 60px; flex: none; }
  #toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--chrome-border); }
  #toolbar button { flex: 1 1 auto; min-width: 34px; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 4px 6px; cursor: pointer; font: inherit; }
  #toolbar button:hover { background: var(--btn-hover); }
  #toolbar button.armed { box-shadow: inset 0 0 0 1px var(--chrome-fg); background: var(--btn-hover); }
  #search-box { padding: 8px 14px 0; }
  #comp-search { width: 100%; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 5px 8px; font: inherit; }
  #comp-search::placeholder { color: var(--muted); }
  #view-switch { padding: 8px 14px 0; }
  #view-mode { width: 100%; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 5px 8px; font: inherit; cursor: pointer; }
  #pcba-theme-box { padding: 8px 14px 0; }
  #pcba-theme-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px; }
  #pcba-theme { width: 100%; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 5px 8px; font: inherit; cursor: pointer; }
  #volt-legend-box, #power-legend-box { padding: 8px 14px 0; }
  #volt-legend-label, #power-legend-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px; }
  #volt-legend-bar, #power-legend-bar { height: 8px; border-radius: 4px; border: 1px solid var(--btn-border); }
  #volt-legend-range, #power-legend-range { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; margin-top: 2px; }
  #flow-box { padding: 8px 14px 0; }
  #flow-label { display: flex; align-items: center; gap: 6px; color: var(--chrome-fg); font-size: 11px; cursor: pointer; user-select: none; }
  #flow-speed-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  #flow-speed { flex: 1; accent-color: var(--chrome-fg); }
  #flow-speed-val { color: var(--muted); font-size: 10px; min-width: 28px; text-align: right; }
  #dt-legend-box { padding: 8px 14px 0; }
  #dt-legend-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px; }
  #dt-legend-bar { height: 8px; border-radius: 4px; border: 1px solid var(--btn-border); }
  #dt-legend-range { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; margin-top: 2px; }
  #dt-controls { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 6px; color: var(--chrome-fg); font-size: 11px; }
  #dt-controls label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  #dt-controls input[type="number"] { width: 46px; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 2px 4px; font: inherit; }
  #dt-abs { color: var(--muted); font-size: 10px; margin-top: 4px; }
  #fab-report { padding: 8px 14px 0; font-weight: 400; }
  #fab-report summary { cursor: pointer; color: var(--muted); }
  #fab-report table { border-collapse: collapse; width: 100%; font-size: 11px; margin: 6px 0; }
  #fab-report th { text-align: left; color: var(--muted); font-weight: 400; padding: 1px 6px 1px 0; }
  #fab-report td { padding: 1px 6px 1px 0; }
  #fab-report .report-dim { color: var(--muted); margin-top: 4px; }
  /* DRC markers: pinned above geometry, theme-independent red */
  #drc .drc-mark circle.outer { fill: rgba(229, 72, 77, 0.22); stroke: #e5484d; cursor: pointer; }
  #drc .drc-mark circle.inner { fill: #e5484d; }
  #drc.hidden { display: none; }
  /* search hit pulse */
  .search-flash { animation: searchpulse 0.9s ease-out 3; }
  @keyframes searchpulse { 0% { opacity: 1; } 50% { opacity: 0.15; } 100% { opacity: 1; } }
  /* measurement rulers: theme-following geometry + labels */
  #measure line { stroke: var(--measure); }
  #measure circle { fill: var(--measure); }
  #measure text { fill: var(--measure); font-family: ui-monospace, monospace; }
  #board-area { position: relative; flex: 1; background: var(--page, #ffffff); }
  #status { position: absolute; left: 10px; bottom: 8px; background: #000a; color: #fff; padding: 3px 8px; border-radius: 4px; font: 12px/1.2 ui-monospace, monospace; pointer-events: none; }
  #board { position: absolute; inset: 0; display: block; cursor: crosshair; }
</style>
</head>
<body>
<div id="sidebar">
  <header>
    <div class="title">${escapeHtml(title)}<small>${layers.length} layers - wheel zoom, drag pan</small></div>
    <button id="btn-theme" class="icon-btn" title="toggle dark/light theme"></button>
  </header>
  ${
    options.pcbaSvg || options.blueprintSvg
      ? `<div id="view-switch">
  <select id="view-mode" title="board view">
    <option value="gerber">Gerber view</option>
    <option value="pcba">PCBA view</option>${options.blueprintSvg ? '\n    <option value="blueprint">Blueprint view</option>' : ''}${options.schematicSvg ? `\n    <option value="schematic">ngspice view</option>\n    <option value="thermal">Copper ΔT</option>` : ''}
  </select>
</div>`
      : ''
  }
  ${
    options.pcbaSvg && options.pcbaThemes && options.pcbaThemes.length > 0
      ? `<div id="pcba-theme-box" style="display:none">
  <div id="pcba-theme-label">Theme</div>
  <select id="pcba-theme" title="pcba theme">${options.pcbaThemes
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
        .join('')}</select>
</div>`
      : ''
  }
  ${
    options.schematicSvg && options.netOp
      ? `<div id="volt-legend-box" style="display:none">
  <div id="volt-legend-label">Trace voltage</div>
  <div id="volt-legend-bar"></div>
  <div id="volt-legend-range"><span id="volt-legend-min"></span><span id="volt-legend-max"></span></div>
</div>
<div id="power-legend-box" style="display:none">
  <div id="power-legend-label">Component power</div>
  <div id="power-legend-bar"></div>
  <div id="power-legend-range"><span id="power-legend-min"></span><span id="power-legend-max"></span></div>
</div>
<div id="flow-box" style="display:none">
  <label id="flow-label"><input type="checkbox" id="flow-toggle" checked> animate current flow</label>
  <div id="flow-speed-row">
    <input type="range" id="flow-speed" min="0" max="4" step="0.1" value="1" title="flow animation speed">
    <span id="flow-speed-val">1.0x</span>
  </div>
</div>
<div id="dt-legend-box" style="display:none">
  <div id="dt-legend-label">Copper rise (est.)</div>
  <div id="dt-legend-bar"></div>
  <div id="dt-legend-range"><span id="dt-legend-min">0°C</span><span id="dt-legend-max"></span></div>
  <div id="dt-controls">
    <label>ambient <input id="dt-ambient" type="number" value="25" min="-40" max="150">°C</label>
    <label>allowed <input id="dt-allowed" type="number" value="20" min="1" max="100">°C</label>
    <label><input id="dt-margin" type="checkbox"> color by margin</label>
  </div>
  <div id="dt-abs"></div>
</div>`
      : ''
  }
  ${reportPanel(options.report)}
  <div id="search-box">
    <input id="comp-search" type="text" placeholder="find component (e.g. U1)" autocomplete="off" spellcheck="false">
  </div>
  <div id="layers">
${rows}
  </div>
  <div id="toolbar">
    <button id="btn-fit" title="fit to board (0)">Fit</button>
    <button id="btn-in">+</button>
    <button id="btn-out">&#8722;</button>
    <button id="btn-all-on" title="show all layers">All</button>
    <button id="btn-all-off" title="hide all layers">None</button>
    <button id="btn-measure" title="measure: click start, click end — rulers stick; Esc clears all">&#x1F4CF;</button>
    <button id="btn-drc" class="has-drc-hidden" title="toggle DRC violation markers" hidden>DRC</button>
    <button id="btn-svg" title="download the current view as SVG">SVG</button>
    <button id="btn-png" title="download the current view as PNG">PNG</button>
  </div>
</div>
<div id="board-area">
  ${
    /* all views share one svg + coordinate frame: switching toggles group
       display, so panzoom/measure/drc/probe never re-bind */
    (() => {
      const withGerber = svg
        .replace('<svg ', '<svg id="board" ')
        .replace(
          '<g id="panzoom"><g id="yflip" transform="scale(1,-1)">',
          '<g id="panzoom"><g id="view-gerber"><g id="yflip" transform="scale(1,-1)">',
        );
      const overlays = '<g id="measure"></g><g id="drc"></g><g id="typecad-probe"></g>';
      if (!options.pcbaSvg && !options.blueprintSvg && !options.schematicSvg) {
        // gerber only: close yflip + view-gerber, overlays in panzoom
        return withGerber.replace('</g></g></svg>', `</g></g>${overlays}</g></svg>`);
      }
      // each extra view's inner carries its own id="board" group — rename
      // them so the root svg stays the only #board, and its labels group so
      // ids stay unique too
      const views: string[] = [];
      let union = splitSvg(svg).viewBox;
      if (options.pcbaSvg) {
        const pcba = splitSvg(options.pcbaSvg);
        union = unionViewBox(union, pcba.viewBox);
        views.push(
          `<g id="view-pcba" style="display:none">${pcba.inner
            .replace('<g id="board"', '<g id="pcba-board"')
            .replace('<g id="labels"', '<g id="pcba-labels"')}</g>`,
        );
      }
      if (options.blueprintSvg) {
        const bp = splitSvg(options.blueprintSvg);
        union = unionViewBox(union, bp.viewBox);
        views.push(
          `<g id="view-blueprint" style="display:none">${bp.inner
            .replace('<g id="board"', '<g id="bp-board"')
            .replace('<g id="labels"', '<g id="bp-labels"')}</g>`,
        );
      }
      if (options.schematicSvg) {
        const sch = splitSvg(options.schematicSvg);
        union = unionViewBox(union, sch.viewBox);
        views.push(
          `<g id="view-schematic" style="display:none">${sch.inner
            .replace('<g id="board"', '<g id="sch-board"')
            .replace('<g id="labels"', '<g id="sch-labels"')}</g>`,
        );
      }
      return withGerber
        .replace(/viewBox="[^"]*"/, `viewBox="${escapeHtml(union)}"`)
        .replace('</g></g></svg>', `</g></g>${views.join('')}${overlays}</g></svg>`);
    })()
  }
  <div id="status"></div>
  <script id="drc-data" type="application/json">${JSON.stringify(options.drcMarkers ?? []).replace(/</g, '\\u003c')}</script>
  <script id="net-op" type="application/json">${
    options.netOp ? JSON.stringify(options.netOp).replace(/</g, '\\u003c') : ''
  }</script>
  <script id="pcba-themes" type="application/json">${
    options.pcbaThemes && options.pcbaThemes.length > 0
      ? JSON.stringify({
          default: options.pcbaThemes[0]!.colors,
          themes: Object.fromEntries(options.pcbaThemes.map((t) => [t.id, t.colors])),
        }).replace(/</g, '\\u003c')
      : ''
  }</script>
</div>
<script>
${js}
</script>
</body>
</html>
`;
}
