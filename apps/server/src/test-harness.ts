/**
 * Shared test harness for PiBun server tests.
 *
 * Provides common utilities used across all verify and integration tests:
 * - Server creation with sensible defaults
 * - WebSocket connection helpers (connect, connect+welcome)
 * - Message parsing and request/response helpers
 * - Assertion/check counters with pass/fail reporting
 * - Cleanup utilities
 *
 * Usage:
 *   import { createTestContext } from "../test-fixtures/test-harness.js";
 *   const ctx = createTestContext();
 *   const { server, wsUrl } = ctx.startServer();
 *   const { ws, welcome } = await ctx.connectWsWithWelcome(wsUrl);
 *   ctx.check("Welcome received", welcome.type === "push");
 *   ctx.printResults();
 */

import { PiRpcManager } from "./piRpcManager.js";
import { type PiBunServer, createServer } from "./server.js";

// ============================================================================
// Types
// ============================================================================

/** Parsed WebSocket message — common shape across all test types. */
export interface WsMessage {
	id?: string;
	type?: string;
	channel?: string;
	result?: Record<string, unknown>;
	error?: { message: string };
	data?: unknown;
}

/** Options for starting a test server. */
export interface TestServerOptions {
	/** Custom Pi command (e.g., path to fake-pi-streaming.ts). */
	defaultPiCommand?: string;
	/** Static file directory to serve. */
	staticDir?: string;
	/** Additional createServer options. */
	serverOptions?: Record<string, unknown>;
}

/** Running test server with connection info. */
export interface TestServer {
	server: PiBunServer;
	rpcManager: PiRpcManager;
	port: number;
	wsUrl: string;
	baseUrl: string;
}

// ============================================================================
// Message Parsing
// ============================================================================

/** Parse raw WebSocket data into a WsMessage. */
export function parseMsg(data: string | Buffer | ArrayBuffer): WsMessage {
	const raw = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
	return JSON.parse(raw) as WsMessage;
}

// ============================================================================
// WebSocket Helpers
// ============================================================================

/** Connect to a WebSocket URL. Resolves when open. */
export function connectWs(url: string, timeoutMs = 5000): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			reject(new Error("WebSocket connection timeout"));
		}, timeoutMs);

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

/** Connect and wait for the server.welcome push message. */
export function connectWsWithWelcome(
	url: string,
	timeoutMs = 5000,
): Promise<{ ws: WebSocket; welcome: WsMessage }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			reject(new Error("WebSocket connection timeout"));
		}, timeoutMs);

		ws.addEventListener("message", function handler(event: MessageEvent) {
			ws.removeEventListener("message", handler);
			clearTimeout(timer);
			const msg = parseMsg(event.data as string);
			resolve({ ws, welcome: msg });
		});

		ws.addEventListener("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`WebSocket error: ${e}`));
		});
	});
}

