import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@node-steam/vdf';
import { errorCode, isRecord, loadSteam, validateOptions, type SteamContext } from './steam.ts';
import type { GamePathOptions, GamePathResult, InstalledGame, InstalledGamesResult, LookupIssue } from './types.ts';

function validateAppId(appId: number): void {
	if (!Number.isSafeInteger(appId) || appId <= 0) throw new TypeError('appId must be a positive safe integer');
}

type ManifestResult = { game: InstalledGame; issue?: never } | { game: null; issue: LookupIssue } | null;

function readGame(appId: number, library: string): ManifestResult {
	const filename = path.join(library, `appmanifest_${appId}.acf`);
	let content: string;
	try {
		content = fs.readFileSync(filename, 'utf8');
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		return {
			game: null,
			issue: {
				code: 'access-error',
				message: 'Could not read the game manifest.',
				appId,
				path: filename,
				errorCode: errorCode(error)
			}
		};
	}

	let name: string;
	let directory: string;
	try {
		const parsed: unknown = parse(content);
		const state = isRecord(parsed) ? parsed.AppState : undefined;
		if (
			!isRecord(state) ||
			Number(state.appid) !== appId ||
			typeof state.name !== 'string' ||
			!state.name.trim() ||
			typeof state.installdir !== 'string' ||
			!state.installdir.trim()
		)
			throw new Error('Invalid manifest fields');
		name = state.name;
		const common = path.resolve(library, 'common');
		directory = path.resolve(common, state.installdir);
		const relative = path.relative(common, directory);
		if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
			throw new Error('Invalid installation directory');
	} catch {
		return {
			game: null,
			issue: {
				code: 'manifest-invalid',
				message: 'The manifest is malformed, has mismatched app metadata, or points outside steamapps/common.',
				appId,
				path: filename
			}
		};
	}

	try {
		if (fs.statSync(directory).isDirectory()) return { game: { appId, name, path: directory } };
		return {
			game: null,
			issue: {
				code: 'install-directory-missing',
				message: 'The installation path is not a directory.',
				appId,
				path: directory
			}
		};
	} catch (error) {
		const code = errorCode(error);
		return {
			game: null,
			issue: {
				code: code === 'ENOENT' || code === 'ENOTDIR' ? 'install-directory-missing' : 'access-error',
				message: 'The game installation directory is unavailable.',
				appId,
				path: directory,
				errorCode: code
			}
		};
	}
}

function findGame(appId: number, context: SteamContext): GamePathResult {
	if (context.status !== 'ready') return { success: false, reason: context.status };
	const issues = [...context.issues];
	for (const library of context.availableLibraries) {
		const result = readGame(appId, library);
		if (result?.game) return { success: true, game: result.game, steam: context.steam, issues };
		if (result?.issue) issues.push(result.issue);
	}
	const reason = (issues.find(issue => issue.appId === appId) ?? issues[0])?.code ?? 'game-not-found';
	return { success: false, reason };
}

/** Locate a game and explain unsuccessful or incomplete searches. */
export function getGamePath(appId: number, options: GamePathOptions = {}): GamePathResult {
	validateAppId(appId);
	return findGame(appId, loadSteam(options));
}

/** Preserve input order, including duplicates, while discovering Steam and reading its configuration once. */
export function getGamePaths(appIds: readonly number[], options: GamePathOptions = {}): GamePathResult[] {
	if (!Array.isArray(appIds)) throw new TypeError('appIds must be an array of positive safe integers');
	for (const appId of appIds) validateAppId(appId);
	validateOptions(options);
	if (!appIds.length) return [];
	const context = loadSteam(options);
	const results = new Map<number, GamePathResult>();
	return appIds.map(appId => {
		let result = results.get(appId);
		if (!result) {
			result = findGame(appId, context);
			results.set(appId, result);
		}
		return result;
	});
}

/** Enumerate valid installed games, deduplicated and sorted by app ID. */
export function getInstalledGames(options: GamePathOptions = {}): InstalledGamesResult {
	const context = loadSteam(options);
	if (context.status !== 'ready') return { success: false, reason: context.status };
	const games = new Map<number, InstalledGame>();
	let scannedLibraries = 0;
	const issues = [...context.issues];
	for (const library of context.availableLibraries) {
		let entries: string[];
		try {
			entries = fs.readdirSync(library);
			scannedLibraries++;
		} catch (error) {
			issues.push({
				code: 'access-error',
				message: 'Could not list the Steam library.',
				path: library,
				errorCode: errorCode(error)
			});
			continue;
		}
		for (const entry of entries) {
			const match = /^appmanifest_([1-9]\d*)\.acf$/.exec(entry);
			if (!match) continue;
			const appId = Number(match[1]);
			if (!Number.isSafeInteger(appId) || games.has(appId)) continue;
			const result = readGame(appId, library);
			if (result?.game) games.set(appId, result.game);
			else
				issues.push(
					result?.issue ?? {
						code: 'access-error',
						message: 'The manifest disappeared during the library scan.',
						appId,
						path: path.join(library, entry),
						errorCode: 'ENOENT'
					}
				);
		}
	}
	if (!scannedLibraries) return { success: false, reason: 'access-error' };
	return {
		success: true,
		games: [...games.values()].sort((a, b) => a.appId - b.appId),
		steam: context.steam,
		issues
	};
}
