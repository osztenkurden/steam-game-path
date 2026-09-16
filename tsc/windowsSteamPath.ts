import childProcess from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const candidates = [
	['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath', '32'],
	['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath', '64'],
	['HKCU\\SOFTWARE\\Valve\\Steam', 'SteamPath', '32'],
	['HKCU\\SOFTWARE\\Valve\\Steam', 'SteamPath', '64']
] as const;

function parseSteamPath(output: string, valueName: string): string | null {
	for (const line of output.split(/\r?\n/)) {
		const match = /^[\t ]*(\S+)[\t ]+(REG_SZ|REG_EXPAND_SZ)[\t ]+(.+)$/i.exec(line);
		if (!match || match[1]!.toLowerCase() !== valueName.toLowerCase()) continue;

		let value = match[3]!.trim();
		if (match[2]!.toUpperCase() === 'REG_EXPAND_SZ') {
			value = value.replace(/%([^%]+)%/g, (reference: string, name: string) => {
				const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
				return key === undefined ? reference : (process.env[key] ?? reference);
			});
		}

		// Do not return visibly damaged UTF-8 or invalid paths as successful discoveries.
		if (path.win32.isAbsolute(value) && !/[\0\uFFFD]/u.test(value)) return value;
	}
	return null;
}

export function getWindowsSteamPath(): string | null {
	const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
	const executable = path.win32.join(systemRoot, 'System32', 'reg.exe');
	const deadline = performance.now() + 5_000;

	for (const [key, valueName, view] of candidates) {
		const timeout = Math.ceil(deadline - performance.now());
		if (timeout <= 0) return null;

		try {
			// Query only the required value; explicit views avoid depending on Node's architecture.
			const output = childProcess.execFileSync(executable, ['QUERY', key, '/v', valueName, `/reg:${view}`], {
				encoding: 'utf8',
				windowsHide: true,
				shell: false,
				timeout,
				maxBuffer: 64 * 1024,
				stdio: ['ignore', 'pipe', 'ignore']
			});
			const steamPath = parseSteamPath(output, valueName);
			if (steamPath) return steamPath;
		} catch (error) {
			// A nonzero reg exit can mean a missing/inaccessible key: try the next candidate.
			// A spawn failure, timeout, or buffer overflow makes further queries unhelpful.
			if (error instanceof Error && 'code' in error && typeof error.code === 'string') return null;
		}
	}
	return null;
}
