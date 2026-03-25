/**
 * PiBun Desktop — Main process (Electrobun/Bun).
 *
 * This is the entry point for the native desktop application.
 * Responsibilities:
 * - Start PiBun server on an available port (2A.2)
 * - Wait for server health check, then open webview (2A.3)
 * - Window lifecycle management (2A.4)
 * - Graceful shutdown of server + Pi processes (2A.5)
 * - Dev mode support for Vite HMR (2A.6)
 *
 * @see docs/DESKTOP.md — Desktop integration plan
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PiRpcManager } from "@pibun/server/piRpcManager";
import { loadProjects } from "@pibun/server/persistence";
import { type PiBunServer, broadcastPush, createServer } from "@pibun/server/server";
import Electrobun, { ApplicationMenu, BrowserWindow, ContextMenu, Utils } from "electrobun/bun";
import {
	type MenuAction,
	OPEN_RECENT_ACTION_PREFIX,
	type RecentProject,
	buildMenuConfig,
	createMenuClickHandler,
} from "./menu";
import { initNotifications } from "./notifications";
import { initTray } from "./tray";
import { handleApplyUpdate, handleCheckForUpdates, initUpdater, stopUpdater } from "./updater";
import {
	type WindowFrame,
	debouncedSaveWindowState,
	flushWindowState,
	loadWindowState,
} from "./windowState";

// ============================================================================
// Types — Electrobun event data shapes (from windowEvents.ts in Electrobun)
// ============================================================================

interface ResizeEventData {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface MoveEventData {
	id: number;
	x: number;
	y: number;
}

interface ElectrobunEvent<T> {
	data: T;
}

// ============================================================================
// Constants
// ============================================================================

const APP_TITLE = "PiBun";

/** Maximum number of health/ready check attempts before giving up. */
const HEALTH_CHECK_MAX_RETRIES = 30;

/** Delay between health/ready check attempts in milliseconds. */
const HEALTH_CHECK_DELAY_MS = 200;

/** Default Vite dev server URL when PIBUN_DEV is set without a custom URL. */
const DEFAULT_VITE_URL = "http://localhost:5173";

// ============================================================================
// Dev Mode
// ============================================================================

/**
 * Dev mode URL. When set via `PIBUN_DEV_URL` env var, the desktop skips
 * starting the embedded server and points the webview at this URL instead
 * (typically the Vite dev server at http://localhost:5173).
 *
 * Alternatively, set `PIBUN_DEV=1` to use the default Vite URL.
 *
 * In dev mode, the PiBun server and Vite dev server must be started
 * separately:
 *   bun run dev:server   → starts PiBun server on :24242
 *   bun run dev:web      → starts Vite dev server on :5173
 *
 * The Vite dev server proxies /ws to ws://localhost:24242 (configured in
 * apps/web/vite.config.ts), so WebSocket connections work transparently.
 */
function getDevUrl(): string | null {
	if (process.env.PIBUN_DEV_URL) {
		return process.env.PIBUN_DEV_URL;
	}
	if (process.env.PIBUN_DEV === "1" || process.env.PIBUN_DEV === "true") {
		return DEFAULT_VITE_URL;
	}
	return null;
}

const DEV_URL = getDevUrl();

// ============================================================================
// Static Files
// ============================================================================

/**
 * Resolve the path to the web app's built output directory.
 *
 * In Electrobun builds (both `electrobun dev` and `electrobun build`):
 *   The bun code is bundled to Resources/app/bun/index.js
 *   The web dist is copied to Resources/app/web-dist/ (via electrobun.config copy)
 *   So: import.meta.dir = .../Resources/app/bun/
 *       resolve(import.meta.dir, "../web-dist") = .../Resources/app/web-dist/
 *
 * Falls back to monorepo layout if the bundled path doesn't exist (e.g.,
 * running the source file directly with `bun run`, which shouldn't happen
 * in practice since Electrobun always bundles).
 */
function resolveWebDistDir(): string {
	// Primary: bundled Electrobun app (web dist copied alongside bun code)
	const bundledPath = resolve(import.meta.dir, "../web-dist");
	if (existsSync(bundledPath)) {
		return bundledPath;
	}

	// Fallback: monorepo dev layout (running unbundled source directly)
	return resolve(import.meta.dir, "../../../../apps/web/dist");
}

const WEB_DIST_DIR = resolveWebDistDir();

// ============================================================================
// Module State
// ============================================================================

