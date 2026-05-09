"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KiCAD = exports.kicad_symbols_path = exports.kicad_cli_path = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var typecad_1 = require("@typecad/typecad");
Object.defineProperty(exports, "kicad_cli_path", { enumerable: true, get: function () { return typecad_1.kicad_cli_path; } });
var symbols_subpaths = [
    'share/kicad/symbols',
    'symbols',
    'share/symbols'
];
var KiCAD = /** @class */ (function () {
    function KiCAD() {
        new typecad_1.KiCAD();
        if (typecad_1.kicad_path) {
            var libraryPaths = new typecad_1.KiCAD().getLibraryPaths();
            if (libraryPaths.symbols && node_fs_1.default.existsSync(libraryPaths.symbols)) {
                exports.kicad_symbols_path = libraryPaths.symbols;
            }
            else {
                exports.kicad_symbols_path = this.findSymbolsDirectory(typecad_1.kicad_path);
            }
        }
    }
    KiCAD.prototype.findSymbolsDirectory = function (installationPath) {
        for (var _i = 0, symbols_subpaths_1 = symbols_subpaths; _i < symbols_subpaths_1.length; _i++) {
            var subpath = symbols_subpaths_1[_i];
            var symbolsPath = node_path_1.default.join(installationPath, subpath);
            if (node_fs_1.default.existsSync(symbolsPath) && node_fs_1.default.statSync(symbolsPath).isDirectory()) {
                return symbolsPath;
            }
        }
        return undefined;
    };
    KiCAD.prototype.getSymbolsPath = function () {
        return exports.kicad_symbols_path;
    };
    KiCAD.prototype.getCliPath = function () {
        return typecad_1.kicad_cli_path;
    };
    KiCAD.prototype.hasLocalSymbols = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!exports.kicad_symbols_path) {
                            return [2 /*return*/, false];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, node_fs_1.default.promises.readdir(exports.kicad_symbols_path)];
                    case 2:
                        files = _a.sent();
                        return [2 /*return*/, files.some(function (file) { return file.endsWith('.kicad_sym'); })];
                    case 3:
                        error_1 = _a.sent();
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return KiCAD;
}());
exports.KiCAD = KiCAD;
