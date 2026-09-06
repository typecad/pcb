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
        `<label class="layer-row" data-layer-id="${escapeHtml(layer.id)}">`,
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
  svg.style.cursor = 'grab';
  svg.addEventListener('mousedown', function (ev) {
    drag = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty };
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', function (ev) {
    if (drag) {
      var a = clientToView({ x: drag.x, y: drag.y });
      var b = clientToView({ x: ev.clientX, y: ev.clientY });
      tx = drag.tx + (b.x - a.x);
      ty = drag.ty + (b.y - a.y);
      apply();
    } else if (ev.target && svg.contains(ev.target)) {
      var v = clientToView({ x: ev.clientX, y: ev.clientY });
      var bx = (v.x - tx) / k;
      var by = -((v.y - ty) / k);
      statusEl.textContent = bx.toFixed(3) + ', ' + by.toFixed(3) + ' ' + units + '   zoom ' + k.toFixed(2) + 'x';
    }
  });
  window.addEventListener('mouseup', function () {
    drag = null;
    svg.style.cursor = 'grab';
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
  // the OS preference on first visit. The canvas stays light in both themes —
  // silkscreen/fab layers use near-black colors and clear-polarity cutouts
  // assume a light background.
  var THEME_KEY = 'gerber-viewer:theme:v1';
  var themeBtn = document.getElementById('btn-theme');
  function applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
    // the button shows the mode you would switch to
    themeBtn.textContent = theme === 'light' ? '\u263E' : '\u2600';
    themeBtn.title = theme === 'light' ? 'switch to dark theme' : 'switch to light theme';
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
    --chrome-bg: #1e1e1e; --chrome-fg: #ddd; --muted: #888;
    --chrome-border: #333; --row-hover: #2a2a2a;
    --btn-bg: #333; --btn-border: #444; --btn-hover: #444;
  }
  body.light {
    --chrome-bg: #f7f7f7; --chrome-fg: #333; --muted: #666;
    --chrome-border: #ddd; --row-hover: #ebebeb;
    --btn-bg: #fff; --btn-border: #ccc; --btn-hover: #eee;
  }
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
  #board-area { position: relative; flex: 1; background: var(--page, #ffffff); }
  #status { position: absolute; left: 10px; bottom: 8px; background: #000a; color: #fff; padding: 3px 8px; border-radius: 4px; font: 12px/1.2 ui-monospace, monospace; pointer-events: none; }
  #board { position: absolute; inset: 0; display: block; }
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
  </div>
</div>
<div id="board-area">
  ${svg.replace('<svg ', '<svg id="board" ')}
  <div id="status"></div>
</div>
<script>
${js}
</script>
</body>
</html>
`;
}
