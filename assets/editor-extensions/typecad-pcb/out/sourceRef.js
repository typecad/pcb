"use strict";
// ---------------------------------------------------------------------------
// Reverse probing: the viewer reports a reference; the board model's "Code"
// property (embedded by the typeCAD serializer at build time) maps it back to
// the declaring source line — "src/rd_skeleton.ts:16". This module turns that
// string plus the hw folder into an absolute reveal target.
// ---------------------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSourceLocation = parseSourceLocation;
const node_path_1 = __importDefault(require("node:path"));
/**
 * Parse a `<relative path>[:<line>]` source location against the hw folder.
 * Returns null for absent/empty metadata. Malformed paths (absolute or
 * escaping the project) are rejected so a crafted board file can't point the
 * editor outside the workspace.
 */
function parseSourceLocation(hwFolder, source) {
    if (!source || source.trim() === '')
        return null;
    const sep = source.lastIndexOf(':');
    const file = sep === -1 ? source : source.slice(0, sep);
    const line = sep === -1 ? 0 : Number.parseInt(source.slice(sep + 1), 10);
    if (file.trim() === '' || Number.isNaN(line) || line < 0)
        return null;
    const absolute = node_path_1.default.resolve(hwFolder, file);
    const root = node_path_1.default.resolve(hwFolder);
    if (!absolute.startsWith(root + node_path_1.default.sep) && absolute !== root)
        return null;
    return { fsPath: absolute, line };
}
//# sourceMappingURL=sourceRef.js.map