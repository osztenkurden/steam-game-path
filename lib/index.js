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
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGamePath = exports.getSteamPath = exports.getSteamLibraries = void 0;
var registry_js_1 = require("registry-js");
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var VDF = __importStar(require("@node-steam/vdf"));
function verifyGameManifestPath(gameId, libraryPath) {
    if (fs_1.default.existsSync(path_1.default.join(libraryPath, "appmanifest_" + gameId + ".acf"))) {
        return path_1.default.join(libraryPath, "appmanifest_" + gameId + ".acf");
    }
    return null;
}
function getGameManifestPath(paths, gameId) {
    for (var _i = 0, paths_1 = paths; _i < paths_1.length; _i++) {
        var path_2 = paths_1[_i];
        var manifest = verifyGameManifestPath(gameId, path_2);
        if (manifest && getGame(manifest)) {
            return manifest;
        }
    }
    return null;
}
function getSteamLibraries(steamPath) {
    if (fs_1.default.existsSync(path_1.default.join(steamPath, 'steamapps', "libraryfolders.vdf"))) {
        var content = fs_1.default.readFileSync(path_1.default.join(steamPath, 'steamapps', "libraryfolders.vdf"), 'UTF-8');
        try {
            var parsed = VDF.parse(content);
            var libraries_1 = parsed.LibraryFolders;
            var paths_2 = [];
            Object.keys(libraries_1).forEach(function (key) {
                if (typeof libraries_1[key] === "string") {
                    paths_2.push(path_1.default.join(libraries_1[key], "steamapps"));
                }
            });
            return paths_2;
        }
        catch (e) {
            return null;
        }
    }
    return null;
}
exports.getSteamLibraries = getSteamLibraries;
function getSteamPath() {
    if (process.platform !== "win32") {
        throw new Error("Unsupported operating system");
    }
    try {
        var entry = registry_js_1.enumerateValues(registry_js_1.HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam').filter(function (value) { return value.name === "InstallPath"; })[0];
        var value = entry && String(entry.data) || null;
        return value;
    }
    catch (e) {
        return null;
    }
}
exports.getSteamPath = getSteamPath;
function getGame(manifestDir) {
    var content = fs_1.default.readFileSync(manifestDir, 'UTF-8');
    try {
        var parsed = VDF.parse(content);
        var dir = path_1.default.join(manifestDir, '..\\common', parsed.AppState.installdir);
        var name_1 = parsed.AppState.name;
        return { path: dir, name: name_1 };
    }
    catch (e) {
        return null;
    }
}
function getGamePath(gameId) {
    var steamPath = getSteamPath();
    if (!steamPath)
        return null;
    var libraries = getSteamLibraries(steamPath);
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
    var manifest = getGameManifestPath(libraries, gameId);
    if (!manifest) {
        return {
            game: null,
            steam: {
                path: steamPath,
                libraries: libraries
            }
        };
    }
    var game = getGame(manifest);
    return {
        game: game,
        steam: {
            path: steamPath,
            libraries: libraries
        }
    };
}
exports.getGamePath = getGamePath;