/** Wait for the next WebSocket message. */
export function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<WsMessage> {
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

/** Collect all messages until a timeout (no new messages for `quietMs`). */
export function collectMessages(ws: WebSocket, quietMs = 500): Promise<WsMessage[]> {
	return new Promise((resolve) => {
		const messages: WsMessage[] = [];
		let timer: ReturnType<typeof setTimeout>;

		function handler(event: MessageEvent): void {
			messages.push(parseMsg(event.data as string));
			clearTimeout(timer);
			timer = setTimeout(done, quietMs);
		}

		function done(): void {
			ws.removeEventListener("message", handler);
			resolve(messages);
		}

		ws.addEventListener("message", handler);
		timer = setTimeout(done, quietMs);
	});
}

/**
 * Wait for a push message on a specific channel.
 * Optionally filter by a predicate on the push data.
 */
export function waitForPush(
	ws: WebSocket,
	channel: string,
	predicate?: (data: unknown) => boolean,
	timeoutMs = 5000,
): Promise<WsMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout waiting for push on channel: ${channel}`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			if (msg.type === "push" && msg.channel === channel) {
				if (!predicate || predicate(msg.data)) {
					clearTimeout(timer);
					ws.removeEventListener("message", handler);
					resolve(msg);
				}
			}
		}
		ws.addEventListener("message", handler);
	});
}

/** Collect push messages on a channel for a duration. */
export function collectPushes(
	ws: WebSocket,
	channel: string,
	durationMs: number,
): Promise<WsMessage[]> {
	return new Promise((resolve) => {
		const collected: WsMessage[] = [];
		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			if (msg.type === "push" && msg.channel === channel) {
				collected.push(msg);
			}
		}
		ws.addEventListener("message", handler);
		setTimeout(() => {
			ws.removeEventListener("message", handler);
			resolve(collected);
		}, durationMs);
	});
}

// ============================================================================
// Request Helpers
// ============================================================================

let reqIdCounter = 0;

/** Reset the request ID counter (call between test suites). */
export function resetReqIdCounter(): void {
	reqIdCounter = 0;
}

/** Send a WS request. Returns the correlation ID. */
export function sendRequest(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
	sessionId?: string,
): { id: string } {
	const id = `req-${String(++reqIdCounter)}`;
	const msg: Record<string, unknown> = { id, method };
	if (params) msg.params = params;
	if (sessionId) msg.sessionId = sessionId;
	ws.send(JSON.stringify(msg));
	return { id };
}

/**
 * Send a request and wait for the correlated response.
 * Skips push messages until the response with matching ID arrives.
 */
export async function request(
	ws: WebSocket,
	method: string,
	params?: Record<string, unknown>,
	sessionId?: string,
	timeoutMs = 10000,
): Promise<WsMessage> {
	const { id } = sendRequest(ws, method, params, sessionId);
	for (let i = 0; i < 50; i++) {
		const msg = await waitForMessage(ws, timeoutMs);
		if (msg.id === id) return msg;
	}
	throw new Error(`No response for ${method} (id: ${id})`);
}

/**
 * Drain messages until an agent_end push is received.
 * Returns all messages collected along the way.
 */
export async function waitForAgentEnd(ws: WebSocket, timeoutMs = 10000): Promise<WsMessage[]> {
	const collected: WsMessage[] = [];
	for (let i = 0; i < 200; i++) {
		const msg = await waitForMessage(ws, timeoutMs);
		collected.push(msg);
		if (msg.type === "push" && msg.channel === "pi.event") {
			const data = msg.data as Record<string, unknown>;
			const event = data.event as Record<string, unknown>;
			if (event.type === "agent_end") return collected;
		}
	}
	throw new Error("Never received agent_end event");
}

// ============================================================================
// Server Lifecycle
// ============================================================================

/** Start a test server on a random port. */
export function startServer(options: TestServerOptions = {}): TestServer {
	const rpcManager = new PiRpcManager(
		options.defaultPiCommand ? { defaultPiCommand: options.defaultPiCommand } : undefined,
	);
	const server = createServer({
		port: 0,
		hostname: "localhost",
		rpcManager,
		...(options.staticDir ? { staticDir: options.staticDir } : {}),
		...(options.serverOptions ?? {}),
	});
	const port = server.server.port ?? 0;
	return {
		server,
		rpcManager,
		port,
		wsUrl: `ws://localhost:${port}/ws`,
		baseUrl: `http://localhost:${port}`,
	};
}

/** Stop a test server and all its Pi sessions. */
export async function stopServer(ts: TestServer): Promise<void> {
	await ts.rpcManager.stopAll();
	ts.server.server.stop(true);
}

// ============================================================================
// Check / Assertion Helpers
// ============================================================================

/** Create an isolated check counter for a test suite. */
export function createCheckCounter() {
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

	function printResults(suiteName?: string): { passed: number; failed: number } {
		console.log(`\n✅ Passed: ${passed}`);
		console.log(`❌ Failed: ${failed}`);
		if (failed > 0) {
			console.error(suiteName ? `\n❌ ${suiteName} FAILED` : "\n❌ VERIFICATION FAILED");
		} else {
			console.log(suiteName ? `\n✅ ${suiteName} passed!` : "\n✅ All checks passed!");
		}
		return { passed, failed };
	}

	return {
		check,
		printResults,
		get passed() {
			return passed;
		},
		get failed() {
			return failed;
		},
	};
}

// ============================================================================
// Session Helpers
// ============================================================================

/** Start a session and return the session ID. */
export async function startSession(
	ws: WebSocket,
	params?: Record<string, unknown>,
	timeoutMs = 10000,
): Promise<string> {
	const resp = await request(ws, "session.start", params ?? {}, undefined, timeoutMs);
	if (resp.error) throw new Error(`session.start failed: ${resp.error.message}`);
	const result = resp.result as Record<string, unknown>;
	return result.sessionId as string;
}

/** Send a prompt and wait for agent_end. Returns all events collected. */
export async function promptAndWait(
	ws: WebSocket,
	message: string,
	sessionId?: string,
	timeoutMs = 15000,
): Promise<WsMessage[]> {
	await request(ws, "session.prompt", { message }, sessionId);
	return waitForAgentEnd(ws, timeoutMs);
}