/** The running PiBun server (null in dev mode). */
let pibunServer: PiBunServer | null = null;

/** Reference to the main BrowserWindow. Set after creation in bootstrap(). */
let mainWindowRef: BrowserWindow | null = null;

/** Current tracked window frame. Updated by resize/move events. */
let currentFrame: WindowFrame;

/** Whether the shutdown sequence is in progress. */
let isShuttingDown = false;

/**
 * Recent project CWDs used by the "Open Recent" menu.
 * Indexed by position — the menu action `file.open-recent:N` maps to index N.
 * Updated when projects change (add/remove/update) via the server hook.
 */
let recentProjectCwds: string[] = [];

/** Cleanup function for the system tray. */
let cleanupTray: (() => void) | null = null;

// ============================================================================
// Health / Ready Check
// ============================================================================

/**
 * Poll a URL until it responds with an HTTP 200.
 *
 * In production mode, checks the server's `/health` endpoint.
 * In dev mode, checks the Vite dev server's root URL (`/`).
 *
 * @param baseUrl - Base URL to check (e.g., `http://localhost:12345`)
 * @param path - Path to check (default: "/health")
 * @param maxRetries - Maximum number of attempts (default: 30)
 * @param delayMs - Delay between attempts in milliseconds (default: 200)
 * @throws If the URL doesn't respond within the retry limit.
 */
async function waitForReady(
	baseUrl: string,
	path = "/health",
	maxRetries: number = HEALTH_CHECK_MAX_RETRIES,
	delayMs: number = HEALTH_CHECK_DELAY_MS,
): Promise<void> {
	const checkUrl = `${baseUrl}${path}`;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(checkUrl);
			if (response.ok) {
				console.log(`Ready check passed at ${checkUrl} (attempt ${attempt}/${maxRetries})`);
				return;
			}
			console.warn(`Ready check returned ${response.status} (attempt ${attempt}/${maxRetries})`);
		} catch {
			// Server not ready yet — connection refused or network error.
			if (attempt < maxRetries) {
				console.log(`Waiting for ${checkUrl}... (attempt ${attempt}/${maxRetries})`);
			}
		}

		if (attempt < maxRetries) {
			await Bun.sleep(delayMs);
		}
	}

	throw new Error(
		`${checkUrl} did not become ready after ${maxRetries} attempts (${(maxRetries * delayMs) / 1000}s)`,
	);
}

// ============================================================================
// Open Recent Menu
// ============================================================================

/**
 * Refresh the native "Open Recent" submenu with the current project list.
 *
 * Loads projects from `~/.pibun/projects.json`, takes the top 10 by
 * `lastOpened`, rebuilds the full application menu, and replaces it.
 *
 * Also updates the `recentProjectCwds` module state so that menu
 * action handlers can look up the CWD by index.
 */
async function refreshRecentMenu(): Promise<void> {
	try {
		const projects = await loadProjects();
		const recent: RecentProject[] = projects.slice(0, 10).map((p) => ({
			name: p.name,
			cwd: p.cwd,
		}));

		recentProjectCwds = recent.map((r) => r.cwd);

		ApplicationMenu.setApplicationMenu(buildMenuConfig(recent));
		console.log(`[Menu] Open Recent updated (${String(recent.length)} projects)`);
	} catch (err) {
		console.warn("[Menu] Failed to refresh Open Recent menu:", err);
	}
}

// ============================================================================
// Start Embedded Server
// ============================================================================

/**
 * Start the PiBun server in-process on an OS-assigned available port.
 *
 * The server is embedded in the same Bun process as the Electrobun main
 * process — no child process spawning needed. PiRpcManager and the
 * HTTP/WebSocket server share the same event loop.
 *
 * @returns The running server instance and the localhost URL.
 */
function startServer(): { server: PiBunServer; url: string } {
	const rpcManager = new PiRpcManager();

	const server = createServer({
		port: 0, // Let the OS assign an available port
		hostname: "localhost",
		staticDir: WEB_DIST_DIR,
		rpcManager,
		hooks: {
			onApplyUpdate: () => handleApplyUpdate(),
			onCheckForUpdates: () => handleCheckForUpdates(),
			onOpenFolderDialog: () => openFolderDialogAsync(),
			onSaveExportFile: (content: string, defaultFilename: string) =>
				saveExportFileAsync(content, defaultFilename),
			onProjectsChanged: () => {
				refreshRecentMenu();
			},
			onSetWindowTitle: (title: string) => {
				mainWindowRef?.setTitle(title);
			},
			onShowContextMenu: (items: unknown[]) => {
				ContextMenu.showContextMenu(items as Parameters<typeof ContextMenu.showContextMenu>[0]);
			},
		},
	});

	// Bun.serve() with port 0 assigns a random available port.
	// Read the actual port from the underlying Bun server instance.
	const port = server.server.port;
	const url = `http://localhost:${port}`;

	return { server, url };
}

