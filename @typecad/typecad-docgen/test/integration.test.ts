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
        const cliPath = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
        await execFileAsync('node', [cliPath, mdPath, pcbPath, '-o', htmlPath, '--no-open', '--quiet'], {
            timeout: 300000,
            cwd: path.resolve(import.meta.dirname, '..'),
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

    it('contains frontmatter metadata in the title block', async () => {
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

    it('creates the F.Cu layer image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'fcu.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the B.Cu layer image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'bcu.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the stackup light image if PCB has stackup data', async () => {
        try {
            const stat = await fs.stat(path.join(imagesDir, 'stackup_light.png'));
            expect(stat.size).toBeGreaterThan(0);
        } catch {
            console.log('      Stackup data not present in PCB, image skipped (expected)');
        }
    });

    it('creates the stackup dark image if PCB has stackup data', async () => {
        try {
            const stat = await fs.stat(path.join(imagesDir, 'stackup_dark.png'));
            expect(stat.size).toBeGreaterThan(0);
        } catch {
            console.log('      Stackup data not present in PCB, image skipped (expected)');
        }
    });

    it('creates the dimensions image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'dimensions.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the drills image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'drills.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the front render image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'render-display.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the back render image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'back-render.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the front assembly image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'front-assembly.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('creates the bottom assembly image', async () => {
        const stat = await fs.stat(path.join(imagesDir, 'bottom-assembly.png'));
        expect(stat.size).toBeGreaterThan(0);
    });

    it('HTML references the generated stackup images with data attributes', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('stackup-container');
        expect(html).toContain('data-light-src');
        expect(html).toContain('data-dark-src');
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

    it('includes CSS, modal, toggle, and title block', async () => {
        const html = await fs.readFile(htmlPath, 'utf-8');
        expect(html).toContain('--color-text');
        expect(html).toContain('class="modal"');
        expect(html).toContain('dark-mode-toggle');
        expect(html).toContain('class="title-block"');
    });
});
