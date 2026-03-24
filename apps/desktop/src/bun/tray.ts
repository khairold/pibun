/**
 * PiBun Desktop — System tray icon and menu.
 *
 * Creates a macOS/Linux/Windows tray icon with a dynamic menu showing:
 * - Current session status summary
 * - Recent/active sessions list
 * - New Session action
 * - Quit action
 *
 * The tray menu is rebuilt whenever session state changes (start, stop, crash).
 * Menu actions are forwarded to the React app via the `menu.action` push channel,
 * same pattern as the native application menu.
 *
 * @see reference/electrobun/templates/tray-app/ — Electrobun tray example
 * @see apps/desktop/src/bun/menu.ts — Application menu (same forwarding pattern)
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PiEvent } from "@pibun/contracts";
import type { PiRpcManager } from "@pibun/server/piRpcManager";
import type { PiBunServer } from "@pibun/server/server";
import { broadcastPush } from "@pibun/server/server";
import { Tray } from "electrobun/bun";

// ============================================================================
// Types
// ============================================================================

/** State of an active session for tray display. */
interface TraySessionInfo {
	/** Session ID. */
	id: string;
	/** Working directory (or "unknown"). */
	cwd: string;
	/** Current state for display. */
	state: "idle" | "working" | "error";
}

// ============================================================================
// Constants
// ============================================================================

/** Tray menu action prefix for opening a specific session. */
const TRAY_SESSION_ACTION_PREFIX = "tray.session:";

// ============================================================================
// Module State
// ============================================================================

/** The tray instance (null if not created or creation failed). */
let trayInstance: Tray | null = null;

/** Tracked session states for building the tray menu. */
const sessionStates = new Map<string, TraySessionInfo>();

/** Reference to the running server for broadcasting push events. */
let serverRef: PiBunServer | null = null;

/** Cleanup functions for event subscriptions. */
const cleanups: Array<() => void> = [];

// ============================================================================
// Tray Icon Path
// ============================================================================

/**
 * Resolve the tray icon path.
 *
 * In development: uses the icon from the source tree (icon.iconset/icon_16x16@2x.png).
 * In production: uses the icon copied to the app bundle (bun/tray-icon.png).
 *
 * The 32x32 size (16x16@2x) works well for macOS retina menu bar.
 * `template: false` shows the colored icon as-is (not auto-tinted).
 */
function resolveTrayIconPath(): string {
	// In bundled mode: import.meta.dir is Resources/app/bun/
	// The icon is copied alongside via electrobun.config copy directive.
	// In dev mode (electrobun dev): import.meta.dir is also within a bundled path.
	// Check if the bundled icon exists first, fall back to source tree.
	const bundledPath = resolve(import.meta.dir, "tray-icon.png");
	if (existsSync(bundledPath)) {
		return bundledPath;
	}

	// Development mode: use icon from the source tree
	return resolve(import.meta.dir, "../../icon.iconset/icon_16x16@2x.png");
}

// ============================================================================
// Menu Building
// ============================================================================

/**
 * Build the tray menu items from current session state.
 *
 * Menu structure:
 * - Status line (disabled label showing active session count)
 * - Separator
 * - Active sessions list (up to 8, with state indicator)
 * - Separator
 * - New Session
 * - Quit
 */
function buildTrayMenu(): Array<Record<string, unknown>> {
	const sessions = Array.from(sessionStates.values());
	const workingCount = sessions.filter((s) => s.state === "working").length;
	const errorCount = sessions.filter((s) => s.state === "error").length;

	const menu: Array<Record<string, unknown>> = [];

	// Status line
	let statusLabel = "No active sessions";
	if (sessions.length > 0) {
		const parts: string[] = [];
		if (workingCount > 0) parts.push(`${workingCount} working`);
		if (errorCount > 0) parts.push(`${errorCount} errored`);
		const idleCount = sessions.length - workingCount - errorCount;
		if (idleCount > 0) parts.push(`${idleCount} idle`);
		statusLabel = parts.join(", ");
	}
	menu.push({ type: "normal", label: statusLabel, enabled: false });
	menu.push({ type: "divider" });

	// Active sessions (up to 8)
	const displaySessions = sessions.slice(0, 8);
	if (displaySessions.length > 0) {
		for (const session of displaySessions) {
			const stateIcon = session.state === "working" ? "◉" : session.state === "error" ? "⊘" : "○";
			const dirName =
				session.cwd === "unknown" ? "untitled" : session.cwd.split("/").pop() || session.cwd;
			menu.push({
				type: "normal",
				label: `${stateIcon}  ${dirName}`,
				action: `${TRAY_SESSION_ACTION_PREFIX}${session.id}`,
			});
		}
		menu.push({ type: "divider" });
	}

	// Actions
	menu.push({
		type: "normal",
		label: "New Session",
		action: "file.new-session",
	});
	menu.push({ type: "divider" });
	menu.push({
		type: "normal",
		label: "Quit PiBun",
		action: "tray.quit",
	});

	return menu;
}

