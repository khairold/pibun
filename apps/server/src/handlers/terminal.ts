/**
 * Terminal WebSocket method handlers.
 *
 * Handles terminal.create, terminal.write, terminal.resize, terminal.close.
 * Thin bridge to TerminalManager — each handler validates params and delegates.
 */

import type {
	WsOkResult,
	WsTerminalCloseParams,
	WsTerminalCreateParams,
	WsTerminalCreateResult,
	WsTerminalResizeParams,
	WsTerminalWriteParams,
} from "@pibun/contracts";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the CWD for a new terminal.
 * Priority: explicit param → active session's CWD → server process CWD.
 */
function resolveCwd(params: WsTerminalCreateParams, ctx: HandlerContext): string {
	// Explicit CWD from params
	if (params.cwd) {
		return params.cwd;
	}

	// Try active session's CWD via Pi process options
	if (ctx.targetSessionId) {
		const session = ctx.rpcManager.getSession(ctx.targetSessionId);
		if (session?.process.options.cwd) {
			return session.process.options.cwd;
		}
	}

	// Fallback to server CWD
	return process.cwd();
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * `terminal.create` — spawn a new PTY shell session.
 *
 * Creates a PTY via bun-pty with the resolved CWD. Terminal ID is returned
 * for subsequent write/resize/close operations. Data from the shell is
 * pushed to the client via the `terminal.data` channel.
 */
export const handleTerminalCreate: WsHandler<"terminal.create"> = (
	params,
	ctx,
): WsTerminalCreateResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}

	const cwd = resolveCwd(params, ctx);
	const { terminalId, pid } = ctx.terminalManager.create(ctx.connection.id, {
		cwd,
		...(params.cols !== undefined && { cols: params.cols }),
		...(params.rows !== undefined && { rows: params.rows }),
	});

	return { terminalId, pid };
};

/**
 * `terminal.write` — write data to terminal stdin.
 */
export const handleTerminalWrite: WsHandler<"terminal.write"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}

	const p = params as WsTerminalWriteParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}
	if (typeof p.data !== "string") {
		throw new Error("Missing data");
	}

	ctx.terminalManager.write(p.terminalId, p.data);
	return { ok: true };
};

/**
 * `terminal.resize` — resize terminal PTY dimensions.
 */
export const handleTerminalResize: WsHandler<"terminal.resize"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}

	const p = params as WsTerminalResizeParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}
	if (typeof p.cols !== "number" || typeof p.rows !== "number") {
		throw new Error("Missing cols/rows");
	}

	ctx.terminalManager.resize(p.terminalId, p.cols, p.rows);
	return { ok: true };
};

/**
 * `terminal.close` — close a terminal and kill the shell process.
 */
export const handleTerminalClose: WsHandler<"terminal.close"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}

	const p = params as WsTerminalCloseParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}

	ctx.terminalManager.close(p.terminalId);
	return { ok: true };
};
