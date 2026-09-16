import { getWindowsSteamPath } from './windowsSteamPath.ts';
import path from 'node:path';
import fs from 'node:fs';
import { homedir } from 'node:os';
import { parse } from '@node-steam/vdf';
import type { GamePathOptions, LookupIssue, SteamFailureReason, SteamInstallation } from './types.ts';

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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function errorCode(error: unknown): string | undefined {
	return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

type LibraryConfig =
	| { status: 'ready'; libraries: string[] }
	| { status: 'library-config-missing' | 'library-config-invalid' | 'access-error' };

function readLibraryConfig(steamPath: string): LibraryConfig {
	const filename = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
	let content: string;
	try {
		content = fs.readFileSync(filename, 'utf8');
	} catch (error) {
		const code = errorCode(error);
		const status = code === 'ENOENT' ? 'library-config-missing' : 'access-error';
		return { status };
	}

	try {
		const parsed: unknown = parse(content);
		const section = isRecord(parsed) ? (parsed.LibraryFolders ?? parsed.libraryfolders) : undefined;
		if (!isRecord(section)) throw new Error('Missing library section');
		const libraries: string[] = [];
		for (const [key, entry] of Object.entries(section)) {
			// Legacy files can also contain metadata such as TimeNextStatsReport.
			if (!/^\d+$/.test(key) || !entry) continue;
			const root = isRecord(entry) ? entry.path : entry;
			if (typeof root !== 'string' || !root.trim()) throw new Error('Invalid library path');
			libraries.push(path.join(root, 'steamapps'));
		}
		return { status: 'ready', libraries };
	} catch {
		return { status: 'library-config-invalid' };
	}
}

/** Read configured libraries without adding the default library or removing duplicates. */
export function getSteamLibraries(steamPath: string): string[] | null {
	const result = readLibraryConfig(steamPath);
	return result.status === 'ready' ? result.libraries : null;
}

export type SteamContext =
	| { status: 'ready'; steam: SteamInstallation; availableLibraries: string[]; issues: LookupIssue[] }
	| { status: SteamFailureReason };

export function validateOptions(options: GamePathOptions): void {
	if (
		!isRecord(options) ||
		(options.steamPath !== undefined && (typeof options.steamPath !== 'string' || !options.steamPath.trim()))
	) {
		throw new TypeError('options.steamPath must be a non-empty string');
	}
}

export function loadSteam(options: GamePathOptions): SteamContext {
	validateOptions(options);
	if (options.steamPath === undefined && !['linux', 'win32', 'darwin'].includes(process.platform)) {
		return { status: 'unsupported-platform' };
	}
	const root = options.steamPath === undefined ? getSteamPath() : path.resolve(options.steamPath);
	if (!root) return { status: 'steam-not-found' };
	try {
		if (!fs.statSync(root).isDirectory()) return { status: 'steam-not-found' };
	} catch (error) {
		const code = errorCode(error);
		return { status: code === 'ENOENT' || code === 'ENOTDIR' ? 'steam-not-found' : 'access-error' };
	}

	const steam: SteamInstallation = { path: root, libraries: [] };
	const config = readLibraryConfig(root);
	if (config.status !== 'ready') return config;

	const seen = new Set<string>();
	for (const library of [...config.libraries, path.join(root, 'steamapps')]) {
		const normalized = path.resolve(library);
		const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
		if (!seen.has(key)) {
			seen.add(key);
			steam.libraries.push(normalized);
		}
	}
	const availableLibraries: string[] = [];
	const issues: LookupIssue[] = [];
	for (const library of steam.libraries) {
		try {
			if (fs.statSync(library).isDirectory()) availableLibraries.push(library);
			else
				issues.push({
					code: 'access-error',
					message: 'A Steam library path is not a directory.',
					path: library
				});
		} catch (error) {
			issues.push({
				code: 'access-error',
				message: 'A Steam library directory is unavailable.',
				path: library,
				errorCode: errorCode(error)
			});
		}
	}
	return { status: 'ready', steam, availableLibraries, issues };
}
