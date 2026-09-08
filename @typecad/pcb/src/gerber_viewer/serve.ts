import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { buildViewerFromFiles } from './build.js';

export interface ServeOptions {
  /** Project root containing build/ (defaults to cwd). */
  projectDir?: string;
  /** First port to try (default 4273; pass 0 for an ephemeral port). When the
   * port is already in use the server walks up to the next free port. */
  port?: number;
  /** Open the viewer in the default browser once listening. */
  open?: boolean;
  /** Board polling interval in ms (default 1000). */
  pollMs?: number;
}

export interface ServeHandle {
  server: http.Server;
  url: string;
  buildDir: string;
  gerbersDir: string;
  viewerPath: string;
  /** Current regeneration counter (exposed as /__build {"g":n}). */
  generation(): number;
}

/** Injected into every served page; reloads when /__build reports a new generation. */
export const RELOAD_CLIENT =
  '<script>(function(){var g=null;setInterval(function(){fetch("/__build",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){if(g===null){g=d.g;}else if(g!==d.g){location.reload();}}).catch(function(){});},1500);})();</script>';

/** Find the single .kicad_pcb in a build directory (null when absent or ambiguous). */
export function findBoardFile(buildDir: string): { file: string; mtimeMs: number } | null {
  if (!fs.existsSync(buildDir)) return null;
  const pcb = fs.readdirSync(buildDir).find((f) => f.endsWith('.kicad_pcb'));
  if (!pcb) return null;
  const file = path.join(buildDir, pcb);
  return { file, mtimeMs: fs.statSync(file).mtimeMs };
}

function waitingPage(): string {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>gerber-viewer — waiting for build</title>',
    '<style>body{font:14px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#333;background:#fafafa}',
    'code{background:#eee;padding:2px 6px;border-radius:4px}</style></head>',
    '<body><div>Waiting for <code>build/*.kicad_pcb</code> — run <code>npm run build</code> in the project.</div>',
    RELOAD_CLIENT,
    '</body></html>',
  ].join('');
}

/**
 * Board viewer dev server for a typeCAD project.
 *
 * Serves an interactive viewer page for build/<board>.kicad_pcb and re-processes
 * it (typecad-pcb export gerbers + drill -> viewer HTML) whenever the board file
 * changes, so every `npm run build` refreshes the open page. Run from a project
 * that has the typecad CLI installed (any typeCAD project does).
 */
export function startGerberViewerServer(options: ServeOptions = {}): ServeHandle {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const buildDir = path.join(projectDir, 'build');
  const gerbersDir = path.join(buildDir, 'gerbers');
  const serveDir = path.join(buildDir, 'serve');
  const viewerPath = path.join(serveDir, 'viewer.html');
  const pollMs = options.pollMs ?? 1000;

  let generation = 0;
  let processing = false;

  function log(message: string): void {
    process.stdout.write(`[gerber-viewer ${new Date().toLocaleTimeString()}] ${message}\n`);
  }

  function runTypecadExport(subcommand: string): void {
    const result = spawnSync(`typecad-pcb export ${subcommand}`, {
      cwd: projectDir,
      shell: true,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const tail = (result.stderr || result.stdout || '').trim().split('\n').slice(-5).join('\n');
      throw new Error(
        `typecad-pcb export ${subcommand} failed (is this a typeCAD project with the CLI installed?):\n${tail}`,
      );
    }
  }

  function processBoard(board: string): void {
    // wipe gerbers so renamed/removed layers never linger in the viewer
    fs.rmSync(gerbersDir, { recursive: true, force: true });
    runTypecadExport('gerbers');
    runTypecadExport('drill');

    const boardName = path.basename(board, '.kicad_pcb');
    const { html, layers, warnings } = buildViewerFromFiles([gerbersDir], {
      title: boardName,
      // netlist fills pad->net (highlighting); DRC report renders markers
      netlistPath: path.join(buildDir, `${boardName}.net`),
      drcReportPath: path.join(buildDir, `${boardName}_drc.json`),
    });
    fs.mkdirSync(serveDir, { recursive: true });
    fs.writeFileSync(viewerPath, html.replace('</body>', `${RELOAD_CLIENT}</body>`));
    generation++;
    log(`viewer updated: ${layers.length} layers (generation ${generation})`);
    for (const warning of warnings.slice(0, 5)) log(`  warning: ${warning}`);
    if (warnings.length > 5) log(`  ... and ${warnings.length - 5} more warnings`);
  }

  // One polling loop covers both "waiting for the first build" and "board rebuilt":
  // it triggers whenever a .kicad_pcb appears or its mtime changes.
  let lastMtime = 0;
  const poll = setInterval(() => {
    if (processing) return;
    const board = findBoardFile(buildDir);
    if (!board || board.mtimeMs === lastMtime) return;
    processing = true;
    try {
      processBoard(board.file);
    } catch (error) {
      log(`error: ${(error as Error).message}`);
    } finally {
      // remember the mtime even on failure so one bad export cannot loop forever
      lastMtime = board.mtimeMs;
      processing = false;
    }
  }, pollMs);
  poll.unref?.();

  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!;
    if (url === '/__build') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ g: generation }));
      return;
    }
    if (url === '/' || url === '/index.html') {
      const page = fs.existsSync(viewerPath) ? fs.readFileSync(viewerPath, 'utf8') : waitingPage();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  // If the requested port is taken (a dev server, another viewer instance...),
  // walk up to the next free port instead of exiting; the log states where it
  // actually landed.
  const firstPort = options.port ?? 4273;
  const MAX_PORT_ATTEMPTS = 50;
  function listenFrom(port: number, attemptsLeft: number): void {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EADDRINUSE') throw error;
      if (attemptsLeft <= 0) {
        process.stderr.write(`error: no free port in ${firstPort}-${port} (all in use — pass --port <n>)\n`);
        process.exit(1);
      }
      log(`port ${port} is in use — trying ${port + 1}`);
      listenFrom(port + 1, attemptsLeft - 1);
    });
    server.listen(port);
  }

  const handle: ServeHandle = {
    server,
    get url() {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : firstPort;
      return `http://localhost:${port}`;
    },
    buildDir,
    gerbersDir,
    viewerPath,
    generation: () => generation,
  };

  listenFrom(firstPort, MAX_PORT_ATTEMPTS);
  server.on('listening', () => {
    log(`project: ${projectDir}`);
    log(`board viewer: ${handle.url}`);
    log('watching build/*.kicad_pcb — every `npm run build` refreshes the page');
    if (options.open) {
      const command =
        process.platform === 'win32'
          ? `start "" ${handle.url}`
          : `${process.platform === 'darwin' ? 'open' : 'xdg-open'} ${handle.url}`;
      spawnSync(command, { shell: true, stdio: 'ignore' });
    }
  });

  return handle;
}
