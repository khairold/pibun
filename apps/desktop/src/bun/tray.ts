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
 * ## Tray Status Indicator
 *
 * The tray icon changes based on the aggregate session state:
 * - **Idle** (no sessions, or all idle): default PiBun app icon
 * - **Working** (any session is working): blue-tinted status icon
 * - **Error** (any session errored, none working): red-tinted status icon
 *
 * Status icons are 32x32 PNGs (16x16@2x retina) generated at init time to a
 * temp directory. Each is a simple colored circle — we can't composite over the
 * app icon without an image library, so the status dots replace the icon entirely.
 * The idle state restores the original app icon.
 *
 * @see reference/electrobun/templates/tray-app/ — Electrobun tray example
 * @see apps/desktop/src/bun/menu.ts — Application menu (same forwarding pattern)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

/**
 * Aggregate tray state derived from all active sessions.
 * Priority: working > error > idle (if ANY session is working, tray shows working).
 */
type AggregateTrayState = "idle" | "working" | "error";

// ============================================================================
// Constants
// ============================================================================

/** Tray menu action prefix for opening a specific session. */
const TRAY_SESSION_ACTION_PREFIX = "tray.session:";

/** Size of generated status indicator PNGs (32x32 = 16x16@2x retina). */
const STATUS_ICON_SIZE = 32;

/**
 * Status icon colors (RGBA).
 * Working = blue (matches PiBun's accent blue), Error = red.
 */
const STATUS_COLORS: Record<"working" | "error", [number, number, number, number]> = {
	working: [59, 130, 246, 255], // Tailwind blue-500
	error: [239, 68, 68, 255], // Tailwind red-500
};

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

/** Current aggregate tray state — used to avoid redundant `setImage` calls. */
let currentAggregateState: AggregateTrayState = "idle";

/** Path to the default (idle) tray icon — the PiBun app icon. */
let idleIconPath = "";

/** Paths to generated status indicator icons. Null until `generateStatusIcons()` runs. */
let statusIconPaths: Record<"working" | "error", string> | null = null;

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
// Status Icon Generation
// ============================================================================

/**
 * Generate a minimal valid PNG file with a colored filled circle.
 *
 * Creates a 32x32 RGBA PNG (16x16@2x retina) with a circle of the given color
 * on a transparent background. Uses raw PNG encoding — no external image library.
 *
 * PNG structure: signature + IHDR + IDAT (zlib-compressed scanlines) + IEND.
 * Each scanline is filter byte (0 = None) + 4 bytes per pixel (RGBA).
 */
function generateCirclePng(color: [number, number, number, number]): Buffer {
	const size = STATUS_ICON_SIZE;
	const [r, g, b, a] = color;

	// Build raw scanline data: filter byte + RGBA pixels per row
	const rawData: number[] = [];
	const center = size / 2;
	const radius = size / 2 - 1; // Small margin for anti-alias room
	const radiusSq = radius * radius;

	for (let y = 0; y < size; y++) {
		rawData.push(0); // Filter: None
		for (let x = 0; x < size; x++) {
			const dx = x + 0.5 - center;
			const dy = y + 0.5 - center;
			const distSq = dx * dx + dy * dy;

			if (distSq <= radiusSq) {
				// Inside the circle — full color
				rawData.push(r, g, b, a);
			} else if (distSq <= (radius + 1) * (radius + 1)) {
				// Edge pixel — anti-aliased alpha
				const dist = Math.sqrt(distSq);
				const edgeAlpha = Math.max(0, Math.min(1, radius + 1 - dist));
				rawData.push(r, g, b, Math.round(a * edgeAlpha));
			} else {
				// Outside — transparent
				rawData.push(0, 0, 0, 0);
			}
		}
	}

	// Compress with zlib (Bun provides this via Node compat)
	const { deflateSync } = require("node:zlib");
	const compressed = deflateSync(Buffer.from(rawData)) as Buffer;

	// Build PNG
	const chunks: Buffer[] = [];

	// PNG signature
	chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

	// IHDR chunk
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0); // width
	ihdr.writeUInt32BE(size, 4); // height
	ihdr.writeUInt8(8, 8); // bit depth
	ihdr.writeUInt8(6, 9); // color type: RGBA
	ihdr.writeUInt8(0, 10); // compression
	ihdr.writeUInt8(0, 11); // filter
	ihdr.writeUInt8(0, 12); // interlace
	chunks.push(pngChunk("IHDR", ihdr));

	// IDAT chunk (compressed pixel data)
	chunks.push(pngChunk("IDAT", compressed));

	// IEND chunk
	chunks.push(pngChunk("IEND", Buffer.alloc(0)));

	return Buffer.concat(chunks);
}