// ============================================================================
// Shutdown
// ============================================================================

/**
 * Graceful shutdown sequence:
 * 1. Stop the HTTP/WS server (closes all WebSocket connections)
 * 2. Stop all Pi RPC processes (SIGTERM → timeout → SIGKILL)
 * 3. Exit the process
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Electrobun overrides `process.exit()` to trigger proper native
 * cleanup (stopEventLoop → waitForShutdownComplete → forceExit).
 */
async function shutdown(reason: string): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log(`Shutting down (${reason})...`);

	// Remove the system tray icon
	if (cleanupTray) {
		cleanupTray();
		cleanupTray = null;
	}

	// Stop the auto-updater (clears periodic timers)
	stopUpdater();

	// In dev mode, there's no embedded server to stop
	if (pibunServer) {
		try {
			// Stop the HTTP/WS server first (no new connections)
			await pibunServer.stop();
			console.log("Server stopped");

			// Stop all Pi processes
			await pibunServer.config.rpcManager.stopAll();
			console.log("All Pi processes stopped");
		} catch (error) {
			console.error("Error during shutdown:", error);
		}
	}

	console.log("Shutdown complete.");
	process.exit(0);
}

// ============================================================================
// File Dialogs
// ============================================================================

/**
 * Open a native folder picker dialog and return the selected path.
 *
 * Used as a server hook (`onOpenFolderDialog`) for the `app.openFolderDialog`
 * WS method, allowing the web app to trigger the native dialog via request/response.
 *
 * @returns The selected folder path, or null if the user cancelled.
 */
async function openFolderDialogAsync(): Promise<string | null> {
	const result = await Utils.openFileDialog({
		startingFolder: "~/",
		canChooseFiles: false,
		canChooseDirectory: true,
		allowsMultipleSelection: false,
	});

	// result is string[] — empty or [""] means cancelled
	const folderPath = result[0];
	if (!folderPath || folderPath === "") {
		console.log("[FileDialog] Folder selection cancelled");
		return null;
	}

	console.log(`[FileDialog] Folder selected: ${folderPath}`);
	return folderPath;
}

/**
 * Open a native folder picker to choose a save directory, then write the file.
 *
 * Used as a server hook (`onSaveExportFile`) for the `app.saveExportFile`
 * WS method. Desktop opens a folder picker → writes file to selectedFolder/defaultFilename.
 *
 * @returns The full path of the saved file, or null if the user cancelled.
 */
async function saveExportFileAsync(
	content: string,
	defaultFilename: string,
): Promise<string | null> {
	const result = await Utils.openFileDialog({
		startingFolder: "~/Desktop",
		canChooseFiles: false,
		canChooseDirectory: true,
		allowsMultipleSelection: false,
	});

	const folderPath = result[0];
	if (!folderPath || folderPath === "") {
		console.log("[SaveExport] Save cancelled");
		return null;
	}

	const filePath = resolve(folderPath, defaultFilename);
	await Bun.write(filePath, content);
	console.log(`[SaveExport] File saved to: ${filePath}`);
	return filePath;
}

/**
 * Open a native folder picker dialog via menu action.
 *
 * When the user selects a folder, the selected path is broadcast to all
 * connected WebSocket clients via the `menu.action` push channel with
 * action `file.open-folder` and `data.folderPath` set to the chosen path.
 *
 * The React app handles this by stopping the current session and starting
 * a new one in the selected directory.
 *
 * Uses `Utils.openFileDialog` from Electrobun which wraps NSOpenPanel (macOS),
 * IFileOpenDialog (Windows), or GtkFileChooserDialog (Linux).
 */
async function openFolderDialog(): Promise<void> {
	try {
		const folderPath = await openFolderDialogAsync();
		if (!folderPath) return;

		// Forward to the React app via WebSocket push
		if (pibunServer) {
			broadcastPush(pibunServer.connections, "menu.action", {
				action: "file.open-folder",
				data: { folderPath },
			});
		} else {
			console.warn("[FileDialog] No server to forward folder selection");
		}
	} catch (err) {
		console.error("[FileDialog] Failed to open folder dialog:", err);
	}
}

