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

const { server: pibunServer, url: serverUrl } = startServer();

console.log(`${APP_TITLE} server started on ${serverUrl}`);

if (pibunServer.config.staticDir) {
	console.log(`Serving static files from ${pibunServer.config.staticDir}`);
} else {
	console.log("No static directory found — web app may not be built yet");
}

// ============================================================================
// Main Window
// ============================================================================

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

console.log(`Loading ${serverUrl}`);
