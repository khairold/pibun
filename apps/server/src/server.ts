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
import type { WsMethod, WsRequest, WsResponseError, WsResponseOk } from "@pibun/contracts";
import type { Server, ServerWebSocket } from "bun";
import { type HandlerContext, handlers } from "./handlers/index.js";
import type { PiRpcManager } from "./piRpcManager.js";
import { TerminalManager } from "./terminalManager.js";

// ============================================================================
// Types
// ============================================================================

/** Per-connection data attached to each WebSocket via Bun's upgrade `data` field. */
export interface WsConnectionData {
	/** Unique connection ID. */
	id: string;
	/**
	 * Primary session ID (the most recently started session).
	 * Used as fallback when a request doesn't specify a sessionId.
	 */
	sessionId: string | null;
	/**
	 * All session IDs owned by this connection (multi-session / tabs).
	 * Includes the primary session. Cleaned up on WS disconnect.
	 */
	sessionIds: Set<string>;
	/** When this connection was established. */
	connectedAt: number;
}

/**
 * Optional hooks for desktop integration.
 * These callbacks are set by the desktop main process when embedding the server.
 * In standalone server mode, they are null.
 */
export interface ServerHooks {
	/** Called when the web app requests `app.applyUpdate`. */
	onApplyUpdate?: () => void;
	/** Called when the web app requests `app.checkForUpdates`. */
	onCheckForUpdates?: () => void;
	/** Called when the web app requests `app.openFolderDialog`. Returns selected path or null if cancelled. */
	onOpenFolderDialog?: () => Promise<string | null>;
	/** Called when the project list changes (add/remove/update). Desktop uses this to rebuild the "Open Recent" menu. */
	onProjectsChanged?: () => void;
	/** Called when the web app requests `app.setWindowTitle`. Sets the native window title. */
	onSetWindowTitle?: (title: string) => void;
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
	/** Optional hooks for desktop integration (auto-update, etc.). */
	hooks?: ServerHooks;
}

/** Resolved and normalized server configuration. */
export interface ServerConfig {
	port: number;
	hostname: string;
	staticDir: string | null;
	rpcManager: PiRpcManager;
	hooks: ServerHooks;
	terminalManager: TerminalManager;
}

/** The running PiBun server instance. */
export interface PiBunServer {
	/** The underlying Bun server. */
	server: Server<WsConnectionData>;
	/** Set of all active WebSocket connections. */
	connections: Set<ServerWebSocket<WsConnectionData>>;
	/** Resolved configuration. */
	config: ServerConfig;
	/** Terminal manager for PTY sessions. */
	terminalManager: TerminalManager;
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

	// Wire terminal data/exit → WS push to owning connection
	config.terminalManager.setOnData((terminalId, connectionId, data) => {
		for (const ws of connections) {
			if (ws.data.id === connectionId) {
				sendPush(ws, "terminal.data", { terminalId, data });
				break;
			}
		}
	});

	config.terminalManager.setOnExit((terminalId, connectionId, exitCode, signal) => {
		for (const ws of connections) {
			if (ws.data.id === connectionId) {
				sendPush(ws, "terminal.exit", {
					terminalId,
					exitCode,
					...(signal !== undefined && { signal }),
				});
				break;
			}
		}
	});

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
						sessionIds: new Set<string>(),
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

