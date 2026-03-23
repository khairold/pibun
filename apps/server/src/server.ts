/**
 * PiBun Server — Bun HTTP + WebSocket server.
 *
 * Responsibilities:
 * - HTTP: health endpoint (`/health`), static file serving for web app
 * - WebSocket: upgrade handling, connection tracking, message dispatch
 *
 * Uses Bun.serve() native API. WebSocket connections carry per-connection
 * data (WsConnectionData) set during the upgrade.
 *
 * @see docs/WS_PROTOCOL.md — WebSocket protocol specification
 * @see docs/ARCHITECTURE.md — System architecture
 */

import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import type { PiRpcManager } from "./piRpcManager.js";

// ============================================================================
// Types
// ============================================================================

/** Per-connection data attached to each WebSocket via Bun's upgrade `data` field. */
export interface WsConnectionData {
	/** Unique connection ID. */
	id: string;
	/** ID of the Pi session this connection is bound to (set after session.start). */
	sessionId: string | null;
	/** When this connection was established. */
	connectedAt: number;
}

/** Options for creating the server. */
export interface ServerOptions {
	/** Port to listen on (default: 24242). */
	port?: number;
	/** Hostname to bind to (default: "localhost"). */
	hostname?: string;
	/** Path to the web app's built output directory for static file serving. */
	staticDir?: string;
	/** Pi RPC manager for session management. */
	rpcManager: PiRpcManager;
}

/** Resolved and normalized server configuration. */
export interface ServerConfig {
	port: number;
	hostname: string;
	staticDir: string | null;
	rpcManager: PiRpcManager;
}

/** The running PiBun server instance. */
export interface PiBunServer {
	/** The underlying Bun server. */
	server: Server<WsConnectionData>;
	/** Set of all active WebSocket connections. */
	connections: Set<ServerWebSocket<WsConnectionData>>;
	/** Resolved configuration. */
	config: ServerConfig;
	/** Gracefully shut down the server. */
	stop(): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PORT = 24242;
const DEFAULT_HOSTNAME = "localhost";

/** MIME type map for common static file extensions. */
const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".map": "application/json",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
};

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create and start the PiBun server.
 *
 * Returns a PiBunServer with the running Bun.serve() instance and
 * connection tracking. Call `stop()` to gracefully shut down.
 */
export function createServer(options: ServerOptions): PiBunServer {
	const config = resolveConfig(options);
	const connections = new Set<ServerWebSocket<WsConnectionData>>();
	let connectionCounter = 0;

	const server = Bun.serve<WsConnectionData>({
		port: config.port,
		hostname: config.hostname,

		// =====================================================================
		// HTTP Request Handler
		// =====================================================================
		fetch(req, server): Response | Promise<Response> {
			const url = new URL(req.url);

			// Health check
			if (url.pathname === "/health") {
				return new Response(
					JSON.stringify({
						status: "ok",
						connections: connections.size,
						uptime: process.uptime(),
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// WebSocket upgrade
			if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
				const connId = `ws_${++connectionCounter}_${Date.now()}`;
				const upgraded = server.upgrade(req, {
					data: {
						id: connId,
						sessionId: null,
						connectedAt: Date.now(),
					},
				});

				if (upgraded) {
					return new Response(null); // Bun handles the upgrade response
				}
				return new Response("WebSocket upgrade failed", { status: 400 });
			}

			// Static file serving (production only)
			if (config.staticDir) {
				return serveStaticFile(config.staticDir, url.pathname);
			}

			// No static dir configured — 404 for everything else
			return new Response("Not Found", { status: 404 });
		},

		// =====================================================================
		// WebSocket Handler
		// =====================================================================
		websocket: {
			open(ws) {
				connections.add(ws);
			},

			message(_ws, _message) {
				// Dispatch will be implemented in 1B.5.
				// For now, just track connections.
			},

			close(ws, _code, _reason) {
				connections.delete(ws);
			},
		},
	});

	return {
		server,
		connections,
		config,
		async stop() {
			// Close all WebSocket connections
			for (const ws of connections) {
				ws.close(1001, "Server shutting down");
			}
			connections.clear();

			// Stop the HTTP server
			server.stop(true);
		},
	};
}

// ============================================================================
// Static File Serving
// ============================================================================

/**
 * Serve a static file from the web app's build output directory.
 *
 * Falls back to `index.html` for SPA client-side routing:
 * - If the requested path maps to a file, serve it.
 * - If the path has no extension (likely a client route), serve index.html.
 * - If the path has an extension but the file doesn't exist, return 404.
 */
function serveStaticFile(staticDir: string, pathname: string): Response {
	// Normalize: strip leading slash, prevent directory traversal
	const safePath = pathname.replace(/^\/+/, "").replace(/\.\./g, "");
	const filePath = join(staticDir, safePath || "index.html");
	const ext = extname(filePath);

	// Try the exact file
	if (existsSync(filePath)) {
		const file = Bun.file(filePath);
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
		return new Response(file, {
			headers: { "Content-Type": contentType },
		});
	}

	// SPA fallback: if no extension, try serving index.html
	if (!ext) {
		const indexPath = join(staticDir, "index.html");
		if (existsSync(indexPath)) {
			return new Response(Bun.file(indexPath), {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}
	}

	return new Response("Not Found", { status: 404 });
}

// ============================================================================
// Config Resolution
// ============================================================================

/**
 * Resolve server options into a normalized config.
 * Validates the static directory path if provided.
 */
function resolveConfig(options: ServerOptions): ServerConfig {
	const port = options.port ?? DEFAULT_PORT;
	const hostname = options.hostname ?? DEFAULT_HOSTNAME;
	let staticDir: string | null = null;

	if (options.staticDir) {
		const resolved = resolve(options.staticDir);
		// Only enable static serving if the directory exists
		if (existsSync(resolved)) {
			staticDir = resolved;
		}
	}

	return {
		port,
		hostname,
		staticDir,
		rpcManager: options.rpcManager,
	};
}
