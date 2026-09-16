<div align="center">

# Steam Game Path

**Find installed Steam games and their library paths by app ID.**

[![npm version](https://img.shields.io/npm/v/steam-game-path?color=cb6b26)](https://www.npmjs.com/package/steam-game-path)
[![CI](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml/badge.svg)](https://github.com/osztenkurden/steam-game-path/actions/workflows/main.yaml)
[![Downloads](https://img.shields.io/npm/dm/steam-game-path)](https://www.npmjs.com/package/steam-game-path)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

[Quick start](#quick-start) · [API reference](#api-reference) · [Supported platforms](#supported-platforms) · [Changelog](CHANGELOG.md)

</div>

`steam-game-path` locates Steam, reads its library configuration, and checks game manifests for an installed game. Use it to find game files across the default installation and additional Steam libraries on Windows, Linux, and macOS.

Path lookups are synchronous and use local files. You can also request launch metadata from Steam through an optional asynchronous lookup.

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

| Function                                              | Returns                 | Purpose                                         |
| :---------------------------------------------------- | :---------------------- | :---------------------------------------------- |
| `getGamePath(gameId: number, findExecutable = false)` | Result object or `null` | Find an installed game and its Steam libraries. |
| `getSteamPath()`                                      | `string` or `null`      | Locate the Steam installation.                  |
| `getSteamLibraries(steamPath: string)`                | `string[]` or `null`    | Read library paths from a Steam installation.   |

### Find a game

`getGamePath` accepts a numeric Steam app ID and checks library manifests until it finds a matching game with an existing installation directory.

| Result            | Meaning                                                                                                                   |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `null`            | Steam was not found.                                                                                                      |
| `game: null`      | No valid installed game was found, or the library configuration could not be parsed. Steam information is still returned. |
| `game.path`       | The game's installation directory.                                                                                        |
| `game.name`       | The game name recorded in its manifest.                                                                                   |
| `game.executable` | Present only when `findExecutable` is `true` and a game is found; a promise for launch metadata.                          |
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

### Retrieve launch metadata

Pass `true` as the second argument to attach an `executable` promise to the game object. The path lookup still returns synchronously; await the nested promise to retrieve launch entries.

```javascript
import { getGamePath } from 'steam-game-path';

try {
	const result = getGamePath(730, true);

	if (result?.game?.executable) {
		const launches = await result.game.executable;
		console.log('Launch entries:', launches);
	}
} catch (error) {
	console.error('Could not retrieve launch metadata:', error);
}
```

This lookup connects to Steam anonymously using `steam-user` and requires internet access. The promise resolves to an array of launch configuration objects, or `null` if no launch information is available. These are Steam metadata entries, not resolved absolute executable paths. The lookup has a 10-second timeout that rejects the promise.

## Supported platforms

| Platform | Steam location checked                                                                    |
| :------- | :---------------------------------------------------------------------------------------- |
| Windows  | `InstallPath` in `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam`                    |
| Linux    | `~/.steam/root`, then `~/.var/app/com.valvesoftware.Steam/.local/share/Steam` for Flatpak |
| macOS    | `~/Library/Application Support/Steam`                                                     |

`getSteamPath` returns `null` when Steam cannot be located through these checks. It throws on unsupported operating systems, as does `getGamePath`. File read errors can also throw, so handle exceptions where your application needs to recover from inaccessible files.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

## License

[GPL-3.0](LICENSE)
