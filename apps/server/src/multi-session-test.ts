#!/usr/bin/env bun
/**
 * Multi-Session Verification Test (Phase 1 — Item 1.12)
 *
 * Validates:
 * 1. 3 simultaneous Pi sessions streaming in parallel
 * 2. Events routed correctly per-session (sessionId tagging)
 * 3. Switching between sessions (message fetch)
 * 4. Closing one session (no orphaned processes)
 * 5. Remaining sessions continue to work
 * 6. Full cleanup on disconnect
 *
 * Uses fake-pi-streaming.ts as the Pi binary — no real API keys needed.
 *
 * Usage:
 *   bun run src/multi-session-test.ts
 */

import { resolve } from "node:path";
import type { PiRpcManager } from "./piRpcManager.js";
import {
	type WsMessage,
	connectWsWithWelcome,
	createCheckCounter,
	parseMsg,
	startServer,
	stopServer,
} from "./test-harness.js";

// ============================================================================
// Constants
// ============================================================================

const FAKE_PI = resolve(import.meta.dir, "../test-fixtures/fake-pi-streaming.ts");
const TIMEOUT_MS = 15000;

const { check, printResults } = createCheckCounter();

// ============================================================================
// Helpers (test-specific — custom request patterns for multi-session)
// ============================================================================

function sendRequest(
	ws: WebSocket,
	id: string,
	method: string,
	params?: Record<string, unknown>,
): void {
	const msg: Record<string, unknown> = { id, method };
	if (params) msg.params = params;
	ws.send(JSON.stringify(msg));
}

function sendRequestWithSession(
	ws: WebSocket,
	id: string,
	method: string,
	sessionId: string,
	params?: Record<string, unknown>,
): void {
	const msg: Record<string, unknown> = { id, method, sessionId };
	if (params) msg.params = params;
	ws.send(JSON.stringify(msg));
}

/**
 * Collect messages from a WebSocket until a condition is met or timeout.
 */
function collectMessages(
	ws: WebSocket,
	until: (msgs: WsMessage[]) => boolean,
	timeoutMs = TIMEOUT_MS,
): Promise<WsMessage[]> {
	return new Promise((resolve) => {
		const messages: WsMessage[] = [];
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			// Resolve with what we have instead of rejecting (some tests check partial results)
			resolve(messages);
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			messages.push(msg);
			if (until(messages)) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(messages);
			}
		}

		ws.addEventListener("message", handler);
	});
}

/**
 * Wait for a specific response by ID.
 */
