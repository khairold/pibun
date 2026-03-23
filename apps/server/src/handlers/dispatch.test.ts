/**
 * Tests for WebSocket message dispatch and handler routing.
 *
 * Tests the dispatch mechanism, request validation, error handling,
 * handler invocation, and push message sending.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { WsPush, WsResponseError, WsResponseOk, WsServerMessage } from "@pibun/contracts";
import { PiRpcManager } from "../piRpcManager.js";
import { type PiBunServer, createServer } from "../server.js";

// ============================================================================
// Test Helpers
// ============================================================================

/** Parse a JSON message from the server. */
function parseMessage(data: string | Buffer | ArrayBuffer): WsServerMessage {
	if (typeof data === "string") {
		return JSON.parse(data) as WsServerMessage;
	}
	const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
	return JSON.parse(new TextDecoder().decode(buffer)) as WsServerMessage;
}

/** Wait for a WebSocket to receive a message matching a predicate. */
function waitForMessage(
	ws: WebSocket,
	predicate: (msg: WsServerMessage) => boolean,
	timeoutMs = 2000,
): Promise<WsServerMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMessage(event.data as string);
			if (predicate(msg)) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(msg);
			}
		}

		ws.addEventListener("message", handler);
	});
}

/** Collect all messages received in a time window. */
function collectMessages(ws: WebSocket, durationMs = 200): Promise<WsServerMessage[]> {
	return new Promise((resolve) => {
		const messages: WsServerMessage[] = [];

		function handler(event: MessageEvent): void {
			messages.push(parseMessage(event.data as string));
		}

		ws.addEventListener("message", handler);

		setTimeout(() => {
			ws.removeEventListener("message", handler);
			resolve(messages);
		}, durationMs);
	});
}

/** Create a connected WebSocket to the test server. */
function connectWs(port: number): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://localhost:${port}`);
		ws.addEventListener("open", () => resolve(ws));
		ws.addEventListener("error", (e) => reject(new Error(`WebSocket connect error: ${e}`)));
	});
}

// ============================================================================
// Tests
// ============================================================================

describe("WebSocket Dispatch", () => {
	let server: PiBunServer;
	let rpcManager: PiRpcManager;
	const TEST_PORT = 24299;

	beforeAll(() => {
		rpcManager = new PiRpcManager();
		server = createServer({
			port: TEST_PORT,
			hostname: "localhost",
			rpcManager,
		});
	});

	afterAll(async () => {
		await server.stop();
		await rpcManager.stopAll();
	});

	// =========================================================================
	// Connection & Welcome Push
	// =========================================================================

	it("sends server.welcome push on connect", async () => {
		const ws = await connectWs(TEST_PORT);
		try {
			const msg = await waitForMessage(
				ws,
				(m) => "type" in m && m.type === "push" && (m as WsPush).channel === "server.welcome",
			);

			expect(msg).toHaveProperty("type", "push");
			const push = msg as WsPush;
			expect(push.channel).toBe("server.welcome");
			expect(push.data).toHaveProperty("cwd");
			expect(push.data).toHaveProperty("version");
		} finally {
			ws.close();
		}
	});

	// =========================================================================
	// Request Validation
	// =========================================================================

	it("returns error for non-JSON messages", async () => {
		const ws = await connectWs(TEST_PORT);
		// Consume welcome push
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send("not valid json {{{");
			const msg = await waitForMessage(ws, (m) => "error" in m);

			expect(msg).toHaveProperty("id", "unknown");
			expect(msg).toHaveProperty("error");
			const err = msg as WsResponseError;
			expect(err.error.message).toContain("JSON");
		} finally {
			ws.close();
		}
	});

	it("returns error for missing id field", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(JSON.stringify({ method: "session.stop" }));
			const msg = await waitForMessage(ws, (m) => "error" in m);

			expect(msg).toHaveProperty("id", "unknown");
			const err = msg as WsResponseError;
			expect(err.error.message).toContain("missing");
		} finally {
			ws.close();
		}
	});

	it("returns error for missing method field", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(JSON.stringify({ id: "req-1" }));
			const msg = await waitForMessage(ws, (m) => "error" in m);

			const err = msg as WsResponseError;
			expect(err.error.message).toContain("missing");
		} finally {
			ws.close();
		}
	});

	// =========================================================================
	// Handler Dispatch
	// =========================================================================

	it("returns error when calling session.stop with no session", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(JSON.stringify({ id: "req-1", method: "session.stop" }));
			const msg = await waitForMessage(ws, (m) => "error" in m);

			const err = msg as WsResponseError;
			expect(err.id).toBe("req-1");
			expect(err.error.message).toContain("No active session");
		} finally {
			ws.close();
		}
	});

	it("returns error when calling session.prompt with no session", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(
				JSON.stringify({
					id: "req-2",
					method: "session.prompt",
					params: { message: "hello" },
				}),
			);
			const msg = await waitForMessage(ws, (m) => "error" in m);

			const err = msg as WsResponseError;
			expect(err.id).toBe("req-2");
			expect(err.error.message).toContain("No active session");
		} finally {
			ws.close();
		}
	});

	it("returns error when calling session.abort with no session", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(JSON.stringify({ id: "req-3", method: "session.abort" }));
			const msg = await waitForMessage(ws, (m) => "error" in m);

			const err = msg as WsResponseError;
			expect(err.id).toBe("req-3");
			expect(err.error.message).toContain("No active session");
		} finally {
			ws.close();
		}
	});

	it("returns error when calling session.getState with no session", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(JSON.stringify({ id: "req-4", method: "session.getState" }));
			const msg = await waitForMessage(ws, (m) => "error" in m);

			const err = msg as WsResponseError;
			expect(err.id).toBe("req-4");
			expect(err.error.message).toContain("No active session");
		} finally {
			ws.close();
		}
	});

	// =========================================================================
	// Session Start with Fake Pi
	// =========================================================================

	it("session.start creates a session and returns sessionId", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			ws.send(
				JSON.stringify({
					id: "start-1",
					method: "session.start",
					params: {
						provider: "anthropic",
						model: "sonnet",
					},
				}),
			);

			const msg = await waitForMessage(
				ws,
				(m) => "result" in m && (m as WsResponseOk).id === "start-1",
				5000,
			);

			expect(msg).toHaveProperty("id", "start-1");
			const ok = msg as WsResponseOk;
			expect(ok.result).toHaveProperty("sessionId");
			expect(typeof ok.result.sessionId).toBe("string");

			// Clean up: stop the session
			ws.send(JSON.stringify({ id: "stop-1", method: "session.stop" }));
			await waitForMessage(ws, (m) => "result" in m && (m as WsResponseOk).id === "stop-1", 5000);
		} finally {
			ws.close();
		}
	});

	// =========================================================================
	// Request ID Correlation
	// =========================================================================

	it("correlates responses to requests via id", async () => {
		const ws = await connectWs(TEST_PORT);
		await waitForMessage(ws, (m) => "type" in m && m.type === "push");

		try {
			// Send two requests — both will error (no session) but with different IDs
			ws.send(JSON.stringify({ id: "alpha", method: "session.abort" }));
			ws.send(JSON.stringify({ id: "beta", method: "session.stop" }));

			const messages = await collectMessages(ws, 500);
			const errors = messages.filter((m): m is WsResponseError => "error" in m);

			const alphaResponse = errors.find((e) => e.id === "alpha");
			const betaResponse = errors.find((e) => e.id === "beta");

			expect(alphaResponse).toBeDefined();
			expect(betaResponse).toBeDefined();
		} finally {
			ws.close();
		}
	});
});
