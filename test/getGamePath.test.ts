import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
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

	function addGame(library = steam.steamAppsDir, createCommonDir = true) {
		steam.addGameManifest(library, {
			appId: 730,
			name: 'Counter-Strike 2',
			installDir: 'Counter-Strike Global Offensive',
			createCommonDir
		});
	}

	it('explains when Steam is not found', () => {
		fs.rmSync(path.join(steam.root, '.steam'), { recursive: true, force: true });
		assert.deepEqual(getGamePath(730), { success: false, reason: 'steam-not-found' });
	});

	it('distinguishes missing and invalid library configuration', () => {
		assert.deepEqual(getGamePath(730), { success: false, reason: 'library-config-missing' });
		steam.writeLibraryFoldersRaw('"Broken { unterminated');
		assert.deepEqual(getGamePath(730), { success: false, reason: 'library-config-invalid' });
	});

	it('returns game-not-found after searching readable libraries', () => {
		steam.writeLibraryFolders([]);
		assert.deepEqual(getGamePath(730), { success: false, reason: 'game-not-found' });
	});

	it('returns the app ID, local game metadata, and unique libraries', () => {
		steam.writeLibraryFolders([steam.steamDir, path.join(steam.steamDir, '.')]);
		addGame();
		assert.deepEqual(getGamePath(730), {
			success: true,
			game: {
				appId: 730,
				name: 'Counter-Strike 2',
				path: path.join(steam.steamAppsDir, 'common', 'Counter-Strike Global Offensive')
			},
			steam: { path: steam.steamDir, libraries: [steam.steamAppsDir] },
			issues: []
		});
	});

	it('resolves a game in a secondary library', () => {
		const root = path.join(steam.root, 'secondary');
		const apps = steam.addLibraryDir(root);
		steam.writeLibraryFolders([root]);
		addGame(apps);
		const result = getGamePath(730);
		assert.ok(result.success);
		assert.equal(result.game.path, path.join(apps, 'common', 'Counter-Strike Global Offensive'));
		assert.deepEqual(result.steam.libraries, [apps, steam.steamAppsDir]);
	});

	it('reports a missing installation directory', () => {
		steam.writeLibraryFolders([]);
		addGame(steam.steamAppsDir, false);
		assert.deepEqual(getGamePath(730), { success: false, reason: 'install-directory-missing' });
	});

	it('rejects a regular file used as the installation directory', () => {
		steam.writeLibraryFolders([]);
		addGame();
		const dir = path.join(steam.steamAppsDir, 'common', 'Counter-Strike Global Offensive');
		fs.rmSync(dir, { recursive: true });
		fs.writeFileSync(dir, 'not a directory');
		assert.deepEqual(getGamePath(730), { success: false, reason: 'install-directory-missing' });
	});

	for (const manifest of [
		'"Broken { unterminated',
		'"AppState"\n{\n"appid" "440"\n"name" "Wrong app"\n"installdir" "CS"\n}',
		'"AppState"\n{\n"appid" "730"\n"installdir" "CS"\n}',
		'"AppState"\n{\n"appid" "730"\n"name" "CS"\n"installdir" "../../outside"\n}'
	]) {
		it(`rejects invalid manifest data: ${manifest}`, () => {
			steam.writeLibraryFolders([]);
			fs.writeFileSync(path.join(steam.steamAppsDir, 'appmanifest_730.acf'), manifest);
			assert.deepEqual(getGamePath(730), { success: false, reason: 'manifest-invalid' });
		});
	}

	it('finds a healthy duplicate after an invalid manifest, retaining the issue', () => {
		const root = path.join(steam.root, 'stale');
		const apps = steam.addLibraryDir(root);
		steam.writeLibraryFolders([root]);
		fs.writeFileSync(path.join(apps, 'appmanifest_730.acf'), '"Broken {');
		addGame();
		const result = getGamePath(730);
		assert.ok(result.success);
		assert.equal(result.game.path, path.join(steam.steamAppsDir, 'common', 'Counter-Strike Global Offensive'));
		assert.equal(result.issues[0]?.code, 'manifest-invalid');
		assert.equal(result.issues[0]?.appId, 730);
	});

	it('retains valid results when another library is unavailable', () => {
		const missing = path.join(steam.root, 'offline');
		steam.writeLibraryFolders([missing]);
		addGame();
		const result = getGamePath(730);
		assert.ok(result.success);
		assert.equal(result.issues[0]?.code, 'access-error');
		assert.equal(result.issues[0]?.path, path.join(missing, 'steamapps'));
		assert.deepEqual(getGamePath(440), { success: false, reason: 'access-error' });
	});

	for (const file of ['libraryfolders.vdf', 'appmanifest_730.acf']) {
		it(`reports access errors for ${file}`, t => {
			steam.writeLibraryFolders([]);
			addGame();
			const original = fs.readFileSync;
			t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
				if (String(args[0]) === path.join(steam.steamAppsDir, file))
					throw Object.assign(new Error('Denied'), { code: 'EACCES' });
				return original(...args);
			});
			assert.deepEqual(getGamePath(730), { success: false, reason: 'access-error' });
		});
	}

	it('uses an explicit installation without calling Windows discovery', t => {
		const restore = setPlatform('win32');
		t.after(restore);
		steam.writeLibraryFolders([]);
		addGame();
		const run = t.mock.method(childProcess, 'execFileSync', () => {
			throw new Error('Unexpected discovery');
		});
		const result = getGamePath(730, { steamPath: steam.steamDir });
		assert.ok(result.success);
		assert.equal(result.steam.path, steam.steamDir);
		assert.equal(run.mock.callCount(), 0);
	});

	it('resolves relative overrides and never falls back from an invalid override', () => {
		steam.writeLibraryFolders([]);
		addGame();
		const result = getGamePath(730, { steamPath: path.relative(process.cwd(), steam.steamDir) });
		assert.ok(result.success);
		assert.equal(result.steam.path, steam.steamDir);
		assert.deepEqual(getGamePath(730, { steamPath: path.join(steam.root, 'missing') }), {
			success: false,
			reason: 'steam-not-found'
		});
	});

	it('supports an explicit location on platforms without automatic discovery', t => {
		const restore = setPlatform('aix');
		t.after(restore);
		steam.writeLibraryFolders([]);
		addGame();
		assert.deepEqual(getGamePath(730), { success: false, reason: 'unsupported-platform' });
		assert.ok(getGamePath(730, { steamPath: steam.steamDir }).success);
	});

	for (const appId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		it(`rejects invalid app ID ${appId}`, () => assert.throws(() => getGamePath(appId), TypeError));
	}
	it('rejects an empty override', () => assert.throws(() => getGamePath(730, { steamPath: ' ' }), TypeError));
	it('deduplicates Windows library paths case-insensitively', t => {
		const restore = setPlatform('win32');
		t.after(restore);
		steam.writeLibraryFolders([steam.steamDir, steam.steamDir.toUpperCase()]);
		addGame();
		const result = getGamePath(730, { steamPath: steam.steamDir });
		assert.ok(result.success);
		assert.deepEqual(result.steam.libraries, [steam.steamAppsDir]);
		assert.deepEqual(result.issues, []);
	});

	for (const target of ['steam', 'game']) {
		it(`reports an inaccessible ${target} directory`, t => {
			steam.writeLibraryFolders([]);
			addGame();
			const filename =
				target === 'steam'
					? steam.steamDir
					: path.join(steam.steamAppsDir, 'common', 'Counter-Strike Global Offensive');
			const original = fs.statSync;
			t.mock.method(fs, 'statSync', (...args: Parameters<typeof fs.statSync>) => {
				if (String(args[0]) === filename) throw Object.assign(new Error('Denied'), { code: 'EACCES' });
				return original(...args);
			});
			assert.deepEqual(getGamePath(730, { steamPath: steam.steamDir }), {
				success: false,
				reason: 'access-error'
			});
		});
	}
});
