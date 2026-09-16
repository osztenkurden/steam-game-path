import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parse } from '../tsc/vdf.ts';
import { getGamePath, getSteamLibraries } from '../tsc/index.ts';
import { createFakeSteam } from './helpers/fakeSteam.ts';

describe('VDF parser', () => {
	describe('compatibility with the former VDF dependency', () => {
		// Reworked from @node-steam/vdf's MIT-licensed parse tests; see vdf.LICENSE and docs/vdf.md.
		const scalars = [
			{ label: 'text', input: 'Steam library', expected: 'Steam library' },
			{ label: 'empty string', input: '', expected: '' },
			{ label: 'true', input: 'true', expected: true },
			{ label: 'false', input: 'false', expected: false },
			{ label: 'integer', input: '529', expected: 529 },
			{ label: 'decimal', input: '2307.1997', expected: 2307.1997 },
			{ label: 'null', input: 'null', expected: null },
			{ label: 'undefined', input: 'undefined', expected: undefined }
		];

		for (const { label, input, expected } of scalars) {
			it(`parses ${label} alongside another property`, () => {
				const source = `"label" "Library settings"\n"value" "${input}"\n`;
				assert.deepEqual(parse(source), { label: 'Library settings', value: expected });
			});
		}

		it('ignores a multiline block comment between properties', () => {
			const source = `
				"label" "Library settings"
				/**
				 * A comment separating two entries.
				 */
				"size" "2307.1997"
			`;
			assert.deepEqual(parse(source), { label: 'Library settings', size: 2307.1997 });
		});

		for (const nested of [false, true]) {
			it(`parses ${nested ? 'two levels' : 'one level'} of objects with typed values`, () => {
				const child = nested ? `"backup"\n{\n"enabled" "false"\n"size" "925"\n}` : '';
				const source = `
					"label" "Library settings"
					"library"
					{
						"enabled" "true"
						"size" "529"
						${child}
					}
				`;
				assert.deepEqual(parse(source), {
					label: 'Library settings',
					library: {
						enabled: true,
						size: 529,
						...(nested ? { backup: { enabled: false, size: 925 } } : {})
					}
				});
			});
		}
	});

	it('accepts BOM, CRLF, inline objects and unquoted tokens', () => {
		assert.deepEqual(parse('\uFEFFRoot { NAME value\r\n nested { "" "" } } other /some/path'), {
			Root: { NAME: 'value', nested: { '': '' } },
			other: '/some/path'
		});
	});

	it('handles comments between tokens without interpreting comments inside strings', () => {
		assert.deepEqual(
			parse('// before\nkey /* value follows */ "http://host/*literal*/" // after\nempty { /* empty */ }'),
			{
				key: 'http://host/*literal*/',
				empty: {}
			}
		);
		assert.deepEqual(parse(' // EOF'), {});
	});

	it('decodes escaped Windows drive and UNC paths, quotes and control characters', () => {
		assert.deepEqual(
			parse(
				String.raw`"drive" "C:\\Steam\\steamapps" "unc" "\\\\server\\games" "say\"hi" "a\"b\nc\td\re" "unknown" "\q"`
			),
			{
				drive: 'C:\\Steam\\steamapps',
				unc: '\\\\server\\games',
				'say"hi': 'a"b\nc\td\re',
				unknown: '\\q'
			}
		);
	});

	it('preserves literal multiline strings, Unicode, braces and whitespace', () => {
		assert.deepEqual(parse('"name" "  日本語 { game }\nsecond line  "'), {
			name: '  日本語 { game }\nsecond line  '
		});
	});

	it('can preserve every scalar as a string for Steam data', () => {
		assert.deepEqual(
			parse('name 123 installdir null flag false id 18446744073709551615', { coerceValues: false }),
			{
				name: '123',
				installdir: 'null',
				flag: 'false',
				id: '18446744073709551615'
			}
		);
	});

	it('preserves repeated scalars and objects as arrays in encounter order', () => {
		assert.deepEqual(parse('key one key two key three root { a 1 } root { b 2 } root {}'), {
			key: ['one', 'two', 'three'],
			root: [{ a: 1 }, { b: 2 }, {}]
		});
		assert.deepEqual(parse('key scalar key { a 1 } key end'), { key: ['scalar', { a: 1 }, 'end'] });
		assert.deepEqual(parse('key { a 1 } key scalar'), { key: [{ a: 1 }, 'scalar'] });
		assert.deepEqual(parse('key undefined key null key false key 0 key ""'), {
			key: [undefined, null, false, 0, '']
		});
		assert.deepEqual(parse('key 1 key 2', { coerceValues: false }), { key: ['1', '2'] });
	});

	it('keeps duplicate collections local to each object', () => {
		assert.deepEqual(parse('root { key one key two } root { key three key four }'), {
			root: [{ key: ['one', 'two'] }, { key: ['three', 'four'] }]
		});
	});

	it('preserves independent redeemable blocks from node-steam/vdf issue #21', () => {
		// https://github.com/node-steam/vdf/issues/21 — reduced reproduction.
		const source = `"seasonaloperations" { "11" {
			"redeemable_goods" "xpshop"
			"operational_point_redeemable" { "points" "4" "item_name" "overpass" }
			"operational_point_redeemable" { "points" "2" "item_name" "crate" "flags" "2" }
			"operational_point_redeemable" { "points" "1" "item_name" "sticker" }
		} }`;
		assert.deepEqual(parse(source), {
			seasonaloperations: {
				'11': {
					redeemable_goods: 'xpshop',
					operational_point_redeemable: [
						{ points: 4, item_name: 'overpass' },
						{ points: 2, item_name: 'crate', flags: 2 },
						{ points: 1, item_name: 'sticker' }
					]
				}
			}
		});
	});

	it('safely collects repeated prototype property names', () => {
		const result = parse('__proto__ { polluted true } __proto__ {} constructor one constructor two');
		assert.equal(Object.getPrototypeOf(result), Object.prototype);
		assert.deepEqual(result['__proto__'], [{ polluted: true }, {}]);
		assert.deepEqual(result['constructor'], ['one', 'two']);
		assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
	});

	it('treats prototype names as own data without polluting objects', () => {
		const result = parse('__proto__ { polluted true } constructor { prototype { polluted true } } toString value');
		assert.equal(Object.getPrototypeOf(result), Object.prototype);
		assert.equal(Object.hasOwn(result, '__proto__'), true);
		assert.deepEqual(result['__proto__'], { polluted: true });
		assert.deepEqual(result['constructor'], { prototype: { polluted: true } });
		assert.equal(result['toString'], 'value');
		assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
	});

	it('parses deep nesting without recursive call stack growth', () => {
		assert.doesNotThrow(() => parse('a {'.repeat(20000) + 'value ok' + '}'.repeat(20000)));
	});

	for (const input of [
		'}',
		'{ a b }',
		'key',
		'key }',
		'root {',
		'root { key }',
		'"unterminated',
		'key "unterminated\\',
		'/* unfinished',
		'root {} }',
		'key value trailing',
		'#include "file.vdf"',
		'key value [$WIN32]'
	]) {
		it(`rejects malformed or unsupported input: ${JSON.stringify(input)}`, () => {
			assert.throws(() => parse(input), SyntaxError);
		});
	}

	it('rejects non-string input', () => {
		// @ts-expect-error Exercise the runtime input guard.
		assert.throws(() => parse(null), TypeError);
	});
});

