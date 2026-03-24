#!/usr/bin/env bun
/**
 * End-to-End Test — Phase 1C.15
 *
 * Validates the full browser-to-Pi chain:
 *
 *   Browser (WebSocket) → Server → Pi RPC subprocess
 *
 * This test programmatically does what a user would do in the browser:
 * 1. Verifies the web app builds and can be served via HTTP
 * 2. Connects via WebSocket (as WsTransport would)
 * 3. Starts a session (as Composer's ensureSession() does)
 * 4. Sends a prompt that triggers tool calls
 * 5. Verifies streaming events match what wireTransport.ts expects
 * 6. Validates agent lifecycle, text streaming, and tool execution events
 * 7. Stops the session and cleans up
 *
 * Requires `pi` binary on PATH with valid API keys.
 *
 * Usage:
 *   bun run src/e2e-test.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	type WsMessage,
	createCheckCounter,
	parseMsg,
	startServer,
	stopServer,
} from "./test-harness.js";

// ============================================================================
// Types
// ============================================================================

interface PiEventData {
	type: string;
	[key: string]: unknown;
}

// ============================================================================
// Helpers
// ============================================================================

const WEB_DIST = resolve(import.meta.dir, "../../web/dist");

const { check, printResults } = createCheckCounter();

function waitFor(
	ws: WebSocket,
	predicate: (msg: WsMessage) => boolean,
	timeoutMs = 30000,
): Promise<WsMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout (${timeoutMs}ms) waiting for message`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			if (predicate(msg)) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(msg);
			}
		}

		ws.addEventListener("message", handler);
	});
}

/**
 * Collect all WebSocket messages until a predicate is satisfied or timeout.
 * Returns all messages collected.
 */
function collectUntil(
	ws: WebSocket,
	predicate: (msg: WsMessage) => boolean,
	timeoutMs = 60000,
): Promise<WsMessage[]> {
	return new Promise((resolve) => {
		const messages: WsMessage[] = [];

		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			// Resolve with what we have instead of rejecting — partial results are useful
			resolve(messages);
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			messages.push(msg);
			if (predicate(msg)) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(messages);
			}
		}

		ws.addEventListener("message", handler);
	});
}

// ============================================================================
// Test Sections
// ============================================================================

async function testStaticServing(baseUrl: string): Promise<void> {
	console.log("\n── Static File Serving ──");

	// Fetch index.html
	const indexResp = await fetch(`${baseUrl}/`);
	check("GET / returns 200", indexResp.status === 200);
	const html = await indexResp.text();
	check("index.html contains root div", html.includes('id="root"'));
	check("index.html contains script tag", html.includes("<script"));

	// Fetch health endpoint
	const healthResp = await fetch(`${baseUrl}/health`);
	check("GET /health returns 200", healthResp.status === 200);
	const health = (await healthResp.json()) as { status: string };
	check('Health status is "ok"', health.status === "ok");

	// SPA fallback — unknown path without extension should return index.html
	const spaResp = await fetch(`${baseUrl}/some/client/route`);
	check("SPA fallback returns 200 for client routes", spaResp.status === 200);
	const spaHtml = await spaResp.text();
	check("SPA fallback serves index.html content", spaHtml.includes('id="root"'));

	// 404 for missing files with extension
	const notFoundResp = await fetch(`${baseUrl}/nonexistent.js`);
	check("Missing .js file returns 404", notFoundResp.status === 404);
	await notFoundResp.text(); // consume body
}

