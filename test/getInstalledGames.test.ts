import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getInstalledGames } from '../tsc/index.ts';
import { createFakeSteam, setPlatform, setHome, type FakeSteam } from './helpers/fakeSteam.ts';

describe('getInstalledGames', () => {
	let steam: FakeSteam;
	let restorePlatform: () => void;
	let restoreHome: () => void;
	beforeEach(() => {
		steam = createFakeSteam();
		restorePlatform = setPlatform('linux');
		restoreHome = setHome(steam.root);
	});
	afterEach(() => {
		restoreHome();
		restorePlatform();
		steam.cleanup();
	});

	it('enumerates unique games across libraries in app ID order', () => {
		const root = path.join(steam.root, 'secondary');
		const apps = steam.addLibraryDir(root);
		steam.writeLibraryFolders([root, root, steam.steamDir]);
		steam.addGameManifest(apps, { appId: 730, name: 'Preferred copy', installDir: 'CS' });
		steam.addGameManifest(steam.steamAppsDir, { appId: 730, name: 'Other copy', installDir: 'CS' });
		steam.addGameManifest(steam.steamAppsDir, { appId: 440, name: 'TF2', installDir: 'TF2' });
		fs.writeFileSync(path.join(apps, 'unrelated.acf'), 'not an app manifest');
		fs.writeFileSync(path.join(apps, 'appmanifest_0.acf'), 'invalid ID');
		const result = getInstalledGames({ steamPath: steam.steamDir });
		assert.ok(result.success);
		assert.deepEqual(result.games, [
			{ appId: 440, name: 'TF2', path: path.join(steam.steamAppsDir, 'common', 'TF2') },
			{ appId: 730, name: 'Preferred copy', path: path.join(apps, 'common', 'CS') }
		]);
		assert.deepEqual(result.issues, []);
		assert.deepEqual(result.steam.libraries, [apps, steam.steamAppsDir]);
	});

	it('keeps valid games and reports broken manifests, missing installations, and offline libraries', () => {
		steam.writeLibraryFolders([path.join(steam.root, 'offline')]);
		steam.addGameManifest(steam.steamAppsDir, { appId: 440, name: 'TF2', installDir: 'TF2' });
		steam.addGameManifest(steam.steamAppsDir, { appId: 730, name: 'CS', installDir: 'CS', createCommonDir: false });
		fs.writeFileSync(path.join(steam.steamAppsDir, 'appmanifest_570.acf'), '"Broken {');
		const result = getInstalledGames();
		assert.ok(result.success);
		assert.deepEqual(
			result.games.map(game => game.appId),
			[440]
		);
		assert.deepEqual(result.issues.map(issue => issue.code).sort(), [
			'access-error',
			'install-directory-missing',
			'manifest-invalid'
		]);
	});

	it('can find a healthy copy after a stale duplicate', () => {
		const root = path.join(steam.root, 'stale');
		const apps = steam.addLibraryDir(root);
		steam.writeLibraryFolders([root]);
		steam.addGameManifest(apps, { appId: 730, name: 'CS', installDir: 'CS', createCommonDir: false });
		steam.addGameManifest(steam.steamAppsDir, { appId: 730, name: 'CS', installDir: 'CS' });
		const result = getInstalledGames();
		assert.ok(result.success);
		assert.equal(result.games.length, 1);
		assert.equal(result.games[0]?.path, path.join(steam.steamAppsDir, 'common', 'CS'));
		assert.equal(result.issues[0]?.code, 'install-directory-missing');
	});

	it('distinguishes an empty installation from discovery/configuration failures', () => {
		assert.deepEqual(getInstalledGames(), { success: false, reason: 'library-config-missing' });
		steam.writeLibraryFolders([]);
		const empty = getInstalledGames();
		assert.ok(empty.success);
		assert.deepEqual(empty.games, []);
		assert.deepEqual(empty.issues, []);
		fs.rmSync(path.join(steam.root, '.steam'), { recursive: true, force: true });
		assert.deepEqual(getInstalledGames(), { success: false, reason: 'steam-not-found' });
	});

	it('reports when no library can be listed', t => {
		steam.writeLibraryFolders([]);
		t.mock.method(fs, 'readdirSync', () => {
			throw Object.assign(new Error('Denied'), { code: 'EACCES' });
		});
		assert.deepEqual(getInstalledGames(), { success: false, reason: 'access-error' });
	});

	it('reads configuration and each unique library once', t => {
		steam.writeLibraryFolders([steam.steamDir, steam.steamDir]);
		steam.addGameManifest(steam.steamAppsDir, { appId: 730, name: 'CS', installDir: 'CS' });
		const read = t.mock.method(fs, 'readFileSync');
		const list = t.mock.method(fs, 'readdirSync');
		assert.ok(getInstalledGames().success);
		assert.equal(read.mock.callCount(), 2);
		assert.equal(list.mock.callCount(), 1);
	});
	it('continues enumeration after one library cannot be listed', t => {
		const root = path.join(steam.root, 'unreadable');
		const apps = steam.addLibraryDir(root);
		steam.writeLibraryFolders([root]);
		steam.addGameManifest(steam.steamAppsDir, { appId: 730, name: 'CS', installDir: 'CS' });
		const original = fs.readdirSync;
		t.mock.method(fs, 'readdirSync', (...args: Parameters<typeof fs.readdirSync>) => {
			if (String(args[0]) === apps) throw Object.assign(new Error('Denied'), { code: 'EACCES' });
			return original(...args);
		});
		const result = getInstalledGames();
		assert.ok(result.success);
		assert.deepEqual(
			result.games.map(game => game.appId),
			[730]
		);
		assert.equal(result.issues[0]?.path, apps);
		assert.equal(result.issues[0]?.errorCode, 'EACCES');
	});
});
