import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findBoardFile, startGerberViewerServer } from '../src/gerber_viewer/serve.js';

describe('findBoardFile', () => {
  it('finds the pcb in a build directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvserve-'));
    fs.mkdirSync(path.join(dir, 'build'));
    fs.writeFileSync(path.join(dir, 'build', 'demo.kicad_pcb'), '(kicad_pcb)');
    const board = findBoardFile(path.join(dir, 'build'));
    expect(board?.file).toBe(path.join(dir, 'build', 'demo.kicad_pcb'));
    expect(board?.mtimeMs).toBeGreaterThan(0);
    expect(findBoardFile(path.join(dir, 'nope'))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('startGerberViewerServer', () => {
  const handles: ReturnType<typeof startGerberViewerServer>[] = [];
  afterAll(() => {
    for (const handle of handles) handle.server.close();
  });

  it('serves a waiting page and generation endpoint before the first build', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvserve-'));
    const handle = startGerberViewerServer({ projectDir, port: 0, pollMs: 50 });
    handles.push(handle);
    await new Promise((resolve) => handle.server.once('listening', resolve));

    const build = await fetch(`${handle.url}/__build`);
    expect(build.status).toBe(200);
    expect(await build.json()).toEqual({ g: 0 });

    const page = await fetch(`${handle.url}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('waiting for build');
    expect(html).toContain('/__build'); // reload client present

    const missing = await fetch(`${handle.url}/nothing`);
    expect(missing.status).toBe(404);

    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('serves a previously generated viewer page once one exists', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvserve-'));
    const serveDir = path.join(projectDir, 'build', 'serve');
    fs.mkdirSync(serveDir, { recursive: true });
    fs.writeFileSync(path.join(serveDir, 'viewer.html'), '<html><body>VIEWER-MARKER</body></html>');

    const handle = startGerberViewerServer({ projectDir, port: 0, pollMs: 50 });
    handles.push(handle);
    await new Promise((resolve) => handle.server.once('listening', resolve));

    const page = await fetch(`${handle.url}/`);
    expect(await page.text()).toContain('VIEWER-MARKER');
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('walks up to the next free port when the requested one is in use', async () => {
    const busy = startGerberViewerServer({ projectDir: os.tmpdir(), port: 0, pollMs: 60 });
    handles.push(busy);
    await new Promise((resolve) => busy.server.once('listening', resolve));
    const busyPort = busy.server.address()!.port;

    const second = startGerberViewerServer({ projectDir: os.tmpdir(), port: busyPort, pollMs: 60 });
    handles.push(second);
    await new Promise((resolve) => second.server.once('listening', resolve));

    const secondPort = second.server.address()!.port;
    expect(Number(secondPort)).toBeGreaterThan(busyPort);
    // both serve independently
    expect(await (await fetch(`${busy.url}/__build`)).json()).toEqual({ g: 0 });
    expect(await (await fetch(`${second.url}/__build`)).json()).toEqual({ g: 0 });
  });
});
