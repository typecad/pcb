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
   * resolved board stackup (build/<board>_stackup.json): per-layer copper
   * weight and dielectric thicknesses. Feeds the thermal model's real
   * geometry (copper loss, FR4 conduction, board thickness). Absent = the
   * old 2-layer / 35 µm / 1.6 mm defaults.
   */
  stackup?: StackupInfo | null;
  /**
   * per-net route provenance (build/<board>_routes.json): which nets a
   * TrackBuilder hand-built vs the autorouter routed — the Layout view's
   * trace indication. Absent = every trace reads as autorouted.
   */
  routes?: { nets: Record<string, { provenance: 'manual' | 'auto' | 'mixed' }> } | null;
  /**
   * Layout view overlay components, derived from the gerbers (pad centroid
   * = position, PCA of pads = orientation, footprint name = body size) —
   * draggable, with each component's pad nets for rip-up.
   */
  layoutComponents?: Array<{
    ref: string;
    x: number;
    y: number;
    rot: number;
    w: number;
    h: number;
    side: 'front' | 'back';
    nets: string[];
    /**
     * exact footprint outline in the component's local frame (origin x/y,
     * rotated by `rot`): the Fab-layer contour when the gerbers carry one,
     * else the convex hull of the pad land pattern. The drag handle draws
     * this polygon instead of a generic rounded box.
     */
    outline?: Array<{ x: number; y: number }>;
    /** pad centers in the gerber frame — sticky route endpoints on apply */
    pads?: Array<{ x: number; y: number; net?: string }>;
    /** netlist value ("1k") — drives the layout view's in-place value editor */
    value?: string;
    /**
     * the part's Reference/Value label anchors (world gerber frame) —
     * independently draggable/rotatable texts; apply writes the final
     * footprint-local position into the Component's referenceLayout /
     * valueLayout constructor options
     */
    labels?: Array<{
      kind: 'reference' | 'value' | 'fab';
      text: string;
      x: number;
      y: number;
      rot: number;
      side: 'front' | 'back';
      h: number;
    }>;
  }>;
  /**
   * silk/fab board texts (gr_text — the `pcb.text()` API), parsed from the
   * board file in the gerber (y-up) frame. The layout view claims their
   * stroke paths: drag to reposition, double-click to edit the value in
   * place; apply rewrites the source `.text({ ... })` literals.
   */
  layoutTexts?: Array<{ text: string; x: number; y: number; rot: number; side: 'front' | 'back'; h: number }>;
  /**
   * theme picker entries for the pcba view: surface colors per builtin. The
   * switcher remaps the embedded render's flat colors client-side — one
   * render serves every theme, no re-render needed
   */
  pcbaThemes?: Array<{ id: string; label: string; colors: Record<string, string> }>;
}

