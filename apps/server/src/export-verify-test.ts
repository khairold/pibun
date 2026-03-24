#!/usr/bin/env bun
/**
 * Session Export Verification Test (Phase 5 — Item 5.8)
 *
 * Validates all export-related features end-to-end:
 * 1. session.exportHtml — Pi generates HTML, server returns content
 * 2. session.getMessages — raw Pi messages for JSON/Markdown export
 * 3. session.getStats — token/cost stats for export metadata
 * 4. Markdown generation — content structure and completeness
 * 5. JSON generation — structure, metadata, messages
 * 6. app.saveExportFile — fails gracefully in browser mode (no hook)
 * 7. Export after conversation — content reflects actual conversation
 *
 * Uses fake-pi-streaming fixture (no real API keys needed).
 *
 * Usage:
 *   bun run src/export-verify-test.ts
 */

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
	connectWsWithWelcome,
	createCheckCounter,
	request,
	startServer,
	stopServer,
	waitForAgentEnd,
} from "./test-harness.js";

// ============================================================================
// Constants
// ============================================================================

const FAKE_PI_PATH = resolve(import.meta.dir, "../test-fixtures/fake-pi-streaming.ts");
const { check, printResults } = createCheckCounter();

// ============================================================================
// Markdown generation (mirrors ExportDialog.tsx messagesToMarkdown)
// ============================================================================

interface TestMessage {
	type: "user" | "assistant" | "tool_call" | "tool_result" | "system";
	content: string;
	thinking?: string;
	toolCall?: { name: string; args: Record<string, unknown> } | null;
	toolResult?: { content: string; isError: boolean } | null;
}

function messagesToMarkdown(
	messages: TestMessage[],
	sessionName: string | null,
	model: { name: string; provider: string } | null,
	stats: {
		tokens: { total: number; input: number; output: number };
		cost: number;
		userMessages: number;
		assistantMessages: number;
		toolCalls: number;
		totalMessages: number;
	} | null,
): string {
	const lines: string[] = [];

	lines.push(`# ${sessionName ?? "PiBun Session"}`);
	lines.push("");
	lines.push(`**Exported:** ${new Date().toISOString()}`);
	if (model) {
		lines.push(`**Model:** ${model.name} (${model.provider})`);
	}
	if (stats) {
		lines.push(
			`**Tokens:** ${stats.tokens.total.toLocaleString()} (in: ${stats.tokens.input.toLocaleString()}, out: ${stats.tokens.output.toLocaleString()})`,
		);
		if (stats.cost > 0) {
			lines.push(`**Cost:** $${stats.cost.toFixed(4)}`);
		}
		lines.push(
			`**Messages:** ${stats.totalMessages} (${stats.userMessages} user, ${stats.assistantMessages} assistant, ${stats.toolCalls} tool calls)`,
		);
	}
	lines.push("");
	lines.push("---");
	lines.push("");

	for (const msg of messages) {
		switch (msg.type) {
			case "user":
				lines.push("## 🧑 User");
				lines.push("");
				lines.push(msg.content);
				lines.push("");
				break;
			case "assistant":
				lines.push("## 🤖 Assistant");
				lines.push("");
				if (msg.thinking) {
					lines.push("<details>");
					lines.push("<summary>💭 Thinking</summary>");
					lines.push("");
					lines.push(msg.thinking);
					lines.push("");
					lines.push("</details>");
					lines.push("");
				}
				if (msg.content) {
					lines.push(msg.content);
					lines.push("");
				}
				break;
			case "tool_call":
				if (msg.toolCall) {
					lines.push(`### 🔧 Tool: \`${msg.toolCall.name}\``);
					lines.push("");
					lines.push("```json");
					lines.push(JSON.stringify(msg.toolCall.args, null, 2));
					lines.push("```");
					lines.push("");
				}
				break;
			case "tool_result":
				if (msg.toolResult) {
					if (msg.toolResult.isError) {
						lines.push("#### ❌ Error");
					} else {
						lines.push("#### Result");
					}
					lines.push("");
					lines.push("```");
					lines.push(msg.toolResult.content);
					lines.push("```");
					lines.push("");
				}
				break;
			case "system":
				lines.push(`> ℹ️ ${msg.content}`);
				lines.push("");
				break;
		}
	}

	return lines.join("\n");
}

// ============================================================================
// JSON generation (mirrors ExportDialog.tsx messagesToJson)
// ============================================================================

interface PiMessage {
	role: string;
	content: string;
	timestamp: number;
}

