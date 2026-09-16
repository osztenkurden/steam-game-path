<div align="center">

# Steam Game Path

**Find installed Steam games and their library paths by app ID.**

[![npm version](https://img.shields.io/npm/v/steam-game-path?color=cb6b26)](https://www.npmjs.com/package/steam-game-path)
[![CI](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml/badge.svg)](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml)
[![Downloads](https://img.shields.io/npm/dm/steam-game-path)](https://www.npmjs.com/package/steam-game-path)
[![License: GPL 3](https://img.shields.io/badge/license-GPL%203-blue)](LICENSE)

[Quick start](#quick-start) · [API reference](docs/api.md) · [Supported platforms](#supported-platforms) · [Changelog](CHANGELOG.md)

</div>

`steam-game-path` locates Steam, reads its library configuration, and checks game manifests for an installed game. Use it to find game files across the default installation and additional Steam libraries on Windows, Linux, and macOS.

Path lookups are synchronous and use local files. The package has zero runtime dependencies, including its own [VDF parser](docs/vdf.md).

## Quick start

### 1. Install

Requires **Node.js 22.12.0 or newer**. The package uses **ES modules** and includes TypeScript declarations.

```sh
npm install steam-game-path
```

### 2. Find a game

Save as `find-game.mjs`:

```javascript
import { getGamePath } from 'steam-game-path';

const result = getGamePath(730); // Steam app ID for Counter-Strike 2

if (result.success) {
	console.log(result.game.name);
	console.log('Game:', result.game.path);
	console.log('Steam:', result.steam.path);
} else {
	console.error('Lookup failed:', result.reason);
}
```

```sh
node find-game.mjs
```

A successful lookup returns an object like this. Game names and installation directory names come from the local manifest and may differ.

```javascript
{
	success: true,
	game: {
		appId: 730,
		path: 'C:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive',
		name: 'Counter-Strike 2'
	},
	steam: {
		path: 'C:\\Program Files (x86)\\Steam',
		libraries: [
			'C:\\SteamLibrary\\steamapps',
			'C:\\Program Files (x86)\\Steam\\steamapps'
		]
	},
	issues: []
}
```

## API reference

| Function                         | Returns                | Purpose                                      |
| :------------------------------- | :--------------------- | :------------------------------------------- |
| `getGamePath(appId, options?)`   | `GamePathResult`       | Find one installed game.                     |
| `getGamePaths(appIds, options?)` | `GamePathResult[]`     | Find several games with one Steam discovery. |
| `getInstalledGames(options?)`    | `InstalledGamesResult` | List installed games across all libraries.   |
| `getSteamPath()`                 | `string` or `null`     | Locate the Steam installation.               |
| `getSteamLibraries(steamPath)`   | `string[]` or `null`   | Read the configured library paths.           |

Game lookups return `{ success: true, game, steam, issues }` or `{ success: false, reason }`. Check `success` before accessing the data; TypeScript narrows the exported result types automatically. Reasons include `steam-not-found`, `game-not-found`, and `install-directory-missing`. The [API reference](docs/api.md) lists every reason and exported type.

> [!IMPORTANT]
> `getGamePath()` now always returns an object. Replace old `if (!result)` or `if (!result.game)` checks with `if (!result.success)` and read `result.reason` on failure. Successful `game` objects also include `appId`.

### Choose a Steam installation

All three game lookup functions accept `{ steamPath }`. This selects an installation directly and bypasses automatic discovery, including Windows registry queries.

```javascript
import { getGamePath } from 'steam-game-path';

const result = getGamePath(730, { steamPath: 'D:\\Steam' });
```

Supply the Steam installation directory, which contains `steamapps`. Relative paths are resolved against your application's working directory. An unavailable override returns `steam-not-found`; it does not fall back to another installation.

### Find several games

```javascript
import { getGamePaths } from 'steam-game-path';

const appIds = [730, 440, 570];
const results = getGamePaths(appIds);

for (const [index, result] of results.entries()) {
	if (result.success) console.log(result.game.appId, result.game.path);
	else console.log(appIds[index], result.reason);
}
```

Results follow the input order, including duplicates. Steam discovery and library configuration are shared across the batch, and repeated app IDs are searched once. An empty input returns `[]` without accessing Steam.

### List installed games

```javascript
import { getInstalledGames } from 'steam-game-path';

const result = getInstalledGames();

if (result.success) {
	console.table(result.games); // { appId, name, path } entries, sorted by app ID
	for (const issue of result.issues) console.warn(issue.code, issue.path);
} else {
	console.error('Could not scan Steam:', result.reason);
}
```

Games are deduplicated by app ID; the first valid copy in library order wins. Broken manifests and unavailable libraries are reported in `issues` while valid games are retained. An empty `issues` array means no problems were encountered; an empty `games` array can be a successful scan of an empty installation.

### Find Steam and its libraries

```javascript
import { getSteamPath, getSteamLibraries } from 'steam-game-path';

const steamPath = getSteamPath();

if (steamPath) {
	const libraries = getSteamLibraries(steamPath);
	console.log('Steam:', steamPath);
	console.log('Configured libraries:', libraries);
}
```

Pass the Steam installation directory to `getSteamLibraries`, rather than its `steamapps` subdirectory. It supports both legacy string entries and modern object entries in `libraryfolders.vdf`.

This helper returns the configured paths without deduplicating them or adding the default library. It returns `null` when the configuration is missing, unreadable, malformed, or has no library section; an empty section returns `[]`.

### Need executable metadata?

> [!WARNING]
> Executable metadata lookup has been removed from this package to avoid installing the large `steam-user` dependency tree for an optional feature. Use `getGamePath(appId)` for the installation directory. The previous `getGamePath(appId, true)` call and `game.executable` are no longer supported.

If you need launch metadata, install [`steam-user`](https://github.com/DoctorMcKay/node-steam-user) in your application and query it separately:

```sh
npm install steam-user
```

```javascript
import SteamUser from 'steam-user';

function getLaunchMetadata(appId) {
	return new Promise((resolve, reject) => {
		const client = new SteamUser({ autoRelogin: false });
		let settled = false;
		const timeout = setTimeout(() => finish(new Error('Steam lookup timed out')), 10_000);

		function finish(error, launches = null) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			client.logOff();
			if (error) reject(error);
			else resolve(launches);
		}

		client.on('error', error => finish(error));
		client.once('loggedOn', async () => {
			if (settled) return;
			try {
				const { apps } = await client.getProductInfo([appId], []);
				const launches = apps[appId]?.appinfo?.config?.launch;
				finish(null, launches ? Object.values(launches) : null);
			} catch (error) {
				finish(error);
			}
		});

		try {
			client.logOn({ anonymous: true });
		} catch (error) {
			finish(error);
		}
	});
}

try {
	console.log(await getLaunchMetadata(730));
} catch (error) {
	console.error('Could not retrieve launch metadata:', error);
}
```

This standalone example connects to Steam anonymously and requires internet access. It returns launch configuration entries, or `null` when none are available. Entries can describe multiple platforms and launch modes; they are not resolved absolute executable paths. See the [steam-user API](https://github.com/DoctorMcKay/node-steam-user#getproductinfoapps-packages-incltokens-callback) for details.

## Supported platforms

| Platform | Steam location checked                                                                    |
| :------- | :---------------------------------------------------------------------------------------- |
| Windows  | Registry: machine `InstallPath`, then current-user `SteamPath`; 32-bit and 64-bit views   |
| Linux    | `~/.steam/root`, then `~/.var/app/com.valvesoftware.Steam/.local/share/Steam` for Flatpak |
| macOS    | `~/Library/Application Support/Steam`                                                     |

Windows registry lookup calls the built-in `reg.exe` directly through Node.js, with no native addon or bundled executable. It checks both registry views with a shared 5-second timeout budget. Non-ASCII paths depend on the Windows command's output encoding. See [Windows registry implementation](docs/windows-registry.md) for details.

`getSteamPath` returns `null` when Steam cannot be located through these checks. It throws on unsupported operating systems. The game lookup functions return `unsupported-platform` instead, and an explicit `steamPath` bypasses platform discovery. Filesystem failures are reported through `reason` or `issues`; invalid arguments throw `TypeError`.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## License

[GPL 3](LICENSE)
