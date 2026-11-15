"use strict";
// ---------------------------------------------------------------------------
// Source backups for the layout apply pipeline.
//
// The apply bridge rewrites user source (.ts) from the layout view. Every
// defense upstream (staged planning, parse gating, whole-document writes)
// narrows the window, but the promise that matters is downstream: a user
// must NEVER be left unscrambling a corrupted .ts by hand. Every apply
// snapshots the files it will touch into build/layout-backups/<timestamp>/,
// a post-write verification auto-restores the snapshot if anything slipped
// through, and the `typeCAD: Restore Source from Backup` command lists and
// restores snapshots on demand.
//
// vscode-free (pure fs) like boardFile.ts, so the behavior is unit-tested.
// ---------------------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBackups = listBackups;
exports.writeBackup = writeBackup;
exports.readBackup = readBackup;
exports.backupRootLabel = backupRootLabel;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const BACKUP_ROOT = path.join('build', 'layout-backups');
const MANIFEST = 'manifest.json';
/** snapshots kept before pruning (the newest are kept) */
const KEEP = 20;
function manifestPath(dir) {
    return path.join(dir, MANIFEST);
}
/** A sortable, filesystem-safe snapshot id: 2026-09-29T13-04-05-123Z */
function newId(date = new Date()) {
    return date.toISOString().replace(/[:]/g, '-');
}
function readManifest(dir) {
    try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.files)) {
            return parsed;
        }
    }
    catch {
        // missing or corrupt manifest — the snapshot is unusable
    }
    return null;
}
/** All snapshots, newest first. Unreadable ones are skipped, never thrown. */
function listBackups(folder) {
    const root = path.join(folder, BACKUP_ROOT);
    let ids = [];
    try {
        ids = fs
            .readdirSync(root)
            .filter((d) => fs.statSync(path.join(root, d)).isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d))
            .sort()
            .reverse();
    }
    catch {
        return [];
    }
    const out = [];
    for (const id of ids) {
        const dir = path.join(root, id);
        const manifest = readManifest(dir);
        if (manifest)
            out.push({ id, dir, manifest });
    }
    return out;
}
/**
 * Snapshot the given files before their content changes. Names inside the
 * snapshot dir are mangled from the full source path (src/board.ts ->
 * src_board.ts) so same-named files in different folders never collide.
 * Returns the listing, or null when nothing could be written (backups are
 * best-effort — an unwritable build/ must not block an apply).
 */
function writeBackup(folder, files, reason, board) {
    if (files.length === 0)
        return null;
    const id = newId();
    const dir = path.join(folder, BACKUP_ROOT, id);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch {
        return null;
    }
    const manifest = { time: new Date().toISOString(), reason, board, files: [] };
    const used = new Set();
    for (const f of files) {
        // uri -> a stable, collision-free snapshot name
        const parsedUri = /^file:\/\/\/?/.test(f.uri) ? decodeURIComponent(f.uri.replace(/^file:\/\/\/?/, '')) : f.uri;
        let base = path.basename(parsedUri.replace(/[\\/]+/g, '_'));
        if (!/\.[a-z]+$/i.test(base))
            base += '.ts';
        let snapshot = base;
        for (let n = 2; used.has(snapshot); n++)
            snapshot = base.replace(/(\.[a-z]+)$/i, `-${n}$1`);
        used.add(snapshot);
        try {
            fs.writeFileSync(path.join(dir, snapshot), f.text, 'utf8');
            manifest.files.push({ source: parsedUri, snapshot, ...(f.created ? { created: true } : {}) });
        }
        catch {
            // a file that fails to snapshot still applies — it just won't restore
        }
    }
    if (manifest.files.length === 0)
        return null;
    try {
        fs.writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2), 'utf8');
    }
    catch {
        return null;
    }
    prune(folder);
    return { id, dir, manifest };
}
/** Keep only the newest KEEP snapshots; pruning failures are ignored. */
function prune(folder) {
    const all = listBackups(folder);
    for (const old of all.slice(KEEP)) {
        try {
            fs.rmSync(old.dir, { recursive: true, force: true });
        }
        catch {
            // best-effort
        }
    }
}
/**
 * Read a snapshot's file contents (snapshot name -> pre-apply text). Throws
 * only on an unknown id; missing snapshot files are skipped in the result.
 * Entries carry `created` for files the apply created — restoring deletes
 * those instead of writing empty text.
 */
function readBackup(folder, id) {
    const dir = path.join(folder, BACKUP_ROOT, id);
    const manifest = readManifest(dir);
    if (!manifest)
        throw new Error(`no backup "${id}" — its manifest is missing or unreadable`);
    const out = [];
    for (const f of manifest.files) {
        try {
            out.push({
                source: f.source,
                text: fs.readFileSync(path.join(dir, f.snapshot), 'utf8'),
                ...(f.created ? { created: true } : {}),
            });
        }
        catch {
            // skipped — a partial restore still beats a corrupted file
        }
    }
    if (out.length === 0)
        throw new Error(`backup "${id}" holds no readable files`);
    return out;
}
/** The backup dir label for logs and pickers. */
function backupRootLabel() {
    return BACKUP_ROOT.split(path.sep).join('/');
}
//# sourceMappingURL=sourceBackup.js.map