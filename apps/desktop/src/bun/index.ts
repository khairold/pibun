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

import { BrowserWindow } from "electrobun/bun";

// ============================================================================
// Constants
// ============================================================================

const APP_TITLE = "PiBun";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

/**
 * Default server URL. In production, the main process will start the server
 * on a random port and update this. For now (2A.1 scaffold), use the
 * default dev server port.
 */
const SERVER_URL = "http://localhost:24242";

// ============================================================================
// Main Window
// ============================================================================

// biome-ignore lint/correctness/noUnusedVariables: retained for window lifecycle (2A.4)
const mainWindow = new BrowserWindow({
	title: APP_TITLE,
	url: SERVER_URL,
	frame: {
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		x: 100,
		y: 100,
	},
});

console.log(`${APP_TITLE} desktop app started`);
console.log(`Loading ${SERVER_URL}`);