/**
 * Refresh the tray menu with current session states.
 * Safe to call frequently — just rebuilds the menu config.
 */
function refreshTrayMenu(): void {
	if (!trayInstance) return;
	trayInstance.setMenu(buildTrayMenu() as Parameters<Tray["setMenu"]>[0]);
}

// ============================================================================
// Session State Tracking
// ============================================================================

/**
 * Handle a Pi event from a specific session.
 * Updates tracked session state and refreshes the tray menu.
 */
function handleSessionPiEvent(sessionId: string, event: PiEvent): void {
	const session = sessionStates.get(sessionId);
	if (!session) return;

	switch (event.type) {
		case "agent_start":
			session.state = "working";
			refreshTrayMenu();
			break;
		case "agent_end":
			session.state = "idle";
			refreshTrayMenu();
			break;
		case "auto_retry_end":
			if (!event.success) {
				session.state = "error";
				refreshTrayMenu();
			}
			break;
	}
}

/**
 * Subscribe to Pi events on a specific session process.
 * Returns a cleanup function.
 */
function subscribeToSession(sessionId: string, rpcManager: PiRpcManager): () => void {
	const managedSession = rpcManager.getSession(sessionId);
	if (!managedSession) return () => {};

	return managedSession.process.onEvent((event) => {
		handleSessionPiEvent(sessionId, event);
	});
}

// ============================================================================
// Tray Click Handler
// ============================================================================

/**
 * Handle tray menu item clicks.
 *
 * Actions:
 * - `file.new-session` → forward to React app via menu.action push
 * - `tray.session:ID` → forward as `tray.focus-session` with sessionId
 * - `tray.quit` → trigger app quit
 */
function handleTrayClick(event: unknown): void {
	const { data } = event as { data: { action?: string; data?: unknown } };
	const action = data?.action;
	if (!action) return;

	if (action === "tray.quit") {
		// Trigger quit — the main process handles shutdown
		process.emit("SIGTERM");
		return;
	}

	if (action.startsWith(TRAY_SESSION_ACTION_PREFIX)) {
		// Focus a specific session — forward to React app
		const sessionId = action.slice(TRAY_SESSION_ACTION_PREFIX.length);
		if (serverRef) {
			broadcastPush(serverRef.connections, "menu.action", {
				action: "tray.focus-session",
				data: { sessionId },
			});
		}
		return;
	}

	// Forward all other actions to the React app (e.g., file.new-session)
	if (serverRef) {
		broadcastPush(serverRef.connections, "menu.action", {
			action,
		});
	}
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the system tray icon and menu.
 *
 * Wires:
 * 1. Creates the tray icon with the PiBun app icon
 * 2. Sets up the initial tray menu
 * 3. Subscribes to PiRpcManager session events to track active sessions
 * 4. Handles tray menu clicks → forwards actions via WS push
 *
 * @param server - The running PiBun server
 * @param rpcManager - The Pi RPC session manager
 * @returns Cleanup function to remove the tray and unsubscribe listeners
 */
export function initTray(server: PiBunServer, rpcManager: PiRpcManager): () => void {
	serverRef = server;

	// Create tray icon
	const iconPath = resolveTrayIconPath();
	console.log(`[Tray] Icon path: ${iconPath}`);

	try {
		trayInstance = new Tray({
			title: "",
			image: iconPath,
			template: false,
			width: 18,
			height: 18,
		});
	} catch (err) {
		console.warn("[Tray] Failed to create system tray:", err);
		return () => {};
	}

	// Initialize session states from any existing sessions
	for (const session of rpcManager.getActiveSessions()) {
		const cwd = session.process.options.cwd || "unknown";
		sessionStates.set(session.id, {
			id: session.id,
			cwd,
			state: "idle",
		});

		// Subscribe to Pi events on existing sessions
		const unsub = subscribeToSession(session.id, rpcManager);
		cleanups.push(unsub);
	}

	// Set initial menu
	refreshTrayMenu();

	// Handle tray menu item clicks
	trayInstance.on("tray-clicked", handleTrayClick);

	// Watch for new sessions → add to tracking + subscribe to events
	const unsubSessionEvents = rpcManager.onSessionEvent((sessionId, event) => {
		switch (event.type) {
			case "created": {
				const managedSession = rpcManager.getSession(sessionId);
				const cwd = managedSession?.process.options.cwd || "unknown";
				sessionStates.set(sessionId, {
					id: sessionId,
					cwd,
					state: "idle",
				});

				// Subscribe to Pi events on the new session
				const unsub = subscribeToSession(sessionId, rpcManager);
				cleanups.push(unsub);

				refreshTrayMenu();
				break;
			}
			case "stopped":
			case "crashed": {
				sessionStates.delete(sessionId);
				refreshTrayMenu();
				break;
			}
		}
	});
	cleanups.push(unsubSessionEvents);

	console.log("[Tray] System tray initialized");

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups.length = 0;
		sessionStates.clear();
		if (trayInstance) {
			trayInstance.remove();
			trayInstance = null;
		}
		serverRef = null;
	};
}
