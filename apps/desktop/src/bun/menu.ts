/**
 * PiBun Desktop — Native application menu bar.
 *
 * Defines the menu structure and handles menu click events.
 * Menu actions with `role` use native behavior (Undo, Copy, Paste, Quit, etc.).
 * Menu actions with `action` string fire `application-menu-clicked` events
 * that are forwarded to the React app via the WebSocket connection.
 *
 * @see docs/DESKTOP.md — Menu specification
 */

import type { ApplicationMenuItemConfig } from "electrobun/bun";

// ============================================================================
// Menu Action Constants
// ============================================================================

/**
 * Action identifiers for custom menu items.
 * These are matched in the `application-menu-clicked` event handler.
 */
export const MENU_ACTIONS = {
	// File
	newSession: "file.new-session",
	openFolder: "file.open-folder",
	closeWindow: "file.close-window",

	// View
	toggleSidebar: "view.toggle-sidebar",
	zoomIn: "view.zoom-in",
	zoomOut: "view.zoom-out",
	zoomActualSize: "view.zoom-actual-size",

	// Session
	abort: "session.abort",
	compact: "session.compact",
	switchModel: "session.switch-model",
	setThinking: "session.set-thinking",
} as const;

export type MenuAction = (typeof MENU_ACTIONS)[keyof typeof MENU_ACTIONS];

// ============================================================================
// Menu Configuration
// ============================================================================

/**
 * Build the full application menu config array.
 *
 * Structure follows DESKTOP.md spec:
 * - PiBun (app menu — first entry with no label on macOS)
 * - File (New Session, Close Window)
 * - Edit (standard roles: Undo, Redo, Cut, Copy, Paste, Select All)
 * - View (Toggle Sidebar, Zoom controls)
 * - Session (Abort, Compact, Switch Model, Set Thinking)
 */
export function buildMenuConfig(): ApplicationMenuItemConfig[] {
	return [
		// ── PiBun (App Menu) ─────────────────────────────────────
		// On macOS, the first menu item without a label becomes the app menu.
		{
			submenu: [
				{ label: "About PiBun", role: "about" },
				{ type: "separator" },
				{ label: "Hide PiBun", role: "hide" },
				{ label: "Hide Others", role: "hideOthers" },
				{ label: "Show All", role: "showAll" },
				{ type: "separator" },
				{ label: "Quit PiBun", role: "quit", accelerator: "CommandOrControl+Q" },
			],
		},

		// ── File ─────────────────────────────────────────────────
		{
			label: "File",
			submenu: [
				{
					label: "New Session",
					action: MENU_ACTIONS.newSession,
					accelerator: "CommandOrControl+N",
				},
				{
					label: "Open Folder…",
					action: MENU_ACTIONS.openFolder,
					accelerator: "CommandOrControl+O",
				},
				{ type: "separator" },
				{
					label: "Close Window",
					action: MENU_ACTIONS.closeWindow,
					accelerator: "CommandOrControl+W",
				},
			],
		},

		// ── Edit ─────────────────────────────────────────────────
		// All role-based — native text editing support in the webview.
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},

		// ── View ─────────────────────────────────────────────────
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Sidebar",
					action: MENU_ACTIONS.toggleSidebar,
					accelerator: "CommandOrControl+B",
				},
				{ type: "separator" },
				{
					label: "Zoom In",
					action: MENU_ACTIONS.zoomIn,
					accelerator: "CommandOrControl+=",
				},
				{
					label: "Zoom Out",
					action: MENU_ACTIONS.zoomOut,
					accelerator: "CommandOrControl+-",
				},
				{
					label: "Actual Size",
					action: MENU_ACTIONS.zoomActualSize,
					accelerator: "CommandOrControl+0",
				},
			],
		},

		// ── Session ──────────────────────────────────────────────
		{
			label: "Session",
			submenu: [
				{
					label: "Abort",
					action: MENU_ACTIONS.abort,
					accelerator: "CommandOrControl+.",
				},
				{
					label: "Compact Context",
					action: MENU_ACTIONS.compact,
					accelerator: "CommandOrControl+Shift+K",
				},
				{ type: "separator" },
				{
					label: "Switch Model…",
					action: MENU_ACTIONS.switchModel,
					accelerator: "CommandOrControl+L",
				},
				{
					label: "Set Thinking Level",
					action: MENU_ACTIONS.setThinking,
					accelerator: "CommandOrControl+Shift+T",
				},
			],
		},
	];
}

// ============================================================================
// Menu Click Handler
// ============================================================================

/** Data shape of the `application-menu-clicked` event. */
export interface MenuClickedEvent {
	data: {
		id?: number;
		action: string;
		data?: unknown;
	};
}

/**
 * Callback type for handling resolved menu actions.
 * Implementations should forward the action to the React app
 * (via WebSocket or IPC) or handle it natively.
 */
export type MenuActionHandler = (action: MenuAction) => void;

/**
 * Create a handler for `application-menu-clicked` events.
 *
 * The returned function can be passed to `Electrobun.events.on()`.
 * It filters for known action strings and delegates to the provided handler.
 *
 * @param onAction - Callback invoked with the menu action string.
 * @returns Event handler function for Electrobun's event emitter.
 */
export function createMenuClickHandler(onAction: MenuActionHandler): (event: unknown) => void {
	const knownActions = new Set<string>(Object.values(MENU_ACTIONS));

	return (event: unknown) => {
		const { data } = event as MenuClickedEvent;
		const action = data.action;

		if (knownActions.has(action)) {
			onAction(action as MenuAction);
		} else {
			// Role-based items or unknown actions — no-op on bun side.
			// Roles are handled natively by the OS.
			console.log(`[Menu] Unhandled action: ${action}`);
		}
	};
}