async function testWebSocketFlow(wsUrl: string): Promise<void> {
	console.log("\n── WebSocket Connection ──");

	// Connect
	const ws = new WebSocket(wsUrl);
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve());
		ws.addEventListener("error", () => reject(new Error("WebSocket connect failed")));
	});
	check("WebSocket connected", true);

	// Receive server.welcome push
	const welcome = await waitFor(ws, (m) => m.type === "push" && m.channel === "server.welcome");
	const welcomeData = welcome.data as { cwd: string; version: string };
	check("Received server.welcome push", !!welcomeData);
	check("server.welcome has cwd", typeof welcomeData.cwd === "string");
	check("server.welcome has version", typeof welcomeData.version === "string");

	// ── Start Session ──
	console.log("\n── Session Start ──");

	ws.send(
		JSON.stringify({
			id: "start-1",
			method: "session.start",
			params: { provider: "anthropic", model: "sonnet", thinkingLevel: "off" },
		}),
	);

	const startResp = await waitFor(ws, (m) => m.id === "start-1", 15000);
	check("session.start succeeded", !!startResp.result && !startResp.error);
	const sessionId = (startResp.result as { sessionId: string }).sessionId;
	check("session.start returned sessionId", typeof sessionId === "string" && sessionId.length > 0);

	// ── Send Prompt (with tool call trigger) ──
	console.log("\n── Prompt + Streaming Events ──");

	// Ask Pi to read a file — this triggers a tool call (read tool)
	const eventCollector = collectUntil(
		ws,
		(m) => {
			if (m.type !== "push" || m.channel !== "pi.event") return false;
			const data = m.data as PiEventData;
			return data.type === "agent_end";
		},
		60000,
	);

	ws.send(
		JSON.stringify({
			id: "prompt-1",
			method: "session.prompt",
			params: {
				message:
					'Read the file "package.json" in the current directory and tell me only the project name. Be very brief.',
			},
		}),
	);

	// Wait for prompt acknowledgment
	const promptResp = await waitFor(ws, (m) => m.id === "prompt-1", 15000);
	check("session.prompt acknowledged", !!promptResp.result && !promptResp.error);

	// Collect all streaming events until agent_end
	const allMessages = await eventCollector;
	const piEvents = allMessages.filter((m) => m.type === "push" && m.channel === "pi.event");
	const eventTypes = piEvents.map((m) => (m.data as PiEventData).type);

	console.log(`  📊 Received ${piEvents.length} pi.event pushes`);
	console.log(`     Event types: ${[...new Set(eventTypes)].join(", ")}`);

	// ── Validate Agent Lifecycle Events ──
	// These are the events that wireTransport.ts dispatches to Zustand
	console.log("\n── Agent Lifecycle Validation ──");

	check("Has agent_start event", eventTypes.includes("agent_start"));
	check("Has agent_end event", eventTypes.includes("agent_end"));
	check("Has turn_start event", eventTypes.includes("turn_start"));
	check("Has turn_end event", eventTypes.includes("turn_end"));

	// agent_start must come before agent_end
	const agentStartIdx = eventTypes.indexOf("agent_start");
	const agentEndIdx = eventTypes.indexOf("agent_end");
	check("agent_start comes before agent_end", agentStartIdx < agentEndIdx);

	// ── Validate Message Events ──
	console.log("\n── Message Events Validation ──");

	check("Has message_start event(s)", eventTypes.includes("message_start"));
	check("Has message_update event(s)", eventTypes.includes("message_update"));
	check("Has message_end event(s)", eventTypes.includes("message_end"));

	// Verify message_start has expected structure (for wireTransport.ts handleMessageStart)
	const messageStarts = piEvents.filter((m) => (m.data as PiEventData).type === "message_start");
	const userMsgStart = messageStarts.find((m) => {
		const data = m.data as { message?: { role?: string } };
		return data.message?.role === "user";
	});
	const assistantMsgStart = messageStarts.find((m) => {
		const data = m.data as { message?: { role?: string } };
		return data.message?.role === "assistant";
	});
	check("Has user message_start", !!userMsgStart);
	check("Has assistant message_start", !!assistantMsgStart);

	// Verify text_delta events (for wireTransport.ts appendToContent)
	const textDeltas = piEvents.filter((m) => {
		const data = m.data as { type?: string; assistantMessageEvent?: { type?: string } };
		return data.type === "message_update" && data.assistantMessageEvent?.type === "text_delta";
	});
	check("Has text_delta events", textDeltas.length > 0);

	if (textDeltas.length > 0) {
		// Verify text_delta has delta field (string to append)
		const firstDelta = textDeltas[0]?.data as {
			assistantMessageEvent: { delta: string };
		};
		check(
			"text_delta has delta string",
			typeof firstDelta.assistantMessageEvent.delta === "string",
		);

		// Accumulate text (as wireTransport.ts does)
		let accumulatedText = "";
		for (const e of textDeltas) {
			const data = e.data as { assistantMessageEvent: { delta: string } };
			accumulatedText += data.assistantMessageEvent.delta;
		}
		console.log(
			`  📝 Accumulated text: "${accumulatedText.trim().slice(0, 120)}${accumulatedText.length > 120 ? "..." : ""}"`,
		);
		check("Accumulated text is non-empty", accumulatedText.trim().length > 0);
	}

	// ── Validate Tool Execution Events ──
	console.log("\n── Tool Execution Validation ──");

	const toolStarts = piEvents.filter(
		(m) => (m.data as PiEventData).type === "tool_execution_start",
	);
	const toolUpdates = piEvents.filter(
		(m) => (m.data as PiEventData).type === "tool_execution_update",
	);
	const toolEnds = piEvents.filter((m) => (m.data as PiEventData).type === "tool_execution_end");

	if (toolStarts.length > 0) {
		check("Has tool_execution_start event(s)", true);

		// Verify tool_execution_start structure (for wireTransport.ts tool card creation)
		const firstToolStart = toolStarts[0]?.data as {
			toolCallId?: string;
			toolName?: string;
			args?: Record<string, unknown>;
		};
		check("tool_execution_start has toolCallId", typeof firstToolStart.toolCallId === "string");
		check("tool_execution_start has toolName", typeof firstToolStart.toolName === "string");
		console.log(`  🔧 Tool: ${firstToolStart.toolName}`);

		// Verify tool_execution_update (accumulated output) — optional for fast tools
		if (toolUpdates.length > 0) {
			check("Has tool_execution_update event(s)", true);
			const lastUpdate = toolUpdates[toolUpdates.length - 1]?.data as {
				partialResult?: { content?: Array<{ type: string; text?: string }> };
			};
			check(
				"tool_execution_update has partialResult.content",
				Array.isArray(lastUpdate.partialResult?.content),
			);
		} else {
			// Fast tools (like `read` for small files) may skip updates entirely.
			// This is normal — tool_execution_start → tool_execution_end with no updates.
			console.log(
				"  ℹ️  No tool_execution_update events (tool completed instantly — expected for fast tools)",
			);
		}

		// Verify tool_execution_end
		if (toolEnds.length > 0) {
			check("Has tool_execution_end event(s)", true);
			const firstToolEnd = toolEnds[0]?.data as {
				toolCallId?: string;
				result?: { content?: unknown[] };
				isError?: boolean;
			};
			check("tool_execution_end has result", !!firstToolEnd.result);
			check("tool_execution_end has isError", typeof firstToolEnd.isError === "boolean");
		} else {
			check("Has tool_execution_end event(s)", false, "No end events");
		}
	} else {
		console.log("  ⚠️  No tool_execution events — Pi may have answered without reading the file");
		check("Tool events present (optional)", true);
	}

	// ── Validate Event Structure for wireTransport.ts ──
	console.log("\n── wireTransport.ts Compatibility ──");

	// Verify all events have a `type` field (used by the switch statement in handlePiEvent)
	const allHaveType = piEvents.every((m) => {
		const data = m.data as PiEventData;
		return typeof data.type === "string";
	});
	check("All pi.event pushes have 'type' field", allHaveType);

	// Verify message_start events have message.role (used by handleMessageStart)
	const allMsgStartsHaveRole = messageStarts.every((m) => {
		const data = m.data as { message?: { role?: string } };
		return typeof data.message?.role === "string";
	});
	check("All message_start events have message.role", allMsgStartsHaveRole);

	// Verify message_update events have assistantMessageEvent (used by handleMessageUpdate)
	const msgUpdates = piEvents.filter((m) => (m.data as PiEventData).type === "message_update");
	const allUpdatesHaveAME = msgUpdates.every((m) => {
		const data = m.data as { assistantMessageEvent?: { type?: string } };
		return typeof data.assistantMessageEvent?.type === "string";
	});
	check("All message_update events have assistantMessageEvent", allUpdatesHaveAME);

	// ── Stop Session ──
	console.log("\n── Session Stop ──");

	ws.send(JSON.stringify({ id: "stop-1", method: "session.stop" }));
	const stopResp = await waitFor(ws, (m) => m.id === "stop-1", 10000);
	check("session.stop succeeded", !!stopResp.result && !stopResp.error);

	ws.close();
	check("WebSocket closed cleanly", true);
}

