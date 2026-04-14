import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getSteamLibraries } from '../tsc/index.ts';
import { createFakeSteam, type FakeSteam } from './helpers/fakeSteam.ts';

describe('getSteamLibraries', () => {
	let steam: FakeSteam | null = null;

	afterEach(() => {
		steam?.cleanup();
		steam = null;
	});

	it('returns null when libraryfolders.vdf does not exist', () => {
		steam = createFakeSteam();
		assert.equal(getSteamLibraries(steam.steamDir), null);
	});

	it('parses modern object-format VDF into <path>/steamapps entries', () => {
		steam = createFakeSteam();
		const libA = path.join(steam.root, 'libA');
		const libB = path.join(steam.root, 'libB');
		steam.writeLibraryFolders([libA, libB], { format: 'object' });

		assert.deepEqual(getSteamLibraries(steam.steamDir), [
			path.join(libA, 'steamapps'),
			path.join(libB, 'steamapps')
		]);
	});

	it('parses legacy string-format VDF', () => {
		steam = createFakeSteam();
		const libA = path.join(steam.root, 'legacy');
		steam.writeLibraryFolders([libA], { format: 'legacy' });

		assert.deepEqual(getSteamLibraries(steam.steamDir), [path.join(libA, 'steamapps')]);
	});

	it('accepts lowercase libraryfolders key', () => {
		steam = createFakeSteam();
		const libA = path.join(steam.root, 'lowercase');
		steam.writeLibraryFolders([libA], { key: 'libraryfolders' });

		assert.deepEqual(getSteamLibraries(steam.steamDir), [path.join(libA, 'steamapps')]);
	});

	it('returns null on malformed VDF', () => {
		steam = createFakeSteam();
		steam.writeLibraryFoldersRaw('"Unterminated { block without close');

		assert.equal(getSteamLibraries(steam.steamDir), null);
	});

	it('returns null when VDF has no libraries section', () => {
		steam = createFakeSteam();
		steam.writeLibraryFoldersRaw('"UnrelatedRoot"\n{\n\t"0"\t\t"value"\n}\n');

		assert.equal(getSteamLibraries(steam.steamDir), null);
	});

	it('skips falsy entries without crashing', () => {
		steam = createFakeSteam();
		const libA = path.join(steam.root, 'withNull');
		steam.writeLibraryFolders([libA], { format: 'legacy', includeNullEntry: true });

		assert.deepEqual(getSteamLibraries(steam.steamDir), [path.join(libA, 'steamapps')]);
	});

	it('does not deduplicate results', () => {
		steam = createFakeSteam();
		const libA = path.join(steam.root, 'dup');
		steam.writeLibraryFolders([libA, libA], { format: 'object' });

		assert.deepEqual(getSteamLibraries(steam.steamDir), [
			path.join(libA, 'steamapps'),
			path.join(libA, 'steamapps')
		]);
	});
});