				// 1B.12 — Send server.welcome push on connect
				sendPush(ws, "server.welcome", {
					cwd: process.cwd(),
					version: "0.1.0",
				});
			},

			message(ws, message) {
				// Parse and dispatch the incoming WebSocket message.
				// Errors are caught and returned as WsResponseError.
				handleWsMessage(
					ws,
					message,
					config.rpcManager,
					connections,
					config.hooks,
					config.terminalManager,
				);
			},

			close(ws, _code, _reason) {
				connections.delete(ws);

				// Clean up all terminals owned by this connection
				config.terminalManager.closeByConnection(ws.data.id);

				// Clean up all sessions owned by this connection
				const ownedSessions = [...ws.data.sessionIds];
				ws.data.sessionIds.clear();
				ws.data.sessionId = null;
				for (const sid of ownedSessions) {
					config.rpcManager.stopSession(sid).catch(() => {
						// Best-effort cleanup — process may already be gone
					});
				}
			},
		},
	});

	return {
		server,
		connections,
		config,
		terminalManager: config.terminalManager,
		async stop() {
			// Close all terminals
			config.terminalManager.closeAll();

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
// WebSocket Message Dispatch
// ============================================================================

/**
 * Handle an incoming WebSocket message.
 *
 * Parses the raw message as a WsRequest, looks up the handler in the
 * registry, calls it, and sends the response back.
 *
 * All errors are caught and returned as WsResponseError with the
 * original request ID (or "unknown" if the message couldn't be parsed).
 */
function handleWsMessage(
	ws: ServerWebSocket<WsConnectionData>,
	message: string | Buffer,
	rpcManager: PiRpcManager,
	connections: Set<ServerWebSocket<WsConnectionData>>,
	hooks: ServerHooks,
	terminalManager: TerminalManager,
): void {
	let requestId = "unknown";

	try {
		// Parse the raw message
		const raw = typeof message === "string" ? message : message.toString("utf-8");
		const parsed: unknown = JSON.parse(raw);

		// Validate shape: must have id and method
		if (!isWsRequest(parsed)) {
			sendError(ws, requestId, "Invalid request: missing 'id' or 'method' field");
			return;
		}

		requestId = parsed.id;
		const { method, params } = parsed;
		// Multi-session: resolve target session from request or connection default
		const requestSessionId = (parsed as { sessionId?: string }).sessionId ?? null;

		// Look up the handler
		const handler = handlers[method as WsMethod];
		if (!handler) {
			sendError(ws, requestId, `Method not implemented: ${method}`);
			return;
		}

		// Build handler context
		const ctx: HandlerContext = {
			ws,
			connection: ws.data,
			rpcManager,
			connections,
			sendPush,
			hooks,
			terminalManager,
			// Prefer request-level sessionId, fall back to connection's primary
			targetSessionId: requestSessionId ?? ws.data.sessionId,
		};

		// Call the handler (may be sync or async)
		const result = handler(params, ctx);

		if (result instanceof Promise) {
			result.then(
				(data) => sendResult(ws, requestId, data),
				(error) => sendError(ws, requestId, errorMessage(error)),
			);
		} else {
			sendResult(ws, requestId, result);
		}
	} catch (error) {
		// JSON parse error or unexpected throw
		sendError(ws, requestId, errorMessage(error));
	}
}

/**
 * Type guard for validating a parsed message as a WsRequest.
 * Checks structural shape (id: string, method: string).
 */
function isWsRequest(value: unknown): value is WsRequest {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof (value as Record<string, unknown>).id === "string" &&
		"method" in value &&
		typeof (value as Record<string, unknown>).method === "string"
	);
}

/** Send a success response to the WebSocket client. */
function sendResult(ws: ServerWebSocket<WsConnectionData>, id: string, result: unknown): void {
	const response: WsResponseOk = {
		id,
		result: (result ?? { ok: true }) as Record<string, unknown>,
	};
	ws.send(JSON.stringify(response));
}

/** Send an error response to the WebSocket client. */
function sendError(ws: ServerWebSocket<WsConnectionData>, id: string, message: string): void {
	const response: WsResponseError = {
		id,
		error: { message },
	};
	ws.send(JSON.stringify(response));
}

/** Extract an error message from an unknown thrown value. */
function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Send a push message to a WebSocket client.
 *
 * Used by handlers and event forwarding to send unsolicited events
 * (pi.event, pi.response, server.welcome, server.error).
 */
export function sendPush(
	ws: ServerWebSocket<WsConnectionData>,
	channel: string,
	data: unknown,
): void {
	ws.send(JSON.stringify({ type: "push", channel, data }));
}

/**
 * Broadcast a push message to all connected WebSocket clients.
 */
export function broadcastPush(
	connections: Set<ServerWebSocket<WsConnectionData>>,
	channel: string,
	data: unknown,
): void {
	const message = JSON.stringify({ type: "push", channel, data });
	for (const ws of connections) {
		ws.send(message);
	}
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
		hooks: options.hooks ?? {},
		terminalManager: new TerminalManager(),
	};
}