/**
 * Build a PNG chunk: length (4 bytes) + type (4 bytes) + data + CRC (4 bytes).
 */
function pngChunk(type: string, data: Buffer): Buffer {
	const typeBytes = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);

	// CRC32 over type + data
	const crcData = Buffer.concat([typeBytes, data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(crcData), 0);

	return Buffer.concat([length, typeBytes, data, crc]);
}

/**
 * CRC32 computation for PNG chunk validation.
 * Standard CRC-32 with polynomial 0xEDB88320 (reflected).
 */
function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i] ?? 0;
		for (let j = 0; j < 8; j++) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Generate status indicator PNG icons and write to temp directory.
 * Creates colored circle PNGs for "working" (blue) and "error" (red) states.
 * Returns the directory path, or null if generation fails.
 */
function generateStatusIcons(): Record<"working" | "error", string> | null {
	try {
		const dir = resolve(tmpdir(), "pibun-tray-icons");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		const paths: Record<string, string> = {};
		for (const [state, color] of Object.entries(STATUS_COLORS)) {
			const pngData = generateCirclePng(color as [number, number, number, number]);
			const filePath = resolve(dir, `tray-${state}.png`);
			writeFileSync(filePath, pngData);
			paths[state] = filePath;
		}

		console.log(`[Tray] Status icons generated in ${dir}`);
		return paths as Record<"working" | "error", string>;
	} catch (err) {
		console.warn("[Tray] Failed to generate status icons:", err);
		return null;
	}
}

// ============================================================================
// Aggregate State & Icon Switching
// ============================================================================

/**
 * Derive the aggregate tray state from all active sessions.
 * Priority: working > error > idle.
 * If ANY session is working → working. If ANY is errored (and none working) → error.
 * Otherwise → idle.
 */
function deriveAggregateState(): AggregateTrayState {
	let hasError = false;
	for (const session of sessionStates.values()) {
		if (session.state === "working") return "working";
		if (session.state === "error") hasError = true;
	}
	return hasError ? "error" : "idle";
}

/**
 * Update the tray icon to reflect the current aggregate session state.
 * Only calls `setImage` when the state actually changes to avoid flicker.
 */
function updateTrayStatusIcon(): void {
	if (!trayInstance) return;

	const newState = deriveAggregateState();
	if (newState === currentAggregateState) return;

	currentAggregateState = newState;

	if (newState === "idle") {
		// Restore the default PiBun app icon
		trayInstance.setImage(idleIconPath);
	} else if (statusIconPaths) {
		// Switch to colored status indicator
		trayInstance.setImage(statusIconPaths[newState]);
	}

	console.log(`[Tray] Status icon → ${newState}`);
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
 * Refresh the tray menu and status icon with current session states.
 * Safe to call frequently — `updateTrayStatusIcon` skips redundant `setImage` calls.
 */
function refreshTrayMenu(): void {
	if (!trayInstance) return;
	trayInstance.setMenu(buildTrayMenu() as Parameters<Tray["setMenu"]>[0]);
	updateTrayStatusIcon();
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
	idleIconPath = iconPath;
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

	// Generate colored status indicator icons for working/error states
	statusIconPaths = generateStatusIcons();

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
		currentAggregateState = "idle";
		statusIconPaths = null;
		if (trayInstance) {
			trayInstance.remove();
			trayInstance = null;
		}
		serverRef = null;
	};
}
