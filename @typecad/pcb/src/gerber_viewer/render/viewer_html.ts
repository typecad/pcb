import type { LayerInfo } from '../detect_layer.js';
import type { DrcMarker, FabReport } from '../report.js';
import { LAYER_THEME_LIST, type LayerTheme } from '../themes.js';

export interface ViewerOptions {
  /**
   * build/generation stamp embedded as <meta name="tc-viewer-build">.
   * Defaults to the generation timestamp. The vscode extension logs it on
   * every page assignment, making "which page build is this webview
   * running" answerable from its output channel.
   */
  buildTag?: string;
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
   * board design rules (build/<board>_rules.json, from the .kicad_pro):
   * the layout view's trace-width floor — width stepping refuses to go
   * below it and the readout warns. Absent = no floor check.
   */
  rules?: {
    minTrackWidthMm?: number;
    minViaDiameterMm?: number;
    minClearanceMm?: number;
    minCopperEdgeClearanceMm?: number;
    netClasses?: Record<string, { width?: number; viaSize?: number; viaDrill?: number }>;
    netClassPatterns?: Array<{ pattern: string; class: string }>;
  } | null;
  /**
   * per-net route provenance (build/<board>_routes.json): which nets a
   * TrackBuilder hand-built vs the autorouter routed — the Layout view's
   * trace indication. Absent = every trace reads as autorouted.
   */
  routes?: {
    nets: Record<string, { provenance: 'manual' | 'auto' | 'mixed' }>;
    /** netless hand routes: declaration site + polyline (board mm, y-down) */
    unnamed?: Array<{ source: string; pts: Array<{ x: number; y: number }> }>;
  } | null;
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
      layerKind?: 'silkscreen' | 'fab';
      w?: number;
      thickness?: number;
      italic?: boolean;
      bold?: boolean;
      font?: string;
      justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
    }>;
  }>;
  /**
   * silk/fab board texts (gr_text — the `pcb.text()` API), parsed from the
   * board file in the gerber (y-up) frame. The layout view claims their
   * stroke paths: drag to reposition, double-click to edit the value in
   * place; apply rewrites the source `.text({ ... })` literals. The style
   * fields (w/thickness/italic/bold/font/justify) mirror the pcb.text()
   * options and feed the properties panel.
   */
  layoutTexts?: Array<{
    text: string;
    x: number;
    y: number;
    rot: number;
    side: 'front' | 'back';
    h: number;
    layerKind?: 'silkscreen' | 'fab';
    w?: number;
    thickness?: number;
    italic?: boolean;
    bold?: boolean;
    font?: string;
    justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
  }>;
  /**
   * theme picker entries for the pcba view: surface colors per builtin. The
   * switcher remaps the embedded render's flat colors client-side — one
   * render serves every theme, no re-render needed
   */
  pcbaThemes?: Array<{ id: string; label: string; colors: Record<string, string> }>;
  /**
   * layer themes for the gerber/layout views (KiCad color-theme board
   * sections). Defaults to the vendored set; each layer's ink flows through
   * a CSS variable so the switch is a client-side restyle. Pass [] to omit
   * the picker entirely.
   */
  layerThemes?: import('../themes.js').LayerTheme[];
  /**
   * pad labels from the PCB model (build/<board>_pads.json): pin number +
   * net name per pad with world position/extent. The page renders them on
   * every copper layer the pad touches.
   */
  padLabels?: Array<{
    ref: string;
    pin: string;
    net: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    layers: string[];
  }> | null;
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


/**
 * Wrap a rendered board SVG in a self-contained HTML page: layer toggles with
 * per-layer opacity, wheel zoom (about the cursor), drag panning, fit button
 * and a live coordinate readout in board units. No external assets, works from
 * file://.
 */
export function buildViewerHtml(svg: string, layers: LayerInfo[], options: ViewerOptions = {}): string {
  const title = options.title ?? 'gerber-viewer';
  // stamped into <meta name="tc-viewer-build"> — the vscode extension logs
  // it every time it assigns a page, so "which generation is this webview
  // running" is answerable from the output channel instead of guessed
  const buildTag = options.buildTag ?? new Date().toISOString();

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
  // keyboard focus target: board presses cancel their pointerdown default
  // (drag grabs, route anchors, segment picks), which ALSO cancels the
  // default focus handoff — inside the vscode webview the keyboard then
  // stays with the editor and X/U/Delete do nothing until some other click
  // happens to focus the page. Make the svg focusable so those presses can
  // hand focus over explicitly (below, with the other svg listeners).
  svg.setAttribute('tabindex', '-1');
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
  // board design rules island (build/<board>_rules.json): the trace-width
  // floor for the layout view's width control. Absent in plain renders
  var rules = null;
  try {
    var rawRules = JSON.parse(document.getElementById('rules').textContent);
    if (rawRules && (rawRules.minTrackWidthMm > 0 || rawRules.netClasses)) rules = rawRules;
  } catch (e) {}
  // the net's class (first regex pattern that matches its name) — the class
  // carries width/via defaults that outrank the copper heuristics
  function netClassFor(net) {
    if (!rules || !net || !rules.netClasses || !rules.netClassPatterns) return null;
    for (var i = 0; i < rules.netClassPatterns.length; i++) {
      var p = rules.netClassPatterns[i];
      var def = rules.netClasses[p.class];
      if (!def) continue;
      try {
        if (new RegExp(p.pattern, 'i').test(net)) return def;
      } catch (e) {}
    }
    return null;
  }
  // the class NAME with its def — the properties panel names the class a
  // net belongs to (netClassFor returns the def alone)
  function netClassInfo(net) {
    if (!rules || !net || !rules.netClasses || !rules.netClassPatterns) return null;
    for (var i = 0; i < rules.netClassPatterns.length; i++) {
      var p = rules.netClassPatterns[i];
      var def = rules.netClasses[p.class];
      if (!def) continue;
      try {
        if (new RegExp(p.pattern, 'i').test(net)) return { name: p.class, def: def };
      } catch (e) {}
    }
    return null;
  }
  // one compact line describing a class def (width / via / clearance, each
  // only when the class actually carries it)
  function netClassLine(info) {
    var parts = [];
    if (info.def.width > 0) parts.push('w ' + fmtW(info.def.width) + ' mm');
    if (info.def.viaSize > 0) parts.push('via \u2300' + fmtW(info.def.viaSize));
    if (info.def.viaDrill > 0) parts.push('drill ' + fmtW(info.def.viaDrill));
    if (info.def.clearance > 0) parts.push('clr ' + fmtW(info.def.clearance));
    return 'net class ' + info.name + ': ' + parts.join(' \u00b7 ');
  }
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
  // Auto-scale floor, °C: a board whose every rise is millidegrees is
  // thermally quiet, but a ramp normalized to that max still painted the
  // relatively-hottest trace full-scale WHITE (the hot end of the stops)
  // while the hover readout rounded the same rise to +0.0°C — color and text
  // contradicted each other. Boards flatter than this render all-cold; the
  // legend carries the true range.
  var DT_AUTO_FLOOR = 1;
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
    var hi = margin && allowed > 0 ? allowed : Math.max(dtItems.maxDT, DT_AUTO_FLOOR);
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
  var layoutRipped = []; // autorouter copper ripped (hidden) until rebuild
  // unnamed routes ripped by a part move: {idx, a, b} where each endpoint
  // is either {ref,pin} (bound to a pad, follows the part live) or {fixed}
  var rippedUnnamed = [];
  var rippedUnnamedIdx = {};
  // does an ISLAND-frame point sit on one of this part's pads? (ripup
  // binding — the manifest owns pad identity + extents, the island owns
  // the part's current pose)
  function manifestPadPos(comp, pm) {
    var mv = layoutMoves[comp.ref];
    var ox = pm.x - comp.x;
    var oy = -pm.y - comp.y; // manifest board pad -> island offset
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
  }
  function compPadAtPoint(comp, gx, gy) {
    // tests the AUTHORED pose (manifest position, y negated to island): the
    // route endpoints were built against it, and by commit time the part
    // has already moved away from them
    for (var bp = 0; bp < padManifest.length; bp++) {
      var pm = padManifest[bp];
      if (pm.ref !== comp.ref) continue;
      if (Math.abs(gx - pm.x) <= pm.w / 2 + 0.2 && Math.abs(gy + pm.y) <= pm.h / 2 + 0.2)
        return { ref: comp.ref, pin: String(pm.pin) };
    }
    return null;
  }
  function compByRef(ref) {
    for (var cb = 0; cb < layoutComps.length; cb++) if (layoutComps[cb].ref === ref) return layoutComps[cb];
    return null;
  }
  function manifestPad(ref, pin) {
    for (var mp = 0; mp < padManifest.length; mp++)
      if (padManifest[mp].ref === ref && String(padManifest[mp].pin) === String(pin)) return padManifest[mp];
    return null;
  }
  function unnamedEndPos(bind) {
    var comp = compByRef(bind.ref);
    var pm = manifestPad(bind.ref, bind.pin);
    return comp && pm ? manifestPadPos(comp, pm) : null;
  }
  var layoutSel = []; // refs — shift-click extends, click replaces
  var layoutRot = {}; // ref -> accumulated 90-degree presses (R key)
  var layoutSnapBox = document.getElementById('layout-snap');
  var layoutApplyBtn = document.getElementById('layout-apply');
  // grid / units controls: the snap ladder, visible grid, and mil readouts
  var layoutGridSel = document.getElementById('layout-grid');
  if (layoutGridSel)
    layoutGridSel.addEventListener('change', function () {
      layoutGridSize = parseFloat(layoutGridSel.value) || 0.5;
      rebuildLayoutGrid();
    });
  var layoutGridShowBox = document.getElementById('layout-grid-show');
  if (layoutGridShowBox)
    layoutGridShowBox.addEventListener('change', function () {
      layoutGridShow = layoutGridShowBox.checked;
      rebuildLayoutGrid();
    });
  var layoutMilBox = document.getElementById('layout-mil');
  if (layoutMilBox)
    layoutMilBox.addEventListener('change', function () {
      layoutMil = layoutMilBox.checked;
    });
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
      if (el2.__bakedTr0) {
        // a fast apply froze the ink's cumulative offset as this element's
        // base; new deltas PREPEND (world-frame translation — appending
        // after a rotated base would send the ink off at the wrong angle)
        el2.setAttribute('transform', tr ? tr + ' ' + el2.__bakedTr0 : el2.__bakedTr0);
      } else if (tr) el2.setAttribute('transform', tr);
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
    // keep-upright (KiCad's default for fp_texts): a total angle in the
    // upside-down half flips 180° about the label's transported anchor, so
    // a part's labels always read left→right when horizontal and
    // bottom→top when vertical — same rule the gerber plotter applies, so
    // the preview and the rebuilt board agree
    var flipTr = '';
    if (t.ref) {
      var compRot = layoutRot[t.ref] || (layoutMoves[t.ref] ? layoutMoves[t.ref].rot || 0 : 0);
      var total = (t.rot || 0) + compRot * 90 + (m && m.rot ? m.rot * 90 : 0);
      var tn = ((total % 360) + 360) % 360;
      if (tn > 90 && tn <= 270) {
        var fa = labelBase(i);
        var fx = fa.x + (m ? m.ox || 0 : 0);
        var fy = fa.y + (m ? m.oy || 0 : 0);
        flipTr = 'rotate(180,' + fx + ',' + fy + ')';
      }
    }
    if (flipTr) tr = tr ? flipTr + ' ' + tr : flipTr;
    for (var tp = 0; tp < paths.length; tp++) {
      if (tr) paths[tp].setAttribute('transform', tr);
      else if (paths[tp].__layoutTr0 === null || paths[tp].__layoutTr0 === undefined) paths[tp].removeAttribute('transform');
      else paths[tp].setAttribute('transform', paths[tp].__layoutTr0);
    }
  }
  // full visual sync for text i: ghost transform + edited-value preview
  // (strokes hidden, SVG text standing in) — safe to call in any state, so
  // enter/exit/revert all funnel through it
  // does a pending style edit actually differ from the authored one? A
  // move that only repositioned the text keeps its real stroke glyphs —
  // the plain <text> preview stands in only when content or style changed
  function textStyleChanged(t, sty) {
    if (!sty) return false;
    var hA = t.h || 1.27;
    var wA = t.w !== undefined ? t.w : hA;
    var thA = t.thickness !== undefined ? t.thickness : 0.15;
    var jA = t.justify || {};
    return (
      Math.abs((sty.h || 0) - hA) > 1e-4 ||
      Math.abs((sty.w || 0) - wA) > 1e-4 ||
      Math.abs((sty.thickness || 0) - thA) > 1e-4 ||
      !!sty.italic !== !!t.italic ||
      !!sty.bold !== !!t.bold ||
      ((sty.font || '') !== '' && sty.font !== (t.font || '')) ||
      (sty.justify
        ? (sty.justify.horizontal || 'center') !== (jA.horizontal || 'center') ||
          (sty.justify.vertical || 'middle') !== (jA.vertical || 'middle') ||
          !!sty.justify.mirror !== !!jA.mirror
        : false)
    );
  }
  function syncTextVisual(i) {
    var t = layoutTexts[i];
    var st = layoutTextEls[i];
    if (!st) st = layoutTextEls[i] = { paths: textPaths(i), hidden: false, preview: null };
    applyTextGhost(i);
    var tm3 = layoutTextMoves[i];
    var edited = !!tm3 && (tm3.text !== undefined ? tm3.text !== t.text : false) || textStyleChanged(t, tm3 && tm3.style);
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
    // the back side, matching how back-layer glyphs plot). Size, weight,
    // slant and justification follow the pending style edit so the preview
    // approximates what the rebuild will plot.
    var st = layoutTextEls[i];
    var t = layoutTexts[i];
    var m = layoutTextMoves[i];
    var sty = (m && m.style) || {};
    var jf = sty.justify || t.justify || {};
    st.preview.setAttribute('font-size', (sty.h !== undefined ? sty.h : t.h).toFixed(2));
    st.preview.setAttribute('font-style', (sty.italic !== undefined ? sty.italic : !!t.italic) ? 'italic' : 'normal');
    st.preview.setAttribute('font-weight', (sty.bold !== undefined ? sty.bold : !!t.bold) ? '700' : '400');
    // inside the y-negating scale, local +y renders upward: text-after-edge
    // glyphs sit above the anchor = KiCad's 'top' justify
    st.preview.setAttribute(
      'dominant-baseline',
      (jf.vertical || 'middle') === 'top' ? 'text-after-edge' : (jf.vertical || 'middle') === 'bottom' ? 'text-before-edge' : 'central',
    );
    st.preview.setAttribute('text-anchor', (jf.horizontal || 'center') === 'left' ? 'start' : (jf.horizontal || 'center') === 'right' ? 'end' : 'middle');
    st.preview.textContent = m && m.text !== undefined ? m.text : t.text;
    var eff = textState(i);
    var x = eff.x;
    var y = eff.y;
    var flip = t.side === 'back' ? -1 : 1;
    var tr = 'translate(' + x + ',' + y + ') scale(' + flip + ',' + -flip + ')';
    if (m && m.rot) tr += ' rotate(' + m.rot * 90 * flip + ')';
    // keep-upright, same rule as the stroke ghost and the plotter: the
    // composed angle's upside-down half flips 180°, so an edited label
    // previews readable on rotated parts too
    if (t.ref) {
      var cpr = layoutRot[t.ref] || (layoutMoves[t.ref] ? layoutMoves[t.ref].rot || 0 : 0);
      var tt = ((t.rot || 0) + cpr * 90 + (m && m.rot ? m.rot * 90 : 0)) % 360;
      if (tt < 0) tt += 360;
      if (tt > 90 && tt <= 270) tr += ' rotate(180)';
    }
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
    propsSync('text');
  }
  function attachTextDrag(i) {
    var paths = textPaths(i);
    for (var pd = 0; pd < paths.length; pd++) {
      paths[pd].addEventListener('pointerdown', function (ev) {
        if (viewMode !== 'layout') return;
        if (ev.button !== 0) return; // right/middle → board pan (fall through)
        ev.stopPropagation();
        ev.preventDefault();
        var wasSel = layoutTextSel === i;
        layoutTextSel = i;
        layoutSel = [];
        markLayoutSel();
        markTextSel();
        if (!wasSel) {
          // selection-first like components: this press selects only
          if (statusEl && !statusLocked())
            statusEl.textContent = 'text "' + layoutTexts[i].text.slice(0, 18) + '" selected — drag to move';
          return;
        }
        var t = layoutTexts[i];
        var st = textState(i);
        var startG = gerberAt(ev.clientX, ev.clientY);
        var orig = { x: st.x, y: st.y };
        function onMove(e2) {
          var pg = gerberAt(e2.clientX, e2.clientY);
          var nx = orig.x + (pg.x - startG.x);
          var ny = orig.y + (pg.y - startG.y);
          if (!layoutSnapBox || layoutSnapBox.checked) {
            nx = Math.round(nx / layoutGridSize) * layoutGridSize;
            ny = Math.round(ny / layoutGridSize) * layoutGridSize;
          }
          commitTextMove(i, nx, ny);
          if (statusEl && !statusLocked())
            statusEl.textContent = t.text.slice(0, 18) + ' \u2192 ' + fmtPos(nx) + ', ' + fmtPos(-ny);
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
        var editsBefore = edits[ref] !== undefined ? edits[ref] : null;
        var editsAfter = inp.value;
        edits[ref] = inp.value;
        syncCompTextVisuals(true);
        renderLayoutMoves();
        pushUndo(
          (kind === 'reference' ? 'rename ' : 'value ') + ref,
          function () {
            if (editsBefore === null) delete edits[ref];
            else edits[ref] = editsBefore;
            syncCompTextVisuals(true);
            renderLayoutMoves();
          },
          function () {
            edits[ref] = editsAfter;
            syncCompTextVisuals(true);
            renderLayoutMoves();
          },
        );
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
    propsSync('part');
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
  // ---- session undo/redo: a command-pattern stack over the live editing
  // state (moves, rotations, routes, deletes, ref/value edits). Each action
  // closes over its own before/after; Ctrl+Z / Ctrl+Y walk the stacks. The
  // apply bridge stays the source-of-truth commit — this is board-editor
  // feel for everything between applies ----
  var undoStack = [];
  var redoStack = [];
  function pushUndo(label, undo, redo) {
    undoStack.push({ label: label, undo: undo, redo: redo });
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  function historyResync(msg) {
    renderLayoutMoves();
    refreshLayoutWarnings();
    refreshRatsnest();
    // heal transient selection state: an undone action may have restored
    // ink carrying stale visuals (a resurrected overlay, via rings from
    // before the delete) — both syncs rebuild from the LIVE sets, so a real
    // selection survives and orphaned highlights die
    segHiSync();
    viaHiSync();
    if (statusEl && !statusLocked()) statusEl.textContent = msg;
  }
  function runUndo() {
    var a = undoStack.pop();
    if (!a) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'nothing to undo';
      return;
    }
    a.undo();
    redoStack.push(a);
    historyResync('undid: ' + a.label);
  }
  function runRedo() {
    var a = redoStack.pop();
    if (!a) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'nothing to redo';
      return;
    }
    a.redo();
    undoStack.push(a);
    historyResync('redid: ' + a.label);
  }
  // generic DOM add/remove capture for one action (segment ink, committed
  // tracks, barrels) — transient groups (#route-ui, #ratsnest) are filtered
  // out: they rebuild themselves and resurrecting stale ones is worse
  function domCapSkip(node) {
    if (!node) return true;
    var p = node.parentNode && node.parentNode.closest ? node.parentNode : node;
    // transient VISUALS are skipped too: the selection overlay and the pad
    // highlight clones are presentation, not board state — capturing their
    // removal would let an undo resurrect a selection nobody owns (seen as
    // tracks stuck highlighted after Ctrl+Z of a delete)
    return !!(p && p.closest && p.closest('#route-ui, #ratsnest, #drc, .route-sel, .pad-hi-ink, .layout-text-preview'));
  }
  function domCaptureStart() {
    var added = [];
    var removed = [];
    var push = function (rs) {
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        for (var j = 0; j < r.addedNodes.length; j++)
          if (!domCapSkip(r.addedNodes[j])) added.push({ n: r.addedNodes[j], parent: r.target });
        for (var k = 0; k < r.removedNodes.length; k++)
          if (!domCapSkip(r.removedNodes[k])) removed.push({ n: r.removedNodes[k], parent: r.target, prev: r.previousSibling });
      }
    };
    var obs = new MutationObserver(push);
    obs.observe(document.getElementById('panzoom'), { childList: true, subtree: true });
    domCap = { obs: obs, added: added, removed: removed, push: push };
  }
  function domCaptureEnd() {
    if (!domCap) return null;
    // MutationObserver delivers asynchronously — drain what hasn't reached
    // the callback yet, or disconnect() would silently discard it
    domCap.push(domCap.obs.takeRecords());
    domCap.obs.disconnect();
    var cap = { added: domCap.added, removed: domCap.removed };
    domCap = null;
    return cap;
  }
  /** dir -1 reverts the captured mutations, +1 reapplies them */
  function domApply(cap, dir) {
    if (!cap) return;
    var i;
    if (dir < 0) {
      for (i = cap.added.length - 1; i >= 0; i--) if (cap.added[i].n.parentNode) cap.added[i].n.remove();
      for (i = cap.removed.length - 1; i >= 0; i--) {
        var r = cap.removed[i];
        if (!r.n.parentNode) {
          if (r.prev && r.prev.parentNode === r.parent) r.parent.insertBefore(r.n, r.prev);
          else r.parent.appendChild(r.n);
        }
      }
    } else {
      for (i = 0; i < cap.removed.length; i++) if (cap.removed[i].n.parentNode) cap.removed[i].n.remove();
      for (i = 0; i < cap.added.length; i++) if (!cap.added[i].n.parentNode) cap.added[i].parent.appendChild(cap.added[i].n);
    }
  }
  var domCap = null;
  // moves/rotations snapshot per ref
  function snapMoves(refs) {
    var s = {};
    for (var i = 0; i < refs.length; i++) {
      var r = refs[i];
      s[r] = {
        move: layoutMoves[r] ? JSON.parse(JSON.stringify(layoutMoves[r])) : null,
        rot: layoutRot[r] || 0,
      };
    }
    return s;
  }
  function restoreMoves(s) {
    for (var r in s) {
      if (s[r].move) layoutMoves[r] = s[r].move;
      else delete layoutMoves[r];
      if (s[r].rot) layoutRot[r] = s[r].rot;
      else delete layoutRot[r];
      var g = layoutOverlay ? layoutOverlay.querySelector('[data-ref="' + cssEsc(r) + '"]') : null;
      if (g) {
        // position from the RESTORED state — compStateAt would just echo
        // the group's current (post-action) position
        var c = g.__lc;
        var m = layoutMoves[r];
        setCompPos(g, m ? m.x : c.x, m ? m.y : c.y);
        applyCompGhost(g);
      }
      for (var ti = 0; ti < layoutTexts.length; ti++) if (layoutTexts[ti].ref === r) syncTextVisual(ti);
    }
  }
  /** un-rip ink ripped since index n (LIFO), restoring each element's display */
  function restoreRippedTo(n) {
    while (layoutRipped.length > n) {
      var el = layoutRipped.pop();
      if (el.__layoutOp === '') el.removeAttribute('display');
      else el.setAttribute('display', el.__layoutOp);
      el.__layoutOp = undefined;
      el.__ripped = 0;
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
      // left only: right/middle are board panning and fall through to the
      // svg handler untouched (no stopPropagation on this path)
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      // a fresh part press replaces the ink selection too — a trace left
      // selected (and its net dimming the board) under a part grab would
      // keep owning the sizing keys. Cleared BEFORE the pad resolution
      // below so a pressed pad's own net dim re-applies over it
      if (!ev.shiftKey) {
        if (segSel.size) {
          segSel.clear();
          segHiSync();
        }
        if (viaSel.size) {
          viaSel.clear();
          viaHiSync();
        }
        if (netDimmed.length) clearNetHighlight();
      }
      // a press on a pad flash highlights that pad for routing (X) — the
      // component select/drag flow continues unchanged underneath
      var pe = ev.target;
      var hitPad = null;
      if (pe && pe.getAttribute && pe.getAttribute('data-pin')) {
        var pref = pe.getAttribute('data-ref');
        var ppin = pe.getAttribute('data-pin');
        for (var ph = 0; ph < padManifest.length; ph++) {
          var pc = padManifest[ph];
          if (pc.ref === pref && String(pc.pin) === ppin) {
            hitPad = pc;
            break;
          }
        }
      }
      if (!hitPad) {
        // the part's own outline polygon intercepts every hit over the
        // body, so a pad hiding under it (every BGA ball) never surfaces as
        // ev.target — resolve the pressed part's pads from the manifest
        // instead (nearest center wins at fine BGA pitch)
        var bp = padBoardPoint(ev);
        hitPad = padAtBoard(bp.x, bp.y, g.__lc.ref);
      }
      if (hitPad) {
        setPadHighlight(hitPad);
        // KiCad parity: pressing a pad lights its whole net (dims the rest)
        if (hitPad.net) highlightNet('data-net', hitPad.net);
      }
      layoutTextSel = -1; // a part grab replaces any text grab
      markTextSel();
      // captured BEFORE any selection collapse: a DRAG moves the whole
      // pre-press selection (KiCad), while a plain click narrows it below
      var dragRefs = layoutSel.indexOf(g.__lc.ref) !== -1 && layoutSel.length > 1 ? layoutSel.slice() : [g.__lc.ref];
      var alreadySel = layoutSel.indexOf(g.__lc.ref) !== -1;
      if (ev.shiftKey && !alreadySel) {
        layoutSel.push(g.__lc.ref);
        markLayoutSel();
        if (statusEl && !statusLocked())
          statusEl.textContent = g.__lc.ref + ' selected — drag to move, R to rotate';
        return;
      }
      if (!ev.shiftKey && !alreadySel) {
        // selection-first: this press selects; the part moves on the NEXT
        // press-drag of the now-selected part — never a grab-by-surprise
        layoutSel = [g.__lc.ref];
        markLayoutSel();
        if (statusEl && !statusLocked())
          statusEl.textContent = g.__lc.ref + ' selected — drag to move, R to rotate';
        return;
      }
      if (!ev.shiftKey && alreadySel && layoutSel.length > 1 && false) {
        // (superseded: the pre-press selection is captured above, so a
        // drag moves all of it; a plain click still narrows via onUp's
        // !moved branch below)
      }
      // a press on an already-selected part (drag or plain re-click) also
      // re-asserts it as the properties target — an open E panel follows
      markLayoutSel();
      var startG = gerberAt(ev.clientX, ev.clientY);
      var moved = false;
      var origs = {};
      var groups = [];
      for (var dr = 0; dr < dragRefs.length; dr++) {
        var dg = layoutOverlay.querySelector('[data-ref="' + cssEsc(dragRefs[dr]) + '"]');
        if (!dg) continue;
        origs[dragRefs[dr]] = { x: dg.__lx, y: dg.__ly };
        groups.push(dg);
      }
      var mvBefore = snapMoves(dragRefs);
      var ripBefore = layoutRipped.length;
      // the ratsnest redraws DURING the drag (throttled — a full
      // connectivity rebuild per mousemove jitters on big boards), so the
      // stranded wires follow the part in real time instead of snapping at
      // release; onUp's commitLayoutMove does the unthrottled final pass
      var lastRats = 0;
      function onMove(e2) {
        var pg = gerberAt(e2.clientX, e2.clientY);
        var dx = pg.x - startG.x;
        var dy = pg.y - startG.y;
        if (!moved) {
          moved = true;
          // the press may have resolved a pad (its blue selection box sits
          // at the PRE-move position) — once the part actually moves, that
          // ghost box must go, or it lingers where the part used to be
          clearPadHighlight();
        }
        for (var mi = 0; mi < groups.length; mi++) {
          var mg = groups[mi];
          var mr = mg.__lc.ref;
          var nx = origs[mr].x + dx;
          var ny = origs[mr].y + dy;
          if (!layoutSnapBox || layoutSnapBox.checked) {
            nx = Math.round(nx / layoutGridSize) * layoutGridSize;
            ny = Math.round(ny / layoutGridSize) * layoutGridSize;
          }
          setCompPos(mg, nx, ny);
          applyCompGhost(mg); // the whole footprint drags along, like KiCad
          // the pending move goes LIVE mid-drag — everything that rides it
          // (labels, edited-value previews, compTrStr readers) follows the
          // body in real time instead of snapping at release. Same shape
          // commitLayoutMove finalizes.
          layoutMoves[mr] = {
            x: mg.__lx,
            y: mg.__ly,
            x0: mg.__lc.x,
            y0: mg.__lc.y,
            rot: layoutRot[mr] || 0,
          };
          for (var lr = 0; lr < layoutTexts.length; lr++) {
            if (layoutTexts[lr].ref === mr) syncTextVisual(lr);
          }
        }
        var now = Date.now();
        if (now - lastRats > 50) {
          lastRats = now;
          refreshRatsnest();
        }
        moved = true;
        if (statusEl && !statusLocked())
          statusEl.textContent =
            g.__lc.ref + (dragRefs.length > 1 ? ' (+' + (dragRefs.length - 1) + ')' : '') +
            ' \u2192 ' + fmtPos(nx) + ', ' + fmtPos(-ny);
        e2.preventDefault();
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (moved) {
          for (var ci = 0; ci < groups.length; ci++) commitLayoutMove(groups[ci]);
          var mvAfter = snapMoves(dragRefs);
          var rippedNow = layoutRipped.slice(ripBefore);
          pushUndo(
            'move ' + dragRefs.join(', '),
            function () {
              restoreMoves(mvBefore);
              restoreRippedTo(ripBefore);
            },
            function () {
              restoreMoves(mvAfter);
              for (var ri = 0; ri < rippedNow.length; ri++) ripUpEl(rippedNow[ri]);
            },
          );
        } else if (ev.shiftKey && alreadySel) {
          // shift-click on a selected part toggles it back out of the
          // selection (a shift-DRAG still moves it — moved covers that)
          layoutSel.splice(layoutSel.indexOf(g.__lc.ref), 1);
          markLayoutSel();
        } else if (dragRefs.length > 1) {
          // plain CLICK (no drag) on one of several selected parts narrows
          // the selection to it — the drag path above moved the whole set
          layoutSel = [g.__lc.ref];
          markLayoutSel();
        }
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  }
  function ripUpEl(el) {
    if (el.__layoutOp !== undefined) return;
    // the ink LEAVES (display:none, not a grey-out): a hidden track stops
    // counting as the net's copper, so the ratsnest wires come back for it
    // until the rebuild re-runs the autorouter
    el.__layoutOp = el.getAttribute('display') || '';
    el.setAttribute('display', 'none');
    el.__ripped = 1;
    layoutRipped.push(el);
    // the candy-cane overlay of an autorouter track rides its trace
    if (el.__stripe) ripUpEl(el.__stripe);
    // the drill hole rides its barrel
    if (el.__hole) ripUpEl(el.__hole);
  }
  function commitLayoutMove(g) {
    var c = g.__lc;
    layoutMoves[c.ref] = { x: g.__lx, y: g.__ly, x0: c.x, y0: c.y, rot: layoutRot[c.ref] || 0 };
    // the whole footprint travels with the move — pads, mask/paste, fab,
    // courtyard, silkscreen and drills land at the new position, bright,
    // exactly like KiCad; nothing of the part lingers at the old spot
    applyCompGhost(g);
    // rip up: the net's ROUTING leaves until a rebuild regenerates it —
    // traces and vias only, and only AUTOROUTER nets: a manual or mixed
    // net's copper is a TrackBuilder polyline authored in source, it stays
    // exactly as drawn. Footprints never rip: each part's pads belong to
    // its own (possibly moving) footprint, so data-ref elements are left
    // alone whether they just moved or belong to a neighbor
    for (var rn = 0; rn < c.nets.length; rn++) {
      var rprov = routeProvenance[c.nets[rn]];
      if (rprov === 'manual' || rprov === 'mixed') continue;
      var netEls = viewGroups.gerber.querySelectorAll('[data-net="' + cssEsc(c.nets[rn]) + '"]');
      for (var re = 0; re < netEls.length; re++) {
        if (netEls[re].getAttribute('data-ref')) continue;
        ripUpEl(netEls[re]);
      }
    }
    // applied interactive (unnamed) routes are the machine class too: rip
    // one when either endpoint binds to a pad of the moving part — the
    // ratsnest re-wires its endpoints until the rebuild re-routes it
    for (var ur = 0; ur < unnamedRoutes.length; ur++) {
      if (rippedUnnamedIdx[ur]) continue;
      var upts = unnamedRoutes[ur].pts;
      var ga = { x: upts[0].x, y: -upts[0].y }; // board y-down -> island
      var gb2 = { x: upts[upts.length - 1].x, y: -upts[upts.length - 1].y };
      var bindA = compPadAtPoint(c, ga.x, ga.y);
      var bindB = compPadAtPoint(c, gb2.x, gb2.y);
      if (!bindA && !bindB) continue;
      rippedUnnamedIdx[ur] = 1;
      rippedUnnamed.push({ idx: ur, a: bindA || { fixed: ga }, b: bindB || { fixed: gb2 } });
      var uink = unnamedInk[ur] || [];
      for (var ik = 0; ik < uink.length; ik++) ripUpEl(uink[ik]);
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
        !Object.keys(layoutMoves).length && !Object.keys(layoutTextMoves).length && !nVal && !routedTracks.length && !routedDeletes.length;
    // every state-changing op funnels through here — the pending-apply
    // snapshot rides along (undo/redo included, via historyResync)
    persistPending();
    // an open properties panel tracks the move/rotate/resize that just
    // landed — no gesture kind, this refreshes whatever it is showing
    propsSync();
  }
  function layoutRevert() {
    // nothing pending (e.g. right after a fast apply wrote source) —
    // reverting would show authored visuals while the source holds the
    // moved positions
    if (
      !Object.keys(layoutMoves).length &&
      !Object.keys(layoutTextMoves).length &&
      !Object.keys(layoutValueEdits).length &&
      !Object.keys(layoutRefEdits).length &&
      !routedTracks.length &&
      !routedDeletes.length
    ) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'nothing to revert \u2014 no pending edits (the last apply already wrote source)';
      return;
    }
    // the session resets wholesale: stale undo/redo entries would resurrect
    // moves the user just reverted
    undoStack = [];
    redoStack = [];
    for (var r = 0; r < layoutRipped.length; r++) {
      var el = layoutRipped[r];
      if (el.__layoutOp === '') el.removeAttribute('display');
      else el.setAttribute('display', el.__layoutOp);
      el.__layoutOp = undefined;
      el.__ripped = 0;
    }
    rippedUnnamed = [];
    rippedUnnamedIdx = {};
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
      // the board frame with rotation as accumulated 90-degree presses, and
      // a style block when the size/font/justification was edited
      var texts = [];
      for (var ti in layoutTextMoves) {
        var ti2 = parseInt(ti, 10);
        var tbt = layoutTexts[ti2];
        if (tbt && tbt.kind && tbt.kind !== 'board') continue; // labels ride their own array
        var tm = layoutTextMoves[ti];
        var te = {
          text0: tm.text0,
          x0: tbt.x,
          y0: -tbt.y,
          text: tm.text !== undefined ? tm.text : tm.text0,
          x: +(tbt.x + (tm.ox || 0)).toFixed(4),
          y: -(+(tbt.y + (tm.oy || 0)).toFixed(4)),
          rot: (tm.rot || 0) * 90,
        };
        if (tm.style) te.style = tm.style;
        texts.push(te);
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
      // host converts to footprint-local against the part's final placement.
      // A style diff rides along when size/font/justification were edited
      var labels = [];
      for (var li in layoutTextMoves) {
        var lix = parseInt(li, 10);
        var lt = layoutTexts[lix];
        if (!lt || !lt.kind || lt.kind === 'board') continue;
        var lm = layoutTextMoves[li];
        var leff = labelBase(lix);
        var le = {
          ref: lt.ref,
          kind: lt.kind,
          x: +(leff.x + (lm.ox || 0)).toFixed(4),
          y: -(+(leff.y + (lm.oy || 0)).toFixed(4)),
          rot: ((lm.rot || 0) * 90 + (lt.rot || 0)) % 360,
        };
        if (lm.style) le.style = lm.style;
        labels.push(le);
      }
      layoutApplyBtn.disabled = true;
      layoutApplyBtn.textContent = 'rebuilding\u2026';
      window.typecadLayoutApply(moves, texts, values, labels, renames, routedTracks, routedDeletes, function (err, fast) {
        layoutApplyBtn.disabled = false;
        layoutApplyBtn.textContent = 'apply & rebuild';
        if (err && statusEl) statusEl.textContent = 'layout apply failed: ' + err;
        else if (fast && window.__typecadSessionApplied) {
          // fast path: source written, rebuild deferred — keep the visual
          // state (ghosts already match the source), drop the session's
          // pending edits so nothing double-applies
          window.__typecadSessionApplied();
        } else {
          routedTracks = []; // now source-owned: the rebuild re-renders them
          routedDeletes = [];
          persistPending();
        }
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
      if (statusEl && !statusLocked()) statusEl.textContent = 'click a component first \u2014 R rotates the selection';
      return;
    }
    if (layoutSel.length) {
      var rotRefs = layoutSel.slice();
      var rotBefore = snapMoves(rotRefs);
      var rotRipBefore = layoutRipped.length;
      for (var rs = 0; rs < rotRefs.length; rs++) {
        var gRot = layoutOverlay.querySelector('[data-ref="' + cssEsc(rotRefs[rs]) + '"]');
        if (!gRot) continue;
        layoutRot[rotRefs[rs]] = ((layoutRot[rotRefs[rs]] || 0) + 1) % 4;
        setCompPos(gRot, gRot.__lx, gRot.__ly);
        commitLayoutMove(gRot);
      }
      var rotAfter = snapMoves(rotRefs);
      var rotRipped = layoutRipped.slice(rotRipBefore);
      pushUndo(
        'rotate ' + rotRefs.join(', '),
        function () {
          restoreMoves(rotBefore);
          restoreRippedTo(rotRipBefore);
        },
        function () {
          restoreMoves(rotAfter);
          for (var ri = 0; ri < rotRipped.length; ri++) ripUpEl(rotRipped[ri]);
        },
      );
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
  // ---- grid, units, disperse, hit cycling (KiCad parity pack) ----
  var layoutGridSize = 0.5; // mm; the snap ladder and the visible grid share it
  var layoutGridShow = false;
  var layoutMil = false;
  /** layout status positions: mm, or mil when the toggle is on */
  function fmtPos(n) {
    if (layoutMil) return (n / 0.0254).toFixed(1) + ' mil';
    return n.toFixed(2) + ' mm';
  }
  function rebuildLayoutGrid() {
    var old = document.getElementById('layout-grid-g');
    if (old) old.remove();
    if (!layoutGridShow || !viewGroups.gerber) return;
    var flip = viewGroups.gerber.querySelector('#yflip');
    if (!flip) return;
    var boardR = layoutBoardRect();
    if (!boardR) return;
    var g = layoutGridSize;
    var pad = 10;
    var x0 = Math.floor((boardR.x0 - pad) / g) * g;
    var y0 = Math.floor((boardR.y0 - pad) / g) * g;
    var x1 = Math.ceil((boardR.x1 + pad) / g) * g;
    var y1 = Math.ceil((boardR.y1 + pad) / g) * g;
    var NS = 'http://www.w3.org/2000/svg';
    var host = document.createElementNS(NS, 'g');
    host.setAttribute('id', 'layout-grid-g');
    host.setAttribute('pointer-events', 'none');
    var d = '';
    // minor divisions as one path (skipped when they'd be dust: 0.1mm over
    // a 100mm board is 1000 lines — the major grid still shows)
    if ((x1 - x0) / g < 400) {
      for (var x = x0; x <= x1 + 0.001; x += g) d += 'M ' + x.toFixed(3) + ' ' + y0.toFixed(3) + ' L ' + x.toFixed(3) + ' ' + y1.toFixed(3) + ' ';
      for (var y = y0; y <= y1 + 0.001; y += g) d += 'M ' + x0.toFixed(3) + ' ' + y.toFixed(3) + ' L ' + x1.toFixed(3) + ' ' + y.toFixed(3) + ' ';
      var minor = document.createElementNS(NS, 'path');
      minor.setAttribute('d', d);
      minor.setAttribute('stroke', 'rgba(255,255,255,0.05)');
      minor.setAttribute('stroke-width', '0.04');
      minor.setAttribute('fill', 'none');
      host.appendChild(minor);
    }
    var dm = '';
    var g5 = g * 5;
    for (var xm = Math.ceil(x0 / g5) * g5; xm <= x1 + 0.001; xm += g5) dm += 'M ' + xm.toFixed(3) + ' ' + y0.toFixed(3) + ' L ' + xm.toFixed(3) + ' ' + y1.toFixed(3) + ' ';
    for (var ym = Math.ceil(y0 / g5) * g5; ym <= y1 + 0.001; ym += g5) dm += 'M ' + x0.toFixed(3) + ' ' + ym.toFixed(3) + ' L ' + x1.toFixed(3) + ' ' + ym.toFixed(3) + ' ';
    var major = document.createElementNS(NS, 'path');
    major.setAttribute('d', dm);
    major.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    major.setAttribute('stroke-width', '0.06');
    major.setAttribute('fill', 'none');
    host.appendChild(major);
    flip.insertBefore(host, flip.firstChild); // behind every layer
  }
  // disperse (KiCad's Tools > Disperse Footprints): parts still stacked on
  // others grid-spread into rows below the board, as pending moves
  function disperseFootprints() {
    var refs = [];
    for (var i = 0; i < layoutComps.length; i++) {
      var ref = layoutComps[i].ref;
      var a = compStateAt(ref);
      if (!a) continue;
      var box = compAABB(a.c, a.x, a.y, a.rot);
      for (var j = 0; j < layoutComps.length; j++) {
        if (layoutComps[j].ref === ref) continue;
        var b = compStateAt(layoutComps[j].ref);
        if (!b) continue;
        var bb = compAABB(b.c, b.x, b.y, b.rot);
        if (Math.min(box.x1, bb.x1) - Math.max(box.x0, bb.x0) > 0.05 && Math.min(box.y1, bb.y1) - Math.max(box.y0, bb.y0) > 0.05) {
          refs.push(ref);
          break;
        }
      }
    }
    if (!refs.length) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'nothing stacked to disperse';
      return;
    }
    var boardR = layoutBoardRect() || { x0: 0, y0: -40, x1: 60, y1: 0 };
    var g = layoutGridSize;
    var before = snapMoves(refs);
    var ripBefore = layoutRipped.length;
    // placement stays ON-SCREEN: rows sweep the board interior top-down
    // (where the parts will be arranged anyway); only a part too wide for
    // the board drops to a row below the ink
    var margin = 2;
    var inW = boardR.x1 - boardR.x0 - margin * 2;
    var cursorX = boardR.x0 + margin;
    var rowY = boardR.y1 - margin; // gerber y-up: the board's visual top
    var rowH = 0;
    var belowY = boardR.y0 - 6;
    var belowH = 0;
    for (var k = 0; k < refs.length; k++) {
      var c2 = compStateAt(refs[k]);
      var w = c2 ? Math.max(c2.c.w, c2.c.h) : 2; // rotation-safe footprint extent
      var h = c2 ? Math.min(c2.c.w, c2.c.h) : 2;
      var px, py;
      if (w <= inW) {
        if (cursorX + w > boardR.x1 - margin) {
          cursorX = boardR.x0 + margin;
          rowY -= rowH + margin;
          rowH = 0;
        }
        px = cursorX + w / 2;
        py = rowY - h / 2;
        cursorX += w + margin;
        rowH = Math.max(rowH, h);
      } else {
        px = (boardR.x0 + boardR.x1) / 2;
        py = belowY - h / 2;
        belowY -= h + margin;
        belowH = Math.max(belowH, h);
      }
      px = Math.round(px / g) * g;
      py = Math.round(py / g) * g;
      var gd = layoutOverlay.querySelector('[data-ref="' + cssEsc(refs[k]) + '"]');
      if (gd) {
        setCompPos(gd, px, py);
        applyCompGhost(gd);
        commitLayoutMove(gd);
      }
    }
    var after = snapMoves(refs);
    var ripped = layoutRipped.slice(ripBefore);
    pushUndo(
      'disperse ' + refs.length + ' part(s)',
      function () {
        restoreMoves(before);
        restoreRippedTo(ripBefore);
      },
      function () {
        restoreMoves(after);
        for (var ri = 0; ri < ripped.length; ri++) ripUpEl(ripped[ri]);
      },
    );
    refreshRatsnest();
    refreshLayoutWarnings();
    if (statusEl && !statusLocked())
      statusEl.textContent = 'dispersed ' + refs.length + ' part(s) below the board \u2014 drag to arrange, apply writes them into source';
  }
  // Tab cycles the hover target through everything under the cursor (pad,
  // segment, part body) the way KiCad's tab-cycling does
  var cycleIdx = -1;
  var cycleAt = null;
  function cycleHits() {
    var cands = [];
    var bp = { x: lastMouseG.x, y: -lastMouseG.y };
    var pad = padAtBoard(bp.x, bp.y);
    if (pad) cands.push({ kind: 'pad', pad: pad });
    var segs = allSegHits();
    var bestSeg = null;
    var bestD = 0.4;
    for (var i = 0; i < segs.length; i++) {
      var x1 = parseFloat(segs[i].getAttribute('x1')), y1 = parseFloat(segs[i].getAttribute('y1'));
      var x2 = parseFloat(segs[i].getAttribute('x2')), y2 = parseFloat(segs[i].getAttribute('y2'));
      var qp = snapOnSegment(lastMouseG.x, lastMouseG.y, x1, y1, x2, y2);
      var dd = Math.hypot(qp.x - lastMouseG.x, qp.y - lastMouseG.y);
      if (dd < bestD) {
        bestD = dd;
        bestSeg = segs[i];
      }
    }
    if (bestSeg) cands.push({ kind: 'seg', el: bestSeg });
    var compEl = document.elementFromPoint(lastMouseC.x, lastMouseC.y);
    var compG = compEl && compEl.closest ? compEl.closest('.layout-comp') : null;
    if (compG) cands.push({ kind: 'comp', g: compG });
    if (!cands.length) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'nothing under the cursor to cycle';
      return;
    }
    var movedAway = !cycleAt || Math.hypot(lastMouseC.x - cycleAt.x, lastMouseC.y - cycleAt.y) > 8;
    cycleIdx = movedAway ? 0 : (cycleIdx + 1) % cands.length;
    cycleAt = { x: lastMouseC.x, y: lastMouseC.y };
    var c = cands[cycleIdx];
    segSel.clear();
    viaSel.clear();
    segHiSync();
    viaHiSync();
    if (c.kind === 'pad') {
      clearTraceHighlight();
      setPadHighlight(c.pad);
      if (c.pad.net) highlightNet('data-net', c.pad.net);
    } else if (c.kind === 'seg') {
      clearPadHighlight();
      segSel.add(c.el);
      segHiSync();
      var n = c.el.getAttribute('data-net');
      if (n && n !== 'N/C') highlightNet('data-net', n);
      if (statusEl && !statusLocked())
        statusEl.textContent = 'segment' + (n && n !== 'N/C' ? ' [' + n + ']' : '') + ' \u2014 Del removes, Tab cycles';
    } else {
      clearPadHighlight();
      layoutSel = [c.g.__lc.ref];
      markLayoutSel();
      if (statusEl && !statusLocked()) statusEl.textContent = c.g.__lc.ref + ' \u2014 Tab cycles';
    }
  }
  document.addEventListener(
    'keydown',
    function (ev) {
      if (viewMode !== 'layout' || !layoutOverlay) return;
      // typing belongs to an open editor, never to the canvas
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable))
        return;
      if (ev.key === 'Escape' && helpEl.style.display !== 'none') {
        ev.preventDefault();
        helpEl.style.display = 'none';
        return;
      }
      if (ev.key === 'Escape' && widthPop.classList.contains('open')) {
        ev.preventDefault();
        widthPop.classList.remove('open');
        return;
      }
      // session undo/redo (inputs keep the browser's own text undo — the
      // guard above already returned for them)
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        if (ev.shiftKey) runRedo();
        else runUndo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault();
        runRedo();
        return;
      }
      // Tab cycles the hover target under the cursor (pad / segment / part)
      if (ev.key === 'Tab') {
        ev.preventDefault();
        cycleHits();
        return;
      }
      // Shift+D disperses stacked footprints below the board
      if (ev.key === 'D') {
        ev.preventDefault();
        disperseFootprints();
        return;
      }
      if (ev.key === 'r' || ev.key === 'R') {
        ev.preventDefault();
        layoutRotateSelection();
        return;
      }
      if (ev.key === 'x' || ev.key === 'X') {
        ev.preventDefault();
        routeKey();
        return;
      }
      if (ev.key === 'v' || ev.key === 'V') {
        ev.preventDefault();
        // Shift (the shifted key cap) cycles the via's far layer; plain V places
        if (ev.shiftKey) cycleViaTarget();
        else if (routeState) routeVia();
        return;
      }
      if (ev.key === '[' || ev.key === ']' || ev.key === '{' || ev.key === '}') {
        ev.preventDefault();
        var kdir = ev.key === '}' || ev.key === ']' ? 1 : -1;
        // Shift (the unshifted key cap with Shift: '{' '}') sizes the VIA;
        // the plain key sizes the trace. A HIGHLIGHTED trace or via takes
        // the keys instead — the committed ink resizes exactly like the
        // live router's would
        if (ev.shiftKey) {
          if (!routeState && (segSel.size || viaSel.size) && selectionResize(null, selectionViaCompute(kdir, ev.altKey)))
            return;
          stepViaSize(kdir, ev.altKey);
        } else {
          if (!routeState && (segSel.size || viaSel.size) && selectionResize(selectionWidthCompute(kdir, ev.altKey), null))
            return;
          stepWidth(kdir, ev.altKey);
        }
        return;
      }
      if (ev.key === '\\' || ev.key === '|') {
        ev.preventDefault();
        // back to the net default: the pending override clears; a live route
        // re-derives from memory/heuristics. Shift (the '|' key cap) does the
        // via — which re-couples it to the trace width
        if (ev.shiftKey) {
          if (!routeState && (segSel.size || viaSel.size)) {
            var recouple = function (info) {
              var vs = viaForWidth(info.w).size;
              return { size: vs, msg: 'via \u2300' + fmtW(vs) + ' \u2014 recoupled to the highlighted trace\u2019s width' };
            };
            if (selectionResize(null, recouple)) return;
          }
          if (routeState) {
            routeState.via = viaForWidth(routeState.w);
            routeState.viaCoupled = true;
            var rvr = (routeState.via.size / 2).toFixed(3);
            routeUiGroup().querySelectorAll('.route-via').forEach(function (v) {
              v.setAttribute('r', rvr);
            });
            viaStatus();
          } else {
            pendingViaOverride = 0;
            if (statusEl && !statusLocked())
              statusEl.textContent = 'via \u2014 the next route tracks the trace width';
          }
          widthChipSync();
          widthControlSync();
        } else if (routeState) {
          setRouteWidth(routeWidth(routeState.net, curPiece() ? curPiece().layerGroup : null), false);
        } else {
          if (
            (segSel.size || viaSel.size) &&
            selectionResize(function (info) {
              var dw = routeWidth(info.net, info.lg);
              return { w: dw, msg: 'width \u2014 ' + fmtW(dw) + ' mm, the net\u2019s default' };
            }, null)
          )
            return;
          pendingWidthOverride = 0;
          if (statusEl && !statusLocked())
            statusEl.textContent = 'width \u2014 the next route uses its net\u2019s default';
          widthChipSync();
          widthControlSync();
        }
        return;
      }
      if (ev.key === 'w' || ev.key === 'W') {
        ev.preventDefault();
        widthPopToggle();
        return;
      }
      if (ev.key === 'p' || ev.key === 'P') {
        ev.preventDefault();
        if (!routeState && (segSel.size || viaSel.size) && selectionPower()) return;
        powerWidth();
        return;
      }
      if (ev.key === 'd' || ev.key === 'D') {
        // D = drag (slide) the hovered/selected trace segment; Escape mid-drag reverts
        ev.preventDefault();
        if (segDrag) segDragEnd(false);
        else segDragStart();
        return;
      }
      if (ev.key === 'e' || ev.key === 'E') {
        ev.preventDefault();
        propsToggle();
        return;
      }
      if (ev.key === 'i' || ev.key === 'I') {
        ev.preventDefault();
        eyedropWidth();
        return;
      }
      if (ev.key === 'z' || ev.key === 'Z') {
        ev.preventDefault();
        if (!routeState && (segSel.size || viaSel.size) && selectionImpedance()) return;
        impedanceWidth();
        return;
      }
      if (ev.key === '?') {
        ev.preventDefault();
        helpToggle();
        return;
      }
      if (ev.key === 'Backspace') {
        if (routeState) {
          ev.preventDefault();
          routeUndoAnchor();
        }
        return;
      }
      if (ev.key === 'u' || ev.key === 'U') {
        if (segSel.size) {
          ev.preventDefault();
          var grew = segExpand();
          if (statusEl && !statusLocked())
            statusEl.textContent =
              segSel.size + ' segment' + (segSel.size > 1 ? 's' : '') + ' selected' +
              (grew ? ' (+' + grew + ')' : '') +
              (viaSel.size ? ', ' + viaSel.size + ' via' + (viaSel.size > 1 ? 's' : '') : '') +
              ' — U grows, Del removes';
        }
        return;
      }
      if (ev.key === 'Delete') {
        if (segSel.size) {
          ev.preventDefault();
          segDelete(); // vias at deleted endpoints ride along
          // vias U pulled into the selection beyond those endpoints go too
          if (viaSel.size) {
            var extraV = 0;
            Array.from(viaSel).forEach(function (vc) {
              if (!vc.parentNode) return;
              var vp = viaInkPos(vc);
              extraV += removeViasAt(vp.x, -vp.y, true);
            });
            viaSel.clear();
            viaHiSync();
            if (extraV && statusEl && !statusLocked())
              statusEl.textContent = statusEl.textContent.replace(/$/, ' + ' + extraV + ' via' + (extraV === 1 ? '' : 's'));
          }
        } else if (viaSel.size) {
          ev.preventDefault();
          var nVia = 0;
          viaSel.forEach(function (vc) {
            var vp = viaInkPos(vc);
            nVia += removeViasAt(vp.x, -vp.y, true); // gerber -> board
          });
          viaSel.clear();
          viaHiSync();
          refreshRatsnest();
          renderLayoutMoves();
          if (statusEl && !statusLocked())
            statusEl.textContent = nVia + ' via' + (nVia === 1 ? '' : 's') + ' deleted';
        }
        return;
      }
      var step = ev.altKey ? Math.min(0.1, layoutGridSize / 5) : layoutGridSize;
      var nudges = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      var d = nudges[ev.key];
      if (!d) return;
      ev.preventDefault();
      // traces/vias selected: the arrows nudge the ink (parts keep the keys
      // when only parts are selected — a press never moves both at once)
      if (segSel.size || viaSel.size) {
        nudgeInkSelection(d[0], d[1]);
        return;
      }
      if (layoutSel.length) {
        var nudgeRefs = layoutSel.slice();
        var nudgeBefore = snapMoves(nudgeRefs);
        var nudgeRipBefore = layoutRipped.length;
        for (var ns = 0; ns < nudgeRefs.length; ns++) {
          var gNudge = layoutOverlay.querySelector('[data-ref="' + cssEsc(nudgeRefs[ns]) + '"]');
          if (!gNudge) continue;
          setCompPos(gNudge, gNudge.__lx + d[0], gNudge.__ly + d[1]);
          commitLayoutMove(gNudge);
        }
        var nudgeAfter = snapMoves(nudgeRefs);
        var nudgeRipped = layoutRipped.slice(nudgeRipBefore);
        pushUndo(
          'nudge ' + nudgeRefs.join(', '),
          function () {
            restoreMoves(nudgeBefore);
            restoreRippedTo(nudgeRipBefore);
          },
          function () {
            restoreMoves(nudgeAfter);
            for (var nr = 0; nr < nudgeRipped.length; nr++) ripUpEl(nudgeRipped[nr]);
          },
        );
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

  // ---- box (marquee) selection: left-drag on EMPTY board space ----
  // The CAD convention: dragging left→right ENCLOSES (only parts fully
  // inside the box select); dragging right→left CROSSES (any part the box
  // touches selects). The box styles itself per direction — solid blue for
  // enclosure, dashed green for crossing. Shift at release extends the
  // current selection instead of replacing it.
  var boxSel = null;
  var boxRect = null;
  svg.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0 || !document.body.classList.contains('typecad-layout')) return;
    if (!layoutOverlay) return;
    var t = ev.target;
    // part presses are consumed by their own handlers; the probe outlines
    // carry data-ref too — anything part-ish is not empty space. Committed
    // vias are elements as well: a press on one starts no rubber band (the
    // click-clear would otherwise wipe the via selection it just made)
    if (
      t &&
      t.closest &&
      (t.closest('.layout-comp') ||
        t.closest('[data-ref]') ||
        (t.tagName === 'circle' && t.getAttribute('data-route') === '1'))
    ) {
      // a probe-outline press over a part body never reaches the part's own
      // handlers — the pad hiding under it still selects through the
      // manifest (a BGA ball owns no DOM hit of its own here)
      var lcHit = t.closest('.layout-comp');
      if (!lcHit) {
        var or = t.closest('[data-ref]');
        if (or && !t.closest('[data-pin]')) {
          var ob = padBoardPoint(ev);
          var opad = padAtBoard(ob.x, ob.y, or.getAttribute('data-ref'));
          if (opad) setPadHighlight(opad);
        }
      }
      return;
    }
    // a press NEAR a dangling trace end arms the route start there — the
    // same magnetic snap finishing uses (this is where non-selection,
    // non-part presses land)
    var nearEnd = nearestTraceEnd(gerberAt(ev.clientX, ev.clientY));
    if (nearEnd) {
      setTraceHighlight(nearEnd);
      return;
    }
    boxSel = { g0: gerberAt(ev.clientX, ev.clientY), x0: ev.clientX, y0: ev.clientY, active: false };
  });
  window.addEventListener('pointermove', function (ev) {
    if (!boxSel) return;
    if (!boxSel.active && Math.hypot(ev.clientX - boxSel.x0, ev.clientY - boxSel.y0) < 4) return;
    boxSel.active = true;
    if (!boxRect) {
      boxRect = document.createElementNS(SVGNSL, 'rect');
      boxRect.setAttribute('id', 'layout-sel-box');
      boxRect.setAttribute('vector-effect', 'non-scaling-stroke');
      // inside the y-flip group: gerberAt coords are that frame's own, and
      // the box rides the gerber stack's pan/zoom with everything else
      var flipHost = viewGroups.gerber.querySelector('#yflip') || document.getElementById('panzoom');
      flipHost.appendChild(boxRect);
    }
    var g1 = gerberAt(ev.clientX, ev.clientY);
    boxRect.setAttribute('x', Math.min(boxSel.g0.x, g1.x).toFixed(3));
    boxRect.setAttribute('y', Math.min(boxSel.g0.y, g1.y).toFixed(3));
    boxRect.setAttribute('width', Math.abs(g1.x - boxSel.g0.x).toFixed(3));
    boxRect.setAttribute('height', Math.abs(g1.y - boxSel.g0.y).toFixed(3));
    boxRect.setAttribute('class', g1.x >= boxSel.g0.x ? 'enclose' : 'cross');
  });
  window.addEventListener('pointerup', function (ev) {
    if (!boxSel) return;
    var b = boxSel;
    boxSel = null;
    if (boxRect) {
      boxRect.remove();
      boxRect = null;
    }
    // a plain click on empty space (no drag) unselects everything — the
    // click-clears-selection convention. Shift keeps the selection so a
    // stray click can't wipe a careful multi-select.
    if (!b.active) {
      if (ev.button === 0 && !ev.shiftKey) {
        clearPadHighlight(); // clears the pad OR trace tie-in highlight
        var clearedInk = segSel.size || viaSel.size || netDimmed.length;
        if (segSel.size) {
          segSel.clear();
          segHiSync();
        }
        if (viaSel.size) {
          viaSel.clear();
          viaHiSync();
        }
        if (netDimmed.length) clearNetHighlight(); // the dim dies with the selection
        if (layoutSel.length || layoutTextSel >= 0) {
        layoutSel = [];
          layoutTextSel = -1;
          markTextSel();
          markLayoutSel();
        }
        // a deselection must not leave a stale "N segments selected" claim
        if (clearedInk && statusEl && !statusLocked()) statusEl.textContent = '';
      }
      return;
    }
    if (!layoutOverlay) return;
    // a box drag is a fresh selection: any ink selection and its net dim
    // go (shift-drag ADDS to the selection instead)
    if (!ev.shiftKey) {
      if (segSel.size) {
        segSel.clear();
        segHiSync();
      }
      if (viaSel.size) {
        viaSel.clear();
        viaHiSync();
      }
      if (netDimmed.length) clearNetHighlight();
    }
    var g1 = gerberAt(ev.clientX, ev.clientY);
    var bx0 = Math.min(b.g0.x, g1.x);
    var bx1 = Math.max(b.g0.x, g1.x);
    var by0 = Math.min(b.g0.y, g1.y);
    var by1 = Math.max(b.g0.y, g1.y);
    var ltr = g1.x >= b.g0.x;
    var matched = [];
    for (var bc = 0; bc < layoutComps.length; bc++) {
      var refB = layoutComps[bc].ref;
      var stB = compStateAt(refB);
      if (!stB) continue;
      var aB = compAABB(stB.c, stB.x, stB.y, stB.rot);
      if (ltr) {
        // enclosure: the part's whole AABB inside the box (0.01mm slack)
        if (aB.x0 >= bx0 - 0.01 && aB.x1 <= bx1 + 0.01 && aB.y0 >= by0 - 0.01 && aB.y1 <= by1 + 0.01)
          matched.push(refB);
      } else if (aB.x0 <= bx1 && aB.x1 >= bx0 && aB.y0 <= by1 && aB.y1 >= by0) {
        matched.push(refB);
      }
    }
    if (ev.shiftKey) {
      for (var mb = 0; mb < matched.length; mb++)
        if (layoutSel.indexOf(matched[mb]) === -1) layoutSel.push(matched[mb]);
    } else {
      layoutSel = matched;
    }
    layoutTextSel = -1;
    markTextSel();
    markLayoutSel();
    if (statusEl && !statusLocked())
      statusEl.textContent =
        layoutSel.length + ' selected (' + (ltr ? 'enclosed' : 'crossing') + ') — Esc clears';
  });
  // ---- phase 3 guardrails: overlap/outline warnings + stranded ratsnest ----
  function compAABB(c, x, y, rotDeg) {
    var a = ((rotDeg || 0) * Math.PI) / 180;
    var cos = Math.abs(Math.cos(a));
    var sin = Math.abs(Math.sin(a));
    var w = c.w * cos + c.h * sin;
    var h = c.w * sin + c.h * cos;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  }
  var boardAreaCache = null;
  function layoutBoardRect() {
    if (boardAreaCache !== null) return boardAreaCache;
    boardAreaCache = null; // null = no board area at all
    var g = viewGroups.gerber;
    if (!g) return null;
    // an authored Edge_Cuts with real geometry is the truth
    var edge = g.querySelector('g[data-kind="edge"]');
    if (edge) {
      try {
        var b = edge.getBBox();
        if (b.width > 0.1 && b.height > 0.1) {
          boardAreaCache = { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
          return boardAreaCache;
        }
      } catch (e) {}
    }
    // no outline authored (an empty Edge_Cuts still classifies): derive the
    // board area from the fabrication ink itself — every layer group's bbox
    // unioned. Cached on FIRST use (the layout view's opening warn check,
    // before any drag) so later moves of the ink can't move the board.
    try {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
      var layers = g.querySelectorAll('g[data-kind]');
      for (var li = 0; li < layers.length; li++) {
        var lb;
        try {
          lb = layers[li].getBBox();
        } catch (e2) {
          continue;
        }
        if (!lb || (!lb.width && !lb.height)) continue;
        any = true;
        x0 = Math.min(x0, lb.x);
        y0 = Math.min(y0, lb.y);
        x1 = Math.max(x1, lb.x + lb.width);
        y1 = Math.max(y1, lb.y + lb.height);
      }
      if (any && x1 - x0 > 0.5 && y1 - y0 > 0.5) {
        boardAreaCache = { x0: x0, y0: y0, x1: x1, y1: y1, derived: true };
      }
    } catch (e) {}
    return boardAreaCache;
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
      var offBoard = false;
      if (boardR) {
        if (boardR.derived) {
          // a derived area hugs the fabrication ink (the biggest part can BE
          // the board) — warn only when the part is fully off it, not for
          // poking past any edge
          offBoard = a.x0 > boardR.x1 || a.x1 < boardR.x0 || a.y0 > boardR.y1 || a.y1 < boardR.y0;
        } else {
          offBoard = a.x0 < boardR.x0 - 0.01 || a.y0 < boardR.y0 - 0.01 || a.x1 > boardR.x1 + 0.01 || a.y1 > boardR.y1 + 0.01;
        }
      }
      if (offBoard) {
        var wmsg =
          moved[r] + (boardR.derived ? ' leaves the board area (no outline authored)' : ' leaves the board outline');
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
      // per-ref reasons: the yellow outline is opaque without them — a part
      // moved clear of every other part still glows when it sits off the
      // board outline, and the toolbar text is easy to miss. The reason
      // rides as a <title> tooltip on the part itself.
      var reasonByRef = {};
      for (var wi = 0; wi < warns.length; wi++) {
        var m = /^(\S+) (leaves the board (?:outline|area \(no outline authored\))|overlaps \S+)$/.exec(warns[wi]);
        if (!m) continue;
        reasonByRef[m[1]] = (reasonByRef[m[1]] ? reasonByRef[m[1]] + ' · ' : '') + warns[wi];
        if (m[2].indexOf('overlaps') === 0) {
          var other = m[2].slice('overlaps '.length);
          reasonByRef[other] = (reasonByRef[other] ? reasonByRef[other] + ' · ' : '') + warns[wi];
        }
      }
      var boxes = layoutOverlay.querySelectorAll('.layout-comp');
      for (var wb = 0; wb < boxes.length; wb++) {
        var bref = boxes[wb].getAttribute('data-ref');
        var existingTitle = boxes[wb].querySelector('title');
        if (warnRefs[bref]) {
          boxes[wb].classList.add('layout-warn');
          var reason = reasonByRef[bref] || 'layout warning';
          if (existingTitle) existingTitle.textContent = reason;
          else {
            existingTitle = document.createElementNS(SVGNSL, 'title');
            existingTitle.textContent = reason;
            boxes[wb].insertBefore(existingTitle, boxes[wb].firstChild);
          }
        } else {
          boxes[wb].classList.remove('layout-warn');
          if (existingTitle) existingTitle.remove();
        }
      }
    }
  }
  // a ratsnest wire: a gentle bezier — perpendicular bulge, alternating side
  // so bundled wires fan apart, deterministic so re-renders don't dance
  function ratsWire(a, b, idx, net) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var s = (idx % 2 ? 1 : -1) * Math.min(len * 0.18, 4);
    var px = (-dy / len) * s;
    var py = (dx / len) * s;
    var p = document.createElementNS(SVGNSL, 'path');
    p.setAttribute(
      'd',
      'M ' +
        a.x.toFixed(3) +
        ' ' +
        a.y.toFixed(3) +
        ' C ' +
        (a.x + dx / 3 + px).toFixed(3) +
        ' ' +
        (a.y + dy / 3 + py).toFixed(3) +
        ' ' +
        (b.x - dx / 3 + px).toFixed(3) +
        ' ' +
        (b.y - dy / 3 + py).toFixed(3) +
        ' ' +
        b.x.toFixed(3) +
        ' ' +
        b.y.toFixed(3),
    );
    if (net) p.setAttribute('data-net', net);
    return p;
  }
  // the routing rubber band's container (inside the ratsnest group): the
  // walk's end ties to the nearest still-stranded pad of the routed net —
  // KiCad's routing ratsnest, refreshed per mousemove in routeFollow
  var ratsLiveEl = null;
  function refreshRatsnest() {
    syncPadLabelVisibility();
    window.__typecadRouteEnds = null; // committed tracks changed -> rebuild
    var old = document.getElementById('ratsnest');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    // the group lives in the GERBER stack (not the layout overlay) so it
    // pans and zooms with the board ink — but only the layout view shows
    // it: every other view renders the fabricated board alone
    var gerberStack = viewGroups.gerber ? viewGroups.gerber.querySelector('#yflip') || viewGroups.gerber : null;
    if (!gerberStack) return;
    var rats = document.createElementNS(SVGNSL, 'g');
    rats.setAttribute('id', 'ratsnest');
    rats.setAttribute('pointer-events', 'none');
    rats.style.display = viewMode === 'layout' ? '' : 'none';
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
    var wireIdx = 0;
    // per-PAD connectivity (a net-granular "has any copper" test hid
    // half-routed nets: their unrouted pads got no wires at all). Ink is
    // scanned once per net: pour-covered nets count as wired everywhere;
    // otherwise a pad is wired when a same-net trace endpoint or via sits
    // on it (its own extent plus half the trace width), or the pad is an
    // endpoint of a committed interactive track. Ripped ink never counts.
    var pourNets = {};
    var netInk = {}; // net -> [{x, y, w}] gerber-frame contact points
    var netEls = {}; // net -> [{pts: [{x, y, w}]}] per-ELEMENT endpoints (circles: 1, paths: 2)
    if (viewGroups.gerber) {
      var wels = viewGroups.gerber.querySelectorAll('[data-net]:not([data-ref])');
      for (var we = 0; we < wels.length; we++) {
        var wel = wels[we];
        if (wel.__ripped) continue;
        var wnet = wel.getAttribute('data-net');
        if (!wnet) continue;
        if (wel.getAttribute('fill-rule')) {
          // pour ink: the fill engine ties the whole net to the plane
          pourNets[wnet] = 1;
          continue;
        }
        var wHalf = parseFloat(wel.getAttribute('data-w') || '0') / 2;
        var wPts = [];
        if (wel.tagName === 'circle') {
          wPts.push({ x: parseFloat(wel.getAttribute('cx')), y: parseFloat(wel.getAttribute('cy')), w: wHalf * 2 });
          (netInk[wnet] = netInk[wnet] || []).push.apply(netInk[wnet], wPts);
          (netEls[wnet] = netEls[wnet] || []).push({ pts: wPts });
        } else {
          // each M-subpath is its own conductor — a d with a GAP (M…M) is
          // two elements, never one bridged run (bridging it called broken
          // routes complete and hid their ratsnest wire)
          var wSubs = (wel.getAttribute('d') || '').split(/(?=M)/);
          for (var ws = 0; ws < wSubs.length; ws++) {
            var wNums = wSubs[ws].match(/[-\d.]+/g);
            if (!wNums || wNums.length < 4) continue;
            var subPts = [
              { x: +wNums[0], y: +wNums[1], w: wHalf * 2 },
              { x: +wNums[wNums.length - 2], y: +wNums[wNums.length - 1], w: wHalf * 2 },
            ];
            (netInk[wnet] = netInk[wnet] || []).push.apply(netInk[wnet], subPts);
            (netEls[wnet] = netEls[wnet] || []).push({ pts: subPts });
          }
        }
      }
    }
    var padsByNet = {}; // net -> [{x, y, r, key}] every pad, gerber frame
    var wiredPad = {};
    for (var uc = 0; uc < layoutComps.length; uc++) {
      var ucomp = layoutComps[uc];
      for (var up = 0; up < (ucomp.pads || []).length; up++) {
        var unet = ucomp.pads[up].net;
        if (!unet) continue;
        // a live route covers its pads: the start pad drops out of the chain
        // immediately, the target once the rubber-band snaps onto it
        if (routeState && routeState.startPad && ucomp.ref === routeState.startPad.ref && String(ucomp.pads[up].pin) === String(routeState.startPad.pin)) continue;
        // island pads carry no pin field — the start/target pads also drop
        // out by POSITION (padPos is gerber frame; manifest pads are board
        // frame, so negate y), or the rubber band ties back to the pad left
        if (routeState && routeState.startPad && ucomp.ref === routeState.startPad.ref && routeState.startPad.x !== undefined) {
          var spPad = padPos(ucomp, ucomp.pads[up]);
          if (Math.hypot(spPad.x - routeState.startPad.x, spPad.y + routeState.startPad.y) < 0.3) continue;
        }
        if (routeState && routeState.targetPad && ucomp.ref === routeState.targetPad.ref && String(ucomp.pads[up].pin) === String(routeState.targetPad.pin)) continue;
        if (routeState && routeState.targetPad && ucomp.ref === routeState.targetPad.ref && routeState.targetPad.x !== undefined) {
          var tpPad = padPos(ucomp, ucomp.pads[up]);
          if (Math.hypot(tpPad.x - routeState.targetPad.x, tpPad.y + routeState.targetPad.y) < 0.3) continue;
        }
        var uIslandPad = ucomp.pads[up];
        var uPos = padPos(ucomp, uIslandPad);
        (padsByNet[unet] = padsByNet[unet] || []).push({
          x: uPos.x,
          y: uPos.y,
          r: Math.max(uIslandPad.w || 0.3, uIslandPad.h || 0.3) / 2,
          key: ucomp.ref + '#' + up,
        });
      }
    }
    // CONNECTIVITY components per net: pads + ink elements, joined when a
    // pad touches an element endpoint or two elements' endpoints coincide
    // (half-widths + slack). A wire is only owed BETWEEN components — the
    // old pad-granular wired/stranded test called a net whose route broke
    // in the middle fully wired (both pads sat on ink) and drew nothing
    // until every segment was deleted.
    var ufFind = function (parent, i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    var repsByNet = {};
    for (var un in padsByNet) {
      var pads = padsByNet[un];
      var els = netEls[un] || [];
      var parent = [];
      for (var pn0 = 0; pn0 < pads.length + els.length; pn0++) parent.push(pn0);
      if (pourNets[un]) {
        for (var pk0 = 1; pk0 < pads.length; pk0++) parent[ufFind(parent, pk0)] = ufFind(parent, 0);
        for (var pk1 = 0; pk1 < pads.length; pk1++) wiredPad[pads[pk1].key] = true;
      } else {
        // pad <-> element endpoint
        for (var pa = 0; pa < pads.length; pa++) {
          var touched = false;
          for (var eb = 0; eb < els.length; eb++) {
            var epts = els[eb].pts;
            for (var ep = 0; ep < epts.length; ep++) {
              if (Math.hypot(epts[ep].x - pads[pa].x, epts[ep].y - pads[pa].y) <= pads[pa].r + epts[ep].w / 2 + 0.15) {
                parent[ufFind(parent, pa)] = ufFind(parent, pads.length + eb);
                touched = true;
                break;
              }
            }
          }
          wiredPad[pads[pa].key] = touched;
        }
        // element <-> element (endpoints coinciding)
        for (var e1 = 0; e1 < els.length; e1++)
          for (var e2 = e1 + 1; e2 < els.length; e2++)
            for (var q1 = 0; q1 < els[e1].pts.length; q1++)
              for (var q2 = 0; q2 < els[e2].pts.length; q2++) {
                var pA = els[e1].pts[q1];
                var pB = els[e2].pts[q2];
                if (Math.hypot(pA.x - pB.x, pA.y - pB.y) <= pA.w / 2 + pB.w / 2 + 0.15) {
                  parent[ufFind(parent, pads.length + e1)] = ufFind(parent, pads.length + e2);
                  q1 = els[e1].pts.length; // joined — next pair
                  break;
                }
              }
      }
      // component CONTACT POINTS: pads AND ink endpoints — a wire lands on
      // the CLOSEST pair between two components (a partial trace's dangling
      // end talks to the far pad, not the far pad's center to this pad's
      // center)
      var compPts = {}; // component id -> [{x, y}]
      for (var cp0 = 0; cp0 < pads.length; cp0++) {
        var cid0 = ufFind(parent, cp0);
        (compPts[cid0] = compPts[cid0] || []).push({ x: pads[cp0].x, y: pads[cp0].y });
      }
      for (var ce0 = 0; ce0 < els.length; ce0++) {
        var cidE = ufFind(parent, pads.length + ce0);
        var ePts0 = els[ce0].pts;
        for (var cq0 = 0; cq0 < ePts0.length; cq0++)
          (compPts[cidE] = compPts[cidE] || []).push({ x: ePts0[cq0].x, y: ePts0[cq0].y });
      }
      // wire-nodes: components that carry a pad (dead stubs owe nothing)
      var nodes = [];
      var seenNode = {};
      for (var rp = 0; rp < pads.length; rp++) {
        var rc = ufFind(parent, rp);
        if (seenNode[rc]) continue;
        seenNode[rc] = 1;
        nodes.push(compPts[rc] || []);
      }
      repsByNet[un] = nodes;
      // the closest point pair across two components
      var closestPair = function (A, B) {
        var best = null;
        var bd = Infinity;
        for (var fa = 0; fa < A.length; fa++)
          for (var fb = 0; fb < B.length; fb++) {
            var fd = (A[fa].x - B[fb].x) * (A[fa].x - B[fb].x) + (A[fa].y - B[fb].y) * (A[fa].y - B[fb].y);
            if (fd < bd) {
              bd = fd;
              best = { a: A[fa], b: B[fb] };
            }
          }
        return best;
      };
      if (nodes.length > 1) {
        var remaining = nodes.slice();
        var cur = remaining.shift();
        while (remaining.length) {
          var bi = 0;
          var bd2 = Infinity;
          var bestPair = null;
          for (var ci = 0; ci < remaining.length; ci++) {
            var pair = closestPair(cur, remaining[ci]);
            if (!pair) continue;
            var pd2 =
              (pair.a.x - pair.b.x) * (pair.a.x - pair.b.x) + (pair.a.y - pair.b.y) * (pair.a.y - pair.b.y);
            if (pd2 < bd2) {
              bd2 = pd2;
              bi = ci;
              bestPair = pair;
            }
          }
          var nxt = remaining.splice(bi, 1)[0];
          if (bestPair) rats.appendChild(ratsWire(bestPair.a, bestPair.b, wireIdx++, un));
          cur = nxt;
        }
      }
    }
    // a live route owns a rubber band: mount its container and cache the
    // unreached components' CONTACT POINTS (pads + ink endpoints — the
    // band ties to whatever is nearest, a dangling trace end included).
    // The component the route grows from (any point near the start) and
    // the hovered target's component are owed nothing
    ratsLiveEl = null;
    if (routeState && routeState.net) {
      var bandPts = [];
      var bandNodes = repsByNet[routeState.net] || [];
      var bandTgt =
        routeState.targetPad && routeState.targetPad.x !== undefined
          ? { x: routeState.targetPad.x, y: -routeState.targetPad.y }
          : null;
      for (var bn = 0; bn < bandNodes.length; bn++) {
        var nodePts = bandNodes[bn];
        var owed = true;
        for (var bq = 0; bq < nodePts.length; bq++) {
          var npt = nodePts[bq];
          if (
            Math.hypot(npt.x - routeState.sx, npt.y - routeState.sy) < 0.5 ||
            (bandTgt && Math.hypot(npt.x - bandTgt.x, npt.y - bandTgt.y) < 0.5)
          ) {
            owed = false;
            break;
          }
        }
        if (owed) for (var bq2 = 0; bq2 < nodePts.length; bq2++) bandPts.push(nodePts[bq2]);
      }
      routeState.__ratsPads = bandPts;
      var liveG = document.createElementNS(SVGNSL, 'g');
      liveG.setAttribute('id', 'rats-live');
      rats.appendChild(liveG);
      ratsLiveEl = liveG;
    }
    // stranded wires are a LAYOUT-mode affordance: they describe pending
    // moves, which the other views don't render (they show the authored
    // board — the ghost transforms clear on exit)
    var inLayout = document.body.classList.contains('typecad-layout');
    for (var mr in layoutMoves) {
      if (!inLayout) break;
      var c = null;
      for (var fi = 0; fi < layoutComps.length; fi++) {
        if (layoutComps[fi].ref === mr) c = layoutComps[fi];
      }
      if (!c || !c.pads || !c.pads.length) continue;
      for (var pn = 0; pn < c.pads.length; pn++) {
        var pad = c.pads[pn];
        if (!pad.net) continue;
        // on copper already (session route or surviving ink): the main pass
        // handles it, and a phantom rip-up wire here would reappear the
        // moment a net's LAST stranded pad gets connected
        if (wiredPad[mr + '#' + pn]) continue;
        // the net still owes wires (more than one connectivity node): the
        // main pass already draws them — don't double up
        if ((repsByNet[pad.net] || []).length > 1) continue;
        // anchors: OTHER components' pads on the SAME net — their copper
        // survives the rip-up, so the stranded pad ties back to them (their
        // own moves/rotations apply too)
        var anchors = [];
        for (var oc = 0; oc < layoutComps.length; oc++) {
          var o = layoutComps[oc];
          if (o.ref === mr || o.nets.indexOf(pad.net) === -1) continue;
          for (var op = 0; op < (o.pads || []).length; op++)
            if (o.pads[op].net === pad.net) anchors.push(padPos(o, o.pads[op]));
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
        rats.appendChild(ratsWire(pp, best, wireIdx++, un));
      }
    }
    // ripped applied routes re-wire their endpoints at the parts' CURRENT
    // poses (a bound endpoint follows its pad; a free one stays put)
    for (var rw2 = 0; rw2 < rippedUnnamed.length; rw2++) {
      var rr2 = rippedUnnamed[rw2];
      var eA2 = rr2.a.ref ? unnamedEndPos(rr2.a) : rr2.a.fixed;
      var eB2 = rr2.b.ref ? unnamedEndPos(rr2.b) : rr2.b.fixed;
      if (eA2 && eB2) rats.appendChild(ratsWire(eA2, eB2, wireIdx++));
    }
    gerberStack.appendChild(rats);
    raisePadLabels();
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
      if (rel.__layoutOp === '') rel.removeAttribute('display');
      else rel.setAttribute('display', rel.__layoutOp);
      rel.__layoutOp = undefined;
      rel.__ripped = 0;
    }
    rippedUnnamed = [];
    rippedUnnamedIdx = {};
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
    rebuildLayoutGrid();
    // the injected probe outlines stand DOWN in the layout view: they sit
    // ABOVE the layout overlay with pointer-events:all, so they steal body
    // presses from small parts (R1 unselectable while its pads work) and,
    // never moving with a drag, they linger as stale blue hover boxes where
    // the part used to be. The layout overlay owns part interaction here.
    var probeG = document.getElementById('typecad-probe');
    if (probeG) {
      if (probeG.__disp === undefined) probeG.__disp = probeG.style.display || '';
      probeG.style.display = 'none';
    }
    // zones subdued, blueprint-faint: filled contours step back so the
    // copper being arranged reads clearly
    var regions = viewGroups.gerber ? viewGroups.gerber.querySelectorAll('path[fill-rule="evenodd"]') : [];
    for (var z = 0; z < regions.length; z++) {
      if (regions[z].__zoneOp !== undefined) continue;
      regions[z].__zoneOp = regions[z].getAttribute('opacity') || '';
      regions[z].setAttribute('opacity', '0.18');
    }
    // KiCad-style depth: every copper layer but the BOTTOM paints
    // translucent, so back-layer ink shows THROUGH front copper — a trace
    // re-layered onto B.Cu must not vanish under an opaque pad or pour
    // (it physically sits beneath it in the stack). Copper groups sit in
    // DOM/z order bottom-first, so the first group stays solid. Layer
    // COLORS stay exactly the theme's own per-layer inks — an earlier
    // iteration hue-rotated back groups for contrast, which painted
    // off-theme colors (Nord's blue back copper rendered orange, gruvbox's
    // green purple) and broke the layer-edit preview's promise that the
    // live recolor shows the rebuilt board's colors
    var cgroups = copperGroups();
    for (var cg = 1; cg < cgroups.length; cg++) {
      if (cgroups[cg].__layoutOp === undefined) cgroups[cg].__layoutOp = cgroups[cg].getAttribute('opacity') || '';
      cgroups[cg].setAttribute('opacity', '0.75');
    }
    // provenance indication is the candy-cane STRIPE on autorouter nets
    // (attachTraceHits); manual TrackBuilder traces stay solid. The old
    // layout-phase styling dashed manual traces — the exact opposite — and
    // is gone
    // pending moves re-apply AFTER the zone subduing above, so a ripped
    // pour zone reads as ripped (grey) exactly like it did live
    restoreLayoutGhost();
    renderLayoutMoves();
    refreshLayoutWarnings();
    refreshRatsnest();
    widthControlSync();
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
    // the translucent copper stack returns to solid ink outside the layout view
    var cgroups2 = copperGroups();
    for (var cg2 = 1; cg2 < cgroups2.length; cg2++) {
      if (cgroups2[cg2].__layoutOp === undefined) continue;
      if (cgroups2[cg2].__layoutOp === '') cgroups2[cg2].removeAttribute('opacity');
      else cgroups2[cg2].setAttribute('opacity', cgroups2[cg2].__layoutOp);
      cgroups2[cg2].__layoutOp = undefined;
    }
    // belt-and-suspenders: a page saved mid-layout by an older build may
    // still carry hue-rotate filters on the copper groups
    for (var ch2 = 0; ch2 < cgroups2.length; ch2++) cgroups2[ch2].style.filter = '';
    if (viewGroups.gerber) {
      var dashed = viewGroups.gerber.querySelectorAll('path[stroke-dasharray]');
      for (var d2 = 0; d2 < dashed.length; d2++) dashed[d2].removeAttribute('stroke-dasharray');
    }
    // the probe outlines come back with the gerber view (see enterLayout)
    var probeG2 = document.getElementById('typecad-probe');
    if (probeG2 && probeG2.__disp !== undefined) probeG2.style.display = probeG2.__disp;
    var gridG = document.getElementById('layout-grid-g');
    if (gridG) gridG.remove();
    // the gerber view shows the authored board alone: rebuild the ratsnest
    // without the pending moves' stranded wires — the group hides outside
    // the layout view, but a later re-entry must start from the authored
    // board's wires, not the move's
    refreshRatsnest();
    widthControlSync();
    widthPop.classList.remove('open');
  }

  // first open: build the ratsnest once so entering the layout view shows
  // the unrouted-net wires immediately (every other view keeps it hidden)
  refreshRatsnest();

  // ---- pad labels: pin number + net name on every copper pad ----
  // Numbers always; the net name beside it when the pad carries a named
  // net (PCB::named(...) — N/C pads show the number alone). Sizing per the
  // pad's own extent from its aperture symbol: the number alone takes ~1/2
  // the pad's height; with a net name each row takes ~40%, stacked and
  // evenly spread vertically, shrunk further if the text would overflow the
  // pad's width. Labels live INSIDE each copper layer group, so layer
  // visibility and opacity apply for free; pending layout moves hide them
  // (pads ghost away under moves — stale labels would float).
  function padLabelSize(text, w, h, frac) {
    // height rule first, then fit the pad's width (glyph ≈ 0.62em monospace)
    return Math.max(0.05, Math.min(h * frac, (w / Math.max(1, text.length)) / 0.62));
  }
  function addPadText(host, text, px, py, fs, weight) {
    var t = document.createElementNS(SVGNSL, 'text');
    t.setAttribute('transform', 'translate(' + px.toFixed(3) + ' ' + py.toFixed(3) + ') scale(1,-1)');
    t.setAttribute('font-size', fs.toFixed(3));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = text;
    host.appendChild(t);
  }
  // ---- manual track routing ('x' from a highlighted pad) ----
  // Click a pad flash to highlight it; press X to start a track from that
  // pad's CENTER. The rubber-band follows the mouse snapped to 0/45/90 rays,
  // or walks onto a snapped pad using only 0/45/90 segments (elbow steered
  // by the mouse). Everything is clearance-checked live against the layer's
  // existing copper (same-net connects, foreign nets are obstacles): the
  // preview stays the layer ink color while clear, turns amber near the
  // limit and red on a violation — and red refuses to anchor. V drops a via
  // and continues on the other copper layer; Backspace undoes the last
  // anchor; double-click finishes anywhere; a faint corridor hint from an
  // in-page grid A* appears when hovering a target pad, and A accepts it.
  // The ratsnest re-renders live. Committed routes are recorded for the
  // apply bridge (source TrackBuilder generation in the host).
  var padHi = null; // highlighted manifest pad
  var traceHi = null; // highlighted tie-in start point on a trace/via: {gx, gy, net, kind, layerGroup}
  var routeState = null;
  var routeUi = null;
  var routedTracks = []; // committed this session: {net, w, pieces, vias} (board frame)
  var routedDeletes = []; // deleted segments pending apply: {net, x1, y1, x2, y2} (board frame)
  // pending apply state must survive the webview RELOADING mid-session — a
  // restore-time generate() swaps the page out from under edits made in the
  // panel's first seconds, and closures don't travel. The arrays snapshot
  // to localStorage (keyed by board + page) and come back on load; a
  // successful apply clears the key with them
  var PENDING_KEY =
    // title + file only: a webview's URI query can change between HTML
    // assignments, and the restore only ever needs to match the same panel
    'typecadPending:' + (document.title || '') + ':' + (location.pathname.split('/').pop() || '');
  function persistPending() {
    try {
      if (!routedTracks.length && !routedDeletes.length) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, JSON.stringify({ routes: routedTracks, deletes: routedDeletes }));
    } catch (e) {}
  }
  function restorePending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return 0;
      var st = JSON.parse(raw);
      var n = (st.routes ? st.routes.length : 0) + (st.deletes ? st.deletes.length : 0);
      if (!n) {
        localStorage.removeItem(PENDING_KEY);
        return 0;
      }
      for (var i = 0; i < (st.routes || []).length; i++) routedTracks.push(st.routes[i]);
      for (var d = 0; d < (st.deletes || []).length; d++) routedDeletes.push(st.deletes[d]);
      return n;
    } catch (e) {
      return 0;
    }
  }
  var CLEARANCE = 0.2; // mm, trace-to-foreign-copper when the rules island carries none
  // the live check and the keep-out halo share ONE clearance number: the
  // board's rule when the island carried it, this default otherwise
  function clearanceRule() {
    return rules && rules.minClearanceMm > 0 ? rules.minClearanceMm : CLEARANCE;
  }
  // ---- board-edge keep-out: the Edge_Cuts layer's extent is the board.
  // Inside it, a sample owes the copper-to-edge clearance to the nearest
  // bbox wall (rectangular boards: exact); outside it, red immediately.
  var edgeBoxCache = null;
  function boardEdgeBox() {
    if (edgeBoxCache !== null) return edgeBoxCache;
    edgeBoxCache = false; // no outline layer / degenerate: no edge check
    var g = viewGroups.gerber ? viewGroups.gerber.querySelector('g[data-kind="edge"]') : null;
    if (!g || !g.getBBox) return edgeBoxCache;
    try {
      var bb = g.getBBox();
      if (bb && bb.width > 1 && bb.height > 1) edgeBoxCache = { x0: bb.x, y0: bb.y, x1: bb.x + bb.width, y1: bb.y + bb.height };
    } catch (e) {}
    return edgeBoxCache;
  }
  function edgeClearanceRule() {
    return rules && rules.minCopperEdgeClearanceMm > 0 ? rules.minCopperEdgeClearanceMm : 0.3;
  }
  /** edge-keepout margin at a point (Infinity when there is no outline) */
  function edgeMarginAt(px, py) {
    var b = boardEdgeBox();
    if (!b) return Infinity;
    var c = edgeClearanceRule();
    if (px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1) return -1; // off the board
    return Math.min(px - b.x0, b.x1 - px, py - b.y0, b.y1 - py) - c;
  }
  function routeUiGroup() {
    if (routeUi) return routeUi;
    routeUi = document.createElementNS(SVGNSL, 'g');
    routeUi.setAttribute('id', 'route-ui');
    routeUi.setAttribute('pointer-events', 'none');
    var stack = viewGroups.gerber.querySelector('#yflip') || viewGroups.gerber;
    stack.appendChild(routeUi);
    return routeUi;
  }
  // ---- keep-out halo: the DRC clearance envelope around the whole live
  // route — a translucent band of trace width + 2x clearance under every
  // pending stroke. Gray while clear, grayish red the moment the clearance
  // check trips (amber-gray when it is only near the limit) ----
  function haloWidth(w) {
    return +(w + 2 * clearanceRule()).toFixed(3);
  }
  function makeHalo(w) {
    var h = document.createElementNS(SVGNSL, 'path');
    h.setAttribute('class', 'route-halo');
    h.setAttribute('fill', 'none');
    h.setAttribute('stroke-width', String(haloWidth(w)));
    h.setAttribute('stroke-linecap', 'round');
    h.setAttribute('stroke-linejoin', 'round');
    return h;
  }
  /** set a route path's geometry, keeping its keep-out halo in lockstep */
  function setRouteD(el, d) {
    el.setAttribute('d', d);
    if (el.__halo) el.__halo.setAttribute('d', d);
  }
  function haloTint(state) {
    if (!routeState) return;
    var cls = 'route-halo' + (state === 'bad' ? ' bad' : '');
    if (routeState.halo) routeState.halo.setAttribute('class', cls);
    for (var i = 0; i < routeState.pieces.length; i++)
      if (routeState.pieces[i].haloEl) routeState.pieces[i].haloEl.setAttribute('class', cls);
    var vcls = 'route-via-halo' + (state === 'bad' ? ' bad' : '');
    routeUiGroup().querySelectorAll('.route-via-halo').forEach(function (v) {
      v.setAttribute('class', vcls);
    });
  }
  /** resize every pending via keep-out ring to the route's current via */
  function viaHaloSync() {
    if (!routeState) return;
    var r = (routeState.via.size / 2 + clearanceRule()).toFixed(3);
    routeUiGroup().querySelectorAll('.route-via-halo').forEach(function (v) {
      v.setAttribute('r', r);
    });
  }
  function copperCanon(name) {
    var l = (name || '').toLowerCase();
    if (/(^|[-_.])f_cu(?=$|[-_.])/.test(l)) return 'F.Cu';
    if (/(^|[-_.])b_cu(?=$|[-_.])/.test(l)) return 'B.Cu';
    var inm = /(^|[-_.])in(\d+)_cu(?=$|[-_.])/.exec(l);
    return inm ? 'In' + inm[2] + '.Cu' : null;
  }
  function copperGroups() {
    return viewGroups.gerber ? viewGroups.gerber.querySelectorAll('g[data-kind="copper"]') : [];
  }
  function layerGroupByCanon(canon) {
    var gs = copperGroups();
    for (var i = 0; i < gs.length; i++)
      if (copperCanon(gs[i].getAttribute('data-layer-name')) === canon) return gs[i];
    return gs[0] || null;
  }
  function layerGroupForPad(p) {
    var want = p.layers.indexOf('*.Cu') !== -1 ? ['F.Cu', 'B.Cu'] : p.layers.slice();
    for (var w = 0; w < want.length; w++) {
      var g = layerGroupByCanon(want[w]);
      if (g) return g;
    }
    return copperGroups()[0] || null;
  }
  function otherLayerCanon(canon) {
    // canon is ALREADY canonical ("F.Cu"/"B.Cu"/"In1.Cu") — don't re-run it
    // through copperCanon (that parses FILE layer names like f_cu and would
    // never match, silently pinning every via flip to F.Cu)
    return canon === 'B.Cu' ? 'F.Cu' : 'B.Cu';
  }
  // ---- obstacle index: the layer's copper as inflated boxes ----
  // (stroke width rides on the element; use-flash bboxes come from their
  // rendered geometry. Same-net copper connects, so it never blocks.)
  function buildObstacles(layerGroup, net) {
    var obs = [];
    if (!layerGroup) return obs;
    var kids = layerGroup.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (!el.getBBox) continue;
      if (el.classList && (el.classList.contains('pad-labels') || el.classList.contains('route-auto-stripe') || el.id === 'route-ui')) continue;
      var enet = el.getAttribute('data-net');
      if (enet && net && enet === net) continue;
      // N/C is the plotter's no-connect label, not a net: unconnected pads
      // and netless route ink are not a foreign NET. The anchor refusal
      // already treats them that way (crossing warns, DRC adjudicates) —
      // counting them here blanketed dense boards in permanent red, since
      // no route can ever be same-net with an N/C pad
      if (enet === 'N/C') continue;
      // zone-fill regions (fills) are pours: their clearance is the fill
      // engine's job, and same-net pours blanket the whole board area —
      // blocking them here would make every corridor unreachable
      if (el.getAttribute('fill-rule')) continue;
      var bb;
      try {
        bb = el.getBBox();
      } catch (e) {
        continue;
      }
      if (!bb || (!bb.width && !bb.height)) continue;
      // POUR INK (hatched fills): the fill engine emits one stroked PATH per
      // hatch stroke WITHOUT fill-rule; hatch strokes DO carry data-w but no
      // data-net/data-ref. On copper layers those are pour geometry — the
      // fill engine owns its clearance, and listing thousands of them would
      // blanket the board and flag every route as a violation. Only
      // ATTRIBUTED ink (data-net traces, data-ref pads, committed routes)
      // is a routing obstacle.
      var eref = el.getAttribute('data-ref');
      var eroute = el.getAttribute('data-route');
      if (!enet && !eref && !eroute) continue;
      var sw = parseFloat(el.getAttribute('stroke-width') || '0') || 0;
      // the obstacle's net class clearance rides along — the live check
      // judges each pair by the LARGER class clearance (KiCad semantics)
      var ocls = netClassFor(enet);
      obs.push({
        x0: bb.x - sw / 2,
        y0: bb.y - sw / 2,
        x1: bb.x + bb.width + sw / 2,
        y1: bb.y + bb.height + sw / 2,
        net: enet,
        clr: ocls && ocls.clearance > 0 ? ocls.clearance : 0,
      });
    }
    return obs;
  }
  // worst clearance margin (mm) of a point sequence against the obstacles.
  // The ROUTE ORIGIN sits inside the start pad's own copper — samples within
  // the start pad's extent are the pad we are leaving, not a violation, so
  // they are measured only past the pad's edge.
  function clearanceMargin(obs, pts, w) {
    var need = w / 2 + clearanceRule();
    var worst = Infinity;
    var skipR = routeState && routeState.startPad ? Math.max(routeState.startPad.w, routeState.startPad.h) / 2 : 0;
    for (var s = 1; s < pts.length; s++) {
      var ax = pts[s - 1].x, ay = pts[s - 1].y, bx = pts[s].x, by = pts[s].y;
      var len = Math.hypot(bx - ax, by - ay);
      var steps = Math.max(1, Math.ceil(len / 0.2));
      for (var t = 0; t <= steps; t++) {
        var px = ax + ((bx - ax) * t) / steps;
        var py = ay + ((by - ay) * t) / steps;
        // leaving the start pad: its own extent is not an obstacle crossing
        if (routeState && routeState.startPad) {
          var sc = padCenter(routeState.startPad);
          if (Math.hypot(px - sc.x, py - sc.y) < skipR) continue;
        }
        // the board edge keeps its own clearance (off the board = instant red)
        var em = edgeMarginAt(px, py);
        if (em < worst) worst = em;
        for (var oi = 0; oi < obs.length; oi++) {
          var o = obs[oi];
          if (px < o.x0 - 3 && px > o.x1 + 3) continue;
          if (py < o.y0 - 3 && py > o.y1 + 3) continue;
          var dx = Math.max(o.x0 - px, 0, px - o.x1);
          var dy = Math.max(o.y0 - py, 0, py - o.y1);
          var dist = dx || dy ? Math.hypot(dx, dy) : -0.5; // inside = violation
          // a class clearance on the OBstacle's net widens this pair's need
          var margin = dist - (o.clr > clearanceRule() ? w / 2 + o.clr : need);
          if (margin < worst) worst = margin;
        }
      }
    }
    return worst;
  }
  // ---- user trace width: stepped with [ and ], remembered per net AND as
  // the last width used, floored by the board's minimum when the rules
  // island carried one. Default for a new route: one-shot override (stepped
  // before pressing X) > this net's last committed width > the last width
  // committed anywhere > the net's existing copper (median) > power-net
  // heuristic. One route carries ONE width — changing it mid-route restyles
  // the whole pending route, matching what the generated source will say ----
  var WIDTH_LADDER = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2];
  var widthMemory = { net: {}, last: 0 };
  try {
    var savedWidths = JSON.parse(localStorage.getItem(storeKey + ':route-width') || 'null');
    if (savedWidths && savedWidths.net) {
      widthMemory = savedWidths;
      if (typeof widthMemory.last !== 'number') widthMemory.last = 0;
    }
  } catch (e) {}
  function rememberNetWidth(net, w) {
    widthMemory.net[net || ''] = +w.toFixed(3);
    widthMemory.last = +w.toFixed(3);
    try {
      localStorage.setItem(storeKey + ':route-width', JSON.stringify(widthMemory));
    } catch (e) {}
  }
  function netWidthMemory(net) {
    var w = widthMemory.net[net || ''];
    return typeof w === 'number' && w > 0.05 ? w : 0;
  }
  function widthFloor() {
    return rules && rules.minTrackWidthMm > 0 ? rules.minTrackWidthMm : 0;
  }
  // via barrel sized off the trace: 0.15 mm annulus per side, never below
  // the classic 0.6/0.3 default
  function viaForWidth(w) {
    var size = Math.max(0.6, +(w + 0.3).toFixed(2));
    return { size: size, drill: +Math.max(0.3, size - 0.3).toFixed(2) };
  }
  // ---- via sizing mirrors trace sizing exactly: its own ladder stepped
  // with Shift+[ / Shift+] (Alt fine), per-net AND last-used memory, and
  // the rules island's via-diameter floor. Until a via is ever sized
  // explicitly, barrels track the trace width — the coupling IS the
  // default, and Shift+\ goes back to it ----
  var VIA_LADDER = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.5, 2];
  if (!widthMemory.viaNet) widthMemory.viaNet = {};
  if (typeof widthMemory.viaLast !== 'number') widthMemory.viaLast = 0;
  function viaDrillFor(size) {
    return +Math.max(0.3, +(size - 0.3).toFixed(2)).toFixed(2);
  }
  function viaFloor() {
    return rules && rules.minViaDiameterMm > 0 ? rules.minViaDiameterMm : 0;
  }
  function rememberNetVia(net, size) {
    widthMemory.viaNet[net || ''] = +size.toFixed(2);
    widthMemory.viaLast = +size.toFixed(2);
    try {
      localStorage.setItem(storeKey + ':route-width', JSON.stringify(widthMemory));
    } catch (e) {}
  }
  function viaMemory(net) {
    var v = widthMemory.viaNet[net || ''];
    return typeof v === 'number' && v > 0.2 ? v : 0;
  }
  var pendingViaOverride = 0; // stepped before a route: owns the next one
  // ---- Z: controlled-impedance width. The page ports the library's solver
  // (pcb_impedance.ts) verbatim — Hammerstad microstrip for outer layers,
  // Cohn symmetric stripline for inner — over the stackup island's real
  // dielectric heights. Same constants as the build-time answer ----
  var Z0_TARGET = 50; // ohms, single-ended
  var FR4_ER = 4.2;
  function impedanceGeometryFor(canon) {
    if (!stackup || !stackup.copperThicknessMm || !stackup.copperThicknessMm.length) return null;
    var coppers = stackup.copperThicknessMm;
    var n = coppers.length;
    var names = ['F.Cu'];
    for (var ni = 1; ni <= n - 2; ni++) names.push('In' + ni + '.Cu');
    if (n > 1) names.push('B.Cu');
    var idx = names.indexOf(canon);
    if (idx === -1) return null;
    var diels = stackup.dielectrics || [];
    var t = coppers[idx];
    if (idx === 0 || idx === n - 1) {
      var d = diels[idx === 0 ? 0 : diels.length - 1];
      if (!d || !(d.thicknessMm > 0)) return null;
      return { model: 'microstrip', t: t, er: FR4_ER, h: d.thicknessMm };
    }
    var above = diels[idx - 1], below = diels[idx];
    if (!above || !below || !(above.thicknessMm > 0) || !(below.thicknessMm > 0)) return null;
    return { model: 'stripline', t: t, er: FR4_ER, b: above.thicknessMm + t + below.thicknessMm };
  }
  function zOfWidth(w, g) {
    if (g.model === 'microstrip') {
      var u = Math.max(w, 1e-4) / g.h;
      var eEff = (g.er + 1) / 2 + (g.er - 1) / 2 / Math.sqrt(1 + 12 / u);
      return u <= 1
        ? (60 / Math.sqrt(eEff)) * Math.log(8 / u + u / 4)
        : (120 * Math.PI) / (Math.sqrt(eEff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
    }
    var tEff = Math.min(Math.max(g.t, 0), g.b / 4);
    var wEff = Math.max(w, 1e-4) + (tEff / Math.PI) * (1 + Math.log((2 * g.b) / (Math.PI * tEff)));
    var u2 = wEff / g.b;
    return u2 < 0.35 ? (60 / Math.sqrt(g.er)) * Math.log(4 / (Math.PI * u2)) : 94.15 / (Math.sqrt(g.er) * (u2 + 0.441));
  }
  function zWidth(target, g) {
    var lo = 0.02, hi = 10;
    if (target > zOfWidth(lo, g) || target < zOfWidth(hi, g)) return 0; // unreachable
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (zOfWidth(mid, g) > target) lo = mid;
      else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 1000) / 1000;
  }
  function impedanceWidth() {
    if (!routeState) {
      if (statusEl && !statusLocked())
        statusEl.textContent = 'press X on a pad first \u2014 Z sizes for ' + Z0_TARGET + ' \u03a9 on that layer';
      return;
    }
    var piece = curPiece();
    var canon = piece ? piece.canon : 'F.Cu';
    var g = impedanceGeometryFor(canon);
    if (!g) {
      if (statusEl && !statusLocked())
        statusEl.textContent = 'no stackup heights for ' + canon + ' \u2014 Z needs the stackup island (--stackup)';
      return;
    }
    var w = zWidth(Z0_TARGET, g);
    if (!w) {
      if (statusEl && !statusLocked())
        statusEl.textContent = Z0_TARGET + ' \u03a9 is unreachable on ' + canon + ' with this stackup';
      return;
    }
    w = Math.ceil(w * 20) / 20;
    var clamped = Math.min(3, w);
    routeState.impedance = { z0: Z0_TARGET };
    setRouteWidth(clamped, true);
    if (statusEl && !statusLocked())
      statusEl.textContent =
        Z0_TARGET + ' \u03a9 \u2192 ' + fmtW(clamped) + ' mm on ' + canon +
        (clamped < w ? ' (clamped from ' + fmtW(w) + ' \u2014 the 3 mm cap)' : '') +
        (g.model === 'microstrip'
          ? ' over ' + fmtW(g.h) + ' mm dielectric'
          : ' between planes ' + fmtW(g.b) + ' mm apart') +
        ' (Hammerstad/Cohn, Er ' + g.er + ') \u2014 noted in the source';
  }
  // ---- P: power-aware width — the IPC-2221 INVERSE of the ΔT view's
  // math (same constants as the library's powerInfo sizer), driven by the
  // net's solved current from the operating point island ----
  var POWER_DT = 10; // °C rise target — the library powerInfo default
  function layerCuUm(canon) {
    if (!stackup || !stackup.copperThicknessMm || !stackup.copperThicknessMm.length) return 35;
    var l = stackup.copperThicknessMm, n = l.length;
    if (canon && canon.indexOf('In') === 0) {
      var s = 0, c = 0;
      for (var li = 1; li < n - 1; li++) {
        s += l[li];
        c++;
      }
      return c ? (s / c) * 1000 : 35;
    }
    if (canon === 'B.Cu') return l[n - 1] * 1000;
    return l[0] * 1000;
  }
  function netCurrent(net) {
    if (!netOp || !netOp.solved || !netOp.branches || !net) return 0;
    var entries = netOp.branches[String(net).toLowerCase()];
    if (!entries || !entries.length) return 0;
    var m = 0;
    for (var bi = 0; bi < entries.length; bi++)
      if (Math.abs(entries[bi].i) > m) m = Math.abs(entries[bi].i);
    return m;
  }
  /** width (mm) carrying current i at ΔT target on the layer — the exact
   *  inverse of dtFromI (IPC-2221, mils, k=0.048 external / 0.024 inner) */
  function widthForCurrent(i, canon) {
    if (!(i > 0)) return 0;
    var tMil = layerCuUm(canon) * (1.378 / 35);
    var k = canon && canon.indexOf('In') === 0 ? 0.024 : 0.048;
    var area = Math.pow(i / (k * Math.pow(POWER_DT, 0.44)), 1 / 0.725); // mil²
    return area / tMil / 39.3701;
  }
  function powerWidth() {
    if (!routeState) {
      if (statusEl && !statusLocked())
        statusEl.textContent = 'press X on a pad first \u2014 P sizes for that net\u2019s current';
      return;
    }
    var cur = netCurrent(routeState.net);
    if (!cur) {
      if (statusEl && !statusLocked())
        statusEl.textContent =
          (routeState.net || 'this net') + ' has no solved current \u2014 run typecad-pcb simulate for power sizing';
      return;
    }
    var piece = curPiece();
    var w = widthForCurrent(cur, piece ? piece.canon : 'F.Cu');
    // round UP to 0.05mm so the built trace always clears the solve
    w = Math.ceil(w * 20) / 20;
    routeState.power = { current: +cur.toFixed(4), maxTempRise: POWER_DT };
    setRouteWidth(Math.min(3, w), true);
    if (statusEl && !statusLocked())
      statusEl.textContent =
        (routeState.net || 'no net') + ' ' + cur.toFixed(2) + ' A \u2192 ' + fmtW(w) + ' mm (IPC-2221, \u0394T ' + POWER_DT + '\u00b0C) \u2014 carried into the source as powerInfo';
  }
  // ---- selection sizing: the width keys retarget a HIGHLIGHTED trace or
  // via — the same ladders and solves the live router uses, landing on
  // committed ink. A session-owned run edits its own route entry in place
  // (apply regenerates it anyway); a source-built run serializes exactly
  // like a segment drag: the original chain rides routedDeletes and a
  // fresh session route re-adds the whole connected route — every layer
  // run AND its junction barrels, so a resize never drops a via ----
  function trackW(tr) {
    return parseFloat(tr.getAttribute('data-w') || '0') || 0.3;
  }
  function trackCanon(tr) {
    // a re-layered run carries its chosen layer on the element (its group
    // membership already moved too, but the override keeps undo honest)
    if (tr.__layerCanon) return tr.__layerCanon;
    var lg = tr.closest ? tr.closest("g[data-kind='copper']") : null;
    return copperCanon(lg ? lg.getAttribute('data-layer-name') : '');
  }
  // an active net highlight snapshots every matched element's paint and
  // restores the snapshot on clear — a re-layer (or its undo) must keep
  // that snapshot in sync, or the next click repaints the trace back to
  // its PRE-EDIT layer color over the corrected ink
  function netSnapshotOf(el) {
    for (var i = 0; i < netWhitened.length; i++) if (netWhitened[i].el === el) return netWhitened[i];
    return null;
  }
  function syncNetSnapshot(el, strokeVal) {
    var snap = netSnapshotOf(el);
    if (snap) snap.stroke = strokeVal;
  }
  // re-layer a run's ink: the path and its hit lines BECOME native members
  // of the target layer's copper group, stroked with that group's own
  // var(--ink-…) exactly like every trace built there — so theme switches,
  // the layer visibility checkbox, the per-layer opacity slider, and the
  // layout view's translucency all apply to the edited trace precisely as
  // they do to the layer's other ink, live and after rebuild alike. (An
  // earlier iteration recolored the path in its ORIGINAL group with a
  // CONCRETE hex — that color ignored theme switches and rode the wrong
  // group's opacity; and the "reparented ink renders invisible in some
  // webviews" note that drove it was a misdiagnosis — the reported trace
  // was a 0.05 mm hairline on a stale page.) The apply bridge is
  // unaffected: deletes match authored geometry, and the chosen layer
  // rides the rewrite's layerMap
  function moveTrackLayer(tr, canon) {
    var lg = layerGroupByCanon(canon);
    if (!lg || !tr.parentNode) return false;
    if (tr.__layerCanon === null || tr.__layerCanon === undefined) {
      // the "original" stroke must be the trace's own ink, never the
      // highlight paint sitting on it while a net highlight is active
      var snap0 = netSnapshotOf(tr);
      tr.__origStroke0 = snap0 ? snap0.stroke : tr.getAttribute('stroke');
      tr.__origLayerParent = tr.parentNode;
      tr.__origStripeVis = tr.__stripe ? tr.__stripe.style.display : null;
    }
    lg.appendChild(tr);
    var hits = tr.__hits || [];
    for (var i = 0; i < hits.length; i++) lg.appendChild(hits[i]);
    var inkVar = 'var(--ink-' + lg.getAttribute('data-layer-id') + ')';
    tr.setAttribute('stroke', inkVar);
    syncNetSnapshot(tr, inkVar);
    tr.style.stroke = '';
    tr.style.filter = '';
    // the auto-provenance candy-cane stripe was drawn for the ORIGINAL
    // layer's ink — hide it until undo or apply regenerates the trace where
    // it belongs
    if (tr.__stripe) tr.__stripe.style.display = 'none';
    tr.__layerCanon = canon;
    return true;
  }
  // undo for a re-layer: the ink returns to its original group with its
  // original stroke
  function restoreLayerInk(tr) {
    if (!tr || tr.__layerCanon === null || tr.__layerCanon === undefined) return;
    if (tr.__origLayerParent) {
      tr.__origLayerParent.appendChild(tr);
      var hits = tr.__hits || [];
      for (var i = 0; i < hits.length; i++) tr.__origLayerParent.appendChild(hits[i]);
    }
    var back;
    if (tr.__origStroke0 === null || tr.__origStroke0 === undefined) {
      tr.removeAttribute('stroke');
      back = null;
    } else {
      tr.setAttribute('stroke', tr.__origStroke0);
      back = tr.__origStroke0;
    }
    syncNetSnapshot(tr, back);
    tr.style.stroke = '';
    tr.style.filter = '';
    if (tr.__stripe && tr.__origStripeVis !== null && tr.__origStripeVis !== undefined)
      tr.__stripe.style.display = tr.__origStripeVis;
    tr.__layerCanon = null;
    tr.__origLayerParent = null;
    tr.__origStroke0 = undefined;
    tr.__origStripeVis = null;
  }
  function trackEnds(tr) {
    var hits = tr.__hits || [];
    if (!hits.length) return [];
    var last = hits[hits.length - 1];
    return [
      { x: parseFloat(hits[0].getAttribute('x1')), y: parseFloat(hits[0].getAttribute('y1')) },
      { x: parseFloat(last.getAttribute('x2')), y: parseFloat(last.getAttribute('y2')) },
    ];
  }
  function trackPtsG(tr) {
    // gerber-frame polyline of the run's hit chain, in hit order
    var hits = tr.__hits || [];
    var pts = [];
    for (var i = 0; i < hits.length; i++) {
      var a = { x: +parseFloat(hits[i].getAttribute('x1')).toFixed(3), y: +parseFloat(hits[i].getAttribute('y1')).toFixed(3) };
      var b = { x: +parseFloat(hits[i].getAttribute('x2')).toFixed(3), y: +parseFloat(hits[i].getAttribute('y2')).toFixed(3) };
      if (!pts.length) pts.push(a);
      var tp = pts[pts.length - 1];
      if (Math.hypot(tp.x - a.x, tp.y - a.y) < 0.01) pts.push(b);
      else pts.push(a, b); // disjoint survivor inside one path: straight jump
    }
    return pts;
  }
  function resizeTrackInk(tr, w) {
    tr.setAttribute('stroke-width', String(w));
    tr.setAttribute('data-w', String(w));
    var hits = tr.__hits || [];
    for (var i = 0; i < hits.length; i++) hits[i].setAttribute('stroke-width', String(Math.max(w, 0.5)));
    // the selection overlay must resize WITH the ink — it derives its line
    // widths from data-w, so a rebuild here keeps it glued through every
    // [ ] \ p z press (and undo/redo)
    segHiSync();
  }
  function sessionPieceFor(tr) {
    // the routedTracks piece backing a committed SESSION run, if any
    if (!tr.__hits || !tr.__hits.length || tr.getAttribute('data-route') !== '1') return null;
    var e = trackEnds(tr);
    if (e.length < 2) return null;
    var head = { x: +e[0].x.toFixed(3), y: +(-e[0].y).toFixed(3) };
    var tail = { x: +e[1].x.toFixed(3), y: +(-e[1].y).toFixed(3) };
    for (var i = 0; i < routedTracks.length; i++) {
      var pcs = routedTracks[i].pieces;
      for (var p = 0; p < pcs.length; p++) {
        var pts = pcs[p].pts;
        if (!pts || pts.length < 2) continue;
        var a = pts[0], b = pts[pts.length - 1];
        if (
          (Math.abs(a.x - head.x) < 0.02 && Math.abs(a.y - head.y) < 0.02 && Math.abs(b.x - tail.x) < 0.02 && Math.abs(b.y - tail.y) < 0.02) ||
          (Math.abs(a.x - tail.x) < 0.02 && Math.abs(a.y - tail.y) < 0.02 && Math.abs(b.x - head.x) < 0.02 && Math.abs(b.y - head.y) < 0.02)
        )
          return { entry: routedTracks[i], piece: p };
      }
    }
    return null;
  }
  function viaInkSize(el) {
    if (el.tagName === 'circle') return (parseFloat(el.getAttribute('r')) || 0.3) * 2;
    try {
      // a gerber flash measures its aperture symbol (the bbox includes
      // the use's x/y translate); implausible reads fall through
      var bb = el.getBBox();
      if (bb.width > 0.2 && bb.width <= 3) return bb.width;
    } catch (er) {}
    return 0;
  }
  function viaInkLayers(el) {
    // the copper layers carrying this barrel's ink, stackup-ordered
    var out = [];
    var p = viaInkPos(el);
    var ink = viaInk();
    for (var i = 0; i < ink.length; i++) {
      var q = viaInkPos(ink[i]);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 0.02) continue;
      var lg = ink[i].closest ? ink[i].closest("g[data-kind='copper']") : null;
      var c = lg ? copperCanon(lg.getAttribute('data-layer-name')) : '';
      if (c && out.indexOf(c) === -1) out.push(c);
    }
    var order = copperCanonList();
    out.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return out;
  }
  // a barrel's drill hole: a .cut sibling (var(--bg) fill) riding the
  // barrel element — session circles and resize overlays both read as solid
  // blobs without it until the rebuild plots the real drill. Idempotent:
  // creates on first call, re-positions/re-radii after
  function viaHoleFor(el, drill) {
    if (!el.parentNode) return null;
    var p = viaInkPos(el);
    var hole = el.__hole;
    if (!hole || !hole.parentNode) {
      hole = document.createElementNS(SVGNSL, 'circle');
      hole.setAttribute('class', 'cut');
      // clicks on the via's center belong to the barrel beneath
      hole.setAttribute('pointer-events', 'none');
      // the .cut rule paints stroke too (!important) — without an explicit
      // zero width the hole inherits the SVG default 1mm stroke and reads
      // as a dark ring around a fresh via
      hole.setAttribute('stroke-width', '0');
      el.parentNode.insertBefore(hole, el.nextSibling);
      el.__hole = hole;
    }
    hole.setAttribute('cx', p.x.toFixed(3));
    hole.setAttribute('cy', p.y.toFixed(3));
    hole.setAttribute('r', ((drill || 0.3) / 2).toFixed(3));
    return hole;
  }
  // a barrel resizes in the INK directly: session circles restyle in
  // place, a gerber flash (fixed aperture symbol) hides behind a
  // same-layer circle that carries the new size until apply rebuilds
  function viaInkResize(el, size) {
    var ops = [];
    var r2 = (size / 2).toFixed(3);
    var drill = viaDrillFor(size);
    var p = viaInkPos(el);
    var ink = viaInk();
    for (var i = 0; i < ink.length; i++) {
      var c = ink[i];
      var q = viaInkPos(c);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 0.02) continue;
      if (c.tagName === 'circle') {
        ops.push({ el: c, oldR: c.getAttribute('r'), newR: r2, oldHoleR: c.__hole ? c.__hole.getAttribute('r') : null, newHoleR: (drill / 2).toFixed(3) });
        c.setAttribute('r', r2);
        viaHoleFor(c, drill);
      } else if (c.tagName === 'use') {
        if (c.__resizeCircle) {
          var ov0 = c.__resizeCircle;
          ops.push({ el: ov0, oldR: ov0.getAttribute('r'), newR: r2, oldHoleR: ov0.__hole ? ov0.__hole.getAttribute('r') : null, newHoleR: (drill / 2).toFixed(3) });
          ov0.setAttribute('r', r2);
          viaHoleFor(ov0, drill);
        } else {
          var lg = c.closest("g[data-kind='copper']");
          var ov = document.createElementNS(SVGNSL, 'circle');
          ov.setAttribute('cx', q.x.toFixed(3));
          ov.setAttribute('cy', q.y.toFixed(3));
          ov.setAttribute('r', r2);
          if (lg) ov.setAttribute('fill', 'var(--ink-' + lg.getAttribute('data-layer-id') + ')');
          ov.setAttribute('data-route', '1');
          if (c.getAttribute('data-net')) ov.setAttribute('data-net', c.getAttribute('data-net'));
          // a selected flash's stand-in carries the selection ring too —
          // the hidden original would else keep it invisibly
          if (c.classList.contains('route-via-sel')) {
            ov.classList.add('route-via-sel');
            if (c.getAttribute('stroke-width')) ov.setAttribute('stroke-width', c.getAttribute('stroke-width'));
          }
          (lg || c.parentNode).appendChild(ov);
          // the overlay is opaque ink — it would cover the flash's real
          // drill hole, so it carries its own
          viaHoleFor(ov, drill);
          c.style.display = 'none';
          c.__resizeCircle = ov;
          ov.__overFlash = c;
          ops.push({ el: c, hidden: true, overlay: ov, newR: r2 });
        }
      }
    }
    return ops;
  }
  function viaInkUndo(ops) {
    for (var i = 0; i < ops.length; i++) {
      if (ops[i].oldR !== undefined) {
        ops[i].el.setAttribute('r', ops[i].oldR);
        if (ops[i].oldHoleR === null && ops[i].el.__hole) ops[i].el.__hole.remove();
        else if (ops[i].el.__hole) ops[i].el.__hole.setAttribute('r', ops[i].oldHoleR);
      }
      if (ops[i].hidden) {
        ops[i].el.style.display = '';
        if (ops[i].overlay.__hole) ops[i].overlay.__hole.remove();
        ops[i].overlay.remove();
        ops[i].el.__resizeCircle = null;
      }
    }
  }
  function viaInkRedo(ops) {
    for (var i = 0; i < ops.length; i++) {
      if (ops[i].hidden) {
        ops[i].el.style.display = 'none';
        (ops[i].el.closest("g[data-kind='copper']") || ops[i].el.parentNode).appendChild(ops[i].overlay);
        ops[i].el.__resizeCircle = ops[i].overlay;
        if (ops[i].overlay.__hole) ops[i].overlay.__hole.remove();
        viaHoleFor(ops[i].overlay, parseFloat(ops[i].newR) * 2);
      } else {
        ops[i].el.setAttribute('r', ops[i].newR);
        viaHoleFor(ops[i].el, parseFloat(ops[i].newR) * 2);
      }
    }
  }
  // the connected route through its via barrels: every layer run,
  // chain-ordered and oriented away from the start run, plus barrels that sit
  // on the chain's ends (a tail/head stitch must ride the rewrite or
  // apply would silently drop it)
  function collectRoute(start) {
    var ink = viaInk();
    function barrelAt(p) {
      for (var i = 0; i < ink.length; i++) {
        var vp = viaInkPos(ink[i]);
        if (Math.hypot(vp.x - p.x, vp.y - p.y) < 0.35) return ink[i];
      }
      return null;
    }
    var used = new Set([start]);
    function runOverBarrel(vp) {
      var hits = allSegHits();
      for (var i = 0; i < hits.length; i++) {
        var tk = hits[i].__track;
        if (!tk || used.has(tk) || !(tk.__hits || []).length) continue;
        var te = trackEnds(tk);
        for (var e = 0; e < 2; e++)
          if (Math.hypot(te[e].x - vp.x, te[e].y - vp.y) < 0.35) return { tk: tk, endIdx: e };
      }
      return null;
    }
    var seq = [{ run: start, flip: false, viaEl: null }];
    var cur = start, curEnd = 1;
    for (;;) {
      var ends = trackEnds(cur);
      var vEl = ends[curEnd] ? barrelAt(ends[curEnd]) : null;
      if (!vEl) break;
      var nxt = runOverBarrel(viaInkPos(vEl));
      if (!nxt) break;
      used.add(nxt.tk);
      seq.push({ run: nxt.tk, flip: nxt.endIdx === 1, viaEl: vEl });
      cur = nxt.tk;
      curEnd = 1 - nxt.endIdx;
    }
    cur = start;
    curEnd = 0;
    for (;;) {
      var ends2 = trackEnds(cur);
      var vEl2 = ends2[curEnd] ? barrelAt(ends2[curEnd]) : null;
      if (!vEl2) break;
      var prv = runOverBarrel(viaInkPos(vEl2));
      if (!prv) break;
      used.add(prv.tk);
      seq.unshift({ run: prv.tk, flip: prv.endIdx === 1, viaEl: vEl2 });
      cur = prv.tk;
      curEnd = 1 - prv.endIdx;
    }
    var endVias = [];
    var junctions = new Set();
    for (var s = 1; s < seq.length; s++) if (seq[s].viaEl) junctions.add(seq[s].viaEl);
    var chainEnds = trackEnds(seq[0].run)[0] ? [trackEnds(seq[0].run)[0], trackEnds(seq[seq.length - 1].run)[1]] : [];
    for (var vi = 0; vi < ink.length; vi++) {
      if (junctions.has(ink[vi])) continue;
      var ip = viaInkPos(ink[vi]);
      for (var ce = 0; ce < chainEnds.length; ce++)
        if (chainEnds[ce] && Math.hypot(chainEnds[ce].x - ip.x, chainEnds[ce].y - ip.y) < 0.35) endVias.push(ink[vi]);
    }
    return { seq: seq, endVias: endVias };
  }
  // serialize one connected source route at new sizes: deletes for every
  // original segment (board y-down) + a single re-add carrying per-run
  // widths and every barrel (junctions AND end stitches, resized or not)
  function sourceRewrite(coll, widths, viaOverride, layerMap) {
    var seq = coll.seq;
    var net = seq[0].run.getAttribute('data-net') || null;
    if (net === 'N/C') net = null; // the plotter's no-connect label, not a net
    var dels = [];
    var pieces = [];
    var vias = [];
    function pushVia(el, w) {
      var vp = viaInkPos(el);
      var ov =
        viaOverride && Math.hypot(vp.x - viaOverride.x, vp.y + viaOverride.y) < 0.02 ? viaOverride : null;
      var sz = ov ? ov.size : viaInkSize(el) || viaForWidth(w).size;
      sz = +Math.min(3, Math.max(0.3, sz)).toFixed(3);
      var dr = ov && ov.drill !== undefined && isFinite(ov.drill) ? Math.min(+ov.drill.toFixed(3), +(sz - 0.1).toFixed(3)) : viaDrillFor(sz);
      var ly = viaInkLayers(el);
      vias.push({
        x: +vp.x.toFixed(3),
        y: +(-vp.y).toFixed(3),
        size: sz,
        drill: dr,
        layers: ly.length >= 2 ? ly : undefined,
      });
    }
    for (var s = 0; s < seq.length; s++) {
      var run = seq[s].run;
      var canon = trackCanon(run);
      // the re-add piece takes the OVERRIDE layer; the deletes keep the
      // ORIGINAL — they match the chain exactly as authored in source
      var pieceCanon = layerMap && layerMap.has(run) ? layerMap.get(run) : canon;
      var pts = trackPtsG(run);
      if (seq[s].flip) pts = pts.slice().reverse();
      var w = widths.has(run) ? widths.get(run) : trackW(run);
      var hits = run.__hits || [];
      for (var h = 0; h < hits.length; h++)
        dels.push({
          net: net,
          x1: +parseFloat(hits[h].getAttribute('x1')).toFixed(3),
          y1: +(-parseFloat(hits[h].getAttribute('y1'))).toFixed(3),
          x2: +parseFloat(hits[h].getAttribute('x2')).toFixed(3),
          y2: +(-parseFloat(hits[h].getAttribute('y2'))).toFixed(3),
          layer: canon,
        });
      pieces.push({ layer: pieceCanon, w: w, pts: pts.map(function (pt) { return { x: pt.x, y: -pt.y }; }) });
      if (s > 0 && seq[s].viaEl) pushVia(seq[s].viaEl, w);
    }
    for (var ev = 0; ev < coll.endVias.length; ev++) pushVia(coll.endVias[ev], trackW(seq[0].run));
    return {
      dels: dels,
      rt: {
        net: net,
        w: pieces[0] ? pieces[0].w : 0.3,
        pieces: pieces,
        vias: vias,
        power: null,
        impedance: null,
        from: { ref: '(resize)', pin: '' },
        to: null,
      },
    };
  }
  function installRewrite(state) {
    for (var d = 0; d < state.dels.length; d++) routedDeletes.push(state.dels[d]);
    routedTracks.push(state.rt);
    state.dropIdxs = [];
    for (var e = 0; e < state.dropEntries.length; e++) {
      var idx = routedTracks.indexOf(state.dropEntries[e].entry);
      state.dropIdxs.push(idx);
      if (idx >= 0) routedTracks.splice(idx, 1);
    }
  }
  // a rewrite restored across a page reload carries no __rewrite markers
  // (fresh DOM) — detect the superseded state by DELETE COORDINATES instead:
  // pull the stale dels and every rt whose pieces cover them out of the
  // arrays, shaped like an installed state so undo/redo treat it normally.
  // Without this, resize → reload → resize again STACKS two re-adds of the
  // same chain and apply writes both (overlapping double routes)
  function staleRewriteFor(dels) {
    if (!dels || !dels.length) return null;
    var st = { dels: [], rt: null, dropEntries: [], dropIdxs: [] };
    for (var i = 0; i < dels.length; i++) {
      for (var j = routedDeletes.length - 1; j >= 0; j--) {
        var d = routedDeletes[j];
        if (
          Math.abs(d.x1 - dels[i].x1) < 0.011 &&
          Math.abs(d.y1 - dels[i].y1) < 0.011 &&
          Math.abs(d.x2 - dels[i].x2) < 0.011 &&
          Math.abs(d.y2 - dels[i].y2) < 0.011
        ) {
          st.dels.push(d);
          routedDeletes.splice(j, 1);
        }
      }
    }
    if (!st.dels.length) return null;
    for (var k = routedTracks.length - 1; k >= 0; k--) {
      var rt = routedTracks[k];
      var covers = false;
      for (var pi = 0; pi < rt.pieces.length && !covers; pi++) {
        var pts = rt.pieces[pi].pts;
        for (var si = 0; si + 1 < pts.length && !covers; si++) {
          for (var di = 0; di < st.dels.length; di++) {
            var dd = st.dels[di];
            if (
              Math.abs(pts[si].x - dd.x1) < 0.011 &&
              Math.abs(pts[si].y - dd.y1) < 0.011 &&
              Math.abs(pts[si + 1].x - dd.x2) < 0.011 &&
              Math.abs(pts[si + 1].y - dd.y2) < 0.011
            )
              covers = true;
          }
        }
      }
      if (covers) {
        st.rt = rt; // last match wins; overlapping re-adds of one chain are one state
        routedTracks.splice(k, 1);
      }
    }
    return st;
  }
  function uninstallRewrite(state) {
    var ri = routedTracks.indexOf(state.rt);
    if (ri >= 0) routedTracks.splice(ri, 1);
    for (var d = state.dels.length - 1; d >= 0; d--) {
      var di = routedDeletes.indexOf(state.dels[d]);
      if (di >= 0) routedDeletes.splice(di, 1);
    }
    var ins = [];
    for (var k = 0; k < state.dropIdxs.length; k++)
      if (state.dropIdxs[k] >= 0) ins.push({ ix: state.dropIdxs[k], e: state.dropEntries[k].entry });
    ins.sort(function (a, b) { return b.ix - a.ix; });
    for (var q = 0; q < ins.length; q++) routedTracks.splice(ins[q].ix, 0, ins[q].e);
  }
  // THE entry point for the sizing keys with a highlighted trace/via:
  // compute maps a run's {w, net, canon, lg} to {w, power?, impedance?,
  // msg?} (null = solve failed — it set its own status); viaCompute maps
  // a barrel's {size, w, net} to {size, msg?}
  function selectionResize(compute, viaCompute) {
    if (routeState) return false; // a live route owns the keys
    var primaries = [];
    var seenP = new Set();
    function addRun(tr) {
      if (!tr || !(tr.__hits || []).length || seenP.has(tr)) return;
      seenP.add(tr);
      primaries.push(tr);
    }
    segSel.forEach(function (h) { addRun(h.__track); });
    var viaTargets = [];
    viaSel.forEach(function (v) { viaTargets.push(v); });
    if (!primaries.length) {
      // a highlighted VIA aims the width keys at the traces it joins
      viaTargets.forEach(function (v) {
        var vp = viaInkPos(v);
        var reach = Math.max((v.tagName === 'circle' ? parseFloat(v.getAttribute('r')) || 0.3 : 0.3) + 0.35, 0.5);
        var hits = allSegHits();
        for (var i = 0; i < hits.length; i++) {
          var near =
            Math.hypot(parseFloat(hits[i].getAttribute('x1')) - vp.x, parseFloat(hits[i].getAttribute('y1')) - vp.y) < reach ||
            Math.hypot(parseFloat(hits[i].getAttribute('x2')) - vp.x, parseFloat(hits[i].getAttribute('y2')) - vp.y) < reach;
          if (near) addRun(hits[i].__track);
        }
      });
    }
    if (!viaTargets.length && viaCompute && primaries.length) {
      // no barrel highlighted: the via keys act on the selected runs' own
      // barrels — the same barrels a live route's via would size
      var ink0 = viaInk();
      primaries.forEach(function (tr) {
        trackEnds(tr).forEach(function (e) {
          for (var i = 0; i < ink0.length; i++) {
            var vp0 = viaInkPos(ink0[i]);
            if (Math.hypot(vp0.x - e.x, vp0.y - e.y) < 0.35) viaTargets.push(ink0[i]);
          }
        });
      });
    }
    if (!primaries.length && !viaTargets.length) return false;

    var inkOps = []; // {tr, oldW, newW}
    var layerOps = []; // {tr, fromCanon, toCanon} — ink reparenting for a layer edit
    var entryOps = []; // session piece width/layer edits {entry, piece, oldW, newW, oldLayer, newLayer, oldPower, newPower, oldImp, newImp}
    var viaEntryOps = []; // session barrel resizes {entry, idx, oldSize, oldDrill, newSize, newDrill}
    var viaInkOps = [];
    var rewrites = []; // {coll, rw, dropEntries}
    var lastMsg = null;
    var touched = false;

    if (compute && primaries.length) {
      // group primaries into connected routes — one rewrite covers each
      var groups = [];
      function groupFor(tr) {
        for (var g = 0; g < groups.length; g++)
          for (var s = 0; s < groups[g].coll.seq.length; s++)
            if (groups[g].coll.seq[s].run === tr) return groups[g];
        var ng = { coll: collectRoute(tr), widths: new Map(), layerMap: new Map() };
        groups.push(ng);
        return ng;
      }
      for (var pi = 0; pi < primaries.length; pi++) {
        var tr = primaries[pi];
        var res = compute({
          w: trackW(tr),
          net: tr.getAttribute('data-net') || null,
          canon: trackCanon(tr),
          lg: tr.closest ? tr.closest("g[data-kind='copper']") : null,
        });
        if (res === null) continue;
        if (res.msg) lastMsg = res.msg;
        if (res.skip) continue;
        // the board's own rules floor — never write a hairline the fab (or
        // DRC) will reject; the width keys already stop here
        var nw = Math.min(3, Math.max(widthFloor() || 0.05, +res.w.toFixed(3)));
        var layerCh = res.layer && res.layer !== trackCanon(tr) ? res.layer : null;
        var wCh = Math.abs(nw - trackW(tr)) >= 1e-9;
        if (!wCh && !layerCh) continue;
        var grp = groupFor(tr);
        if (wCh) {
          grp.widths.set(tr, nw);
          inkOps.push({ tr: tr, oldW: trackW(tr), newW: nw });
        }
        if (layerCh) {
          grp.layerMap.set(tr, layerCh);
          layerOps.push({ tr: tr, fromCanon: trackCanon(tr), toCanon: layerCh });
        }
        grp.power = res.power || null;
        grp.impedance = res.impedance || null;
        touched = true;
      }
      for (var gi = 0; gi < groups.length; gi++) {
        if (!groups[gi].widths.size && !groups[gi].layerMap.size) continue;
        var coll = groups[gi].coll;
        var widths = groups[gi].widths;
        var layerMap = groups[gi].layerMap;
        var anySource = false;
        var dropEntries = [];
        coll.seq.forEach(function (sE) {
          if (sE.run.getAttribute('data-route') !== '1') {
            anySource = true;
            return;
          }
          var sess = sessionPieceFor(sE.run);
          if (sess && dropEntries.indexOf(sess.entry) === -1) dropEntries.push(sess.entry);
        });
        if (!anySource) {
          // pure session route: the entry's own pieces carry the new widths
          // and layers — apply regenerates it from them
          coll.seq.forEach(function (sE2) {
            var nw2 = widths.get(sE2.run);
            var nl2 = layerMap.get(sE2.run);
            if (nw2 === undefined && !nl2) return;
            var sess2 = sessionPieceFor(sE2.run);
            if (!sess2) return;
            var pc2 = sess2.entry.pieces[sess2.piece];
            entryOps.push({
              entry: sess2.entry,
              piece: sess2.piece,
              tr: sE2.run,
              oldW: pc2.w,
              newW: nw2 !== undefined ? nw2 : pc2.w,
              oldLayer: pc2.layer,
              newLayer: nl2 || pc2.layer,
              oldPower: sess2.entry.power || null,
              newPower: groups[gi].power,
              oldImp: sess2.entry.impedance || null,
              newImp: groups[gi].impedance,
            });
            if (nw2 !== undefined) pc2.w = nw2;
            if (nl2) {
              pc2.layer = nl2;
              moveTrackLayer(sE2.run, nl2);
            }
          });
          continue;
        }
        // source halves (or a mix): one bridge rewrite for the whole
        // connected route; the session halves leave their entries — the
        // re-add covers their geometry
        var rw = sourceRewrite(coll, widths, null, layerMap.size ? layerMap : null);
        rw.rt.power = groups[gi].power;
        rw.rt.impedance = groups[gi].impedance;
        rewrites.push({ coll: coll, rw: rw, dropEntries: dropEntries, widths: widths, layerMap: layerMap, power: groups[gi].power, impedance: groups[gi].impedance });
      }
    }

    if (viaCompute && viaTargets.length) {
      viaTargets.forEach(function (v) {
        var vp = viaInkPos(v);
        var bx = +vp.x.toFixed(3), by = +(-vp.y).toFixed(3);
        var w = 0.3;
        var hits2 = allSegHits();
        for (var i = 0; i < hits2.length; i++) {
          var near2 =
            Math.hypot(parseFloat(hits2[i].getAttribute('x1')) - vp.x, parseFloat(hits2[i].getAttribute('y1')) - vp.y) < 0.65 ||
            Math.hypot(parseFloat(hits2[i].getAttribute('x2')) - vp.x, parseFloat(hits2[i].getAttribute('y2')) - vp.y) < 0.65;
          if (near2 && hits2[i].__track) w = Math.max(w, trackW(hits2[i].__track));
        }
        var res2 = viaCompute({ size: viaInkSize(v) || viaForWidth(w).size, w: w, net: v.getAttribute('data-net') || null });
        if (res2 === null) return;
        if (res2.msg) lastMsg = res2.msg;
        if (res2.skip) return;
        var nsz = Math.min(3, Math.max(0.3, +res2.size.toFixed(3)));
        // an explicit drill (the E panel) rides along; anything else derives
        // from the size like every other sizing path
        var ndr =
          res2.drill !== undefined && isFinite(res2.drill)
            ? Math.min(+res2.drill.toFixed(3), +(nsz - 0.1).toFixed(3))
            : viaDrillFor(nsz);
        var owned = false;
        for (var ri = 0; ri < routedTracks.length; ri++) {
          for (var vi = 0; vi < routedTracks[ri].vias.length; vi++) {
            var vv = routedTracks[ri].vias[vi];
            if (Math.hypot(vv.x - bx, vv.y - by) > 0.02) continue;
            viaEntryOps.push({ entry: routedTracks[ri], idx: vi, oldSize: vv.size, oldDrill: vv.drill, newSize: nsz, newDrill: ndr });
            vv.size = nsz;
            vv.drill = ndr;
            owned = true;
          }
        }
        viaInkOps.push(viaInkResize(v, nsz));
        touched = true;
        if (owned) return;
        // a SOURCE barrel: the resize must ride the connected route's
        // rewrite (the .via() args only change when the chain is re-added)
        var host = null;
        for (var hi = 0; hi < rewrites.length && !host; hi++)
          for (var hj = 0; hj < rewrites[hi].coll.seq.length && !host; hj++) {
            var he = trackEnds(rewrites[hi].coll.seq[hj].run);
            for (var hk = 0; hk < he.length; hk++)
              if (Math.hypot(he[hk].x - vp.x, he[hk].y - vp.y) < 0.35) host = rewrites[hi];
          }
        if (host) {
          // the connected route already rides a pending rewrite (a width
          // key ran first): rebuild it carrying the via resize too
          host.rw = sourceRewrite(host.coll, host.widths, { x: vp.x, y: -vp.y, size: nsz, drill: ndr }, host.layerMap.size ? host.layerMap : null);
          host.rw.rt.power = host.power;
          host.rw.rt.impedance = host.impedance;
          return;
        }
        var seed = runNear(vp);
        if (!seed) return; // a barrel with no touching trace ink: nothing to rewrite
        var collV = collectRoute(seed);
        var dropV = [];
        collV.seq.forEach(function (sE3) {
          if (sE3.run.getAttribute('data-route') !== '1') return;
          var sess3 = sessionPieceFor(sE3.run);
          if (sess3 && dropV.indexOf(sess3.entry) === -1) dropV.push(sess3.entry);
        });
        rewrites.push({ coll: collV, rw: sourceRewrite(collV, new Map(), { x: vp.x, y: -vp.y, size: nsz, drill: ndr }), dropEntries: dropV, widths: new Map(), power: null, impedance: null });
      });
    }

    if (!touched && !rewrites.length) {
      // nothing resized: a solver message still owns the keypress; a
      // silent no-op falls through to the live/pending behavior
      if (lastMsg && statusEl && !statusLocked()) statusEl.textContent = lastMsg;
      return !!lastMsg;
    }
    // install: any run already carrying a pending rewrite from an earlier
    // keypress swaps out first — stacking re-adds would double the route
    var prevs = [];
    rewrites.forEach(function (rwi) {
      var state = { dels: rwi.rw.dels, rt: rwi.rw.rt, dropEntries: rwi.dropEntries, dropIdxs: [] };
      var prev = null;
      rwi.coll.seq.forEach(function (sE) {
        if (sE.run.__rewrite && sE.run.__rewrite !== state) prev = prev || sE.run.__rewrite;
      });
      if (prev) uninstallRewrite(prev);
      else prev = staleRewriteFor(state.dels); // a pre-reload leftover, already pulled
      installRewrite(state);
      rwi.coll.seq.forEach(function (sE2) { sE2.run.__rewrite = state; });
      prevs.push({ state: state, prev: prev, coll: rwi.coll });
    });
    inkOps.forEach(function (o) { resizeTrackInk(o.tr, o.newW); });
    layerOps.forEach(function (o) { moveTrackLayer(o.tr, o.toCanon); });
    entryOps.forEach(function (o) {
      o.entry.power = o.newPower;
      o.entry.impedance = o.newImp;
    });
    pushUndo(
      'resize trace',
      function () {
        for (var i = prevs.length - 1; i >= 0; i--) {
          uninstallRewrite(prevs[i].state);
          if (prevs[i].prev) installRewrite(prevs[i].prev);
          prevs[i].coll.seq.forEach(function (sE) { sE.run.__rewrite = prevs[i].prev || null; });
        }
        inkOps.forEach(function (o) { resizeTrackInk(o.tr, o.oldW); });
        layerOps.forEach(function (o) { restoreLayerInk(o.tr); });
        entryOps.forEach(function (o) {
          o.entry.pieces[o.piece].w = o.oldW;
          o.entry.pieces[o.piece].layer = o.oldLayer;
          if (o.tr) restoreLayerInk(o.tr);
          o.entry.power = o.oldPower;
          o.entry.impedance = o.oldImp;
        });
        viaEntryOps.forEach(function (o) {
          o.entry.vias[o.idx].size = o.oldSize;
          o.entry.vias[o.idx].drill = o.oldDrill;
        });
        viaInkOps.forEach(viaInkUndo);
      },
      function () {
        prevs.forEach(function (pv) {
          if (pv.prev) uninstallRewrite(pv.prev);
          installRewrite(pv.state);
          pv.coll.seq.forEach(function (sE) { sE.run.__rewrite = pv.state; });
        });
        inkOps.forEach(function (o) { resizeTrackInk(o.tr, o.newW); });
        layerOps.forEach(function (o) { moveTrackLayer(o.tr, o.toCanon); });
        entryOps.forEach(function (o) {
          o.entry.pieces[o.piece].w = o.newW;
          o.entry.pieces[o.piece].layer = o.newLayer;
          if (o.tr) moveTrackLayer(o.tr, o.newLayer);
          o.entry.power = o.newPower;
          o.entry.impedance = o.newImp;
        });
        viaEntryOps.forEach(function (o) {
          o.entry.vias[o.idx].size = o.newSize;
          o.entry.vias[o.idx].drill = o.newDrill;
        });
        viaInkOps.forEach(viaInkRedo);
      },
    );
    renderLayoutMoves(); // a resized track arms Apply on its own
    if (statusEl && !statusLocked())
      statusEl.textContent =
        lastMsg ||
        'resized ' +
          (inkOps.length || layerOps.length ? inkOps.length + layerOps.length + ' trace' + (inkOps.length + layerOps.length > 1 ? 's' : '') : '') +
          (viaInkOps.length ? (inkOps.length || layerOps.length ? ' + ' : '') + viaInkOps.length + ' via' + (viaInkOps.length > 1 ? 's' : '') : '') +
          (layerOps.length ? ' \u2014 apply rewrites the layer in source' : ' \u2014 apply writes the new size into source');
    return true;
  }
  function runNear(p) {
    var hits = allSegHits();
    var best = null, bd = 0.65;
    for (var i = 0; i < hits.length; i++) {
      var q1 = { x: parseFloat(hits[i].getAttribute('x1')), y: parseFloat(hits[i].getAttribute('y1')) };
      var q2 = { x: parseFloat(hits[i].getAttribute('x2')), y: parseFloat(hits[i].getAttribute('y2')) };
      var d = Math.min(Math.hypot(q1.x - p.x, q1.y - p.y), Math.hypot(q2.x - p.x, q2.y - p.y));
      if (d < bd && hits[i].__track) {
        bd = d;
        best = hits[i].__track;
      }
    }
    return best;
  }
  // ladder stepping over a highlighted trace — the same rungs and floors
  // stepWidth walks
  function selectionWidthCompute(dir, fine) {
    return function (info) {
      var next;
      if (fine) next = +(info.w + dir * 0.01).toFixed(3);
      else if (dir > 0) {
        next = 3;
        for (var i = 0; i < WIDTH_LADDER.length; i++)
          if (WIDTH_LADDER[i] > info.w + 1e-9) {
            next = WIDTH_LADDER[i];
            break;
          }
      } else {
        next = 0.05;
        for (var j = WIDTH_LADDER.length - 1; j >= 0; j--)
          if (WIDTH_LADDER[j] < info.w - 1e-9) {
            next = WIDTH_LADDER[j];
            break;
          }
      }
      if (!fine) {
        var floor = widthFloor();
        if (floor && next < floor) next = +floor.toFixed(3);
      }
      return { w: next };
    };
  }
  function selectionViaCompute(dir, fine) {
    return function (info) {
      var next;
      if (fine) next = +(info.size + dir * 0.01).toFixed(3);
      else if (dir > 0) {
        next = 3;
        for (var i = 0; i < VIA_LADDER.length; i++)
          if (VIA_LADDER[i] > info.size + 1e-9) {
            next = VIA_LADDER[i];
            break;
          }
      } else {
        next = 0.3;
        for (var j = VIA_LADDER.length - 1; j >= 0; j--)
          if (VIA_LADDER[j] < info.size - 1e-9) {
            next = VIA_LADDER[j];
            break;
          }
      }
      if (!fine) {
        var vf = viaFloor();
        if (vf && next < vf) next = +vf.toFixed(3);
      }
      return { size: next };
    };
  }
  function selectionPower() {
    return selectionResize(
      function (info) {
        var cur = netCurrent(info.net);
        if (!cur)
          return {
            w: 0,
            skip: true,
            msg: (info.net || 'this net') + ' has no solved current \u2014 run typecad-pcb simulate for power sizing',
          };
        var w = Math.ceil(widthForCurrent(cur, info.canon) * 20) / 20;
        w = Math.min(3, w);
        return {
          w: w,
          power: { current: +cur.toFixed(4), maxTempRise: POWER_DT },
          msg:
            (info.net || 'no net') + ' ' + cur.toFixed(2) + ' A \u2192 ' + fmtW(w) + ' mm (IPC-2221, \u0394T ' + POWER_DT + '\u00b0C) \u2014 carried into the source as powerInfo',
        };
      },
      null,
    );
  }
  function selectionImpedance() {
    return selectionResize(
      function (info) {
        var g = impedanceGeometryFor(info.canon);
        if (!g)
          return { w: 0, skip: true, msg: 'no stackup heights for ' + info.canon + ' \u2014 Z needs the stackup island (--stackup)' };
        var w = zWidth(Z0_TARGET, g);
        if (!w)
          return { w: 0, skip: true, msg: Z0_TARGET + ' \u03a9 is unreachable on ' + info.canon + ' with this stackup' };
        w = Math.ceil(w * 20) / 20;
        var clamped = Math.min(3, w);
        return {
          w: clamped,
          impedance: { z0: Z0_TARGET },
          msg:
            Z0_TARGET + ' \u03a9 \u2192 ' + fmtW(clamped) + ' mm on ' + info.canon +
            (clamped < w ? ' (clamped from ' + fmtW(w) + ' \u2014 the 3 mm cap)' : '') +
            (g.model === 'microstrip'
              ? ' over ' + fmtW(g.h) + ' mm dielectric'
              : ' between planes ' + fmtW(g.b) + ' mm apart') +
            ' (Hammerstad/Cohn, Er ' + g.er + ') \u2014 noted in the source',
        };
      },
      null,
    );
  }
  // ---- I: eyedropper — adopt the width of the trace under the cursor.
  // The last mouse position (gerber frame) is tracked by the hover below.
  var lastMouseG = { x: 0, y: 0 };
  var lastMouseC = { x: 0, y: 0 }; // client pixels — Tab cycling hit-tests with these
  window.addEventListener('mousemove', function (ev) {
    var g = gerberAt(ev.clientX, ev.clientY);
    lastMouseG.x = g.x;
    lastMouseG.y = g.y;
    lastMouseC.x = ev.clientX;
    lastMouseC.y = ev.clientY;
  });
  function eyedropWidth() {
    var segs = allSegHits();
    var bestD = 0.5; // grab radius, board mm
    var bestTrack = null;
    for (var i = 0; i < segs.length; i++) {
      var x1 = parseFloat(segs[i].getAttribute('x1')), y1 = parseFloat(segs[i].getAttribute('y1'));
      var x2 = parseFloat(segs[i].getAttribute('x2')), y2 = parseFloat(segs[i].getAttribute('y2'));
      var qp = snapOnSegment(lastMouseG.x, lastMouseG.y, x1, y1, x2, y2);
      var d = Math.hypot(qp.x - lastMouseG.x, qp.y - lastMouseG.y);
      if (d < bestD && segs[i].__track) {
        bestD = d;
        bestTrack = segs[i].__track;
      }
    }
    if (!bestTrack) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'hover a trace first \u2014 I adopts its width';
      return;
    }
    var w = parseFloat(bestTrack.getAttribute('data-w') || '0');
    if (!(w > 0.05)) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'that trace carries no width attribute';
      return;
    }
    setRouteWidth(w, true);
    if (statusEl && !statusLocked())
      statusEl.textContent = 'width adopted: ' + fmtW(w) + ' mm' + (routeState ? ' \u2014 continues from the next anchor' : ' \u2014 owns the next route');
  }
  // ---- ?: the keys cheat-sheet. One overlay, every binding, one row per
  // key: bold key on the left, a dash, a short explanation with modifiers.
  // Built from a table so adding a binding means adding a row, not untangling
  // a multi-line string blob ----
  var HELP_ROWS = [
    ['view', null, null],
    ['0 / F', 'fit the board in the view'],
    ['+ / \u2212', 'zoom in / out'],
    ['?', 'toggle this help'],
    ['select & place', null, null],
    ['click', 'select a part, trace, via, or text (an open E panel follows it)'],
    ['drag', 'move the selected part(s)'],
    ['\u2190 \u2192 \u2191 \u2193', 'nudge the selected part, trace segments, or vias one grid step'],
    ['Alt + arrows', 'nudge by 0.1 mm (fine, crosses the grid)'],
    ['R', 'rotate the selection 90\u00b0'],
    ['Shift+D', 'disperse stacked footprints below the board'],
    ['Tab', 'cycle pad / trace / part under the cursor'],
    ['U', 'grow the segment selection along the net'],
    ['Del', 'delete the selected segments (their vias ride along)'],
    ['E', 'properties: part ref/value/placement + pin nets \u00b7 trace width/layer \u00b7 via \u2300/drill \u00b7 text content/style'],
    ['Ctrl+Z', 'undo (Ctrl+Shift+Z or Ctrl+Y redo)'],
    ['Esc', 'clear the selection / cancel what is running'],
    ['double-click', 'jump to the declaring source line'],
    ['routing', null, null],
    ['X', 'start a route from the highlighted pad or trace'],
    ['click', 'anchor the next segment'],
    ['double-click / pad', 'finish the route'],
    ['V', 'place a via there (switch layer)'],
    ['Shift+V', 'cycle the via\u2019s far layer (blind / buried)'],
    ['D', 'slide (drag) the hovered segment'],
    ['Backspace', 'undo the last anchored segment'],
    ['width & via', null, null],
    ['[ / ]', 'trace width down / up the ladder'],
    ['Alt + [ / ]', 'fine trim \u00b10.01 mm'],
    ['Shift+[ / ]', 'via size down / up the ladder'],
    ['\\', 'back to the net\u2019s default width'],
    ['Shift+\\', 're-couple the via size to the trace width'],
    ['W', 'open the width picker'],
    ['P', 'width for the net\u2019s solved current (IPC-2221)'],
    ['I', 'adopt the width of the trace under the cursor'],
    ['Z', 'width for 50 \u03a9 on that layer (stackup solve)'],
  ];
  var helpEl = document.createElement('div');
  helpEl.id = 'keys-help';
  helpEl.style.display = 'none';
  var helpHtml = '';
  for (var hr = 0; hr < HELP_ROWS.length; hr++) {
    if (HELP_ROWS[hr][1] === null) {
      helpHtml += '<div class="hsec">' + HELP_ROWS[hr][0] + '</div>';
      continue;
    }
    helpHtml +=
      '<div class="hrow"><span class="hk">' + HELP_ROWS[hr][0] + '</span><span class="hd">\u2014 ' + HELP_ROWS[hr][1] + '</span></div>';
  }
  helpHtml +=
    '<div class="hnote">no live route? highlight a trace or via first \u2014 the sizing keys then resize that ink \u00b7 gray band = keep-out \u00b7 red = violation</div>' +
    '<div class="hnote">click anywhere to close</div>';
  helpEl.innerHTML = helpHtml;
  document.body.appendChild(helpEl);
  function helpToggle() {
    helpEl.style.display = helpEl.style.display === 'none' ? 'block' : 'none';
  }
  helpEl.addEventListener('click', function () {
    helpEl.style.display = 'none';
  });
  /** the via a NEW route on this net carries: override > this net's memory >
   *  last via used anywhere > track the trace width. 'coupled' false = an
   *  explicit choice owns it (trace-width changes leave it alone). */
  function startViaFor(net, traceW) {
    if (pendingViaOverride) return { size: pendingViaOverride, drill: viaDrillFor(pendingViaOverride), coupled: false };
    var mem = viaMemory(net);
    if (mem) return { size: mem, drill: viaDrillFor(mem), coupled: false };
    // the class's own via (with its drill) is an explicit board setting —
    // independent, so trace-width changes leave it alone
    var cls = netClassFor(net);
    if (cls && cls.viaSize > 0.2) return { size: cls.viaSize, drill: cls.viaDrill > 0.2 ? cls.viaDrill : viaDrillFor(cls.viaSize), coupled: false };
    if (widthMemory.viaLast > 0.2) return { size: widthMemory.viaLast, drill: viaDrillFor(widthMemory.viaLast), coupled: false };
    var c = viaForWidth(traceW);
    return { size: c.size, drill: c.drill, coupled: true };
  }
  function stepViaSize(dir, fine) {
    var cur = routeState
      ? routeState.via.size
      : pendingViaOverride || startViaFor(null, pendingWidthOverride || routeWidth(null, null)).size;
    var next;
    if (fine) {
      next = +(cur + dir * 0.01).toFixed(3);
    } else if (dir > 0) {
      next = 3;
      for (var i = 0; i < VIA_LADDER.length; i++)
        if (VIA_LADDER[i] > cur + 1e-9) {
          next = VIA_LADDER[i];
          break;
        }
    } else {
      next = 0.3;
      for (var j = VIA_LADDER.length - 1; j >= 0; j--)
        if (VIA_LADDER[j] < cur - 1e-9) {
          next = VIA_LADDER[j];
          break;
        }
    }
    if (!fine) {
      var vf = viaFloor();
      if (vf && next < vf) next = +vf.toFixed(3); // ladder stepping stops at the via minimum
    }
    setViaSize(Math.min(3, Math.max(0.3, +next.toFixed(3))), true);
  }
  function setViaSize(size, user) {
    size = Math.min(3, Math.max(0.3, +size.toFixed(2)));
    if (routeState) {
      routeState.via = { size: size, drill: viaDrillFor(size) };
      routeState.viaCoupled = false;
      var r2 = (size / 2).toFixed(3);
      routeUiGroup().querySelectorAll('.route-via').forEach(function (v) {
        v.setAttribute('r', r2);
      });
      viaHaloSync();
    } else {
      pendingViaOverride = user ? size : 0;
    }
    widthChipSync();
    viaStatus();
    widthControlSync();
  }
  function viaStatus() {
    if (!statusEl || statusLocked()) return;
    var vs = routeState ? routeState.via.size : pendingViaOverride;
    if (!vs) return;
    var label = (routeState ? 'via ' : 'next via ') + '\u2300' + fmtW(vs) + ' / drill ' + fmtW(viaDrillFor(vs));
    var vf = viaFloor();
    if (vf && vs < vf - 1e-9) label += ' \u2014 below board min \u2300' + fmtW(vf);
    label += ' \u00b7 Shift+[ ] via size (Alt fine) \u00b7 Shift+\\ tracks trace';
    statusEl.textContent = label;
  }
  var pendingWidthOverride = 0; // stepped before a route: owns the next one
  function fmtW(w) {
    return String(+(+w).toFixed(2));
  }
  function stepWidth(dir, fine) {
    var cur = routeState ? routeState.w : pendingWidthOverride || 0.3;
    var next;
    if (fine) {
      // Alt-fine trims by 0.01mm and MAY cross the board minimum — an
      // explicit trim is intent, the readout warns below it
      next = +(cur + dir * 0.01).toFixed(3);
    } else if (dir > 0) {
      next = 3;
      for (var i = 0; i < WIDTH_LADDER.length; i++)
        if (WIDTH_LADDER[i] > cur + 1e-9) {
          next = WIDTH_LADDER[i];
          break;
        }
    } else {
      next = 0.05;
      for (var j = WIDTH_LADDER.length - 1; j >= 0; j--)
        if (WIDTH_LADDER[j] < cur - 1e-9) {
          next = WIDTH_LADDER[j];
          break;
        }
    }
    if (!fine) {
      // ladder stepping stops AT the board minimum — casual stepping must
      // not silently violate the project's own rules
      var floor = widthFloor();
      if (floor && next < floor) next = +floor.toFixed(3);
    }
    setRouteWidth(Math.min(3, Math.max(0.05, +next.toFixed(3))), true);
  }
  function setRouteWidth(w, user) {
    w = Math.min(3, Math.max(0.05, +w.toFixed(3)));
    if (routeState) {
      var piece = curPiece();
      if (piece.points.length >= 2) {
        // PER-SEGMENT WIDTH: sever here. The pending walk folds into the
        // current piece at its OLD width (exactly the ink on screen), and a
        // fresh piece on the SAME layer continues from that point at the
        // new width — the same boundary shape a via press makes, minus the via
        routeState.w = w;
        var end = routeState.lastEnd || routeEndpoint(routeState.sx, routeState.sy);
        var pts = routeState.lastPts || [{ x: end.x, y: end.y }];
        for (var pa = 0; pa < pts.length; pa++) {
          var tailW = piece.points[piece.points.length - 1];
          if (tailW && Math.hypot(pts[pa].x - tailW.x, pts[pa].y - tailW.y) < 0.005) continue;
          piece.points.push(pts[pa]);
        }
        var dw = 'M ' + piece.points[0].x.toFixed(3) + ' ' + piece.points[0].y.toFixed(3);
        for (var ai = 1; ai < piece.points.length; ai++)
          dw += ' L ' + piece.points[ai].x.toFixed(3) + ' ' + piece.points[ai].y.toFixed(3);
        setRouteD(piece.anchoredEl, dw);
        var last = piece.points[piece.points.length - 1];
        var np = newPiece(piece.layerGroup);
        np.points.push({ x: last.x, y: last.y });
        setRouteD(np.anchoredEl, 'M ' + last.x.toFixed(3) + ' ' + last.y.toFixed(3));
        routeState.pieces.push(np);
        routeState.sx = last.x;
        routeState.sy = last.y;
        routeState.lastPts = []; // consumed by the sever
      } else {
        // nothing anchored in this piece yet: it restyles in place — a
        // width adjusted right after starting X owns the whole first run
        routeState.w = w;
        piece.w = w;
        piece.anchoredEl.setAttribute('stroke-width', String(w));
        if (piece.haloEl) piece.haloEl.setAttribute('stroke-width', String(haloWidth(w)));
      }
      routeState.path.setAttribute('stroke-width', String(w));
      if (routeState.halo) routeState.halo.setAttribute('stroke-width', String(haloWidth(w)));
      // coupled barrels follow the trace; an explicitly-sized via is
      // independent and does NOT move with width changes
      if (routeState.viaCoupled !== false) {
        routeState.via = viaForWidth(w);
        routeState.viaCoupled = true;
        var vr = (routeState.via.size / 2).toFixed(3);
        routeUiGroup().querySelectorAll('.route-via').forEach(function (v) {
          v.setAttribute('r', vr);
        });
        viaHaloSync();
      }
      if (routeState.lastEnd && routeState.lastEnd.mx !== undefined)
        routeFollow(routeState.lastEnd.mx, routeState.lastEnd.my);
    } else {
      pendingWidthOverride = user ? w : 0;
    }
    widthChipSync();
    widthStatus();
    widthControlSync();
  }
  function widthStatus() {
    if (!statusEl || statusLocked()) return;
    var w = routeState ? routeState.w : pendingWidthOverride;
    if (!w) return;
    var floor = widthFloor();
    var label = routeState
      ? 'routing ' + (routeState.net || 'no net') + ' \u2014 ' + fmtW(w) + ' mm'
      : 'next route \u2014 ' + fmtW(w) + ' mm';
    if (floor && w < floor - 1e-9) label += ' \u2014 below board min ' + fmtW(floor);
    label += routeState
      ? ' \u00b7 [ ] trace \u00b7 Shift+[ ] via \u2300' + fmtW(routeState.via.size) + ' \u00b7 P power \u00b7 \\ defaults (Alt fine)'
      : ' \u00b7 [ ] trace \u00b7 Shift+[ ] via \u00b7 P power (Alt fine) \u00b7 \\ net default';
    statusEl.textContent = label;
  }
  // width chip riding the cursor while a route is live (HTML, not SVG: it
  // must neither mirror under the y flip nor scale with zoom)
  var widthChip = document.createElement('div');
  widthChip.id = 'route-width-chip';
  widthChip.style.display = 'none';
  document.body.appendChild(widthChip);
  function widthChipSync() {
    if (!routeState) {
      widthChip.style.display = 'none';
      return;
    }
    var floor = widthFloor();
    var below = floor && routeState.w < floor - 1e-9;
    var vf = viaFloor();
    var vBelow = vf && routeState.via && routeState.via.size < vf - 1e-9;
    widthChip.textContent =
      fmtW(routeState.w) + ' mm' +
      (routeState.walkLen > 0.05 ? ' \u00b7 ' + fmtW(routeState.walkLen) + ' mm' : '') +
      (routeState.viaCoupled === false ? ' \u00b7 \u2300' + fmtW(routeState.via.size) : '') +
      (below ? ' \u26a0 min ' + fmtW(floor) : '') +
      (vBelow ? ' \u26a0 via min ' + fmtW(vf) : '');
    widthChip.className = below || vBelow ? 'below-min' : '';
  }
  // width picker popover: the ladder + exact entry (W or the toolbar button)
  var widthPop = document.createElement('div');
  widthPop.id = 'width-pop';
  var widthLadder = document.createElement('div');
  widthLadder.className = 'wladder';
  WIDTH_LADDER.forEach(function (v) {
    var b = document.createElement('button');
    b.textContent = fmtW(v);
    b.addEventListener('click', function () {
      setRouteWidth(v, true);
    });
    widthLadder.appendChild(b);
  });
  var widthRow = document.createElement('div');
  widthRow.className = 'wrow';
  var widthInp = document.createElement('input');
  widthInp.type = 'number';
  widthInp.step = '0.01';
  widthInp.min = '0.05';
  widthInp.max = '3';
  widthInp.title = 'exact width (mm) \u2014 Enter applies';
  widthInp.setAttribute('aria-label', 'trace width in mm');
  var widthVia = document.createElement('span');
  widthRow.appendChild(widthInp);
  widthRow.appendChild(widthVia);
  // the via section mirrors it: ladder + exact entry, drill follows the size
  var viaLadder = document.createElement('div');
  viaLadder.className = 'wladder';
  VIA_LADDER.forEach(function (v) {
    var b = document.createElement('button');
    b.textContent = fmtW(v);
    b.addEventListener('click', function () {
      setViaSize(v, true);
    });
    viaLadder.appendChild(b);
  });
  var viaRow = document.createElement('div');
  viaRow.className = 'wrow';
  var viaInp = document.createElement('input');
  viaInp.type = 'number';
  viaInp.step = '0.01';
  viaInp.min = '0.3';
  viaInp.max = '3';
  viaInp.title = 'exact via diameter (mm) \u2014 Enter applies; drill follows';
  viaInp.setAttribute('aria-label', 'via diameter in mm');
  var viaDrillLbl = document.createElement('span');
  viaRow.appendChild(viaInp);
  viaRow.appendChild(viaDrillLbl);
  var widthHint = document.createElement('span');
  widthHint.className = 'whint';
  widthPop.appendChild(widthLadder);
  widthPop.appendChild(widthRow);
  widthPop.appendChild(viaLadder);
  widthPop.appendChild(viaRow);
  widthPop.appendChild(widthHint);
  document.body.appendChild(widthPop);
  widthInp.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      var v = parseFloat(widthInp.value);
      if (v > 0.05) {
        setRouteWidth(Math.min(3, v), true);
        widthInp.blur();
      }
    } else if (e.key === 'Escape') {
      widthPop.classList.remove('open');
    }
  });
  viaInp.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      var vv = parseFloat(viaInp.value);
      if (vv > 0.3) {
        setViaSize(Math.min(3, vv), true);
        viaInp.blur();
      }
    } else if (e.key === 'Escape') {
      widthPop.classList.remove('open');
    }
  });
  // ---- properties panel (E): KiCad's E dialog, minimal — the selection's
  // reference/value (renames ride the apply bridge), placement x/y/rotation
  // written through the same move machinery a drag uses, and net-class
  // info read-only ----
  var propsEl = document.createElement('div');
  propsEl.id = 'props-pop';
  propsEl.style.display = 'none';
  document.body.appendChild(propsEl);
  function propsRef() {
    return layoutSel.length ? layoutSel[0] : null;
  }
  function propsEsc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  // the most recent selection gesture — 'part', 'trace', or 'via'. An OPEN
  // panel follows the click: every selection sync (markLayoutSel, segHiSync,
  // viaHiSync) and every move/resize commit funnels through propsSync, which
  // rebuilds the panel for whatever the last press landed on. E once, then
  // click around — no reopening the dialog per element.
  var propsKind = '';
  var propsSigLast = '';
  function propsSig() {
    // everything the panel renders: the gesture class, the part refs plus
    // the primary's live placement (drags/rotations refresh in place), each
    // selected segment (endpoints, net, width) and barrel (position, net,
    // size) — a change in any of them is a stale panel
    var s = propsKind + '/' + layoutSel.join(',');
    if (layoutSel.length) {
      var st0 = compStateAt(layoutSel[0]);
      if (st0) s += '@' + st0.x.toFixed(3) + ',' + st0.y.toFixed(3) + ',' + st0.rot;
      // pending ref/value edits show in the fields — an inline label edit
      // (or its undo) must refresh them too
      var pr0 = layoutSel[0];
      s += ';' + (layoutRefEdits[pr0] !== undefined ? layoutRefEdits[pr0] : '') + ',' + (layoutValueEdits[pr0] !== undefined ? layoutValueEdits[pr0] : '');
    }
    segSel.forEach(function (h) {
      s +=
        '|s' + h.getAttribute('x1') + ',' + h.getAttribute('y1') + ',' + h.getAttribute('x2') + ',' + h.getAttribute('y2') +
        ',' + (h.getAttribute('data-net') || '') + ',' + (h.__track ? trackW(h.__track) : 0);
    });
    viaSel.forEach(function (v) {
      var pp = viaInkPos(v);
      s += '|v' + pp.x + ',' + pp.y + ',' + (v.getAttribute('data-net') || '') + ',' + viaInkSize(v);
    });
    if (layoutTextSel >= 0 && layoutTexts[layoutTextSel]) {
      var tst = textState(layoutTextSel);
      var tmv = layoutTextMoves[layoutTextSel];
      var tref = layoutTexts[layoutTextSel].ref;
      s +=
        '|t' + layoutTextSel + '@' + tst.x.toFixed(3) + ',' + tst.y.toFixed(3) + ',' + (tst.rot || 0) +
        ',' + (tmv && tmv.text !== undefined ? tmv.text : '') +
        ',' + (tmv && tmv.style ? JSON.stringify(tmv.style) : '') +
        // a label's content lives in the ref/value edit maps (inline edits
        // and the part panel write there) — the panel must follow those too
        ',' + (tref ? (layoutRefEdits[tref] !== undefined ? layoutRefEdits[tref] : '') + '/' + (layoutValueEdits[tref] !== undefined ? layoutValueEdits[tref] : '') : '');
    }
    return s;
  }
  function propsSync(kind) {
    // the gesture class is recorded even when the panel is closed — E must
    // open on whatever the LAST press landed on, not a stale class
    if (kind) propsKind = kind;
    // selection syncs fire from script start; propsEl does not exist until
    // the panel markup above runs — the guard keeps those early calls no-ops
    if (!propsEl || propsEl.style.display === 'none') return;
    var sig = propsSig();
    if (sig === propsSigLast) return;
    propsSigLast = sig;
    propsBuild();
    // deliberately no focus: an auto-refresh must not park the caret in a
    // text field — the canvas keys (R rotate, X route, Del) only fire while
    // focus stays off the inputs. Focusing belongs to the explicit E open.
  }
  // ---- E on a TRACE: width + layer editing through the same
  // resize/bridge/undo machinery the [ ] \ p z keys use ----
  function propsTraceBuild() {
    var first = segSel.values().next().value;
    var net = first ? first.getAttribute('data-net') : null;
    if (net === 'N/C') net = null;
    var w = first && first.__track ? trackW(first.__track) : 0.3;
    var canon0 = first && first.__track ? trackCanon(first.__track) : '';
    var len = 0;
    segSel.forEach(function (h) {
      len += Math.hypot(
        +h.getAttribute('x2') - +h.getAttribute('x1'),
        +h.getAttribute('y2') - +h.getAttribute('y1'),
      );
    });
    var layerOpts = '';
    copperCanonList().forEach(function (cl) {
      layerOpts += '<option value="' + propsEsc(cl) + '"' + (cl === canon0 ? ' selected' : '') + '>' + propsEsc(cl) + '</option>';
    });
    // read-only context: the net's class defaults, and the impedance the
    // current width works out to on the current layer (stackup permitting —
    // the same Hammerstad/Cohn model the Z key sizes with)
    var clsHint = net ? netClassInfo(net) : null;
    var zHint = '';
    var zg = canon0 ? impedanceGeometryFor(canon0) : null;
    if (zg && w > 0) zHint = '\u2248' + zOfWidth(w, zg).toFixed(0) + ' \u03a9 on ' + propsEsc(canon0) + ' (' + zg.model + ')';
    propsEl.innerHTML =
      '<b>trace' + (net ? ' [' + propsEsc(net) + ']' : ' (no net)') + (segSel.size > 1 ? ' \u00b7 ' + segSel.size + ' segments' : '') + '</b>' +
      '<div class="wrow"><label>width <input id="tp-w" type="number" step="0.05" value="' + w + '"></label>' +
      '<label>layer <select id="tp-layer">' + layerOpts + '</select></label></div>' +
      '<div class="whint">' + len.toFixed(2) + ' mm selected \u00b7 [ ] steps \u00b7 \\ net default \u00b7 P power \u00b7 Z 50 \u03a9' + (widthFloor() ? ' \u00b7 min ' + widthFloor() + ' mm' : '') + '</div>' +
      (clsHint ? '<div class="whint">' + propsEsc(netClassLine(clsHint)) + '</div>' : '') +
      (zHint ? '<div class="whint">' + zHint + '</div>' : '') +
      '<div class="wrow"><button id="tp-apply">apply</button></div>';
    document.getElementById('tp-apply').addEventListener('click', propsTraceApply);
    var inp = document.getElementById('tp-w');
    inp.addEventListener('keydown', function (kev) {
      kev.stopPropagation();
      if (kev.key === 'Enter') propsTraceApply();
      if (kev.key === 'Escape') propsToggle();
    });
    document.getElementById('tp-layer').addEventListener('keydown', function (kev) {
      kev.stopPropagation();
      if (kev.key === 'Enter') propsTraceApply();
      if (kev.key === 'Escape') propsToggle();
    });
    return inp;
  }
  function propsTraceApply() {
    var wv = parseFloat(document.getElementById('tp-w').value);
    var lv = (document.getElementById('tp-layer') || {}).value || null;
    if (!(wv > 0) && !lv) return;
    // the board's own rules floor — the dialog is the one width door the
    // [ ] keys' floor didn't cover, and an unguarded one wrote 0.05 mm
    // hairlines into source (sub-pixel in the viewer: "my trace vanished")
    wv = wv > 0 ? Math.min(3, Math.max(widthFloor() || 0.05, +wv.toFixed(3))) : 0;
    var applied = selectionResize(
      function (info) {
        return { w: wv > 0 ? wv : info.w, layer: lv };
      },
      null,
    );
    if (applied) {
      // the selection overlay is a SOLID white line at the trace's own
      // width — left up, it masks the very stroke this edit just repainted
      // (reported twice as "the layer change does nothing until rebuild").
      // Drop it — and the net highlight with it — so the new width/layer
      // color shows the moment apply lands and no later highlight-clear
      // restores a stale pre-edit paint
      segSel.clear();
      viaSel.clear();
      segHiSync();
      viaHiSync();
      clearNetHighlight();
    }
    propsToggle();
  }
  // ---- E on a VIA: barrel size + drill through the via resize machinery ----
  function propsViaBuild() {
    var v = viaSel.values().next().value;
    var net = v.getAttribute('data-net');
    if (net === 'N/C') net = null;
    var size = viaInkSize(v) || 0.6;
    var vp = viaInkPos(v);
    var drill = viaDrillFor(size);
    var ly = viaInkLayers(v);
    for (var ri = 0; ri < routedTracks.length; ri++)
      for (var vi = 0; vi < routedTracks[ri].vias.length; vi++) {
        var vv = routedTracks[ri].vias[vi];
        if (Math.hypot(vv.x - +vp.x.toFixed(3), vv.y + +vp.y.toFixed(3)) < 0.02) {
          if (vv.size) size = vv.size;
          if (vv.drill) drill = vv.drill;
        }
      }
    var clsV = net ? netClassInfo(net) : null;
    propsEl.innerHTML =
      '<b>via' + (net ? ' [' + propsEsc(net) + ']' : ' (no net)') + (viaSel.size > 1 ? ' \u00b7 ' + viaSel.size + ' barrels' : '') + '</b>' +
      '<div class="wrow"><label>\u2300 <input id="vp-size" type="number" step="0.05" value="' + size + '"></label>' +
      '<label>drill <input id="vp-drill" type="number" step="0.05" value="' + drill + '"></label></div>' +
      '<div class="whint">' + (ly.length >= 2 ? propsEsc(ly.join(' \u2192 ')) : 'through') + ' \u00b7 ' + fmtPos(vp.x) + ', ' + fmtPos(-vp.y) + '</div>' +
      '<div class="whint">annular ring ' + ((size - drill) / 2).toFixed(3) + ' mm' + (rules && rules.minViaDiameterMm ? ' \u00b7 board min \u2300' + fmtW(rules.minViaDiameterMm) : '') + '</div>' +
      (clsV ? '<div class="whint">' + propsEsc(netClassLine(clsV)) + '</div>' : '') +
      '<div class="wrow"><button id="vp-apply">apply</button></div>';
    document.getElementById('vp-apply').addEventListener('click', propsViaApply);
    var focus = null;
    for (var id3 of ['vp-size', 'vp-drill']) {
      var el3 = document.getElementById(id3);
      el3.addEventListener('keydown', function (kev) {
        kev.stopPropagation();
        if (kev.key === 'Enter') propsViaApply();
        if (kev.key === 'Escape') propsToggle();
      });
      if (!focus) focus = el3;
    }
    return focus;
  }
  function propsViaApply() {
    var sv = parseFloat(document.getElementById('vp-size').value);
    if (!(sv > 0)) return;
    sv = Math.min(3, Math.max(0.3, +sv.toFixed(3)));
    var dv = parseFloat(document.getElementById('vp-drill').value);
    var res = { size: sv };
    if (dv > 0) res.drill = dv;
    selectionResize(null, function () {
      return res;
    });
    propsToggle();
  }
  // ---- E on a TEXT: board gr_texts edit content + placement + the full
  // style block the pcb.text() API carries (size, font, thickness, italic,
  // bold, justification); a part's reference/value/fab label repositions
  // (its content rides the part's own ref/value fields) — all through the
  // same layoutTextMoves machinery a drag / inline edit / R press uses ----
  function propsSelOpts(list, cur) {
    var s2 = '';
    for (var so = 0; so < list.length; so++)
      s2 += '<option value="' + list[so] + '"' + (list[so] === cur ? ' selected' : '') + '>' + list[so] + '</option>';
    return s2;
  }
  function propsTextBuild() {
    var i = layoutTextSel;
    var t = layoutTexts[i];
    if (!t) return;
    var st = textState(i);
    var mv = layoutTextMoves[i];
    var sty = (mv && mv.style) || {};
    var isLabel = !!(t.kind && t.kind !== 'board');
    // content is editable for board texts and a part's reference (rename)
    // and value labels; the fab refdes mirrors the reference
    var isRef = t.kind === 'reference';
    var isVal = t.kind === 'value';
    var hasContent = !isLabel || isRef || isVal;
    var curText =
      mv && mv.text !== undefined
        ? mv.text
        : isRef
          ? layoutRefEdits[t.ref] !== undefined
            ? layoutRefEdits[t.ref]
            : t.text
          : isVal
            ? layoutValueEdits[t.ref] !== undefined
              ? layoutValueEdits[t.ref]
              : t.text
            : t.text;
    // effective style: pending edit > authored > the API's own default
    var hEff = sty.h !== undefined ? sty.h : t.h || 1.27;
    var wEff = sty.w !== undefined ? sty.w : t.w !== undefined ? t.w : hEff;
    var thEff = sty.thickness !== undefined ? sty.thickness : t.thickness !== undefined ? t.thickness : 0.15;
    var fEff = sty.font !== undefined ? sty.font : t.font || '';
    var itEff = sty.italic !== undefined ? sty.italic : !!t.italic;
    var bdEff = sty.bold !== undefined ? sty.bold : !!t.bold;
    var jf = (sty && sty.justify) || t.justify || {};
    var jh = jf.horizontal || 'center';
    var jv = jf.vertical || 'middle';
    var rotOpts = '';
    for (var rd = 0; rd <= 3; rd++)
      rotOpts += '<option' + ((mv && (mv.rot || 0)) === rd ? ' selected' : '') + '>' + rd * 90 + '</option>';
    propsEl.innerHTML =
      '<b>' + (isLabel ? propsEsc(t.kind) + ' label' : 'text') + (t.ref ? ' \u00b7 ' + propsEsc(t.ref) : '') + '</b>' +
      (hasContent
        ? '<div class="wrow"><label>text <input id="tx-text" style="width:150px" value="' + propsEsc(curText) + '"></label></div>'
        : '') +
      '<div class="wrow"><label>x <input id="tx-x" type="number" step="0.5" value="' + st.x.toFixed(2) + '"></label>' +
      '<label>y <input id="tx-y" type="number" step="0.5" value="' + (-st.y).toFixed(2) + '"></label>' +
      '<label>rot <select id="tx-rot">' + rotOpts + '</select></label></div>' +
      '<div class="wrow"><label>h <input id="tx-h" type="number" step="0.05" value="' + +hEff.toFixed(3) + '"></label>' +
      '<label>w <input id="tx-w" type="number" step="0.05" value="' + +wEff.toFixed(3) + '"></label>' +
      '<label>thick <input id="tx-th" type="number" step="0.01" value="' + +thEff.toFixed(3) + '"></label></div>' +
      '<div class="wrow"><label>font <input id="tx-font" style="width:84px" value="' + propsEsc(fEff) + '"></label>' +
      '<label><select id="tx-jh">' + propsSelOpts(['left', 'center', 'right'], jh) + '</select></label>' +
      '<label><select id="tx-jv">' + propsSelOpts(['top', 'middle', 'bottom'], jv) + '</select></label></div>' +
      '<div class="wrow"><label><input id="tx-it" type="checkbox"' + (itEff ? ' checked' : '') + '> italic</label>' +
      '<label><input id="tx-bd" type="checkbox"' + (bdEff ? ' checked' : '') + '> bold</label>' +
      '<label><input id="tx-jm" type="checkbox"' + (jf.mirror ? ' checked' : '') + '> mirror</label></div>' +
      '<div class="whint">' + (t.side === 'back' ? 'back' : 'front') + ' side' + (t.layerKind ? ' \u00b7 ' + propsEsc(t.layerKind) : '') + ' \u00b7 ' + (t.h || 1).toFixed(2) + ' mm tall' +
      (isRef ? ' \u00b7 renames the part' : '') +
      (isVal ? ' \u00b7 edits the part\u2019s value' : '') +
      (t.kind === 'fab' ? ' \u00b7 mirrors the reference \u2014 reposition/style only' : '') + '</div>' +
      '<div class="wrow"><button id="tx-apply">apply</button></div>';
    document.getElementById('tx-apply').addEventListener('click', propsTextApply);
    for (var id4 of ['tx-text', 'tx-x', 'tx-y', 'tx-h', 'tx-w', 'tx-th', 'tx-font']) {
      var el4 = document.getElementById(id4);
      if (el4)
        el4.addEventListener('keydown', function (kev) {
          kev.stopPropagation();
          if (kev.key === 'Enter') propsTextApply();
          if (kev.key === 'Escape') propsToggle();
        });
    }
    for (var id5 of ['tx-rot', 'tx-jh', 'tx-jv']) {
      var el5 = document.getElementById(id5);
      if (el5)
        el5.addEventListener('keydown', function (kev) {
          kev.stopPropagation();
          if (kev.key === 'Enter') propsTextApply();
          if (kev.key === 'Escape') propsToggle();
        });
    }
  }
  function propsTextApply() {
    var i = layoutTextSel;
    var t = layoutTexts[i];
    if (!t) return;
    var isLabel = !!(t.kind && t.kind !== 'board');
    var isRef = t.kind === 'reference';
    var isVal = t.kind === 'value';
    var hasContent = !isLabel || isRef || isVal;
    // read every field BEFORE the state changes — the rebuilds below
    // replace the panel DOM they came from
    var nt = hasContent ? document.getElementById('tx-text').value : undefined;
    var nx = parseFloat(document.getElementById('tx-x').value);
    var nyG = -parseFloat(document.getElementById('tx-y').value);
    var nrot = ((parseInt(document.getElementById('tx-rot').value, 10) / 90 || 0) % 4 + 4) % 4;
    if (isFinite(nx)) nx = Math.round(nx / layoutGridSize) * layoutGridSize;
    if (isFinite(nyG)) nyG = Math.round(nyG / layoutGridSize) * layoutGridSize;
    // the style block: finals for every style option, clamped to sane
    // ranges (garbage falls back to the authored value)
    var hv = parseFloat(document.getElementById('tx-h').value);
    var wv2 = parseFloat(document.getElementById('tx-w').value);
    var tv2 = parseFloat(document.getElementById('tx-th').value);
    var fv2 = document.getElementById('tx-font').value.trim();
    var hA = t.h || 1.27;
    var wA = t.w !== undefined ? t.w : hA;
    var thA = t.thickness !== undefined ? t.thickness : 0.15;
    var jA = t.justify || {};
    var ns = {
      h: hv > 0.05 && hv < 30 ? +hv.toFixed(3) : hA,
      w: wv2 > 0.05 && wv2 < 30 ? +wv2.toFixed(3) : wA,
      thickness: tv2 >= 0 && tv2 < 5 ? +tv2.toFixed(3) : thA,
      font: fv2 || undefined,
      italic: document.getElementById('tx-it').checked,
      bold: document.getElementById('tx-bd').checked,
      justify: {
        horizontal: document.getElementById('tx-jh').value,
        vertical: document.getElementById('tx-jv').value,
        mirror: document.getElementById('tx-jm').checked,
      },
    };
    // style travels as a DIFF against the authored text — only fields the
    // user actually changed, so apply never sprays neutral keys into
    // source literals (a position-only edit carries no style at all)
    var diff = {};
    if (Math.abs(ns.h - hA) > 1e-4) diff.h = ns.h;
    if (Math.abs(ns.w - wA) > 1e-4) diff.w = ns.w;
    if (Math.abs(ns.thickness - thA) > 1e-4) diff.thickness = ns.thickness;
    if (ns.font !== undefined && ns.font !== (t.font || '')) diff.font = ns.font;
    if (!!ns.italic !== !!t.italic) diff.italic = ns.italic;
    if (!!ns.bold !== !!t.bold) diff.bold = ns.bold;
    if (
      (ns.justify.horizontal || 'center') !== (jA.horizontal || 'center') ||
      (ns.justify.vertical || 'middle') !== (jA.vertical || 'middle') ||
      !!ns.justify.mirror !== !!jA.mirror
    )
      diff.justify = ns.justify;
    var nsOut = Object.keys(diff).length ? diff : null;
    // a reference label's content is the part rename; a value label's is
    // the value edit — both ride their own apply arrays
    var refEditBefore = isRef && t.ref ? layoutRefEdits[t.ref] : undefined;
    var valEditBefore = isVal && t.ref ? layoutValueEdits[t.ref] : undefined;
    var contentChanged = false;
    if (isRef && t.ref && nt !== undefined && nt !== '' && nt !== t.text && nt !== refEditBefore) {
      layoutRefEdits[t.ref] = nt;
      contentChanged = true;
    }
    if (isVal && t.ref && nt !== undefined && nt !== '' && nt !== (t.text || '') && nt !== valEditBefore) {
      layoutValueEdits[t.ref] = nt;
      contentChanged = true;
    }
    var base = labelBase(i);
    var before = layoutTextMoves[i] || null;
    var prev = before || { ox: 0, oy: 0, rot: 0, text: undefined, text0: t.text };
    var mv = {
      ox: isFinite(nx) ? +(nx - base.x).toFixed(4) : prev.ox || 0,
      oy: isFinite(nyG) ? +(nyG - base.y).toFixed(4) : prev.oy || 0,
      rot: nrot,
      text: !isLabel && nt !== undefined && nt !== '' && nt !== t.text ? nt : prev.text,
      text0: t.text,
      style: nsOut,
    };
    layoutTextMoves[i] = mv;
    if (contentChanged) syncCompTextVisuals(true);
    syncTextVisual(i);
    renderLayoutMoves();
    var refEditAfter = isRef && t.ref ? layoutRefEdits[t.ref] : undefined;
    var valEditAfter = isVal && t.ref ? layoutValueEdits[t.ref] : undefined;
    pushUndo(
      'text properties ' + (t.ref || curTextShorthand(t)),
      function () {
        if (isRef && t.ref) {
          if (refEditBefore === undefined) delete layoutRefEdits[t.ref];
          else layoutRefEdits[t.ref] = refEditBefore;
        }
        if (isVal && t.ref) {
          if (valEditBefore === undefined) delete layoutValueEdits[t.ref];
          else layoutValueEdits[t.ref] = valEditBefore;
        }
        if (before) layoutTextMoves[i] = before;
        else delete layoutTextMoves[i];
        if (contentChanged) syncCompTextVisuals(true);
        syncTextVisual(i);
        renderLayoutMoves();
      },
      function () {
        if (isRef && t.ref && refEditAfter !== undefined) layoutRefEdits[t.ref] = refEditAfter;
        if (isVal && t.ref && valEditAfter !== undefined) layoutValueEdits[t.ref] = valEditAfter;
        layoutTextMoves[i] = mv;
        if (contentChanged) syncCompTextVisuals(true);
        syncTextVisual(i);
        renderLayoutMoves();
      },
    );
    propsToggle();
    if (statusEl && !statusLocked())
      statusEl.textContent = 'text properties applied \u2014 apply & rebuild writes source';
  }
  function curTextShorthand(t) {
    return '"' + String(t.text === undefined ? '' : t.text).slice(0, 18) + '"';
  }
  function propsBuild() {
    // selection decides what E edits — the most recent gesture (part press,
    // trace press, via press, text grab) owns the panel, so an open one
    // follows every click; a gesture whose selection has since been cleared
    // falls back to whatever is still selected (via, then trace, then part)
    if (propsKind === 'via' && viaSel.size) {
      propsViaBuild();
      return;
    }
    if (propsKind === 'trace' && segSel.size) {
      propsTraceBuild();
      return;
    }
    if (propsKind === 'text' && layoutTextSel >= 0 && layoutTexts[layoutTextSel]) {
      propsTextBuild();
      return;
    }
    if (propsKind !== 'part' && !layoutSel.length && viaSel.size) {
      propsViaBuild();
      return;
    }
    if (propsKind !== 'part' && !layoutSel.length && segSel.size) {
      propsTraceBuild();
      return;
    }
    var ref = propsRef();
    if (!ref) {
      propsEl.innerHTML = '<div class="whint">select a part, trace, via, or text first \u2014 E edits its properties</div>';
      return;
    }
    var c = null;
    for (var i = 0; i < layoutComps.length && !c; i++) if (layoutComps[i].ref === ref) c = layoutComps[i];
    if (!c) {
      propsEl.innerHTML = '<div class="whint">no data for ' + ref + '</div>';
      return;
    }
    var st = compStateAt(ref);
    // every read-only property the model carries: pin->net straight from
    // the PCB pad manifest (the island's net list is the fallback), the
    // body size + board side, and the first non-default net class that
    // claims one of its nets
    var padsOf = [];
    for (var pm = 0; pm < padManifest.length; pm++)
      if (padManifest[pm].ref === ref) padsOf.push(padManifest[pm]);
    var padRows = '';
    if (padsOf.length) {
      // one row per pin (a pin with several pads shows once — its net is
      // the same on every land)
      var seenPins = {};
      var padList = [];
      for (var pd2 = 0; pd2 < padsOf.length; pd2++) {
        var key2 = padsOf[pd2].pin + '|' + (padsOf[pd2].net || '');
        if (seenPins[key2]) continue;
        seenPins[key2] = 1;
        padList.push(padsOf[pd2]);
      }
      var shown = padList.length > 10 ? padList.slice(0, 10) : padList;
      padRows = shown
        .map(function (p) {
          return propsEsc(String(p.pin)) + ' ' + propsEsc(p.net || 'N/C');
        })
        .join(' \u00b7 ');
      if (padList.length > 10) padRows += ' \u00b7 +' + (padList.length - 10) + ' more';
    } else if (c.nets && c.nets.length) {
      padRows = 'nets: ' + c.nets.map(propsEsc).join(', ');
    }
    var clsHintP = null;
    var clsNetSrc = padsOf.length ? padsOf : (c.nets || []).map(function (n) { return { net: n }; });
    for (var cn = 0; cn < clsNetSrc.length && !clsHintP; cn++) {
      var cnn = clsNetSrc[cn] && clsNetSrc[cn].net;
      if (!cnn) continue;
      var infoP = netClassInfo(cnn);
      // the catch-all Default class is the floor every net already has —
      // only a NAMED class earns the line
      if (infoP && !/^default$/i.test(infoP.name)) clsHintP = infoP;
    }
    propsEl.innerHTML =
      '<b>' + ref + (layoutSel.length > 1 ? ' (+' + (layoutSel.length - 1) + ')' : '') + '</b>' +
      '<div class="wrow"><label>ref <input id="pp-ref" value="' + (layoutRefEdits[ref] !== undefined ? layoutRefEdits[ref] : ref) + '"></label>' +
      '<label>value <input id="pp-val" value="' + (layoutValueEdits[ref] !== undefined ? layoutValueEdits[ref] : c.value || '') + '"></label></div>' +
      '<div class="wrow"><label>x <input id="pp-x" type="number" step="0.5" value="' + st.x.toFixed(2) + '"></label>' +
      '<label>y <input id="pp-y" type="number" step="0.5" value="' + (-st.y).toFixed(2) + '"></label>' +
      '<label>rot <select id="pp-rot"><option' + (((layoutRot[ref] || 0) * 90) === 0 ? ' selected' : '') + '>0</option><option' + (((layoutRot[ref] || 0) * 90) === 90 ? ' selected' : '') + '>90</option><option' + (((layoutRot[ref] || 0) * 90) === 180 ? ' selected' : '') + '>180</option><option' + (((layoutRot[ref] || 0) * 90) === 270 ? ' selected' : '') + '>270</option></select></label></div>' +
      '<div class="whint">' + c.w.toFixed(1) + ' \u00d7 ' + c.h.toFixed(1) + ' mm \u00b7 ' + (c.side === 'back' ? 'back' : 'front') + ' side' + (padRows ? ' \u00b7 ' + padRows : '') + '</div>' +
      (clsHintP ? '<div class="whint">' + propsEsc(netClassLine(clsHintP)) + '</div>' : '') +
      '<div class="wrow"><button id="pp-apply">apply</button></div>';
    document.getElementById('pp-apply').addEventListener('click', propsApply);
    // Enter applies anywhere in the panel
    for (var id2 of ['pp-ref', 'pp-val', 'pp-x', 'pp-y']) {
      var el = document.getElementById(id2);
      if (el)
        el.addEventListener('keydown', function (kev) {
          kev.stopPropagation();
          if (kev.key === 'Enter') propsApply();
          if (kev.key === 'Escape') propsToggle();
        });
    }
  }
  function propsApply() {
    var ref = propsRef();
    if (!ref) return;
    // ref/value edits ride the existing rename/value-edit machinery
    var nr = document.getElementById('pp-ref').value.trim();
    var vl = document.getElementById('pp-val').value;
    if (nr && nr !== ref) {
      layoutRefEdits[ref] = nr;
      syncCompTextVisuals(true);
    }
    if (vl !== undefined && vl !== '' && vl !== (layoutValueEdits[ref] !== undefined ? layoutValueEdits[ref] : '')) {
      layoutValueEdits[ref] = vl;
      syncCompTextVisuals(true);
    }
    // placement: board x / y (y-down), through the move machinery + undo.
    // x/y apply to the PRIMARY part only — stacking the whole selection on
    // one point is never what's wanted; rotation applies to each in place.
    var nx = parseFloat(document.getElementById('pp-x').value);
    var nyG = -parseFloat(document.getElementById('pp-y').value);
    var nrot = parseInt(document.getElementById('pp-rot').value, 10) / 90;
    var refs = layoutSel.slice();
    var before = snapMoves(refs);
    var ripBefore = layoutRipped.length;
    for (var i = 0; i < refs.length; i++) {
      var g = layoutOverlay.querySelector('[data-ref="' + cssEsc(refs[i]) + '"]');
      if (!g) continue;
      layoutRot[refs[i]] = ((nrot % 4) + 4) % 4;
      var tx = refs[i] === ref ? nx : g.__lx;
      var ty = refs[i] === ref ? nyG : g.__ly;
      setCompPos(g, Math.round(tx / layoutGridSize) * layoutGridSize, Math.round(ty / layoutGridSize) * layoutGridSize);
      applyCompGhost(g);
      commitLayoutMove(g);
    }
    var after = snapMoves(refs);
    var ripped = layoutRipped.slice(ripBefore);
    pushUndo(
      'properties ' + ref,
      function () {
        restoreMoves(before);
        restoreRippedTo(ripBefore);
      },
      function () {
        restoreMoves(after);
        for (var r2 = 0; r2 < ripped.length; r2++) ripUpEl(ripped[r2]);
      },
    );
    refreshRatsnest();
    refreshLayoutWarnings();
    renderLayoutMoves();
    propsToggle();
    if (statusEl && !statusLocked()) statusEl.textContent = 'properties applied \u2014 apply & rebuild writes source';
  }
  function propsToggle() {
    var open = propsEl.style.display === 'none';
    propsEl.style.display = open ? 'block' : 'none';
    if (open) {
      propsBuild();
      // the open's own build is the baseline propsSync diffs against —
      // without it the first selection sync after opening would rebuild a
      // panel that already shows exactly that selection
      propsSigLast = propsSig();
      // whichever panel was built, its first editable field takes focus
      var first =
        document.getElementById('pp-ref') ||
        document.getElementById('tp-w') ||
        document.getElementById('vp-size') ||
        document.getElementById('tx-text') ||
        document.getElementById('tx-x');
      if (first) first.focus();
    }
  }
  propsEl.addEventListener('click', function (ev) {
    if (ev.target === propsEl) propsToggle();
  });
  // fast-apply hook: the host wrote move-only edits to source WITHOUT the
  // ~25s rebuild pipeline — visuals already match, so bake the pending
  // moves into the island data (parts, pads, texts) and retire the session
  // state. Without the bake, cleared layoutMoves would strand the manifest
  // back at authored positions and a SECOND apply would double-apply the
  // delta against a stale x0.
  window.__typecadSessionApplied = function () {
    undoStack = [];
    redoStack = [];
    for (var ci = 0; ci < layoutComps.length; ci++) {
      var c = layoutComps[ci];
      var mv = layoutMoves[c.ref];
      if (mv) {
        c.x = mv.x;
        c.y = mv.y;
        // rotation bakes into the island degrees so setCompPos/compStateAt
        // (which read island rot + presses) stay consistent with the visual
        c.rot = (c.rot + (layoutRot[c.ref] || 0) * 90) % 360;
      }
    }
    for (var pi = 0; pi < padManifest.length; pi++) {
      var e = padEffBoard(padManifest[pi]);
      padManifest[pi].x = e.x;
      padManifest[pi].y = e.y;
    }
    for (var ti = 0; ti < layoutTexts.length; ti++) {
      if (layoutTextMoves[ti]) {
        layoutTexts[ti].x += layoutTextMoves[ti].ox || 0;
        layoutTexts[ti].y += layoutTextMoves[ti].oy || 0;
      }
    }
    // ghost-ink baselines: applyCompGhost computes transforms as a delta
    // from the island position, which is now the MOVED one — freeze each
    // ghost element's current cumulative transform as its baked base so a
    // later drag PREPENDS the new delta instead of replacing the transform
    // (which would snap the ink back to the authored position)
    if (layoutOverlay) {
      for (var gi = 0; gi < layoutComps.length; gi++) {
        var gg = layoutOverlay.querySelector('[data-ref="' + cssEsc(layoutComps[gi].ref) + '"]');
        if (!gg || !gg.__ghostEls) continue;
        for (var ge = 0; ge < gg.__ghostEls.length; ge++) {
          var gel = gg.__ghostEls[ge];
          var cur = gel.getAttribute('transform');
          gel.__bakedTr0 = cur || ''; // '' = authored position, no base
        }
        // zero-delta re-sync keeps the visuals exactly where they are
        applyCompGhost(gg);
      }
    }
    layoutMoves = {};
    layoutRot = {};
    layoutTextMoves = {};
    layoutValueEdits = {}; // written to source by the fast apply — disarm
    layoutRefEdits = {};
    routedTracks = [];
    routedDeletes = [];
    persistPending();
    syncCompTextVisuals(false);
    renderLayoutMoves();
    refreshRatsnest();
    refreshLayoutWarnings();
    if (statusEl && !statusLocked())
      statusEl.textContent = 'applied to source \u2014 view refreshes on the next board build';
  };
  function widthPopToggle() {
    widthPop.classList.toggle('open');
    widthControlSync();
    if (widthPop.classList.contains('open')) widthInp.focus();
  }
  function widthControlSync() {
    // the width the NEXT route would start at (per-net memory, else the
    // last width used anywhere, else the heuristic) — the toolbar button
    // shows it, the popover marks its rung
    var curW = routeState ? routeState.w : pendingWidthOverride || routeWidth(null, null);
    var btn = document.getElementById('btn-width');
    if (btn) {
      btn.hidden = !document.body.classList.contains('typecad-layout');
      btn.textContent = fmtW(curW) + ' mm';
      btn.classList.toggle('armed', !!routeState);
    }
    var rungs = widthLadder.querySelectorAll('button');
    for (var i = 0; i < rungs.length; i++)
      rungs[i].classList.toggle('cur', Math.abs(parseFloat(rungs[i].textContent) - curW) < 0.005);
    var curV = routeState ? routeState.via.size : pendingViaOverride || startViaFor(null, curW).size;
    var vrungs = viaLadder.querySelectorAll('button');
    for (var r = 0; r < vrungs.length; r++)
      vrungs[r].classList.toggle('cur', Math.abs(parseFloat(vrungs[r].textContent) - curV) < 0.005);
    widthVia.textContent = 'trace mm';
    viaDrillLbl.textContent = 'via \u2300 \u00b7 drill ' + fmtW(viaDrillFor(curV));
    widthHint.textContent = routeState
      ? (routeState.net || 'no net') + ' \u00b7 [ ] trace \u00b7 Shift+[ ] via \u00b7 P power \u00b7 Alt\u00b10.01 \u00b7 \\ net default'
      : 'next route \u00b7 [ ] trace \u00b7 Shift+[ ] via \u00b7 P power sizes for the net\u2019s current \u00b7 Alt\u00b10.01 \u00b7 \\ net default';
    var floor = widthFloor();
    if (floor) widthHint.textContent += ' \u00b7 board min ' + fmtW(floor) + ' mm';
    var vfloor = viaFloor();
    if (vfloor) widthHint.textContent += ' \u00b7 via min \u2300' + fmtW(vfloor);
    widthHint.textContent += ' \u00b7 keep-out ' + fmtW(clearanceRule()) + ' mm (halo)';
    if (widthPop.classList.contains('open')) {
      if (document.activeElement !== widthInp) widthInp.value = curW;
      if (document.activeElement !== viaInp) viaInp.value = curV;
    }
  }
  // ---- width from the net's own copper, falling back to a power heuristic
  function routeWidth(net, layerGroup) {
    var mem = netWidthMemory(net);
    if (mem) return mem;
    // the net's CLASS default outranks both the last width used anywhere
    // and the copper heuristics — the board's own intent for this net
    var cls = netClassFor(net);
    if (cls && cls.width > 0.05) return cls.width;
    // no memory for THIS net: the last width committed anywhere carries —
    // the fan-out session's chosen size follows to the next signal
    if (widthMemory.last > 0.05) return widthMemory.last;
    if (net && layerGroup) {
      var ws = [];
      var els = layerGroup.querySelectorAll('path[data-w][data-net]');
      for (var i = 0; i < els.length; i++) {
        if (els[i].getAttribute('data-net') !== net) continue;
        var v = parseFloat(els[i].getAttribute('data-w'));
        if (v > 0.05) ws.push(v);
      }
      if (ws.length) {
        ws.sort(function (a, b) { return a - b; });
        return +ws[Math.floor(ws.length / 2)].toFixed(3);
      }
    }
    if (net && /^(vcc|gnd|power|\+\d)/i.test(net)) return 0.55;
    return 0.3;
  }
  // a picked pad highlights THE PAD — white clones of its own copper
  // flashes, inserted right after the originals so the exact aperture
  // shape, position, and any live move transform carry over (BGA balls,
  // oblong pads, everything). Aperture symbols carry no fill of their own,
  // so the clone's fill paints the whole shape; .cut holes keep the
  // background (the drill stays a hole)
  var padHiClones = [];
  function padSelMark(p) {
    for (var i = 0; i < padHiClones.length; i++) padHiClones[i].remove();
    padHiClones = [];
    var flashes = viewGroups.gerber.querySelectorAll("g[data-kind='copper'] use[data-ref][data-pin]");
    for (var f = 0; f < flashes.length; f++) {
      var orig = flashes[f];
      if (orig.getAttribute('data-ref') !== p.ref || orig.getAttribute('data-pin') !== String(p.pin)) continue;
      var cl = orig.cloneNode(false);
      cl.setAttribute('class', 'pad-hi-ink');
      cl.setAttribute('pointer-events', 'none');
      orig.parentNode.insertBefore(cl, orig.nextSibling);
      padHiClones.push(cl);
    }
    return padHiClones.length;
  }
  function setPadHighlight(p) {
    clearPadHighlight();
    if (!p) return;
    padHi = p;
    padSelMark(p);
    raisePadLabels();
    if (statusEl && !statusLocked())
      statusEl.textContent = p.ref + '.' + p.pin + (p.net ? ' [' + p.net + ']' : ' [no net]') + ' \u2014 X to route a track';
  }
  function clearPadHighlight() {
    padHi = null;
    for (var i = 0; i < padHiClones.length; i++) padHiClones[i].remove();
    padHiClones = [];
    clearTraceHighlight();
  }
  // a tie-in start point ON existing copper (pressed trace/via): the X
  // route starts here, inheriting the copper's net — the selection mark is
  // the same ants box a pad gets, sized to the tie point
  // NO canvas mark: a trace press arms the route start silently — the
  // status line alone says where X will start from
  function setTraceHighlight(t) {
    clearPadHighlight();
    if (!t) return;
    // the armed point must be real board coordinates: garbage here used
    // to surface later as a toFixed crash inside routeKey (route start
    // failed). Reject it loudly at the source — a re-press re-arms.
    if (typeof t.gx !== 'number' || typeof t.gy !== 'number' || !isFinite(t.gx) || !isFinite(t.gy)) {
      try { console.error('bad tie-in arming', t, new Error().stack); window.__badArm = JSON.stringify(t); } catch (e2) {}
      if (statusEl && !statusLocked()) statusEl.textContent = 'bad tie-in point — press the trace again';
      return;
    }
    traceHi = t;
    var tn = t.net && t.net !== 'N/C' ? t.net : null;
    if (statusEl && !statusLocked())
      statusEl.textContent = (t.kind === 'via' ? 'via' : 'trace') + (tn ? ' [' + tn + ']' : ' [no net]') + ' \u2014 X to route a track';
  }
  function clearTraceHighlight() {
    traceHi = null;
  }
  function newPiece(layerGroup) {
    var inkVar = '--ink-' + layerGroup.getAttribute('data-layer-id');
    var haloEl = makeHalo(routeState.w);
    routeUiGroup().appendChild(haloEl);
    var anchored = document.createElementNS(SVGNSL, 'path');
    anchored.setAttribute('class', 'route-anchored');
    anchored.setAttribute('stroke', getComputedStyle(layerGroup).fill || '#c87533');
    anchored.setAttribute('stroke-width', String(routeState.w));
    anchored.setAttribute('fill', 'none');
    anchored.setAttribute('stroke-linecap', 'round');
    anchored.setAttribute('stroke-linejoin', 'round');
    anchored.__halo = haloEl;
    routeUiGroup().appendChild(anchored);
    return {
      canon: copperCanon(layerGroup.getAttribute('data-layer-name')),
      layerGroup: layerGroup,
      inkVar: inkVar,
      inkColor: getComputedStyle(layerGroup).fill || '#c87533',
      anchoredEl: anchored,
      haloEl: haloEl,
      // the piece's OWN width: a width change mid-route severs the piece,
      // so every piece carries one width end-to-end
      w: routeState.w,
      obstacles: buildObstacles(layerGroup, routeState.net),
      points: [],
    };
  }
  // brighten the routed net's ratsnest wires so the target reads while
  // routing (cleared with the route)
  function ratsHighlight(net) {
    var prev = document.querySelectorAll('#ratsnest path.rat-hi');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('rat-hi');
    if (!net) return;
    var hits = document.querySelectorAll('#ratsnest path[data-net="' + cssEsc(net) + '"]');
    for (var j = 0; j < hits.length; j++) hits[j].classList.add('rat-hi');
  }
  function routeKey() {
    if (routeState) return;
    if (!padHi && !traceHi) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'click a pad or trace first \u2014 X routes a track from it';
      return;
    }
    // start FROM a pad, or from a pressed point ON a trace/via (the route
    // inherits the copper's net and layer — a branch leaves it centered)
    var lg, c, startNet, startPad = null, startLbl;
    if (padHi) {
      lg = layerGroupForPad(padHi);
      if (!lg) return;
      c = padCenter(padHi);
      startNet = padHi.net || null;
      startPad = padHi;
      startLbl = padHi.ref + '.' + padHi.pin;
    } else {
      lg = traceHi.layerGroup || copperGroups()[0];
      if (!lg) return;
      c = { x: traceHi.gx, y: traceHi.gy };
      startNet = traceHi.net && traceHi.net !== 'N/C' ? traceHi.net : null;
      startLbl = traceHi.kind === 'via' ? 'via' : 'trace' + (startNet ? ' [' + startNet + ']' : '');
      segSel.clear();
      segHiSync();
      viaSel.clear();
      viaHiSync();
    }
    // a width/via stepped before X owns this route; the route's commit then
    // remembers them per net
    var startW = pendingWidthOverride || routeWidth(startNet, lg);
    pendingWidthOverride = 0;
    var startVia = startViaFor(startNet, startW);
    pendingViaOverride = 0;
    routeState = {
      sx: c.x,
      sy: c.y,
      net: startNet,
      w: startW,
      via: startVia,
      viaCoupled: startVia.coupled,
      startPad: startPad,
      startLbl: startLbl,
      targetPad: null,
      targetTie: null,
      targetRing: null,
      pieces: [],
      path: null, // created below — null until then (routeCancel guards)
      vias: [], // {x, y} gerber, where a layer switch happened
      lastPts: [],
      clearState: 'ok',
    };
    // anything below throwing must not wedge the router (a stuck
    // routeState kills every trace click and X): unwind on throw
    try {
    var piece = newPiece(lg);
    piece.points.push({ x: c.x, y: c.y });
    routeState.pieces.push(piece);
    routeState.halo = makeHalo(routeState.w);
    routeUiGroup().appendChild(routeState.halo);
    routeState.path = document.createElementNS(SVGNSL, 'path');
    routeState.path.setAttribute('class', 'route-preview');
    routeState.path.setAttribute('stroke-width', String(routeState.w));
    routeState.path.setAttribute('fill', 'none');
    routeState.path.setAttribute('stroke-linecap', 'round');
    routeState.path.__halo = routeState.halo;
    // visible FROM THE START: the stroke normally arrives with the first
    // routeFollow, and until the mouse moves the path has no geometry — an
    // armed-but-invisible route silently swallowed every click (each one
    // anchored nothing) and X correctly refused to start another
    routeState.path.setAttribute('stroke', piece.inkColor);
    setRouteD(routeState.path, 'M ' + c.x.toFixed(3) + ' ' + c.y.toFixed(3) + ' L ' + c.x.toFixed(3) + ' ' + c.y.toFixed(3));
    routeUiGroup().appendChild(routeState.path);
    } catch (e) {
      // the route itself failed to build: unwind so the router never wedges
      try { console.error('routeKey build failed', e); window.__rkErr = String((e && e.stack) || e); } catch (e2) {}
      routeCancel();
      if (statusEl && !statusLocked()) statusEl.textContent = 'route start failed: ' + String((e && e.message) || e).slice(0, 60);
      return;
    }
    // peripherals: a failure here must NOT tear down a built route — the
    // route is live and visible; log and carry on
    try { raisePadLabels(); } catch (e3) {}
    try { refreshRatsnest(); } catch (e4) { try { console.error('refreshRatsnest at route start', e4); window.__rrErr = String((e4 && e4.stack) || e4); } catch (e5) {} }
    widthChipSync();
    widthControlSync();
    ratsHighlight(startNet);
    if (statusEl && !statusLocked())
      statusEl.textContent =
        'routing ' + (startNet ? startNet : 'no net') + ' (' + fmtW(routeState.w) + 'mm, via \u2300' + fmtW(routeState.via.size) + ') from ' + startLbl +
        ' \u2014 click to anchor, [ ] width, Shift+[ ] via, V via, Esc cancels';
    clearPadHighlight();
  }
  function curPiece() {
    return routeState.pieces[routeState.pieces.length - 1];
  }
  function routeCancel() {
    if (!routeState) return;
    var rs = routeState;
    // cleared FIRST: any throw in the cleanup below must never wedge the
    // router (a stuck routeState kills every trace click AND X — the
    // segment handler's first guard — and a throwing routeCancel made
    // Escape unable to recover it)
    routeState = null;
    if (rs.path) rs.path.remove();
    if (rs.halo) rs.halo.remove();
    for (var pi = 0; pi < rs.pieces.length; pi++) {
      if (rs.pieces[pi].anchoredEl) rs.pieces[pi].anchoredEl.remove();
      if (rs.pieces[pi].haloEl) rs.pieces[pi].haloEl.remove();
    }
    if (rs.targetRing) rs.targetRing.remove();
    // the blue in-route via markers must go too — committed copies carry
    // the real ink; leaving these read as a stuck highlight on every via
    routeUiGroup().querySelectorAll('.route-via').forEach(function (v) {
      v.remove();
    });
    routeUiGroup().querySelectorAll('.route-via-halo').forEach(function (v) {
      v.remove();
    });
    routeState = null;
    refreshRatsnest();
    ratsHighlight(null);
    widthChipSync();
    widthControlSync();
    if (statusEl && !statusLocked()) statusEl.textContent = 'routing cancelled';
  }
  // snap reach measured in SCREEN pixels, converted to board mm through the
  // live zoom (k = px per gerber mm). Zoomed out it clamps to the classic
  // magnetic feel; zoomed INTO a fine-pitch part the reach shrinks with the
  // pixels, so the gap between pads becomes aimable — a fixed 1.2mm ball
  // covered 2-3 pads of a 0.4mm-pitch part in every direction and swallowed
  // every between-pad target no matter the trace width
  function padSnapRadius() {
    return Math.min(1.2, Math.max(0.15, 14 / k));
  }
  function tieSnapRadius() {
    return Math.min(0.8, Math.max(0.1, 10 / k));
  }
  // snapped endpoint for the mouse position (gerber frame): a pad center
  // within the pad-snap radius wins (same-net preferred), else the 0/45/90
  // ray projection the nearest point on a segment, with the ENDS preferred
  // when close: a stub free end is exactly where a continuing trace wants
  // to start or tie — snapping a hair short of it leaves a visible nub of
  // copper
  // the nearest SEGMENT ENDPOINT within the pad-snap radius: starting at a
  // dangling trace end needs the same magnetic snap finishing has —
  // finding the exact pixel at the tip of a 0.3mm stub is otherwise a
  // needle-threading exercise. Null when nothing is close.
  function nearestTraceEnd(g) {
    var segs = allSegHits();
    var best = null;
    var bestD = padSnapRadius();
    for (var i = 0; i < segs.length; i++) {
      var ends = [
      [parseFloat(segs[i].getAttribute('x1')), parseFloat(segs[i].getAttribute('y1'))],
      [parseFloat(segs[i].getAttribute('x2')), parseFloat(segs[i].getAttribute('y2'))],
      ];
      for (var e = 0; e < 2; e++) {
        var d = Math.hypot(ends[e][0] - g.x, ends[e][1] - g.y);
        if (d < bestD) {
          bestD = d;
          best = { gx: ends[e][0], gy: ends[e][1], net: segs[i].getAttribute('data-net'), kind: 'trace', layerGroup: segs[i].closest("g[data-kind='copper']") };
        }
      }
    }
    return best;
  }
  function snapOnSegment(px, py, x1, y1, x2, y2) {
    var ex = x2 - x1, ey = y2 - y1;
    var l2 = ex * ex + ey * ey;
    var t = l2 < 1e-9 ? 0 : ((px - x1) * ex + (py - y1) * ey) / l2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var END = 0.3; // endpoint wins within this radius (covers the cap)
    if (Math.hypot(px - x1, py - y1) < END) return { x: x1, y: y1 };
    if (Math.hypot(px - x2, py - y2) < END) return { x: x2, y: y2 };
    return { x: x1 + ex * t, y: y1 + ey * t };
  }
  function routeEndpoint(mx, my) {
    var best = null;
    var tie = null; // {x, y, net, kind} — a trace/via tie-in point
    var padReach = padSnapRadius();
    var tieReach = tieSnapRadius();
    // candidates compete on distance; same-net ones get the -0.8 preference.
    // The reach is a per-kind GATE, not the score floor — with a zoomed-in
    // reach of, say, 0.3mm, a +0.8 penalty measured against the radius would
    // disqualify every pad, including the one being finished on
    var bestScore = Infinity;
    for (var pi = 0; pi < padManifest.length; pi++) {
      var p = padManifest[pi];
      if (p === routeState.startPad) continue;
      var c = padCenter(p);
      var d = Math.hypot(c.x - mx, c.y - my);
      if (d > padReach) continue;
      var score = routeState.net && p.net === routeState.net ? d : d + 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = p;
        tie = null;
      }
    }
    // vias and traces are tie-in targets like pads: the barrel center, or
    // the nearest point ON a trace segment (same-net preferred, exactly how
    // pads snap) — a branch leaves the host copper perfectly centered
    var vink = viaInk();
    for (var vi2 = 0; vi2 < vink.length; vi2++) {
      var vpos = viaInkPos(vink[vi2]);
      var vd = Math.hypot(vpos.x - mx, vpos.y - my);
      if (vd > tieReach) continue;
      var vnet = vink[vi2].getAttribute('data-net');
      var vscore = routeState.net && vnet === routeState.net ? vd : vd + 0.8;
      if (vscore < bestScore) {
        bestScore = vscore;
        tie = { x: vpos.x, y: vpos.y, net: vnet, kind: 'via' };
        best = null;
      }
    }
    var segs = allSegHits();
    for (var si2 = 0; si2 < segs.length; si2++) {
      var x1 = parseFloat(segs[si2].getAttribute('x1')), y1 = parseFloat(segs[si2].getAttribute('y1'));
      var x2 = parseFloat(segs[si2].getAttribute('x2')), y2 = parseFloat(segs[si2].getAttribute('y2'));
      var qp = snapOnSegment(mx, my, x1, y1, x2, y2);
      var px = qp.x, py = qp.y;
      var td = Math.hypot(px - mx, py - my);
      if (td > tieReach) continue;
      var tnet = segs[si2].getAttribute('data-net');
      var tscore = routeState.net && tnet === routeState.net ? td : td + 0.8;
      if (tscore < bestScore) {
        bestScore = tscore;
        tie = { x: px, y: py, net: tnet, kind: 'trace' };
        best = null;
      }
    }
    if (best) {
      var bc = padCenter(best);
      return { x: bc.x, y: bc.y, pad: best };
    }
    if (tie) return { x: tie.x, y: tie.y, pad: null, tie: tie };
    var dx = mx - routeState.sx;
    var dy = my - routeState.sy;
    var ang = Math.atan2(dy, dx);
    var step = Math.PI / 4;
    var snap = Math.round(ang / step) * step;
    var len = Math.hypot(dx, dy) * Math.cos(ang - snap);
    if (len < 0) len = 0;
    return { x: routeState.sx + Math.cos(snap) * len, y: routeState.sy + Math.sin(snap) * len, pad: null };
  }
  // the walk from the anchor to a snapped pad: 0/45/90 segments only. Both
  // elbow orders are candidates; the CLEAR one wins, tie broken by the mouse
  function routeWalkCandidates(end) {
    var dx = end.x - routeState.sx;
    var dy = end.y - routeState.sy;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    var TOL = 0.001;
    if (adx < TOL || ady < TOL || Math.abs(adx - ady) < TOL) return [[{ x: end.x, y: end.y }]];
    var sx = dx > 0 ? 1 : -1;
    var sy = dy > 0 ? 1 : -1;
    var d = Math.min(adx, ady);
    var elbowA = { x: routeState.sx + sx * d, y: routeState.sy + sy * d };
    var elbowB =
      adx > ady
        ? { x: routeState.sx + sx * (adx - d), y: routeState.sy }
        : { x: routeState.sx, y: routeState.sy + sy * (ady - d) };
    return [
      [elbowA, { x: end.x, y: end.y }],
      [elbowB, { x: end.x, y: end.y }],
    ];
  }
  function previewPathD(pts) {
    var d = 'M ' + routeState.sx.toFixed(3) + ' ' + routeState.sy.toFixed(3);
    for (var i = 0; i < pts.length; i++) d += ' L ' + pts[i].x.toFixed(3) + ' ' + pts[i].y.toFixed(3);
    return d;
  }
  // the drag trail: orthogonal spine from the anchor, then a 45-degree
  // crook whose far end is EXACTLY the cursor (or pad center). Aligned moves
  // draw a single straight segment; pure-diagonal moves a single 45.
  function routeTrail(mx, my) {
    var dx = mx - routeState.sx;
    var dy = my - routeState.sy;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    var mn = Math.min(adx, ady);
    if (mn < 0.001 || Math.abs(adx - ady) < 0.001) return [{ x: mx, y: my }];
    var sx = dx > 0 ? 1 : -1;
    var sy = dy > 0 ? 1 : -1;
    return [
      { x: mx - sx * mn, y: my - sy * mn },
      { x: mx, y: my },
    ];
  }
  // the alternate order: crook at the ANCHOR, orthogonal run into the cursor
  // (used when the default trail violates clearance)
  function routeTrailFlipped(mx, my) {
    var dx = mx - routeState.sx;
    var dy = my - routeState.sy;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    var mn = Math.min(adx, ady);
    if (mn < 0.001 || Math.abs(adx - ady) < 0.001) return [{ x: mx, y: my }];
    var sx = dx > 0 ? 1 : -1;
    var sy = dy > 0 ? 1 : -1;
    return [
      { x: routeState.sx + sx * mn, y: routeState.sy + sy * mn },
      { x: mx, y: my },
    ];
  }
  function routeFollow(mx, my) {
    if (!routeState) return;
    var end = routeEndpoint(mx, my);
    end.mx = mx;
    end.my = my;
    var piece = curPiece();
    var pts;
    if (end.pad) {
      // pad snap: the walk candidates, clear-first (mouse steers ties)
      var cands = routeWalkCandidates(end);
      var bestPts = cands[0];
      var bestMargin = -Infinity;
      for (var ci = 0; ci < cands.length; ci++) {
        var m = clearanceMargin(piece.obstacles, [{ x: routeState.sx, y: routeState.sy }].concat(cands[ci]), routeState.w);
        var nearer = Math.hypot(cands[ci][0].x - mx, cands[ci][0].y - my);
        var orthoFirst = ci === 1 ? 0.05 : 0;
        var score = m + orthoFirst - nearer * 0.01;
        if (score > bestMargin) {
          bestMargin = score;
          bestPts = cands[ci];
        }
      }
      pts = bestPts;
    } else {
      // free space: the DRAG TRAIL — the trace end is ALWAYS the cursor
      // (or the snapped tie-in point on a trace/via). An orthogonal spine
      // runs from the anchor and a 45-degree crook adjacent to the cursor
      // closes the gap: move straight up and the trace is vertical; drift
      // right and a 45 bend grows near the cursor, sliding along as needed.
      // The FLIPPED order (crook at the anchor) is the fallback when the
      // default violates clearance.
      var tx = end.tie ? end.tie.x : mx;
      var ty = end.tie ? end.tie.y : my;
      pts = routeTrail(tx, ty);
      var trailAlt = routeTrailFlipped(tx, ty);
      if (clearanceMargin(piece.obstacles, [{ x: routeState.sx, y: routeState.sy }].concat(pts), routeState.w) < 0) {
        var altM = clearanceMargin(piece.obstacles, [{ x: routeState.sx, y: routeState.sy }].concat(trailAlt), routeState.w);
        if (altM >= 0) pts = trailAlt;
      }
    }
    routeState.lastEnd = end;
    routeState.lastPts = pts;
    setRouteD(routeState.path, previewPathD(pts));
    // live length readout: the walk so far (anchor chain + pending walk)
    var walkPts = [{ x: routeState.sx, y: routeState.sy }].concat(pts);
    var wl = 0;
    for (var wi = 1; wi < walkPts.length; wi++) wl += Math.hypot(walkPts[wi].x - walkPts[wi - 1].x, walkPts[wi].y - walkPts[wi - 1].y);
    routeState.walkLen = wl;
    widthChipSync();
    // clearance tint: ink while clear, red on violation — binary, the whole
    // route's keep-out halo follows the same state
    var margin = clearanceMargin(piece.obstacles, [{ x: routeState.sx, y: routeState.sy }].concat(pts), routeState.w);
    routeState.clearState = margin >= 0 ? 'ok' : 'bad';
    haloTint(routeState.clearState);
    routeState.path.setAttribute('stroke', routeState.clearState === 'ok' ? piece.inkColor : '#f14c4c');
    var tieKey = end.tie ? end.tie.x.toFixed(3) + ',' + end.tie.y.toFixed(3) + ',' + end.tie.kind : null;
    var curTieKey = routeState.targetTie
      ? routeState.targetTie.x.toFixed(3) + ',' + routeState.targetTie.y.toFixed(3) + ',' + routeState.targetTie.kind
      : null;
    var targetChanged = (routeState.targetPad || null) !== (end.pad || null) || tieKey !== curTieKey;
    if (targetChanged) {
      if (routeState.targetRing) routeState.targetRing.remove();
      // no target ring at all: the walk visibly ending ON the pad/via/trace
      // IS the snap indication — a circle on top adds nothing
      routeState.targetRing = null;
      routeState.targetPad = end.pad || null;
      routeState.targetTie = end.tie || null;
      refreshRatsnest();
    }
    // the routing rubber band: the walk's end ties to the nearest
    // still-unreached pad of the routed net — the pad-to-route-to follows
    // the mouse instead of staying behind on the start pad. All pads
    // reached (hovering the last target): the band vanishes, the arrival
    // itself is the signal
    if (ratsLiveEl && routeState) {
      ratsLiveEl.textContent = '';
      var lp = routeState.__ratsPads || [];
      if (lp.length) {
        // pts are gerber frame (y-up) — the SAME frame the ratsnest group
        // renders in (island pads ride it unnegated); draw as-is or the
        // band mirrors the cursor
        var le = pts[pts.length - 1];
        var ln = null;
        var ld = Infinity;
        for (var li = 0; li < lp.length; li++) {
          var dLive = (lp[li].x - le.x) * (lp[li].x - le.x) + (lp[li].y - le.y) * (lp[li].y - le.y);
          if (dLive < ld) {
            ld = dLive;
            ln = lp[li];
          }
        }
        if (ln) ratsLiveEl.appendChild(ratsWire(le, ln, 0, routeState.net));
      }
    }
  }
  // does the displayed walk actually touch NETTED foreign copper? (N/C pads
  // and unattributed ink are advisory — DRC's call, not the router's)
  function routeHitsNettedCopper(pts) {
    var piece = curPiece();
    var need = routeState.w / 2 + clearanceRule();
    var skipR = routeState.startPad ? Math.max(routeState.startPad.w, routeState.startPad.h) / 2 : 0;
    var sc = routeState.startPad ? padCenter(routeState.startPad) : null;
    var seg = [{ x: routeState.sx, y: routeState.sy }].concat(pts || []);
    for (var sb = 1; sb < seg.length; sb++) {
      var ax = seg[sb - 1].x, ay = seg[sb - 1].y, bx = seg[sb].x, by = seg[sb].y;
      var steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2));
      for (var t = 0; t <= steps; t++) {
        var px = ax + ((bx - ax) * t) / steps;
        var py = ay + ((by - ay) * t) / steps;
        if (sc && Math.hypot(px - sc.x, py - sc.y) < skipR) continue;
        for (var oi = 0; oi < piece.obstacles.length; oi++) {
          var o = piece.obstacles[oi];
          if (!o.net || o.net === 'N/C') continue;
          var dx = Math.max(o.x0 - px, 0, px - o.x1);
          var dy = Math.max(o.y0 - py, 0, py - o.y1);
          var dist = dx || dy ? Math.hypot(dx, dy) : -0.5;
          if (dist - need < 0) return true;
        }
      }
    }
    return false;
  }
  function routeAnchor(end, pts) {
    if (!pts) pts = routeState.lastPts || [{ x: end.x, y: end.y }];
    if (routeState.clearState === 'bad' && !end.pad) {
      // hard refusal only when the walk touches NETTED foreign copper (a
      // real short risk); crossing N/C pads anchors with a warning (DRC
      // adjudicates) — previously ANY red tint blocked the anchor, which
      // made plain clicks read as dead on netless routes
      if (routeHitsNettedCopper(pts)) {
        if (statusEl && !statusLocked()) statusEl.textContent = 'clearance violation — move the trace before anchoring';
        return;
      }
      if (statusEl && !statusLocked()) statusEl.textContent = 'anchored (crosses unconnected copper — DRC will report)';
    }
    var piece = curPiece();
    for (var pa = 0; pa < pts.length; pa++) {
      // skip a point equal to the piece's tail — a double-fire (the second
      // pointerdown of a double-click) must not fold the walk onto itself
      var tailP = piece.points[piece.points.length - 1];
      if (tailP && Math.hypot(pts[pa].x - tailP.x, pts[pa].y - tailP.y) < 0.005) continue;
      piece.points.push(pts[pa]);
    }
    var d = 'M ' + piece.points[0].x.toFixed(3) + ' ' + piece.points[0].y.toFixed(3);
    for (var ai = 1; ai < piece.points.length; ai++)
      d += ' L ' + piece.points[ai].x.toFixed(3) + ' ' + piece.points[ai].y.toFixed(3);
    setRouteD(piece.anchoredEl, d);
    routeState.sx = piece.points[piece.points.length - 1].x;
    routeState.sy = piece.points[piece.points.length - 1].y;
    routeState.lastPts = []; // consumed — a stale trail must not re-fold at commit
    if (statusEl && !statusLocked())
      statusEl.textContent = 'anchored \u2014 ' + (routeState.net ? routeState.net : 'no net') + ' continues; V via, Backspace undo, snap a pad or double-click to finish';
  }
  // ---- via layer cycling: Shift+V advances the far layer through the
  // stack (blind/buried spans), V places to it. Default stays the classic
  // F<->B flip until the first Shift+V ----
  function copperCanonList() {
    // ordered top→bottom; the stackup island's copperLayers is the truth,
    // the rendered copper groups the fallback
    if (stackup && stackup.copperLayers && stackup.copperLayers.length) return stackup.copperLayers;
    var out = [];
    var gs = copperGroups();
    for (var i = 0; i < gs.length; i++) {
      var c = copperCanon(gs[i].getAttribute('data-layer-name'));
      if (c) out.push(c);
    }
    return out;
  }
  function cycleViaTarget() {
    if (!routeState) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'routing only \u2014 Shift+V cycles the via\u2019s far layer while a route is live';
      return;
    }
    var piece = curPiece();
    var layers = copperCanonList();
    if (layers.length < 3) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'only ' + layers.length + ' copper layers \u2014 no blind/buried spans to cycle';
      return;
    }
    var cur = piece ? piece.canon : 'F.Cu';
    var startIdx = Math.max(0, layers.indexOf(routeState.viaTarget || cur));
    var next = null;
    for (var s = 1; s <= layers.length; s++) {
      var cand = layers[(startIdx + s) % layers.length];
      if (cand !== cur) {
        next = cand;
        break;
      }
    }
    if (!next) return;
    routeState.viaTarget = next;
    if (statusEl && !statusLocked())
      statusEl.textContent = 'next via \u2192 ' + next + (next === otherLayerCanon(cur) ? ' (through)' : ' (blind/buried from ' + cur + ')') + ' \u2014 Shift+V cycles, V places';
  }
  function routeVia() {
    if (!routeState) return;
    // freeze the current walk at its endpoint, drop a via, continue on the
    // far layer (cycled target or the classic F<->B flip) from the same point
    var end = routeState.lastEnd || routeEndpoint(routeState.sx, routeState.sy);
    var pts = routeState.lastPts || [{ x: end.x, y: end.y }];
    var piece = curPiece();
    for (var pa = 0; pa < pts.length; pa++) {
      var tailV = piece.points[piece.points.length - 1];
      if (tailV && Math.hypot(pts[pa].x - tailV.x, pts[pa].y - tailV.y) < 0.005) continue;
      piece.points.push(pts[pa]);
    }
    var d = 'M ' + piece.points[0].x.toFixed(3) + ' ' + piece.points[0].y.toFixed(3);
    for (var ai = 1; ai < piece.points.length; ai++)
      d += ' L ' + piece.points[ai].x.toFixed(3) + ' ' + piece.points[ai].y.toFixed(3);
    setRouteD(piece.anchoredEl, d);
    var vx = pts[pts.length - 1].x;
    var vy = pts[pts.length - 1].y;
    var nextCanon = routeState.viaTarget && routeState.viaTarget !== piece.canon ? routeState.viaTarget : otherLayerCanon(piece.canon);
    routeState.vias.push({ x: vx, y: vy, from: piece.canon, to: nextCanon });
    // the barrel's own keep-out ring: via radius + clearance, tinted with
    // the route's clearance state like the trace halo
    var vh = document.createElementNS(SVGNSL, 'circle');
    vh.setAttribute('class', 'route-via-halo');
    vh.setAttribute('cx', vx.toFixed(3));
    vh.setAttribute('cy', vy.toFixed(3));
    vh.setAttribute('r', (routeState.via.size / 2 + clearanceRule()).toFixed(3));
    routeUiGroup().appendChild(vh);
    var viaEl = document.createElementNS(SVGNSL, 'circle');
    viaEl.setAttribute('class', 'route-via');
    viaEl.setAttribute('cx', vx.toFixed(3));
    viaEl.setAttribute('cy', vy.toFixed(3));
    viaEl.setAttribute('r', (routeState.via.size / 2).toFixed(3));
    routeUiGroup().appendChild(viaEl);
    var lg = layerGroupByCanon(nextCanon);
    if (!lg) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'no copper layer group for ' + nextCanon + ' \u2014 via placed, continuing on ' + piece.canon;
      return;
    }
    var np = newPiece(lg);
    np.points.push({ x: vx, y: vy });
    setRouteD(np.anchoredEl, 'M ' + vx.toFixed(3) + ' ' + vy.toFixed(3));
    routeState.pieces.push(np);
    routeState.sx = vx;
    routeState.sy = vy;
    routeState.lastPts = []; // consumed with the via
    routeState.sy = vy;
    routeState.path.setAttribute('stroke', np.inkColor);
    if (statusEl && !statusLocked())
      statusEl.textContent =
        'via placed ' + piece.canon + ' \u2192 ' + nextCanon + ' \u2014 continuing on ' + nextCanon + ' (Shift+V cycles the next span)';
  }
  function routeUndoAnchor() {
    if (!routeState) return;
    var piece = curPiece();
    if (piece.points.length <= 1) {
      // the piece is empty: pop back through the boundary — a via (layer
      // switch) or a width sever (same layer) — to the previous piece
      if (routeState.pieces.length <= 1) {
        if (statusEl && !statusLocked()) statusEl.textContent = 'nothing to undo';
        return;
      }
      routeState.pieces.pop();
      piece.anchoredEl.remove();
      if (piece.haloEl) piece.haloEl.remove();
      var vp = routeState.vias.pop();
      if (vp) {
        var vias = routeUi.querySelectorAll('.route-via');
        if (vias.length) vias[vias.length - 1].remove();
        var vhs = routeUi.querySelectorAll('.route-via-halo');
        if (vhs.length) vhs[vhs.length - 1].remove();
      }
      piece = curPiece();
      piece.points.pop(); // the shared boundary point
      // re-entering a width-severed piece: continuation picks ITS width
      // back up (preview, halo, and a coupled via all re-derive)
      if (piece.w && piece.w !== routeState.w) {
        routeState.w = piece.w;
        routeState.path.setAttribute('stroke-width', String(piece.w));
        if (routeState.halo) routeState.halo.setAttribute('stroke-width', String(haloWidth(piece.w)));
        if (routeState.viaCoupled !== false) {
          routeState.via = viaForWidth(piece.w);
          var vr = (routeState.via.size / 2).toFixed(3);
          routeUiGroup().querySelectorAll('.route-via').forEach(function (v) {
            v.setAttribute('r', vr);
          });
          viaHaloSync();
        }
        widthChipSync();
        widthControlSync();
      }
    } else {
      piece.points.pop();
    }
    if (piece.points.length === 0) return;
    var last = piece.points[piece.points.length - 1];
    routeState.sx = last.x;
    routeState.sy = last.y;
    var d = 'M ' + piece.points[0].x.toFixed(3) + ' ' + piece.points[0].y.toFixed(3);
    for (var ai = 1; ai < piece.points.length; ai++)
      d += ' L ' + piece.points[ai].x.toFixed(3) + ' ' + piece.points[ai].y.toFixed(3);
    setRouteD(piece.anchoredEl, d);
    if (statusEl && !statusLocked()) statusEl.textContent = 'anchor undone';
  }
  function routeCommit() {
    if (!routeState) return;
    domCaptureStart();
    var rtIdxBefore = routedTracks.length;
    var end = routeState.lastEnd || routeEndpoint(routeState.sx, routeState.sy);
    // append the pending preview walk — unless the finalize came through the
    // hint path, which routeAnchor already folded into the piece geometry.
    // Points equal to the piece's tail are skipped: a double-fire (the
    // second pointerdown of a double-click) must not fold the walk
    if (routeState.lastPts) {
      var piece = curPiece();
      for (var wi = 0; wi < routeState.lastPts.length; wi++) {
        var tailC = piece.points[piece.points.length - 1];
        var wp = routeState.lastPts[wi];
        if (tailC && Math.hypot(wp.x - tailC.x, wp.y - tailC.y) < 0.005) continue;
        piece.points.push(wp);
      }
    }
    // commit every piece with actual geometry into ITS layer group
    for (var pi = 0; pi < routeState.pieces.length; pi++) {
      var pc = routeState.pieces[pi];
      if (pc.points.length < 2) continue;
      var d = 'M ' + pc.points[0].x.toFixed(3) + ' ' + pc.points[0].y.toFixed(3);
      for (var ai = 1; ai < pc.points.length; ai++)
        d += ' L ' + pc.points[ai].x.toFixed(3) + ' ' + pc.points[ai].y.toFixed(3);
      var track = document.createElementNS(SVGNSL, 'path');
      track.setAttribute('d', d);
      track.setAttribute('stroke', 'var(' + pc.inkVar + ')');
      track.setAttribute('stroke-width', String(pc.w));
      track.setAttribute('fill', 'none');
      track.setAttribute('stroke-linecap', 'round');
      track.setAttribute('stroke-linejoin', 'round');
      track.setAttribute('data-w', String(pc.w));
      track.setAttribute('data-route', '1');
      if (routeState.net) track.setAttribute('data-net', routeState.net);
      // per-SEGMENT hit paths ride invisibly on top of the drawn track:
      // clicking highlights the exact segment under the cursor (the drawn
      // path stays one polyline for theming and apply). The track is
      // appended FIRST — a painted stroke would otherwise sit above its own
      // hit lines and swallow every click (attachTraceHits arms page-load
      // traces the same way: hits last, above the ink)
      var segPts = pc.points;
      pc.layerGroup.appendChild(track);
      for (var sp = 1; sp < segPts.length; sp++) {
        var hit = makeSegHit(track, segPts[sp - 1].x, segPts[sp - 1].y, segPts[sp].x, segPts[sp].y, pc.w, routeState.net);
        hit.setAttribute('data-route', '1');
        pc.layerGroup.appendChild(hit);
      }
    }
    var commitVia = routeState.via;
    for (var vi = 0; vi < routeState.vias.length; vi++) {
      var v = routeState.vias[vi];
      // the barrel's ink lands only on the layers it SPANS — a blind via
      // must not paint on unrelated copper. No span recorded: every routed
      // layer (the legacy through-via shape)
      var spanGroups = [];
      if (v.to) {
        var gf = layerGroupByCanon(v.from);
        var gt = layerGroupByCanon(v.to);
        if (gf) spanGroups.push(gf);
        if (gt && gt !== gf) spanGroups.push(gt);
      } else {
        spanGroups = routeState.pieces.map(function (p4) {
          return p4.layerGroup;
        });
      }
      for (var gi = 0; gi < spanGroups.length; gi++) {
        var vc = document.createElementNS(SVGNSL, 'circle');
        vc.setAttribute('cx', v.x.toFixed(3));
        vc.setAttribute('cy', v.y.toFixed(3));
        vc.setAttribute('r', (commitVia.size / 2).toFixed(3));
        vc.setAttribute('fill', 'var(' + '--ink-' + spanGroups[gi].getAttribute('data-layer-id') + ')');
        vc.setAttribute('data-route', '1');
        if (routeState.net) vc.setAttribute('data-net', routeState.net);
        spanGroups[gi].appendChild(vc);
        // the drill hole rides the barrel — without it a pre-apply via reads
        // as a solid blob until the rebuild plots the real drill
        vc.__hole = viaHoleFor(vc, commitVia.drill);
      }
    }
    // record for the apply-to-source bridge (board y-down frame)
    routedTracks.push({
      net: routeState.net,
      w: routeState.w,
      power: routeState.power || null,
      impedance: routeState.impedance || null,
      pieces: routeState.pieces.map(function (pc2) {
        return {
          layer: pc2.canon,
          w: pc2.w,
          pts: pc2.points.map(function (pt) {
            return { x: +pt.x.toFixed(3), y: +(-pt.y).toFixed(3) };
          }),
        };
      }),
      vias: routeState.vias.map(function (vv) {
        return {
          x: +vv.x.toFixed(3),
          y: +(-vv.y).toFixed(3),
          size: commitVia.size,
          drill: commitVia.drill,
          layers: vv.from && vv.to ? [vv.from, vv.to] : undefined,
        };
      }),
      // a trace/via start has no manifest pad — the point itself is the source
      from: routeState.startPad
        ? { ref: routeState.startPad.ref, pin: String(routeState.startPad.pin) }
        : { ref: '(trace)', pin: '' },
      to: routeState.targetPad ? { ref: routeState.targetPad.ref, pin: String(routeState.targetPad.pin) } : null,
    });
    var startName = routeState.startPad
      ? routeState.startPad.ref + '.' + routeState.startPad.pin
      : routeState.startLbl || '(trace)';
    // the committed width becomes this net's default for the next route; an
    // explicitly-sized via is remembered the same way (a coupled one isn't —
    // it was never a choice)
    rememberNetWidth(routeState.net, routeState.w);
    if (routeState.viaCoupled === false) rememberNetVia(routeState.net, routeState.via.size);
    // per-segment widths: show the span when the route tapered
    var widths = [];
    for (var wpi = 0; wpi < routeState.pieces.length; wpi++)
      if (routeState.pieces[wpi].points.length >= 2 && widths.indexOf(routeState.pieces[wpi].w) === -1)
        widths.push(routeState.pieces[wpi].w);
    var wSpan = widths.length > 1 ? fmtW(Math.min.apply(null, widths)) + '\u2013' + fmtW(Math.max.apply(null, widths)) : fmtW(routeState.w);
    var msg =
      'track placed: ' + (routeState.net ? routeState.net : 'no net') + ' ' + startName +
      (routeState.targetPad ? ' \u2192 ' + routeState.targetPad.ref + '.' + routeState.targetPad.pin : '') +
      ' \u00b7 ' + wSpan + ' mm \u00b7 ' +
      (function () {
        var tl = 0;
        for (var pl = 0; pl < routeState.pieces.length; pl++) {
          var pp = routeState.pieces[pl].points;
          for (var pi2 = 1; pi2 < pp.length; pi2++) tl += Math.hypot(pp[pi2].x - pp[pi2 - 1].x, pp[pi2].y - pp[pi2 - 1].y);
        }
        return fmtW(tl) + ' mm';
      })() +
      (routeState.vias.length
        ? ' \u00b7 via ' + (function () {
            var spans = [];
            for (var vsi = 0; vsi < routeState.vias.length; vsi++) {
              var vv2 = routeState.vias[vsi];
              var plain = (vv2.from === 'F.Cu' && vv2.to === 'B.Cu') || (vv2.from === 'B.Cu' && vv2.to === 'F.Cu');
              if (!plain && vv2.to && spans.indexOf(vv2.from + '\u2192' + vv2.to) === -1) spans.push(vv2.from + '\u2192' + vv2.to);
            }
            return (spans.length ? spans.join(', ') + ' ' : '') + '\u2300' + fmtW(commitVia.size) + '/' + fmtW(commitVia.drill);
          })()
        : '') +
      ' (' + routeState.pieces.reduce(function (n, p3) { return n + Math.max(0, p3.points.length - 1); }, 0) + ' segments' +
      (routeState.vias.length ? ', ' + routeState.vias.length + ' via' + (routeState.vias.length > 1 ? 's' : '') : '') + ')';
    routeCancel();
    renderLayoutMoves(); // a committed track arms Apply on its own
    widthControlSync();
    // session undo: the committed entry + its ink come back off/on as one
    var rtEntry = routedTracks[routedTracks.length - 1];
    var rtCap = domCaptureEnd();
    if (rtEntry)
      pushUndo(
        'route',
        function () {
          routedTracks.splice(routedTracks.indexOf(rtEntry), 1);
          domApply(rtCap, -1);
        },
        function () {
          routedTracks.push(rtEntry);
          domApply(rtCap, 1);
        },
      );
    if (statusEl && !statusLocked()) statusEl.textContent = msg;
  }
  // commit on left press (capture beats select/box handlers): a snapped pad
  // finalizes; anywhere else anchors the displayed walk
  svg.addEventListener(
    'pointerdown',
    function (ev) {
      if (!routeState || ev.button !== 0) return;
      // IMMEDIATE: the segment/via selector is also a capture listener on
      // this same svg — plain stopPropagation leaves same-node listeners
      // running, and by then routeState is null so it would select the
      // trace under the commit click
      ev.stopImmediatePropagation();
      ev.preventDefault();
      var g = gerberAt(ev.clientX, ev.clientY);
      routeFollow(g.x, g.y);
      // a click while snapped to a pad finalizes the displayed trail
      if (routeState.targetPad || routeState.targetTie) routeCommit();
      else {
        var end2 = routeEndpoint(g.x, g.y);
        end2.mx = g.x;
        end2.my = g.y;
        routeAnchor(end2, routeState.lastPts);
      }
    },
    true,
  );
  // double-click finishes anywhere (the second click of the pair lands here
  // because the first already anchored)
  svg.addEventListener('dblclick', function (ev) {
    if (!routeState) return;
    ev.stopPropagation();
    ev.preventDefault();
    routeCommit();
  });
  window.addEventListener('mousemove', function (ev) {
    if (!routeState) return;
    var g = gerberAt(ev.clientX, ev.clientY);
    routeFollow(g.x, g.y);
    widthChip.style.left = ev.clientX + 14 + 'px';
    widthChip.style.top = ev.clientY - 28 + 'px';
    widthChip.style.display = '';
  });
  // ---- track segment selection: click highlights, Delete removes, U grows ----
  // A committed interactive route renders as ONE polyline per layer; the
  // invisible per-segment hit lines carry the interaction. Selection is a
  // SET of hit lines; Delete drops them and redraws the parent polylines
  // around the survivors. U expands from every selected segment along the
  // track's own geometry — both directions and through junctions (any
  // segment of the same net sharing an endpoint).
  var segSel = new Set(); // hit line elements
  var viaSel = new Set(); // committed via circles + gerber via flashes
  var segHi = null; // overlay that marks the selection
  // ---- segment drag (D): KiCad's slide — grab a trace segment, pull it
  // perpendicular; neighbors stretch to stay connected, the live clearance
  // engine grades the result, and the whole affected track serializes as
  // "delete the original chain + add the new polyline" through the same
  // apply bridge a drawn route uses ----
  var segDrag = null;
  function segDragStart() {
    if (routeState) return;
    var seg = null;
    if (segSel.size) {
      seg = segSel.values().next().value;
    } else {
      // nearest hit under the cursor (0.5mm grab radius, same as the
      // eyedropper — covers the hit line's own stroke width)
      var segs = allSegHits();
      var bd = 0.5;
      for (var i = 0; i < segs.length; i++) {
        var x1 = parseFloat(segs[i].getAttribute('x1')), y1 = parseFloat(segs[i].getAttribute('y1'));
        var x2 = parseFloat(segs[i].getAttribute('x2')), y2 = parseFloat(segs[i].getAttribute('y2'));
        var qp = snapOnSegment(lastMouseG.x, lastMouseG.y, x1, y1, x2, y2);
        var dd = Math.hypot(qp.x - lastMouseG.x, qp.y - lastMouseG.y);
        if (dd < bd) {
          bd = dd;
          seg = segs[i];
        }
      }
    }
    if (!seg || !seg.__track) {
      if (statusEl && !statusLocked()) statusEl.textContent = 'hover a trace segment first \u2014 D slides it';
      return;
    }
    var x1 = parseFloat(seg.getAttribute('x1')), y1 = parseFloat(seg.getAttribute('y1'));
    var x2 = parseFloat(seg.getAttribute('x2')), y2 = parseFloat(seg.getAttribute('y2'));
    var dx = x2 - x1;
    var dy = y2 - y1;
    // slide axis: perpendicular to the segment (axis-aligned slides stay
    // axis-aligned; a 45\u00b0 segment slides along its 45\u00b0 perpendicular)
    var axis;
    if (Math.abs(dy) < 0.01) axis = 'y';
    else if (Math.abs(dx) < 0.01) axis = 'x';
    else axis = (dx > 0) === (dy > 0) ? 'neg' : 'pos'; // 45\u00b0: (d,-d) or (-d,d) / (d,d)
    var lg = seg.closest("g[data-kind='copper']");
    var net = seg.getAttribute('data-net');
    var w = parseFloat(seg.__track.getAttribute('data-w') || '0') || 0.3;
    // every hit sharing either dragged endpoint stretches with the drag
    // (same layer only — a via junction crosses layers, those ride out)
    var linked = [];
    var all = allSegHits();
    for (var a = 0; a < all.length; a++) {
      if (all[a] === seg) continue;
      var ax1 = parseFloat(all[a].getAttribute('x1')), ay1 = parseFloat(all[a].getAttribute('y1'));
      var ax2 = parseFloat(all[a].getAttribute('x2')), ay2 = parseFloat(all[a].getAttribute('y2'));
      var ends = [];
      if (Math.hypot(ax1 - x1, ay1 - y1) < 0.01) ends.push([x1, y1, 'x1', 'y1']);
      if (Math.hypot(ax1 - x2, ay1 - y2) < 0.01) ends.push([x2, y2, 'x1', 'y1']);
      if (Math.hypot(ax2 - x1, ay2 - y1) < 0.01) ends.push([x1, y1, 'x2', 'y2']);
      if (Math.hypot(ax2 - x2, ay2 - y2) < 0.01) ends.push([x2, y2, 'x2', 'y2']);
      if (ends.length) linked.push({ hit: all[a], ends: ends });
    }
    // snapshot for revert/undo + serialization: the whole parent chain
    var chain = seg.__track.__hits || [seg];
    var originals = chain.map(function (h) {
      return {
        hit: h,
        x1: parseFloat(h.getAttribute('x1')),
        y1: parseFloat(h.getAttribute('y1')),
        x2: parseFloat(h.getAttribute('x2')),
        y2: parseFloat(h.getAttribute('y2')),
      };
    });
    var linkedOriginals = linked.map(function (L) {
      return { hit: L.hit, x1: parseFloat(L.hit.getAttribute('x1')), y1: parseFloat(L.hit.getAttribute('y1')), x2: parseFloat(L.hit.getAttribute('x2')), y2: parseFloat(L.hit.getAttribute('y2')) };
    });
    segDrag = {
      seg: seg,
      track: seg.__track,
      axis: axis,
      lg: lg,
      net: net,
      w: w,
      linked: linked,
      originals: originals,
      linkedOriginals: linkedOriginals,
      startG: { x: lastMouseG.x, y: lastMouseG.y },
      bad: false,
    };
    segSel.clear();
    viaSel.clear();
    segHiSync();
    viaHiSync();
    clearPadHighlight();
    if (statusEl && !statusLocked()) statusEl.textContent = 'dragging segment \u2014 release to drop, Esc reverts';
  }
  function segDragMove(e2) {
    if (!segDrag) return;
    var pg = gerberAt(e2.clientX, e2.clientY);
    var d;
    if (segDrag.axis === 'y') d = pg.y - segDrag.startG.y;
    else if (segDrag.axis === 'x') d = pg.x - segDrag.startG.x;
    else d = ((pg.x - segDrag.startG.x) - (pg.y - segDrag.startG.y)) / 2; // pos diag
    if (segDrag.axis === 'neg') d = ((pg.x - segDrag.startG.x) + (pg.y - segDrag.startG.y)) / 2;
    if (!layoutSnapBox || layoutSnapBox.checked) d = Math.round(d / layoutGridSize) * layoutGridSize;
    var apply = d !== segDrag.lastD;
    segDrag.lastD = d;
    if (!apply) return;
    // move the dragged segment
    function shift(segEl, dxs, dys) {
      segEl.setAttribute('x1', String(parseFloat(segEl.getAttribute('x1')) + dxs));
      segEl.setAttribute('y1', String(parseFloat(segEl.getAttribute('y1')) + dys));
      segEl.setAttribute('x2', String(parseFloat(segEl.getAttribute('x2')) + dxs));
      segEl.setAttribute('y2', String(parseFloat(segEl.getAttribute('y2')) + dys));
    }
    var dxs, dys;
    if (segDrag.axis === 'y') {
      dxs = 0;
      dys = d;
    } else if (segDrag.axis === 'x') {
      dxs = d;
      dys = 0;
    } else if (segDrag.axis === 'pos') {
      dxs = d;
      dys = -d;
    } else {
      dxs = d;
      dys = d;
    }
    // restore-to-original then apply (cheap idempotence)
    segDragRestore(segDrag.originals);
    segDragRestore(segDrag.linkedOriginals);
    shift(segDrag.seg, dxs, dys);
    // linked hits: their shared endpoint(s) follow; the shared endpoint is
    // wherever they touched the ORIGINAL dragged endpoints (which just moved)
    for (var li = 0; li < segDrag.linked.length; li++) {
      var L = segDrag.linked[li];
      for (var ei = 0; ei < L.ends.length; ei++) {
        var end = L.ends[ei];
        L.hit.setAttribute(end[2], String(end[0] + dxs));
        L.hit.setAttribute(end[3], String(end[1] + dys));
      }
    }
    segDragRedraw(segDrag.track);
    for (var lj = 0; lj < segDrag.linked.length; lj++) segDragRedraw(segDrag.linked[lj].hit.__track);
    // live clearance on the moved segment
    var sx1 = parseFloat(segDrag.seg.getAttribute('x1')), sy1 = parseFloat(segDrag.seg.getAttribute('y1'));
    var sx2 = parseFloat(segDrag.seg.getAttribute('x2')), sy2 = parseFloat(segDrag.seg.getAttribute('y2'));
    var obs = buildObstacles(segDrag.lg, segDrag.net);
    var m = clearanceMargin(obs, [{ x: sx1, y: sy1 }, { x: sx2, y: sy2 }], segDrag.w);
    segDrag.bad = m < 0;
    segDrag.seg.setAttribute('stroke', segDrag.bad ? '#f14c4c' : 'var(--sel)');
    segDrag.seg.setAttribute('stroke-opacity', '0.95');
    segDrag.seg.setAttribute('stroke-width', String(Math.max(segDrag.w, 0.5)));
    if (statusEl && !statusLocked())
      statusEl.textContent = segDrag.bad ? 'segment drag \u2014 CLEARANCE VIOLATION, release reverts' : 'segment drag \u2014 ' + fmtPos(d) + ' \u00b7 release to drop';
  }
  function segDragRestore(list) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      o.hit.setAttribute('x1', String(o.x1));
      o.hit.setAttribute('y1', String(o.y1));
      o.hit.setAttribute('x2', String(o.x2));
      o.hit.setAttribute('y2', String(o.y2));
    }
  }
  function segDragRedraw(tr) {
    if (!tr || !tr.__hits) return;
    var hits = tr.__hits;
    var d = 'M ' + parseFloat(hits[0].getAttribute('x1')).toFixed(3) + ' ' + parseFloat(hits[0].getAttribute('y1')).toFixed(3);
    d += ' L ' + parseFloat(hits[0].getAttribute('x2')).toFixed(3) + ' ' + parseFloat(hits[0].getAttribute('y2')).toFixed(3);
    for (var i = 1; i < hits.length; i++) d += ' L ' + parseFloat(hits[i].getAttribute('x2')).toFixed(3) + ' ' + parseFloat(hits[i].getAttribute('y2')).toFixed(3);
    tr.setAttribute('d', d);
    if (tr.__stripe) tr.__stripe.setAttribute('d', d);
  }
  function segDragEnd(commit) {
    if (!segDrag) return;
    var sd = segDrag;
    segDrag = null;
    sd.seg.removeAttribute('stroke');
    sd.seg.removeAttribute('stroke-opacity');
    sd.seg.removeAttribute('stroke-width');
    if (!commit || sd.bad) {
      segDragRestore(sd.originals);
      segDragRestore(sd.linkedOriginals);
      segDragRedraw(sd.track);
      for (var i = 0; i < sd.linked.length; i++) segDragRedraw(sd.linked[i].hit.__track);
      if (statusEl && !statusLocked())
        statusEl.textContent = sd.bad ? 'segment drag reverted \u2014 clearance violation' : 'segment drag cancelled';
      return;
    }
    // serialize: the ORIGINAL chain's segments ride as deletes (board
    // y-down), the NEW full polyline as a session route — the apply bridge
    // truncates the old TrackBuilder chain and adds the reshaped one —
    // unless the dragged chain is SESSION ink, in which case its own entry
    // reconciles to the new geometry (deletes + a twin route would
    // re-materialize the pre-drag trace beside the new one)
    var canon = copperCanon(sd.lg.getAttribute('data-layer-name'));
    var delCount = routedDeletes.length;
    var serializeDrag = function () {
      var origPts = [];
      for (var s0 = 0; s0 < sd.originals.length; s0++) {
        origPts.push({ x: sd.originals[s0].x1, y: -sd.originals[s0].y1 });
        origPts.push({ x: sd.originals[s0].x2, y: -sd.originals[s0].y2 });
      }
      var pts2 = [];
      var h0 = sd.originals[0].hit;
      pts2.push({ x: parseFloat(h0.getAttribute('x1')), y: -parseFloat(h0.getAttribute('y1')) });
      for (var p0 = 0; p0 < sd.originals.length; p0++) {
        var hp = sd.originals[p0].hit;
        pts2.push({ x: parseFloat(hp.getAttribute('x2')), y: -parseFloat(hp.getAttribute('y2')) });
      }
      pts2 = pts2.map(function (pt) { return { x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) }; });
      var ops = reconcileSessionRoutes(origPts, { layer: canon, w: sd.w, pts: pts2 }, null);
      if (ops.length > 0) return;
      for (var d0 = 0; d0 < sd.originals.length; d0++) {
        var o = sd.originals[d0];
        routedDeletes.push({
          net: sd.net,
          x1: +o.x1.toFixed(3),
          y1: +(-o.y1).toFixed(3),
          x2: +o.x2.toFixed(3),
          y2: +(-o.y2).toFixed(3),
          layer: canon,
        });
      }
      routedTracks.push({
        net: sd.net,
        w: sd.w,
        pieces: [{ layer: canon, w: sd.w, pts: pts2 }],
        vias: [],
        power: null,
        impedance: null,
        from: { ref: '(drag)', pin: '' },
        to: null,
      });
    };
    var rtBeforeDrag = JSON.parse(JSON.stringify(routedTracks));
    serializeDrag();
    var dels = routedDeletes.slice(delCount);
    pushUndo(
      'drag segment',
      function () {
        segDragRestore(sd.originals);
        segDragRestore(sd.linkedOriginals);
        segDragRedraw(sd.track);
        for (var u = 0; u < sd.linked.length; u++) segDragRedraw(sd.linked[u].hit.__track);
        routedDeletes.length = delCount;
        // wholesale snapshot restore: covers the pushed route AND any
        // session entry a reconciliation rewrote
        routedTracks = JSON.parse(JSON.stringify(rtBeforeDrag));
      },
      function () {
        // re-apply the final delta by replaying from originals + lastD
        var dxs, dys, d = sd.lastD || 0;
        if (sd.axis === 'y') {
          dxs = 0;
          dys = d;
        } else if (sd.axis === 'x') {
          dxs = d;
          dys = 0;
        } else if (sd.axis === 'pos') {
          dxs = d;
          dys = -d;
        } else {
          dxs = d;
          dys = d;
        }
        segDragRestore(sd.originals);
        segDragRestore(sd.linkedOriginals);
        sd.seg.setAttribute('x1', String(parseFloat(sd.seg.getAttribute('x1')) + dxs));
        sd.seg.setAttribute('y1', String(parseFloat(sd.seg.getAttribute('y1')) + dys));
        sd.seg.setAttribute('x2', String(parseFloat(sd.seg.getAttribute('x2')) + dxs));
        sd.seg.setAttribute('y2', String(parseFloat(sd.seg.getAttribute('y2')) + dys));
        for (var r2 = 0; r2 < sd.linked.length; r2++) {
          var L = sd.linked[r2];
          for (var e2 = 0; e2 < L.ends.length; e2++) {
            L.hit.setAttribute(L.ends[e2][2], String(L.ends[e2][0] + dxs));
            L.hit.setAttribute(L.ends[e2][3], String(L.ends[e2][1] + dys));
          }
        }
        segDragRedraw(sd.track);
        for (var r3 = 0; r3 < sd.linked.length; r3++) segDragRedraw(sd.linked[r3].hit.__track);
        serializeDrag();
      },
    );
    window.__typecadRouteEnds = null;
    refreshRatsnest();
    renderLayoutMoves();
    if (statusEl && !statusLocked()) statusEl.textContent = 'segment dragged \u2014 apply writes the reshaped track into source';
  }
  // ---- session-route reconciliation for ink rewrites (segment drags and
  // arrow nudges): a rewritten chain may BE session ink — its routedTracks
  // entry must carry the NEW geometry (and moved barrels their new
  // positions), or apply writes the pre-edit trace beside the new one and
  // the board grows phantom copper nobody drew. Board ink (a source
  // TrackBuilder chain) is left alone — its rewrite rides deletes + a new
  // route. Returns undo ops; pieces whose geometry matched are replaced. ----
  function reconcileSessionRoutes(origBoardPts, newPiece, movedVias) {
    var ops = [];
    for (var i = routedTracks.length - 1; i >= 0; i--) {
      var rt = routedTracks[i];
      for (var pi = rt.pieces.length - 1; pi >= 0; pi--) {
        var piece = rt.pieces[pi];
        var onChain = true;
        for (var q = 0; q < piece.pts.length && onChain; q++) {
          var found = false;
          for (var o = 0; o < origBoardPts.length && !found; o++)
            if (Math.hypot(piece.pts[q].x - origBoardPts[o].x, piece.pts[q].y - origBoardPts[o].y) < 0.05) found = true;
          if (!found) onChain = false;
        }
        if (!onChain) continue;
        ops.push({ kind: 'piece', entry: i, piece: pi, oldPts: piece.pts });
        if (newPiece) {
          piece.pts = newPiece.pts.map(function (p) {
            return { x: p.x, y: p.y };
          });
          piece.layer = newPiece.layer;
          if (newPiece.w !== undefined) piece.w = newPiece.w;
        } else rt.pieces.splice(pi, 1);
      }
      // a barrel at a moved via's old spot travels with it — matched entry
      // or not, the entry OWNS that via position
      for (var vi2 = 0; vi2 < rt.vias.length; vi2++) {
        for (var mv = 0; mv < (movedVias || []).length; mv++) {
          if (Math.hypot(rt.vias[vi2].x - movedVias[mv].ox, rt.vias[vi2].y - movedVias[mv].oy) < 0.05) {
            ops.push({ kind: 'via', entry: i, vidx: vi2, x: rt.vias[vi2].x, y: rt.vias[vi2].y });
            rt.vias[vi2].x = movedVias[mv].nx;
            rt.vias[vi2].y = movedVias[mv].ny;
            break;
          }
        }
      }
      if (!rt.pieces.length && !rt.vias.length) {
        ops.push({ kind: 'removed', at: i, entry: rt });
        routedTracks.splice(i, 1);
      }
    }
    return ops;
  }
  function undoReconcileSession(ops) {
    for (var k = ops.length - 1; k >= 0; k--) {
      var op = ops[k];
      if (op.kind === 'piece') {
        var e1 = routedTracks[op.entry];
        if (e1 && e1.pieces[op.piece]) e1.pieces[op.piece].pts = op.oldPts;
      } else if (op.kind === 'via') {
        var e2 = routedTracks[op.entry];
        if (e2 && e2.vias[op.vidx]) {
          e2.vias[op.vidx].x = op.x;
          e2.vias[op.vidx].y = op.y;
        }
      } else if (op.kind === 'removed') {
        routedTracks.splice(op.at, 0, op.entry);
      }
    }
  }
  // ---- arrow-key nudge for traces and vias: the selected segments
  // translate whole (same-layer neighbors sharing their endpoints stretch),
  // selected barrels jump and carry every trace end attached to them (a
  // barrel is the junction — all layers), the parent polylines redraw, and
  // old → new serializes as delete + session-route pairs — the same apply
  // contract a segment drag rides ----
  function nudgeInkSelection(dx, dy) {
    var movedSegs = [];
    segSel.forEach(function (h) {
      movedSegs.push(h);
    });
    var movedVias = [];
    viaSel.forEach(function (v) {
      var p = viaInkPos(v);
      movedVias.push({ el: v, ox: p.x, oy: p.y, nx: p.x + dx, ny: p.y + dy });
    });
    if (!movedSegs.length && !movedVias.length) return false;
    // moved endpoints: [oldX, oldY, newX, newY] — selected segments'
    // corners travel with them, barrels announce their jump
    var touchPts = [];
    movedSegs.forEach(function (h) {
      touchPts.push([+h.getAttribute('x1'), +h.getAttribute('y1'), +h.getAttribute('x1') + dx, +h.getAttribute('y1') + dy]);
      touchPts.push([+h.getAttribute('x2'), +h.getAttribute('y2'), +h.getAttribute('x2') + dx, +h.getAttribute('y2') + dy]);
    });
    movedVias.forEach(function (mv) {
      touchPts.push([mv.ox, mv.oy, mv.nx, mv.ny]);
    });
    // every NON-selected segment with an endpoint on a moved point stretches
    // that endpoint to the point's new position
    var selSet = new Set(movedSegs);
    var stretch = [];
    var all = allSegHits();
    for (var i = 0; i < all.length; i++) {
      var seg = all[i];
      if (selSet.has(seg)) continue;
      var ends = [];
      for (var e = 0; e < touchPts.length; e++) {
        var t = touchPts[e];
        if (Math.hypot(+seg.getAttribute('x1') - t[0], +seg.getAttribute('y1') - t[1]) < 0.01) ends.push(['x1', 'y1', t[2], t[3]]);
        if (Math.hypot(+seg.getAttribute('x2') - t[0], +seg.getAttribute('y2') - t[1]) < 0.01) ends.push(['x2', 'y2', t[2], t[3]]);
      }
      if (ends.length) stretch.push({ hit: seg, ends: ends });
    }
    // affected parents + originals snapshot (undo AND the delete half of
    // the serialization read from it)
    var parents = [];
    var seenTr = new Set();
    movedSegs.concat(stretch.map(function (s2) { return s2.hit; })).forEach(function (h) {
      if (h.__track && !seenTr.has(h.__track)) {
        seenTr.add(h.__track);
        parents.push(h.__track);
      }
    });
    var originals = [];
    parents.forEach(function (tr) {
      (tr.__hits || []).forEach(function (h) {
        originals.push({
          hit: h,
          x1: +h.getAttribute('x1'),
          y1: +h.getAttribute('y1'),
          x2: +h.getAttribute('x2'),
          y2: +h.getAttribute('y2'),
        });
      });
    });
    var setViaPos = function (el, x, y) {
      if (el.tagName === 'circle') {
        el.setAttribute('cx', +x.toFixed(4));
        el.setAttribute('cy', +y.toFixed(4));
      } else {
        el.setAttribute('x', +x.toFixed(4));
        el.setAttribute('y', +y.toFixed(4));
      }
      // the drill hole and any resize overlay ride the barrel
      if (el.__hole && el.__hole.parentNode) {
        el.__hole.setAttribute('cx', +x.toFixed(4));
        el.__hole.setAttribute('cy', +y.toFixed(4));
      }
      if (el.__resizeCircle && el.__resizeCircle.parentNode) {
        el.__resizeCircle.setAttribute('cx', +x.toFixed(4));
        el.__resizeCircle.setAttribute('cy', +y.toFixed(4));
        if (el.__resizeCircle.__hole && el.__resizeCircle.__hole.parentNode) {
          el.__resizeCircle.__hole.setAttribute('cx', +x.toFixed(4));
          el.__resizeCircle.__hole.setAttribute('cy', +y.toFixed(4));
        }
      }
    };
    var applyMutation = function () {
      movedSegs.forEach(function (h) {
        h.setAttribute('x1', +(parseFloat(h.getAttribute('x1')) + dx).toFixed(4));
        h.setAttribute('y1', +(parseFloat(h.getAttribute('y1')) + dy).toFixed(4));
        h.setAttribute('x2', +(parseFloat(h.getAttribute('x2')) + dx).toFixed(4));
        h.setAttribute('y2', +(parseFloat(h.getAttribute('y2')) + dy).toFixed(4));
      });
      stretch.forEach(function (s2) {
        s2.ends.forEach(function (e2) {
          s2.hit.setAttribute(e2[0], +e2[2].toFixed(4));
          s2.hit.setAttribute(e2[1], +e2[3].toFixed(4));
        });
      });
      movedVias.forEach(function (mv) {
        setViaPos(mv.el, mv.nx, mv.ny);
      });
      parents.forEach(function (tr) {
        segDragRedraw(tr);
      });
      segHiSync();
    };
    var delCount = routedDeletes.length;
    var rtCount = routedTracks.length;
    var reconcileOps = [];
    var serialize = function () {
      // ops describe THIS serialization (redo re-runs serialize and the
      // list resets — undo always restores exactly one step back)
      reconcileOps = [];
      // the ORIGINAL geometry leaves as deletes; each affected parent's
      // NEW polyline rides as a session route (any moved barrel attaches
      // to the first chain passing through its new position — one entry
      // per barrel, never two). A parent that IS session ink reconciles
      // its own entry instead — deletes + a twin route would re-materialize
      // the pre-edit trace beside the new one (phantom copper).
      var movedViaPairs = movedVias.map(function (mv) {
        return { ox: mv.ox, oy: -mv.oy, nx: mv.nx, ny: -mv.ny };
      });
      var boardOriginals = [];
      parents.forEach(function (tr) {
        originals.forEach(function (o) {
          if (o.hit.__track === tr) {
            boardOriginals.push({ x: o.x1, y: -o.y1 });
            boardOriginals.push({ x: o.x2, y: -o.y2 });
          }
        });
      });
      originals.forEach(function (o) {
        var lg = o.hit.closest ? o.hit.closest("g[data-kind='copper']") : null;
        routedDeletes.push({
          net: o.hit.getAttribute('data-net') || null,
          x1: +o.x1.toFixed(3),
          y1: +(-o.y1).toFixed(3),
          x2: +o.x2.toFixed(3),
          y2: +(-o.y2).toFixed(3),
          layer: lg ? copperCanon(lg.getAttribute('data-layer-name')) : null,
        });
      });
      var claimed = new Set();
      parents.forEach(function (tr) {
        var hits = tr.__hits || [];
        if (!hits.length || !tr.parentNode) return;
        var canon = '';
        var lg = hits[0].closest ? hits[0].closest("g[data-kind='copper']") : null;
        canon = lg ? copperCanon(lg.getAttribute('data-layer-name')) : 'F.Cu';
        var w = parseFloat(tr.getAttribute('data-w') || '0') || 0.3;
        var pts = [{ x: +parseFloat(hits[0].getAttribute('x1')).toFixed(3), y: -parseFloat(hits[0].getAttribute('y1')) }];
        for (var p2 = 0; p2 < hits.length; p2++)
          pts.push({ x: +parseFloat(hits[p2].getAttribute('x2')).toFixed(3), y: -parseFloat(hits[p2].getAttribute('y2')) });
        var origPts = [];
        originals.forEach(function (o) {
          if (o.hit.__track === tr) {
            origPts.push({ x: o.x1, y: -o.y1 });
            origPts.push({ x: o.x2, y: -o.y2 });
          }
        });
        var newPiece = { layer: canon, w: w, pts: pts };
        var ops = reconcileSessionRoutes(origPts, newPiece, movedViaPairs);
        if (ops.length > 0) {
          // session ink: its entry carries the new geometry now — no
          // deletes, no twin route (retire the deletes this parent pushed)
          reconcileOps = reconcileOps.concat(ops);
          for (var b0 = 0; b0 < originals.length; b0++)
            if (originals[b0].hit.__track === tr) {
              var lgB = originals[b0].hit.closest("g[data-kind='copper']");
              var bx1 = +originals[b0].x1.toFixed(3);
              var by1 = +(-originals[b0].y1).toFixed(3);
              var bx2 = +originals[b0].x2.toFixed(3);
              var by2 = +(-originals[b0].y2).toFixed(3);
              var bl = lgB ? copperCanon(lgB.getAttribute('data-layer-name')) : null;
              for (var d5 = routedDeletes.length - 1; d5 >= 0; d5--) {
                var dd = routedDeletes[d5];
                if (
                  dd.x1 === bx1 && dd.y1 === by1 && dd.x2 === bx2 && dd.y2 === by2 && dd.layer === bl
                )
                  routedDeletes.splice(d5, 1);
              }
            }
          return;
        }
        var vias = [];
        movedVias.forEach(function (mv) {
          if (claimed.has(mv.el)) return;
          for (var q = 0; q < pts.length; q++) {
            // pts are board frame (y negated), the barrel island frame
            if (Math.abs(pts[q].x - mv.nx) < 0.02 && Math.abs(pts[q].y + mv.ny) < 0.02) {
              var size = viaInkSize(mv.el) || 0.6;
              var ly = viaInkLayers(mv.el);
              vias.push({
                x: +mv.nx.toFixed(3),
                y: +(-mv.ny).toFixed(3),
                size: size,
                drill: viaDrillFor(size),
                layers: ly.length >= 2 ? [ly[0], ly[ly.length - 1]] : undefined,
              });
              claimed.add(mv.el);
              break;
            }
          }
        });
        routedTracks.push({
          net: hits[0].getAttribute('data-net') || null,
          w: w,
          pieces: [{ layer: canon, w: w, pts: pts }],
          vias: vias,
          power: null,
          impedance: null,
          from: { ref: '(nudge)', pin: '' },
          to: null,
        });
      });
    };
    applyMutation();
    serialize();
    pushUndo(
      'nudge ' + (movedSegs.length ? movedSegs.length + ' segment(s)' : movedVias.length + ' via(s)'),
      function () {
        segDragRestore(originals);
        movedVias.forEach(function (mv) {
          setViaPos(mv.el, mv.ox, mv.oy);
        });
        parents.forEach(function (tr) {
          segDragRedraw(tr);
        });
        segHiSync();
        undoReconcileSession(reconcileOps);
        routedDeletes.splice(delCount);
        routedTracks.splice(rtCount);
      },
      function () {
        applyMutation();
        serialize();
      },
    );
    window.__typecadRouteEnds = null;
    refreshRatsnest();
    renderLayoutMoves();
    if (statusEl && !statusLocked())
      statusEl.textContent =
        'nudged ' + (movedSegs.length ? movedSegs.length + ' segment(s)' + (movedVias.length ? ' + ' + movedVias.length + ' via(s)' : '') : movedVias.length + ' via(s)') +
        ' \u2014 apply writes the moved track into source';
    return true;
  }
  window.addEventListener('pointermove', function (ev) {
    if (segDrag) segDragMove(ev);
  });
  window.addEventListener('pointerup', function () {
    if (segDrag) segDragEnd(true);
  });
  function segHiSync() {
    propsSync('trace');
    // detached members (ink an undo/redo removed) leave the set — cloning
    // them would paint an overlay over copper that no longer exists
    segSel.forEach(function (h) {
      if (!h.parentNode) segSel.delete(h);
    });
    if (segHi) {
      segHi.remove();
      segHi = null;
    }
    if (!segSel.size) return;
    segHi = document.createElementNS(SVGNSL, 'g');
    segHi.setAttribute('class', 'route-sel');
    segHi.setAttribute('pointer-events', 'none');
    segSel.forEach(function (h) {
      var m = document.createElementNS(SVGNSL, 'line');
      for (var a of ['x1', 'y1', 'x2', 'y2']) m.setAttribute(a, h.getAttribute(a));
      // the highlight covers the segment's FULL shape — a white overlay at
      // the trace's own width (plus a hair so it reads over the ink edge),
      // not a thin centerline stroke
      var sw = parseFloat((h.__track || h).getAttribute('data-w') || '0') || 0.3;
      m.setAttribute('stroke-width', (sw + 0.06).toFixed(3));
      segHi.appendChild(m);
    });
    var stack = viewGroups.gerber.querySelector('#yflip') || viewGroups.gerber;
    stack.appendChild(segHi);
    raisePadLabels();
  }
  function segEnds(h) {
    return [
      [parseFloat(h.getAttribute('x1')), parseFloat(h.getAttribute('y1'))],
      [parseFloat(h.getAttribute('x2')), parseFloat(h.getAttribute('y2'))],
    ];
  }
  // viaSel visual sync: selected vias get a selection ring (works for both
  // committed session circles and gerber aperture flashes)
  function viaHiSync() {
    propsSync('via');
    viewGroups.gerber.querySelectorAll('.route-via-sel').forEach(function (c) {
      c.classList.remove('route-via-sel');
      // restore the element's own stroke-width — the selection ring set it
      if (c.__swPrev !== undefined) {
        if (c.__swPrev === null) c.removeAttribute('stroke-width');
        else c.setAttribute('stroke-width', c.__swPrev);
        c.__swPrev = undefined;
      }
    });
    viaSel.forEach(function (c) {
      if (!c.parentNode) viaSel.delete(c);
      else {
        c.classList.add('route-via-sel');
        // the ring hugs the barrel: BOARD units scaled to the via's own
        // size (a fixed 2px screen stroke blew up to several barrel-widths
        // through aperture-scaled use symbols)
        c.__swPrev = c.getAttribute('stroke-width');
        var vs = viaInkSize(c) || 0.6;
        c.setAttribute('stroke-width', Math.max(+(vs * 0.18).toFixed(3), 0.05));
      }
    });
    if (statusEl && !statusLocked()) {
      if (viaSel.size)
        statusEl.textContent = viaSel.size + ' via' + (viaSel.size > 1 ? 's' : '') + ' selected — Del removes, Esc clears';
      else if (/via[^(]*selected/.test(statusEl.textContent))
        statusEl.textContent = ''; // don't leave a stale "via selected" claim
    }
  }
  // via ink: committed session circles AND gerder aperture flashes (a
  // source-authored TrackBuilder via renders as a ref-less use[data-net])
  function viaInk() {
    return viewGroups.gerber.querySelectorAll('circle[data-route], use[data-net]:not([data-ref])');
  }
  function viaInkPos(el) {
    return el.tagName === 'circle'
      ? { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) }
      : { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')) };
  }
  // remove every via at a board-frame point: its committed circles on all
  // copper layers, the owning routedTrack's via entry (so a subsequent
  // apply regenerates the route without it), and any selection. Gerber
  // flashes go too; "record" pushes a bridge delete so the source chain
  // truncates at the via on apply (session vias need no record — their own
  // route entry regenerates)
  function removeViasAt(bx, by, record) {
    var removed = 0;
    var sessionHit = false;
    for (var ri = routedTracks.length - 1; ri >= 0; ri--) {
      var rt = routedTracks[ri];
      for (var vi = rt.vias.length - 1; vi >= 0; vi--) {
        var vv = rt.vias[vi];
        if (Math.hypot(vv.x - bx, vv.y - by) > 0.02) continue;
        rt.vias.splice(vi, 1);
        sessionHit = true;
        removed++;
      }
      // drop the committed ink circles at that point (gerber frame)
      var stacks = viewGroups.gerber.querySelectorAll('circle[data-route]');
      for (var si = 0; si < stacks.length; si++) {
        var sc = stacks[si];
        if (Math.hypot(parseFloat(sc.getAttribute('cx')) - bx, parseFloat(sc.getAttribute('cy')) + by) > 0.02) continue;
        // a resize overlay stood in for a hidden gerber flash — the flash
        // itself comes back visible when its overlay goes
        if (sc.__overFlash) {
          sc.__overFlash.style.display = '';
          sc.__overFlash.__resizeCircle = null;
        }
        viaSel.delete(sc);
        // the barrel's drill hole goes with it
        if (sc.__hole) {
          sc.__hole.remove();
          sc.__hole = null;
        }
        sc.remove();
      }
      if (!rt.pieces.length && !rt.vias.length) routedTracks.splice(ri, 1);
    }
    // stale in-route preview markers at this point (routeCancel sweeps its
    // own; this covers any that predate the cleanup)
    routeUiGroup().querySelectorAll('.route-via').forEach(function (pv) {
      if (Math.hypot(parseFloat(pv.getAttribute('cx')) - bx, parseFloat(pv.getAttribute('cy')) + by) > 0.02) return;
      pv.remove();
      removed++;
    });
    // gerber via flashes: every copper layer's copy of this barrel
    var flashed = viaInk();
    var vnet = null;
    var flashRemoved = false;
    for (var fi = 0; fi < flashed.length; fi++) {
      var fe = flashed[fi];
      if (fe.tagName !== 'use') continue;
      var fp = viaInkPos(fe);
      if (Math.hypot(fp.x - bx, fp.y + by) > 0.02) continue;
      viaSel.delete(fe);
      vnet = vnet || fe.getAttribute('data-net') || null;
      fe.remove();
      flashRemoved = true;
      removed++;
    }
    // the board-rendered DRILL hole outlives the flash that owned it —
    // take it too, unless a pad sits on the same spot (that hole is the
    // pad's, and the pad's land is still there)
    if (flashRemoved) {
      var padNear = false;
      for (var pm = 0; pm < padManifest.length && !padNear; pm++)
        if (Math.hypot(padManifest[pm].x - bx, padManifest[pm].y - by) < 0.4) padNear = true;
      if (!padNear) {
        var drills = viewGroups.gerber.querySelectorAll('g[data-kind="drill"] circle');
        for (var di = 0; di < drills.length; di++) {
          var dc = drills[di];
          if (Math.hypot(parseFloat(dc.getAttribute('cx')) - bx, parseFloat(dc.getAttribute('cy')) + by) > 0.02) continue;
          dc.remove();
        }
      }
    }
    if (record && !sessionHit && removed)
      routedDeletes.push({ kind: 'via', net: vnet, x1: +bx.toFixed(3), y1: +by.toFixed(3), x2: +bx.toFixed(3), y2: +by.toFixed(3), layer: null });
    return removed;
  }
  function segShareEnd(a, b, tol) {
    if (tol === undefined) tol = 0.01;
    var ea = segEnds(a);
    var eb = segEnds(b);
    for (var i = 0; i < 2; i++)
      for (var j = 0; j < 2; j++)
        if (Math.hypot(ea[i][0] - eb[j][0], ea[i][1] - eb[j][1]) < tol) return true;
    return false;
  }
  function allSegHits() {
    return document.querySelectorAll('#view-gerber line[data-seg="1"]');
  }
  function segExpand() {
    if (!segSel.size) return 0;
    // ONE hop per press: candidates touching the CURRENT selection snapshot
    // join (the old frontier loop flooded the whole connected net at once)
    var frontier = [];
    segSel.forEach(function (h) {
      frontier.push(h);
    });
    var hits = allSegHits();
    var added = 0;
    for (var i = 0; i < hits.length; i++) {
      var cand = hits[i];
      if (segSel.has(cand)) continue;
      var candNet = cand.getAttribute('data-net');
      var touch = false;
      for (var f = 0; f < frontier.length && !touch; f++) {
        if (frontier[f].getAttribute('data-net') !== candNet) continue;
        if (segShareEnd(frontier[f], cand)) touch = true;
      }
      if (touch) {
        segSel.add(cand);
        added++;
      }
    }
    // expansion encompasses vias: a barrel sitting at any selected
    // segment's endpoint rides the selection (ring + Delete)
    var vi = viaInk();
    segSel.forEach(function (h) {
      for (var e = 0; e < 2; e++) {
        var ex = parseFloat(h.getAttribute(e ? 'x2' : 'x1'));
        var ey = parseFloat(h.getAttribute(e ? 'y2' : 'y1'));
        for (var c = 0; c < vi.length; c++) {
          var vp = viaInkPos(vi[c]);
          if (Math.hypot(vp.x - ex, vp.y - ey) < 0.06) viaSel.add(vi[c]);
        }
      }
    });
    segHiSync();
    viaHiSync();
    return added;
  }
  function segDelete() {
    if (!segSel.size) return;
    var removedSegs = segSel.size;
    // session undo bookkeeping: DOM removals via the capture, the session
    // track list as a deep copy, and the affected parents' redrawn chains
    domCaptureStart();
    var rtBefore = JSON.parse(JSON.stringify(routedTracks));
    var delBefore = routedDeletes.length;
    var parentsBefore = {};
    segSel.forEach(function (h0) {
      var tr0 = h0.__track;
      if (!tr0 || parentsBefore[tr0.__trId]) return;
      tr0.__trId = tr0.__trId || 'tr' + Math.random().toString(36).slice(2);
      parentsBefore[tr0.__trId] = {
        tr: tr0,
        d: tr0.getAttribute('d'),
        hits: (tr0.__hits || []).slice(),
        stripe: tr0.__stripe ? tr0.__stripe.getAttribute('d') : null,
      };
    });
    // record each deleted segment for the apply bridge (board y-down),
    // tagged with its layer so source deletion can target the right chain
    segSel.forEach(function (h) {
      var d1x = +parseFloat(h.getAttribute('x1')).toFixed(3),
        d1y = +(-parseFloat(h.getAttribute('y1'))).toFixed(3), // gerber y-up -> board y-down
        d2x = +parseFloat(h.getAttribute('x2')).toFixed(3),
        d2y = +(-parseFloat(h.getAttribute('y2'))).toFixed(3);
      routedDeletes.push({
        net: h.getAttribute('data-net') || null,
        x1: d1x,
        y1: d1y,
        x2: d2x,
        y2: d2y,
        layer: copperCanon((h.closest('g[data-kind=copper]') || {}).getAttribute ? h.closest('g[data-kind=copper]').getAttribute('data-layer-name') : ''),
      });
      // a via at EITHER end of a removed segment has lost its trace there —
      // it goes with the segment
      removeViasAt(d1x, d1y);
      removeViasAt(d2x, d2y);
    });
    segSel.forEach(function (h) {
      h.remove();
    });
    // redraw every affected parent polyline from its surviving hit lines
    var parents = new Set();
    segSel.forEach(function (h) {
      if (h.__track) parents.add(h.__track);
    });
    segSel.clear();
    parents.forEach(function (tr) {
      var hits = (tr.__hits || []).filter(function (h) {
        return h.parentNode;
      });
      if (hits.length === 0) {
        tr.remove();
        if (tr.__stripe) tr.__stripe.remove();
        return;
      }
      // order the survivors into a chain by endpoint continuity
      var rest = hits.slice();
      var chain = [rest.shift()];
      while (rest.length) {
        var grew = false;
        for (var i = 0; i < rest.length; i++) {
          var e = rest[i];
          var cEnds = segEnds(chain[chain.length - 1]);
          var eEnds = segEnds(e);
          if (Math.hypot(cEnds[1][0] - eEnds[0][0], cEnds[1][1] - eEnds[0][1]) < 0.01) {
            chain.push(e);
            rest.splice(i, 1);
            grew = true;
            break;
          }
          if (Math.hypot(cEnds[1][0] - eEnds[1][0], cEnds[1][1] - eEnds[1][1]) < 0.01) {
            // reversed fit
            var tmp = e.getAttribute('x1');
            e.setAttribute('x1', e.getAttribute('x2'));
            e.setAttribute('x2', tmp);
            tmp = e.getAttribute('y1');
            e.setAttribute('y1', e.getAttribute('y2'));
            e.setAttribute('y2', tmp);
            chain.push(e);
            rest.splice(i, 1);
            grew = true;
            break;
          }
        }
        if (!grew) {
          // disjoint survivor: start a new visual run appended in the same path
          chain.push(rest.shift());
        }
      }
      var d = 'M ' + segEnds(chain[0])[0][0].toFixed(3) + ' ' + segEnds(chain[0])[0][1].toFixed(3);
      for (var c = 0; c < chain.length; c++) {
        var ce = segEnds(chain[c])[1];
        d += ' L ' + ce[0].toFixed(3) + ' ' + ce[1].toFixed(3);
      }
      tr.setAttribute('d', d);
      tr.__hits = chain;
      // the candy-cane overlay rides the redrawn polyline
      if (tr.__stripe) tr.__stripe.setAttribute('d', d);
    });
    segHiSync();
    // interactive routes recorded this session: drop deleted segments from
    // their pieces so a subsequent apply doesn't re-add them; emptied
    // routes leave the bridge entirely. A delete that only described a
    // session-track segment is fully reflected in the trimmed pieces — it
    // must NOT ride routedDeletes too, or the host reports it unmatched
    // against source routes that never carried it
    var absorbedDeleteIdx = [];
    for (var ri = routedTracks.length - 1; ri >= 0; ri--) {
      var rt = routedTracks[ri];
      for (var pj = rt.pieces.length - 1; pj >= 0; pj--) {
        var pts = rt.pieces[pj].pts;
        for (var pj2 = pts.length - 1; pj2 > 0; pj2--) {
          var a = pts[pj2 - 1], b2 = pts[pj2];
          var hitIdx = -1;
          for (var di = 0; di < routedDeletes.length; di++) {
            var dd = routedDeletes[di];
            if ((Math.abs(dd.x1 - a.x) < 0.01 && Math.abs(dd.y1 - a.y) < 0.01 && Math.abs(dd.x2 - b2.x) < 0.01 && Math.abs(dd.y2 - b2.y) < 0.01) || (Math.abs(dd.x1 - b2.x) < 0.01 && Math.abs(dd.y1 - b2.y) < 0.01 && Math.abs(dd.x2 - a.x) < 0.01 && Math.abs(dd.y2 - a.y) < 0.01)) {
              hitIdx = di;
              break;
            }
          }
          if (hitIdx >= 0) {
            pts.splice(pj2 - 1, 1); // drop the shared point -> gap
            absorbedDeleteIdx.push(hitIdx);
          }
        }
        if (pts.length < 2) rt.pieces.splice(pj, 1);
      }
      if (!rt.pieces.length) routedTracks.splice(ri, 1);
    }
    absorbedDeleteIdx.sort(function (x, y) { return y - x; }).forEach(function (di2) {
      routedDeletes.splice(di2, 1);
    });
    window.__typecadRouteEnds = null;
    refreshRatsnest();
    renderLayoutMoves();
    // session undo: restores the removed ink (DOM), the session track
    // state, the pending deletes, and each parent's redrawn polyline
    var delCap = domCaptureEnd();
    var rtAfter = JSON.parse(JSON.stringify(routedTracks));
    var delsAdded = routedDeletes.slice(delBefore);
    var parentsAfter = {};
    for (var pid in parentsBefore) {
      var tr1 = parentsBefore[pid].tr;
      if (!tr1.parentNode) continue; // the whole track went with its last hit
      parentsAfter[pid] = {
        tr: tr1,
        d: tr1.getAttribute('d'),
        hits: (tr1.__hits || []).slice(),
        stripe: tr1.__stripe ? tr1.__stripe.getAttribute('d') : null,
      };
    }
    var restoreParents = function (snap) {
      for (var p2 in snap) {
        var s2 = snap[p2];
        if (!s2.tr.parentNode && snap === parentsAfter) continue;
        s2.tr.setAttribute('d', s2.d);
        s2.tr.__hits = s2.hits.slice();
        if (s2.tr.__stripe && s2.stripe !== null) s2.tr.__stripe.setAttribute('d', s2.stripe);
      }
    };
    pushUndo(
      'delete ' + removedSegs + ' segment(s)',
      function () {
        routedTracks = JSON.parse(JSON.stringify(rtBefore));
        routedDeletes.length = delBefore;
        domApply(delCap, -1);
        restoreParents(parentsBefore);
      },
      function () {
        routedTracks = JSON.parse(JSON.stringify(rtAfter));
        for (var d3 = 0; d3 < delsAdded.length; d3++) routedDeletes.push(delsAdded[d3]);
        domApply(delCap, 1);
        restoreParents(parentsAfter);
      },
    );
    if (statusEl && !statusLocked()) statusEl.textContent = removedSegs + ' segment' + (removedSegs > 1 ? 's' : '') + ' deleted';
  }
  // the nearest segment hit line under a press point, within its own stroke
  // — a trace running under a part (through pad land or the body) stays
  // clickable: its invisible hit line is the truth of where copper runs,
  // and the part/pad keeps presses everywhere off the line
  function segAt(g) {
    var segs = allSegHits();
    var best = null;
    var bd = Infinity;
    for (var i = 0; i < segs.length; i++) {
      var x1 = +segs[i].getAttribute('x1'), y1 = +segs[i].getAttribute('y1');
      var x2 = +segs[i].getAttribute('x2'), y2 = +segs[i].getAttribute('y2');
      var q = snapOnSegment(g.x, g.y, x1, y1, x2, y2);
      var d = Math.hypot(q.x - g.x, q.y - g.y);
      var sw = Math.max(+segs[i].getAttribute('stroke-width') || 0.5, 0.5) / 2 + 0.1;
      if (d < sw && d < bd) {
        bd = d;
        best = segs[i];
      }
    }
    return best;
  }
  // click a segment hit line: select exactly that segment (shift adds);
  // click a committed via: select it the same way — the via owns its own
  // point even where a hit line crosses it
  svg.addEventListener(
    'pointerdown',
    function (ev) {
      if (routeState || ev.button !== 0) return;
      var t = ev.target;
      // a press on a part still reaches a trace RUNNING UNDER the point —
      // through pad land or under the body, the trace's hit line is where
      // copper runs and the segment wins so it stays selectable/deletable.
      // The part and its pads keep every press off the line
      var via = null;
      var hitLine = null;
      if (t && t.closest && t.closest('.layout-comp')) {
        hitLine = segAt(gerberAt(ev.clientX, ev.clientY));
        if (!hitLine) return;
      }
      var pk = probeHitTarget(ev, false);
      var scan = pk || t;
      if (scan && (scan.tagName === 'circle' || scan.tagName === 'use') && scan.getAttribute && scan.getAttribute('data-route') === '1') {
        via = scan;
      } else if (scan && scan.tagName === 'use' && scan.getAttribute && scan.getAttribute('data-net') && !scan.getAttribute('data-ref') && scan.closest && scan.closest("g[data-kind='copper']")) {
        // a gerber via flash IS a via
        via = scan;
      } else if (scan && scan.getAttribute && scan.getAttribute('data-seg') === '1') {
        var gp2 = gerberAt(ev.clientX, ev.clientY);
        var cand = viaInk();
        for (var cv = 0; cv < cand.length; cv++) {
          var cp = viaInkPos(cand[cv]);
          if (Math.hypot(cp.x - gp2.x, cp.y - gp2.y) < 0.34) {
            via = cand[cv];
            break;
          }
        }
        if (!via) hitLine = scan;
      }
      if (!via && !hitLine) {
        // generous capture: a press that landed on nothing interactive —
        // empty board, the air around a tiny leftover fragment, or the
        // butt-end of a corridor — still selects the nearest segment within
        // a ~9px radius. Pixel-perfect aim at a 0.2 mm cleanup stub (or the
        // very tip of a dangling end) is not a reasonable ask. Elements
        // that own their presses (parts, pads, probe outlines) and presses
        // near a dangling end (the route-start arm owns those) pass through
        // untouched.
        if (
          !t ||
          !t.closest ||
          t.closest('.layout-comp') ||
          t.closest('[data-ref]') ||
          t.closest('[data-pin]') ||
          t.closest('[data-text]') || // a claimed text glyph owns its press (E edits it)
          t.closest('.pad-labels') ||
          t.tagName === 'circle' ||
          (t.tagName === 'use' && t.getAttribute('data-route') === '1')
        )
          return;
        var fgp = gerberAt(ev.clientX, ev.clientY);
        if (nearestTraceEnd(fgp)) return;
        // screen px -> gerber mm, measured live (viewBox units, not css px)
        var g10 = gerberAt(ev.clientX + 10, ev.clientY);
        var pxMm = Math.abs(g10.x - fgp.x) > 1e-9 ? 10 / Math.abs(g10.x - fgp.x) : 1;
        var reach = 9 / pxMm;
        var fhits = allSegHits();
        var fBest = null;
        var fBestD = Math.max(0.5, reach);
        for (var fi = 0; fi < fhits.length; fi++) {
          var fx1 = parseFloat(fhits[fi].getAttribute('x1')), fy1 = parseFloat(fhits[fi].getAttribute('y1'));
          var fx2 = parseFloat(fhits[fi].getAttribute('x2')), fy2 = parseFloat(fhits[fi].getAttribute('y2'));
          var fq = snapOnSegment(fgp.x, fgp.y, fx1, fy1, fx2, fy2);
          var fd = Math.hypot(fq.x - fgp.x, fq.y - fgp.y);
          if (fd < fBestD) {
            fBestD = fd;
            fBest = fhits[fi];
          }
        }
        if (fBest) hitLine = fBest;
        else return;
      }
      ev.stopPropagation();
      ev.preventDefault();
      if (hitLine) t = hitLine; // the fallthrough segment logic reads t
      // KiCad parity: pressing copper lights its net (dims everything
      // else); Escape or an empty-space press clears
      var hlNet = (via || t).getAttribute && (via || t).getAttribute('data-net');
      if (hlNet && hlNet !== 'N/C') highlightNet('data-net', hlNet);
      if (via) {
        if (ev.shiftKey) {
          if (viaSel.has(via)) viaSel.delete(via);
          else viaSel.add(via);
        } else {
          segSel.clear();
          segHiSync();
          viaSel.clear();
          viaSel.add(via);
          // a via press also arms the route start at the barrel center
          var vstart = viaInkPos(via);
          setTraceHighlight({
            gx: vstart.x,
            gy: vstart.y,
            net: via.getAttribute('data-net'),
            kind: 'via',
            layerGroup: via.closest("g[data-kind='copper']"),
          });
        }
        viaHiSync();
        return;
      }
      viaSel.clear();
      viaHiSync();
      if (ev.shiftKey) {
        if (segSel.has(t)) segSel.delete(t);
        else segSel.add(t);
      } else {
        segSel.clear();
        segSel.add(t);
        // a trace press arms the route start ON the segment: within the
        // pad-snap radius of a segment END, that end wins (the same
        // magnetic snap finishing uses); otherwise the projected point
        var gs = gerberAt(ev.clientX, ev.clientY);
        var lx1 = parseFloat(t.getAttribute('x1')), ly1 = parseFloat(t.getAttribute('y1'));
        var lx2 = parseFloat(t.getAttribute('x2')), ly2 = parseFloat(t.getAttribute('y2'));
        // ON-trace presses are already precise — only the cap radius (0.3mm
        // inside snapOnSegment) prefers an endpoint, so mid-trace intent wins.
        // The big 1.2mm magnetic radius lives in the EMPTY-SPACE branch
        // (box-select), where finding a dangling tip without the line to
        // aim at is the actual problem it solves
        var ls = snapOnSegment(gs.x, gs.y, lx1, ly1, lx2, ly2);
        setTraceHighlight({
          gx: ls.x,
          gy: ls.y,
          net: t.getAttribute('data-net'),
          kind: 'trace',
          layerGroup: t.closest("g[data-kind='copper']"),
        });
      }
      segHiSync();
      if (statusEl && !statusLocked()) {
        // single-segment picks name the declaring line: the net's source
        // (the injected client's map) or, for netless hand routes, the
        // unnamed-route provenance resolved from the click point
        var segSrc = '';
        if (segSel.size === 1) {
          var sn = t.getAttribute('data-net');
          if (sn && sn !== 'N/C' && typeof window.typecadNetSource === 'function')
            segSrc = window.typecadNetSource(sn) || '';
          if (!segSrc && typeof window.typecadTraceSource === 'function')
            segSrc = window.typecadTraceSource(ev.clientX, ev.clientY) || '';
        }
        statusEl.textContent =
          segSel.size + ' segment' + (segSel.size > 1 ? 's' : '') + ' selected' +
          (segSrc ? ' \u2014 ' + segSrc : '') +
          ' \u2014 U grows, Del removes, Esc clears';
      }
    },
    true,
  );
  // routing keys live in the layout keydown (X start, V via, Backspace
  // undo) — see the handler below

  // the PCB model's pad manifest (build/<board>_pads.json): pin numbers and
  // net names straight from the board the PCB object wrote. Board y-down
  // millimetres; the gerber stack is y-up, so y negates where used.
  var padManifest = [];
  try {
    padManifest = JSON.parse(document.getElementById('pad-data').textContent) || [];
  } catch (e) {}
  // route provenance (build/<board>_routes.json): which nets the autorouter
  // built vs which a TrackBuilder authored in source. Auto nets candy-cane
  // and rip up when their parts move (the rebuild re-plans them); manual
  // and mixed nets are source-authored polylines and stay exactly as drawn
  var routeProvenance = {};
  try {
    var rprovData = JSON.parse(document.getElementById('routes').textContent);
    if (rprovData && rprovData.nets)
      for (var rpk in rprovData.nets) routeProvenance[rpk] = rprovData.nets[rpk].provenance || '';
  } catch (e) {}
  // netless hand routes (the island's unnamed list) are the machine class
  // too: the interactive router's apply bridge is how they come to exist.
  // Their gerber ink is N/C-attributed (all of it indistinguishable by
  // net), so each trace segment is bound to its route by ENDPOINT
  // GEOMETRY against the polylines — that binding also drives ripup-on-
  // move and the ratsnest re-wire (board y-down here; ink is y-up)
  var unnamedRoutes = [];
  var unnamedInk = []; // idx -> [elements] (trace, stripe, hit lines)
  try {
    var urtData = JSON.parse(document.getElementById('routes').textContent);
    unnamedRoutes = (urtData && urtData.unnamed) || [];
  } catch (e) {}
  function unnamedSegMatch(x1, y1, x2, y2) {
    for (var i = 0; i < unnamedRoutes.length; i++) {
      var pts = unnamedRoutes[i].pts;
      for (var s = 1; s < pts.length; s++) {
        var ax = pts[s - 1].x, ay = -pts[s - 1].y;
        var bx = pts[s].x, by = -pts[s].y;
        if (
          (Math.abs(ax - x1) < 0.05 && Math.abs(ay - y1) < 0.05 && Math.abs(bx - x2) < 0.05 && Math.abs(by - y2) < 0.05) ||
          (Math.abs(bx - x1) < 0.05 && Math.abs(by - y1) < 0.05 && Math.abs(ax - x2) < 0.05 && Math.abs(ay - y2) < 0.05)
        )
          return i;
      }
    }
    return -1;
  }
  // gerber-frame center of a manifest pad (board y-down -> y-up)
  function padCenter(p) {
    var e = padEffBoard(p);
    return { x: e.x, y: -e.y };
  }
  /** a manifest pad's CURRENT board-frame position: the part's pending move
   *  (layoutMoves) and R-press rotations applied — the manifest itself
   *  stores AUTHORED positions, so without this every moved part's pads
   *  stop resolving for presses, routing, and probing */
  function padEffBoard(p) {
    if (!layoutMoves[p.ref]) return p;
    var c = null;
    for (var ci = 0; ci < layoutComps.length && !c; ci++) if (layoutComps[ci].ref === p.ref) c = layoutComps[ci];
    if (!c) return p;
    var mv = layoutMoves[p.ref];
    // offset from the part's authored center in BOARD axes (manifest y is
    // board-down; the island's c.y is gerber-up)
    var obx = p.x - c.x;
    var oby = p.y + c.y;
    var presses = layoutRot[p.ref] || 0;
    for (var t = 0; t < presses; t++) {
      var nx = -oby;
      var ny = obx;
      obx = nx;
      oby = ny;
    }
    return { x: mv.x + obx, y: -mv.y + oby };
  }
  // manifest (board y-down) point under a pointer event — boardCoords
  // reports the ink's y-up frame, so y negates (padCenter's inverse)
  function padBoardPoint(ev) {
    var g = boardCoords(ev);
    return { x: g.x, y: -g.y };
  }
  // nearest manifest pad containing a board-frame point (small grab
  // margin) — the DOM hit test can't see pads under part bodies or probe
  // outlines, the manifest can. Optional ref limits to one part's pads.
  function padAtBoard(bx, by, ref) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < padManifest.length; i++) {
      var p = padManifest[i];
      if (ref && p.ref !== ref) continue;
      var e = padEffBoard(p);
      var dx = Math.max(Math.abs(bx - e.x) - p.w / 2, 0);
      var dy = Math.max(Math.abs(by - e.y) - p.h / 2, 0);
      if (dx > 0.06 || dy > 0.06) continue;
      var d = dx + dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
  function buildPadLabels() {
    var data = padManifest;
    // padManifest parses late in the page script (line ~6725) while
    // refreshRatsnest — which now rebuilds labels — runs during init
    // (~4037): until the manifest exists there is nothing to render, and
    // touching it would kill the whole script
    if (!viewGroups.gerber || !data || !data.length) return 0;
    var groups = viewGroups.gerber.querySelectorAll('g[data-kind="copper"]');
    var count = 0;
    for (var gi2 = 0; gi2 < groups.length; gi2++) {
      var lg = groups[gi2];
      var stale = document.querySelector('.pad-labels[data-layer-id="' + (lg.getAttribute('data-layer-id') || '') + '"]');
      if (stale) stale.parentNode.removeChild(stale);
      var lname = (lg.getAttribute('data-layer-name') || '').toLowerCase();
      var canon = /(^|[-_.])f_cu(?=$|[-_.])/.test(lname)
        ? 'F.Cu'
        : /(^|[-_.])b_cu(?=$|[-_.])/.test(lname)
          ? 'B.Cu'
          : null;
      var inm = /(^|[-_.])in(\d+)_cu(?=$|[-_.])/.exec(lname);
      if (inm) canon = 'In' + inm[2] + '.Cu';
      if (!canon) continue;
      var host = document.createElementNS(SVGNSL, 'g');
      host.setAttribute('class', 'pad-labels');
      host.setAttribute('pointer-events', 'none');
      host.setAttribute('data-layer-id', lg.getAttribute('data-layer-id'));
      // TOPMOST: appended at the end of the gerber stack, above every layer,
      // the ratsnest, and the layout overlay — pin numbers and net names
      // must never be buried under copper, silk, or selection ink. Layer
      // visibility is driven by the host's display (syncLayer keeps it in
      // lockstep with its copper group).
      var stack = viewGroups.gerber.querySelector('#yflip') || viewGroups.gerber;
      stack.appendChild(host);
      for (var pd = 0; pd < data.length; pd++) {
        var p = data[pd];
        if (p.layers.indexOf(canon) === -1 && p.layers.indexOf('*.Cu') === -1) continue;
        // effective position: pending moves and rotations applied, so the
        // label rides the ghost like the pad ink does
        var eff = padEffBoard(p);
        var px = eff.x;
        var py = -eff.y; // board y-down -> gerber y-up
        var pin = String(p.pin ?? '');
        var named = p.net && p.net !== 'N/C';
        if (named) {
          // two rows, evenly spread: pin number above, net name below
          addPadText(host, pin, px, py + p.h * 0.2, padLabelSize(pin, p.w, p.h, 0.4), '600');
          addPadText(host, String(p.net), px, py - p.h * 0.2, padLabelSize(String(p.net), p.w, p.h, 0.4), null);
          count += 2;
        } else {
          addPadText(host, pin, px, py, padLabelSize(pin, p.w, p.h, 0.5), '600');
          count++;
        }
      }
      if (!host.childNodes.length) host.parentNode.removeChild(host);
    }
    return count;
  }
  function raisePadLabels() {
    // appended-later siblings paint later: the layout overlay and ratsnest
    // rebuild at their own times and would land above the labels. Re-append
    // the hosts whenever the stack reshuffles so pin numbers and net names
    // stay the TOPMOST rendered items.
    var stack = viewGroups.gerber ? viewGroups.gerber.querySelector('#yflip') : null;
    if (!stack) return;
    var hosts = document.querySelectorAll('.pad-labels');
    for (var ri = 0; ri < hosts.length; ri++) stack.appendChild(hosts[ri]);
    if (routeUi) stack.appendChild(routeUi);
  }
  var padLabelSig = null;
  function syncPadLabelVisibility() {
    // labels FOLLOW the parts: a pending move re-renders every label at the
    // pad's effective (moved + rotated) position — hiding them (the old
    // behavior) made pin numbers vanish for the whole board the moment any
    // part moved. Rebuilds skip when the move signature is unchanged (this
    // rides the 50ms ratsnest refresh during drags; recreating hundreds of
    // texts per mousemove would jank big boards)
    var sig = '';
    for (var mk in layoutMoves) sig += mk + ':' + layoutMoves[mk].x + ',' + layoutMoves[mk].y + ',' + (layoutRot[mk] || 0) + ';';
    if (sig === padLabelSig) return;
    padLabelSig = sig;
    buildPadLabels();
    raisePadLabels();
  }
  // hit lines for EVERY trace: source-built boards carry their tracks as
  // ordinary attributed gerber ink (data-net + data-w, no data-route) —
  // interactive routes get hits in routeCommit, but after a rebuild-from-
  // source there are none, and segment selection would find nothing. This
  // walks the copper groups and gives every trace path a clickable twin.
  function parsePathVerts(d) {
    // every vertex of a pure M/L polyline (tracks only — arcs bail). One
    // hit per SEGMENT keeps selection, deletion, and the apply bridge's
    // segment matching 1:1 with the source's .to() calls
    if (!d) return null;
    var re = /(M|L)\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/g;
    var m;
    var verts = [];
    while ((m = re.exec(d))) verts.push([+m[2], +m[3]]);
    return verts.length >= 2 ? verts : null;
  }
  function makeSegHit(track, x1, y1, x2, y2, w, net) {
    var hit = document.createElementNS(SVGNSL, 'line');
    hit.setAttribute('x1', x1.toFixed(3));
    hit.setAttribute('y1', y1.toFixed(3));
    hit.setAttribute('x2', x2.toFixed(3));
    hit.setAttribute('y2', y2.toFixed(3));
    hit.setAttribute('class', 'route-hit');
    hit.setAttribute('stroke', 'transparent');
    // transparent strokes are NOT hit-testable under the default
    // visiblePainted policy — pointer-events:stroke makes the line
    // clickable regardless of paint
    hit.setAttribute('pointer-events', 'stroke');
    hit.setAttribute('stroke-width', String(Math.max(w, 0.5)));
    // ROUND caps: the visible ink carries round linecaps, so its ends bulge
    // a half-width past the geometry — a butt-capped corridor leaves the
    // dangling end tips (round and all) unclickable
    hit.setAttribute('stroke-linecap', 'round');
    hit.setAttribute('data-seg', '1');
    if (net) hit.setAttribute('data-net', net);
    hit.__track = track;
    track.__hits = track.__hits || [];
    track.__hits.push(hit);
    return hit;
  }
  function attachTraceHits() {
    if (!viewGroups.gerber) return 0;
    var groups = viewGroups.gerber.querySelectorAll('g[data-kind=' + JSON.stringify('copper') + ']');
    var made = 0;
    for (var gi = 0; gi < groups.length; gi++) {
      var lg = groups[gi];
      var paths = lg.querySelectorAll('path[data-w]:not([data-ref]):not([data-seg])');
      for (var pi = 0; pi < paths.length; pi++) {
        var tr = paths[pi];
        if (tr.getAttribute('fill-rule')) continue; // pour regions
        if (tr.__hits) continue; // already armed
        var verts = parsePathVerts(tr.getAttribute('d'));
        if (!verts) continue;
        var w = parseFloat(tr.getAttribute('data-w') || '0.3');
        var tnet = tr.getAttribute('data-net');
        for (var sv = 1; sv < verts.length; sv++) {
          var a1 = verts[sv - 1], b1 = verts[sv];
          // netless ink (N/C) binds to its unnamed route by segment geometry
          var uIdx = !tnet || tnet === 'N/C' ? unnamedSegMatch(a1[0], a1[1], b1[0], b1[1]) : -1;
          var hitLine = makeSegHit(tr, a1[0], a1[1], b1[0], b1[1], w, tnet);
          lg.appendChild(hitLine);
          made++;
          if (uIdx >= 0) {
            (unnamedInk[uIdx] = unnamedInk[uIdx] || []).push(tr, hitLine);
            tr.__unnamedIdx = uIdx;
            hitLine.__unnamedIdx = uIdx;
          }
        }
        // machine routing candy-canes — AUTOROUTER-built nets only
        // (provenance 'auto'); every TrackBuilder-authored track, netted or
        // netless, is a manual route and stays a solid trace
        if (tnet && routeProvenance[tnet] === 'auto') {
          var stripe = document.createElementNS(SVGNSL, 'path');
          stripe.setAttribute('class', 'route-auto-stripe');
          stripe.setAttribute('d', tr.getAttribute('d'));
          // white dashes over the solid ink: lightens alternate bands
          stripe.setAttribute('stroke', '#ffffff');
          stripe.setAttribute('stroke-width', tr.getAttribute('stroke-width') || String(w));
          stripe.setAttribute('fill', 'none');
          stripe.setAttribute('stroke-linecap', 'butt');
          stripe.setAttribute('pointer-events', 'none');
          lg.appendChild(stripe);
          tr.__stripe = stripe;
        }
      }
    }
    return made;
  }
  attachTraceHits();
  buildPadLabels();
  // pending apply edits made before an unexpected reload come back here —
  // the ink re-renders at its source state, but the payload survives and
  // the next apply still writes it
  (function () {
    var n = restorePending();
    if (n) {
      renderLayoutMoves(); // arms the apply button for the restored edits
      if (statusEl && !statusLocked())
        statusEl.textContent =
          n + ' pending edit' + (n > 1 ? 's' : '') + ' restored after the refresh \u2014 apply writes them into source';
    }
  })();

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

  // explicit focus handoff for board presses — see the tabindex note at the
  // svg setup. Capture phase, so it runs before whichever interaction
  // handler is about to cancel the default (and with it the focus).
  window.addEventListener('pointerdown', function (ev) {
    if (ev.target && svg.contains(ev.target)) {
      try {
        svg.focus();
      } catch (e) {}
    }
  }, true);

  var drag = null;
  // right-hold pans the board; the browser menu would fight the drag
  svg.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
  });
  svg.addEventListener('mousedown', function (ev) {
    // button 2 = pan the board; button 0 = click semantics only (probe,
    // ruler, selection) — a left-drag never pans, it is not a grab
    drag =
      ev.button === 2
        ? { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty, moved: false, pan: true }
        : ev.button === 0
          ? { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty, moved: false, pan: false }
          : null;
  });
  window.addEventListener('mousemove', function (ev) {
    if (drag) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 3) drag.moved = true;
      if (drag.pan) {
        var a = clientToView({ x: drag.x, y: drag.y });
        var b = clientToView({ x: ev.clientX, y: ev.clientY });
        tx = drag.tx + (b.x - a.x);
        ty = drag.ty + (b.y - a.y);
        apply();
      }
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
    if (drag && ev.button === 0 && !drag.moved && measuring) {
      // undo the sub-threshold pan so the ruler point lands where clicked
      // (left never pans, but the restore is harmless and keeps one shape)
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
    } else if (drag && ev.button === 0 && !drag.moved && ev.target && svg.contains(ev.target)) {
      // plain click (ruler not armed): probe for net/component highlighting.
      // A click that went to a selection (segment or via, capture-handled
      // at pointerdown) must not ALSO dim the whole board with a net
      // highlight on top of the selection
      if (segSel.size || viaSel.size) {
        drag = null;
        return;
      }
      var el = probeHitTarget(ev);
      el = el && el.closest ? el.closest('[data-net],[data-ref]') : null;
      // peek may surface bare geometry (fill raster, background): the
      // outline that received the click still names the component
      if (!el && ev.target && ev.target.closest) el = ev.target.closest('[data-net],[data-ref]');
      // pour regions are BACKGROUND copper: most of the board is pour, so a
      // click there starting a full net dim reads as the whole board stuck
      // subdued (and it dims fresh netless traces). Treat a pour click as
      // empty space — it clears any highlight instead of starting one
      if (el && el.getAttribute('fill-rule')) el = null;
      // netless ink (N/C) carries no net to highlight either — clicking it
      // should clear, not silently keep an old dim alive
      if (el && !el.getAttribute('data-ref') && (!el.getAttribute('data-net') || el.getAttribute('data-net') === 'N/C')) el = null;
      if (el) {
        var net = el.getAttribute('data-net');
        var ref = el.getAttribute('data-ref');
        if (net && net !== 'N/C' && highlightNet('data-net', net)) {
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
  // the vscode webview's probe client fills #typecad-probe with component
  // outline rects that sit ABOVE the stack and swallow every hit inside a
  // part's body — peek underneath them so a body-hidden pad (every BGA
  // ball) reads as the pad, not the part. display:none (not
  // pointer-events:none — the rects re-enable that per-element) removes the
  // subtree from hit testing outright; no frame renders between the toggles.
  // alsoLayout hides the layout view's part bodies TOO; only padProbe uses
  // that — part grabs must win over traces crossing a body everywhere else.
  function probeHitTarget(ev, alsoLayout) {
    var t = ev.target;
    if (!t || !t.closest) return t;
    var pg = null, lo = null;
    if (t.closest('#typecad-probe')) pg = document.getElementById('typecad-probe');
    if (alsoLayout && t.closest('#layout-overlay')) lo = document.getElementById('layout-overlay');
    if (!pg && !lo) return t;
    if (pg) pg.style.display = 'none';
    if (lo) lo.style.display = 'none';
    try {
      t = document.elementFromPoint(ev.clientX, ev.clientY) || t;
    } catch (e) {}
    if (pg) pg.style.display = '';
    if (lo) lo.style.display = '';
    return t;
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
  // an armed ruler owns every left press on the board, wherever it lands.
  // The part/pad/text grabs, the segment/via selector and the marquee all
  // preventDefault() their pointerdown — which suppresses the mousedown
  // this tool's mouseup branch needs — so a press on copper or a part body
  // never started a ruler. Capture on window outruns them ALL (window
  // capture is the first phase anywhere), and stopPropagation stands them
  // down without touching the default: mousedown still fires, drag still
  // sets, and the ruler point lands exactly where clicked
  window.addEventListener('pointerdown', function (ev) {
    if (!measuring || ev.button !== 0) return;
    if (!ev.target || !svg.contains(ev.target)) return;
    ev.stopPropagation();
  }, true);
  // two quick ruler points on one spot are a double-click to the browser —
  // the part value editor must not open over the just-stuck ruler
  window.addEventListener('dblclick', function (ev) {
    if (!measuring) return;
    if (!ev.target || !svg.contains(ev.target)) return;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);
  // the px->unit conversion changes when the window resizes
  window.addEventListener('resize', renderMeasure);
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (segDrag) segDragEnd(false);
      if (helpEl.style.display !== 'none') helpEl.style.display = 'none';
      if (measuring || measureStart || rulers.length) {
        measuring = false;
        measureStart = null;
        rulers = [];
        measureBtn.classList.remove('armed');
        renderMeasure();
      }
      if (netDimmed.length) clearNetHighlight();
      // routing first: Escape cancels an in-progress track and any pad
      // highlight before touching the selection
      if (routeState) {
        routeCancel();
        return;
      }
      // one Escape drops the WHOLE selection — U grows vias into it beside
      // the segments, and a surviving half-selection would keep owning keys
      var hadInkSel = segSel.size || viaSel.size;
      if (segSel.size) {
        segSel.clear();
        segHiSync();
      }
      if (viaSel.size) {
        viaSel.clear();
        viaHiSync();
      }
      if (hadInkSel) {
        if (netDimmed.length) clearNetHighlight();
        return;
      }
      clearPadHighlight(); // clears the pad OR trace tie-in highlight
      // layout mode: unselect everything (parts and any grabbed text)
      if (
        document.body.classList.contains('typecad-layout') &&
        (layoutSel.length || layoutTextSel >= 0)
      ) {
        layoutSel = [];
        layoutTextSel = -1;
        markLayoutSel();
        markTextSel();
        if (statusEl && !statusLocked()) statusEl.textContent = '';
      }
    }
  });

  // ---- net highlighting + hover probing (X2 object attributes) ----
  var netDimmed = []; // elements dimmed by an active highlight, restored on clear
  var netWhitened = []; // matched elements painted pure white, restored on clear
  function clearNetHighlight() {
    // restore the PRIOR opacity, not removeAttribute: layout-view pours
    // carry a legitimate 0.18 (zone subduing) that a dim/whiten must not
    // erase — clearing a highlight used to strip it and flash the zones
    // to full strength
    for (var i = 0; i < netDimmed.length; i++) {
      var de = netDimmed[i];
      if (de.__netOp0 === '' || de.__netOp0 === null || de.__netOp0 === undefined) de.removeAttribute('opacity');
      else de.setAttribute('opacity', de.__netOp0);
      de.__netOp0 = null;
    }
    netDimmed = [];
    for (var w = 0; w < netWhitened.length; w++) {
      var item = netWhitened[w];
      if (item.fill === null) item.el.removeAttribute('fill');
      else item.el.setAttribute('fill', item.fill);
      if (item.stroke === null) item.el.removeAttribute('stroke');
      else item.el.setAttribute('stroke', item.stroke);
      if (item.op === '' || item.op === null || item.op === undefined) item.el.removeAttribute('opacity');
      else item.el.setAttribute('opacity', item.op);
    }
    netWhitened = [];
  }
  function highlightNet(attr, value) {
    clearNetHighlight();
    var hits = svg.querySelectorAll('[' + attr + ']');
    var any = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].getAttribute(attr) !== value) {
        hits[i].__netOp0 = hits[i].getAttribute('opacity') || '';
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
            kids[ki].__netOp0 = kids[ki].getAttribute('opacity') || '';
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
      el.__netOp0 = el.getAttribute('opacity') || '';
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
      netWhitened.push({ el: me, fill: me.getAttribute('fill'), stroke: me.getAttribute('stroke'), op: me.getAttribute('opacity') || '' });
      if (me.tagName === 'use') me.setAttribute('fill', hlColor);
      else if (me.tagName === 'path') me.setAttribute('stroke', hlColor);
      me.setAttribute('opacity', '1');
    }
    return true;
  }
  var probe = '';
  svg.addEventListener('mousemove', function (ev) {
    var hitEl = probeHitTarget(ev);
    var el = hitEl && hitEl.closest ? hitEl.closest('[data-net],[data-ref],[data-pin]') : null;
    // hovering bare geometry under an outline: the outline still names the part
    if (!el && ev.target && ev.target.closest) el = ev.target.closest('[data-net],[data-ref],[data-pin]');
    var next = '';
    var ref = '';
    if (el) {
      var net = el.getAttribute('data-net');
      ref = el.getAttribute('data-ref') || '';
      var pin = el.getAttribute('data-pin');
      // hovering a part BODY (probe outline, layout overlay, bare silk) —
      // the pad hiding under it still names itself through the manifest
      if (ref && !pin) {
        var mp = padBoardPoint(ev);
        var mpad = padAtBoard(mp.x, mp.y);
        if (mpad && mpad.ref === ref) pin = String(mpad.pin);
      }
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
        // rise in engineering notation ("+3.71m°C"): a toFixed(1) here read
        // "+0.0°C" on a millidegree hotspot while its color sat at ramp max
        next +=
          ' \u00B7 ' + dtHover.what + ' +' + fmtEng(dtHover.v) + '\u00B0C' +
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
  // the width button mirrors the popover (same toggle, mouse-reachable)
  var widthBtn = document.getElementById('btn-width');
  if (widthBtn) widthBtn.addEventListener('click', widthPopToggle);
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
    // a layer theme carries its own silk/paste/drill colors on the group
    // style vars (they ride along in the clone) — only the default palette
    // needs the dark-canvas recolors baked into the export
    if (!document.body.classList.contains('light') && !document.body.classList.contains('layer-themed')) {
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

  document.getElementById('btn-fit').addEventListener('click', fit);
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
    // the layer's pad labels live at the TOP of the stack (never buried) —
    // they follow their layer's visibility
    var padHost = svg.querySelector('.pad-labels[data-layer-id="' + id + '"]');
    if (padHost) {
      if (cb.checked) padHost.style.display = '';
      else padHost.style.display = 'none';
    }
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
  function padLabelColor() {
    // labels key off the ACTIVE canvas (theme background or light/dark
    // mode): bright canvas -> dark ink, dark canvas -> white — gruvbox and
    // the default palette both render white, matching KiCad
    var bg = getComputedStyle(boardArea).backgroundColor;
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg || '');
    if (!m) return '#ffffff';
    var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    return lum > 0.55 ? '#1a1a1a' : '#ffffff';
  }
  function applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
    // the button shows the mode you would switch to
    themeBtn.textContent = theme === 'light' ? '\u263E' : '\u2600';
    themeBtn.title = theme === 'light' ? 'switch to dark theme' : 'switch to light theme';
    svg.style.setProperty('--bg', getComputedStyle(boardArea).backgroundColor);
    svg.style.setProperty('--pad-label', padLabelColor());
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

  // ---- Layer themes (gerber & layout views) ----
  // KiCad color-theme board sections; every layer's ink flows through a
  // per-group CSS variable (--ink-<layerId>), so switching is a restyle of
  // group + chip + canvas — no path is touched. Saved per browser like the
  // dark/light preference, shared across boards and sessions.
  var LAYER_THEME_KEY = 'gerber-viewer:layer-theme:v1';
  var layerThemesIsland = [];
  try {
    layerThemesIsland = JSON.parse(document.getElementById('layer-themes').textContent) || [];
  } catch (e) {}
  var layerThemeSel = document.getElementById('layer-theme');
  // copper side from the filename stem: f_cu / b_cu / in<N>_cu
  function themeColorFor(theme, g) {
    var name = (g.getAttribute('data-layer-name') || '').toLowerCase();
    var kind = g.getAttribute('data-kind');
    var key = null;
    if (kind === 'copper') {
      if (/(^|[-_.])f_cu(?=$|[-_.])/.test(name)) key = 'f';
      else if (/(^|[-_.])b_cu(?=$|[-_.])/.test(name)) key = 'b';
      else {
        var inm = /(^|[-_.])in(\d+)_cu(?=$|[-_.])/.exec(name);
        key = inm ? 'in' + inm[2] : 'f';
      }
      var cop = theme.board.copper;
      return cop ? cop[key] || null : null;
    }
    var side = /(^|[-_.])b_(mask|paste|silks|adhes|fab|crtyd)/.exec(name);
    var suffix = kind === 'silkscreen' ? 'silks' : kind === 'courtyard' ? 'crtyd' : kind;
    var tokens = { mask: 1, paste: 1, silks: 1, adhes: 1, fab: 1, crtyd: 1 };
    if (tokens[suffix]) key = (side ? 'b_' : 'f_') + suffix;
    else if (kind === 'edge') key = 'edge_cuts';
    else if (kind === 'drill') key = 'via_through';
    return key ? theme.board[key] || null : null;
  }
  function applyLayerTheme(id) {
    var theme = null;
    for (var lt = 0; lt < layerThemesIsland.length; lt++)
      if (layerThemesIsland[lt].id === id) theme = layerThemesIsland[lt];
    document.body.classList.toggle('layer-themed', !!theme);
    // GERBER stack only: the pcba/blueprint views embed their own #yflip
    // copies carrying the same data-layer-ids; their pass had no theme
    // mapping and reset the shared sidebar chips to the default palette
    var lgs = (viewGroups.gerber || document).querySelectorAll('#yflip > g[data-layer-id]');
    for (var lg = 0; lg < lgs.length; lg++) {
      var g2 = lgs[lg];
      var lid = g2.getAttribute('data-layer-id');
      // only GERBER layer groups: the pcba/blueprint views inject their own
      // copper copies into the same #yflip WITHOUT data-kind/data-layer-name
      // — theme-mapped to nothing, their pass reset the shared chips
      if (!g2.getAttribute('data-kind') || !g2.getAttribute('data-layer-name')) continue;
      if (g2.__inkDefault === undefined) g2.__inkDefault = g2.style.getPropertyValue('--ink-' + lid);
      var color = theme ? themeColorFor(theme, g2) : null;
      if (color) g2.style.setProperty('--ink-' + lid, color);
      else g2.style.setProperty('--ink-' + lid, g2.__inkDefault);
      var chip = document.querySelector('.layer-row[data-layer-id="' + lid + '"] .chip');
      if (chip) {
        if (chip.__bgDefault === undefined) chip.__bgDefault = chip.style.background;
        chip.style.background = color || chip.__bgDefault;
      }
    }
    if (theme && theme.background) boardArea.style.backgroundColor = theme.background;
    else boardArea.style.removeProperty('background-color');
    // cutouts key off the canvas color — keep the var synced either way
    svg.style.setProperty('--bg', getComputedStyle(boardArea).backgroundColor);
    svg.style.setProperty('--pad-label', padLabelColor());
    // '' = the Default option (raw palette, no restyle)
    try { localStorage.setItem(LAYER_THEME_KEY, theme ? id : ''); } catch (e) {}
  }
  if (layerThemeSel) {
    layerThemeSel.addEventListener('change', function () {
      applyLayerTheme(layerThemeSel.value);
    });
    var savedLayerTheme = null;
    try { savedLayerTheme = localStorage.getItem(LAYER_THEME_KEY); } catch (e) {}
    var known = false;
    for (var st = 0; st < layerThemesIsland.length; st++)
      if (layerThemesIsland[st].id === savedLayerTheme) known = true;
    if (savedLayerTheme === '') {
      // the raw palette — no restyle, the fallback recolors own dark mode
      layerThemeSel.value = '';
    } else if (known) {
      layerThemeSel.value = savedLayerTheme;
      applyLayerTheme(savedLayerTheme);
    } else {
      // first visit, or a theme that is no longer registered: the house look.
      // ('typecad' USED to be the no-theme sentinel — those saved picks
      // migrate to the real house theme, which is what picking it always
      // meant.)
      layerThemeSel.value = 'typecad';
      applyLayerTheme('typecad');
    }
  }

  // Embedding surface (the vscode extension's webview client calls these to
  // cross-probe: select a component from the editor, click a pad to jump
  // back). Absent in a plain browser tab; callers must feature-check.
  // the probe client checks this before swallowing a double-click in the
  // layout view: routing FINISH owns the gesture only while a route is live
  window.typecadRoutingActive = function () {
    return !!routeState;
  };
  // double-click source resolution for NETLESS hand routes: their gerber ink
  // carries no data-net, so the closest('[data-net]') probe chain finds
  // nothing. The routes island's unnamed list (declaration site + board-mm
  // polyline) resolves the clicked point back to the TrackBuilder
  // declaration line; coordinates arrive as CLIENT pixels like every probe.
  var unnamedRoutes = [];
  try {
    var rt = JSON.parse(document.getElementById('routes').textContent);
    unnamedRoutes = (rt && rt.unnamed) || [];
  } catch (e) {}
  window.typecadTraceSource = function (clientX, clientY) {
    if (!unnamedRoutes.length) return '';
    var g = gerberAt(clientX, clientY);
    var bx = g.x;
    var by = -g.y; // gerber y-up -> board y-down (the island's frame)
    for (var ri = 0; ri < unnamedRoutes.length; ri++) {
      var pts = unnamedRoutes[ri].pts;
      for (var pi = 1; pi < pts.length; pi++) {
        var ax = pts[pi - 1].x, ay = pts[pi - 1].y, cx2 = pts[pi].x, cy2 = pts[pi].y;
        var dx = cx2 - ax, dy = cy2 - ay;
        var len2 = dx * dx + dy * dy;
        if (len2 < 1e-9) {
          if (Math.hypot(bx - ax, by - ay) < 0.4) return unnamedRoutes[ri].source;
          continue;
        }
        var t = ((bx - ax) * dx + (by - ay) * dy) / len2;
        if (t < 0 || t > 1) continue;
        var px = ax + t * dx, py = ay + t * dy;
        if (Math.hypot(bx - px, by - py) < 0.4) return unnamedRoutes[ri].source;
      }
    }
    return '';
  };
  // cross-probe seam: the injected client's double-click asks "which pad is
  // under this point?" — overlays (the probe outlines, the layout view's
  // part bodies) shadow body-hidden pads from DOM hit testing, so resolve
  // through the pad manifest in board space: point-in-pad with a small
  // grab margin, nearest pad wins. Gerber pad ink (data-pin) is tried
  // first so an exposed flash keeps its exact shape, not its bbox.
  window.typecadPadProbe = function (clientX, clientY) {
    var pg = document.getElementById('typecad-probe');
    var lo = document.getElementById('layout-overlay');
    var hid1 = false, hid2 = false;
    if (pg && pg.style.display !== 'none') { pg.style.display = 'none'; hid1 = true; }
    if (lo && lo.style.display !== 'none') { lo.style.display = 'none'; hid2 = true; }
    var t = null;
    try {
      t = document.elementFromPoint(clientX, clientY);
    } catch (e) {}
    if (hid1) pg.style.display = '';
    if (hid2) lo.style.display = '';
    if (t && t.closest) {
      var pe = t.closest('[data-pin]');
      if (pe) return { ref: pe.getAttribute('data-ref'), pin: pe.getAttribute('data-pin') };
    }
    var bp = padBoardPoint({ clientX: clientX, clientY: clientY });
    var best = padAtBoard(bp.x, bp.y);
    return best ? { ref: best.ref, pin: String(best.pin) } : null;
  };
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
<meta name="tc-viewer-build" content="${escapeHtml(buildTag)}">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  /* board canvas is a diagram, not a document: no text selection highlights
     (silk/fab stroke text, refdes labels) while dragging or double-clicking */
  #board, #board text { -webkit-user-select: none; user-select: none; }
  #board:focus { outline: none; }
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
    /* selection/highlight ink — KiCad-style WHITE over the copper on the
       dark canvas; tints wash the selected body instead of outlining it */
    --sel: #ffffff;
    --sel-tint: rgba(255, 255, 255, 0.12);
    --sel-box: rgba(255, 255, 255, 0.08);
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
    /* pure white would vanish on the white page — the light theme's
       selection stays a readable neutral gray */
    --sel: #6e7681;
    --sel-tint: rgba(110, 118, 129, 0.16);
    --sel-box: rgba(110, 118, 129, 0.09);
  }
  /* layers whose palette colors are near-black would vanish on the dark
     canvas — recolor them (and their sidebar chips) in dark theme; strokes
     and non-none fills carry explicit attributes, so override those too.
     stroke="none" must be excluded: region paths (TrueType text glyphs, pour
     outlines) carry it and would gain a 1-unit outline — ballooned glyphs */
  body:not(.light):not(.layer-themed) #board [data-kind="silkscreen"],
  body:not(.light):not(.layer-themed) #board [data-kind="paste"] {
    fill: #d6d6d6;
  }
  body:not(.light):not(.layer-themed) #board [data-kind="silkscreen"] [stroke]:not([stroke='none']),
  body:not(.light):not(.layer-themed) #board [data-kind='paste'] [stroke]:not([stroke='none']) {
    stroke: #d6d6d6 !important;
  }
  body:not(.light):not(.layer-themed) #board [data-kind='silkscreen'] [fill]:not([fill='none']),
  body:not(.light):not(.layer-themed) #board [data-kind='paste'] [fill]:not([fill='none']) {
    fill: #d6d6d6 !important;
  }
  body:not(.light):not(.layer-themed) #board [data-kind='drill'] {
    fill: #2fbfae;
  }
  body:not(.light):not(.layer-themed) #board [data-kind='drill'] [stroke]:not([stroke='none']) {
    stroke: #2fbfae !important;
  }
  body:not(.light):not(.layer-themed) #board [data-kind='drill'] [fill]:not([fill='none']) {
    fill: #2fbfae !important;
  }
  /* clear-polarity shapes must always paint the canvas color, not the override */
  #board [data-kind] .cut { fill: var(--bg) !important; stroke: var(--bg) !important; }
  /* region fills (TrueType glyph outlines etc.) must never gain a stroke —
     stroking those outlines balloons the letters. The .cut rule above is more
     specific, so clear-polarity regions keep their canvas-color stroke. */
  #board path[fill-rule] { stroke: none !important; }
  body:not(.light):not(.layer-themed) .layer-row[data-kind="silkscreen"] .chip,
  body:not(.light):not(.layer-themed) .layer-row[data-kind="paste"] .chip { background: #d6d6d6 !important; }
  body:not(.light):not(.layer-themed) .layer-row[data-kind="drill"] .chip { background: #2fbfae !important; }
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
  #toolbar select { flex: 0 1 auto; max-width: 120px; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 4px 4px; cursor: pointer; font: inherit; }
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
  /* the candy-cane mark: a base stroke with white band breaks, like the
     autorouter stripe overlay renders on the board */
  #layout-keys .chip-striped {
    position: relative;
  }
  #layout-keys .chip-striped::before { border-top: 2px solid currentColor; }
  #layout-keys .chip-striped::after {
    content: ''; position: absolute; left: 0; top: 50%; width: 16px; height: 2px;
    transform: translateY(-50%);
    background: repeating-linear-gradient(90deg, var(--page, #fff) 0 3px, transparent 3px 6px);
  }
  #layout-keys .chip-grey::before { border-top: 2px solid rgba(128,128,128,0.35); }
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
  #ratsnest path { stroke: #d29922; stroke-width: 0.05; fill: none; opacity: 0.85; }
  #ratsnest path.rat-hi { stroke: var(--sel); stroke-width: 0.12; opacity: 1; }
  /* autorouter tracks: a WHITE dashed overlay over the solid ink stroke —
     the dashes lighten the copper underneath, so the trace reads as
     alternating lighter/darker candy-cane bands in any theme (same-ink
     overlays are invisible over their own stroke) */
  .route-auto-stripe { opacity: 0.45; stroke-dasharray: 1.2 1.2; }
  .pad-labels text { fill: var(--pad-label, #ffffff); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  /* movable texts read as grabbable, and a grabbed one is highlighted */
  body.typecad-layout #yflip path[data-text] { cursor: move; }
  #yflip path.layout-text-sel { stroke: var(--sel) !important; }
  /* the handle itself paints nothing — the footprint's own ink (pads, silk,
     fab outline) already shows the part, KiCad-style. It stays the pointer
     target via inherited pointer-events:all, with NO hover ghost: hovering
     draws nothing (selection and warnings are the only part feedback) */
  #layout-overlay .layout-comp rect,
  #layout-overlay .layout-comp polygon { fill: transparent; stroke: none; stroke-linejoin: round; }
  #layout-overlay .layout-comp.layout-back rect,
  #layout-overlay .layout-comp.layout-back polygon { stroke: none; fill: transparent; }
  /* a part is only movable once selected — the cursor says exactly that:
     the board crosshair stays over an unselected part (nothing grabbable),
     move arrows over a selected one */
  #layout-overlay .layout-comp.layout-sel { cursor: move; }
  #layout-overlay .layout-comp.layout-sel rect,
  #layout-overlay .layout-comp.layout-sel polygon {
    /* selection reads from the tint fill alone — no outline, no brackets */
    stroke: none;
    fill: var(--sel-tint);
  }
  #route-ui .route-anchored { opacity: 0.9; }
  /* keep-out halo: the DRC clearance envelope under the live route. Gray
     while clear, grayish red on violation — alphas tuned to read as a zone
     over any copper while the trace ink stays legible on top */
  .route-halo { fill: none; stroke: rgba(148, 148, 148, 0.34); stroke-linecap: round; stroke-linejoin: round; }
  .route-halo.bad { stroke: rgba(205, 92, 92, 0.5); }
  /* via keep-out rings: the barrel's own clearance envelope */
  .route-via-halo { fill: none; stroke: rgba(148, 148, 148, 0.34); }
  .route-via-halo.bad { stroke: rgba(205, 92, 92, 0.5); }
  /* the ? keys cheat-sheet */
  #keys-help {
    position: fixed; right: 16px; bottom: 96px; z-index: 45; display: none;
    max-width: 440px; background: var(--chrome-bg); color: var(--chrome-fg);
    border: 1px solid var(--chrome-border); border-radius: 6px; padding: 10px 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); font: 12px/1.5 system-ui, sans-serif;
    cursor: pointer; max-height: calc(100vh - 120px); overflow-y: auto;
  }
  /* one binding per row: bold key column, dash, explanation — the grid keeps
     every key aligned and no row wraps under its key */
  #keys-help .hrow { display: grid; grid-template-columns: 128px 1fr; column-gap: 8px; align-items: baseline; }
  #keys-help .hk { font-weight: 700; white-space: nowrap; }
  #keys-help .hd { color: var(--chrome-fg); }
  #keys-help .hsec { color: #4fc1ff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin: 8px 0 2px; }
  #keys-help .hsec:first-child { margin-top: 0; }
  #keys-help .hnote { color: var(--muted); font-size: 11px; margin-top: 6px; }
  #route-ui .route-via { fill: #4fc1ff; fill-opacity: 0.35; stroke: #4fc1ff; stroke-width: 0.1; }
  /* committed vias (session circles + gerber flashes): selectable like any
     element — the transparent stroke widens the hit area without changing
     the look */
  circle[data-route],
  g[data-kind='copper'] use[data-net]:not([data-ref]) {
    /* the board cursor stays the crosshair over vias too — hit-area only,
       no pointer affordance (nothing on the canvas is a "link") */
  }
  circle[data-route].route-via-sel,
  use.route-via-sel {
    stroke: var(--sel);
    fill-opacity: 0.55;
    /* no fixed stroke-width here — viaHiSync sets a per-barrel width in
       board units so the ring hugs the via at every zoom */
  }
  /* selected trace segments: a white overlay at the segment's OWN width
     (set per line by segHiSync from the track's data-w) — the highlight
     covers the whole trace shape, not a thin centerline */
  .route-sel line { stroke: var(--sel); stroke-opacity: 0.85; stroke-linecap: round; fill: none; }
  /* trace-width readout riding the cursor while a route is live, and the
     W/toolbar width picker popover */
  #route-width-chip {
    position: fixed; z-index: 30; pointer-events: none; display: none;
    font: 11px system-ui, sans-serif; color: var(--chrome-fg);
    background: rgba(22, 24, 29, 0.85); border: 1px solid var(--btn-border);
    border-radius: 4px; padding: 1px 6px;
  }
  #route-width-chip.below-min { color: #d29922; border-color: #d29922; }
  #width-pop {
    position: fixed; right: 12px; bottom: 96px; z-index: 40; display: none;
    flex-direction: column; gap: 6px; background: var(--chrome-bg);
    border: 1px solid var(--chrome-border); border-radius: 6px; padding: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); font: 12px system-ui, sans-serif;
  }
  #width-pop.open { display: flex; }
  #width-pop .wladder { display: flex; flex-wrap: wrap; gap: 4px; max-width: 250px; }
  #width-pop .wladder button, #width-pop .wrow input {
    background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border);
    border-radius: 4px; padding: 3px 7px; cursor: pointer; font: inherit;
  }
  #width-pop .wladder button.cur { box-shadow: inset 0 0 0 1px var(--chrome-fg); }
  #width-pop .wrow { display: flex; align-items: center; gap: 8px; color: var(--muted); }
  #width-pop .wrow input { width: 76px; cursor: text; }
  #width-pop .whint { color: var(--muted); font-size: 11px; }
  /* properties panel (E) — same chrome as the width picker */
  #props-pop {
    position: fixed; right: 12px; bottom: 96px; z-index: 42; display: none;
    flex-direction: column; gap: 6px; background: var(--chrome-bg);
    border: 1px solid var(--chrome-border); border-radius: 6px; padding: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); font: 12px system-ui, sans-serif;
    min-width: 240px;
  }
  #props-pop b { color: #4fc1ff; }
  #props-pop .wrow { display: flex; align-items: center; gap: 8px; color: var(--muted); }
  #props-pop .wrow label { display: flex; align-items: center; gap: 4px; }
  #props-pop input, #props-pop select {
    background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border);
    border-radius: 4px; padding: 3px 6px; font: inherit; width: 76px; cursor: text;
  }
  #props-pop select { cursor: pointer; width: 56px; }
  #props-pop input[type='checkbox'] { width: auto; margin: 0; }
  #props-pop button {
    background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border);
    border-radius: 4px; padding: 3px 12px; cursor: pointer; font: inherit;
  }
  #props-pop .whint { color: var(--muted); font-size: 11px; }
  #btn-width { min-width: 56px; }
  /* the picked pad's white clones: aperture symbols carry no fill of
     their own, so the clone's inherited fill paints the exact pad shape;
     .cut holes keep var(--bg) (their own !important rule) so a drilled
     pad still reads with its hole */
  .pad-hi-ink { fill: var(--sel); fill-opacity: 0.8; stroke: none; }
  .route-pad-target { fill: rgba(63, 185, 80, 0.15); stroke: #3fb950; stroke-width: 2px; }
  #layout-sel-box { fill: var(--sel-box); stroke: var(--sel); stroke-width: 1.5px; }
  #layout-sel-box.cross {
    stroke: #3fb950;
    fill: rgba(63, 185, 80, 0.07);
    stroke-dasharray: 6 4;
  }
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
  <div id="layout-keys"><span class="chip chip-striped">autorouted</span><span class="chip chip-solid">TrackBuilder</span><span class="chip chip-grey">ripped up</span></div>
  <label><input type="checkbox" id="layout-snap" checked> snap <select id="layout-grid"><option>0.1</option><option>0.25</option><option selected>0.5</option><option>1</option></select> mm</label>
  <label><input type="checkbox" id="layout-grid-show"> grid</label>
  <label><input type="checkbox" id="layout-mil"> mil</label>

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
  <div id="search-box">
    <input id="comp-search" type="text" placeholder="find component (e.g. U1)" autocomplete="off" spellcheck="false">
  </div>
  <div id="layers">
${rows}
  </div>
  <div id="toolbar">
    <button id="btn-fit" title="fit to board (0)">Fit</button>
    <button id="btn-all-on" title="show all layers">All</button>
    <button id="btn-all-off" title="hide all layers">None</button>${
      /* layer colors for the gerber & layout views; KiCad color themes */
      (options.layerThemes ?? LAYER_THEME_LIST).length
        ? `
    <select id="layer-theme" title="layer colors (KiCad color themes)">${[
        ...(options.layerThemes ?? LAYER_THEME_LIST).map(
          (t) =>
            `<option value="${escapeHtml(t.id)}" title="${escapeHtml(t.credit + ' — ' + t.license)}">${escapeHtml(t.label)}</option>`,
        ),
        `<option value="" title="the built-in viewer palette">Default</option>`,
      ].join('')}</select>`
        : ''
    }
    <button id="btn-measure" title="measure: click start, click end — rulers stick; Esc clears all">&#x1F4CF;</button>
    <button id="btn-width" title="trace [ ] / via Shift+[ ] sizing (Alt ±0.01, may cross the board min) · P sizes for the net’s current · Z sizes for 50 Ω · \ and Shift+\ reset · W opens the picker" hidden>auto</button>
    <button id="btn-drc" class="has-drc-hidden" title="toggle DRC violation markers" hidden>DRC</button>
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
  <script id="rules" type="application/json">${
    options.rules ? JSON.stringify(options.rules).replace(/</g, '\\u003c') : ''
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
  <script id="layer-themes" type="application/json">${
    (options.layerThemes ?? LAYER_THEME_LIST).length
      ? JSON.stringify(options.layerThemes ?? LAYER_THEME_LIST).replace(/</g, '\\u003c')
      : ''
  }</script>
  <script id="pad-data" type="application/json">${
    options.padLabels && options.padLabels.length
      ? JSON.stringify(options.padLabels).replace(/</g, '\\u003c')
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
