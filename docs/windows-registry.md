# Windows registry lookup

Steam discovery calls Windows' built-in `reg.exe` directly from Node.js. It needs no native registry addon, downloaded executable, or registry wrapper dependency. The public API remains synchronous.

## What matters in winreg

The relevant parts of [winreg's registry.js](https://github.com/fresc81/node-winreg/blob/master/lib/registry.js) are:

| Upstream code                                 | Role in a lookup                                                                             |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------- |
| `getRegExePath()`                             | Resolves `reg.exe` under the Windows system directory to avoid another executable on `PATH`. |
| `pushArch()` / `convertArchString()`          | Adds `/reg:32` or `/reg:64` to select the registry view.                                     |
| `Registry.prototype.get()`                    | Runs `QUERY <key> /v <name>`, captures stdout, and checks process failure.                   |
| `ITEM_PATTERN` and the parsing inside `get()` | Separates each result into a value name, registry type, and data.                            |
| `captureOutput()` / `mkErrorMsg()`            | Collects diagnostics and reports unsuccessful process exits.                                 |

The inspected implementation uses asynchronous `spawn` with `shell: true` and explicitly quoted key paths. Its stdout conversion uses `Buffer.toString()`, which defaults to UTF-8. It does not automatically detect or convert Windows code pages.

## Our implementation

[windowsSteamPath.ts](../tsc/windowsSteamPath.ts) implements the query approach specifically for Steam. `execFileSync` preserves our synchronous API and takes an argument array with `shell: false`. Keys are passed as individual, unquoted arguments; Node handles argument quoting. No command interpreter or PowerShell script is involved.

The first query is equivalent to:

```text
%SystemRoot%\System32\reg.exe QUERY HKLM\SOFTWARE\Valve\Steam /v InstallPath /reg:32
```

The executable directory comes from `SystemRoot`, falling back to `windir`, then `C:\Windows`. Each query requests a single named value. Explicit views make the lookup independent of Node's architecture. See [Microsoft's reg query reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query).

The lookup tries these candidates in order and stops at the first usable path:

1. `HKLM\SOFTWARE\Valve\Steam`, `InstallPath`, 32-bit view.
2. The same key and value in the 64-bit view.
3. `HKCU\SOFTWARE\Valve\Steam`, `SteamPath`, 32-bit view.
4. The same current-user key and value in the 64-bit view.

The first candidate corresponds to the old `WOW6432Node` lookup on 64-bit Windows. Machine installation discovery keeps precedence, with current-user discovery as a fallback.

The parser checks the requested value name case-insensitively and accepts `REG_SZ` or `REG_EXPAND_SZ`. It tolerates headers, blank lines, tabs, and spaces between columns, while retaining spaces inside the path. Expandable strings have `%VARIABLE%` references resolved from the current process environment. Empty, relative, NUL-containing, and visibly damaged UTF-8 paths are rejected.

A nonzero query exit or unusable value leads to the next candidate. Failure to start the executable, a timeout, or output-buffer overflow stops the lookup and returns `null`. The queries share one 5-second timeout budget and each has a 64 KiB output limit. Console windows are hidden and diagnostics are not printed to the application's stderr.

## Encoding and runtime behavior

The reader uses UTF-8 decoding, matching winreg's default. Non-ASCII paths depend on the encoding emitted by `reg.exe`; this implementation does not change the console code page or guarantee Unicode round trips across Windows locales. Rejecting replacement characters catches some decoding damage, but cannot recover characters already lost by the command. See [winreg's encoding notes](https://github.com/fresc81/node-winreg#processing-utf-8-data).

Every lookup launches between one and four processes and blocks the calling thread. Results are not cached internally. Windows policies may block registry tools, in which case discovery returns `null`. Linux and macOS retain their filesystem-based discovery.

## Dependencies and validation

Removing `registry-js` pruned 60 entries from the npm lockfile without changing retained package versions. Its native addon and prebuild installation dependencies are gone. Development tools may still use platform-specific binaries.

Portable tests cover parsing, fallback order, expandable strings, subprocess failures, and the shared timeout. Windows integration tests use real `reg.exe` queries against isolated HKCU fixtures, clean them up afterward, and never modify Steam's keys. CI is configured for Windows and Linux on Node.js 22 and 24 with installation scripts disabled. Real Windows execution remains to be verified by that CI run.