function messagesToJson(
	piMessages: PiMessage[],
	sessionName: string | null,
	model: { provider: string; id: string; name: string } | null,
	stats: Record<string, unknown> | null,
): string {
	const payload = {
		exportedAt: new Date().toISOString(),
		sessionName,
		model: model
			? {
					provider: model.provider,
					id: model.id,
					name: model.name,
				}
			: null,
		stats,
		messageCount: piMessages.length,
		messages: piMessages,
	};
	return JSON.stringify(payload, null, 2);
}

// ============================================================================
// Tests
// ============================================================================

async function testHtmlExport(ws: WebSocket, sessionId: string): Promise<void> {
	console.log("\n── HTML Export ──");

	const resp = await request(ws, "session.exportHtml", {}, sessionId);
	check("session.exportHtml succeeds", !("error" in resp));

	const result = resp.result as Record<string, unknown>;
	check("Result has path", typeof result.path === "string");
	check("Result has html", typeof result.html === "string");

	const html = result.html as string;
	const path = result.path as string;

	// HTML content checks
	check("HTML is non-empty", html.length > 0);
	check("HTML starts with <!DOCTYPE html>", html.startsWith("<!DOCTYPE html>"));
	check("HTML contains <html> tag", html.includes("<html>"));
	check("HTML contains <head> tag", html.includes("<head>"));
	check("HTML contains <body> tag", html.includes("<body>"));
	check("HTML contains <style> tag (self-contained)", html.includes("<style>"));
	check("HTML contains session content", html.includes("user:"));
	check("HTML contains assistant response", html.includes("chunk-0"));

	// File should exist on disk
	check("HTML file exists on disk", existsSync(path));

	// Clean up the export file
	try {
		rmSync(path);
	} catch {
		// Ignore cleanup errors
	}
}

async function testMessagesRetrieval(ws: WebSocket, sessionId: string): Promise<PiMessage[]> {
	console.log("\n── Messages Retrieval (for Markdown/JSON export) ──");

	const resp = await request(ws, "session.getMessages", undefined, sessionId);
	check("session.getMessages succeeds", !("error" in resp));

	const result = resp.result as Record<string, unknown>;
	check("Result has messages array", Array.isArray(result.messages));

	const messages = result.messages as PiMessage[];
	check("Messages array is non-empty", messages.length > 0);
	check("Has at least 2 messages (user + assistant)", messages.length >= 2);

	// Verify user message
	const userMsg = messages.find((m) => m.role === "user");
	check("Contains a user message", userMsg !== undefined);
	check(
		"User message has content",
		typeof userMsg?.content === "string" && userMsg.content.length > 0,
	);
	check(
		"User message content matches prompt",
		userMsg?.content === "Hello, this is a test prompt for export verification",
	);

	// Verify assistant message
	const assistantMsg = messages.find((m) => m.role === "assistant");
	check("Contains an assistant message", assistantMsg !== undefined);
	check(
		"Assistant message has content",
		typeof assistantMsg?.content === "string" && assistantMsg.content.length > 0,
	);
	check(
		"Assistant message contains streamed chunks",
		assistantMsg?.content.includes("chunk-0") === true,
	);

	return messages;
}

async function testStatsRetrieval(
	ws: WebSocket,
	sessionId: string,
): Promise<Record<string, unknown>> {
	console.log("\n── Stats Retrieval (for JSON export metadata) ──");

	const resp = await request(ws, "session.getStats", undefined, sessionId);
	check("session.getStats succeeds", !("error" in resp));

	const result = resp.result as Record<string, unknown>;
	check("Result has stats", typeof result.stats === "object" && result.stats !== null);

	const stats = result.stats as Record<string, unknown>;

	// Token counts
	check("Stats has totalTokens", typeof stats.totalTokens === "number");
	check("Stats has inputTokens", typeof stats.inputTokens === "number");
	check("Stats has outputTokens", typeof stats.outputTokens === "number");
	check("totalTokens > 0", (stats.totalTokens as number) > 0);

	// Cost
	check("Stats has cost", typeof stats.cost === "number");

	// Message counts
	check("Stats has userMessages", typeof stats.userMessages === "number");
	check("Stats has assistantMessages", typeof stats.assistantMessages === "number");

	return stats;
}