// ============================================================================
// Window Lifecycle
// ============================================================================

/**
 * Wire up window lifecycle events:
 * - resize → debounced save of full frame
 * - move → debounced save with updated position
 * - close → flush final state to disk, then shutdown
 *
 * Note: `exitOnLastWindowClosed` is set to `false` in electrobun.config.ts
 * so Electrobun doesn't force-exit before our async shutdown completes.
 * We explicitly call `process.exit(0)` after cleanup.
 */
function wireWindowLifecycle(mainWindow: BrowserWindow): void {
	// Resize events include full frame (x, y, width, height).
	// Electrobun's on() types the handler as (event: unknown) => void,
	// so we cast the event data inside the callback.
	mainWindow.on("resize", (event: unknown) => {
		const { data } = event as ElectrobunEvent<ResizeEventData>;
		currentFrame = {
			x: data.x,
			y: data.y,
			width: data.width,
			height: data.height,
		};
		debouncedSaveWindowState(currentFrame);
	});

	// Move events include only position (x, y) — keep current size
	mainWindow.on("move", (event: unknown) => {
		const { data } = event as ElectrobunEvent<MoveEventData>;
		currentFrame = {
			...currentFrame,
			x: data.x,
			y: data.y,
		};
		debouncedSaveWindowState(currentFrame);
	});

	// Close event — flush window state synchronously, then graceful shutdown.
	// The shutdown() call is async but fires on the event loop — it stops
	// the server, kills Pi processes, and calls process.exit(0).
	mainWindow.on("close", () => {
		// Get the definitive frame from the native window before it's destroyed.
		// Fall back to our tracked frame if getFrame() fails.
		try {
			const finalFrame = mainWindow.getFrame();
			flushWindowState(finalFrame);
		} catch {
			flushWindowState(currentFrame);
		}

		// Trigger graceful shutdown (async — will process.exit when done)
		shutdown("window closed");
	});
}

// ============================================================================
// Navigation Rules
// ============================================================================

/**
 * Prevent the webview from navigating away from PiBun.
 *
 * Three layers of protection:
 *
 * 1. **`setNavigationRules`** — Electrobun's native URL filter. Blocks all
 *    URLs except the PiBun server (localhost with the dynamic port) and
 *    Electrobun's internal `views://` protocol.
 *
 * 2. **`will-navigate` event** — Fires when the webview is about to navigate.
 *    If the target URL is external (not our server), we block the navigation
 *    and open the URL in the system browser instead.
 *
 * 3. **`new-window-open` event** — Fires when the user Cmd-clicks a link or
 *    a link has `target="_blank"`. We open the URL in the system browser.
 *
 * This prevents accidental navigation away from the app when clicking links
 * in rendered markdown, tool output, or any other content.
 */
function wireNavigationRules(mainWindow: BrowserWindow, serverUrl: string): void {
	// Extract the origin (e.g., "http://localhost:12345") for URL matching.
	const serverOrigin = new URL(serverUrl).origin;

	// Layer 1: Native navigation rules — block all, allow only our server + views://
	mainWindow.webview.setNavigationRules([
		"^*", // Block all URLs
		`${serverOrigin}/*`, // Allow PiBun server (localhost with dynamic port)
		"views://*", // Allow Electrobun internal views
	]);

	console.log(`[Navigation] Rules set: allow ${serverOrigin}/*, views://*`);

	// Layer 2: will-navigate — catch navigation attempts and redirect external
	// URLs to the system browser.
	mainWindow.webview.on("will-navigate", (event: unknown) => {
		const { data } = event as { data: { detail: string }; response?: { allow: boolean } };
		const targetUrl = data.detail;

		// Allow navigation within our server (including path changes, hash changes)
		if (targetUrl.startsWith(serverOrigin)) {
			return;
		}

		// Allow Electrobun internal views
		if (targetUrl.startsWith("views://")) {
			return;
		}

		// Block external navigation and open in system browser
		console.log(`[Navigation] Blocked: ${targetUrl} → opening in system browser`);

		// Open HTTP/HTTPS URLs in the system browser.
		// Other protocols (mailto:, etc.) are also forwarded to the OS handler.
		try {
			Utils.openExternal(targetUrl);
		} catch (err) {
			console.warn(`[Navigation] Failed to open external URL: ${targetUrl}`, err);
		}

		// Block the navigation in the webview
		(event as { response?: { allow: boolean } }).response = { allow: false };
	});

	// Layer 3: new-window-open — catch Cmd-clicks and target="_blank" links.
	// The event data is a JSON string or object with the URL.
	// Note: "new-window-open" is emitted by Electrobun's native layer but not
	// yet included in BrowserView.on()'s type union. Cast to bypass the type check.
	(mainWindow.webview as { on: (name: string, handler: (event: unknown) => void) => void }).on(
		"new-window-open",
		(event: unknown) => {
			const { data } = event as { data: { detail: string | { url: string; isCmdClick: boolean } } };
			const detail = data.detail;

			// Extract URL from event data (can be string or object)
			const url = typeof detail === "string" ? detail : detail.url;

			if (!url) {
				return;
			}

			// Allow internal URLs to pass through
			if (url.startsWith(serverOrigin) || url.startsWith("views://")) {
				return;
			}

			console.log(`[Navigation] New window request: ${url} → opening in system browser`);

			try {
				Utils.openExternal(url);
			} catch (err) {
				console.warn(`[Navigation] Failed to open external URL: ${url}`, err);
			}
		},
	);
}

