import { describe, it, expect } from 'vitest';
import { injectProbeClient, outlineData } from '../probeClient.js';
import type { ComponentSummary } from '../types.js';

const components: ComponentSummary[] = [
  {
    reference: 'R1',
    value: '1kohm',
    footprint: 'R_0402',
    variable: 'r1',
    side: 'front',
    at: { x: 137.4, y: 90.9, rotation: 90 },
    dimensions: { width: 1, height: 0.5 },
    padCount: 2,
  },
  {
    reference: 'TP1',
    value: 'test',
    footprint: 'TestPoint',
    side: 'front',
    at: { x: 10, y: 10, rotation: 0 },
    dimensions: null,
    padCount: 1,
  },
];

const viewerHtml = '<!DOCTYPE html><html><head><title>t</title></head><body><svg id="board"></svg></body></html>';

describe('outlineData', () => {
  it('keeps components with measurable dimensions, drops the rest', () => {
    const data = outlineData(components);
    expect(data).toEqual([{ ref: 'R1', var: 'r1', x: 137.4, y: 90.9, w: 1, h: 0.5, rot: 90 }]);
  });
});

describe('injectProbeClient', () => {
  it('injects outline data and the client before </body>', () => {
    const { html, injected } = injectProbeClient(viewerHtml, components);
    expect(injected).toBe(true);
    expect(html).toContain('id="typecad-probe-data"');
    expect(html).toContain('"ref":"R1"');
    expect(html).toContain('acquireVsCodeApi');
    expect(html).toContain("typecadViewer.highlightNet('data-ref', m.ref)");
    expect(html.lastIndexOf('typecad-probe-data')).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('installs the layout-apply bridge the viewer buttons into', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    expect(html).toContain('window.typecadLayoutApply = function (moves, texts, values, labels, renames, routes, deletes, cb)');
    expect(html).toContain('labels: labels || [],');
    expect(html).toContain("m.type === 'typecad/layout-status'");
  });

  it('embeds net source provenance in the data island', () => {
    const { html } = injectProbeClient(viewerHtml, components, [
      { name: 'net2', source: 'src/board.ts:82', routeSource: 'src/board.ts:83' },
    ]);
    expect(html).toContain('"nets":');
    expect(html).toContain('"name":"net2"');
    expect(html).toContain('"routeSource":"src/board.ts:83"');
  });

  it('locks the page down with a nonce CSP and nonces every script', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    expect(meta).not.toBeNull();
    expect(meta![1]).toContain("default-src 'none'");
    expect(meta![1]).toMatch(/script-src 'nonce-([0-9a-f]+)'/);
    const nonce = meta![1].match(/'nonce-([0-9a-f]+)'/)![1];
    // every script opening tag carries it — the viewer's own inline scripts,
    // the probe client, and the JSON data island alike — so a script that
    // ever lands in the generated output without it can never run
    expect(html).not.toMatch(new RegExp(`<script(?! nonce="${nonce}")`));
    // …and closing tags were left alone
    expect(html).toContain('</script>');
  });

  it('generates a fresh nonce per page (two injections differ)', () => {
    const a = injectProbeClient(viewerHtml, components).html;
    const b = injectProbeClient(viewerHtml, components).html;
    const nonceOf = (h: string) => h.match(/'nonce-([0-9a-f]+)'/)![1];
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  it('places outlines via x/y geometry, not translate (getBBox ignores transforms)', () => {
    // The viewer's zoom-to-component fits on getBBox(), which ignores the
    // element's own transform: a translate-placed rect reads as a speck at
    // the board origin and "zoom to component" fits the whole board instead.
    const { html } = injectProbeClient(viewerHtml, components);
    expect(html).toContain("rect.setAttribute('x', String(c.x - c.w / 2))");
    expect(html).toContain("rect.setAttribute('y', String(-c.y - c.h / 2))");
    expect(html).toContain("'rotate(' + c.rot + ',' + c.x + ',' + -c.y + ')'");
    expect(html).not.toContain("translate(' + c.x");
  });

  it('acks selections so the host can stop retrying delivery', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    expect(html).toContain("type: 'typecad/ack'");
    expect(html).toContain('token: m.token');
  });

  it('announces readiness at parse and on load (delivery retry backstop)', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    expect(html).toContain("send({ type: 'typecad/ready' })");
    expect(html).toContain("window.addEventListener('load', announce)");
  });

  it('shows the selection in the viewer status bar', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    expect(html).toContain('from editor (click empty space to clear)');
  });

  it('keeps highlight memory in the page: set on select, cleared on clear, re-applied on reload', () => {
    const { html } = injectProbeClient(viewerHtml, components);
    // selected → remembered; empty-space click / Escape → forgotten; a
    // cleared highlight must not resurrect on the next board refresh
    expect(html).toContain('remember(found ? m.ref : null)');
    expect(html).toContain('remember(null); // empty-space click cleared the highlight');
    expect(html).toContain("if (ev.key === 'Escape') remember(null)");
    // boot re-apply highlights only — the saved viewport owns the zoom
    expect(html).toContain('reapplySavedHighlight');
    expect(html).toMatch(/reapplySavedHighlight[\s\S]*highlightNet\(\'data-ref\', safe\)/);
    expect(html).not.toContain('m.restore');
  });

  it('escapes < in embedded JSON so no script can break out', () => {
    const hostile: ComponentSummary[] = [
      {
        ...components[0],
        reference: 'R1</script><script>alert(1)</script>',
      },
    ];
    const { html } = injectProbeClient(viewerHtml, hostile);
    expect(html).toContain('u003c/script>');
    expect((html.match(/<script>alert/g) ?? []).length).toBe(0);
  });

  it('leaves the HTML untouched when anchors are missing', () => {
    const { html, injected } = injectProbeClient('<p>not the viewer</p>', components);
    expect(injected).toBe(false);
    expect(html).toBe('<p>not the viewer</p>');
  });
});
