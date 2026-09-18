// ---------------------------------------------------------------------------
// The injected client is a JS string inside a TS template literal — escaping
// mistakes (a regex that needs "\\\\" to emit "\\") compile fine and only
// explode as page SyntaxErrors that kill every script on the page. These
// tests execute the actual injected HTML: parse every script, then boot the
// page in jsdom and drive the full handshake.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectProbeClient } from '../probeClient.js';
import type { ComponentSummary } from '../types.js';

const components: ComponentSummary[] = [
  {
    reference: 'R1',
    value: '1k',
    footprint: 'R',
    variable: 'r1',
    side: 'front',
    at: { x: 10, y: 20, rotation: 90 },
    dimensions: { width: 1, height: 0.5 },
    padCount: 2,
  },
];

// A minimal viewer page with the anchors the client expects — enough shape
// for the client to run; the viewer's own script is exercised by the pcb
// package's tests, not here.
const viewerPage = `<!DOCTYPE html><html><head><title>t</title></head><body>
<svg id="board" viewBox="0 0 100 100"><g id="panzoom"><g id="yflip"><use data-ref="R1" data-pin="1" x="10" y="-20" href="#a"/><path data-net="net2" d="M1 2"/></g><g id="measure"></g><g id="drc"></g><g id="typecad-probe"></g></g></svg>
<button id="btn-measure"></button>
<div id="status"></div>
<script>window.typecadViewer = { highlightNet: function(){return true;}, searchRefs: function(){return true;}, clearNetHighlight: function(){} };</script>
</body></html>`;

describe('injected client executes', () => {
  it('every inline script parses (escaping bugs become page SyntaxErrors)', () => {
    const { html } = injectProbeClient(viewerPage, components);
    const scripts = [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('boots, draws outlines, and handshakes a selection end-to-end', async () => {
    const sent: unknown[] = [];
    const { html } = injectProbeClient(viewerPage, components);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/viewer.html',
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => sent.push(m),
          getState: () => ({}),
          setState: () => {},
        });
      },
    });
    const w = dom.window;
    await new Promise((r) => setTimeout(r, 50));

    expect(sent).toContainEqual({ type: 'typecad/ready' });
    expect(w.document.querySelectorAll('#typecad-probe .typecad-outline').length).toBe(1);

    // the hover readout's ref -> source-variable lookup is installed
    expect(typeof w.typecadVarFor).toBe('function');
    expect(w.typecadVarFor('R1')).toBe('r1');
    expect(w.typecadVarFor('ZZ9')).toBe('');

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select', ref: 'R1', token: 1 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toContainEqual({ type: 'typecad/ack', ref: 'R1', token: 1, found: true });

    // highlight is remembered; the reload that follows re-applies it
    expect(w.localStorage.getItem('typecad-probe:t')).toBe('R1');

    // clear via Escape → forgotten → must not resurrect on reload
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.localStorage.getItem('typecad-probe:t')).toBeNull();
  });

  it('host status notices lock the status text until cleared', async () => {
    const sent: unknown[] = [];
    const { html } = injectProbeClient(viewerPage, components);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/viewer.html',
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => sent.push(m),
          getState: () => ({}),
          setState: () => {},
        });
      },
    });
    const w = dom.window;
    await new Promise((r) => setTimeout(r, 50));
    const el = () => w.document.getElementById('status')!;
    const text = () => el().textContent;

    // the extension posts this while it re-renders after a build — it locks
    // the readout so the viewer's mouse-move coordinates cannot overwrite it
    w.dispatchEvent(
      new w.MessageEvent('message', { data: { type: 'typecad/status', text: 'board changed — generating new render…' } }),
    );
    expect(text()).toBe('board changed — generating new render…');
    expect(el().hasAttribute('data-locked')).toBe(true);

    // while locked, a selection's status write stands down (the highlight
    // itself still applies — only the text is suppressed)
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select', ref: 'R1', token: 2 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(text()).toBe('board changed — generating new render…');
    expect(sent).toContainEqual({ type: 'typecad/ack', ref: 'R1', token: 2, found: true });

    // normally the page reload clears this; the no-reload outcome clears it
    // by hand — unlocked, normal operation resumes
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/status', text: '' } }));
    expect(text()).toBe('');
    expect(el().hasAttribute('data-locked')).toBe(false);

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select', ref: 'R1', token: 3 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(text()).toContain('R1');
  });

  it('highlights a net from a host selection and acks the delivery', async () => {
    const sent: unknown[] = [];
    const { html } = injectProbeClient(viewerPage, components);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/viewer.html',
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => sent.push(m),
          getState: () => ({}),
          setState: () => {},
        });
      },
    });
    const w = dom.window;
    await new Promise((r) => setTimeout(r, 50));

    // spy on the viewer seam the net selection rides on
    const calls: Array<[string, string]> = [];
    (w as unknown as { typecadViewer: { highlightNet: (attr: string, val: string) => boolean } }).typecadViewer.highlightNet = function (
      attr: string,
      val: string,
    ) {
      calls.push([attr, val]);
      return true;
    };

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select-net', net: 'net2', token: 7 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toContainEqual(['data-net', 'net2']);
    expect(sent).toContainEqual({ type: 'typecad/ack', ref: 'net:net2', token: 7, found: true });
    expect(w.document.getElementById('status')!.textContent).toContain('net2');
  });

  it('resolves trace hovers and double-clicks to the declaring net source', async () => {
    const sent: unknown[] = [];
    const { html } = injectProbeClient(viewerPage, components, [
      { name: 'net2', source: 'src/board.ts:82', routeSource: 'src/board.ts:83' },
    ]);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/viewer.html',
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => sent.push(m),
          getState: () => ({}),
          setState: () => {},
        });
      },
    });
    const w = dom.window;
    await new Promise((r) => setTimeout(r, 50));

    // the trace-hover lookup prefers the route source (traces come from it)
    expect(typeof w.typecadNetSource).toBe('function');
    expect(w.typecadNetSource('net2')).toBe('src/board.ts:83');
    expect(w.typecadNetSource('unknown')).toBe('');

    // double-click on a trace (no component under the cursor) carries the
    // resolved location — the host only has to reveal it
    const trace = w.document.querySelector('[data-net="net2"]')!;
    trace.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toContainEqual({ type: 'typecad/probe-net', net: 'net2', source: 'src/board.ts:83' });
  });

  it('probes to source on double click only — single clicks stay in the viewer', async () => {
    const sent: unknown[] = [];
    const { html } = injectProbeClient(viewerPage, components);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/viewer.html',
      beforeParse(window) {
        window.acquireVsCodeApi = () => ({
          postMessage: (m: unknown) => sent.push(m),
          getState: () => ({}),
          setState: () => {},
        });
      },
    });
    const w = dom.window;
    await new Promise((r) => setTimeout(r, 50));
    const pad = w.document.querySelector('[data-ref="R1"]')!;
    const fire = (type: string) => pad.dispatchEvent(new w.MouseEvent(type, { bubbles: true }));
    const probes = () => sent.filter((m) => (m as { type: string }).type === 'typecad/probe');

    // single clicks NEVER probe — not on components, not with the measure
    // tool armed: every single click (ruler points included) stays in the
    // viewer and cannot steal editor focus
    fire('click');
    w.document.getElementById('btn-measure')!.classList.add('armed');
    fire('click');
    expect(probes()).toHaveLength(0);

    // double click on a component = probe → source jump
    fire('dblclick');
    expect(probes()).toEqual([{ type: 'typecad/probe', ref: 'R1', pin: '1' }]);
  });
});
