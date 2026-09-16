# VDF parsing

The package reads Steam's `libraryfolders.vdf` and `appmanifest_*.acf` files with its own text KeyValues (KV1) parser. It has no runtime dependencies. The parser is internal and is used automatically by the lookup functions.

## Format

VDF contains key/value pairs. Braces group nested entries:

```text
"library"
{
    "path" "C:\\Steam"
    "game" "Half-Life 2"
    "game" "Counter-Strike 2"
}
```

Steam lookups read this as:

```json
{
  "library": {
    "path": "C:\\Steam",
    "game": ["Half-Life 2", "Counter-Strike 2"]
  }
}
```

Repeated keys become arrays in input order. Repeated objects remain separate objects. Unique keys keep their scalar or object value.

## Supported syntax

- Quoted and unquoted keys and values; nested and inline objects.
- Multiline strings, Unicode, a byte order mark, and CRLF line endings.
- `//` line comments and `/* ... */` block comments.
- Escapes inside quoted strings: `\\`, `\"`, `\n`, `\r`, and `\t`. Other escapes keep their backslash.

Steam lookups keep all scalar values as strings. Internally, `parse(text)` converts numeric values, `true`, `false`, `null`, and `undefined` to JavaScript values. Use `parse(text, { coerceValues: false })` to preserve strings.

Malformed input throws `SyntaxError` with a character offset. Lookup functions return their documented failure results.

Binary VDF, KV3, includes, platform conditionals, and writing VDF are unsupported. See [Valve's KeyValues reference](https://developer.valvesoftware.com/wiki/KeyValues) for the format specification.

## Tests

Run `npm test`. Parser tests are in `test/vdf.test.ts`, including scalar values, repeated keys, escaped paths, malformed input, and Steam file lookups.

Compatibility cases are adapted from [@node-steam/vdf's tests](https://github.com/node-steam/vdf/tree/b2487111b034f2f518eff14e96af2f06e6b54734/test). Their MIT license is in `test/vdf.LICENSE`.
