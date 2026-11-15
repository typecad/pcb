"use strict";
// ---------------------------------------------------------------------------
// Cross-probe client injected into the gerber-viewer HTML when it is shown in
// a vscode webview.
//
// Two directions:
//  - editor → board: the extension posts {type:'typecad/select', ref} (or
//    {type:'typecad/select-net', net}); the client calls the viewer's own
//    window.typecadViewer API (highlight + zoom/flash) so selection looks
//    identical to in-viewer search.
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
exports.PROBE_PROTO = void 0;
exports.outlineData = outlineData;
exports.applyNoncePolicy = applyNoncePolicy;
exports.injectProbeClient = injectProbeClient;
const node_crypto_1 = require("node:crypto");
/**
 * Protocol version of the injected probe client. The client is injected
 * fresh into every page by the host, so it normally matches — a ready
 * message carrying a different proto means the page's client came from
 * somewhere else (an out-of-band page, a stale asset) and its interactions
 * cannot be assumed. Bump when a host↔client message changes shape.
 */
exports.PROBE_PROTO = 1;
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
  // render, which starts with a fresh, unlocked element. The lock carries a
  // timestamp: if the promised render never comes (the rebuild chain
  // stalled), the page reclaims the line once the notice goes stale.
  function notice(text) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text;
    if (text) {
      el.setAttribute('data-locked', '');
      el.setAttribute('data-locked-at', String(Date.now()));
    } else {
      el.removeAttribute('data-locked');
      el.removeAttribute('data-locked-at');
    }
  }

  var style = document.createElement('style');
  style.textContent =
    // the outline is the clickable body only — it paints NOTHING, not even
    // on hover (the crosshair cursor is the affordance; selection and
    // highlighting are the only visible feedback)
    '#typecad-probe .typecad-outline{fill:var(--sel, #ffffff);fill-opacity:0;stroke:var(--sel, #ffffff);stroke-opacity:0;' +
    'stroke-width:1.5;vector-effect:non-scaling-stroke;pointer-events:all;cursor:crosshair}';
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
  // generic page->host diagnostics channel: the page self-reports render
  // health where the eye can't reach (a webview that paints nothing while
  // every DOM probe says "visible" needs eyes inside the renderer)
  window.typecadReport = function (data) { send({ type: 'typecad/report', data: data }); };

  // Announce readiness at parse time AND on load — the host retries any
  // selection dropped before this until the matching ack comes back. The
  // announcement carries the client's protocol version and what the PAGE
  // provided at boot, so the host can diagnose an old page instead of
  // serving dead clicks.
  var announced = false;
  function announce() {
    if (announced) return;
    announced = true;
    send({
      type: 'typecad/ready',
      proto: ${exports.PROBE_PROTO},
      page: { viewer: !!window.typecadViewer },
    });
  }
  announce();
  window.addEventListener('load', announce);

  // Layout view: the page hands moved-component deltas to the host, which
  // edits the placement literals, rebuilds, and regenerates this viewer.
  // The board stamp rides along: the host embeds the mtime of the board it
  // generated this page from, and compares at apply time — a page whose
  // board has since been rebuilt (auto-build, external edit) is a stale
  // view, and its edits must not splice into a source that moved on
  var layoutCb = null;
  window.typecadLayoutApply = function (moves, texts, values, labels, renames, routes, deletes, partDeletes, zones, outline, cb) {
    // the callback is always the last argument the CALLER passed — older
    // pages send fewer zones-less payloads, so probe the tail, not a slot
    var cbArg = null;
    for (var i = arguments.length - 1; i >= 1; i--) {
      if (typeof arguments[i] === 'function') {
        cbArg = arguments[i];
        break;
      }
    }
    layoutCb =
      cbArg ||
      (typeof partDeletes === 'function'
        ? partDeletes
        : typeof deletes === 'function'
          ? deletes
          : typeof routes === 'function'
            ? routes
            : null);
    var stamp = document.querySelector('meta[name="tc-viewer-board"]');
    send({
      type: 'typecad/layout-rebuild',
      board: stamp ? stamp.getAttribute('content') : null,
      moves: moves,
      texts: texts || [],
      values: values || [],
      labels: labels || [],
      renames: renames || [],
      routes: Array.isArray(routes) ? routes : [],
      deletes: Array.isArray(deletes) ? deletes : [],
      partDeletes: Array.isArray(partDeletes) ? partDeletes : [],
      zones: Array.isArray(zones) ? zones : [],
      outline: outline && typeof outline === 'object' ? outline : null,
      zoneEdits: Array.isArray(arguments[10]) ? arguments[10] : [],
      zoneDeletes: Array.isArray(arguments[11]) ? arguments[11] : [],
      images: Array.isArray(arguments[12]) ? arguments[12] : [],
      imageEdits: Array.isArray(arguments[13]) ? arguments[13] : [],
      imageDeletes: Array.isArray(arguments[14]) ? arguments[14] : [],
      classEdits: Array.isArray(arguments[15]) ? arguments[15] : [],
      textDeletes: Array.isArray(arguments[16]) ? arguments[16] : [],
    });
  };

  // artwork placement: the page asks the host to open the PNG picker (a
  // webview cannot), and the host answers with the picked file — its bytes
  // as a data URL for the on-canvas ghost, plus the absolute path the apply
  // copies into the project's art/ folder
  window.typecadPickImage = function () {
    send({ type: 'typecad/pick-image' });
  };

  // the revert dialog's OK: the page has already reset its own session;
  // the host re-serves the page so the webview reloads to the board as the
  // source renders it — a true refresh, not just an in-page reset
  window.typecadRefresh = function () {
    send({ type: 'typecad/layout-refresh' });
  };

  // deferred views: the page asks the host to render one lazy view part
  // (pcba/blueprint/schematic) or solve the ngspice operating point (the
  // part named 'net-op'); the host answers with the mountable fragment or
  // the op object. The page shows its "calculating X…" spinner the whole
  // time — this is what keeps those renders off every board change.
  var viewPartCbs = {};
  window.typecadViewPart = function (part, cb) {
    viewPartCbs[part] = cb;
    send({ type: 'typecad/view-part', part: part });
  };

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m) return;
    if (m.type === 'typecad/layout-status') {
      if (layoutCb) layoutCb(m.error);
      layoutCb = null;
      return;
    }
    if (m.type === 'typecad/view-part') {
      var vcb = viewPartCbs[m.part];
      delete viewPartCbs[m.part];
      if (typeof vcb === 'function')
        vcb(m.error ? new Error(m.error) : null, m.html || null, m.op || null);
      return;
    }
    // the host's answer to a place-image arm: hand the picked PNG to the
    // page's ghost-preview hook (absent on old pages — nothing to do)
    if (m.type === 'typecad/image-picked') {
      if (typeof window.typecadImagePicked === 'function') window.typecadImagePicked(m);
      return;
    }
    // host-side status notices: the extension posts these while it re-renders
    // after a build (the page keeps showing the old board until the new HTML
    // lands, which reloads and resets this element)
    if (m.type === 'typecad/status') {
      notice(m.text || '');
      return;
    }
    // editor → board, net flavor: highlight the net's traces through the
    // same highlightNet seam ref selection uses; acks key on "net:<name>"
    // so the host's delivery loop treats it like any other selection
    if (m.type === 'typecad/select-net') {
      if (!m.net) return;
      if (!window.typecadViewer) {
        status(m.net + ' — received, waiting for viewer…');
        return;
      }
      var netFound = window.typecadViewer.highlightNet('data-net', m.net);
      status(m.net + ' — from editor (click empty space to clear)');
      send({ type: 'typecad/ack', ref: 'net:' + m.net, token: m.token, found: netFound });
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
    // the measure tool's click-points are board work, not probes: while its
    // button is armed (the viewer toggles #btn-measure's class), board
    // clicks must neither clear the saved highlight nor — as a fast pair on
    // one spot, which the browser reports as a double-click — jump the
    // editor to source under the just-stuck ruler
    function measureArmed() {
      var b = document.getElementById('btn-measure');
      return !!(b && b.classList.contains('armed'));
    }
    // a plain click on empty space clears the saved highlight (matching the
    // viewer's own affordance) — but never probes: the source jump is a
    // DOUBLE click, so single clicks (including every ruler point of the
    // measure tool) stay inside the viewer and cannot steal editor focus
    svg.addEventListener('click', function (ev) {
      if (measureArmed()) return;
      var el = ev.target.closest ? ev.target.closest('[data-ref]') : null;
      if (!el) remember(null); // empty-space click cleared the highlight
    }, true);
    // source probing moved to ENTER on the probed component: a click or
    // hover records the reference, Enter jumps — a double-click on a part
    // body is a layout gesture (drag, select), not a navigation command
    var probedRef = null;
    svg.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-ref]') : null;
      probedRef = el ? el.getAttribute('data-ref') : null;
    }, true);
    // source probing moved to ENTER on the probed component: clicking (or
    // the host's cross-probe selection) records the reference, Enter jumps.
    // A double-click on a part body is a layout gesture (drag, select,
    // value edit), not navigation — and an ACTIVE route still owns the
    // double-click (it finishes the track)
    svg.addEventListener('dblclick', function (ev) {
      if (measureArmed()) return;
      if (
        document.body.classList.contains('typecad-layout') &&
        window.typecadRoutingActive &&
        window.typecadRoutingActive()
      )
        return;
    }, true);
    // remember what is under the cursor (hover) and on click — component
    // (ref+pin via the pad manifest) or trace (net) — Enter navigates to
    // whichever was probed last, exactly like KiCad's probe-then-Enter
    var probedPin = null;
    var probedNet;
    var probeRecord = function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var padHit = window.typecadPadProbe ? window.typecadPadProbe(ev.clientX, ev.clientY) : null;
      if (padHit) {
        probedRef = padHit.ref;
        probedPin = String(padHit.pin);
        probedNet = undefined;
        return;
      }
      var el = t.closest('[data-ref]');
      if (el) {
        probedRef = el.getAttribute('data-ref');
        probedPin = el.getAttribute('data-pin') || undefined;
        probedNet = undefined;
        return;
      }
      var netEl = t.closest('[data-net]');
      if (netEl) {
        var net = netEl.getAttribute('data-net');
        if (net && net !== 'N/C') {
          probedRef = null;
          probedPin = undefined;
          probedNet = net;
        }
      }
    };
    svg.addEventListener('mousemove', function (ev) {
      if (measureArmed()) return;
      probeRecord(ev);
    }, true);
    svg.addEventListener('click', function (ev) {
      probeRecord(ev);
    }, true);
    window.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      if (!probedRef && !probedNet) return;
      // typing belongs to an open editor, never to the canvas
      var t = ev.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio') || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // an ACTIVE route owns Enter (it finishes the track)
      if (
        document.body.classList.contains('typecad-layout') &&
        window.typecadRoutingActive &&
        window.typecadRoutingActive()
      )
        return;
      // a SELECTED zone outranks the hover probe — clicking it (or Tab
      // cycling to it) was an explicit act, and its selection outlasts the
      // gesture like the E and Del affordances; Enter goes to its zone()
      // definition, not whatever copper the cursor last crossed
      var selZone = window.typecadSelectedZone ? window.typecadSelectedZone() : null;
      if (selZone) {
        send({ type: 'typecad/probe-zone', zone: selZone });
        return;
      }
      if (probedRef) {
        send({ type: 'typecad/probe', ref: probedRef, pin: probedPin });
        return;
      }
      // a SELECTED segment probes the TrackBuilder chain that drew it (the
      // host matches the geometry to a source .to line); a bare highlighted
      // net probes the net's declaration
      var segs = window.typecadSelectedSegments ? window.typecadSelectedSegments() : [];
      send({
        type: 'typecad/probe-net',
        net: probedNet,
        source: window.typecadNetSource(probedNet) || undefined,
        segs: segs && segs.length ? segs : undefined,
      });
    });
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
 * Nonce every script tag and prepend the matching Content-Security-Policy
 * meta to a generated page (null when it has no <head> anchor — the caller
 * degrades to the unmodified page). Shared by the Board viewer and diff
 * panel injections so neither webview ever needs script-src 'unsafe-inline'.
 *
 * The artifacts are self-contained local content (inline SVG/CSS/JS, no
 * network), so `default-src 'none'` plus `'unsafe-inline'` styles, a
 * per-page nonce for scripts, and `img-src data: blob:` for the PNG export's
 * rasterization step (it loads the serialized SVG through a data: URL —
 * without the directive, default-src 'none' blocks the image and the export
 * dies with "could not be rasterized") is the whole policy. A nonce (rather
 * than script-src 'unsafe-inline') keeps any script that ever lands in the
 * generated output from running inside the trusted webview, while
 * acquireVsCodeApi and the message transport are unaffected — they are
 * provided by VS Code's bootstrap outside the document's script-src.
 */
