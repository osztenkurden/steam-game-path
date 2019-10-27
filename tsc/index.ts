import { enumerateValues, HKEY, RegistryValueType } from 'registry-js';
import path from 'path';
import fs from 'fs';
import * as VDF from '@node-steam/vdf';

interface GamePath {
    path: string,
    name: string
}

interface SteamPath {
    game: GamePath | null,
    steam: {
        path: string,
        libraries: string[]
    }
}

function getAppManifest(gameId: number, libraryPath: string) {
    if (fs.existsSync(path.join(libraryPath, `appmanifest_${gameId}.acf`))) {
        return path.join(libraryPath, `appmanifest_${gameId}.acf`);
    }
    return null;
}

function checkAllLibraries(paths: string[], gameId: number) {
    let manifest = null;
    paths.forEach(path => {
        if (getAppManifest(gameId, path)) {
            manifest = getAppManifest(gameId, path);
        }
    });
    return manifest;
}

export function getSteamLibraries(steamPath: string) {
    if (fs.existsSync(path.join(steamPath, 'steamapps', `libraryfolders.vdf`))) {
        const content = fs.readFileSync(path.join(steamPath, 'steamapps', `libraryfolders.vdf`), 'UTF-8');
        try {
            const parsed = VDF.parse(content);
            const libraries = parsed.LibraryFolders;
            const paths: string[] = [];
            Object.keys(libraries).forEach(key => {
                if (typeof libraries[key] === "string") {
                    paths.push(path.join(libraries[key], "steamapps"));
                }
            });
            return paths;
        } catch (e) {
            return null;
        }
    }
    return null;
}

export function getSteamPath() {
    if (process.platform !== "win32") {
        throw new Error("Unsupported operating system");
    }

    try {
        const entry = enumerateValues(HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam').filter(value => value.name === "InstallPath")[0];
        const value = entry && String(entry.data) || null;
        return value;
    } catch (e) {
        return null;
    }
}

function getGame(manifestDir: string) {
    const content = fs.readFileSync(manifestDir, 'UTF-8');
    try {
        const parsed = VDF.parse(content);
        const dir = path.join(manifestDir, '..\\common', parsed.AppState.installdir);
        const name: string = parsed.AppState.name;
        return { path: dir, name };
    } catch (e) {
        return null;
    }
}

export function getGamePath(gameId: number): SteamPath | null {
    const steamPath = getSteamPath();
    if (!steamPath) return null;

    const libraries = getSteamLibraries(steamPath);
    if (libraries === null)  {
        return {
            game: null,
            steam: {
                path: steamPath,
                libraries: []
            }
        }
    }

    libraries.push(path.join(steamPath, 'steamapps'));
    const manifest = checkAllLibraries(libraries, gameId);

    if (!manifest) {
        return {
            game: null,
            steam: {
                path: steamPath,
                libraries: libraries
            }
        }
    }

    const game = getGame(manifest);

    return {
        game,
        steam: {
            path: steamPath,
            libraries: libraries
        }
    }

}
