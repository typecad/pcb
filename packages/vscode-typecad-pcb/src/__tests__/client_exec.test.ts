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

    // ready carries the probe-client protocol stamp and the page's boot
    // capabilities (the fixture page provides typecadViewer)
    expect(sent).toContainEqual({ type: 'typecad/ready', proto: 1, page: { viewer: true } });
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
    // the lock carries a timestamp — the page reclaims the line if the
    // promised render never comes (stalled rebuild chain)
    expect(Number(el().getAttribute('data-locked-at'))).toBeGreaterThan(0);

    // while locked, a selection's status write stands down (the highlight
    // itself still applies — only the text is suppressed)
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select', ref: 'R1', token: 2 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(text()).toBe('board changed — generating new render…');
    expect(sent).toContainEqual({ type: 'typecad/ack', ref: 'R1', token: 2, found: true });

    // normally the page reload clears this; the no-reload outcome clears it
    // by hand — unlocked, timestamp gone, normal operation resumes
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/status', text: '' } }));
    expect(text()).toBe('');
    expect(el().hasAttribute('data-locked')).toBe(false);
    expect(el().hasAttribute('data-locked-at')).toBe(false);

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

  it('resolves trace navigation to the declaring net source (Enter on the probed trace)', async () => {
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

    // hovering the trace records it; Enter navigates to the declaring line
    const trace = w.document.querySelector('[data-net="net2"]')!;
    trace.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true }));
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toContainEqual({ type: 'typecad/probe-net', net: 'net2', source: 'src/board.ts:83' });
  });

  it('probes to source on Enter only — single clicks stay in the viewer', async () => {
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

    // single clicks NEVER probe — they only record the reference
    fire('click');
    expect(probes()).toHaveLength(0);
    w.document.getElementById('btn-measure')!.classList.add('armed');
    fire('click');
    expect(probes()).toHaveLength(0);

    // Enter navigates: the recorded component jumps to its source line
    w.document.getElementById('btn-measure')!.classList.remove('armed');
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(probes()).toEqual([{ type: 'typecad/probe', ref: 'R1', pin: '1' }]);
  });

  it('Enter on a selected zone probes the zone definition, out-ranking the hover probe', async () => {
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
    // the real page exposes the selected zone from its boardZoneSel; install
    // it AFTER hovering a component so the zone must out-rank the hover
    const pad = w.document.querySelector('[data-ref="R1"]')!;
    pad.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true }));
    (w as unknown as { typecadSelectedZone: unknown }).typecadSelectedZone = () => ({
      net: 'GND',
      layer: 'F.Cu',
      keepout: false,
      pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
    });
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    const zoneProbes = sent.filter((m) => (m as { type: string }).type === 'typecad/probe-zone');
    expect(zoneProbes).toHaveLength(1);
    expect((zoneProbes[0] as { zone: { net: string } }).zone.net).toBe('GND');
    // the hovered component did NOT win the Enter
    expect(sent.filter((m) => (m as { type: string }).type === 'typecad/probe')).toHaveLength(0);
    // a cleared selection (null) lets the hover probe take over again
    (w as unknown as { typecadSelectedZone: unknown }).typecadSelectedZone = () => null;
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.filter((m) => (m as { type: string }).type === 'typecad/probe')).toHaveLength(1);
  });
});

describe('injectProbeClient with a board stamp', () => {
  // regression: the meta insertion into <head> shifted the page, and the
  // </body> offset (computed on the pre-insertion html) then sliced into
  // live content — a chunk of the client rendered as page text and every
  // handler died (no view switching, theme, buttons, or status bar)
  it('stamping keeps the document intact: meta present, one </body>, tail well-formed, scripts parse', () => {
    const { html } = injectProbeClient(viewerPage, components, [], 1790717857618.375);
    expect(html).toContain('<meta name="tc-viewer-board" content="1790717857857618.375"' === 'x' ? '' || html : '');
    expect(html).toMatch(/<meta name="tc-viewer-board" content="1790717857618\.375">/);
    expect(html.endsWith('</body></html>') || html.endsWith('</body>\n</html>')).toBe(true);
    // the tail of the injected client must sit INSIDE a script, never as text
    expect(html.indexOf('clearNetHighlight')).toBeGreaterThan(html.lastIndexOf('<script>'));
    const scripts = [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
  });
});

describe('view-part bridge (deferred views)', () => {
  it('typecadViewPart asks the host and delivers the reply to the page callback', async () => {
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
    expect(typeof w.typecadViewPart).toBe('function');

    const got = new Promise<unknown[]>((resolve) => {
      (w as unknown as { typecadViewPart: (p: string, cb: (...a: unknown[]) => void) => void }).typecadViewPart(
        'pcba',
        (...args: unknown[]) => resolve(args),
      );
    });
    expect(sent).toContainEqual({ type: 'typecad/view-part', part: 'pcba' });
    // the host answers with the mountable fragment
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/view-part', part: 'pcba', html: '<g id="view-pcba"></g>' } }));
    const [err, frag, op] = (await got) as [null, string, null];
    expect(err).toBeNull();
    expect(frag).toBe('<g id="view-pcba"></g>');
    expect(op).toBeNull();

    // an erroring host reply reaches the callback as an Error
    const gotErr = new Promise<unknown>((resolve) => {
      (w as unknown as { typecadViewPart: (p: string, cb: (...a: unknown[]) => void) => void }).typecadViewPart(
        'net-op',
        (...args: unknown[]) => resolve(args[0]),
      );
    });
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/view-part', part: 'net-op', error: 'ngspice missing' } }));
    expect(((await gotErr) as Error).message).toBe('ngspice missing');
  });
});
