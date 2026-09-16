import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { getGamePaths } from '../tsc/index.ts';
import { createFakeSteam, setPlatform, setHome, type FakeSteam } from './helpers/fakeSteam.ts';

describe('getGamePaths', () => {
	let steam: FakeSteam;
	let restorePlatform: () => void;
	let restoreHome: () => void;
	beforeEach(() => {
		steam = createFakeSteam();
		steam.writeLibraryFolders([steam.steamDir]);
		for (const appId of [730, 440])
			steam.addGameManifest(steam.steamAppsDir, { appId, name: `Game ${appId}`, installDir: `Game ${appId}` });
		restorePlatform = setPlatform('linux');
		restoreHome = setHome(steam.root);
	});
	afterEach(() => {
		restoreHome();
		restorePlatform();
		steam.cleanup();
	});

	it('preserves input order and duplicates, and reads each requested game once', t => {
		const read = t.mock.method(fs, 'readFileSync');
		const results = getGamePaths([730, 999, 440, 730], { steamPath: steam.steamDir });
		assert.deepEqual(
			results.map(result => (result.success ? result.game.appId : result.reason)),
			[730, 'game-not-found', 440, 730]
		);
		const files = read.mock.calls.map(call => String(call.arguments[0]));
		for (const name of [
			'libraryfolders.vdf',
			'appmanifest_730.acf',
			'appmanifest_440.acf',
			'appmanifest_999.acf'
		]) {
			assert.equal(files.filter(file => file === path.join(steam.steamAppsDir, name)).length, 1, name);
		}
	});

	it('performs Windows discovery once for the entire batch', t => {
		const restore = setPlatform('win32');
		t.after(restore);
		const run = t.mock.method(
			childProcess,
			'execFileSync',
			() => `\n    InstallPath    REG_SZ    ${steam.steamDir}\n`
		);
		assert.ok(getGamePaths([730, 440]).every(result => result.success));
		assert.equal(run.mock.callCount(), 1);
	});

	it('returns a failure for each request if configuration is missing', () => {
		fs.rmSync(path.join(steam.steamAppsDir, 'libraryfolders.vdf'));
		assert.deepEqual(getGamePaths([730, 440]), [
			{ success: false, reason: 'library-config-missing' },
			{ success: false, reason: 'library-config-missing' }
		]);
	});

	it('does no filesystem or registry discovery for an empty batch', t => {
		const read = t.mock.method(fs, 'readFileSync');
		const stat = t.mock.method(fs, 'statSync');
		const run = t.mock.method(childProcess, 'execFileSync');
		assert.deepEqual(getGamePaths([]), []);
		assert.equal(read.mock.callCount(), 0);
		assert.equal(stat.mock.callCount(), 0);
		assert.equal(run.mock.callCount(), 0);
	});

	it('validates the entire batch before starting filesystem work', t => {
		const read = t.mock.method(fs, 'readFileSync');
		assert.throws(() => getGamePaths([730, -1]), TypeError);
		assert.equal(read.mock.callCount(), 0);
	});
	it('rejects invalid options even for an empty batch', () => {
		assert.throws(() => getGamePaths([], { steamPath: '' }), TypeError);
		// @ts-expect-error JavaScript callers can supply a non-array argument.
		assert.throws(() => getGamePaths(730), TypeError);
	});
});
