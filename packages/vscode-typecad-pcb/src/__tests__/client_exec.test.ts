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
<svg id="board" viewBox="0 0 100 100"><g id="panzoom"><g id="yflip"><use data-ref="R1" data-pin="1" x="10" y="-20" href="#a"/></g><g id="measure"></g><g id="drc"></g><g id="typecad-probe"></g></g></svg>
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

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'typecad/select', ref: 'R1', token: 1 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toContainEqual({ type: 'typecad/ack', ref: 'R1', token: 1, found: true });

    // highlight is remembered; the reload that follows re-applies it
    expect(w.localStorage.getItem('typecad-probe:t')).toBe('R1');

    // clear via Escape → forgotten → must not resurrect on reload
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.localStorage.getItem('typecad-probe:t')).toBeNull();
  });

  it('does not probe while the measure tool is armed — ruler clicks stay in the viewer', async () => {
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
    const click = () => pad.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    // measure tool armed (the viewer toggles this class): click = ruler point
    w.document.getElementById('btn-measure')!.classList.add('armed');
    click();
    expect(sent.filter((m) => (m as { type: string }).type === 'typecad/probe')).toHaveLength(0);

    // disarmed: click = probe → source jump
    w.document.getElementById('btn-measure')!.classList.remove('armed');
    click();
    expect(sent).toContainEqual({ type: 'typecad/probe', ref: 'R1', pin: '1' });
  });
});
