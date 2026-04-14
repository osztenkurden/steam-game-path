import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LibraryFoldersFormat = 'object' | 'legacy';
export type LibraryFoldersKey = 'LibraryFolders' | 'libraryfolders';

export interface FakeSteamOptions {
	layout?: 'linux' | 'darwin' | 'custom';
	customSteamDir?: string;
}

export interface FakeSteam {
	root: string;
	steamDir: string;
	steamAppsDir: string;
	writeLibraryFolders(
		libraryPaths: string[],
		options?: { key?: LibraryFoldersKey; format?: LibraryFoldersFormat; includeNullEntry?: boolean }
	): void;
	writeLibraryFoldersRaw(content: string): void;
	addLibraryDir(libraryPath: string): string;
	addGameManifest(
		libraryAppsDir: string,
		manifest: { appId: number; name: string; installDir: string; createCommonDir?: boolean }
	): void;
	cleanup(): void;
}

export function createFakeSteam(options: FakeSteamOptions = {}): FakeSteam {
	const layout = options.layout ?? 'linux';
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sgp-'));

	let steamDir: string;
	if (layout === 'linux') {
		steamDir = path.join(root, '.steam', 'root');
	} else if (layout === 'darwin') {
		steamDir = path.join(root, 'Library', 'Application Support', 'Steam');
	} else {
		steamDir = options.customSteamDir ?? path.join(root, 'steam');
	}

	fs.mkdirSync(steamDir, { recursive: true });
	const steamAppsDir = path.join(steamDir, 'steamapps');
	fs.mkdirSync(steamAppsDir, { recursive: true });

	return {
		root,
		steamDir,
		steamAppsDir,

		writeLibraryFolders(libraryPaths, opts = {}) {
			const key = opts.key ?? 'LibraryFolders';
			const format = opts.format ?? 'object';
			const lines: string[] = [];
			lines.push(`"${key}"`);
			lines.push('{');
			for (let i = 0; i < libraryPaths.length; i++) {
				const p = libraryPaths[i]!;
				if (format === 'legacy') {
					lines.push(`\t"${i}"\t\t"${escapeVdf(p)}"`);
				} else {
					lines.push(`\t"${i}"`);
					lines.push('\t{');
					lines.push(`\t\t"path"\t\t"${escapeVdf(p)}"`);
					lines.push('\t}');
				}
			}
			if (opts.includeNullEntry) {
				lines.push(`\t"${libraryPaths.length}"\t\t""`);
			}
			lines.push('}');
			fs.writeFileSync(path.join(steamAppsDir, 'libraryfolders.vdf'), lines.join('\n') + '\n', 'utf8');
		},

		writeLibraryFoldersRaw(content) {
			fs.writeFileSync(path.join(steamAppsDir, 'libraryfolders.vdf'), content, 'utf8');
		},

		addLibraryDir(libraryPath) {
			const appsDir = path.join(libraryPath, 'steamapps');
			fs.mkdirSync(appsDir, { recursive: true });
			return appsDir;
		},

		addGameManifest(libraryAppsDir, manifest) {
			fs.mkdirSync(libraryAppsDir, { recursive: true });
			const content =
				`"AppState"\n` +
				`{\n` +
				`\t"appid"\t\t"${manifest.appId}"\n` +
				`\t"name"\t\t"${escapeVdf(manifest.name)}"\n` +
				`\t"installdir"\t\t"${escapeVdf(manifest.installDir)}"\n` +
				`}\n`;
			fs.writeFileSync(path.join(libraryAppsDir, `appmanifest_${manifest.appId}.acf`), content, 'utf8');
			if (manifest.createCommonDir !== false) {
				fs.mkdirSync(path.join(libraryAppsDir, 'common', manifest.installDir), { recursive: true });
			}
		},

		cleanup() {
			fs.rmSync(root, { recursive: true, force: true });
		}
	};
}

function escapeVdf(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function setPlatform(platform: NodeJS.Platform): () => void {
	const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
	Object.defineProperty(process, 'platform', {
		value: platform,
		configurable: true,
		writable: original.writable ?? true,
		enumerable: original.enumerable ?? true
	});
	return () => {
		Object.defineProperty(process, 'platform', original);
	};
}

export function setHome(dir: string): () => void {
	const origHome = process.env['HOME'];
	const origUser = process.env['USERPROFILE'];
	process.env['HOME'] = dir;
	process.env['USERPROFILE'] = dir;
	return () => {
		if (origHome === undefined) delete process.env['HOME'];
		else process.env['HOME'] = origHome;
		if (origUser === undefined) delete process.env['USERPROFILE'];
		else process.env['USERPROFILE'] = origUser;
	};
}
