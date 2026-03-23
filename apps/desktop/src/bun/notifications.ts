/**
 * PiBun Desktop — Native system notifications for long-running operations.
 *
 * Shows macOS/Linux/Windows notifications when:
 * - Pi finishes an agent turn (agent_end) and the window is not focused
 * - Pi encounters an error while running in the background
 *
 * Notifications use Electrobun's `Utils.showNotification()` which wraps
 * native notification APIs (NSUserNotification on macOS, etc.).
 *
 * Window focus is tracked via Electrobun's focus/blur events on the
 * BrowserWindow instance.
 *
 * @see docs/DESKTOP.md — Desktop integration plan
 */

import type { PiEvent } from "@pibun/contracts";
import type { PiRpcManager } from "@pibun/server/piRpcManager";
import type { BrowserWindow } from "electrobun/bun";
import { Utils } from "electrobun/bun";

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum agent turn duration (in ms) before showing a notification.
 * Short turns (< threshold) don't warrant a notification — the user
 * likely hasn't context-switched away yet.
 */
const MIN_TURN_DURATION_MS = 5_000;

// ============================================================================
// State
// ============================================================================

/** Whether the main window currently has focus. */
let isWindowFocused = true;

/** Timestamp when the current agent turn started (agent_start event). */
let agentStartTime: number | null = null;

/** Cleanup functions for event subscriptions. */
const cleanups: Array<() => void> = [];

// ============================================================================
// Focus Tracking
// ============================================================================

/**
 * Wire window focus/blur tracking on the main BrowserWindow.
 *
 * Electrobun emits "focus" and "blur" events on the window instance
 * when the native window gains or loses focus.
 */
function trackWindowFocus(mainWindow: BrowserWindow): void {
	mainWindow.on("focus", (_event: unknown) => {
		isWindowFocused = true;
	});

	mainWindow.on("blur", (_event: unknown) => {
		isWindowFocused = false;
	});
}

// ============================================================================
// Pi Event Handling
// ============================================================================

/**
 * Handle a Pi event for notification purposes.
 *
 * Tracks agent_start/agent_end lifecycle:
 * - agent_start → record timestamp
 * - agent_end → if window is unfocused and turn took > threshold, show notification
 *
 * Also watches for crash events from the RPC manager.
 */
function handlePiEvent(event: PiEvent): void {
	switch (event.type) {
		case "agent_start":
			agentStartTime = Date.now();
			break;

		case "agent_end": {
			if (!agentStartTime) break;

			const duration = Date.now() - agentStartTime;
			agentStartTime = null;

			// Only notify if window is not focused and turn was long enough
			if (!isWindowFocused && duration >= MIN_TURN_DURATION_MS) {
				const seconds = Math.round(duration / 1000);
				Utils.showNotification({
					title: "PiBun — Task Complete",
					body: `Agent finished after ${seconds}s`,
					silent: false,
				});
			}
			break;
		}

		case "auto_retry_end": {
			// Notify on retry failure when window is not focused
			if (!isWindowFocused && !event.success && event.finalError) {
				Utils.showNotification({
					title: "PiBun — Retry Failed",
					body: `Failed after ${event.attempt} attempts: ${event.finalError}`,
					silent: false,
				});
			}
			break;
		}
	}
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the desktop notification system.
 *
 * Wires:
 * 1. Window focus/blur tracking on the BrowserWindow
 * 2. Pi event subscriptions on all current and future sessions via PiRpcManager
 * 3. Session crash notifications
 *
 * @param mainWindow - The main BrowserWindow instance
 * @param rpcManager - The Pi RPC session manager
 * @returns Cleanup function to unsubscribe all listeners
 */
export function initNotifications(mainWindow: BrowserWindow, rpcManager: PiRpcManager): () => void {
	// Track window focus state
	trackWindowFocus(mainWindow);

	// Subscribe to session lifecycle events for crash notifications
	const unsubSession = rpcManager.onSessionEvent((_sessionId, event) => {
		if (event.type === "crashed" && !isWindowFocused) {
			Utils.showNotification({
				title: "PiBun — Session Crashed",
				body: `Session ended unexpectedly (exit code ${event.exitCode})`,
				silent: false,
			});
		}
	});
	cleanups.push(unsubSession);

	// Subscribe to Pi events on all existing sessions
	for (const session of rpcManager.getActiveSessions()) {
		const unsub = session.process.onEvent(handlePiEvent);
		cleanups.push(unsub);
	}

	// Watch for new sessions being created → subscribe to their events
	const unsubCreated = rpcManager.onSessionEvent((sessionId, event) => {
		if (event.type === "created") {
			const session = rpcManager.getSession(sessionId);
			if (session) {
				const unsub = session.process.onEvent(handlePiEvent);
				cleanups.push(unsub);
			}
		}
	});
	cleanups.push(unsubCreated);

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups.length = 0;
		agentStartTime = null;
		isWindowFocused = true;
	};
}
