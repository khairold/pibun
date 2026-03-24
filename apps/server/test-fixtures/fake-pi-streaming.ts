#!/usr/bin/env bun

/**
 * Fake Pi RPC process that emits a full streaming event lifecycle.
 *
 * Like fake-pi.ts, but when it receives a `prompt` command, it emits
 * the complete agent lifecycle events:
 *   agent_start → turn_start → message_start(user) → message_end(user)
 *   → message_start(assistant) → message_update(text_delta)* → message_end(assistant)
 *   → turn_end → agent_end
 *
 * Configuration via environment variables:
 * - FAKE_PI_STREAM_DELAY_MS — Delay between text_delta events (default: 10)
 * - FAKE_PI_STREAM_CHUNKS   — Number of text chunks to emit (default: 5)
 * - FAKE_PI_CRASH_AFTER_MS  — Exit after this many milliseconds (simulate crash)
 * - FAKE_PI_EXIT_CODE       — Exit code when crashing (default: 1)
 * - FAKE_PI_STDERR          — Write this string to stderr on startup
 * - FAKE_PI_INSTANCE_ID     — Identifier for logging (helps trace multi-session tests)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const streamDelayMs = Number(process.env.FAKE_PI_STREAM_DELAY_MS ?? "10");
const streamChunks = Number(process.env.FAKE_PI_STREAM_CHUNKS ?? "5");
const crashAfterMs = process.env.FAKE_PI_CRASH_AFTER_MS;
const exitCode = Number(process.env.FAKE_PI_EXIT_CODE ?? "1");
const stderrMsg = process.env.FAKE_PI_STDERR;
const instanceId = process.env.FAKE_PI_INSTANCE_ID ?? "unknown";

// Track conversation messages for get_messages
const conversationMessages: Array<{
	role: string;
	content: string;
	timestamp: number;
}> = [];

function emit(event: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Simulate a full prompt → streaming response lifecycle.
 */
async function handlePrompt(message: string, commandId: string | undefined): Promise<void> {
	// 1. Ack the prompt command
	emit({
		type: "response",
		command: "prompt",
		success: true,
		id: commandId,
	});

	// 2. Agent lifecycle events
	emit({ type: "agent_start" });
	emit({ type: "turn_start", turnIndex: 0 });

	// 3. User message
	const userTs = Date.now();
	conversationMessages.push({ role: "user", content: message, timestamp: userTs });
	emit({
		type: "message_start",
		message: {
			role: "user",
			content: message,
			timestamp: userTs,
		},
	});
	emit({
		type: "message_end",
		message: {
			role: "user",
			content: message,
			timestamp: userTs,
		},
	});

	// 4. Assistant message with streaming text deltas
	emit({
		type: "message_start",
		message: {
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		},
	});

	// Emit text_start
	emit({
		type: "message_update",
		assistantMessageEvent: {
			type: "text_start",
		},
	});

	// Emit text deltas
	for (let i = 0; i < streamChunks; i++) {
		await sleep(streamDelayMs);
		emit({
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: `[${instanceId}] chunk-${i} `,
			},
		});
	}

	// Emit text_end
	emit({
		type: "message_update",
		assistantMessageEvent: {
			type: "text_end",
		},
	});

	// Done
	emit({
		type: "message_update",
		assistantMessageEvent: {
			type: "done",
		},
	});

	// 5. End assistant message
	const fullText = Array.from(
		{ length: streamChunks },
		(_, i) => `[${instanceId}] chunk-${i} `,
	).join("");
	const assistantTs = Date.now();
	conversationMessages.push({ role: "assistant", content: fullText, timestamp: assistantTs });
	emit({
		type: "message_end",
		message: {
			role: "assistant",
			content: fullText,
			timestamp: assistantTs,
		},
	});

	// 6. End turn and agent
	emit({ type: "turn_end", turnIndex: 0 });
	emit({ type: "agent_end" });
}

// ============================================================================
// Command Handlers
// ============================================================================

interface RpcCommand {
	type: string;
	id?: string;
	message?: string;
	[key: string]: unknown;
}

function handleCommand(cmd: RpcCommand): void {
	switch (cmd.type) {
		case "prompt":
			// Handle asynchronously — events stream after the ack
			handlePrompt(cmd.message ?? "", cmd.id).catch(() => {
				// Ignore errors during streaming
			});
			break;

		case "abort":
			// Ack immediately
			emit({
				type: "response",
				command: "abort",
				success: true,
				id: cmd.id,
			});
			break;

		case "get_state":
			emit({
				type: "response",
				command: "get_state",
				success: true,
				id: cmd.id,
				data: {
					sessionId: `fake-session-${instanceId}`,
					sessionFile: `/tmp/fake-session-${instanceId}.json`,
					model: "fake-model",
					provider: "fake",
					thinkingLevel: "medium",
				},
			});
			break;

		case "get_session_stats":
			emit({
				type: "response",
				command: "get_session_stats",
				success: true,
				id: cmd.id,
				data: {
					totalTokens: 100,
					inputTokens: 50,
					outputTokens: 50,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					cost: 0.01,
					userMessages: 1,
					assistantMessages: 1,
					toolMessages: 0,
				},
			});
			break;

		case "get_available_models":
			emit({
				type: "response",
				command: "get_available_models",
				success: true,
				id: cmd.id,
				data: {
					models: [
						{
							id: "fake-model",
							name: "Fake Model",
							provider: "fake",
							supportsReasoning: false,
							supportsVision: false,
						},
					],
				},
			});
			break;

		case "get_messages":
			emit({
				type: "response",
				command: "get_messages",
				success: true,
				id: cmd.id,
				data: { messages: conversationMessages },
			});
			break;

		case "export_html": {
			// Write a self-contained HTML file to a temp directory
			const exportDir = join(tmpdir(), `fake-pi-export-${instanceId}`);
			mkdirSync(exportDir, { recursive: true });
			const htmlPath = join(exportDir, "export.html");
			const htmlContent = [
				"<!DOCTYPE html>",
				"<html><head><title>PiBun Export</title>",
				"<style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px}",
				".user{background:#e3f2fd;padding:12px;border-radius:8px;margin:8px 0}",
				".assistant{background:#f5f5f5;padding:12px;border-radius:8px;margin:8px 0}",
				"h1{color:#333}</style></head><body>",
				`<h1>Session: fake-session-${instanceId}</h1>`,
				...conversationMessages.map(
					(m) => `<div class="${m.role}"><strong>${m.role}:</strong> ${m.content}</div>`,
				),
				"</body></html>",
			].join("\n");
			writeFileSync(htmlPath, htmlContent);
			emit({
				type: "response",
				command: "export_html",
				success: true,
				id: cmd.id,
				data: { path: htmlPath },
			});
			break;
		}

		case "new_session":
			emit({
				type: "response",
				command: "new_session",
				success: true,
				id: cmd.id,
			});
			break;

		default:
			// Generic success response
			emit({
				type: "response",
				command: cmd.type,
				success: true,
				id: cmd.id,
			});
			break;
	}
}

// ============================================================================
// JSONL stdin reader
// ============================================================================

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
				const cmd = JSON.parse(trimmed) as RpcCommand;
				handleCommand(cmd);
			} catch {
				// Ignore parse errors
			}
		}
	}
} catch {
	// stdin closed or read error — exit gracefully
}

process.exit(0);
