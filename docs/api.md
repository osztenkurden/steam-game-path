# API reference

All functions are synchronous. Imports use ES modules:

```typescript
import {
	getGamePath,
	getGamePaths,
	getInstalledGames,
	type GamePathOptions,
	type GamePathResult
} from 'steam-game-path';
```

## Game lookup results

`getGamePath(appId, options?)` returns a discriminated union:

```typescript
type GamePathResult =
	| { success: true; game: InstalledGame; steam: SteamInstallation; issues: LookupIssue[] }
	| { success: false; reason: LookupFailureReason };
```

- `InstalledGame`: `{ appId: number, name: string, path: string }`.
- `SteamInstallation`: `{ path: string, libraries: string[] }`. Library paths end in `steamapps`.
- `LookupIssue`: `{ code, message, path?, appId?, errorCode? }`. `errorCode` is a filesystem error code when available.

A success always includes an existing installation directory and a manifest with matching app ID, name, and installation-directory fields. The result contains no executable lookup or network metadata.

```javascript
const result = getGamePath(730);

if (result.success) {
	console.log(result.game.path);
} else {
	console.log(result.reason);
}
```

Failures have exactly `success` and `reason`; they do not contain `game`, `steam`, or `issues`. A success can include `issues` from libraries or manifests skipped before finding a valid game. Issues describe incomplete searches without hiding a usable result.

## Options and validation

`GamePathOptions` is `{ steamPath?: string }`. All three game lookup functions accept it.

`steamPath` selects the directory containing Steam's `steamapps` folder. It bypasses automatic discovery and can be used on platforms without a built-in detector. Relative overrides are resolved against the current working directory. A missing override never falls back to automatic discovery.

App IDs must be positive safe integers. Invalid app IDs, a non-array batch argument, and empty or invalid `steamPath` options throw `TypeError`. Lookup failures return results instead of throwing. The entire batch of IDs is validated before lookup starts.

## Failure reasons

| `reason`                    | Meaning                                                                                                                                                                                                   |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steam-not-found`           | Automatic discovery could not locate Steam, or the selected installation path does not exist or is not a directory. Discovery also returns this when Windows registry queries are unavailable or blocked. |
| `unsupported-platform`      | Automatic discovery is unavailable on this operating system. Supply `steamPath` to bypass it.                                                                                                             |
| `library-config-missing`    | `steamapps/libraryfolders.vdf` is missing.                                                                                                                                                                |
| `library-config-invalid`    | The VDF cannot be parsed, has no library section, or has invalid library entries.                                                                                                                         |
| `game-not-found`            | No manifest for the requested app ID exists in the readable libraries, and no other search problems were encountered.                                                                                     |
| `manifest-invalid`          | A matching manifest cannot be parsed, has invalid/mismatched fields, or names a directory outside `steamapps/common`.                                                                                     |
| `install-directory-missing` | A matching manifest names an absent installation directory or a regular file.                                                                                                                             |
| `access-error`              | A directory or file is unavailable, unreadable, or could not be listed. This includes disconnected libraries.                                                                                             |

Configuration failure stops lookup; the default library is not searched without a valid configuration. With valid configuration, configured libraries are searched in file order, followed by the default `steamapps` directory if it is not already listed. Paths are normalized and deduplicated, case-insensitively on Windows.

A broken copy of a game does not prevent a later valid copy from being found. If no valid copy exists, the first problem with that game's manifest or installation determines `reason`. Otherwise, an unavailable library produces `access-error`; a clean search with no manifest produces `game-not-found`.

## Batch lookup

```typescript
getGamePaths(appIds: readonly number[], options?: GamePathOptions): GamePathResult[]
```

The output has the same length and order as the input, including duplicate IDs. Match a failure to its app ID using its array index. An empty input returns `[]` without filesystem or registry discovery.

Steam discovery, library configuration, and library availability checks are performed once per batch. Each distinct app ID is searched once. Results share Steam information within the call; there is no cache between calls.

## Installed-game enumeration

```typescript
getInstalledGames(options?: GamePathOptions): InstalledGamesResult
```

A success is `{ success: true, games: InstalledGame[], steam: SteamInstallation, issues: LookupIssue[] }`. A failure is `{ success: false, reason: LookupFailureReason }`.

Enumeration reads `appmanifest_<appId>.acf` files across available libraries. Entries with valid manifests and existing directories are retained, deduplicated by app ID, and sorted numerically by app ID. The first valid copy in library order wins; a broken earlier copy is reported as an issue and does not block a later copy.

A successful scan can be incomplete: check `issues` for offline libraries, unreadable files, broken manifests, or missing installation directories. `games: []` with no issues means the scan found no installed games. Discovery or configuration failures, or an inability to list any library, produce a failure result.

The presence of a manifest and installation directory does not verify every game file or whether the game is ready to launch.

## Low-level helpers

`getSteamPath(): string | null` locates Steam using the [platform-specific checks](../README.md#supported-platforms). It throws on unsupported platforms.

`getSteamLibraries(steamPath: string): string[] | null` reads the configuration directly. It supports legacy string entries and modern object entries, ignores non-numeric metadata fields, and skips empty entries. It returns `null` for missing, unreadable, or invalid configuration. Unlike game lookup, it does not deduplicate paths or add the default library.

## Exported types

`GamePathOptions`, `GamePathResult`, `InstalledGame`, `InstalledGamesResult`, `SteamInstallation`, `LookupFailure`, `LookupFailureReason`, `SteamFailureReason`, and `LookupIssue` are exported from `steam-game-path`.

## Migration

`getGamePath()` no longer returns `null` or `{ game: null, steam }`. Always check `result.success` before accessing game data. On failure, use `result.reason`. The successful game object now includes its `appId`.

Use the named `{ steamPath }` option for custom installations. For executable metadata, use the [standalone metadata example](../README.md#need-executable-metadata).