/** Board stackup geometry (see `pcb_stackup_writer.ts` for the writer side). */
export interface StackupInfo {
  layerCount: number;
  copperLayers?: string[];
  boardThicknessMm: number;
  /** Copper thickness per layer, top → bottom, in mm (matches `copperLayers`). */
  copperThicknessMm: number[];
  /** Dielectric `i` sits between copper `i` and copper `i+1`, top → bottom. */
  dielectrics: Array<{ name: string; type: 'prepreg' | 'core'; thicknessMm: number; material: string }>;
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
  // resolved board stackup island (build/<board>_stackup.json): per-layer
  // copper weight + dielectric thicknesses. Absent = legacy 2-layer / 35 µm /
  // 1.6 mm defaults.
  var stackup = null;
  try {
    var rawStk = JSON.parse(document.getElementById('stackup').textContent);
    if (rawStk && rawStk.copperThicknessMm && rawStk.copperThicknessMm.length) stackup = rawStk;
  } catch (e) {}
  // route provenance + layout overlay components (both optional islands)
  var routesProv = null;
  try {
    var rawRt = JSON.parse(document.getElementById('routes').textContent);
    if (rawRt && rawRt.nets) {
      routesProv = {};
      for (var rpk in rawRt.nets) routesProv[rpk.toLowerCase()] = rawRt.nets[rpk];
    }
  } catch (e) {}
  var layoutComps = [];
  try {
    var rawLc = JSON.parse(document.getElementById('layout-comps').textContent);
    if (rawLc && rawLc.length) layoutComps = rawLc;
  } catch (e) {}
  var layoutTexts = [];
  try {
    var rawLt = JSON.parse(document.getElementById('layout-texts').textContent);
    if (rawLt && rawLt.length)
      layoutTexts = rawLt.map(function (t) {
        t.kind = 'board';
        return t;
      });
  } catch (e) {}
  // every part's Reference/Value labels join the same text-object model —
  // each moves and rotates independently of its component
  for (var lcL = 0; lcL < layoutComps.length; lcL++) {
    var lbls = layoutComps[lcL].labels || [];
    for (var lb = 0; lb < lbls.length; lb++) {
      lbls[lb].ref = layoutComps[lcL].ref;
      layoutTexts.push(lbls[lb]);
    }
  }
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
    viewMode =
      mode === 'thermal' || mode === 'layout' || (viewGroups[mode] && mode !== 'gerber') ? mode : 'gerber';
    for (var name in viewGroups) {
      if (!viewGroups[name]) continue;
      // the layout view arranges the gerber stack itself
      viewGroups[name].style.display =
        name === viewMode || (viewMode === 'layout' && name === 'gerber') ? '' : 'none';
    }
    // thermal reuses the schematic render with its own copper coloring
    if (viewGroups.schematic)
      viewGroups.schematic.style.display = viewMode === 'schematic' || viewMode === 'thermal' ? '' : 'none';
    // layer visibility/opacity controls belong to the gerber stack only —
    // the ruler stays (all views share one coordinate frame)
    if (layersBox) layersBox.style.display = viewMode === 'gerber' || viewMode === 'layout' ? '' : 'none';
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
    // the layout view arranges the gerber stack (subdued zones, provenance
    // dashes, draggable component overlay) — code stays the source of truth
    if (viewMode === 'layout') {
      enterLayout();
    } else if (lastViewMode === 'layout') {
      exitLayout();
    }
    var layoutBox2 = document.getElementById('layout-box');
    if (layoutBox2) layoutBox2.style.display = viewMode === 'layout' ? 'block' : 'none';
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
  // normalize v into [0,1] over [lo,hi]; logScale spreads decades linearly
  // (power) instead of the raw watts, so a board's milliwatt passives don't
  // all read black next to one hot regulator.
  function rampT(lo, hi, v, logScale) {
    if (logScale) {
      var rlo = Math.log(Math.max(lo, 1e-12));
      var rhi = Math.log(Math.max(hi, 1e-12));
      var rv = Math.log(Math.max(v, 1e-12));
      if (!(rhi > rlo)) return 0.5;
      var t = (rv - rlo) / (rhi - rlo);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    }
    if (!(hi > lo)) return 0.5;
    var tl = (v - lo) / (hi - lo);
    return tl < 0 ? 0 : tl > 1 ? 1 : tl;
  }
  // piecewise-linear blend along the stop list; the legend samples the same
  // function so the bar always mirrors the actual trace/overlay coloring.
  function rampColor(stops, lo, hi, v, logScale) {
    var t = rampT(lo, hi, v, logScale);
    var s = t * (stops.length - 1);
    var i = Math.min(Math.floor(s), stops.length - 2);
    return voltMix(stops[i], stops[i + 1], s - i);
  }
  function voltColor(v) {
    if (!voltRange) return VOLT_STOPS[Math.floor(VOLT_STOPS.length / 2)];
    return rampColor(VOLT_STOPS, voltRange[0], voltRange[1], v, false);
  }
  function powerColor(p) {
    if (!powerRange) return POWER_STOPS[Math.floor(POWER_STOPS.length / 2)];
    return rampColor(POWER_STOPS, powerRange[0], powerRange[1], p, true);
  }
  // legend bars sample the ramp at N positions so the gradient matches the
  // interpolation exactly — equally-spaced CSS stops only mirror a LINEAR
  // ramp, and the power scale is logarithmic.
  function fillLegend(prefix, stops, lo, hi, unit, logScale) {
    var bar = document.getElementById(prefix + '-legend-bar');
    if (!bar) return;
    var N = 48;
    var css = [];
    for (var si = 0; si <= N; si++) {
      var t = si / N;
      var v = logScale
        ? Math.exp(Math.log(Math.max(lo, 1e-12)) + t * (Math.log(Math.max(hi, 1e-12)) - Math.log(Math.max(lo, 1e-12))))
        : lo + t * (hi - lo);
      css.push(rampColor(stops, lo, hi, v, logScale) + ' ' + Math.round(t * 100) + '%');
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
    fillLegend('volt', VOLT_STOPS, voltRange[0], voltRange[1], 'V', false);
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
    fillLegend('power', POWER_STOPS, powerRange[0], powerRange[1], 'W', true);
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
  // sheet resistance of the TOP copper layer (Ω/square): the stackup island
  // supplies the real copper weight, else the legacy 35 µm default. Heavier
  // copper (2 oz) halves Rs and so halves the I²R loss for a given current.
  var DT_RS = cuSheetResist(stackup && stackup.copperThicknessMm && stackup.copperThicknessMm[0] ? stackup.copperThicknessMm[0] : 0.035, 20);
  var DT_CELL = 0.6; // raster pitch, board mm
  var dtBuilt = false;
  var dtReady = false;
  var dtItems = null; // {wires:[{el,dt}], pours:[pour], maxDT}
  // ---- pure thermal math (self-contained so a unit test can eval it) ----
  // IPC-2221 current-carrying constants, in mils: external layers k=0.048,
  // internal (buried) layers k=0.024 — the same split the library's
  // powerInfo width sizer uses. Copper weight is 1 oz (35 µm, 1.378 mils)
  // throughout; inner-layer copper thickness is not knowable from gerbers.
  function dtFromI(i, widthMm, inner, tUm) {
    if (!(i > 0) || !(widthMm > 0)) return 0;
    // cross-section in mil² (w·t); tUm scales the 1 oz = 1.378 mils reference
    // so the default matches the library sizer exactly and heavier copper
    // (2 oz = 70 µm) roughly halves the rise.
    var tMil = (tUm || 35) * (1.378 / 35);
    var area = widthMm * 39.3701 * tMil;
    var k = inner ? 0.024 : 0.048;
    var r = i / (k * Math.pow(area, 0.725));
    return r > 0 ? Math.pow(r, 1 / 0.44) : 0;
  }
  // ohmic loss of one sheet cell carrying surface current density mag
  // (A/mm): P = K²·Rs·A_cell. K = mag·1e3 A/m, A_cell = cellX·cellY·1e-6 m²,
  // so P = mag²·Rs·cellX·cellY (W) — the mm²/m² factors cancel exactly.
  function sheetCellLossW(mag, rs, cellX, cellY) {
    return mag * mag * rs * cellX * cellY;
  }
  // I²R of a wire of width and length (both mm) at sheet resistance rs:
  // R = Rs·len/width.
  function wireLossW(cur, rs, len, width) {
    return cur * cur * rs * (len / width);
  }
  // electrical conductance of a via barrel wall, siemens: σ·π·d·t/L.
  function viaBarrelCondS(drillMm, um, boardMm) {
    return (5.8e7 * Math.PI * drillMm * 1e-3 * um * 1e-6) / (boardMm * 1e-3);
  }
  // I²R loss of a via barrel given its electrical conductance (siemens).
  function viaBarrelLossW(cur, condS) {
    return (cur * cur) / condS;
  }
  // copper resistivity vs temperature: ρ = ρ0·(1 + α·ΔT), α ≈ 0.0039/K.
  function cuResistivityOhmM(tempC) {
    return 1.724e-8 * (1 + 0.00393 * (tempC - 20));
  }
  // sheet resistance (Ω/square) of a copper layer of thickness tMm at tempC.
  function cuSheetResist(tMm, tempC) {
    return cuResistivityOhmM(tempC) / (tMm * 1e-3);
  }
  // linearized radiation heat-transfer coefficient (W/m²·K) for a surface at
  // tempC radiating to ambientC, emissivity eps (≈0.9 for soldermask/FR4).
  function radH(tempC, ambientC, eps) {
    var SIGMA = 5.6704e-8;
    var Tk = tempC + 273.15, Ta = ambientC + 273.15;
    return SIGMA * (eps || 0.9) * (Tk * Tk + Ta * Ta) * (Tk + Ta);
  }
  // natural-convection h (W/m²·K) for a flat plate of characteristic length
  // L (mm) with temperature excess dT (°C). orientation: 'v' vertical,
  // 'hUp' horizontal (heated face up), 'hDn' horizontal (heated face down).
  function naturalConvectionH(dT, Lmm, orientation) {
    if (!(dT > 0)) return 0;
    var L = Lmm * 1e-3;
    var g = 9.81, beta = 1 / 293, nu = 1.6e-5, alpha = 2.2e-5;
    var Ra = (g * beta * dT * L * L * L) / (nu * alpha);
    if (Ra < 1e4) Ra = 1e4; // floor below the correlation's validity
    var Nu =
      orientation === 'hDn' ? 0.27 * Math.pow(Ra, 0.25) : orientation === 'hUp' ? 0.54 * Math.pow(Ra, 0.25) : 0.59 * Math.pow(Ra, 0.25);
    return (Nu * 0.026) / L; // k_air ≈ 0.026 W/m·K
  }
  // copper thickness (µm) for a trace element: front/back/inner from the
  // stackup, else the legacy 35 µm. Inner layers average their copper weight.
  function cuThicknessUm(el) {
    if (!stackup || !stackup.copperThicknessMm || !stackup.copperThicknessMm.length) return 35;
    var layers = stackup.copperThicknessMm;
    var n = layers.length;
    if (el && el.hasAttribute('data-inner')) {
      var sum = 0, cnt = 0;
      for (var l = 1; l < n - 1; l++) { sum += layers[l]; cnt++; }
      return cnt ? (sum / cnt) * 1000 : 35;
    }
    if (el && el.hasAttribute('data-sub')) return layers[n - 1] * 1000;
    return layers[0] * 1000;
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
    // SOR over the sheet network. Cells may be non-square (an elongated pour
    // bbox), so edge conductance is anisotropic: Gx = cellY/(Rs·cellX),
    // Gy = cellX/(Rs·cellY). Update Vc = (Σ G·Vn − Ic) / Σ G.
    var V = new Float64Array(nx * ny);
    var gx = cellY / (DT_RS * cellX);
    var gy = cellX / (DT_RS * cellY);
    var omega = 1.8;
    var converged = true;
    for (var iter = 0; iter < 3000; iter++) {
      var maxDelta = 0;
      for (var pass = 0; pass < 2; pass++) {
        for (var j2 = 0; j2 < ny; j2++) {
          for (var i3 = 0; i3 < nx; i3++) {
            var c = j2 * nx + i3;
            if (!mask[c] || c === refIdx || ((i3 + j2) & 1) !== pass) continue;
            var s = 0, gsum = 0;
            if (i3 > 0 && mask[c - 1]) { s += gx * V[c - 1]; gsum += gx; }
            if (i3 < nx - 1 && mask[c + 1]) { s += gx * V[c + 1]; gsum += gx; }
            if (j2 > 0 && mask[c - nx]) { s += gy * V[c - nx]; gsum += gy; }
            if (j2 < ny - 1 && mask[c + nx]) { s += gy * V[c + nx]; gsum += gy; }
            if (!gsum) continue;
            var nv = (s - inj[c]) / gsum;
            var d = nv - V[c];
            V[c] += omega * d;
            if (d > maxDelta) maxDelta = d;
            else if (-d > maxDelta) maxDelta = -d;
          }
        }
      }
      // 1 µV residual on a volts-scale field is far beyond meaningful for the
      // current-density estimate — tighter (1e-10) stalls the iteration cap on
      // the anisotropic-cell network and flags every solve "approximate"
      if (maxDelta < 1e-6) break;
      if (iter === 2999) converged = false;
    }
    // per-cell current density K = |∇V|/Rs (A per mm of width) and the
    // equivalent-conductor ΔT for a strip one equivalent cell wide
    var cells = new Float32Array(nx * ny);
    var cellQ = new Float32Array(nx * ny); // W per cell — board-solve source
    var ce = Math.sqrt(cellX * cellY); // equivalent square side for the strip model
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
        // current density |K| (A/mm) → strip current mag·ce through an
        // equivalent ce×ce conductor (pour sits on the front copper)
        cells[c2] = dtFromI(mag * ce, ce, false, cuThicknessUm(null));
        cellQ[c2] = sheetCellLossW(mag, DT_RS, cellX, cellY);
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
      converged: converged,
    };
  }
  function paintPour(pour, hi) {
    var ctx = pour.canvas.getContext('2d');
    var data = ctx.createImageData(pour.nx, pour.ny);
    for (var j = 0; j < pour.ny; j++) {
      for (var i = 0; i < pour.nx; i++) {
        var c = j * pour.nx + i;
        var o = (j * pour.nx + i) * 4; // no flip: the board group's scale(1,-1) flips the image on screen (verified by pixel probe)
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
    fillLegend('dt', DT_STOPS, 0, hi, '°C', false);
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
      var wdt = dtFromI(Math.abs(cur), w, el.hasAttribute('data-inner'), cuThicknessUm(el));
      el.__wireDT = wdt; // hover readout: the trace's own rise under the cursor
      wires.push({ el: el, dt: wdt });
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
    var anyPourApprox = false;
    if (clipPolys.length) {
      for (var pnet in pourNets) {
        var pour = solvePourDT(copper, pnet, clipPolys);
        if (pour) {
          pours.push(pour);
          if (!pour.converged) anyPourApprox = true;
        }
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
    var viaFlashes = []; // every flash, deduped or not (hover hits any of them)
    var viaDts = {}; // viaKey -> solved barrel rise
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
      ve.__viaKey = vkey;
      viaFlashes.push(ve);
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
        var vdt = dtViaFromI(iVia, drill);
        vel.__viaDT = vdt; // hover readout: the barrel's own rise
        vias.push({ el: vel, dt: vdt });
        viaDts[vel.__viaKey] = vdt;
      }
    }
    // the deduped twin flash (the other layer's annular ring — often the one
    // a hover actually hits, since it paints on top) reports the same barrel
    for (var vd = 0; vd < viaFlashes.length; vd++) {
      if (viaFlashes[vd].__viaDT === undefined && viaDts[viaFlashes[vd].__viaKey] !== undefined) {
        viaFlashes[vd].__viaDT = viaDts[viaFlashes[vd].__viaKey];
      }
    }
    var maxDT = 0;
    for (var w2 = 0; w2 < wires.length; w2++) if (wires[w2].dt > maxDT) maxDT = wires[w2].dt;
    for (var p2 = 0; p2 < pours.length; p2++) {
      var pc = pours[p2].cells;
      for (var c = 0; c < pc.length; c++) if (pc[c] > maxDT) maxDT = pc[c];
    }
    for (var v3 = 0; v3 < vias.length; v3++) if (vias[v3].dt > maxDT) maxDT = vias[v3].dt;
    dtItems = { wires: wires, pours: pours, vias: vias, viaNote: viaNote, maxDT: maxDT, approx: anyPourApprox };
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
  // ---- layout view: drag components over the gerber stack; connected
  // copper rips up (greys) until a rebuild lands; positions apply back to
  // the code that placed them via the host bridge ----
  var layoutOverlay = null;
  var layoutBuilt = false;
  var layoutMoves = {}; // ref -> { x, y, x0, y0 } in the gerber (y-up) frame
  var layoutRipped = []; // copper greyed until rebuild
  var layoutSel = []; // refs — shift-click extends, click replaces
  var layoutRot = {}; // ref -> accumulated 90-degree presses (R key)
  var layoutSnapBox = document.getElementById('layout-snap');
  var layoutApplyBtn = document.getElementById('layout-apply');
  var SVGNSL = 'http://www.w3.org/2000/svg';
  var cssEsc = function (v) {
    return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };
  function gerberAt(cx2, cy2) {
    // screen -> gerber frame: the gerber group carries the y-flip
    var v = clientToView({ x: cx2, y: cy2 });
    return { x: (v.x - tx) / k, y: -(v.y - ty) / k };
  }
  function setCompPos(g, x, y) {
    var rot = (g.__lc.rot + (layoutRot[g.__lc.ref] || 0) * 90) % 360;
    g.setAttribute('transform', 'translate(' + x + ',' + y + ') rotate(' + rot + ')');
    g.__lx = x;
    g.__ly = y;
  }
  // the moved component's whole footprint ink — pads, mask/paste openings,
  // fab/courtyard/silkscreen outlines (all carry data-ref from the X2
  // attributes) plus its drill hits, which carry no attributes of their own
  // and are matched to the component's pad centers (KiCad centers drills
  // on pads)
  function compEls(ref) {
    if (!viewGroups.gerber) return [];
    var els = [];
    var all = viewGroups.gerber.querySelectorAll('[data-ref="' + cssEsc(ref) + '"]');
    for (var ce = 0; ce < all.length; ce++) {
      var el = all[ce];
      // the overlay's own handles carry data-ref too — they must not move
      if (el.closest && el.closest('#layout-overlay')) continue;
      if (el.__layoutTr0 === undefined) el.__layoutTr0 = el.getAttribute('transform');
      els.push(el);
    }
    var c = null;
    for (var lc4 = 0; lc4 < layoutComps.length && !c; lc4++)
      if (layoutComps[lc4].ref === ref) c = layoutComps[lc4];
    if (c && c.pads) {
      var drills = viewGroups.gerber.querySelectorAll('g[data-kind="drill"] circle');
      for (var dr = 0; dr < drills.length; dr++) {
        var dc = drills[dr];
        if (dc.getAttribute('data-ref')) continue; // claimed by a component
        var dcx = parseFloat(dc.getAttribute('cx'));
        var dcy = parseFloat(dc.getAttribute('cy'));
        if (!isFinite(dcx) || !isFinite(dcy)) continue;
        for (var dp = 0; dp < c.pads.length; dp++) {
          if (Math.hypot(dcx - c.pads[dp].x, dcy - c.pads[dp].y) <= 0.35) {
            dc.setAttribute('data-ref', ref);
            if (dc.__layoutTr0 === undefined) dc.__layoutTr0 = dc.getAttribute('transform');
            els.push(dc);
            break;
          }
        }
      }
    }
    // the value ("1k") and reference texts on fab/silkscreen often plot as
    // plain graphics with NO %TO.C attribute — claim the unattributed ones
    // whose center sits within the footprint's reach (half the body plus a
    // text offset). Copper is deliberately absent: unattributed copper is
    // routing and must never travel with a part. Side-scoped so a back-side
    // part never steals front-side ink.
    if (c && viewGroups.gerber) {
      var rClaim = Math.max(c.w, c.h) / 2 + 2;
      var sideSeg = c.side === 'back' ? '-B_' : '-F_';
      var loose = viewGroups.gerber.querySelectorAll(
        'g[data-layer-name*="' + sideSeg + '"][data-kind="fab"] path:not([data-ref]):not([data-text]),' +
          'g[data-layer-name*="' + sideSeg + '"][data-kind="silkscreen"] path:not([data-ref]):not([data-text])',
      );
      for (var te = 0; te < loose.length; te++) {
        var tel = loose[te];
        var bb = pathBBox(tel);
        if (!bb || (!bb.width && !bb.height)) continue;
        if (Math.hypot(bb.x + bb.width / 2 - c.x, bb.y + bb.height / 2 - c.y) > rClaim) continue;
        tel.setAttribute('data-ref', ref);
        if (tel.__layoutTr0 === undefined) tel.__layoutTr0 = tel.getAttribute('transform');
        els.push(tel);
      }
    }
    return els;
  }
  // transform every footprint element from its ORIGINAL position to the
  // handle's current one — move + rotate about the new center, the same
  // math the handle group itself uses, so ink and outline never diverge
  function applyCompGhost(g) {
    if (!g.__ghostEls) g.__ghostEls = compEls(g.__lc.ref);
    var c = g.__lc;
    var dx = +(g.__lx - c.x).toFixed(4);
    var dy = +(g.__ly - c.y).toFixed(4);
    var a = ((layoutRot[c.ref] || 0) * 90) % 360;
    var tr =
      dx || dy || a
        ? 'rotate(' + a + ',' + +g.__lx.toFixed(4) + ',' + +g.__ly.toFixed(4) + ') translate(' + dx + ',' + dy + ')'
        : '';
    for (var ge = 0; ge < g.__ghostEls.length; ge++) {
      var el2 = g.__ghostEls[ge];
      if (tr) el2.setAttribute('transform', tr);
      else if (el2.__layoutTr0 === null || el2.__layoutTr0 === undefined) el2.removeAttribute('transform');
      else el2.setAttribute('transform', el2.__layoutTr0);
    }
  }
  // ---- board texts (gr_text — the pcb.text() API): clicking the actual
  // strokes grabs the whole text, dragging repositions it like a component,
  // double-click edits the value in place; apply rewrites the source
  // .text({ ... }) literals ----
  var layoutTextMoves = {}; // idx -> { x, y, x0, y0, rot, text, text0 }
  var layoutTextEls = []; // idx -> { paths, hidden, preview }
  var layoutTextSel = -1;
  function textPaths(i) {
    if (layoutTextEls[i]) return layoutTextEls[i].paths;
    var t = layoutTexts[i];
    var pfx = t.side === 'back' ? '-B_' : '-F_';
    var radius = 0.65 * t.h * (t.text.length + 2);
    // a text claims strokes on ITS OWN layer only — a silk refdes must not
    // swallow the fab strokes that merely sit nearby
    var kinds = t.layerKind ? [t.layerKind] : ['fab', 'silkscreen'];
    var sel = '';
    for (var ks = 0; ks < kinds.length; ks++)
      sel +=
        (sel ? ',' : '') +
        'g[data-layer-name*="' + pfx + '"][data-kind="' + kinds[ks] + '"] path:not([data-ref]):not([data-text])';
    var cands = viewGroups.gerber.querySelectorAll(sel);
    var paths = [];
    for (var cp = 0; cp < cands.length; cp++) {
      var p = cands[cp];
      var bb = pathBBox(p);
      if (!bb || (!bb.width && !bb.height)) continue;
      var pcx = bb.x + bb.width / 2;
      var pcy = bb.y + bb.height / 2;
      var myD = Math.hypot(pcx - t.x, pcy - t.y);
      if (myD > radius) continue;
      // a stroke between close texts (a part's small fab refdes sits between
      // its value glyphs) belongs to the anchor it is LEAST OUTLIER for:
      // distance normalized by each text's own reach, same-layer anchors only
      var myN = myD / radius;
      var nearer = false;
      for (var nt = 0; nt < layoutTexts.length; nt++) {
        var ot = layoutTexts[nt];
        if (ot === t || ot.side !== t.side || ot.x === undefined) continue;
        if (t.layerKind && ot.layerKind && ot.layerKind !== t.layerKind) continue;
        if (ot.text === undefined) continue;
        var oR = 0.65 * ot.h * (ot.text.length + 2);
        var oD = Math.hypot(pcx - ot.x, pcy - ot.y);
        if (oD / oR < myN) {
          nearer = true;
          break;
        }
      }
      if (nearer) continue;
      p.setAttribute('data-text', String(i));
      if (p.__layoutTr0 === undefined) p.__layoutTr0 = p.getAttribute('transform');
      paths.push(p);
    }
    layoutTextEls[i] = { paths, hidden: false, preview: null };
    return paths;
  }
  function textState(i) {
    // live position of text i: comp-transported base plus its own offset
    var m = layoutTextMoves[i];
    var base = labelBase(i);
    if (!m) return base;
    return { x: base.x + (m.ox || 0), y: base.y + (m.oy || 0), rot: m.rot || 0 };
  }
  // a component's pending move as an affine string (same math the footprint
  // ghost uses) — labels ride it until they get a move of their own
  function compTrStr(ref) {
    var cm = layoutMoves[ref];
    if (!cm) return '';
    var dx = +(cm.x - cm.x0).toFixed(4);
    var dy = +(cm.y - cm.y0).toFixed(4);
    var a = ((cm.rot || 0) * 90) % 360;
    if (!dx && !dy && !a) return '';
    return 'rotate(' + a + ',' + cm.x + ',' + cm.y + ') translate(' + dx + ',' + dy + ')';
  }
  // a label's anchor through its component's pending move (drag start point)
  function labelBase(i) {
    var t = layoutTexts[i];
    var cm = t.ref ? layoutMoves[t.ref] : null;
    if (!cm) return { x: t.x, y: t.y, rot: 0 };
    var a = (((cm.rot || 0) * 90) * Math.PI) / 180;
    var px = t.x + (cm.x - cm.x0);
    var py = t.y + (cm.y - cm.y0);
    var rx = cm.x + Math.cos(a) * (px - cm.x) - Math.sin(a) * (py - cm.y);
    var ry = cm.y + Math.sin(a) * (px - cm.x) + Math.cos(a) * (py - cm.y);
    return { x: +rx.toFixed(4), y: +ry.toFixed(4), rot: cm.rot || 0 };
  }
  function applyTextGhost(i) {
    var t = layoutTexts[i];
    var m = layoutTextMoves[i];
    var paths = textPaths(i);
    // a text's pending move is an OFFSET from its comp-transported base, so
    // a part drag carries its labels (custom offsets and all) as one unit —
    // exactly like KiCad, where fp_texts are footprint children
    var compTr = t.ref ? compTrStr(t.ref) : '';
    var ownTr = '';
    if (m && (m.ox || m.oy || m.rot)) {
      var base = labelBase(i);
      // pivot at the effective anchor: kicad rotates fp_text/gr_text about
      // its anchor, so the preview matches the rebuilt board exactly
      var ex = base.x + m.ox;
      var ey = base.y + m.oy;
      ownTr = 'rotate(' + m.rot * 90 + ',' + ex + ',' + ey + ') translate(' + m.ox + ',' + m.oy + ')';
    }
    var tr = ownTr && compTr ? ownTr + ' ' + compTr : ownTr || compTr;
    for (var tp = 0; tp < paths.length; tp++) {
      if (tr) paths[tp].setAttribute('transform', tr);
      else if (paths[tp].__layoutTr0 === null || paths[tp].__layoutTr0 === undefined) paths[tp].removeAttribute('transform');
      else paths[tp].setAttribute('transform', paths[tp].__layoutTr0);
    }
  }
  // full visual sync for text i: ghost transform + edited-value preview
  // (strokes hidden, SVG text standing in) — safe to call in any state, so
  // enter/exit/revert all funnel through it
  function syncTextVisual(i) {
    var t = layoutTexts[i];
    var st = layoutTextEls[i];
    if (!st) st = layoutTextEls[i] = { paths: textPaths(i), hidden: false, preview: null };
    applyTextGhost(i);
    var edited = layoutTextMoves[i] && layoutTextMoves[i].text !== undefined && layoutTextMoves[i].text !== t.text;
    if (edited) {
      if (!st.hidden) {
        for (var hp = 0; hp < st.paths.length; hp++) st.paths[hp].setAttribute('display', 'none');
        st.hidden = true;
      }
      if (!st.preview) {
        var pfx = t.side === 'back' ? '-B_' : '-F_';
        var grp = viewGroups.gerber.querySelector(
          'g[data-layer-name^="' + pfx + '"][data-kind="silkscreen"], g[data-layer-name^="' + pfx + '"][data-kind="fab"]',
        );
        st.preview = document.createElementNS(SVGNSL, 'text');
        st.preview.setAttribute('class', 'layout-text-preview');
        st.preview.setAttribute('pointer-events', 'none');
        (grp || layoutOverlay).appendChild(st.preview);
      }
      positionTextPreview(i);
    } else {
      if (st.hidden) {
        for (var up = 0; up < st.paths.length; up++) st.paths[up].removeAttribute('display');
        st.hidden = false;
      }
      if (st.preview) {
        st.preview.remove();
        st.preview = null;
      }
    }
  }
  function positionTextPreview(i) {
    // the edited-value preview: an SVG <text> standing in for the stroke
    // font until the rebuild plots the real glyphs. Counter-flipped to read
    // upright inside the y-flip group, centered on the anchor (mirrored on
    // the back side, matching how back-layer glyphs plot).
    var st = layoutTextEls[i];
    var t = layoutTexts[i];
    var m = layoutTextMoves[i];
    st.preview.setAttribute('font-size', t.h.toFixed(2));
    st.preview.setAttribute('text-anchor', 'middle');
    st.preview.setAttribute('dominant-baseline', 'central');
    st.preview.textContent = m && m.text !== undefined ? m.text : t.text;
    var eff = textState(i);
    var x = eff.x;
    var y = eff.y;
    var flip = t.side === 'back' ? -1 : 1;
    var tr = 'translate(' + x + ',' + y + ') scale(' + flip + ',' + -flip + ')';
    if (m && m.rot) tr += ' rotate(' + m.rot * 90 * flip + ')';
    st.preview.setAttribute('transform', tr);
  }
  function commitTextMove(i, x, y) {
    var t = layoutTexts[i];
    var prev = layoutTextMoves[i];
    // store the drag as an OFFSET from the comp-transported base, so a later
    // part drag carries the text (offset and all) instead of leaving it
    var base = labelBase(i);
    layoutTextMoves[i] = {
      ox: +(x - base.x).toFixed(4),
      oy: +(y - base.y).toFixed(4),
      rot: prev ? prev.rot : 0,
      text: prev && prev.text !== undefined ? prev.text : undefined,
      text0: t.text,
    };
    syncTextVisual(i);
    renderLayoutMoves();
    refreshLayoutWarnings();
  }
  function beginTextEdit(i) {
    var st = layoutTextEls[i];
    if (!st) st = layoutTextEls[i] = { paths: textPaths(i), hidden: false, preview: null };
    if (st.editor) return;
    var t = layoutTexts[i];
    var cur = layoutTextMoves[i] && layoutTextMoves[i].text !== undefined ? layoutTextMoves[i].text : t.text;
    // frame the editor over the text's current screen bbox
    var paths = textPaths(i);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var pe = 0; pe < paths.length; pe++) {
      if (paths[pe].getAttribute('display') === 'none') continue;
      var b = paths[pe].getBoundingClientRect();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    if (!isFinite(x0)) return;
    var svg = document.getElementById('board');
    var sr = svg.getBoundingClientRect();
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'layout-text-edit';
    inp.value = cur;
    inp.style.left = Math.max(sr.x, x0 - 30) + 'px';
    inp.style.top = (y0 + y1) / 2 - 13 + 'px';
    inp.style.width = Math.min(Math.max(x1 - x0 + 60, 90), sr.right - x0) + 'px';
    document.body.appendChild(inp);
    st.editor = inp;
    var closed = false;
    var close = function (save) {
      if (closed) return;
      closed = true;
      inp.remove();
      st.editor = null;
      if (save) {
        var v = inp.value;
        var m = layoutTextMoves[i];
        layoutTextMoves[i] = {
          ox: m ? m.ox || 0 : 0,
          oy: m ? m.oy || 0 : 0,
          rot: m ? m.rot : 0,
          text: v,
          text0: t.text,
        };
        syncTextVisual(i);
        renderLayoutMoves();
      }
    };
    inp.addEventListener('keydown', function (kev) {
      kev.stopPropagation();
      if (kev.key === 'Enter') close(true);
      else if (kev.key === 'Escape') close(false);
    });
    inp.addEventListener('blur', function () {
      close(true);
    });
    inp.focus();
    inp.select();
  }
  function markTextSel() {
    for (var ts = 0; ts < layoutTexts.length; ts++) {
      var st = layoutTextEls[ts];
      if (!st) continue;
      for (var sp = 0; sp < st.paths.length; sp++) {
        if (ts === layoutTextSel) st.paths[sp].classList.add('layout-text-sel');
        else st.paths[sp].classList.remove('layout-text-sel');
      }
    }
  }
  function attachTextDrag(i) {
    var paths = textPaths(i);
    for (var pd = 0; pd < paths.length; pd++) {
      paths[pd].addEventListener('pointerdown', function (ev) {
        if (viewMode !== 'layout') return;
        ev.stopPropagation();
        ev.preventDefault();
        layoutTextSel = i;
        layoutSel = [];
        markLayoutSel();
        markTextSel();
        var t = layoutTexts[i];
        var st = textState(i);
        var startG = gerberAt(ev.clientX, ev.clientY);
        var orig = { x: st.x, y: st.y };
        function onMove(e2) {
          var pg = gerberAt(e2.clientX, e2.clientY);
          var nx = orig.x + (pg.x - startG.x);
          var ny = orig.y + (pg.y - startG.y);
          if (!layoutSnapBox || layoutSnapBox.checked) {
            nx = Math.round(nx * 2) / 2;
            ny = Math.round(ny * 2) / 2;
          }
          commitTextMove(i, nx, ny);
          if (statusEl && !statusLocked())
            statusEl.textContent = t.text.slice(0, 18) + ' \u2192 ' + nx.toFixed(2) + ', ' + (-ny).toFixed(2) + ' mm';
          e2.preventDefault();
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
      paths[pd].addEventListener('dblclick', function (ev) {
        if (viewMode !== 'layout') return;
        ev.stopPropagation();
        ev.preventDefault();
        var t3 = layoutTexts[i];
        if (t3.kind === 'value') {
          beginCompValueEdit(t3.ref, ev);
          return;
        }
        if (t3.kind === 'reference') {
          beginCompTextEdit(t3.ref, 'reference', ev);
          return;
        }
        if (t3.kind === 'fab') {
          if (statusEl && !statusLocked())
            statusEl.textContent = 'fab refdes text: drag to reposition, R to rotate';
          return;
        }
        beginTextEdit(i);
      });
    }
  }
  // geometry of a stroke even when its layer group is toggled off —
  // getBBox() zeroes for non-rendered elements, so un-hide for the measure
  function pathBBox(el) {
    var grp = el.closest ? el.closest('#yflip > g') : null;
    var hidden = !!(grp && grp.style.display === 'none');
    if (hidden) grp.style.display = '';
    var bb = null;
    try {
      bb = el.getBBox();
    } catch (e) {
      bb = null;
    }
    if (hidden) grp.style.display = 'none';
    return bb;
  }
  var layoutInkBound = false; // listeners bind once; enterLayout runs often
  function bindCompInk(el, ref) {
    // this stroke is part of the component's footprint, exactly like KiCad:
    // grabbing it drags the PART, double-click edits the part's VALUE
    el.addEventListener('pointerdown', function (ev) {
      if (viewMode !== 'layout' || !layoutOverlay) return;
      var g = layoutOverlay.querySelector('[data-ref="' + cssEsc(ref) + '"]');
      if (g) startCompDrag(g, ev);
    });
    el.addEventListener('dblclick', function (ev) {
      if (viewMode !== 'layout' || !layoutOverlay) return;
      ev.stopPropagation();
      ev.preventDefault();
      beginCompValueEdit(ref, ev);
    });
  }
  function buildTextOverlay() {
    if (layoutInkBound) return;
    layoutInkBound = true;
    for (var i = 0; i < layoutTexts.length; i++) attachTextDrag(i);
    if (!viewGroups.gerber) return;
    // EVERY attributed element — pads, mask/paste openings, outlines, marks
    // — is footprint property: grabbing any of it drags the whole component
    // as one unit (pads routinely protrude past the invisible handle)
    var inked = viewGroups.gerber.querySelectorAll('#yflip [data-ref]');
    for (var ik = 0; ik < inked.length; ik++) {
      if (inked[ik].closest && inked[ik].closest('#layout-overlay')) continue;
      bindCompInk(inked[ik], inked[ik].getAttribute('data-ref'));
    }
    // UNattributed comp texts — KiCad plots most refdes/value fp_texts with
    // no %TO.C at all — bind to their nearest component within its reach
    // (the same radius the whole-footprint move claims with)
    var loose = viewGroups.gerber.querySelectorAll(
      'g[data-kind="fab"] path:not([data-ref]):not([data-text]),' +
        'g[data-kind="silkscreen"] path:not([data-ref]):not([data-text])',
    );
    for (var lp = 0; lp < loose.length; lp++) {
      (function (el) {
        var bb = pathBBox(el);
        if (!bb || (!bb.width && !bb.height)) return;
        var lx = bb.x + bb.width / 2;
        var ly = bb.y + bb.height / 2;
        var best = null;
        var bestD = Infinity;
        for (var lc = 0; lc < layoutComps.length; lc++) {
          var cc = layoutComps[lc];
          var d = Math.hypot(lx - cc.x, ly - cc.y);
          if (d <= Math.max(cc.w, cc.h) / 2 + 2 && d < bestD) {
            bestD = d;
            best = cc;
          }
        }
        if (best) bindCompInk(el, best.ref);
      })(loose[lp]);
    }
  }
  // in-place text edit for a component's VALUE or REFERENCE (the netlist
  // value rides with the overlay data; renaming rewrites the reference
  // literal) — the part's own label strokes hide and a plain preview stands
  // in at the label's anchor until the rebuild re-plots real glyphs
  var layoutValueEdits = {}; // ref -> new value
  var layoutRefEdits = {}; // ref -> new reference name
  var layoutValuePreviews = {}; // 'ref|kind' -> SVG text in the overlay
  function labelIndexOf(ref, kind) {
    for (var ii = 0; ii < layoutTexts.length; ii++)
      if (layoutTexts[ii].ref === ref && layoutTexts[ii].kind === kind) return ii;
    return -1;
  }
  function syncCompTextVisuals(on) {
    // on: edited labels hide their strokes + show previews; off: restore
    var edits = [
      ['value', layoutValueEdits],
      ['reference', layoutRefEdits],
    ];
    for (var ek = 0; ek < edits.length; ek++) {
      var kind = edits[ek][0];
      var map = edits[ek][1];
      for (var ref in map) {
        if (ref === '__editing') continue;
        var li = labelIndexOf(ref, kind);
        var key = ref + '|' + kind;
        var paths = li >= 0 ? textPaths(li) : [];
        if (layoutValuePreviews[key]) {
          layoutValuePreviews[key].remove();
          delete layoutValuePreviews[key];
        }
        if (on) {
          for (var hp2 = 0; hp2 < paths.length; hp2++) paths[hp2].setAttribute('display', 'none');
          var t2 = li >= 0 ? layoutTexts[li] : null;
          var st = li >= 0 ? textState(li) : null;
          var cP = null;
          for (var cp2 = 0; cp2 < layoutComps.length && !cP; cp2++) if (layoutComps[cp2].ref === ref) cP = layoutComps[cp2];
          var pv = document.createElementNS(SVGNSL, 'text');
          pv.setAttribute('class', 'layout-text-preview');
          pv.setAttribute('font-size', (t2 ? t2.h : 1).toFixed(2));
          pv.setAttribute('text-anchor', 'middle');
          pv.setAttribute('dominant-baseline', 'central');
          pv.setAttribute('pointer-events', 'none');
          pv.textContent = map[ref];
          var flip = !t2 || t2.side === 'front' ? 1 : -1;
          var rot = st && st.rot ? st.rot * 90 * flip : 0;
          pv.setAttribute(
            'transform',
            'translate(' + (st ? st.x : cP ? cP.x : 0) + ',' + (st ? st.y : cP ? cP.y : 0) + ') scale(' + flip + ',' + -flip + ')' +
              (rot ? ' rotate(' + rot + ')' : ''),
          );
          if (layoutOverlay) layoutOverlay.appendChild(pv);
          layoutValuePreviews[key] = pv;
        } else {
          for (var up2 = 0; up2 < paths.length; up2++) paths[up2].removeAttribute('display');
        }
      }
    }
  }
  function beginCompTextEdit(ref, kind, ev) {
    var edits = kind === 'reference' ? layoutRefEdits : layoutValueEdits;
    if (edits.__editing) return;
    var c = null;
    for (var vc = 0; vc < layoutComps.length && !c; vc++) if (layoutComps[vc].ref === ref) c = layoutComps[vc];
    if (!c) return;
    var cur = edits[ref] !== undefined ? edits[ref] : kind === 'reference' ? c.ref : c.value || '';
    var svg = document.getElementById('board');
    var sr = svg.getBoundingClientRect();
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'layout-text-edit';
    inp.value = cur;
    inp.style.left = Math.max(sr.x + 4, ev.clientX - 30) + 'px';
    inp.style.top = ev.clientY - 13 + 'px';
    inp.style.width = '110px';
    document.body.appendChild(inp);
    edits.__editing = true;
    var closed = false;
    var close = function (save) {
      if (closed) return;
      closed = true;
      inp.remove();
      edits.__editing = false;
      if (save && inp.value && inp.value !== cur) {
        edits[ref] = inp.value;
        syncCompTextVisuals(true);
        renderLayoutMoves();
      }
    };
    inp.addEventListener('keydown', function (kev) {
      kev.stopPropagation();
      if (kev.key === 'Enter') close(true);
      else if (kev.key === 'Escape') close(false);
    });
    inp.addEventListener('blur', function () {
      close(true);
    });
    inp.focus();
    inp.select();
  }
  function beginCompValueEdit(ref, ev) {
    beginCompTextEdit(ref, 'value', ev);
  }
  function markLayoutSel() {
    if (!layoutOverlay) return;
    var all = layoutOverlay.querySelectorAll('.layout-comp');
    for (var ms = 0; ms < all.length; ms++) {
      var ref = all[ms].getAttribute('data-ref');
      if (layoutSel.indexOf(ref) !== -1) all[ms].classList.add('layout-sel');
      else all[ms].classList.remove('layout-sel');
    }
    var ab = document.getElementById('layout-align');
    var db = document.getElementById('layout-dist');
    if (ab) ab.disabled = layoutSel.length < 2;
    if (db) db.disabled = layoutSel.length < 3;
  }
  function buildLayoutOverlay() {
    if (layoutBuilt || !viewGroups.gerber) return;
    layoutBuilt = true;
    layoutOverlay = document.createElementNS(SVGNSL, 'g');
    layoutOverlay.setAttribute('id', 'layout-overlay');
    layoutOverlay.setAttribute('pointer-events', 'none');
    // inside the y-flip group with the copper, so overlay coordinates are
    // the gerbers' own; the refdes label counter-flips to read upright
    var flipHost = viewGroups.gerber.querySelector('#yflip') || viewGroups.gerber;
    flipHost.appendChild(layoutOverlay);
    for (var lc = 0; lc < layoutComps.length; lc++) {
      var c = layoutComps[lc];
      var g = document.createElementNS(SVGNSL, 'g');
      g.setAttribute('class', 'layout-comp' + (c.side === 'back' ? ' layout-back' : ''));
      g.setAttribute('data-ref', c.ref);
      g.setAttribute('pointer-events', 'all');
      g.setAttribute('cursor', 'move');
      g.__lc = c;
      if (c.outline && c.outline.length >= 3) {
        // the exact footprint outline — fab contour (chamfers preserved) or
        // the pad-land hull, authored in this group's local frame
        var poly = document.createElementNS(SVGNSL, 'polygon');
        var pts = [];
        for (var oi = 0; oi < c.outline.length; oi++) {
          var op = c.outline[oi];
          pts.push(op.x.toFixed(3) + ',' + op.y.toFixed(3));
        }
        poly.setAttribute('points', pts.join(' '));
        g.appendChild(poly);
      } else {
        var rect = document.createElementNS(SVGNSL, 'rect');
        rect.setAttribute('x', (-c.w / 2).toFixed(3));
        rect.setAttribute('y', (-c.h / 2).toFixed(3));
        rect.setAttribute('width', c.w.toFixed(3));
        rect.setAttribute('height', c.h.toFixed(3));
        rect.setAttribute('rx', '0.3');
        g.appendChild(rect);
      }
      setCompPos(g, c.x, c.y);
      layoutOverlay.appendChild(g);
      attachLayoutDrag(g);
    }
  }
  function attachLayoutDrag(g) {
    g.addEventListener('pointerdown', function (ev) {
      startCompDrag(g, ev);
    });
  }
  // one drag handler, two entry points: the invisible handle polygon and
  // any of the part's own attributed ink (refdes/value strokes, courtyard)
  function startCompDrag(g, ev) {
    {
      ev.stopPropagation();
      ev.preventDefault();
      layoutTextSel = -1; // a part grab replaces any text grab
      markTextSel();
      if (ev.shiftKey && layoutSel.indexOf(g.__lc.ref) === -1) layoutSel.push(g.__lc.ref);
      else if (!ev.shiftKey) layoutSel = [g.__lc.ref];
      markLayoutSel();
      var startG = gerberAt(ev.clientX, ev.clientY);
      var orig = { x: g.__lx, y: g.__ly };
      var moved = false;
      function onMove(e2) {
        var pg = gerberAt(e2.clientX, e2.clientY);
        var nx = orig.x + (pg.x - startG.x);
        var ny = orig.y + (pg.y - startG.y);
        if (!layoutSnapBox || layoutSnapBox.checked) {
          nx = Math.round(nx * 2) / 2;
          ny = Math.round(ny * 2) / 2;
        }
        setCompPos(g, nx, ny);
        applyCompGhost(g); // the whole footprint drags along, like KiCad
        moved = true;
        if (statusEl && !statusLocked())
          statusEl.textContent = g.__lc.ref + ' \u2192 ' + nx.toFixed(2) + ', ' + (-ny).toFixed(2) + ' mm';
        e2.preventDefault();
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (moved) commitLayoutMove(g);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  }
  function ripUpEl(el) {
    if (el.__layoutOp !== undefined) return;
    el.__layoutOp = el.getAttribute('opacity') || '';
    el.setAttribute('opacity', '0.22');
    layoutRipped.push(el);
  }
  function commitLayoutMove(g) {
    var c = g.__lc;
    layoutMoves[c.ref] = { x: g.__lx, y: g.__ly, x0: c.x, y0: c.y, rot: layoutRot[c.ref] || 0 };
    // the whole footprint travels with the move — pads, mask/paste, fab,
    // courtyard, silkscreen and drills land at the new position, bright,
    // exactly like KiCad; nothing of the part lingers at the old spot
    applyCompGhost(g);
    // rip up: the net's ROUTING greys out until a rebuild regenerates it —
    // traces and vias only. Footprints never grey: each part's pads belong
    // to its own (possibly moving) footprint, so data-ref elements are left
    // alone whether they just moved or belong to a neighbor
    for (var rn = 0; rn < c.nets.length; rn++) {
      var netEls = viewGroups.gerber.querySelectorAll('[data-net="' + cssEsc(c.nets[rn]) + '"]');
      for (var re = 0; re < netEls.length; re++) {
        if (netEls[re].getAttribute('data-ref')) continue;
        ripUpEl(netEls[re]);
      }
    }
    renderLayoutMoves();
    refreshLayoutWarnings();
    refreshRatsnest();
    // the part's labels ride the move (an independently dragged label
    // stays pinned at its absolute spot instead)
    for (var lr3 = 0; lr3 < layoutTexts.length; lr3++) {
      if (layoutTexts[lr3].ref === c.ref) applyTextGhost(lr3);
    }
  }
  function renderLayoutMoves() {
    // no changelog line — the on-canvas handles already show what moved;
    // this only gates the apply button (moves + text/label/value edits)
    var nVal = 0;
    for (var vk in layoutValueEdits) if (vk !== '__editing') nVal++;
    for (var rk in layoutRefEdits) if (rk !== '__editing') nVal++;
    if (layoutApplyBtn)
      layoutApplyBtn.disabled =
        !Object.keys(layoutMoves).length && !Object.keys(layoutTextMoves).length && !nVal;
  }
  function layoutRevert() {
    for (var r = 0; r < layoutRipped.length; r++) {
      var el = layoutRipped[r];
      if (el.__layoutOp === '') el.removeAttribute('opacity');
      else el.setAttribute('opacity', el.__layoutOp);
      el.__layoutOp = undefined;
    }
    layoutRipped = [];
    layoutMoves = {};
    layoutRot = {};
    layoutTextMoves = {};
    layoutTextSel = -1;
    markTextSel();
    for (var tv = 0; tv < layoutTexts.length; tv++) {
      if (layoutTextEls[tv]) syncTextVisual(tv);
    }
    layoutValueEdits = {};
    layoutRefEdits = {};
    syncCompTextVisuals(false);
    refreshLayoutWarnings();
    refreshRatsnest();
    if (layoutOverlay) {
      for (var lc2 = 0; lc2 < layoutComps.length; lc2++) {
        var gEl = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutComps[lc2].ref) + '"]');
        if (!gEl) continue;
        // footprints return to their authored positions
        if (gEl.__ghostEls) {
          for (var gr2 = 0; gr2 < gEl.__ghostEls.length; gr2++) {
            var gel = gEl.__ghostEls[gr2];
            if (gel.__layoutTr0 === null || gel.__layoutTr0 === undefined) gel.removeAttribute('transform');
            else gel.setAttribute('transform', gel.__layoutTr0);
          }
          gEl.__ghostEls = null;
        }
        setCompPos(gEl, layoutComps[lc2].x, layoutComps[lc2].y);
      }
    }
    renderLayoutMoves();
  }
  var layoutRevertBtn = document.getElementById('layout-revert');
  if (layoutRevertBtn) layoutRevertBtn.addEventListener('click', layoutRevert);
  if (layoutApplyBtn) {
    layoutApplyBtn.addEventListener('click', function () {
      // the viewer runs inside VS Code; without its host bridge (a stale tab
      // served outside the extension) there is nothing to apply with
      if (typeof window.typecadLayoutApply !== 'function') {
        if (statusEl)
          statusEl.textContent =
            'apply needs the typeCAD viewer inside VS Code — reload the window and reopen the viewer if the panel predates this update';
        return;
      }
      var moves = [];
      var padsByRef = {};
      for (var pc2 = 0; pc2 < layoutComps.length; pc2++) {
        var lc3 = layoutComps[pc2];
        if (layoutMoves[lc3.ref] && lc3.pads) {
          padsByRef[lc3.ref] = lc3.pads.map(function (pp) { return { x: pp.x, y: -pp.y }; });
        }
      }
      for (var mr2 in layoutMoves) {
        var m2 = layoutMoves[mr2];
        // deltas convert to the board (y-down) frame here — the host never
        // sees the gerber flip; rotation rides as accumulated 90-degree
        // presses, and the component's ORIGINAL pads travel along so route
        // endpoints sitting on them can translate with it
        moves.push({
          ref: mr2,
          dx: m2.x - m2.x0,
          dy: -(m2.y - m2.y0),
          rot: (m2.rot || 0) * 90,
          pads: padsByRef[mr2] || [],
        });
      }
      // text edits: originals travel along so the host can match the source
      // .text({ ... }) literal by its authored x/y + value; finals are in
      // the board frame with rotation as accumulated 90-degree presses
      var texts = [];
      for (var ti in layoutTextMoves) {
        var ti2 = parseInt(ti, 10);
        var tbt = layoutTexts[ti2];
        if (tbt && tbt.kind && tbt.kind !== 'board') continue; // labels ride their own array
        var tm = layoutTextMoves[ti];
        texts.push({
          text0: tm.text0,
          x0: tbt.x,
          y0: -tbt.y,
          text: tm.text !== undefined ? tm.text : tm.text0,
          x: +(tbt.x + (tm.ox || 0)).toFixed(4),
          y: -(+(tbt.y + (tm.oy || 0)).toFixed(4)),
          rot: (tm.rot || 0) * 90,
        });
      }
      // component value edits (in-place editor on the part's own text)
      var values = [];
      for (var vk2 in layoutValueEdits) {
        if (vk2 === '__editing') continue;
        values.push({ ref: vk2, value: layoutValueEdits[vk2] });
      }
      // reference renames
      var renames = [];
      for (var rn4 in layoutRefEdits) {
        if (rn4 === '__editing') continue;
        renames.push({ ref: rn4, newRef: layoutRefEdits[rn4] });
      }
      // label repositioning: final world position + absolute rotation; the
      // host converts to footprint-local against the part's final placement
      var labels = [];
      for (var li in layoutTextMoves) {
        var lix = parseInt(li, 10);
        var lt = layoutTexts[lix];
        if (!lt || !lt.kind || lt.kind === 'board') continue;
        var lm = layoutTextMoves[li];
        var leff = labelBase(lix);
        labels.push({
          ref: lt.ref,
          kind: lt.kind,
          x: +(leff.x + (lm.ox || 0)).toFixed(4),
          y: -(+(leff.y + (lm.oy || 0)).toFixed(4)),
          rot: ((lm.rot || 0) * 90 + (lt.rot || 0)) % 360,
        });
      }
      layoutApplyBtn.disabled = true;
      layoutApplyBtn.textContent = 'rebuilding\u2026';
      window.typecadLayoutApply(moves, texts, values, labels, renames, function (err) {
        layoutApplyBtn.disabled = false;
        layoutApplyBtn.textContent = 'apply & rebuild';
        if (err && statusEl) statusEl.textContent = 'layout apply failed: ' + err;
      });
    });
  }
  // keys over the layout view: R rotates the selection 90 degrees (the
  // presses ride the move into apply as a rotation delta), arrows nudge
  // every selected component (0.5 mm, or 0.1 with Alt). An R with nothing
  // selected says so — silence reads as broken. CAPTURE on document: hosts
  // (and stray open editors) can stopPropagation before a bubble-phase
  // window listener ever sees the key.
  function layoutRotateSelection() {
    if (!layoutSel.length && layoutTextSel < 0) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'click a component first — R rotates the selection';
      return;
    }
    for (var rs = 0; rs < layoutSel.length; rs++) {
      var gRot = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutSel[rs]) + '"]');
      if (!gRot) continue;
      layoutRot[layoutSel[rs]] = ((layoutRot[layoutSel[rs]] || 0) + 1) % 4;
      setCompPos(gRot, gRot.__lx, gRot.__ly);
      commitLayoutMove(gRot);
    }
    // a grabbed text rotates about its (effective) anchor
    if (layoutTextSel >= 0 && layoutTexts[layoutTextSel]) {
      var tm2 = layoutTextMoves[layoutTextSel] || {
        ox: 0,
        oy: 0,
        rot: 0,
        text: undefined,
        text0: layoutTexts[layoutTextSel].text,
      };
      tm2.rot = ((tm2.rot || 0) + 1) % 4;
      layoutTextMoves[layoutTextSel] = tm2;
      syncTextVisual(layoutTextSel);
      renderLayoutMoves();
    }
  }
  document.addEventListener(
    'keydown',
    function (ev) {
      if (viewMode !== 'layout' || !layoutOverlay) return;
      // typing belongs to an open editor, never to the canvas
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable))
        return;
      if (ev.key === 'r' || ev.key === 'R') {
        ev.preventDefault();
        layoutRotateSelection();
        return;
      }
      var step = ev.altKey ? 0.1 : 0.5;
      var nudges = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      var d = nudges[ev.key];
      if (!d) return;
      ev.preventDefault();
      for (var ns = 0; ns < layoutSel.length; ns++) {
        var gNudge = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutSel[ns]) + '"]');
        if (!gNudge) continue;
        setCompPos(gNudge, gNudge.__lx + d[0], gNudge.__ly + d[1]);
        commitLayoutMove(gNudge);
      }
    },
    true,
  );