function waitForResponse(ws: WebSocket, requestId: string, timeoutMs = 5000): Promise<WsMessage> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout waiting for response ${requestId}`));
		}, timeoutMs);

		function handler(event: MessageEvent): void {
			const msg = parseMsg(event.data as string);
			if (msg.id === requestId) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(msg);
			}
		}

		ws.addEventListener("message", handler);
	});
}

/**
 * Extract session ID from pi.event push data.
 */
function getPushSessionId(msg: WsMessage): string | null {
	if (msg.type !== "push" || msg.channel !== "pi.event") return null;
	const data = msg.data as { sessionId?: string } | undefined;
	return data?.sessionId ?? null;
}

/**
 * Extract event type from pi.event push data.
 */
function getPushEventType(msg: WsMessage): string | null {
	if (msg.type !== "push" || msg.channel !== "pi.event") return null;
	const data = msg.data as { event?: { type?: string } } | undefined;
	return data?.event?.type ?? null;
}

// ============================================================================
// Test Sections
// ============================================================================

async function testThreeSimultaneousSessions(
	wsUrl: string,
	rpcManager: PiRpcManager,
): Promise<{ ws: WebSocket; sessionIds: string[] }> {
	console.log("\n── 3 Simultaneous Sessions ──");

	const { ws } = await connectWsWithWelcome(wsUrl);

	// Start 3 sessions via WebSocket (server uses rpcManager's defaultPiCommand)
	const sessionIds: string[] = [];

	for (let i = 0; i < 3; i++) {
		const reqId = `start-${i}`;
		const isFirst = i === 0;
		sendRequest(ws, reqId, "session.start", {});
		const resp = await waitForResponse(ws, reqId);
		const result = resp.result as { sessionId?: string } | undefined;
		check(`Session ${i + 1} starts successfully`, typeof result?.sessionId === "string");
		if (result?.sessionId) {
			sessionIds.push(result.sessionId);
		}
	}

	check("All 3 sessions created", sessionIds.length === 3);
	check(
		"All session IDs are unique",
		new Set(sessionIds).size === 3,
		`IDs: ${sessionIds.join(", ")}`,
	);

	// Verify RPC manager tracks all 3
	check("RPC manager has 3 sessions", rpcManager.size === 3);

	const activeSessions = rpcManager.getActiveSessions();
	check(
		"All 3 sessions are in running state",
		activeSessions.length === 3,
		`Active: ${String(activeSessions.length)}`,
	);

	return { ws, sessionIds };
}

async function testParallelStreaming(ws: WebSocket, sessionIds: string[]): Promise<void> {
	console.log("\n── Parallel Streaming ──");

	// Send prompts to all 3 sessions simultaneously
	for (let i = 0; i < sessionIds.length; i++) {
		const sessionId = sessionIds[i];
		if (!sessionId) continue;
		sendRequestWithSession(ws, `prompt-${i}`, "session.prompt", sessionId, {
			message: `Hello from session ${i}`,
		});
	}

	// Collect events until we see agent_end for all 3 sessions
	const seenAgentEnd = new Set<string>();
	const allEvents = await collectMessages(
		ws,
		(msgs) => {
			for (const msg of msgs) {
				const sid = getPushSessionId(msg);
				const evType = getPushEventType(msg);
				if (sid && evType === "agent_end") {
					seenAgentEnd.add(sid);
				}
			}
			return seenAgentEnd.size >= 3;
		},
		TIMEOUT_MS,
	);

	check(
		"Received agent_end for all 3 sessions",
		seenAgentEnd.size === 3,
		`Got agent_end from ${String(seenAgentEnd.size)} sessions`,
	);

	// Verify events are tagged with correct sessionIds
	const eventsBySession = new Map<string, WsMessage[]>();
	for (const msg of allEvents) {
		const sid = getPushSessionId(msg);
		if (sid) {
			const existing = eventsBySession.get(sid) ?? [];
			existing.push(msg);
			eventsBySession.set(sid, existing);
		}
	}

	check(
		"Events received for all 3 sessions",
		eventsBySession.size >= 3,
		`Sessions with events: ${String(eventsBySession.size)}`,
	);

	// Each session should have agent_start and agent_end
	for (const sessionId of sessionIds) {
		if (!sessionId) continue;
		const sessionEvents = eventsBySession.get(sessionId) ?? [];
		const eventTypes = sessionEvents.map((m) => getPushEventType(m));
		const hasStart = eventTypes.includes("agent_start");
		const hasEnd = eventTypes.includes("agent_end");
		const hasTextDelta = eventTypes.includes("message_update");

		check(`Session ${sessionId.slice(-8)} has agent_start`, hasStart);
		check(`Session ${sessionId.slice(-8)} has agent_end`, hasEnd);
		check(`Session ${sessionId.slice(-8)} has message_update (streaming)`, hasTextDelta);
	}

	// Verify text deltas contain the correct instance ID
	// (fake-pi-streaming embeds the INSTANCE_ID in text deltas)
	for (const msg of allEvents) {
		const sid = getPushSessionId(msg);
		const data = msg.data as
			| { event?: { assistantMessageEvent?: { type?: string; delta?: string } } }
			| undefined;
		if (data?.event?.assistantMessageEvent?.type === "text_delta" && sid) {
			// The instance ID is embedded in the delta text by our fake Pi
			// (we don't set FAKE_PI_INSTANCE_ID per-session here, so all use "unknown")
			// What matters is the events are routed to the right sessionId
			check(
				`text_delta for session ${sid.slice(-8)} has content`,
				typeof data.event.assistantMessageEvent.delta === "string" &&
					data.event.assistantMessageEvent.delta.length > 0,
			);
			break; // One check is enough
		}
	}
}

async function testCloseSession(
	ws: WebSocket,
	sessionIds: string[],
	rpcManager: PiRpcManager,
): Promise<string[]> {
	console.log("\n── Close Session (no orphaned processes) ──");

	const sessionToClose = sessionIds[1]; // Close the middle session
	if (!sessionToClose) {
		check("Middle session exists", false);
		return sessionIds;
	}

	// Stop the session
	sendRequestWithSession(ws, "stop-1", "session.stop", sessionToClose);
	const resp = await waitForResponse(ws, "stop-1");
	const result = resp.result as { ok?: boolean } | undefined;
	check("session.stop returns ok", result?.ok === true);

	// Give the process a moment to clean up
	await new Promise((resolve) => setTimeout(resolve, 200));

	// Verify session was removed from RPC manager
	check("Closed session removed from RPC manager", !rpcManager.hasSession(sessionToClose));

	check(
		"RPC manager has 2 remaining sessions",
		rpcManager.size === 2,
		`Actual: ${String(rpcManager.size)}`,
	);

	// Verify remaining sessions are still running
	const remaining = sessionIds.filter((id) => id !== sessionToClose);
	for (const sid of remaining) {
		const session = rpcManager.getSession(sid);
		check(`Session ${sid.slice(-8)} still exists`, session !== undefined);
		check(
			`Session ${sid.slice(-8)} still running`,
			session?.process.state === "running",
			`State: ${session?.process.state ?? "undefined"}`,
		);
	}

	return remaining;
}

async function testRemainingSessionsWork(
	ws: WebSocket,
	remainingSessions: string[],
): Promise<void> {
	console.log("\n── Remaining Sessions Still Work ──");

	// Send a prompt to the first remaining session
	const firstSession = remainingSessions[0];
	if (!firstSession) {
		check("First remaining session exists", false);
		return;
	}

	sendRequestWithSession(ws, "prompt-remaining-0", "session.prompt", firstSession, {
		message: "Are you still there?",
	});

	// Collect events until agent_end for this session
	const events = await collectMessages(
		ws,
		(msgs) =>
			msgs.some((m) => getPushSessionId(m) === firstSession && getPushEventType(m) === "agent_end"),
		TIMEOUT_MS,
	);

	const sessionEvents = events.filter((m) => getPushSessionId(m) === firstSession);
	const eventTypes = sessionEvents.map((m) => getPushEventType(m));

	check("Remaining session 1 received agent_start after close", eventTypes.includes("agent_start"));
	check("Remaining session 1 received agent_end after close", eventTypes.includes("agent_end"));

	// Send a prompt to the second remaining session
	const secondSession = remainingSessions[1];
	if (!secondSession) {
		check("Second remaining session exists", false);
		return;
	}

	sendRequestWithSession(ws, "prompt-remaining-1", "session.prompt", secondSession, {
		message: "Still alive?",
	});

	const events2 = await collectMessages(
		ws,
		(msgs) =>
			msgs.some(
				(m) => getPushSessionId(m) === secondSession && getPushEventType(m) === "agent_end",
			),
		TIMEOUT_MS,
	);

	const session2Events = events2.filter((m) => getPushSessionId(m) === secondSession);
	const eventTypes2 = session2Events.map((m) => getPushEventType(m));

	check(
		"Remaining session 2 received agent_start after close",
		eventTypes2.includes("agent_start"),
	);
	check("Remaining session 2 received agent_end after close", eventTypes2.includes("agent_end"));
}

async function testGetStatePerSession(ws: WebSocket, sessionIds: string[]): Promise<void> {
	console.log("\n── Per-Session State (switch simulation) ──");

	// Each session should return its own state
	for (let i = 0; i < sessionIds.length; i++) {
		const sid = sessionIds[i];
		if (!sid) continue;
		const reqId = `state-${i}`;
		sendRequestWithSession(ws, reqId, "session.getState", sid);
		const resp = await waitForResponse(ws, reqId);
		const result = resp.result as { state?: Record<string, unknown> } | undefined;
		check(`get_state for session ${sid.slice(-8)} returns data`, result?.state !== undefined);
	}

	// Try to get state for a non-existent session (simulates accessing closed session)
	sendRequestWithSession(ws, "state-gone", "session.getState", "non-existent-session");
	const goneResp = await waitForResponse(ws, "state-gone");
	check(
		"get_state for non-existent session returns error",
		"error" in (goneResp as Record<string, unknown>),
	);
}

async function testCleanupOnDisconnect(wsUrl: string, rpcManager: PiRpcManager): Promise<void> {
	console.log("\n── Cleanup on WebSocket Disconnect ──");

	const initialSize = rpcManager.size;

	// Connect a new WebSocket and start 2 sessions
	const { ws } = await connectWsWithWelcome(wsUrl);

	sendRequest(ws, "cleanup-start-1", "session.start", {});
	const resp1 = await waitForResponse(ws, "cleanup-start-1");
	const sid1 = (resp1.result as { sessionId?: string } | undefined)?.sessionId;

	sendRequest(ws, "cleanup-start-2", "session.start", {});
	const resp2 = await waitForResponse(ws, "cleanup-start-2");
	const sid2 = (resp2.result as { sessionId?: string } | undefined)?.sessionId;

	check("Cleanup test: 2 sessions created", !!sid1 && !!sid2);
	check(
		"Cleanup test: manager size increased",
		rpcManager.size === initialSize + 2,
		`Expected ${String(initialSize + 2)}, got ${String(rpcManager.size)}`,
	);

	// Close the WebSocket (simulates browser tab close)
	ws.close();

	// Wait for cleanup
	await new Promise((resolve) => setTimeout(resolve, 500));

	// Both sessions should be cleaned up
	check(
		"Cleanup test: manager size back to initial",
		rpcManager.size === initialSize,
		`Expected ${String(initialSize)}, got ${String(rpcManager.size)}`,
	);

	if (sid1) {
		check("Cleanup test: session 1 removed from manager", !rpcManager.hasSession(sid1));
	}
	if (sid2) {
		check("Cleanup test: session 2 removed from manager", !rpcManager.hasSession(sid2));
	}
}

async function testSessionRoutingIsolation(ws: WebSocket, sessionIds: string[]): Promise<void> {
	console.log("\n── Session Routing Isolation ──");

	// Verify events from one session don't appear as if from another
	const firstSession = sessionIds[0];
	if (!firstSession) return;

	sendRequestWithSession(ws, "iso-prompt", "session.prompt", firstSession, {
		message: "Isolation test",
	});

	const events = await collectMessages(
		ws,
		(msgs) =>
			msgs.some((m) => getPushSessionId(m) === firstSession && getPushEventType(m) === "agent_end"),
		TIMEOUT_MS,
	);

	// All pi.event pushes from this prompt should have firstSession's ID
	const piEvents = events.filter((m) => m.type === "push" && m.channel === "pi.event");
	const wrongSession = piEvents.filter((m) => {
		const sid = getPushSessionId(m);
		return sid !== null && sid !== firstSession;
	});

	check(
		"No events leaked to wrong session during isolated prompt",
		wrongSession.length === 0,
		`${String(wrongSession.length)} events had wrong sessionId`,
	);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("🔄 PiBun Multi-Session Verification Test (Phase 1 — Item 1.12)");
	console.log("═══════════════════════════════════════════════════════════════");
	console.log(`Using fake Pi: ${FAKE_PI}`);

	const ts = startServer({ defaultPiCommand: FAKE_PI });

	try {
		console.log(`\nServer started on port ${ts.port}`);

		// Test 1: Create 3 simultaneous sessions
		const { ws: mainWs, sessionIds } = await testThreeSimultaneousSessions(ts.wsUrl, ts.rpcManager);

		// Test 2: Stream in parallel from all 3
		await testParallelStreaming(mainWs, sessionIds);

		// Test 3: Per-session state (simulates tab switching)
		await testGetStatePerSession(mainWs, sessionIds);

		// Test 4: Routing isolation
		await testSessionRoutingIsolation(mainWs, sessionIds);

		// Test 5: Close one session, verify no orphaned processes
		const remaining = await testCloseSession(mainWs, sessionIds, ts.rpcManager);

		// Test 6: Remaining sessions still work
		await testRemainingSessionsWork(mainWs, remaining);

		// Close main WebSocket to clean up remaining sessions
		mainWs.close();
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Test 7: Cleanup on disconnect (fresh connection)
		await testCleanupOnDisconnect(ts.wsUrl, ts.rpcManager);

		const { failed } = printResults("Multi-session verification");
		process.exit(failed > 0 ? 1 : 0);
	} finally {
		await stopServer(ts);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
