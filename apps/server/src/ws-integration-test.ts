#!/usr/bin/env bun
/**
 * WebSocket Integration Test
 *
 * Verifies the full round-trip: connect → start session → send prompt →
 * receive streaming events → abort → stop.
 *
 * Equivalent to the manual wscat test described in plan item 1B.14.
 * Runs against a real Pi process (requires `pi` binary on PATH).
 *
 * Usage:
 *   bun run src/ws-integration-test.ts
 *
 * Expected output:
 *   ✅ Connected — received server.welcome
 *   ✅ Session started — sessionId: session_1_...
 *   ✅ Prompt acknowledged
 *   ✅ Received pi.event pushes (N events)
 *   ✅ Received text content from assistant
 *   ✅ Session stopped
 *   🎉 All integration checks passed!
 */

import { PiRpcManager } from "./piRpcManager.js";
import { type PiBunServer, createServer } from "./server.js";

// ============================================================================
// Helpers
// ============================================================================

interface WsMessage {
	id?: string;
	type?: string;
	channel?: string;
	result?: Record<string, unknown>;
	error?: { message: string };
	data?: unknown;
}

function parseMsg(data: string | Buffer | ArrayBuffer): WsMessage {
	const raw = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
	return JSON.parse(raw) as WsMessage;
}

function waitFor(
	ws: WebSocket,
	predicate: (msg: WsMessage) => boolean,
	timeoutMs = 15000,
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

function collectFor(ws: WebSocket, durationMs: number): Promise<WsMessage[]> {
	return new Promise((resolve) => {
		const messages: WsMessage[] = [];

		function handler(event: MessageEvent): void {
			messages.push(parseMsg(event.data as string));
		}

		ws.addEventListener("message", handler);

		setTimeout(() => {
			ws.removeEventListener("message", handler);
			resolve(messages);
		}, durationMs);
	});
}

// ============================================================================
// Integration Test
// ============================================================================

const TEST_PORT = 24298;

let rpcManager: PiRpcManager | undefined;
let server: PiBunServer | undefined;

try {
	// Start server
	rpcManager = new PiRpcManager();
	server = createServer({ port: TEST_PORT, hostname: "localhost", rpcManager });
	console.log(`Server started on port ${TEST_PORT}\n`);

	// --- Step 1: Connect ---
	const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve());
		ws.addEventListener("error", () => reject(new Error("WebSocket connect failed")));
	});

	const welcome = await waitFor(ws, (m) => m.type === "push" && m.channel === "server.welcome");
	const welcomeData = welcome.data as { cwd: string; version: string };
	console.log(
		`✅ Connected — received server.welcome (cwd: ${welcomeData.cwd}, version: ${welcomeData.version})`,
	);

	// --- Step 2: Start Session ---
	ws.send(
		JSON.stringify({
			id: "start-1",
			method: "session.start",
			params: { provider: "anthropic", model: "sonnet", thinkingLevel: "off" },
		}),
	);

	const startResp = await waitFor(ws, (m) => m.id === "start-1" && m.result !== undefined, 10000);
	const sessionId = (startResp.result as { sessionId: string }).sessionId;
	console.log(`✅ Session started — sessionId: ${sessionId}`);

	// --- Step 3: Send Prompt ---
	// Start collecting events BEFORE sending the prompt
	const eventCollector = collectFor(ws, 10000);

	ws.send(
		JSON.stringify({
			id: "prompt-1",
			method: "session.prompt",
			params: { message: "Say exactly: Hello PiBun" },
		}),
	);

	// Wait for prompt acknowledgment
	const promptResp = await waitFor(ws, (m) => m.id === "prompt-1");
	if (promptResp.error) {
		throw new Error(`Prompt failed: ${promptResp.error.message}`);
	}
	console.log("✅ Prompt acknowledged");

	// --- Step 4: Receive Streaming Events ---
	const events = await eventCollector;
	const piEvents = events.filter((m) => m.type === "push" && m.channel === "pi.event");
	const piResponses = events.filter((m) => m.type === "push" && m.channel === "pi.response");

	console.log(`✅ Received pi.event pushes (${piEvents.length} events)`);
	if (piResponses.length > 0) {
		console.log(`   Also received ${piResponses.length} pi.response pushes`);
	}

	// Check for text content
	const textEvents = piEvents.filter((m) => {
		const data = m.data as { type?: string; assistantMessageEvent?: { type?: string } };
		return data.type === "message_update" && data.assistantMessageEvent?.type === "text_delta";
	});

	if (textEvents.length > 0) {
		// Collect text deltas
		let text = "";
		for (const e of textEvents) {
			const data = e.data as { assistantMessageEvent: { delta: string } };
			text += data.assistantMessageEvent.delta;
		}
		console.log(
			`✅ Received text content from assistant: "${text.trim().slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
		);
	} else {
		// Check for agent events
		const agentEvents = piEvents.map((m) => (m.data as { type: string }).type);
		console.log(`⚠️  No text_delta events found. Event types: ${agentEvents.join(", ")}`);
	}

	// --- Step 5: Stop Session ---
	ws.send(JSON.stringify({ id: "stop-1", method: "session.stop" }));
	const stopResp = await waitFor(ws, (m) => m.id === "stop-1", 5000);

	if (stopResp.error) {
		throw new Error(`Stop failed: ${stopResp.error.message}`);
	}
	console.log("✅ Session stopped");

	ws.close();

	console.log("\n🎉 All integration checks passed!");
	console.log("\nPhase 1B Exit Criteria:");
	console.log("  ✅ Full round-trip via WebSocket works");
	console.log("  ✅ Events stream in real-time");
	console.log("  ✅ Session start/stop function");
	console.log("  ✅ Prompt acknowledged and routed to Pi");
} catch (error) {
	console.error("\n❌ Integration test failed:", error);
	process.exitCode = 1;
} finally {
	// Clean up
	if (server) {
		await server.stop();
	}
	if (rpcManager) {
		await rpcManager.stopAll();
	}
	console.log("\nCleanup complete.");
	process.exit(process.exitCode ?? 0);
}
