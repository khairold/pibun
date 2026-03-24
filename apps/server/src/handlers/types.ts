/**
 * Handler types for WebSocket request dispatch.
 *
 * Each WS method maps to a handler function that receives parsed params
 * and a context object, then returns a result or throws.
 */

import type {
	PiCommand,
	PiResponse,
	WsChannel,
	WsMethod,
	WsMethodParamsMap,
	WsMethodResultMap,
	WsOkResult,
} from "@pibun/contracts";
import type { ServerWebSocket } from "bun";
import type { PiProcess } from "../piProcess.js";
import type { PiRpcManager } from "../piRpcManager.js";
import type { ServerHooks, WsConnectionData } from "../server.js";
import type { TerminalManager } from "../terminalManager.js";

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Context passed to every handler function.
 * Provides access to the connection, RPC manager, and server utilities.
 */
export interface HandlerContext {
	/** The WebSocket connection that sent the request. */
	ws: ServerWebSocket<WsConnectionData>;
	/** Per-connection data (id, sessionId, connectedAt). */
	connection: WsConnectionData;
	/** Pi RPC session manager. */
	rpcManager: PiRpcManager;
	/** All active WebSocket connections (for broadcasting). */
	connections: Set<ServerWebSocket<WsConnectionData>>;
	/** Send a push message to this connection. */
	sendPush: (
		ws: ServerWebSocket<WsConnectionData>,
		channel: WsChannel | string,
		data: unknown,
	) => void;
	/** Optional hooks for desktop integration (auto-update, etc.). */
	hooks: ServerHooks;
	/** Terminal manager for PTY sessions. May be null if PTY is unavailable. */
	terminalManager: TerminalManager | null;
	/**
	 * Target session ID for the current request.
	 * Resolved from: request-level `sessionId` → connection's primary `sessionId`.
	 * Null if no session is active and none was specified.
	 */
	targetSessionId: string | null;
}

// ============================================================================
// Handler Function
// ============================================================================

/**
 * A handler function for a specific WS method.
 *
 * Receives the parsed params (or undefined for no-param methods) and
 * a context object. Returns the result payload on success.
 * Throws an Error with a user-friendly message on failure.
 */
export type WsHandler<M extends WsMethod> = (
	params: WsMethodParamsMap[M],
	ctx: HandlerContext,
) => Promise<WsMethodResultMap[M]> | WsMethodResultMap[M];

/**
 * Type-erased handler for the dispatch registry.
 * Uses `any` for params because function params are contravariant —
 * `(params: SpecificType) => R` is NOT assignable to `(params: unknown) => R`.
 * The dispatch function passes `unknown` at runtime; handlers cast internally.
 */
// biome-ignore lint/suspicious/noExplicitAny: type erasure for handler registry
export type AnyWsHandler = (params: any, ctx: HandlerContext) => Promise<unknown> | unknown;

/**
 * Registry mapping method strings to handler functions.
 */
export type HandlerRegistry = Partial<Record<WsMethod, AnyWsHandler>>;

// ============================================================================
// Pi RPC Passthrough Helper
// ============================================================================

/**
 * Get the Pi process for the target session from handler context.
 *
 * Multi-session: uses `ctx.targetSessionId` which is resolved from
 * the request-level `sessionId` or the connection's primary session.
 *
 * @returns The PiProcess for the session.
 * @throws If no session is bound or the session doesn't exist.
 */
export function getProcess(ctx: HandlerContext): PiProcess {
	const { targetSessionId } = ctx;
	if (!targetSessionId) {
		throw new Error("No active session. Call session.start first.");
	}

	const session = ctx.rpcManager.getSession(targetSessionId);
	if (!session) {
		throw new Error(`Session '${targetSessionId}' not found. It may have been stopped or crashed.`);
	}

	return session.process;
}

/**
 * Assert a Pi RPC response was successful.
 * Throws with the Pi error message if not.
 */
export function assertSuccess(response: PiResponse): void {
	if (!response.success) {
		const errorResp = response as { error?: string };
		throw new Error(errorResp.error ?? "Pi command failed");
	}
}

/**
 * Send a Pi RPC command and return a simple `{ ok: true }` result.
 *
 * The most common passthrough pattern: get process → send command → assert success → ack.
 * Use for handlers that translate a WS method 1:1 to a Pi RPC command with no
 * result extraction needed.
 *
 * @example
 * ```ts
 * export const handleSessionAbort: WsHandler<"session.abort"> = async (_params, ctx) => {
 *   return piPassthrough(ctx, { type: "abort" });
 * };
 * ```
 */
export async function piPassthrough(ctx: HandlerContext, command: PiCommand): Promise<WsOkResult> {
	const process = getProcess(ctx);
	const response = await process.sendCommand(command);
	assertSuccess(response);
	return { ok: true };
}
