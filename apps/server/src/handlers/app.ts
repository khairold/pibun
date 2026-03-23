/**
 * App-level WebSocket method handlers.
 *
 * Handles desktop integration methods that are not Pi RPC commands:
 * - `app.applyUpdate` — triggers update installation + app restart
 * - `app.checkForUpdates` — triggers manual update check
 *
 * These methods call into optional hooks set by the desktop main process.
 * In standalone server mode (no desktop), the hooks are not set and
 * these methods return errors.
 */

import type { WsOkResult } from "@pibun/contracts";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// app.applyUpdate
// ============================================================================

/**
 * Apply a downloaded update. Triggers app restart.
 * Only works in desktop mode where the `onApplyUpdate` hook is registered.
 */
export const handleAppApplyUpdate: WsHandler<"app.applyUpdate"> = (
	_params: undefined,
	ctx: HandlerContext,
): WsOkResult => {
	if (!ctx.hooks.onApplyUpdate) {
		throw new Error("Auto-update is not available in browser mode");
	}
	ctx.hooks.onApplyUpdate();
	return { ok: true };
};

// ============================================================================
// app.checkForUpdates
// ============================================================================

/**
 * Manually trigger an update check.
 * Only works in desktop mode where the `onCheckForUpdates` hook is registered.
 */
export const handleAppCheckForUpdates: WsHandler<"app.checkForUpdates"> = (
	_params: undefined,
	ctx: HandlerContext,
): WsOkResult => {
	if (!ctx.hooks.onCheckForUpdates) {
		throw new Error("Auto-update is not available in browser mode");
	}
	ctx.hooks.onCheckForUpdates();
	return { ok: true };
};
