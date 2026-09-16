import { getWindowsSteamPath } from './windowsSteamPath.ts';
import path from 'path';
import fs from 'fs';
import { parse, stringify } from '@node-steam/vdf';
import { homedir } from 'os';

const VDF = { parse, stringify };
interface GamePath {
	path: string;
	name: string;
}

interface SteamPath {
	game: GamePath | null;
	steam: {
		path: string;
		libraries: string[];
	};
}

function verifyGameManifestPath(gameId: number, libraryPath: string) {
	if (fs.existsSync(path.join(libraryPath, `appmanifest_${gameId}.acf`))) {
		return path.join(libraryPath, `appmanifest_${gameId}.acf`);
	}
	return null;
}

function getGameManifestPath(paths: string[], gameId: number) {
	for (const path of paths) {
		const manifest = verifyGameManifestPath(gameId, path);
		if (manifest && getGame(manifest)) {
			return manifest;
		}
	}
	return null;
}

export function getSteamLibraries(steamPath: string) {
	if (fs.existsSync(path.join(steamPath, 'steamapps', `libraryfolders.vdf`))) {
		const content = fs.readFileSync(path.join(steamPath, 'steamapps', `libraryfolders.vdf`), 'utf-8');
		try {
			const parsed = VDF.parse(content);
			const libraries = parsed.LibraryFolders || parsed.libraryfolders;
			const paths: string[] = [];

			if (!libraries) {
				return null;
			}

			const values = Object.values(libraries) as any[];

			for (const value of values) {
				if (!value) {
					continue;
				}
				if (typeof value === 'string') {
					paths.push(path.join(value, 'steamapps'));
				} else if (value && value.path) {
					paths.push(path.join(value.path, 'steamapps'));
				}
			}

			return paths;
		} catch {
			return null;
		}
	}
	return null;
}

export function getSteamPath() {
	switch (process.platform) {
		case 'linux': {
			let steamPath = path.join(homedir(), '.steam', 'root');
			if (fs.existsSync(steamPath)) {
				return steamPath;
			}

			// Flatpak
			steamPath = path.join(homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam');
			if (fs.existsSync(steamPath)) {
				return steamPath;
			}
			return null;
		}

		case 'win32':
			return getWindowsSteamPath();

		case 'darwin': {
			const steamPath = path.join(homedir(), 'Library', 'Application Support', 'Steam');
			if (fs.existsSync(steamPath)) {
				return steamPath;
			}
			return null;
		}

		default:
			throw new Error('Unsupported operating system');
	}
}

function getGame(manifestDir: string) {
	const content = fs.readFileSync(manifestDir, 'utf-8');
	try {
		const parsed = VDF.parse(content);
		const dir = path.join(manifestDir, '../', 'common', parsed.AppState.installdir);
		if (!fs.existsSync(dir)) {
			return null;
		}
		const name: string = parsed.AppState.name;
		return { path: dir, name };
	} catch {
		return null;
	}
}

export function getGamePath(gameId: number): SteamPath | null {
	const steamPath = getSteamPath();
	if (!steamPath) return null;

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

	libraries.push(path.join(steamPath, 'steamapps'));
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

	return {
		game,
		steam: {
			path: steamPath,
			libraries: [...new Set(libraries)]
		}
	};
}
