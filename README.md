<div align="center">

# Steam Game Path

**Find installed Steam games and their library paths by app ID.**

[![npm version](https://img.shields.io/npm/v/steam-game-path?color=cb6b26)](https://www.npmjs.com/package/steam-game-path)
[![CI](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml/badge.svg)](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml)
[![Downloads](https://img.shields.io/npm/dm/steam-game-path)](https://www.npmjs.com/package/steam-game-path)
[![License: GPL 3](https://img.shields.io/badge/license-GPL%203-blue)](LICENSE)

[Quick start](#quick-start) · [API reference](#api-reference) · [Supported platforms](#supported-platforms) · [Changelog](CHANGELOG.md)

</div>

`steam-game-path` locates Steam, reads its library configuration, and checks game manifests for an installed game. Use it to find game files across the default installation and additional Steam libraries on Windows, Linux, and macOS.

Path lookups are synchronous and use local files. The package has one runtime dependency: the VDF parser.

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

if (!result) {
	console.log('Steam was not found.');
} else if (!result.game) {
	console.log('Game was not found in the Steam libraries.');
	console.log('Steam:', result.steam.path);
} else {
	console.log(result.game.name);
	console.log('Game:', result.game.path);
	console.log('Steam:', result.steam.path);
	console.log('Libraries:', result.steam.libraries);
}
```

```sh
node find-game.mjs
```

A successful lookup returns an object like this. Game names and installation directory names come from the local manifest and may differ.

```javascript
{
	game: {
		path: 'C:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive',
		name: 'Counter-Strike 2'
	},
	steam: {
		path: 'C:\\Program Files (x86)\\Steam',
		libraries: [
			'C:\\SteamLibrary\\steamapps',
			'C:\\Program Files (x86)\\Steam\\steamapps'
		]
	}
}
```

## API reference

| Function                               | Returns                 | Purpose                                         |
| :------------------------------------- | :---------------------- | :---------------------------------------------- |
| `getGamePath(gameId: number)`          | Result object or `null` | Find an installed game and its Steam libraries. |
| `getSteamPath()`                       | `string` or `null`      | Locate the Steam installation.                  |
| `getSteamLibraries(steamPath: string)` | `string[]` or `null`    | Read library paths from a Steam installation.   |

### Find a game

`getGamePath` accepts a numeric Steam app ID and checks library manifests until it finds a matching game with an existing installation directory.

| Result            | Meaning                                                                                                                   |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `null`            | Steam was not found.                                                                                                      |
| `game: null`      | No valid installed game was found, or the library configuration could not be parsed. Steam information is still returned. |
| `game.path`       | The game's installation directory.                                                                                        |
| `game.name`       | The game name recorded in its manifest.                                                                                   |
| `steam.path`      | The Steam installation directory.                                                                                         |
| `steam.libraries` | Unique library paths, each ending in `steamapps`.                                                                         |

If `steamapps/libraryfolders.vdf` is missing or cannot be parsed, the result has `game: null` and `steam.libraries: []`. Otherwise, the default `steamapps` directory is included in the search alongside configured libraries.

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

This helper returns the configured paths without deduplicating them or adding the default library. It returns `null` when the configuration is missing, malformed, or has no library section; an empty section returns `[]`.

### Need executable metadata?

> [!WARNING]
> Executable metadata lookup has been removed from this package to avoid installing the large `steam-user` dependency tree for an optional feature. Use `getGamePath(appId)` for the installation directory. The second argument (`true` or `{ includeLaunchMetadata: true }`), `GetGamePathOptions`, and `game.executable` are no longer part of the API.

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

`getSteamPath` returns `null` when Steam cannot be located through these checks. It throws on unsupported operating systems, as does `getGamePath`. File read errors can also throw, so handle exceptions where your application needs to recover from inaccessible files.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## License

[GPL 3](LICENSE)
