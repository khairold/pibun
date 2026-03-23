/**
 * @pibun/server — Entry point.
 *
 * Creates the PiRpcManager and starts the Bun HTTP + WebSocket server.
 * Handles graceful shutdown on SIGINT/SIGTERM.
 */

import { resolve } from "node:path";
import { PiRpcManager } from "./piRpcManager.js";
import { createServer } from "./server.js";

// ============================================================================
// Configuration (from env or defaults)
// ============================================================================

const PORT = Number(process.env.PIBUN_PORT) || 24242;
const HOSTNAME = process.env.PIBUN_HOST ?? "localhost";

// Default static dir: sibling web app's dist output
const STATIC_DIR = process.env.PIBUN_STATIC_DIR ?? resolve(import.meta.dir, "../../web/dist");

// ============================================================================
// Bootstrap
// ============================================================================

const rpcManager = new PiRpcManager();

const pibunServer = createServer({
	port: PORT,
	hostname: HOSTNAME,
	staticDir: STATIC_DIR,
	rpcManager,
});

console.log(`PiBun server listening on http://${HOSTNAME}:${PORT}`);
if (pibunServer.config.staticDir) {
	console.log(`Serving static files from ${pibunServer.config.staticDir}`);
} else {
	console.log("No static directory found — running in API-only mode");
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
	console.log(`\n${signal} received — shutting down...`);

	// Stop the HTTP/WS server first (no new connections)
	await pibunServer.stop();

	// Stop all Pi processes
	await rpcManager.stopAll();

	console.log("Shutdown complete.");
	process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
