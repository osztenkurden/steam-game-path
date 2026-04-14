import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getSteamPath } from '../tsc/index.ts';
import { createFakeSteam, setHome, setPlatform, type FakeSteam } from './helpers/fakeSteam.ts';

describe('getSteamPath — linux', () => {
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

	it('returns <home>/.steam/root when it exists', () => {
		assert.equal(getSteamPath(), path.join(steam.root, '.steam', 'root'));
	});

	it('falls back to Flatpak path when primary does not exist', () => {
		fs.rmSync(path.join(steam.root, '.steam'), { recursive: true, force: true });
		const flatpakPath = path.join(steam.root, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam');
		fs.mkdirSync(flatpakPath, { recursive: true });

		assert.equal(getSteamPath(), flatpakPath);
	});

	it('returns null when neither primary nor Flatpak path exists', () => {
		fs.rmSync(path.join(steam.root, '.steam'), { recursive: true, force: true });

		assert.equal(getSteamPath(), null);
	});
});

describe('getSteamPath — darwin', () => {
	let steam: FakeSteam;
	let restorePlatform: () => void;
	let restoreHome: () => void;

	beforeEach(() => {
		steam = createFakeSteam({ layout: 'darwin' });
		restorePlatform = setPlatform('darwin');
		restoreHome = setHome(steam.root);
	});

	afterEach(() => {
		restoreHome();
		restorePlatform();
		steam.cleanup();
	});

	it('returns <home>/Library/Application Support/Steam when it exists', () => {
		assert.equal(getSteamPath(), path.join(steam.root, 'Library', 'Application Support', 'Steam'));
	});

	it('returns null when the macOS Steam path does not exist', () => {
		fs.rmSync(path.join(steam.root, 'Library'), { recursive: true, force: true });

		assert.equal(getSteamPath(), null);
	});
});

describe('getSteamPath — unsupported', () => {
	it('throws on an unsupported platform', () => {
		const restore = setPlatform('aix' as NodeJS.Platform);
		try {
			assert.throws(() => getSteamPath(), /Unsupported operating system/);
		} finally {
			restore();
		}
	});
});
