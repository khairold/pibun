/**
 * App-level WebSocket method handlers.
 *
 * Handles desktop integration methods that are not Pi RPC commands:
 * - `app.applyUpdate` — triggers update installation + app restart
 * - `app.checkForUpdates` — triggers manual update check
 * - `app.openFolderDialog` — opens native folder picker (desktop only)
 *
 * These methods call into optional hooks set by the desktop main process.
 * In standalone server mode (no desktop), the hooks are not set and
 * these methods return errors.
 */

import type {
	WsAppOpenFolderDialogResult,
	WsAppSaveExportFileParams,
	WsAppSaveExportFileResult,
	WsAppSetWindowTitleParams,
	WsOkResult,
} from "@pibun/contracts";
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

// ============================================================================
// app.openFolderDialog
// ============================================================================

/**
 * Open a native folder picker dialog.
 * Only works in desktop mode where the `onOpenFolderDialog` hook is registered.
 * Returns the selected path, or null if the user cancelled.
 * In browser mode, throws an error so the client falls back to text input.
 */
export const handleAppOpenFolderDialog: WsHandler<"app.openFolderDialog"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsAppOpenFolderDialogResult> => {
	if (!ctx.hooks.onOpenFolderDialog) {
		throw new Error("Native folder dialog is not available in browser mode");
	}
	const folderPath = await ctx.hooks.onOpenFolderDialog();
	return { folderPath };
};

// ============================================================================
// app.setWindowTitle
// ============================================================================

/**
 * Set the native window title.
 * Only works in desktop mode where the `onSetWindowTitle` hook is registered.
 * In browser mode, silently succeeds (the web app also sets document.title).
 */
export const handleAppSetWindowTitle: WsHandler<"app.setWindowTitle"> = (
	params: WsAppSetWindowTitleParams,
	ctx: HandlerContext,
): WsOkResult => {
	if (ctx.hooks.onSetWindowTitle) {
		ctx.hooks.onSetWindowTitle(params.title);
	}
	// Don't throw in browser mode — the web app also sets document.title as fallback
	return { ok: true };
};

// ============================================================================
// app.saveExportFile
// ============================================================================

/**
 * Save exported content to disk via native folder picker.
 *
 * Desktop: opens native folder dialog → writes file to selectedFolder/defaultFilename.
 * Browser: throws error — client falls back to blob URL download.
 */
export const handleAppSaveExportFile: WsHandler<"app.saveExportFile"> = async (
	params: WsAppSaveExportFileParams,
	ctx: HandlerContext,
): Promise<WsAppSaveExportFileResult> => {
	if (!ctx.hooks.onSaveExportFile) {
		throw new Error("Native save dialog is not available in browser mode");
	}
	const filePath = await ctx.hooks.onSaveExportFile(params.content, params.defaultFilename);
	return { filePath };
};
