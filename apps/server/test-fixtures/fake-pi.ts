#!/usr/bin/env bun

/**
 * Fake Pi RPC process for testing PiRpcManager and PiProcess.
 *
 * Accepts the same CLI args as `pi --mode rpc` (ignores them).
 * Reads JSONL commands from stdin and responds with success JSONL on stdout.
 *
 * Configuration via environment variables:
 * - FAKE_PI_CRASH_AFTER_MS  — Exit after this many milliseconds (simulate crash)
 * - FAKE_PI_EXIT_CODE       — Exit code when crashing (default: 1)
 * - FAKE_PI_STDERR          — Write this string to stderr on startup
 */

const crashAfterMs = process.env.FAKE_PI_CRASH_AFTER_MS;
const exitCode = Number(process.env.FAKE_PI_EXIT_CODE ?? "1");
const stderrMsg = process.env.FAKE_PI_STDERR;

// Write configured stderr message immediately
if (stderrMsg) {
	process.stderr.write(stderrMsg);
}

// Schedule crash if configured
if (crashAfterMs) {
	setTimeout(() => {
		process.exit(exitCode);
	}, Number(crashAfterMs));
}

// Read stdin JSONL and respond with success responses
const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buffer = "";

try {
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.replace(/\r$/, "");
			if (!trimmed) continue;
			try {
				const cmd = JSON.parse(trimmed) as { type: string; id?: string };
				const response = JSON.stringify({
					type: "response",
					command: cmd.type,
					success: true,
					id: cmd.id,
				});
				process.stdout.write(`${response}\n`);
			} catch {
				// Ignore parse errors
			}
		}
	}
} catch {
	// stdin closed or read error — exit gracefully
}

process.exit(0);
