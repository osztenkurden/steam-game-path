"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var _a = require('windows-registry'), Key = _a.Key, windef = _a.windef;
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var VDF = __importStar(require("@node-steam/vdf"));
function getAppManifest(gameId, libraryPath) {
    if (fs_1.default.existsSync(path_1.default.join(libraryPath, "appmanifest_" + gameId + ".acf"))) {
        return path_1.default.join(libraryPath, "appmanifest_" + gameId + ".acf");
    }
    return null;
}
function checkAllLibraries(paths, gameId) {
    var manifest = null;
    paths.forEach(function (path) {
        if (getAppManifest(gameId, path)) {
            manifest = getAppManifest(gameId, path);
        }
    });
    return manifest;
}
function getSteamLibraries(steamPath) {
    if (fs_1.default.existsSync(path_1.default.join(steamPath, 'steamapps', "libraryfolders.vdf"))) {
        var content = fs_1.default.readFileSync(path_1.default.join(steamPath, 'steamapps', "libraryfolders.vdf"), 'UTF-8');
        try {
            var parsed = VDF.parse(content);
            var libraries_1 = parsed.LibraryFolders;
            var paths_1 = [];
            Object.keys(libraries_1).forEach(function (key) {
                if (typeof libraries_1[key] === "string") {
                    paths_1.push(path_1.default.join(libraries_1[key], "steamapps"));
                }
            });
            return paths_1;
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
        var key = new Key(windef.HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam', windef.KEY_ACCESS.KEY_READ);
        var value = key.getValue('InstallPath');
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
        var name = parsed.AppState.name;
        return { path: dir, name: name };
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
    if (libraries === null)
        return null;
    libraries.push(path_1.default.join(steamPath, 'steamapps'));
    var manifest = checkAllLibraries(libraries, gameId);
    if (!manifest)
        return null;
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
