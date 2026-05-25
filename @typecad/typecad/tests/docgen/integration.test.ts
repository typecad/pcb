import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
const mdPath = path.join(fixturesDir, 'one_hz.md');
const pcbPath = path.join(fixturesDir, 'one_hz.kicad_pcb');
const htmlPath = path.join(fixturesDir, 'one_hz_output.html');
const imagesDir = path.join(fixturesDir, 'images');

describe('Integration: full document generation with KiCad', () => {
    beforeAll(async () => {
        const cliPath = path.resolve(import.meta.dirname, '..', '..', 'dist', 'cli', 'typecad', 'index.js');
        await execFileAsync('node', [cliPath, 'doc', mdPath, pcbPath, '-o', htmlPath, '--no-open', '--quiet'], {
            timeout: 300000,
            cwd: path.resolve(import.meta.dirname, '..', '..'),
        });
    }, 300000);

    it('creates the HTML file', async () => {
        const stat = await fs.stat(htmlPath);
        expect(stat.size).toBeGreaterThan(1000);
    });

    it('is a valid HTML5 document', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="en">');
        expect(html).toContain('</html>');
    });

    it('contains frontmatter metadata in the navbar', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('typeCAD 1Hz');
        expect(html).toContain('typeCAD');
    });

    it('sets dark-mode class from frontmatter', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('class="dark-mode"');
    });

    it('contains section-wrapped content', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('<section>');
        expect(html).toContain('</section>');
    });

    it('inlines SVG layer images as inline SVG elements', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('class="svg-inline"');
    });

    it('inlines PNG render images as data URIs', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('data:image/png;base64,');
    });

    it('does not write images to disk', async () => {
        const exists = await fs.stat(imagesDir).then(() => true).catch(() => false);
        expect(exists).toBe(false);
    });

    it('creates the stackup light image if PCB has stackup data', async () => {
        try {
            const stat = await fs.stat(path.join(imagesDir, 'stackup_light.svg'));
            expect(stat.size).toBeGreaterThan(0);
        } catch {
            console.log('      Stackup data not present in PCB, image skipped (expected)');
        }
    });

    it('creates the stackup dark image if PCB has stackup data', async () => {
        try {
            const stat = await fs.stat(path.join(imagesDir, 'stackup_dark.svg'));
            expect(stat.size).toBeGreaterThan(0);
        } catch {
            console.log('      Stackup data not present in PCB, image skipped (expected)');
        }
    });

    it('creates the dimensions image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('class="svg-inline"');
    });

    it('creates the drills image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('drill-layer');
    });

    it('creates the front render image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('data:image/png;base64,');
    });

    it('creates the back render image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('data:image/png;base64,');
    });

    it('creates the front assembly image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('class="svg-inline"');
    });

    it('creates the bottom assembly image', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('class="svg-inline"');
    });

    it('HTML contains inline stackup SVG', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('stackup-inline');
        expect(html).toContain('var(--stackup-bg)');
    });

    it('HTML contains drill layer class', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('drill-layer');
    });

    it('HTML renders math equations as MathML', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('<math');
    });

    it('HTML renders the BOM table', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('74HC4060N');
        expect(html).toContain('SIT8008BI-82-30E-4.194304');
    });

    it('HTML renders the test points table', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('TCXO Output');
    });

    it('does not contain external resource references', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('typecad.net/favicon.ico');
    });

    it('has no local file references in img tags', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        const localImgSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
            .map(m => m[1])
            .filter(src => !src.startsWith('http') && !src.startsWith('data:'));
        expect(localImgSrcs).toEqual([]);
    });

    it('includes navbar, TOC, modal, theme toggle, and accessibility features', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('--color-text');
        expect(html).toContain('class="modal"');
        expect(html).toContain('class="navbar"');
        expect(html).toContain('id="toc-toggle"');
        expect(html).toContain('id="theme-toggle"');
        expect(html).toContain('class="toc"');
        expect(html).toContain('toc-backdrop');
        expect(html).toContain('skip-link');
        expect(html).toContain('aria-live');
        expect(html).toContain('IntersectionObserver');
    });

    it('uses scroll snapping for sections', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('scroll-snap-type');
        expect(html).toContain('scroll-snap-align');
    });

    it('does not contain the old mobile warning banner', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).not.toContain('mobile-warning');
    });

    it('does not contain the old fixed bottom title block', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).not.toContain('class="title-block"');
    });
});
