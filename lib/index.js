"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGamePath = exports.getSteamPath = exports.getSteamLibraries = void 0;
const registry_js_1 = require("registry-js");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const VDF = __importStar(require("@node-steam/vdf"));
const os_1 = require("os");
function verifyGameManifestPath(gameId, libraryPath) {
    if (fs_1.default.existsSync(path_1.default.join(libraryPath, `appmanifest_${gameId}.acf`))) {
        return path_1.default.join(libraryPath, `appmanifest_${gameId}.acf`);
    }
    return null;
}
function getGameManifestPath(paths, gameId) {
    for (const path of paths) {
        const manifest = verifyGameManifestPath(gameId, path);
        if (manifest && getGame(manifest)) {
            return manifest;
        }
    }
    return null;
}
function getSteamLibraries(steamPath) {
    if (fs_1.default.existsSync(path_1.default.join(steamPath, 'steamapps', `libraryfolders.vdf`))) {
        const content = fs_1.default.readFileSync(path_1.default.join(steamPath, 'steamapps', `libraryfolders.vdf`), 'UTF-8');
        try {
            const parsed = VDF.parse(content);
            const libraries = parsed.LibraryFolders;
            const paths = [];
            Object.keys(libraries).forEach(key => {
                if (typeof libraries[key] === "string") {
                    paths.push(path_1.default.join(libraries[key], "steamapps"));
                }
            });
            return paths;
        }
        catch (e) {
            return null;
        }
    }
    return null;
}
exports.getSteamLibraries = getSteamLibraries;
function getSteamPath() {
    if (process.platform === "linux") {
        const steamPath = path_1.default.join(os_1.homedir(), ".steam", "root");
        if (fs_1.default.existsSync(steamPath)) {
            return steamPath;
        }
        return null;
    }
    if (process.platform !== "win32") {
        throw new Error("Unsupported operating system");
    }
    try {
        const entry = registry_js_1.enumerateValues(registry_js_1.HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam').filter(value => value.name === "InstallPath")[0];
        const value = entry && String(entry.data) || null;
        return value;
    }
    catch (e) {
        return null;
    }
}
exports.getSteamPath = getSteamPath;
function getGame(manifestDir) {
    const content = fs_1.default.readFileSync(manifestDir, 'UTF-8');
    try {
        const parsed = VDF.parse(content);
        const dir = path_1.default.join(manifestDir, "../", 'common', parsed.AppState.installdir);
        const name = parsed.AppState.name;
        return { path: dir, name };
    }
    catch (e) {
        return null;
    }
}
function getGamePath(gameId) {
    const steamPath = getSteamPath();
    if (!steamPath)
        return null;
    const libraries = getSteamLibraries(steamPath);
    if (libraries === null) {
        return {
            game: null,
            steam: {
                path: steamPath,
                libraries: []
            }
        };
    }
    libraries.push(path_1.default.join(steamPath, 'steamapps'));
    const manifest = getGameManifestPath(libraries, gameId);
    if (!manifest) {
        return {
            game: null,
            steam: {
                path: steamPath,
                libraries: libraries
            }
        };
    }
    const game = getGame(manifest);
    return {
        game,
        steam: {
            path: steamPath,
            libraries: libraries
        }
    };
}
exports.getGamePath = getGamePath;
console.log(getGamePath(730));
