"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGamePath = exports.getSteamPath = exports.getSteamLibraries = void 0;
const registry_js_1 = require("registry-js");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const vdf_1 = require("@node-steam/vdf");
const os_1 = require("os");
const steam_user_1 = __importDefault(require("steam-user"));
const VDF = { parse: vdf_1.parse, stringify: vdf_1.stringify };
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
            const libraries = parsed.LibraryFolders || parsed.libraryfolders;
            const paths = [];
            if (!libraries) {
                return null;
            }
            const values = Object.values(libraries);
            for (const value of values) {
                if (!value) {
                    continue;
                }
                if (typeof value === "string") {
                    paths.push(path_1.default.join(value, "steamapps"));
                }
                else if (value && value.path) {
                    paths.push(path_1.default.join(value.path, 'steamapps'));
                }
            }
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
        const steamPath = path_1.default.join((0, os_1.homedir)(), ".steam", "root");
        if (fs_1.default.existsSync(steamPath)) {
            return steamPath;
        }
        return null;
    }
    if (process.platform !== "win32") {
        throw new Error("Unsupported operating system");
    }
    try {
        const entry = (0, registry_js_1.enumerateValues)(registry_js_1.HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam').filter(value => value.name === "InstallPath")[0];
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
        if (!fs_1.default.existsSync(dir)) {
            return null;
        }
        const name = parsed.AppState.name;
        return { path: dir, name };
    }
    catch (e) {
        return null;
    }
}
function getGamePath(gameId, findExecutable = false) {
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
                libraries: [...new Set(libraries)]
            }
        };
    }
    const game = getGame(manifest);
    if (!findExecutable || !game) {
        return {
            game,
            steam: {
                path: steamPath,
                libraries: [...new Set(libraries)]
            }
        };
    }
    const executablePromise = new Promise((res, rej) => {
        const client = new steam_user_1.default();
        client.on('loggedOn', async () => {
            const gameData = await client.getProductInfo([gameId], []);
            const gameExecutableInfo = gameData?.apps?.[gameId]?.appinfo?.config?.launch || null;
            client.logOff();
            res(gameExecutableInfo ? Object.values(gameExecutableInfo) : gameExecutableInfo);
        });
        client.logOn();
    });
    return {
        game: { ...game, executable: executablePromise },
        steam: {
            path: steamPath,
            libraries: [...new Set(libraries)]
        }
    };
}
exports.getGamePath = getGamePath;