function applyNoncePolicy(html) {
    const headOpen = html.indexOf('<head>');
    if (headOpen === -1)
        return null;
    const nonce = (0, node_crypto_1.randomUUID)().replace(/-/g, '');
    // Nonce every script opening tag — inline page scripts and injected
    // clients alike (a non-executing type="application/json" data island
    // picking up a nonce too is harmless). (?= looks past the tag name so
    // `</script>` is never touched.)
    const nonced = html
        .slice(headOpen + '<head>'.length)
        .replace(/<script(?=[\s>])/gi, () => `<script nonce="${nonce}"`);
    return (html.slice(0, headOpen) +
        '<head>' +
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">` +
        nonced);
}
/**
 * Embed component outlines + the client script into a generated viewer HTML,
 * locked down with applyNoncePolicy's CSP. Missing anchors leave the HTML
 * untouched (injected: false) — the viewer still works, it just cross-probes
 * nothing.
 */
function injectProbeClient(html, components, nets = [], boardMtimeMs) {
    if (html.indexOf('<head>') === -1 || html.lastIndexOf('</body>') === -1)
        return { html, injected: false };
    // the board identity this page renders — the apply bridge reports it
    // back so the host can refuse edits made against a superseded board
    const boardTag = boardMtimeMs !== undefined ? `<meta name="tc-viewer-board" content="${boardMtimeMs}">` : '';
    const headClose = html.indexOf('</head>');
    const stamped = boardTag && headClose !== -1 ? html.slice(0, headClose) + boardTag + html.slice(headClose) : html;
    // offsets MUST be recomputed on `stamped` — the meta insertion shifts
    // everything after </head>, and slicing at the pre-insertion offset cuts
    // into live content (seen as a chunk of this client rendered as page
    // text with every handler dead)
    const bodyClose = stamped.lastIndexOf('</body>');
    const dataTag = `<script id="typecad-probe-data" type="application/json">${JSON.stringify({
        components: outlineData(components),
        nets,
    }).replace(/</g, '\\u003c')}</script>`;
    const withClient = stamped.slice(0, bodyClose) + dataTag + PROBE_CLIENT + stamped.slice(bodyClose);
    // <head> was just verified — the policy always applies here
    return { html: applyNoncePolicy(withClient), injected: true };
}
//# sourceMappingURL=probeClient.js.map