"use strict";
// ---------------------------------------------------------------------------
// Where does the extension run `typecad-pcb`? typeCAD projects are multi-root
// (the generated .code-workspace has hw/ and fw/ folders), so unlike the HAL
// extension the hw folder is never assumed to be workspaceFolders[0] — it is
// whichever workspace folder carries typecad.conf.ts.
// ---------------------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONF_FILE = void 0;
exports.findHwFolder = findHwFolder;
const node_path_1 = __importDefault(require("node:path"));
exports.CONF_FILE = 'typecad.conf.ts';
/**
 * First folder containing typecad.conf.ts, in the order VS Code presents
 * them. `exists` is injected so tests can fake the filesystem.
 */
function findHwFolder(folders, exists) {
    for (const folder of folders) {
        if (exists(node_path_1.default.join(folder, exports.CONF_FILE)))
            return folder;
    }
    return null;
}
//# sourceMappingURL=hwFolder.js.map