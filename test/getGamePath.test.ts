import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getGamePath } from '../tsc/index.ts';
import { createFakeSteam, setHome, setPlatform, type FakeSteam } from './helpers/fakeSteam.ts';

describe('getGamePath', () => {
	let steam: FakeSteam;
	let restorePlatform: () => void;
	let restoreHome: () => void;

	beforeEach(() => {
		steam = createFakeSteam({ layout: 'linux' });
		restorePlatform = setPlatform('linux');
		restoreHome = setHome(steam.root);
	});

	afterEach(() => {
		restoreHome();
		restorePlatform();
		steam.cleanup();
	});

	it('returns null when Steam is not found', () => {
		fs.rmSync(path.join(steam.root, '.steam'), { recursive: true, force: true });

		assert.equal(getGamePath(730), null);
	});

	it('returns empty libraries when libraryfolders.vdf is missing', () => {
		assert.deepEqual(getGamePath(730), {
			game: null,
			steam: {
				path: steam.steamDir,
				libraries: []
			}
		});
	});

	it('returns empty libraries when libraryfolders.vdf is malformed', () => {
		steam.writeLibraryFoldersRaw('"Broken { unterminated');

		assert.deepEqual(getGamePath(730), {
			game: null,
			steam: {
				path: steam.steamDir,
				libraries: []
			}
		});
	});

	it('returns game:null when no manifest exists in any library', () => {
		const libA = path.join(steam.root, 'libA');
		steam.addLibraryDir(libA);
		steam.writeLibraryFolders([libA]);

		const result = getGamePath(730);
		assert.ok(result, 'expected a SteamPath result');
		assert.equal(result.game, null);
		assert.equal(result.steam.path, steam.steamDir);
		assert.deepEqual(
			[...result.steam.libraries].sort(),
			[path.join(libA, 'steamapps'), path.join(steam.steamDir, 'steamapps')].sort()
		);
	});

	it('resolves a game installed in the default steamapps directory', () => {
		steam.writeLibraryFolders([]);
		steam.addGameManifest(steam.steamAppsDir, {
			appId: 730,
			name: 'Counter-Strike',
			installDir: 'Counter-Strike Global Offensive'
		});

		const result = getGamePath(730);
		assert.ok(result?.game);
		assert.equal(result.game.name, 'Counter-Strike');
		assert.equal(result.game.path, path.join(steam.steamAppsDir, 'common', 'Counter-Strike Global Offensive'));
		assert.equal(result.steam.path, steam.steamDir);
	});

	it('resolves a game installed in a secondary library', () => {
		const libB = path.join(steam.root, 'libB');
		const libBApps = steam.addLibraryDir(libB);
		steam.writeLibraryFolders([libB]);
		steam.addGameManifest(libBApps, {
			appId: 440,
			name: 'Team Fortress 2',
			installDir: 'Team Fortress 2'
		});

		const result = getGamePath(440);
		assert.ok(result?.game);
		assert.equal(result.game.name, 'Team Fortress 2');
		assert.equal(result.game.path, path.join(libBApps, 'common', 'Team Fortress 2'));
	});

	it('returns game:null when the manifest exists but the install directory is missing', () => {
		steam.writeLibraryFolders([]);
		steam.addGameManifest(steam.steamAppsDir, {
			appId: 730,
			name: 'Counter-Strike',
			installDir: 'Counter-Strike Global Offensive',
			createCommonDir: false
		});

		const result = getGamePath(730);
		assert.ok(result);
		assert.equal(result.game, null);
	});

	it('deduplicates libraries when the default steamapps is also listed explicitly', () => {
		steam.writeLibraryFolders([steam.steamDir]);

		const result = getGamePath(999);
		assert.ok(result);
		const defaultApps = path.join(steam.steamDir, 'steamapps');
		const count = result.steam.libraries.filter(l => l === defaultApps).length;
		assert.equal(
			count,
			1,
			`expected default steamapps to appear exactly once: ${JSON.stringify(result.steam.libraries)}`
		);
	});

	it('does not attach an executable promise when findExecutable is not set', () => {
		steam.writeLibraryFolders([]);
		steam.addGameManifest(steam.steamAppsDir, {
			appId: 730,
			name: 'CS',
			installDir: 'CS'
		});

		const result = getGamePath(730);
		assert.ok(result?.game);
		assert.equal(result.game.executable, undefined);
	});
});
