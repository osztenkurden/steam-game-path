import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { getSteamPath } from '../tsc/index.ts';
import { setPlatform, createFakeSteam, setHome } from './helpers/fakeSteam.ts';

const isWindows = process.platform === 'win32';

function queryOutput(value: string, name = 'InstallPath', type = 'REG_SZ'): string {
	return `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Valve\\Steam\r\n    ${name}    ${type}    ${value}\r\n\r\n`;
}

function missingValue(): never {
	throw Object.assign(new Error('reg exited with code 1'), { status: 1 });
}

describe('getSteamPath — reg.exe', () => {
	let restorePlatform: () => void;

	beforeEach(() => {
		restorePlatform = setPlatform('win32');
	});

	afterEach(() => restorePlatform());

	for (const steamPath of [
		'C:\\Program Files (x86)\\Steam',
		'D:\\Spil\\Søren 日本語 🎮\\Steam',
		"D:\\Games & tools\\Bob's $team (100%)!\\Steam",
		'D:\\Games  with  spaces\\Steam',
		'\\\\server\\games\\Steam'
	]) {
		it(`parses UTF-8 query output for ${steamPath}`, t => {
			t.mock.method(childProcess, 'execFileSync', () => queryOutput(steamPath));
			assert.equal(getSteamPath(), steamPath);
		});
	}

	it('queries a named value in the 32-bit view directly, without a shell', t => {
		const run = t.mock.method(childProcess, 'execFileSync', () => queryOutput('C:\\Steam'));
		assert.equal(getSteamPath(), 'C:\\Steam');
		assert.equal(run.mock.callCount(), 1);
		const [executable, args, options] = run.mock.calls[0]!.arguments;
		assert.match(String(executable), /^[A-Za-z]:\\.*\\System32\\reg\.exe$/i);
		assert.deepEqual(args, ['QUERY', 'HKLM\\SOFTWARE\\Valve\\Steam', '/v', 'InstallPath', '/reg:32']);
		assert.equal(options?.shell, false);
		assert.equal(options?.windowsHide, true);
		assert.ok(options?.timeout && options.timeout > 0 && options.timeout <= 5_000);
		assert.equal(options?.maxBuffer, 64 * 1024);
	});

	it('handles tabs, case differences, and extra headers without confusing the value name', t => {
		t.mock.method(
			childProcess,
			'execFileSync',
			() => 'Header\n    OtherPath REG_SZ C:\\Wrong\n\tinstallpath\treg_sz\tD:\\Steam\n'
		);
		assert.equal(getSteamPath(), 'D:\\Steam');
	});

	it('expands environment variables only for REG_EXPAND_SZ', t => {
		const envName = 'SGP_REGISTRY_TEST_ROOT';
		const previous = process.env[envName];
		process.env[envName] = 'D:\\Game Files';
		t.after(() => {
			if (previous === undefined) delete process.env[envName];
			else process.env[envName] = previous;
		});
		const run = t.mock.method(childProcess, 'execFileSync', () =>
			queryOutput('%sgp_registry_test_root%\\Steam', 'InstallPath', 'REG_EXPAND_SZ')
		);
		assert.equal(getSteamPath(), 'D:\\Game Files\\Steam');
		run.mock.mockImplementation(() => queryOutput('C:\\%sgp_registry_test_root%\\Steam'));
		assert.equal(getSteamPath(), 'C:\\%sgp_registry_test_root%\\Steam');
	});

	for (const target of [1, 2, 3]) {
		it(`falls back in order to candidate ${target + 1}`, t => {
			let calls = 0;
			const run = t.mock.method(childProcess, 'execFileSync', () => {
				if (calls++ !== target) return missingValue();
				return queryOutput('D:\\Steam', target < 2 ? 'InstallPath' : 'SteamPath');
			});
			assert.equal(getSteamPath(), 'D:\\Steam');
			assert.deepEqual(
				run.mock.calls.map(call => call.arguments[1]),
				[
					['QUERY', 'HKLM\\SOFTWARE\\Valve\\Steam', '/v', 'InstallPath', '/reg:32'],
					['QUERY', 'HKLM\\SOFTWARE\\Valve\\Steam', '/v', 'InstallPath', '/reg:64'],
					['QUERY', 'HKCU\\SOFTWARE\\Valve\\Steam', '/v', 'SteamPath', '/reg:32'],
					['QUERY', 'HKCU\\SOFTWARE\\Valve\\Steam', '/v', 'SteamPath', '/reg:64']
				].slice(0, target + 1)
			);
		});
	}

	for (const output of [
		'',
		'Access denied',
		queryOutput(''),
		queryOutput('relative\\Steam'),
		queryOutput('C:\\Steam\0oops'),
		queryOutput('C:\\S\uFFFDren\\Steam'),
		queryOutput('C:\\Wrong', 'OtherPath'),
		queryOutput('123', 'InstallPath', 'REG_DWORD'),
		queryOutput('C:\\Steam', 'InstallPath', 'REG_MULTI_SZ')
	]) {
		it(`returns null for absent or invalid output ${JSON.stringify(output)}`, t => {
			t.mock.method(childProcess, 'execFileSync', () => output);
			assert.equal(getSteamPath(), null);
		});
	}

	it('continues after an unusable value', t => {
		let calls = 0;
		t.mock.method(childProcess, 'execFileSync', () => queryOutput(calls++ === 0 ? 'relative' : 'D:\\Steam'));
		assert.equal(getSteamPath(), 'D:\\Steam');
	});

	it('returns null when all registry queries exit unsuccessfully', t => {
		const run = t.mock.method(childProcess, 'execFileSync', missingValue);
		assert.equal(getSteamPath(), null);
		assert.equal(run.mock.callCount(), 4);
	});

	for (const code of ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS']) {
		it(`stops querying when the subprocess fails with ${code}`, t => {
			const run = t.mock.method(childProcess, 'execFileSync', () => {
				throw Object.assign(new Error(code), { code });
			});
			assert.equal(getSteamPath(), null);
			assert.equal(run.mock.callCount(), 1);
		});
	}

	it('shares one five-second timeout budget across fallback queries', t => {
		let now = 0;
		t.mock.method(performance, 'now', () => now);
		const run = t.mock.method(childProcess, 'execFileSync', () => {
			now += 3_000;
			return missingValue();
		});
		assert.equal(getSteamPath(), null);
		assert.deepEqual(
			run.mock.calls.map(call => call.arguments[2]?.timeout),
			[5_000, 2_000]
		);
	});
});