describe('Steam lookups using the internal parser', () => {
	it('reads escaped library paths and game names from actual files', () => {
		const steam = createFakeSteam();
		try {
			const library = path.join(
				steam.root,
				process.platform === 'win32' ? '日本語 library' : '日本語 "library"\\games'
			);
			const apps = steam.addLibraryDir(library);
			steam.writeLibraryFolders([library]);
			steam.addGameManifest(apps, { appId: 42, name: 'A "quoted" game', installDir: '42' });
			assert.deepEqual(getSteamLibraries(steam.steamDir), [apps]);
			const result = getGamePath(42, { steamPath: steam.steamDir });
			assert.equal(result.success, true);
			if (!result.success) return;
			assert.equal(result.game.name, 'A "quoted" game');
			assert.equal(result.game.path, path.join(apps, 'common', '42'));
		} finally {
			steam.cleanup();
		}
	});

	it('keeps numeric game names and primitive-looking install directory names intact', () => {
		const steam = createFakeSteam();
		try {
			steam.writeLibraryFolders([steam.steamDir]);
			steam.addGameManifest(steam.steamAppsDir, { appId: 42, name: '123', installDir: 'null' });
			const result = getGamePath(42, { steamPath: steam.steamDir });
			assert.equal(result.success, true);
			if (result.success) assert.equal(result.game.name, '123');
		} finally {
			steam.cleanup();
		}
	});
});
