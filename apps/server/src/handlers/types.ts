/**
 * Handler types for WebSocket request dispatch.
 *
 * Each WS method maps to a handler function that receives parsed params
 * and a context object, then returns a result or throws.
 */

import type { WsChannel, WsMethod, WsMethodParamsMap, WsMethodResultMap } from "@pibun/contracts";
import type { ServerWebSocket } from "bun";
import type { PiRpcManager } from "../piRpcManager.js";
import type { ServerHooks, WsConnectionData } from "../server.js";

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