function testMarkdownGeneration(): void {
	console.log("\n── Markdown Generation ──");

	const messages: TestMessage[] = [
		{ type: "user", content: "What is 2 + 2?", toolCall: null, toolResult: null },
		{
			type: "assistant",
			content: "The answer is **4**.",
			thinking: "Simple arithmetic: 2 + 2 = 4",
			toolCall: null,
			toolResult: null,
		},
		{
			type: "tool_call",
			content: "",
			toolCall: { name: "bash", args: { command: "echo 4" } },
			toolResult: null,
		},
		{
			type: "tool_result",
			content: "",
			toolCall: null,
			toolResult: { content: "4\n", isError: false },
		},
		{
			type: "tool_call",
			content: "",
			toolCall: { name: "read", args: { path: "/tmp/test.txt" } },
			toolResult: null,
		},
		{
			type: "tool_result",
			content: "",
			toolCall: null,
			toolResult: { content: "file not found", isError: true },
		},
		{ type: "system", content: "⚙️ Auto-compaction started", toolCall: null, toolResult: null },
		{
			type: "assistant",
			content: "I confirmed the answer is 4.",
			toolCall: null,
			toolResult: null,
		},
	];

	const model = { name: "Claude Sonnet", provider: "anthropic" };
	const stats = {
		tokens: { total: 500, input: 200, output: 300 },
		cost: 0.0123,
		userMessages: 1,
		assistantMessages: 2,
		toolCalls: 2,
		totalMessages: 8,
	};

	const md = messagesToMarkdown(messages, "Test Session", model, stats);

	// Structure checks
	check("Markdown has title", md.includes("# Test Session"));
	check("Markdown has exported timestamp", md.includes("**Exported:**"));
	check("Markdown has model info", md.includes("**Model:** Claude Sonnet (anthropic)"));
	check("Markdown has token info", md.includes("**Tokens:** 500"));
	check("Markdown has cost", md.includes("**Cost:** $0.0123"));
	check("Markdown has message counts", md.includes("**Messages:** 8"));
	check("Markdown has separator", md.includes("---"));

	// User message
	check("Markdown has user heading", md.includes("## 🧑 User"));
	check("Markdown has user content", md.includes("What is 2 + 2?"));

	// Assistant message with thinking
	check("Markdown has assistant heading", md.includes("## 🤖 Assistant"));
	check("Markdown has thinking details", md.includes("<details>"));
	check("Markdown has thinking summary", md.includes("💭 Thinking"));
	check("Markdown has thinking content", md.includes("Simple arithmetic"));
	check("Markdown has assistant content", md.includes("The answer is **4**."));

	// Tool call
	check("Markdown has tool heading", md.includes("### 🔧 Tool: `bash`"));
	check("Markdown has tool args in JSON block", md.includes('"command": "echo 4"'));

	// Tool result (success)
	check("Markdown has result heading", md.includes("#### Result"));
	check("Markdown has result content", md.includes("4\n"));

	// Tool result (error)
	check("Markdown has error heading", md.includes("#### ❌ Error"));
	check("Markdown has error content", md.includes("file not found"));

	// System message
	check("Markdown has system message as blockquote", md.includes("> ℹ️ ⚙️ Auto-compaction started"));

	// Second assistant message
	check("Markdown has second assistant response", md.includes("I confirmed the answer is 4."));

	// Markdown with null metadata
	const mdNoMeta = messagesToMarkdown(
		[{ type: "user", content: "hello", toolCall: null, toolResult: null }],
		null,
		null,
		null,
	);
	check(
		"Markdown with null session name defaults to PiBun Session",
		mdNoMeta.includes("# PiBun Session"),
	);
	check("Markdown with null model skips model line", !mdNoMeta.includes("**Model:**"));
	check("Markdown with null stats skips stats lines", !mdNoMeta.includes("**Tokens:**"));
}

function testJsonGeneration(piMessages: PiMessage[], stats: Record<string, unknown>): void {
	console.log("\n── JSON Generation ──");

	const model = { provider: "fake", id: "fake-model", name: "Fake Model" };
	const json = messagesToJson(piMessages, "Test Export", model, stats);

	check(
		"JSON is valid",
		(() => {
			try {
				JSON.parse(json);
				return true;
			} catch {
				return false;
			}
		})(),
	);

	const parsed = JSON.parse(json) as Record<string, unknown>;

	// Top-level fields
	check("JSON has exportedAt", typeof parsed.exportedAt === "string");
	check("JSON has sessionName", parsed.sessionName === "Test Export");
	check("JSON has model", typeof parsed.model === "object" && parsed.model !== null);
	check("JSON has stats", typeof parsed.stats === "object" && parsed.stats !== null);
	check("JSON has messageCount", typeof parsed.messageCount === "number");
	check("JSON has messages array", Array.isArray(parsed.messages));

	// Model details
	const jsonModel = parsed.model as Record<string, unknown>;
	check("JSON model has provider", jsonModel.provider === "fake");
	check("JSON model has id", jsonModel.id === "fake-model");
	check("JSON model has name", jsonModel.name === "Fake Model");

	// Messages
	const jsonMessages = parsed.messages as PiMessage[];
	check("JSON messages is non-empty", jsonMessages.length > 0);
	check("JSON messageCount matches", parsed.messageCount === jsonMessages.length);

	// Verify messages have required structure
	const firstMsg = jsonMessages[0];
	check("First message has role", typeof firstMsg?.role === "string");
	check("First message has content", typeof firstMsg?.content === "string");
	check("First message has timestamp", typeof firstMsg?.timestamp === "number");

	// JSON with null metadata
	const jsonNull = messagesToJson([], null, null, null);
	const parsedNull = JSON.parse(jsonNull) as Record<string, unknown>;
	check("JSON with null session name", parsedNull.sessionName === null);
	check("JSON with null model", parsedNull.model === null);
	check("JSON with null stats", parsedNull.stats === null);
	check("JSON with empty messages", (parsedNull.messages as unknown[]).length === 0);
	check("JSON messageCount is 0", parsedNull.messageCount === 0);
}

