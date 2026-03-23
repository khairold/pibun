/**
 * Unit tests for PiRpcManager.
 *
 * Uses a fake Pi binary (test-fixtures/fake-pi.ts) that accepts the same
 * CLI args as `pi --mode rpc`, reads JSONL from stdin, and writes JSONL
 * responses to stdout. Configurable via environment variables to simulate
 * crashes, stderr output, etc.
 *
 * Run with: bun test apps/server/src/piRpcManager.test.ts
 *
 * Test categories:
 * - Session creation (auto ID, custom ID, duplicate rejection)
 * - Session lookup (get, has, active, all, size)
 * - Session stopping (single, non-existent, already stopped, stop all)
 * - Crash handling (detection, cleanup, stderr capture)
 * - Session event listeners (created, stopped, crashed, unsubscribe)
 * - Command forwarding (send command through managed session)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { type CreateSessionOptions, PiRpcManager, type SessionEvent } from "./piRpcManager.js";

// ============================================================================
// Helpers
// ============================================================================

/** Absolute path to the fake Pi RPC binary. */
const FAKE_PI = resolve(import.meta.dir, "../test-fixtures/fake-pi.ts");

/** Small delay for async operations (process spawn, event propagation). */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Create options pointing at the fake Pi binary. */
function fakeOpts(overrides: Partial<CreateSessionOptions> = {}): CreateSessionOptions {
	return { piCommand: FAKE_PI, ...overrides };
}

/**
 * Wait for a specific session event type from the manager.
 * Rejects after timeoutMs if the event never fires.
 */