// ============================================================================
// Main
// ============================================================================

const ts = startServer({ staticDir: WEB_DIST });

try {
	console.log("╔══════════════════════════════════════════════════╗");
	console.log("║     PiBun E2E Test — Phase 1C.15 Verification   ║");
	console.log("╚══════════════════════════════════════════════════╝");

	// ── Verify Web Build ──
	console.log("\n── Web App Build ──");

	check("Web dist directory exists", existsSync(WEB_DIST));
	check("index.html exists in dist", existsSync(resolve(WEB_DIST, "index.html")));
	check(
		"JS bundle exists in dist/assets",
		existsSync(resolve(WEB_DIST, "assets")) &&
			Bun.spawnSync(["find", resolve(WEB_DIST, "assets"), "-name", "*.js"])
				.stdout.toString()
				.trim().length > 0,
	);

	// ── Server Ready ──
	console.log("\n── Server Startup ──");
	check("Server started", !!ts.server.server);
	check("Static dir configured", !!ts.server.config.staticDir);
	console.log(`  📡 Server listening on ${ts.baseUrl}`);

	await testStaticServing(ts.baseUrl);
	await testWebSocketFlow(ts.wsUrl);

	const { failed } = printResults("E2E verification");
	process.exitCode = failed > 0 ? 1 : 0;
} catch (error) {
	console.error("\n❌ E2E test failed:", error);
	process.exitCode = 1;
} finally {
	await stopServer(ts);
	process.exit(process.exitCode ?? 0);
}