async function testSaveExportFallback(ws: WebSocket): Promise<void> {
	console.log("\n── Save Export Fallback (browser mode) ──");

	// In non-desktop mode (no hooks), app.saveExportFile should fail gracefully
	const resp = await request(ws, "app.saveExportFile", {
		content: "<html>test</html>",
		defaultFilename: "test.html",
	});

	check("app.saveExportFile returns error in browser mode", "error" in resp);
	const error = resp.error as { message: string };
	check(
		"Error message mentions browser mode",
		error.message.includes("browser") || error.message.includes("not available"),
	);
}

async function testExportAfterConversation(ws: WebSocket, sessionId: string): Promise<void> {
	console.log("\n── Export Content Reflects Conversation ──");

	// Send a second prompt to have multiple turns
	const promptResp = await request(
		ws,
		"session.prompt",
		{ message: "Follow-up question about exports" },
		sessionId,
	);
	check("Second prompt accepted", !("error" in promptResp));

	// Wait for agent_end
	await waitForAgentEnd(ws);

	// Verify messages now contain both turns
	const msgResp = await request(ws, "session.getMessages", undefined, sessionId);
	const result = msgResp.result as Record<string, unknown>;
	const messages = result.messages as PiMessage[];

	check("Messages contain multiple turns", messages.length >= 4);

	const userMessages = messages.filter((m) => m.role === "user");
	check("Has 2 user messages after 2 prompts", userMessages.length === 2);

	const assistantMessages = messages.filter((m) => m.role === "assistant");
	check("Has 2 assistant messages after 2 prompts", assistantMessages.length === 2);

	// Verify second user message content
	const secondUser = userMessages[1];
	check(
		"Second user message matches second prompt",
		secondUser?.content === "Follow-up question about exports",
	);

	// HTML export should also reflect both turns
	const htmlResp = await request(ws, "session.exportHtml", {}, sessionId);
	const htmlResult = htmlResp.result as Record<string, unknown>;
	const html = htmlResult.html as string;
	check("HTML contains first prompt", html.includes("test prompt for export verification"));
	check("HTML contains second prompt", html.includes("Follow-up question about exports"));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🔍 PiBun Session Export Verification Test\n");

	const ts = startServer({ defaultPiCommand: FAKE_PI_PATH });
	console.log(`Server started on ${ts.wsUrl}`);

	try {
		// Connect and start session
		const { ws, welcome } = await connectWsWithWelcome(ts.wsUrl);
		check("WebSocket connected with welcome", welcome.channel === "server.welcome");

		// Start a session
		const startResp = await request(ws, "session.start", {});
		check("session.start succeeds", !("error" in startResp));
		const startResult = startResp.result as Record<string, unknown>;
		const sessionId = startResult.sessionId as string;
		check("Session ID returned", typeof sessionId === "string" && sessionId.length > 0);

		// Send a prompt and wait for streaming to complete
		const promptResp = await request(
			ws,
			"session.prompt",
			{ message: "Hello, this is a test prompt for export verification" },
			sessionId,
		);
		check("Prompt accepted", !("error" in promptResp));

		// Wait for agent_end event
		await waitForAgentEnd(ws);
		console.log("  ✅ Agent streaming completed");

		// Small delay for fake-pi to finalize state
		await Bun.sleep(100);

		// Test 1: HTML Export
		await testHtmlExport(ws, sessionId);

		// Test 2: Messages Retrieval
		const messages = await testMessagesRetrieval(ws, sessionId);

		// Test 3: Stats Retrieval
		const stats = await testStatsRetrieval(ws, sessionId);

		// Test 4: Markdown Generation
		testMarkdownGeneration();

		// Test 5: JSON Generation
		testJsonGeneration(messages, stats);

		// Test 6: Save Export Fallback (browser mode — no desktop hooks)
		await testSaveExportFallback(ws);

		// Test 7: Export After Multi-Turn Conversation
		await testExportAfterConversation(ws, sessionId);

		// Clean up
		ws.close();
	} finally {
		await stopServer(ts);
	}

	const { failed } = printResults("Export verification");
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