// ============================================================================
// Bootstrap
// ============================================================================

/**
 * Main bootstrap sequence:
 * 1. Load saved window state (or defaults)
 * 2. Start embedded server or use dev URL
 * 3. Wait for health/ready check to pass
 * 4. Open native webview with restored window frame
 * 5. Wire window lifecycle events for state persistence + shutdown
 * 6. Wire signal handlers for external termination
 */
async function bootstrap(): Promise<void> {
	// Step 1: Load saved window state
	const savedFrame = loadWindowState();
	currentFrame = savedFrame;

	console.log(
		`Restoring window frame: ${savedFrame.width}×${savedFrame.height} at (${savedFrame.x}, ${savedFrame.y})`,
	);

	// Step 2: Determine webview URL (dev mode vs production)
	let webviewUrl: string;

	if (DEV_URL) {
		// Dev mode — skip server, use external URL (Vite dev server)
		console.log(`Dev mode: loading webview from ${DEV_URL}`);
		console.log("Ensure server and Vite dev server are running separately:");
		console.log("  bun run dev:server   → PiBun server on :24242");
		console.log("  bun run dev:web      → Vite dev server on :5173");
		webviewUrl = DEV_URL;
	} else {
		// Production mode — start embedded server
		const { server, url } = startServer();
		pibunServer = server;
		webviewUrl = url;

		console.log(`${APP_TITLE} server started on ${webviewUrl}`);
		if (pibunServer.config.staticDir) {
			console.log(`Serving static files from ${pibunServer.config.staticDir}`);
		} else {
			console.log("No static directory found — web app may not be built yet");
		}
	}

	// Step 3: Wait for URL to be ready
	// In production, check /health (our server endpoint).
	// In dev mode, check / (Vite serves index.html at root).
	const checkPath = DEV_URL ? "/" : "/health";

	try {
		await waitForReady(webviewUrl, checkPath);
	} catch (error) {
		console.error("Failed to reach web app:", error);
		process.exit(1);
	}

	// Step 4: Open native webview with restored frame
	const mainWindow = new BrowserWindow({
		title: APP_TITLE,
		url: webviewUrl,
		frame: savedFrame,
	});

	// Set the module-level reference so server hooks can access the window
	// (e.g., onSetWindowTitle updates the native window title).
	mainWindowRef = mainWindow;

	// Step 5: Wire window lifecycle events (state persistence + shutdown)
	wireWindowLifecycle(mainWindow);

	// Step 5b: Set navigation rules to prevent webview from navigating away
	// Block all URLs except the PiBun server (localhost with dynamic port)
	// and internal Electrobun views. External URLs are opened in the system
	// browser via will-navigate and new-window-open event handlers below.
	wireNavigationRules(mainWindow, webviewUrl);

	// Step 6: Set up native application menu (initially without recent projects)
	ApplicationMenu.setApplicationMenu(buildMenuConfig());

	// Load recent projects and rebuild menu with "Open Recent" submenu.
	// Fire-and-forget — menu works without it, just shows "No Recent Projects" initially.
	refreshRecentMenu();

	// Handle menu click events from native menu items.
	// Native-only actions (close, zoom) are handled directly in the main process.
	// All other actions are forwarded to the React app via WebSocket push
	// on the `menu.action` channel. The web app dispatches them to the
	// appropriate session actions or UI toggles.
	const handleMenuAction = (action: MenuAction): void => {
		console.log(`[Menu] Action: ${action}`);

		// ── Dynamic "Open Recent" actions ────────────────────────
		if (typeof action === "string" && action.startsWith(OPEN_RECENT_ACTION_PREFIX)) {
			const indexStr = action.slice(OPEN_RECENT_ACTION_PREFIX.length);
			const index = Number.parseInt(indexStr, 10);
			const cwd = recentProjectCwds[index];

			if (cwd && pibunServer) {
				// Forward to the React app — same pattern as file.open-folder
				// but uses the "file.open-recent" action so the web app can
				// use openProject() instead of startSessionInFolder().
				broadcastPush(pibunServer.connections, "menu.action", {
					action: "file.open-recent",
					data: { folderPath: cwd },
				});
			} else if (!cwd) {
				console.warn(`[Menu] No CWD at recent index ${String(index)}`);
			} else {
				console.warn("[Menu] No server to forward Open Recent action");
			}
			return;
		}

		switch (action) {
			// ── App-level actions ────────────────────────────────────
			case "app.check-for-updates": {
				handleCheckForUpdates();
				break;
			}

			// ── Native-only actions ──────────────────────────────────
			case "file.close-window": {
				// Trigger window close → which triggers shutdown via wireWindowLifecycle
				mainWindow.close();
				break;
			}
			case "file.open-folder": {
				// Open native folder picker, then forward the selected path
				// to the React app so it can start a new session with that CWD.
				openFolderDialog();
				break;
			}
			case "view.zoom-in": {
				const current = mainWindow.getPageZoom();
				mainWindow.setPageZoom(Math.min(current + 0.1, 3.0));
				break;
			}
			case "view.zoom-out": {
				const current = mainWindow.getPageZoom();
				mainWindow.setPageZoom(Math.max(current - 0.1, 0.5));
				break;
			}
			case "view.zoom-actual-size": {
				mainWindow.setPageZoom(1.0);
				break;
			}

			// ── Forward to React app via WebSocket push ──────────────
			default: {
				if (pibunServer) {
					broadcastPush(pibunServer.connections, "menu.action", { action });
				} else {
					// Dev mode — no embedded server. Menu actions that need
					// forwarding won't work (user relies on keyboard shortcuts).
					console.warn(`[Menu] No server to forward action: ${action}`);
				}
				break;
			}
		}
	};

	Electrobun.events.on("application-menu-clicked", createMenuClickHandler(handleMenuAction));

	// Listen for context menu item clicks and forward to the React app.
	// The web app calls `app.showContextMenu` → server hook → `ContextMenu.showContextMenu()`.
	// When the user clicks an item, this event fires and we push the result back.
	ContextMenu.on("context-menu-clicked", (event: unknown) => {
		const { data } = event as { data: { action?: string; data?: unknown } };
		if (data.action && pibunServer) {
			broadcastPush(pibunServer.connections, "context-menu.action", {
				action: data.action,
				data: data.data,
			});
		}
	});

	console.log("[Menu] Application menu configured");

	// Step 7: Wire system notifications for long-running operations
	// Shows native OS notifications when Pi finishes a task and the
	// window is not focused (e.g., user switched to another app).
	if (pibunServer) {
		initNotifications(mainWindow, pibunServer.config.rpcManager);
		console.log("[Notifications] System notifications enabled");
	}

	// Step 7b: Initialize system tray
	// Shows a menu bar icon with session status, recent sessions, New Session, and Quit.
	// Menu rebuilds dynamically as sessions start/stop/crash.
	if (pibunServer) {
		cleanupTray = initTray(pibunServer, pibunServer.config.rpcManager);
		console.log("[Tray] System tray enabled");
	}

	// Step 7c: Initialize auto-updater
	// Checks for updates on startup (after 10s delay) and periodically (every 4h).
	// "Check for Updates…" menu action also triggers a manual check.
	// Update status is broadcast to the web app via the `app.update` WS push channel.
	if (pibunServer) {
		initUpdater(pibunServer);
		console.log("[Updater] Auto-updater initialized");
	}

	// Step 8: Wire signal handlers for graceful shutdown
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	console.log(`${APP_TITLE} window opened at ${webviewUrl}`);
	if (DEV_URL) {
		console.log("Hot reload active — changes to the web app will reflect immediately");
	}
}

bootstrap().catch((error) => {
	console.error("Fatal error during bootstrap:", error);
	process.exit(1);
});