function waitForSessionEvent(
	manager: PiRpcManager,
	type: SessionEvent["type"],
	timeoutMs = 3000,
): Promise<{ sessionId: string; event: SessionEvent }> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Timeout waiting for '${type}' event`)),
			timeoutMs,
		);
		const unsub = manager.onSessionEvent((sessionId, event) => {
			if (event.type === type) {
				clearTimeout(timeout);
				unsub();
				resolve({ sessionId, event });
			}
		});
	});
}

/**
 * Collect all session events emitted during a callback.
 * Returns the list of { sessionId, event } pairs.
 */
function collectSessionEvents(manager: PiRpcManager): { sessionId: string; event: SessionEvent }[] {
	const events: { sessionId: string; event: SessionEvent }[] = [];
	manager.onSessionEvent((sessionId, event) => {
		events.push({ sessionId, event });
	});
	return events;
}

// ============================================================================
// Tests
// ============================================================================

describe("PiRpcManager", () => {
	let manager: PiRpcManager;

	beforeEach(() => {
		manager = new PiRpcManager();
	});

	afterEach(async () => {
		await manager.stopAll();
	});

	// =========================================================================
	// Session Creation
	// =========================================================================

	describe("session creation", () => {
		test("creates session with auto-generated ID", () => {
			const session = manager.createSession(fakeOpts());
			expect(session.id).toMatch(/^session_\d+_\d+$/);
			expect(session.process).toBeDefined();
			expect(session.createdAt).toBeGreaterThan(0);
		});

		test("auto-generated IDs are unique", () => {
			const s1 = manager.createSession(fakeOpts());
			const s2 = manager.createSession(fakeOpts());
			expect(s1.id).not.toBe(s2.id);
		});

		test("accepts custom session ID", () => {
			const session = manager.createSession(fakeOpts({ sessionId: "my-session" }));
			expect(session.id).toBe("my-session");
		});

		test("throws on duplicate session ID", () => {
			manager.createSession(fakeOpts({ sessionId: "dup" }));
			expect(() => manager.createSession(fakeOpts({ sessionId: "dup" }))).toThrow(
				"Session 'dup' already exists",
			);
		});

		test("process is in running state after creation", () => {
			const session = manager.createSession(fakeOpts());
			expect(session.process.state).toBe("running");
		});

		test("emits 'created' event", () => {
			const events = collectSessionEvents(manager);
			const session = manager.createSession(fakeOpts({ sessionId: "test-create" }));

			expect(events).toHaveLength(1);
			expect(events[0]?.sessionId).toBe(session.id);
			expect(events[0]?.event.type).toBe("created");
		});
	});

	// =========================================================================
	// Session Lookup
	// =========================================================================

	describe("session lookup", () => {
		test("getSession returns session by ID", () => {
			const session = manager.createSession(fakeOpts({ sessionId: "lookup" }));
			const found = manager.getSession("lookup");
			expect(found).toBe(session);
		});

		test("getSession returns undefined for unknown ID", () => {
			expect(manager.getSession("nonexistent")).toBeUndefined();
		});

		test("hasSession returns true for existing session", () => {
			manager.createSession(fakeOpts({ sessionId: "exists" }));
			expect(manager.hasSession("exists")).toBe(true);
		});

		test("hasSession returns false for unknown ID", () => {
			expect(manager.hasSession("nope")).toBe(false);
		});

		test("size tracks session count", () => {
			expect(manager.size).toBe(0);
			manager.createSession(fakeOpts());
			expect(manager.size).toBe(1);
			manager.createSession(fakeOpts());
			expect(manager.size).toBe(2);
		});

		test("getActiveSessions returns running sessions", () => {
			manager.createSession(fakeOpts());
			manager.createSession(fakeOpts());
			const active = manager.getActiveSessions();
			expect(active).toHaveLength(2);
			for (const s of active) {
				expect(s.process.state).toBe("running");
			}
		});

		test("getAllSessions returns all sessions", () => {
			manager.createSession(fakeOpts());
			manager.createSession(fakeOpts());
			manager.createSession(fakeOpts());
			expect(manager.getAllSessions()).toHaveLength(3);
		});
	});

	// =========================================================================
	// Session Stopping
	// =========================================================================

	describe("session stopping", () => {
		test("stopSession removes session from map", async () => {
			const session = manager.createSession(fakeOpts({ sessionId: "stop-me" }));
			expect(manager.hasSession("stop-me")).toBe(true);

			await manager.stopSession(session.id);

			expect(manager.hasSession("stop-me")).toBe(false);
			expect(manager.size).toBe(0);
		});

		test("stopSession emits 'stopped' event", async () => {
			const events = collectSessionEvents(manager);
			const session = manager.createSession(fakeOpts({ sessionId: "stop-event" }));

			await manager.stopSession(session.id);

			// Should have 2 events: created + stopped
			expect(events).toHaveLength(2);
			expect(events[1]?.event.type).toBe("stopped");
			expect(events[1]?.sessionId).toBe("stop-event");
		});

		test("stopSession sets process to stopped state", async () => {
			const session = manager.createSession(fakeOpts());
			await manager.stopSession(session.id);
			expect(session.process.state).toBe("stopped");
		});

		test("stopSession is no-op for unknown ID", async () => {
			// Should not throw
			await manager.stopSession("nonexistent");
		});

		test("stopSession is safe to call twice", async () => {
			const session = manager.createSession(fakeOpts({ sessionId: "double-stop" }));
			await manager.stopSession(session.id);
			// Second call is a no-op (session already removed)
			await manager.stopSession(session.id);
			expect(manager.hasSession("double-stop")).toBe(false);
		});

		test("stopAll stops all sessions", async () => {
			manager.createSession(fakeOpts({ sessionId: "a" }));
			manager.createSession(fakeOpts({ sessionId: "b" }));
			manager.createSession(fakeOpts({ sessionId: "c" }));
			expect(manager.size).toBe(3);

			await manager.stopAll();

			expect(manager.size).toBe(0);
			expect(manager.getActiveSessions()).toHaveLength(0);
		});

		test("stopAll emits stopped event for each session", async () => {
			const events = collectSessionEvents(manager);
			manager.createSession(fakeOpts({ sessionId: "x" }));
			manager.createSession(fakeOpts({ sessionId: "y" }));

			await manager.stopAll();

			const stoppedEvents = events.filter((e) => e.event.type === "stopped");
			expect(stoppedEvents).toHaveLength(2);
		});

		test("stopAll with no sessions is a no-op", async () => {
			await manager.stopAll();
			expect(manager.size).toBe(0);
		});
	});

	// =========================================================================
	// Crash Handling
	// =========================================================================

	describe("crash handling", () => {
		test("detects process crash and emits 'crashed' event", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			manager.createSession(
				fakeOpts({
					sessionId: "crash-test",
					env: { FAKE_PI_CRASH_AFTER_MS: "100", FAKE_PI_EXIT_CODE: "42" },
				}),
			);

			const { sessionId, event } = await crashPromise;

			expect(sessionId).toBe("crash-test");
			expect(event.type).toBe("crashed");
			if (event.type === "crashed") {
				expect(event.exitCode).toBe(42);
			}
		});

		test("removes crashed session from map", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			manager.createSession(
				fakeOpts({
					sessionId: "crash-remove",
					env: { FAKE_PI_CRASH_AFTER_MS: "100" },
				}),
			);

			expect(manager.hasSession("crash-remove")).toBe(true);

			await crashPromise;

			expect(manager.hasSession("crash-remove")).toBe(false);
			expect(manager.size).toBe(0);
		});

		test("captures stderr from crashed process", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			manager.createSession(
				fakeOpts({
					sessionId: "crash-stderr",
					env: {
						FAKE_PI_CRASH_AFTER_MS: "200",
						FAKE_PI_STDERR: "fatal error: something broke",
					},
				}),
			);

			const { event } = await crashPromise;

			// Allow a small delay for stderr reader to fully drain
			await delay(50);

			expect(event.type).toBe("crashed");
			if (event.type === "crashed") {
				expect(event.stderr).toContain("fatal error: something broke");
			}
		});

		test("crash does not affect other sessions", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			manager.createSession(fakeOpts({ sessionId: "healthy" }));
			manager.createSession(
				fakeOpts({
					sessionId: "doomed",
					env: { FAKE_PI_CRASH_AFTER_MS: "100" },
				}),
			);

			expect(manager.size).toBe(2);

			await crashPromise;

			// Only the crashed session was removed
			expect(manager.size).toBe(1);
			expect(manager.hasSession("healthy")).toBe(true);
			expect(manager.hasSession("doomed")).toBe(false);

			const healthy = manager.getSession("healthy");
			expect(healthy?.process.state).toBe("running");
		});

		test("process state is 'crashed' after unexpected exit", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			const session = manager.createSession(
				fakeOpts({
					sessionId: "state-check",
					env: { FAKE_PI_CRASH_AFTER_MS: "100" },
				}),
			);

			await crashPromise;

			expect(session.process.state).toBe("crashed");
		});
	});

	// =========================================================================
	// Event Listeners
	// =========================================================================

	describe("event listeners", () => {
		test("listener receives all event types in order", async () => {
			const events = collectSessionEvents(manager);

			// Create a session that will crash
			const crashPromise = waitForSessionEvent(manager, "crashed");
			manager.createSession(
				fakeOpts({
					sessionId: "lifecycle",
					env: { FAKE_PI_CRASH_AFTER_MS: "100" },
				}),
			);

			await crashPromise;

			expect(events).toHaveLength(2);
			expect(events[0]?.event.type).toBe("created");
			expect(events[1]?.event.type).toBe("crashed");
		});

		test("multiple listeners all receive events", () => {
			const events1: SessionEvent[] = [];
			const events2: SessionEvent[] = [];

			manager.onSessionEvent((_id, event) => events1.push(event));
			manager.onSessionEvent((_id, event) => events2.push(event));

			manager.createSession(fakeOpts());

			expect(events1).toHaveLength(1);
			expect(events2).toHaveLength(1);
			expect(events1[0]?.type).toBe("created");
			expect(events2[0]?.type).toBe("created");
		});

		test("unsubscribe stops delivering events", async () => {
			const events: SessionEvent[] = [];
			const unsub = manager.onSessionEvent((_id, event) => events.push(event));

			manager.createSession(fakeOpts({ sessionId: "first" }));
			expect(events).toHaveLength(1);

			// Unsubscribe
			unsub();

			// This event should NOT be delivered
			manager.createSession(fakeOpts({ sessionId: "second" }));
			expect(events).toHaveLength(1);
		});

		test("listener receives session ID with event", () => {
			const received: string[] = [];
			manager.onSessionEvent((id) => received.push(id));

			manager.createSession(fakeOpts({ sessionId: "alpha" }));
			manager.createSession(fakeOpts({ sessionId: "beta" }));

			expect(received).toEqual(["alpha", "beta"]);
		});
	});

	// =========================================================================
	// Command Forwarding (via ManagedSession's PiProcess)
	// =========================================================================

	describe("command forwarding", () => {
		test("can send command through managed session", async () => {
			const session = manager.createSession(fakeOpts());

			const response = await session.process.sendCommand({
				type: "get_state",
			});

			expect(response.type).toBe("response");
			expect(response.command).toBe("get_state");
			expect(response.success).toBe(true);
		});

		test("command IDs are correlated correctly", async () => {
			const session = manager.createSession(fakeOpts());

			const response = await session.process.sendCommand({
				type: "get_available_models",
				id: "custom-id-42",
			});

			expect(response.id).toBe("custom-id-42");
			expect(response.command).toBe("get_available_models");
		});

		test("can send multiple commands to different sessions", async () => {
			const s1 = manager.createSession(fakeOpts({ sessionId: "cmd-1" }));
			const s2 = manager.createSession(fakeOpts({ sessionId: "cmd-2" }));

			const [r1, r2] = await Promise.all([
				s1.process.sendCommand({ type: "get_state" }),
				s2.process.sendCommand({ type: "get_available_models" }),
			]);

			expect(r1.command).toBe("get_state");
			expect(r2.command).toBe("get_available_models");
		});
	});

	// =========================================================================
	// Edge Cases
	// =========================================================================

	describe("edge cases", () => {
		test("createSession with empty options uses defaults", () => {
			// This will try to spawn the real `pi` which may fail,
			// but we're testing that the method accepts empty options.
			// Use fake pi to avoid needing real Pi installed.
			const session = manager.createSession(fakeOpts());
			expect(session.id).toBeDefined();
			expect(session.process.state).toBe("running");
		});

		test("size updates correctly through lifecycle", async () => {
			expect(manager.size).toBe(0);

			manager.createSession(fakeOpts({ sessionId: "a" }));
			expect(manager.size).toBe(1);

			manager.createSession(fakeOpts({ sessionId: "b" }));
			expect(manager.size).toBe(2);

			await manager.stopSession("a");
			expect(manager.size).toBe(1);

			await manager.stopSession("b");
			expect(manager.size).toBe(0);
		});

		test("getSession returns undefined after session is stopped", async () => {
			manager.createSession(fakeOpts({ sessionId: "ephemeral" }));
			expect(manager.getSession("ephemeral")).toBeDefined();

			await manager.stopSession("ephemeral");
			expect(manager.getSession("ephemeral")).toBeUndefined();
		});

		test("hasSession returns false after session crashes", async () => {
			const crashPromise = waitForSessionEvent(manager, "crashed");

			manager.createSession(
				fakeOpts({
					sessionId: "crash-has",
					env: { FAKE_PI_CRASH_AFTER_MS: "100" },
				}),
			);

			await crashPromise;
			expect(manager.hasSession("crash-has")).toBe(false);
		});
	});
});
