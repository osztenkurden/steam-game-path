type VdfValue = string | number | boolean | null | undefined | VdfObject;
interface VdfObject {
	[key: string]: VdfValue | VdfValue[];
}
type Token = { kind: 'text'; value: string } | { kind: '{' } | { kind: '}' };

/** Text KeyValues (KV1). Internal: no includes, conditionals, binary VDF or KV3. */
export function parse(text: string, options: { coerceValues?: boolean } = {}): VdfObject {
	if (typeof text !== 'string') throw new TypeError('VDF input must be a string');
	let offset = 0;
	const fail = (message: string): never => {
		throw new SyntaxError(`${message} at offset ${offset}`);
	};
	const next = (): Token | undefined => {
		while (offset < text.length) {
			if (/\s/.test(text[offset]!)) {
				offset++;
			} else if (text.startsWith('//', offset)) {
				const end = text.indexOf('\n', offset + 2);
				offset = end === -1 ? text.length : end + 1;
			} else if (text.startsWith('/*', offset)) {
				const end = text.indexOf('*/', offset + 2);
				if (end === -1) fail('Unterminated block comment');
				offset = end + 2;
			} else break;
		}
		if (offset === text.length) return undefined;
		const first = text[offset++]!;
		if (first === '{' || first === '}') return { kind: first };
		if (first === '"') {
			let value = '';
			while (offset < text.length) {
				const char = text[offset++]!;
				if (char === '"') return { kind: 'text', value };
				if (char === '\\') {
					if (offset === text.length) fail('Unterminated escape');
					const escaped = text[offset++]!;
					switch (escaped) {
						case '\\':
						case '"':
							value += escaped;
							break;
						case 'n':
							value += '\n';
							break;
						case 'r':
							value += '\r';
							break;
						case 't':
							value += '\t';
							break;
						default:
							value += '\\' + escaped;
					}
				} else value += char;
			}
			return fail('Unterminated quoted string');
		}
		const start = offset - 1;
		while (offset < text.length && !/[\s{}"]/.test(text[offset]!)) offset++;
		const value = text.slice(start, offset);
		if (value.startsWith('#') || value.startsWith('[')) fail('Unsupported VDF directive or conditional');
		return { kind: 'text', value };
	};

	const root: VdfObject = {};
	const stack = [root];
	let current = root;
	for (let key = next(); key; key = next()) {
		if (key.kind === '}') {
			if (stack.length === 1) fail('Unexpected closing brace');
			stack.pop();
			current = stack[stack.length - 1]!;
			continue;
		}
		if (key.kind !== 'text') return fail('Expected a key');
		const token = next();
		if (!token || token.kind === '}') return fail('Expected a value or opening brace');
		let value: VdfValue;
		if (token.kind === '{') {
			value = {};
		} else {
			value = options.coerceValues === false ? token.value : coerce(token.value);
		}
		if (Object.hasOwn(current, key.value)) {
			const previous = current[key.value];
			if (Array.isArray(previous)) previous.push(value);
			else current[key.value] = [previous, value];
		} else {
			// Define own data properties, including __proto__, without invoking setters.
			Object.defineProperty(current, key.value, { value, enumerable: true, writable: true, configurable: true });
		}
		if (token.kind === '{') {
			current = value as VdfObject;
			stack.push(current);
		}
	}
	if (stack.length !== 1) fail('Unclosed object');
	return root;
}

// Retain @node-steam/vdf's scalar conversions for compatibility with its parse tests.
function coerce(value: string): VdfValue {
	if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
	switch (value) {
		case 'true':
			return true;
		case 'false':
			return false;
		case 'null':
			return null;
		case 'undefined':
			return undefined;
		default:
			return value;
	}
}
