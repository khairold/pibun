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

import { resolve } from "node:path";
import { PiRpcManager } from "@pibun/server/piRpcManager";
import { type PiBunServer, createServer } from "@pibun/server/server";
import { BrowserWindow } from "electrobun/bun";
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

/** Maximum number of health check attempts before giving up. */
const HEALTH_CHECK_MAX_RETRIES = 30;

/** Delay between health check attempts in milliseconds. */
const HEALTH_CHECK_DELAY_MS = 200;

// ============================================================================
// Static Files
// ============================================================================

/**
 * Path to the web app's built output directory.
 *
 * In the monorepo dev layout:
 *   apps/desktop/src/bun/index.ts → ../../../../apps/web/dist
 *
 * Note: For Electrobun production builds (Phase 2C), the static dir
 * will need to be resolved differently (bundled alongside the app).
 */
const WEB_DIST_DIR = resolve(import.meta.dir, "../../../../apps/web/dist");

// ============================================================================
// Health Check
// ============================================================================

/**
 * Poll the server's `/health` endpoint until it responds with HTTP 200.
 *
 * Bun.serve() is synchronous so the server is typically ready immediately,
 * but polling confirms the HTTP layer is fully operational before the
 * webview loads. This also becomes essential in dev mode (2A.6) where the
 * URL may point at a Vite dev server that takes time to start.
 *
 * @param url - Base server URL (e.g., `http://localhost:12345`)
 * @param maxRetries - Maximum number of attempts (default: 30)
 * @param delayMs - Delay between attempts in milliseconds (default: 200)
 * @throws If the server doesn't respond within the retry limit.
 */
async function waitForHealth(
	url: string,
	maxRetries: number = HEALTH_CHECK_MAX_RETRIES,
	delayMs: number = HEALTH_CHECK_DELAY_MS,
): Promise<void> {
	const healthUrl = `${url}/health`;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(healthUrl);
			if (response.ok) {
				console.log(`Health check passed (attempt ${attempt}/${maxRetries})`);
				return;
			}
			console.warn(`Health check returned ${response.status} (attempt ${attempt}/${maxRetries})`);
		} catch {
			// Server not ready yet — connection refused or network error.
			if (attempt < maxRetries) {
				console.log(`Waiting for server... (attempt ${attempt}/${maxRetries})`);
			}
		}

		if (attempt < maxRetries) {
			await Bun.sleep(delayMs);
		}
	}

	throw new Error(
		`Server at ${healthUrl} did not become healthy after ${maxRetries} attempts (${(maxRetries * delayMs) / 1000}s)`,
	);
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
	});

	// Bun.serve() with port 0 assigns a random available port.
	// Read the actual port from the underlying Bun server instance.
	const port = server.server.port;
	const url = `http://localhost:${port}`;

	return { server, url };
}

// ============================================================================
// Window Lifecycle
// ============================================================================

/**
 * Track the current window frame in memory. Updated by resize/move events.
 * Used to flush the final state on close.
 */
let currentFrame: WindowFrame;

/**
 * Wire up window lifecycle events:
 * - resize → debounced save of full frame
 * - move → debounced save with updated position
 * - close → flush final state to disk
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

	// Close event — flush any pending save with final state
	mainWindow.on("close", () => {
		// Get the definitive frame from the native window before it's destroyed.
		// Fall back to our tracked frame if getFrame() fails.
		try {
			const finalFrame = mainWindow.getFrame();
			flushWindowState(finalFrame);
		} catch {
			flushWindowState(currentFrame);
		}
	});
}

// ============================================================================
// Bootstrap
// ============================================================================

/**
 * Main bootstrap sequence:
 * 1. Load saved window state (or defaults)
 * 2. Start embedded server on available port
 * 3. Wait for health check to pass
 * 4. Open native webview with restored window frame
 * 5. Wire window lifecycle events for state persistence
 */
async function bootstrap(): Promise<void> {
	// Step 1: Load saved window state
	const savedFrame = loadWindowState();
	currentFrame = savedFrame;

	console.log(
		`Restoring window frame: ${savedFrame.width}×${savedFrame.height} at (${savedFrame.x}, ${savedFrame.y})`,
	);

	// Step 2: Start the embedded server
	const { server: pibunServer, url: serverUrl } = startServer();

	console.log(`${APP_TITLE} server started on ${serverUrl}`);

	if (pibunServer.config.staticDir) {
		console.log(`Serving static files from ${pibunServer.config.staticDir}`);
	} else {
		console.log("No static directory found — web app may not be built yet");
	}

	// Step 3: Wait for server to be healthy
	try {
		await waitForHealth(serverUrl);
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}

	// Step 4: Open native webview with restored frame
	const mainWindow = new BrowserWindow({
		title: APP_TITLE,
		url: serverUrl,
		frame: savedFrame,
	});

	// Step 5: Wire window lifecycle events
	wireWindowLifecycle(mainWindow);

	console.log(`${APP_TITLE} window opened at ${serverUrl}`);
}

bootstrap().catch((error) => {
	console.error("Fatal error during bootstrap:", error);
	process.exit(1);
});
