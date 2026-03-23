/**
 * Unit tests for the strict LF-delimited JSONL parser.
 *
 * Run with: bun test packages/shared/src/jsonl.test.ts
 *
 * Test categories:
 * - Basic parsing (single line, multiple lines)
 * - Partial lines (buffered across chunks)
 * - Edge cases (embedded newlines in JSON strings, Unicode line separators, empty lines)
 * - Rapid multi-line (many lines in one chunk)
 * - CRLF handling
 * - Flush behavior
 * - Serialization
 */

import { describe, expect, test } from "bun:test";
import { JsonlParser, serializeJsonl } from "./jsonl.js";

/** Helper: collect all lines emitted by feeding chunks to a parser. */
function collectLines(chunks: string[]): string[] {
	const lines: string[] = [];
	const parser = new JsonlParser((line) => lines.push(line));
	for (const chunk of chunks) {
		parser.feed(chunk);
	}
	parser.flush();
	return lines;
}

/** Safe array access for tests — throws if index is out of bounds. */
function lineAt(lines: string[], index: number): string {
	const line = lines[index];
	if (line === undefined) {
		throw new Error(`No line at index ${index} (length: ${lines.length})`);
	}
	return line;
}

// ============================================================================
// Basic Parsing
// ============================================================================

describe("basic parsing", () => {
	test("single complete line", () => {
		const lines = collectLines(['{"type":"agent_start"}\n']);
		expect(lines).toEqual(['{"type":"agent_start"}']);
	});

	test("multiple complete lines in one chunk", () => {
		const lines = collectLines([
			'{"type":"agent_start"}\n{"type":"turn_start"}\n{"type":"message_start"}\n',
		]);
		expect(lines).toEqual([
			'{"type":"agent_start"}',
			'{"type":"turn_start"}',
			'{"type":"message_start"}',
		]);
	});

	test("each line is valid JSON", () => {
		const lines = collectLines([
			'{"type":"message_update","delta":"hello"}\n{"type":"message_end"}\n',
		]);
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
		expect(JSON.parse(lineAt(lines, 0))).toEqual({
			type: "message_update",
			delta: "hello",
		});
	});
});

// ============================================================================
// Partial Lines (buffered across chunks)
// ============================================================================

describe("partial lines", () => {
	test("line split across two chunks", () => {
		const lines = collectLines(['{"type":"agent', '_start"}\n']);
		expect(lines).toEqual(['{"type":"agent_start"}']);
	});

	test("line split across three chunks", () => {
		const lines = collectLines(['{"type":', '"turn_', 'start"}\n']);
		expect(lines).toEqual(['{"type":"turn_start"}']);
	});

	test("one complete line + partial in first chunk, rest in second", () => {
		const lines = collectLines(['{"type":"agent_start"}\n{"type":"turn', '_start"}\n']);
		expect(lines).toEqual(['{"type":"agent_start"}', '{"type":"turn_start"}']);
	});

	test("many small chunks forming one line", () => {
		const chars = '{"type":"ok"}\n'.split("");
		const lines = collectLines(chars);
		expect(lines).toEqual(['{"type":"ok"}']);
	});
});

// ============================================================================
// Embedded Newlines in JSON Strings (U+2028, U+2029)
// ============================================================================

describe("Unicode line separators in payloads", () => {
	test("U+2028 (LINE SEPARATOR) inside JSON string value is preserved", () => {
		// JSON.stringify does NOT escape U+2028 — it's valid in JSON strings
		const payload = { type: "message_update", delta: "line1\u2028line2" };
		const jsonStr = JSON.stringify(payload);

		const lines = collectLines([`${jsonStr}\n`]);
		expect(lines).toHaveLength(1);

		const parsed = JSON.parse(lineAt(lines, 0));
		expect(parsed.delta).toBe("line1\u2028line2");
	});

	test("U+2029 (PARAGRAPH SEPARATOR) inside JSON string value is preserved", () => {
		const payload = {
			type: "tool_execution_update",
			partialResult: "para1\u2029para2",
		};
		const jsonStr = JSON.stringify(payload);

		const lines = collectLines([`${jsonStr}\n`]);
		expect(lines).toHaveLength(1);

		const parsed = JSON.parse(lineAt(lines, 0));
		expect(parsed.partialResult).toBe("para1\u2029para2");
	});

	test("both U+2028 and U+2029 in one payload", () => {
		const payload = {
			type: "message_update",
			delta: "a\u2028b\u2029c",
		};
		const jsonStr = JSON.stringify(payload);

		const lines = collectLines([`${jsonStr}\n`]);
		expect(lines).toHaveLength(1);

		const parsed = JSON.parse(lineAt(lines, 0));
		expect(parsed.delta).toBe("a\u2028b\u2029c");
	});

	test("escaped \\n inside JSON string is NOT a line separator", () => {
		// JSON "\n" is the two-char escape sequence, not a raw newline
		const payload = { delta: "line1\\nline2" };
		const jsonStr = JSON.stringify(payload);

		const lines = collectLines([`${jsonStr}\n`]);
		expect(lines).toHaveLength(1);

		const parsed = JSON.parse(lineAt(lines, 0));
		expect(parsed.delta).toBe("line1\\nline2");
	});
});

