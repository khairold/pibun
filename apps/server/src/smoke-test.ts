#!/usr/bin/env bun
/**
 * Server Smoke Test
 *
 * Validates that the PiBun server starts, serves content, and accepts
 * WebSocket connections without requiring a running Pi process.
 *
 * Checks:
 * 1. Server starts on a random port
 * 2. Health endpoint responds with { status: "ok" }
 * 3. Static files served correctly (if web dist exists)
 * 4. SPA fallback works for client routes
 * 5. 404 for missing files with extensions
 * 6. WebSocket upgrade works
 * 7. server.welcome push received on WS connect
 * 8. Invalid WS messages produce error responses
 * 9. Clean shutdown
 *
 * Does NOT require Pi binary or API keys — tests server infrastructure only.
 *
 * Usage:
 *   bun run src/smoke-test.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PiRpcManager } from "./piRpcManager.js";
import { type PiBunServer, createServer } from "./server.js";

// ============================================================================
// Helpers
// ============================================================================

const WEB_DIST = resolve(import.meta.dir, "../../web/dist");
const hasWebDist = existsSync(WEB_DIST) && existsSync(resolve(WEB_DIST, "index.html"));

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
	if (condition) {
		passed++;
		console.log(`  ✅ ${label}`);
	} else {
		failed++;
		console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

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

function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<WsMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout (${timeoutMs}ms) waiting for WS message`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			clearTimeout(timer);
			ws.removeEventListener("message", handler);
			resolve(parseMsg(event.data as string));
		}

		ws.addEventListener("message", handler);
	});
}

function connectWs(url: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			reject(new Error("WebSocket connection timeout"));
		}, 5000);

		ws.addEventListener("open", () => {
			clearTimeout(timer);
			resolve(ws);
		});

		ws.addEventListener("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`WebSocket error: ${e}`));
		});
	});
}

// ============================================================================
// Test Sections
// ============================================================================

async function testHealthEndpoint(baseUrl: string): Promise<void> {
	console.log("\n── Health Endpoint ──");

	const resp = await fetch(`${baseUrl}/health`);
	check("GET /health returns 200", resp.status === 200);

	const body = (await resp.json()) as { status: string };
	check('Health status is "ok"', body.status === "ok");
}

async function testStaticServing(baseUrl: string): Promise<void> {
	console.log("\n── Static File Serving ──");

	if (!hasWebDist) {
		console.log("  ⏭️  Skipping — web dist not built (run `bun run build:web` first)");
		return;
	}

	// Index page
	const indexResp = await fetch(`${baseUrl}/`);
	check("GET / returns 200", indexResp.status === 200);
	const html = await indexResp.text();
	check("index.html contains root div", html.includes('id="root"'));
	check("index.html contains script tag", html.includes("<script"));

	// SPA fallback — client routes without extensions should return index.html
	const spaResp = await fetch(`${baseUrl}/some/client/route`);
	check("SPA fallback returns 200", spaResp.status === 200);
	const spaHtml = await spaResp.text();
	check("SPA fallback serves index.html content", spaHtml.includes('id="root"'));

	// 404 for missing file with extension
	const notFoundResp = await fetch(`${baseUrl}/nonexistent.js`);
	check("Missing .js file returns 404", notFoundResp.status === 404);
	await notFoundResp.text(); // consume body
}

async function testWebSocketConnect(wsUrl: string): Promise<void> {
	console.log("\n── WebSocket Connection ──");

	// Connect
	const ws = await connectWs(wsUrl);
	check("WebSocket connects successfully", ws.readyState === WebSocket.OPEN);

	// Should receive server.welcome push
	const welcome = await waitForMessage(ws);
	check("Receives push message", welcome.type === "push");
	check("Push is on server.welcome channel", welcome.channel === "server.welcome");

	const welcomeData = welcome.data as Record<string, unknown> | undefined;
	check("Welcome has cwd field", typeof welcomeData?.cwd === "string");
	check("Welcome has version field", typeof welcomeData?.version === "string");

	ws.close();
}

async function testWebSocketErrorHandling(wsUrl: string): Promise<void> {
	console.log("\n── WebSocket Error Handling ──");

	const ws = await connectWs(wsUrl);

	// Skip the welcome push
	await waitForMessage(ws);

	// Send malformed JSON
	ws.send("not json");
	const badJsonResp = await waitForMessage(ws);
	check("Malformed JSON returns error", "error" in (badJsonResp as Record<string, unknown>));

	// Send valid JSON but missing method
	ws.send(JSON.stringify({ id: "test-1" }));
	const noMethodResp = await waitForMessage(ws);
	check("Missing method returns error", "error" in (noMethodResp as Record<string, unknown>));

	// Send unknown method
	ws.send(JSON.stringify({ id: "test-2", method: "nonexistent.method" }));
	const unknownResp = await waitForMessage(ws);
	check(
		"Unknown method returns error with id",
		"error" in (unknownResp as Record<string, unknown>) && unknownResp.id === "test-2",
	);

	ws.close();
}

async function testSessionWithoutPi(wsUrl: string): Promise<void> {
	console.log("\n── Session Operations (no Pi) ──");

	const ws = await connectWs(wsUrl);
	await waitForMessage(ws); // skip welcome

	// Try session.stop without a session — should return error gracefully
	ws.send(JSON.stringify({ id: "stop-1", method: "session.stop" }));
	const stopResp = await waitForMessage(ws);
	check(
		"session.stop without session returns error",
		"error" in (stopResp as Record<string, unknown>),
	);

	// Try session.getModels without a session — should return error gracefully
	ws.send(JSON.stringify({ id: "models-1", method: "session.getModels" }));
	const modelsResp = await waitForMessage(ws);
	check(
		"session.getModels without session returns error",
		"error" in (modelsResp as Record<string, unknown>),
	);

	ws.close();
}

function connectWsWithWelcome(url: string): Promise<{ ws: WebSocket; welcome: WsMessage }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			reject(new Error("WebSocket connection+welcome timeout"));
		}, 5000);

		// Listen for the first message (welcome) before open completes
		ws.addEventListener("message", function onFirstMsg(event: MessageEvent) {
			ws.removeEventListener("message", onFirstMsg);
			clearTimeout(timer);
			resolve({ ws, welcome: parseMsg(event.data as string) });
		});

		ws.addEventListener("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`WebSocket error: ${e}`));
		});
	});
}

async function testMultipleConnections(wsUrl: string): Promise<void> {
	console.log("\n── Multiple Connections ──");

	// Connect both and capture welcome messages atomically
	const [conn1, conn2] = await Promise.all([
		connectWsWithWelcome(wsUrl),
		connectWsWithWelcome(wsUrl),
	]);

	check("Connection 1 gets welcome", conn1.welcome.channel === "server.welcome");
	check("Connection 2 gets welcome", conn2.welcome.channel === "server.welcome");

	conn1.ws.close();
	conn2.ws.close();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🔥 PiBun Server Smoke Test");
	console.log("══════════════════════════");

	// Start server on random port
	const rpcManager = new PiRpcManager();
	let server: PiBunServer | null = null;

	try {
		server = createServer({
			port: 0,
			hostname: "localhost",
			...(hasWebDist && { staticDir: WEB_DIST }),
			rpcManager,
		});

		const port = server.server.port;
		const baseUrl = `http://localhost:${port}`;
		const wsUrl = `ws://localhost:${port}/ws`;

		console.log(`\nServer started on port ${port}`);
		console.log(`Web dist: ${hasWebDist ? WEB_DIST : "NOT FOUND (will skip static tests)"}`);

		// Run test sections
		await testHealthEndpoint(baseUrl);
		await testStaticServing(baseUrl);
		await testWebSocketConnect(wsUrl);
		await testWebSocketErrorHandling(wsUrl);
		await testSessionWithoutPi(wsUrl);
		await testMultipleConnections(wsUrl);

		// Summary
		console.log("\n══════════════════════════");
		console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

		if (failed > 0) {
			console.log("\n❌ SMOKE TEST FAILED");
			process.exit(1);
		}

		console.log("\n✅ ALL SMOKE TESTS PASSED");
	} finally {
		// Clean shutdown
		if (server) {
			await server.stop();
			await rpcManager.stopAll();
		}
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
