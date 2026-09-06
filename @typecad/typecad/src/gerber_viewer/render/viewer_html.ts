import type { LayerInfo } from '../detect_layer.js';

export interface ViewerOptions {
  title?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  var units = svg.getAttribute('data-units') || 'mm';

  function apply() {
    panzoom.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    renderMeasure();
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
      var by = -((v.y - ty) / k);
      statusEl.textContent = bx.toFixed(3) + ', ' + by.toFixed(3) + ' ' + units + '   zoom ' + k.toFixed(2) + 'x';
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
    if (ev.key === 'Escape' && (measuring || measureStart || rulers.length)) {
      measuring = false;
      measureStart = null;
      rulers = [];
      measureBtn.classList.remove('armed');
      renderMeasure();
    }
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
    group.setAttribute('opacity', slider.value);
  }

  // Layer settings survive rebuilds: the dev server reloads the page on every
  // build, so visibility/opacity are kept in localStorage keyed per board and
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
    var state = {};
    document.querySelectorAll('.layer-row').forEach(function (row) {
      state[row.getAttribute('data-layer-id')] = {
        visible: row.querySelector('.layer-vis').checked,
        opacity: parseFloat(row.querySelector('.layer-opacity').value),
      };
    });
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
  #toolbar { display: flex; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--chrome-border); }
  #toolbar button { flex: 1; background: var(--btn-bg); color: var(--chrome-fg); border: 1px solid var(--btn-border); border-radius: 4px; padding: 4px 6px; cursor: pointer; font: inherit; }
  #toolbar button:hover { background: var(--btn-hover); }
  #toolbar button.armed { box-shadow: inset 0 0 0 1px var(--chrome-fg); background: var(--btn-hover); }
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
  </div>
</div>
<div id="board-area">
  ${svg.replace('<svg ', '<svg id="board" ').replace('</g></g></svg>', '</g><g id="measure"></g></g></svg>')}
  <div id="status"></div>
</div>
<script>
${js}
</script>
</body>
</html>
`;
}
