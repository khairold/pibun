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

// ============================================================================
// Constants
// ============================================================================

const APP_TITLE = "PiBun";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

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
// Bootstrap
// ============================================================================

/**
 * Main bootstrap sequence:
 * 1. Start embedded server on available port
 * 2. Wait for health check to pass
 * 3. Open native webview at the server URL
 */
async function bootstrap(): Promise<void> {
	// Step 1: Start the embedded server
	const { server: pibunServer, url: serverUrl } = startServer();

	console.log(`${APP_TITLE} server started on ${serverUrl}`);

	if (pibunServer.config.staticDir) {
		console.log(`Serving static files from ${pibunServer.config.staticDir}`);
	} else {
		console.log("No static directory found — web app may not be built yet");
	}

	// Step 2: Wait for server to be healthy
	try {
		await waitForHealth(serverUrl);
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}

	// Step 3: Open native webview
	// biome-ignore lint/correctness/noUnusedVariables: retained for window lifecycle (2A.4) and shutdown (2A.5)
	const mainWindow = new BrowserWindow({
		title: APP_TITLE,
		url: serverUrl,
		frame: {
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
			x: 100,
			y: 100,
		},
	});

	console.log(`${APP_TITLE} window opened at ${serverUrl}`);
}

bootstrap().catch((error) => {
	console.error("Fatal error during bootstrap:", error);
	process.exit(1);
});