it('does not launch a registry process for Linux discovery', t => {
	const steam = createFakeSteam({ layout: 'linux' });
	const restorePlatform = setPlatform('linux');
	const restoreHome = setHome(steam.root);
	t.after(() => {
		restoreHome();
		restorePlatform();
		steam.cleanup();
	});
	const run = t.mock.method(childProcess, 'execFileSync', () => {
		throw new Error('Unexpected subprocess');
	});
	assert.equal(getSteamPath(), steam.steamDir);
	assert.equal(run.mock.callCount(), 0);
});

// Redirect only the query key to an isolated HKCU fixture; never modify Steam's real keys.
for (const valueName of ['InstallPath', 'SteamPath']) {
	it(`reads ${valueName} using real reg.exe`, { skip: !isWindows }, t => {
		const fixtureKey = `HKCU\\SOFTWARE\\steam-game-path-tests\\${randomUUID()}`;
		const steamPath = "D:\\Game Files & Tools\\Bob's $team (100%)!";
		const nativeExec = childProcess.execFileSync;
		const executable = path.win32.join(
			process.env.SystemRoot || process.env.windir || 'C:\\Windows',
			'System32',
			'reg.exe'
		);
		const options: childProcess.ExecFileSyncOptionsWithStringEncoding = {
			encoding: 'utf8',
			shell: false,
			windowsHide: true,
			timeout: 5_000,
			stdio: ['ignore', 'pipe', 'pipe']
		};
		nativeExec(
			executable,
			['ADD', fixtureKey, '/v', valueName, '/t', 'REG_SZ', '/d', steamPath, '/f', '/reg:32'],
			options
		);
		t.after(() => {
			nativeExec(executable, ['DELETE', fixtureKey, '/f', '/reg:32'], options);
		});
		t.mock.method(
			childProcess,
			'execFileSync',
			(file: string, args: string[], opts: childProcess.ExecFileSyncOptionsWithStringEncoding) => {
				return nativeExec(file, [args[0]!, fixtureKey, ...args.slice(2)], opts);
			}
		);
		assert.equal(getSteamPath(), steamPath);
	});
}
