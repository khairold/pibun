/**
 * @pibun/shared/jsonl — Strict LF-delimited JSONL parser
 *
 * MUST split on \n (U+000A) only — NEVER use readline.
 * readline splits on U+2028 and U+2029 which are valid inside JSON string payloads.
 *
 * Reference: pi-mono/packages/coding-agent/src/modes/rpc/jsonl.ts
 * See also: CONVENTIONS.md — JSONL Parsing section
 */

/**
 * Stateful JSONL line parser.
 *
 * Accumulates raw string chunks and splits on LF (\n) only.
 * Strips optional trailing \r from each line.
 * Empty lines are silently skipped.
 *
 * Usage:
 * ```ts
 * const parser = new JsonlParser((line) => {
 *   const event = JSON.parse(line);
 *   handleEvent(event);
 * });
 *
 * // Feed raw data from process stdout
 * parser.feed(chunk1);
 * parser.feed(chunk2);
 *
 * // When the stream ends, flush any remaining buffered content
 * parser.flush();
 * ```
 */
export class JsonlParser {
	private buffer = "";
	private readonly onLine: (line: string) => void;

	constructor(onLine: (line: string) => void) {
		this.onLine = onLine;
	}

	/**
	 * Feed a raw data chunk into the parser.
	 *
	 * Chunks may contain zero, one, or many newlines.
	 * Partial lines are buffered until the next \n arrives.
	 */
	feed(chunk: string): void {
		this.buffer += chunk;

		// Process all complete lines in the buffer
		let newlineIndex = this.buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const rawLine = this.buffer.slice(0, newlineIndex);
			this.buffer = this.buffer.slice(newlineIndex + 1);

			// Strip optional trailing \r (CRLF → LF normalization)
			const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

			// Skip empty lines
			if (line.length > 0) {
				this.onLine(line);
			}

			newlineIndex = this.buffer.indexOf("\n");
		}
	}

	/**
	 * Flush any remaining buffered content.
	 *
	 * Call this when the input stream ends to emit the last line
	 * if it wasn't terminated by \n.
	 */
	flush(): void {
		if (this.buffer.length > 0) {
			// Strip optional trailing \r
			const line = this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer;

			if (line.length > 0) {
				this.onLine(line);
			}

			this.buffer = "";
		}
	}

	/**
	 * Reset the parser, discarding any buffered content.
	 */
	reset(): void {
		this.buffer = "";
	}
}

/**
 * Serialize a value as a single JSONL record (JSON + trailing \n).
 *
 * Used to write commands to Pi's stdin.
 */
export function serializeJsonl(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}
