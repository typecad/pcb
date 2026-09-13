"use strict";
// ---------------------------------------------------------------------------
// Cross-probe client injected into the gerber-viewer HTML when it is shown in
// a vscode webview.
//
// Two directions:
//  - editor → board: the extension posts {type:'typecad/select', ref}; the
//    client calls the viewer's own window.typecadViewer API (highlight +
//    zoom/flash) so selection looks identical to in-viewer search.
//  - board → editor: DOUBLE clicks on anything carrying data-ref (gerber X2
//    pad attributes AND the injected component outlines) postMessage back.
//    Double rather than single: every single click (measurement ruler points
//    included) stays inside the viewer and can never steal editor focus.
//
// The client also renders outline rectangles into the #typecad-probe SVG
// group from embedded component data — pads alone are small targets, and the
// outline gives every component a clickable, highlightable body. The probe
// group is a SIBLING of the viewer's #yflip group (inside #panzoom), so the
// board's y flip is applied manually (y → -y, rotation stays positive).
// Position goes in the x/y geometry attributes rather than a translate
// transform: the viewer's zoom-to-component fits on getBBox(), which ignores
// an element's own transform.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.outlineData = outlineData;
exports.injectProbeClient = injectProbeClient;
const node_crypto_1 = require("node:crypto");
/** Components with a measurable footprint; the rest have no outline to draw. */
function outlineData(components) {
    return components
        .filter((c) => c.dimensions && c.dimensions.width > 0 && c.dimensions.height > 0)
        .map((c) => ({
        ref: c.reference,
        var: c.variable || undefined,
        x: c.at.x,
        y: c.at.y,
        w: c.dimensions.width,
        h: c.dimensions.height,
        rot: c.at.rotation,
    }));
}
const PROBE_CLIENT = `<script>
(function () {
  var vscode = null;
  try { vscode = acquireVsCodeApi(); } catch (e) {
    // Surface it for the webview devtools; the host's 4s ready-signal
    // diagnostic then has a matching cause visible where it happened.
    console.error('typecad probe client: acquireVsCodeApi() failed', e);
    return;
  }
  function send(msg) { try { vscode.postMessage(msg); } catch (e) {} }
  function status(text) {
    var el = document.getElementById('status');
    if (el && !el.hasAttribute('data-locked')) el.textContent = text;
  }
  // Host render notices own the status line: they set data-locked (the
  // viewer's mouse-move readout and these selection messages stand down) and
  // hold it until cleared — normally by the page reload that lands the new
  // render, which starts with a fresh, unlocked element.
  function notice(text) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text;
    if (text) el.setAttribute('data-locked', '');
    else el.removeAttribute('data-locked');
  }

  var style = document.createElement('style');
  style.textContent =
    '#typecad-probe .typecad-outline{fill:#4fc1ff;fill-opacity:0;stroke:#4fc1ff;stroke-opacity:0;' +
    'stroke-width:1.5;vector-effect:non-scaling-stroke;pointer-events:all;cursor:crosshair}' +
    '#typecad-probe .typecad-outline:hover{stroke-opacity:0.9;fill-opacity:0.12}';
  document.head.appendChild(style);

  var group = document.getElementById('typecad-probe');
  var varByRef = {};
  var netSource = {};
  try {
    var data = JSON.parse(document.getElementById('typecad-probe-data').textContent);
    var comps = data && Array.isArray(data.components) ? data.components : [];
    if (group && Array.isArray(comps)) {
      var ns = 'http://www.w3.org/2000/svg';
      for (var i = 0; i < comps.length; i++) {
        var c = comps[i];
        if (c.var) varByRef[c.ref] = c.var;
        var rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('class', 'typecad-outline');
        rect.setAttribute('data-ref', c.ref);
        // Position via geometry attributes, NOT a translate(): the viewer's
        // search fits the view with getBBox(), which ignores the element's
        // own transform — a translate-placed rect reads as a speck at the
        // board origin and zoom-to-component fits the whole board instead.
        // Only the rotation lives in the transform (rotate about the center).
        rect.setAttribute('x', String(c.x - c.w / 2));
        rect.setAttribute('y', String(-c.y - c.h / 2));
        rect.setAttribute('width', String(c.w));
        rect.setAttribute('height', String(c.h));
        rect.setAttribute('transform', 'rotate(' + c.rot + ',' + c.x + ',' + -c.y + ')');
        group.appendChild(rect);
      }
    }
    var nets = data && Array.isArray(data.nets) ? data.nets : [];
    for (var k = 0; k < nets.length; k++) {
      // traces come from the route call — prefer its site over the net's own
      if (nets[k].routeSource || nets[k].source) {
        netSource[nets[k].name] = nets[k].routeSource || nets[k].source;
      }
    }
  } catch (e) {}
  // ref -> the source variable that created it: the viewer's hover readout
  // calls this so the designator reads "R1 { source r1 }" (absent in plain
  // browser tabs — the variable mapping only exists with board data)
  window.typecadVarFor = function (ref) { return varByRef[ref] || ''; };
  // net -> "file:line" that declared it, same purpose for trace hovers
  window.typecadNetSource = function (net) { return netSource[net] || ''; };

  // Announce readiness at parse time AND on load — the host retries any
  // selection dropped before this until the matching ack comes back.
  var announced = false;
  function announce() {
    if (announced) return;
    announced = true;
    send({ type: 'typecad/ready' });
  }
  announce();
  window.addEventListener('load', announce);

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m) return;
    // host-side status notices: the extension posts these while it re-renders
    // after a build (the page keeps showing the old board until the new HTML
    // lands, which reloads and resets this element)
    if (m.type === 'typecad/status') {
      notice(m.text || '');
      return;
    }
    if (m.type !== 'typecad/select' || !m.ref) return;
    if (!window.typecadViewer) {
      // host retries until this succeeds — say so instead of staying silent
      status(m.ref + ' — received, waiting for viewer…');
      return;
    }
    var found = window.typecadViewer.highlightNet('data-ref', m.ref);
    window.typecadViewer.searchRefs(m.ref);
    status(m.ref + ' — from editor (click empty space to clear)');
    remember(found ? m.ref : null);
    send({ type: 'typecad/ack', ref: m.ref, token: m.token, found: found });
  });

  var svg = document.getElementById('board');
  if (svg) {
    // a plain click on empty space clears the saved highlight (matching the
    // viewer's own affordance) — but never probes: the source jump is a
    // DOUBLE click, so single clicks (including every ruler point of the
    // measure tool) stay inside the viewer and cannot steal editor focus
    svg.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-ref]') : null;
      if (!el) remember(null); // empty-space click cleared the highlight
    }, true);
    svg.addEventListener('dblclick', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-ref]') : null;
      if (el) {
        send({ type: 'typecad/probe', ref: el.getAttribute('data-ref'), pin: el.getAttribute('data-pin') });
        return;
      }
      // no component under the cursor: a double-click on a trace reveals the
      // line that declared its net/route — the location resolves HERE (the
      // client owns the net->source map), the host only reveals it
      var netEl = ev.target.closest ? ev.target.closest('[data-net]') : null;
      if (netEl) {
        var net = netEl.getAttribute('data-net');
        send({ type: 'typecad/probe-net', net: net, source: window.typecadNetSource(net) || undefined });
      }
    }, true);
  }
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') remember(null);
  });

  // Highlight memory lives HERE, not in the host: the highlighted ref is
  // remembered while it is active, forgotten the moment it is cleared
  // (empty-space click, Escape), and re-applied after a board-change reload —
  // without zooming, since the saved viewport already puts the view back.
  var HKEY = 'typecad-probe:' + document.title;
  function remember(ref) {
    try {
      if (ref) localStorage.setItem(HKEY, ref);
      else localStorage.removeItem(HKEY);
    } catch (e) {}
  }
  (function reapplySavedHighlight() {
    try {
      var saved = localStorage.getItem(HKEY);
      if (!saved || !window.typecadViewer) return;
      // NB: this lives in a template literal — each emitted backslash needs
      // two in source, so the class "quote or backslash" is ["\\\\] here.
      var safe = saved.replace(/["\\\\]/g, '');
      if (safe && svg.querySelector('[data-ref="' + safe + '"]')) {
        window.typecadViewer.highlightNet('data-ref', safe);
        status(safe + ' — highlighted');
      }
    } catch (e) {}
  })();
})();
</script>`;
/**
 * Embed component outlines + the client script into a generated viewer HTML,
 * locked down with a nonce Content-Security-Policy. Missing anchors leave the
 * HTML untouched (injected: false) — the viewer still works, it just
 * cross-probes nothing.
 *
 * The artifact is self-contained local content (inline SVG/CSS/JS, no
 * network, no images), so `default-src 'none'` plus `'unsafe-inline'` styles
 * and a per-page nonce for scripts is the whole policy. A nonce (rather than
 * script-src 'unsafe-inline') keeps any script that ever lands in the
 * generated output from running inside the trusted webview, while
 * acquireVsCodeApi and the message transport are unaffected — they are
 * provided by VS Code's bootstrap outside the document's script-src.
 */
function injectProbeClient(html, components, nets = []) {
    const headOpen = html.indexOf('<head>');
    const bodyClose = html.lastIndexOf('</body>');
    if (headOpen === -1 || bodyClose === -1)
        return { html, injected: false };
    const nonce = (0, node_crypto_1.randomUUID)().replace(/-/g, '');
    const dataTag = `<script id="typecad-probe-data" type="application/json">${JSON.stringify({
        components: outlineData(components),
        nets,
    }).replace(/</g, '\\u003c')}</script>`;
    const body = html.slice(headOpen + '<head>'.length, bodyClose) + dataTag + PROBE_CLIENT + html.slice(bodyClose);
    // Nonce every script opening tag — the viewer's own inline scripts and the
    // probe client alike (the non-executing type="application/json" data island
    // picking up a nonce too is harmless). (?= looks past the tag name so
    // `</script>` is never touched.)
    const nonced = body.replace(/<script(?=[\s>])/gi, () => `<script nonce="${nonce}"`);
    const csp = '<head>' +
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">` +
        nonced;
    return { html: html.slice(0, headOpen) + csp, injected: true };
}
//# sourceMappingURL=probeClient.js.map