// ============================================================================
// Empty Lines
// ============================================================================

describe("empty lines", () => {
	test("empty lines between records are skipped", () => {
		const lines = collectLines(['{"a":1}\n\n\n{"b":2}\n']);
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});

	test("leading empty lines are skipped", () => {
		const lines = collectLines(['\n\n{"a":1}\n']);
		expect(lines).toEqual(['{"a":1}']);
	});

	test("trailing empty lines are skipped", () => {
		const lines = collectLines(['{"a":1}\n\n\n']);
		expect(lines).toEqual(['{"a":1}']);
	});

	test("only empty lines produce no output", () => {
		const lines = collectLines(["\n\n\n"]);
		expect(lines).toEqual([]);
	});
});

// ============================================================================
// Rapid Multi-line (many lines in one chunk)
// ============================================================================

describe("rapid multi-line", () => {
	test("100 lines in one chunk", () => {
		const records = Array.from({ length: 100 }, (_, i) => JSON.stringify({ index: i }));
		const chunk = records.map((r) => `${r}\n`).join("");

		const lines = collectLines([chunk]);
		expect(lines).toHaveLength(100);

		for (let i = 0; i < 100; i++) {
			expect(JSON.parse(lineAt(lines, i))).toEqual({ index: i });
		}
	});

	test("rapid small chunks interleaved with line boundaries", () => {
		// Simulate many small writes, some crossing line boundaries
		const lines = collectLines(['{"a":1}\n{"b":', "2}\n", '{"c":3}\n{"d":4}\n{"e"', ":5}\n"]);
		expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}', '{"d":4}', '{"e":5}']);
	});
});

// ============================================================================
// CRLF Handling
// ============================================================================

describe("CRLF handling", () => {
	test("CRLF line endings are normalized (trailing \\r stripped)", () => {
		const lines = collectLines(['{"a":1}\r\n{"b":2}\r\n']);
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});

	test("mixed LF and CRLF line endings", () => {
		const lines = collectLines(['{"a":1}\n{"b":2}\r\n{"c":3}\n']);
		expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
	});

	test("bare \\r without \\n is NOT treated as line separator", () => {
		const lines = collectLines(['{"a":1}\r{"b":2}\n']);
		expect(lines).toEqual(['{"a":1}\r{"b":2}']);
	});

	test("CRLF-only empty lines are skipped", () => {
		const lines = collectLines(['{"a":1}\r\n\r\n{"b":2}\r\n']);
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});
});

// ============================================================================
// Flush Behavior
// ============================================================================

describe("flush", () => {
	test("flush emits unterminated final line", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed('{"type":"agent_start"}');
		expect(lines).toEqual([]); // not emitted yet — no \n

		parser.flush();
		expect(lines).toEqual(['{"type":"agent_start"}']);
	});

	test("flush with trailing \\r strips it", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed('{"a":1}\r');
		parser.flush();
		expect(lines).toEqual(['{"a":1}']);
	});

	test("flush with empty buffer does nothing", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.flush();
		expect(lines).toEqual([]);
	});

	test("flush after complete lines does nothing", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed('{"a":1}\n');
		expect(lines).toEqual(['{"a":1}']);

		parser.flush();
		expect(lines).toEqual(['{"a":1}']); // no duplicate
	});

	test("multiple feed+flush cycles work correctly", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed('{"a":1}\n');
		parser.flush();
		expect(lines).toEqual(['{"a":1}']);

		parser.feed('{"b":2}\n');
		parser.flush();
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});
});

// ============================================================================
// Reset
// ============================================================================

describe("reset", () => {
	test("reset discards buffered content", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed('{"partial":');
		parser.reset();
		parser.feed('{"complete":true}\n');

		expect(lines).toEqual(['{"complete":true}']);
	});

	test("reset then flush produces nothing", () => {
		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));

		parser.feed("some data");
		parser.reset();
		parser.flush();

		expect(lines).toEqual([]);
	});
});

// ============================================================================
// serializeJsonl
// ============================================================================

describe("serializeJsonl", () => {
	test("serializes object with trailing newline", () => {
		const result = serializeJsonl({ type: "prompt", message: "hello" });
		expect(result).toBe('{"type":"prompt","message":"hello"}\n');
	});

	test("serializes string value", () => {
		const result = serializeJsonl("test");
		expect(result).toBe('"test"\n');
	});

	test("serializes number", () => {
		const result = serializeJsonl(42);
		expect(result).toBe("42\n");
	});

	test("serializes null", () => {
		const result = serializeJsonl(null);
		expect(result).toBe("null\n");
	});

	test("serialized output is parseable by JsonlParser", () => {
		const original = {
			type: "prompt",
			message: "hello world",
			id: "test-1",
		};
		const serialized = serializeJsonl(original);

		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));
		parser.feed(serialized);

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lineAt(lines, 0))).toEqual(original);
	});

	test("round-trip with Unicode content", () => {
		const original = { delta: "hello\u2028world\u2029end" };
		const serialized = serializeJsonl(original);

		const lines: string[] = [];
		const parser = new JsonlParser((line) => lines.push(line));
		parser.feed(serialized);

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lineAt(lines, 0))).toEqual(original);
	});
});