  // alignment tools: same row (shared Y, the selection's mean) and even X
  // spacing (first and last pinned, the middle distributed)
  function layoutSelGroups() {
    var out = [];
    for (var ls = 0; ls < layoutSel.length; ls++) {
      var g = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutSel[ls]) + '"]');
      if (g) out.push(g);
    }
    return out;
  }
  function layoutAlignRow() {
    var gs = layoutSelGroups();
    if (gs.length < 2) return;
    var mean = 0;
    for (var a = 0; a < gs.length; a++) mean += gs[a].__ly;
    mean = Math.round((mean / gs.length) * 2) / 2; // snapped to the grid
    for (var a2 = 0; a2 < gs.length; a2++) {
      setCompPos(gs[a2], gs[a2].__lx, mean);
      commitLayoutMove(gs[a2]);
    }
  }
  function layoutDistributeX() {
    var gs = layoutSelGroups().sort(function (p, q) { return p.__lx - q.__lx; });
    if (gs.length < 3) return;
    var x0 = gs[0].__lx;
    var x1 = gs[gs.length - 1].__lx;
    var gap = (x1 - x0) / (gs.length - 1);
    for (var d3 = 1; d3 < gs.length - 1; d3++) {
      var nx = Math.round((x0 + gap * d3) * 2) / 2;
      setCompPos(gs[d3], nx, gs[d3].__ly);
      commitLayoutMove(gs[d3]);
    }
  }
  var layoutAlignBtn = document.getElementById('layout-align');
  if (layoutAlignBtn) layoutAlignBtn.addEventListener('click', layoutAlignRow);
  var layoutDistBtn = document.getElementById('layout-dist');
  if (layoutDistBtn) layoutDistBtn.addEventListener('click', layoutDistributeX);
  // ---- phase 3 guardrails: overlap/outline warnings + stranded ratsnest ----
  function compAABB(c, x, y, rotDeg) {
    var a = ((rotDeg || 0) * Math.PI) / 180;
    var cos = Math.abs(Math.cos(a));
    var sin = Math.abs(Math.sin(a));
    var w = c.w * cos + c.h * sin;
    var h = c.w * sin + c.h * cos;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  function layoutBoardRect() {
    var edge = viewGroups.gerber ? viewGroups.gerber.querySelector('g[data-kind="edge"]') : null;
    if (!edge) return null;
    try {
      var b = edge.getBBox();
      return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    } catch (e) {
      return null;
    }
  }
  function compStateAt(ref) {
    for (var i = 0; i < layoutComps.length; i++) {
      if (layoutComps[i].ref !== ref) continue;
      var c = layoutComps[i];
      var g = layoutOverlay ? layoutOverlay.querySelector('[data-ref="' + cssEsc(ref) + '"]') : null;
      if (g)
        return {
          c: c,
          x: g.__lx,
          y: g.__ly,
          rot: c.rot + (layoutRot[ref] || 0) * 90,
        };
      return { c: c, x: c.x, y: c.y, rot: c.rot };
    }
    return null;
  }
  function refreshLayoutWarnings() {
    var box = document.getElementById('layout-warn');
    if (!box) return;
    var warns = [];
    var warnRefs = {};
    var boardR = layoutBoardRect();
    var moved = [];
    for (var mr in layoutMoves) moved.push(mr);
    for (var r = 0; r < moved.length; r++) {
      var st = compStateAt(moved[r]);
      if (!st) continue;
      var a = compAABB(st.c, st.x, st.y, st.rot);
      if (
        boardR &&
        (a.x0 < boardR.x0 - 0.01 || a.y0 < boardR.y0 - 0.01 || a.x1 > boardR.x1 + 0.01 || a.y1 > boardR.y1 + 0.01)
      ) {
        var wmsg = moved[r] + ' leaves the board outline';
        if (warns.indexOf(wmsg) === -1) warns.push(wmsg);
        warnRefs[moved[r]] = 1;
      }
      for (var oi = 0; oi < layoutComps.length; oi++) {
        var oref = layoutComps[oi].ref;
        if (oref === moved[r]) continue;
        var ost = compStateAt(oref);
        if (!ost) continue;
        var b = compAABB(ost.c, ost.x, ost.y, ost.rot);
        var ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        var oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > 0.05 && oy > 0.05) {
          var omsg = moved[r] + ' overlaps ' + oref;
          if (warns.indexOf(omsg) === -1) warns.push(omsg);
          warnRefs[moved[r]] = 1;
          warnRefs[oref] = 1;
        }
      }
    }
    box.textContent = warns.join(' \u00b7 ');
    box.style.display = warns.length ? '' : 'none';
    if (layoutOverlay) {
      var boxes = layoutOverlay.querySelectorAll('.layout-comp');
      for (var wb = 0; wb < boxes.length; wb++) {
        var bref = boxes[wb].getAttribute('data-ref');
        if (warnRefs[bref]) boxes[wb].classList.add('layout-warn');
        else boxes[wb].classList.remove('layout-warn');
      }
    }
  }
  function refreshRatsnest() {
    var old = document.getElementById('layout-ratsnest');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!layoutOverlay) return;
    var rats = document.createElementNS(SVGNSL, 'g');
    rats.setAttribute('id', 'layout-ratsnest');
    rats.setAttribute('pointer-events', 'none');
    // a component's pad AT ITS CURRENT pose: translate to the moved center,
    // then rotate the island pad offset by the accumulated 90-degree presses
    // — in the gerber (y-up) frame each +90 of code rotation turns offsets
    // clockwise, (ox, oy) -> (oy, -ox), as the rebuilt gerbers confirm
    var padPos = function (comp, pad) {
      var mv = layoutMoves[comp.ref];
      var ox = pad.x - comp.x;
      var oy = pad.y - comp.y;
      var presses = mv ? layoutRot[comp.ref] || 0 : 0;
      for (var t = 0; t < presses; t++) {
        var nxo = oy;
        var nyo = -ox;
        ox = nxo;
        oy = nyo;
      }
      return {
        x: (mv ? mv.x : comp.x) + ox,
        y: (mv ? mv.y : comp.y) + oy,
      };
    };
    for (var mr in layoutMoves) {
      var c = null;
      for (var fi = 0; fi < layoutComps.length; fi++) {
        if (layoutComps[fi].ref === mr) c = layoutComps[fi];
      }
      if (!c || !c.pads || !c.pads.length) continue;
      for (var pn = 0; pn < c.pads.length; pn++) {
        var pad = c.pads[pn];
        if (!pad.net) continue;
        // anchors: OTHER components' pads on the same net — their copper
        // survives the rip-up, so the stranded pad ties back to them (their
        // own moves/rotations apply too)
        var anchors = [];
        for (var oc = 0; oc < layoutComps.length; oc++) {
          var o = layoutComps[oc];
          if (o.ref === mr || o.nets.indexOf(pad.net) === -1) continue;
          for (var op = 0; op < (o.pads || []).length; op++) anchors.push(padPos(o, o.pads[op]));
        }
        if (!anchors.length) continue;
        var pp = padPos(c, pad);
        var best = null;
        var bestD = Infinity;
        for (var an = 0; an < anchors.length; an++) {
          var dd = (anchors[an].x - pp.x) * (anchors[an].x - pp.x) + (anchors[an].y - pp.y) * (anchors[an].y - pp.y);
          if (dd < bestD) {
            bestD = dd;
            best = anchors[an];
          }
        }
        var ln = document.createElementNS(SVGNSL, 'line');
        ln.setAttribute('x1', pp.x.toFixed(3));
        ln.setAttribute('y1', pp.y.toFixed(3));
        ln.setAttribute('x2', best.x.toFixed(3));
        ln.setAttribute('y2', best.y.toFixed(3));
        rats.appendChild(ln);
      }
    }
    layoutOverlay.appendChild(rats);
  }
  // the pending layout is a LAYOUT-view rendering: the ghost transforms and
  // ripped greys live in the gerber stack the other views share, so leaving
  // the layout view puts that stack back to the authored board — gerber,
  // thermal, every other view shows the real gerbers — and re-entering
  // re-applies the pending moves from layoutMoves
  function clearLayoutGhost() {
    if (layoutOverlay) {
      for (var cl = 0; cl < layoutComps.length; cl++) {
        var gc = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutComps[cl].ref) + '"]');
        if (!gc || !gc.__ghostEls) continue;
        for (var gi = 0; gi < gc.__ghostEls.length; gi++) {
          var gel = gc.__ghostEls[gi];
          if (gel.__layoutTr0 === null || gel.__layoutTr0 === undefined) gel.removeAttribute('transform');
          else gel.setAttribute('transform', gel.__layoutTr0);
        }
      }
    }
    for (var r2 = 0; r2 < layoutRipped.length; r2++) {
      var rel = layoutRipped[r2];
      if (rel.__layoutOp === '') rel.removeAttribute('opacity');
      else rel.setAttribute('opacity', rel.__layoutOp);
      rel.__layoutOp = undefined;
    }
    layoutRipped = [];
    // texts too: strokes back to authored ink, edit previews gone (the
    // pending edits survive in layoutTextMoves and re-apply on re-entry).
    // comp moves must ALSO clear first — label ghosts compose them
    var savedTextMoves = layoutTextMoves;
    var savedMoves = layoutMoves;
    layoutTextMoves = {};
    layoutMoves = {};
    for (var tcl = 0; tcl < layoutTexts.length; tcl++) {
      if (layoutTextEls[tcl]) syncTextVisual(tcl);
    }
    layoutTextMoves = savedTextMoves;
    layoutMoves = savedMoves;
    syncCompTextVisuals(false);
  }
  function restoreLayoutGhost() {
    for (var mr3 in layoutMoves) {
      var gr3 = layoutOverlay ? layoutOverlay.querySelector('[data-ref="' + cssEsc(mr3) + '"]') : null;
      if (gr3) applyCompGhost(gr3);
      var c3 = null;
      for (var lc6 = 0; lc6 < layoutComps.length && !c3; lc6++) if (layoutComps[lc6].ref === mr3) c3 = layoutComps[lc6];
      if (!c3) continue;
      for (var rn3 = 0; rn3 < c3.nets.length; rn3++) {
        var netEls3 = viewGroups.gerber.querySelectorAll('[data-net="' + cssEsc(c3.nets[rn3]) + '"]');
        for (var re3 = 0; re3 < netEls3.length; re3++) {
          if (netEls3[re3].getAttribute('data-ref')) continue;
          ripUpEl(netEls3[re3]);
        }
      }
    }
    for (var tr3 in layoutTextMoves) {
      var tri = parseInt(tr3, 10);
      if (layoutTexts[tri]) syncTextVisual(tri);
    }
    // labels of moved parts re-ride their comp transform even without a
    // move of their own
    for (var lr4 = 0; lr4 < layoutTexts.length; lr4++) {
      var lt4 = layoutTexts[lr4];
      if (lt4.ref && layoutMoves[lt4.ref] && !layoutTextMoves[lr4] && layoutTextEls[lr4]) syncTextVisual(lr4);
    }
    syncCompTextVisuals(true);
  }
  function enterLayout() {
    buildLayoutOverlay();
    buildTextOverlay();
    document.body.classList.add('typecad-layout');
    if (layoutOverlay) layoutOverlay.style.display = '';
    // zones subdued, blueprint-faint: filled contours step back so the
    // copper being arranged reads clearly
    var regions = viewGroups.gerber ? viewGroups.gerber.querySelectorAll('path[fill-rule="evenodd"]') : [];
    for (var z = 0; z < regions.length; z++) {
      if (regions[z].__zoneOp !== undefined) continue;
      regions[z].__zoneOp = regions[z].getAttribute('opacity') || '';
      regions[z].setAttribute('opacity', '0.18');
    }
    // provenance: TrackBuilder-built traces (manual or mixed) go dashed —
    // solid copper means the autorouter drew it
    if (routesProv && viewGroups.gerber) {
      var traces = viewGroups.gerber.querySelectorAll('path[data-net]');
      for (var t2 = 0; t2 < traces.length; t2++) {
        if (traces[t2].getAttribute('fill-rule')) continue; // regions above
        var pr = routesProv[(traces[t2].getAttribute('data-net') || '').toLowerCase()];
        if (pr && pr.provenance !== 'auto') traces[t2].setAttribute('stroke-dasharray', '4 2.2');
      }
    }
    // pending moves re-apply AFTER the zone subduing above, so a ripped
    // pour zone reads as ripped (grey) exactly like it did live
    restoreLayoutGhost();
    renderLayoutMoves();
    refreshLayoutWarnings();
    refreshRatsnest();
  }
  function exitLayout() {
    clearLayoutGhost();
    document.body.classList.remove('typecad-layout');
    if (layoutOverlay) layoutOverlay.style.display = 'none';
    var regions = viewGroups.gerber ? viewGroups.gerber.querySelectorAll('path[fill-rule="evenodd"]') : [];
    for (var z2 = 0; z2 < regions.length; z2++) {
      if (regions[z2].__zoneOp === undefined) continue;
      if (regions[z2].__zoneOp === '') regions[z2].removeAttribute('opacity');
      else regions[z2].setAttribute('opacity', regions[z2].__zoneOp);
      regions[z2].__zoneOp = undefined;
    }
    if (viewGroups.gerber) {
      var dashed = viewGroups.gerber.querySelectorAll('path[stroke-dasharray]');
      for (var d2 = 0; d2 < dashed.length; d2++) dashed[d2].removeAttribute('stroke-dasharray');
    }
  }

  ['dt-margin', 'dt-allowed'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', applyThermalColors);
    if (el) el.addEventListener('change', applyThermalColors);
  });
  var dtAmbient = document.getElementById('dt-ambient');
  if (dtAmbient) dtAmbient.addEventListener('input', applyThermalColors);

  // ---- board (FR4) temperature: the solved losses heat the laminate — a
  // stacked two-layer steady-state solve (front + back copper, one FR4 core),
  // degrees ABOVE ambient. Sources are the wire/via/pour copper losses PLUS
  // each component's solved watts injected at its pads (component-surface
  // convection is ignored — an upper bound). Conduction: copper in-plane
  // (k·t, real per-layer weight from the stackup), FR4 in-plane and
  // through-plane (real dielectric/core thickness), via barrels coupling the
  // two layers. The outer faces shed heat via natural convection (an
  // orientation correlation) plus radiation; copper I²R self-heats through
  // the resistivity's temperature coefficient. Idealized: no enclosure,
  // mounting, or forced airflow.
  var boardTemp = null; // {img, max}
  var BD = {
    cell: 1.2, // mm raster — thermal gradients are smooth
    kCu: 400, // W/m·K, copper
    kFr4: 0.3, // W/m·K, FR4 (in-plane and through-plane)
    alphaCu: 0.00393, // 1/K, copper resistivity temperature coefficient
    emissivity: 0.9, // soldermask/FR4
    orientation: 'v', // natural-convection correlation: 'v' | 'hUp' | 'hDn'
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
    // copper marks + heat sources per layer (top / bottom by data-sub);
    // Scu tracks the COPPER-only loss (I²R) so the resistivity's temperature
    // coefficient can feed heat back into the solve (component watts do not).
    var cu = [new Uint8Array(nx * ny), new Uint8Array(nx * ny)];
    var S = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var Scu = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var gz = new Float64Array(nx * ny); // via barrels add copper z-conductance
    var ambBox2 = document.getElementById('dt-ambient');
    var ambientC = ambBox2 ? parseFloat(ambBox2.value) || 25 : 25;
    // characteristic length for the convection correlation: the board's
    // diagonal, clamped so the Rayleigh number stays in the correlation range
    var charLenMm = Math.min(200, Math.max(10, Math.hypot(bb.width, bb.height)));
    var cellAt = function (x, y) {
      var ci = Math.floor((x - bb.x) / cx);
      var cj = Math.floor((y - bb.y) / cy);
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) return -1;
      var c = cj * nx + ci;
      return inBoard[c] ? c : -1;
    };
    // real geometry from the stackup island (else legacy 35 µm / 1.6 mm):
    // two copper layers (front = layers[0], back = layers[n-1]) around the
    // full dielectric core. Multi-layer boards collapse to this two-slab
    // model with the correct total copper and dielectric thickness.
    var cuTopMm = stackup && stackup.copperThicknessMm && stackup.copperThicknessMm.length ? stackup.copperThicknessMm[0] || 0.035 : 0.035;
    var cuBotMm = stackup && stackup.copperThicknessMm && stackup.copperThicknessMm.length ? stackup.copperThicknessMm[stackup.copperThicknessMm.length - 1] || 0.035 : 0.035;
    var boardMm = stackup && stackup.boardThicknessMm ? stackup.boardThicknessMm : 1.6;
    var dielMm = boardMm - cuTopMm - cuBotMm;
    if (stackup && stackup.dielectrics && stackup.dielectrics.length) {
      dielMm = 0;
      for (var dI = 0; dI < stackup.dielectrics.length; dI++) dielMm += stackup.dielectrics[dI].thicknessMm;
    }
    if (!(dielMm > 0.01)) dielMm = 1.53;
    // via barrel z-conductance for the thermal coupling (k_cu·π·d·t/L)
    var viaG = (BD.kCu * Math.PI * 0.153e-3 * 35e-6) / (boardMm * 1e-3);
    // fine paint grid, 3x the solve raster: the field is solved at BD.cell,
    // but the image is painted at a third of it with bilinear sampling —
    // a full-solve-cell paint would look blocky at 1.2 mm. The field covers
    // the whole board (no trace gap); only the outline confines it.
    var FX = 3;
    var pnx = nx * FX, pny = ny * FX;
    var fcx = cx / FX, fcy = cy / FX;
    var fIn = new Uint8Array(pnx * pny);
    for (var fj = 0; fj < pny; fj++) {
      for (var fi = 0; fi < pnx; fi++) {
        fIn[fj * pnx + fi] = fill.isPointInFill(
          new DOMPoint(bb.x + (fi + 0.5) * fcx, bb.y + (fj + 0.5) * fcy),
        )
          ? 1
          : 0;
      }
    }
    var copper = viewGroups.schematic.querySelector('#sch-copper');
    if (copper) {
      for (var w = 0; w < dtItems.wires.length; w++) {
        var el = dtItems.wires[w].el;
        var cur = el.__edgeCur || 0;
        var lw = parseFloat(el.getAttribute('data-w') || el.getAttribute('stroke-width')) || 0.2;
        var len = el.getTotalLength ? el.getTotalLength() : 0;
        if (!len) continue;
        var P = wireLossW(cur, DT_RS, len, lw); // I²R in W
        var li = el.hasAttribute('data-sub') ? 1 : 0;
        for (var s = 0; s <= len; s += Math.max(0.4, len / 24)) {
          var pt = el.getPointAtLength(Math.min(s, len));
          var c = cellAt(pt.x, pt.y);
          if (c < 0) continue;
          var steps = Math.max(1, Math.round(len / Math.max(0.4, len / 24)));
          S[li][c] += P / steps;
          Scu[li][c] += P / steps;
          cu[li][c] = 1;
          // solver spread: heat conducts from the neighboring cells too
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
        // electrical barrel conductance σ·π·d·t/L (~600 S at a 0.15 mm
        // drill) sets the via's copper loss; the same barrel thermally
        // couples the layers (~15x one cell of FR4 z-conductance)
        var Gb = viaBarrelCondS(drill, 35, boardMm);
        var Pv = vI !== undefined ? viaBarrelLossW(vI, Gb) : 0;
        S[0][vc2] += Pv / 2;
        S[1][vc2] += Pv / 2;
        Scu[0][vc2] += Pv / 2;
        Scu[1][vc2] += Pv / 2;
        gz[vc2] += (viaG * drill) / 0.153;
        cu[0][vc2] = 1;
        cu[1][vc2] = 1;
      }
      // component self-heating: each device's solved watts enter the board
      // through its pads, split evenly across its pins (per-layer pad
      // flashes dedupe by ref|pin). Pads are copper — mark them conducting.
      var devP = {};
      if (netOp && netOp.devices) {
        for (var dk2 in netOp.devices) {
          var Pd = netOp.devices[dk2].power;
          if (Pd && Pd > 1e-6) devP[dk2] = Pd;
        }
      }
      var padCells = {}; // ref|pin -> { cell, area }
      var padEls = copper.querySelectorAll('[data-ref]');
      for (var pe = 0; pe < padEls.length; pe++) {
        var pel = padEls[pe];
        if (pel.tagName.toLowerCase() === 'path') continue;
        var pb2 = pel.getBBox();
        if (pb2.width > 2.5 || pb2.height > 2.5) continue; // pad-sized marks only
        var pc3 = cellAt(pb2.x + pb2.width / 2, pb2.y + pb2.height / 2);
        if (pc3 < 0) continue;
        cu[0][pc3] = 1;
        cu[1][pc3] = 1;
        var pr = pel.getAttribute('data-ref');
        if (!pr || devP[pr.toLowerCase()] === undefined) continue;
        var pk2 = pr.toLowerCase() + '|' + (pel.getAttribute('data-pin') || '');
        if (padCells[pk2] === undefined) padCells[pk2] = { cell: pc3, area: pb2.width * pb2.height };
      }
      var byRefPads = {};
      for (var pk3 in padCells) {
        var rf = pk3.split('|')[0];
        if (!byRefPads[rf]) byRefPads[rf] = [];
        byRefPads[rf].push(padCells[pk3]);
      }
      for (var rf2 in byRefPads) {
        // weight each pin's share of the device's watts by its pad AREA —
        // a thermal tab or fat ground pad conducts most of the heat out, so
        // an even per-pin split would mis-place it. Area is the pad bbox
        // product (per-layer flashes dedupe by ref|pin above).
        var totalArea = 0;
        for (var ar = 0; ar < byRefPads[rf2].length; ar++) totalArea += byRefPads[rf2][ar].area;
        if (!(totalArea > 0)) totalArea = 1;
        for (var pci = 0; pci < byRefPads[rf2].length; pci++) {
          var padRec = byRefPads[rf2][pci];
          var hc2 = padRec.cell;
          var perPad2 = (devP[rf2] * padRec.area) / totalArea;
          // spread the pad's share over its footprint: half in the pad cell,
          // an eighth in each orthogonal neighbor (a pad is ~1.7 mm of
          // copper — concentrating it in one cell grid-sharpens the peak)
          var parts = [{ c: hc2, f: 0.5 }];
          if (hc2 % nx > 0 && inBoard[hc2 - 1]) parts.push({ c: hc2 - 1, f: 0.125 });
          if (hc2 % nx < nx - 1 && inBoard[hc2 + 1]) parts.push({ c: hc2 + 1, f: 0.125 });
          if (hc2 >= nx && inBoard[hc2 - nx]) parts.push({ c: hc2 - nx, f: 0.125 });
          if (hc2 < nx * (ny - 1) && inBoard[hc2 + nx]) parts.push({ c: hc2 + nx, f: 0.125 });
          for (var qi = 0; qi < parts.length; qi++) {
            S[0][parts[qi].c] += (perPad2 * parts[qi].f) / 2;
            S[1][parts[qi].c] += (perPad2 * parts[qi].f) / 2;
          }
        }
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
        Scu[0][bc] += po.q[pc] / 2;
        Scu[1][bc] += po.q[pc] / 2;
        cu[0][bc] = cu[0][bc] || po.mask[pc];
        cu[1][bc] = cu[1][bc] || po.mask[pc];
      }
    }
    // steady-state SOR over T[2][n] (degrees ABOVE ambient). Copper loss
    // self-heats through the resistivity temperature coefficient; the two
    // outer faces convect (orientation correlation) and radiate.
    var T = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var gCuXY = [BD.kCu * cuTopMm * 1e-3, BD.kCu * cuBotMm * 1e-3]; // per edge, per layer
    var gFr4XY = BD.kFr4 * boardMm * 1e-3; // in-plane FR4, full board thickness
    var gZ = (BD.kFr4 * (cx * cy * 1e-6)) / (dielMm * 1e-3); // W/K per cell, through the core
    var ori0 = BD.orientation === 'h' ? 'hUp' : 'v';
    var ori1 = BD.orientation === 'h' ? 'hDn' : 'v';
    // face conductance (convection + radiation) is temperature-dependent, and
    // recomputing it every sweep stalls the SOR before the iteration cap —
    // the T→h coupling is weak (h varies ~2x over the range), so freeze the
    // coefficients in 50-iteration stretches and refresh between them
    var gFaceT = [new Float64Array(nx * ny), new Float64Array(nx * ny)];
    var refreshFaces = function () {
      for (var Lf = 0; Lf < 2; Lf++) {
        var oriF = Lf === 0 ? ori0 : ori1;
        for (var cf = 0; cf < nx * ny; cf++) {
          if (!inBoard[cf]) continue;
          gFaceT[Lf][cf] =
            (naturalConvectionH(T[Lf][cf], charLenMm, oriF) + radH(ambientC + T[Lf][cf], ambientC, BD.emissivity)) *
            (cx * cy * 1e-6);
        }
      }
    };
    refreshFaces();
    var btConverged = true;
    for (var it = 0; it < 8000; it++) {
      if (it && it % 50 === 0) refreshFaces();
      var md = 0;
      for (var L = 0; L < 2; L++) {
        for (var c3 = 0; c3 < nx * ny; c3++) {
          if (!inBoard[c3]) continue;
          var Tabs = ambientC + T[L][c3];
          var gFace = gFaceT[L][c3];
          var sum = S[L][c3] + Scu[L][c3] * BD.alphaCu * (Tabs - 20);
          var gsum = gFace; // one outer face per copper layer
          var i5 = c3 % nx;
          var nb;
          nb = i5 > 0 ? c3 - 1 : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g1 = cu[L][c3] && cu[L][nb] ? gCuXY[L] : gFr4XY;
            sum += g1 * T[L][nb];
            gsum += g1;
          }
          nb = i5 < nx - 1 ? c3 + 1 : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g2 = cu[L][c3] && cu[L][nb] ? gCuXY[L] : gFr4XY;
            sum += g2 * T[L][nb];
            gsum += g2;
          }
          nb = c3 >= nx ? c3 - nx : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g3 = cu[L][c3] && cu[L][nb] ? gCuXY[L] : gFr4XY;
            sum += g3 * T[L][nb];
            gsum += g3;
          }
          nb = c3 < nx * (ny - 1) ? c3 + nx : -1;
          if (nb >= 0 && inBoard[nb]) {
            var g4 = cu[L][c3] && cu[L][nb] ? gCuXY[L] : gFr4XY;
            sum += g4 * T[L][nb];
            gsum += g4;
          }
          var gzT = gZ + gz[c3]; // FR4 core + via barrels
          sum += gzT * T[1 - L][c3];
          gsum += gzT;
          var nv = sum / gsum;
          var dd = nv - T[L][c3];
          T[L][c3] += 1.7 * dd;
          if (dd > md) md = dd;
          else if (-dd > md) md = -dd;
        }
      }
      // 2e-3 °C residual is ~500x finer than the readout's 0.1 °C precision —
      // tighter than that and slow FR4 corners stall the cap on stiff boards
      if (md < 2e-3) break;
      if (it === 7999) btConverged = false;
    }
    // paint: max across layers, bilinear on the fine grid — the field covers
    // the whole board (copper included); only the outline and the near-zero
    // threshold hold paint back
    var maxT = 0;
    for (var c4 = 0; c4 < nx * ny; c4++) {
      if (!inBoard[c4]) continue;
      var tv = Math.max(T[0][c4], T[1][c4]);
      if (tv > maxT) maxT = tv;
    }
    var cv = document.createElement('canvas');
    cv.width = pnx;
    cv.height = pny;
    var ctx = cv.getContext('2d');
    var data = ctx.createImageData(pnx, pny);
    for (var j2 = 0; j2 < pny; j2++) {
      for (var i6 = 0; i6 < pnx; i6++) {
        var fc2 = j2 * pnx + i6;
        var o = fc2 * 4; // no flip: the board group flips the image on screen (verified by pixel probe)
        if (!fIn[fc2]) continue;
        // bilinear sample of the solved field, max of both layers
        var px2 = bb.x + (i6 + 0.5) * fcx;
        var py2 = bb.y + (j2 + 0.5) * fcy;
        var gx = Math.max(0, Math.min(nx - 1.001, (px2 - bb.x) / cx - 0.5));
        var gy = Math.max(0, Math.min(ny - 1.001, (py2 - bb.y) / cy - 0.5));
        var qa = Math.floor(gx), qb = Math.floor(gy);
        var fx3 = gx - qa, fy3 = gy - qb;
        var cA = qb * nx + qa, cB = qb * nx + qa + 1;
        var cC = cA + nx, cD = cB + nx;
        var wA = (1 - fx3) * (1 - fy3), wB = fx3 * (1 - fy3);
        var wC = (1 - fx3) * fy3, wD = fx3 * fy3;
        var tv2 = Math.max(
          T[0][cA] * wA + T[0][cB] * wB + T[0][cC] * wC + T[0][cD] * wD,
          T[1][cA] * wA + T[1][cB] * wB + T[1][cC] * wC + T[1][cD] * wD,
        );
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
    // the solved field stays behind for the hover readout (bilinear sample)
    boardTemp = {
      img: img,
      max: maxT,
      T: T,
      nx: nx,
      ny: ny,
      bx: bb.x,
      by: bb.y,
      bw: bb.width,
      bh: bb.height,
      inB: inBoard,
      converged: btConverged,
    };
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
    // thermal view: the status bar reports the temperature under the cursor —
    // the trace's or via's own IPC rise when over copper, otherwise the
    // solved FR4 field bilinearly sampled at that point
    if (viewMode === 'thermal') {
      var dtHover = null;
      if (el) {
        if (el.__wireDT !== undefined) dtHover = { v: el.__wireDT, what: 'trace' };
        else if (el.__viaDT !== undefined) dtHover = { v: el.__viaDT, what: 'via' };
      }
      if (dtHover === null && boardTemp) {
        var bc2 = boardCoords(ev); // board coords, y-down
        var sx2 = bc2.x, sy2 = -bc2.y; // the sch group authors y-up
        var gxH = Math.max(0, Math.min(boardTemp.nx - 1.001, ((sx2 - boardTemp.bx) / (boardTemp.bw / boardTemp.nx)) - 0.5));
        var gyH = Math.max(0, Math.min(boardTemp.ny - 1.001, ((sy2 - boardTemp.by) / (boardTemp.bh / boardTemp.ny)) - 0.5));
        var qaH = Math.floor(gxH), qbH = Math.floor(gyH);
        var fxH = gxH - qaH, fyH = gyH - qbH;
        var cAH = qbH * boardTemp.nx + qaH, cBH = cAH + 1;
        var cCH = cAH + boardTemp.nx, cDH = cBH + boardTemp.nx;
        if (
          boardTemp.inB[cAH] || boardTemp.inB[cBH] ||
          boardTemp.inB[cCH] || boardTemp.inB[cDH]
        ) {
          var wAH = (1 - fxH) * (1 - fyH), wBH = fxH * (1 - fyH);
          var wCH = (1 - fxH) * fyH, wDH = fxH * fyH;
          var T0H = boardTemp.T[0], T1H = boardTemp.T[1];
          var tv0 = T0H[cAH] * wAH + T0H[cBH] * wBH + T0H[cCH] * wCH + T0H[cDH] * wDH;
          var tv1 = T1H[cAH] * wAH + T1H[cBH] * wBH + T1H[cCH] * wCH + T1H[cDH] * wDH;
          dtHover = { v: Math.max(tv0, tv1), what: 'board' };
        }
      }
      if (dtHover !== null) {
        var ambEl3 = document.getElementById('dt-ambient');
        var ambH = ambEl3 ? parseFloat(ambEl3.value) || 25 : 25;
        next +=
          ' \u00B7 ' + dtHover.what + ' +' + dtHover.v.toFixed(1) + '\u00B0C' +
          ' \u2248 ' + (ambH + dtHover.v).toFixed(1) + '\u00B0C';
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
  } else {
    // Keep the affordance stable: with no report the button stays visible in
    // a muted state and explains itself on click — a button that blinks out
    // of existence reads as breakage, not as "nothing to show"
    drcBtn.hidden = false;
    drcBtn.disabled = true;
    drcBtn.style.opacity = '0.4';
    drcBtn.title = 'no DRC report — run typeCAD: DRC (typecad-pcb drc)';
    drcBtn.addEventListener('click', function () {
      if (!statusLocked()) statusEl.textContent = 'no DRC report — run typeCAD: DRC';
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
  /* board canvas is a diagram, not a document: no text selection highlights
     (silk/fab stroke text, refdes labels) while dragging or double-clicking */
  #board, #board text { -webkit-user-select: none; user-select: none; }
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
  #comp-search { width: 100%; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 5px 8px; font: inherit; margin-bottom: 10px; }
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
  #layout-box { padding: 8px 14px 0; display: none; }
  #layout-box .side-label { color: var(--muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
  #layout-keys { display: flex; gap: 6px 10px; flex-wrap: wrap; row-gap: 6px; margin: 2px 0 8px; max-width: 100%; }
  #layout-keys .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 1.4; color: var(--muted); white-space: nowrap;
    width: auto; height: auto; border: 0; border-radius: 0; flex: none; }
  #layout-keys .chip::before { content: ''; display: inline-block; width: 16px; height: 0; flex: none; }
  #layout-keys .chip-dashed::before { border-top: 2px dashed currentColor; }
  #layout-keys .chip-solid::before { border-top: 2px solid currentColor; }
  #layout-keys .chip-grey::before { border-top: 2px solid rgba(128,128,128,0.35); }
  #layout-hint { color: var(--muted); font-size: 10px; line-height: 1.5; margin: 8px 0; }
  .layout-text-edit {
    position: fixed; z-index: 40; height: 26px; padding: 2px 8px;
    background: var(--chrome-bg); color: var(--chrome-fg);
    border: 1px solid #3884ff; border-radius: 4px; font: 13px ui-monospace, monospace;
  }
  .layout-text-edit:focus { outline: none; border-color: #6db3f2; }
  .layout-text-preview { fill: #d6d6d6; font-family: ui-monospace, monospace; }
  #layout-buttons { display: flex; gap: 6px; }
  #layout-buttons button, #layout-tools button { flex: 1; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 4px 6px; cursor: pointer; font: inherit; }
  #layout-buttons button:disabled, #layout-tools button:disabled { opacity: 0.5; cursor: default; }
  #layout-tools { display: flex; gap: 6px; margin-bottom: 6px; }
  #layout-warn { color: #d29922; font-size: 11px; line-height: 1.5; margin-bottom: 6px; word-break: break-word; }
  #layout-overlay .layout-comp.layout-warn rect,
  #layout-overlay .layout-comp.layout-warn polygon { stroke: #d29922; }
  #layout-ratsnest line { stroke: #d29922; stroke-width: 0.08; stroke-dasharray: 0.8 0.5; opacity: 0.85; }
  /* movable texts read as grabbable, and a grabbed one is highlighted */
  body.typecad-layout #yflip path[data-text] { cursor: move; }
  #yflip path.layout-text-sel { stroke: #6db3f2 !important; }
  /* the handle itself paints nothing — the footprint's own ink (pads, silk,
     fab outline) already shows the part, KiCad-style. It stays the pointer
     target via inherited pointer-events:all and only strokes on feedback:
     hover ghost, white selection, amber overlap/out-of-board warning */
  #layout-overlay .layout-comp rect,
  #layout-overlay .layout-comp polygon { fill: transparent; stroke: none; stroke-linejoin: round; }
  #layout-overlay .layout-comp.layout-back rect,
  #layout-overlay .layout-comp.layout-back polygon { stroke: none; fill: transparent; }
  #layout-overlay .layout-comp:hover rect,
  #layout-overlay .layout-comp:hover polygon { stroke: rgba(255,255,255,0.45); stroke-width: 0.12; fill: transparent; }
  #layout-overlay .layout-comp.layout-sel rect,
  #layout-overlay .layout-comp.layout-sel polygon { stroke: #ffffff; stroke-width: 0.15; }
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
    <option value="pcba">PCBA view</option>${options.blueprintSvg ? '\n    <option value="blueprint">Blueprint view</option>' : ''}${options.schematicSvg ? `\n    <option value="schematic">ngspice view</option>\n    <option value="thermal">Copper ΔT</option>` : ''}${
    options.layoutComponents && options.layoutComponents.length
      ? `
    <option value="layout">Layout</option>`
      : ''
  }
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
</div>`
      : ''
  }${
    options.layoutComponents && options.layoutComponents.length
      ? `
<div id="layout-box" style="display:none">
  <div class="side-label">Layout</div>
  <div id="layout-keys"><span class="chip chip-dashed">TrackBuilder</span><span class="chip chip-solid">autorouted</span><span class="chip chip-grey">ripped up</span></div>
  <label><input type="checkbox" id="layout-snap" checked> snap 0.5 mm</label>
  <div id="layout-hint">drag \u00b7 arrows nudge (Alt = 0.1 mm) \u00b7 R rotates \u00b7 shift-click selects several \u00b7 greyed copper rebuilds on apply \u00b7 texts: drag strokes to move, double-click to edit</div>
  <div id="layout-tools">
    <button id="layout-align" type="button" disabled>align row</button>
    <button id="layout-dist" type="button" disabled>distribute X</button>
  </div>
  <div id="layout-warn" style="display:none"></div>
  <div id="layout-buttons">
    <button id="layout-revert" type="button">revert</button>
    <button id="layout-apply" type="button">apply &amp; rebuild</button>
  </div>
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
  <script id="stackup" type="application/json">${
    options.stackup ? JSON.stringify(options.stackup).replace(/</g, '\\u003c') : ''
  }</script>
  <script id="routes" type="application/json">${
    options.routes ? JSON.stringify(options.routes).replace(/</g, '<') : ''
  }</script>
  <script id="layout-comps" type="application/json">${
    options.layoutComponents && options.layoutComponents.length
      ? JSON.stringify(options.layoutComponents).replace(/</g, '<')
      : ''
  }</script>
  <script id="layout-texts" type="application/json">${
    options.layoutTexts && options.layoutTexts.length ? JSON.stringify(options.layoutTexts).replace(/</g, '\\u003c') : ''
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
