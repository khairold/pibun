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
	// PiBun (App menu)
	checkForUpdates: "app.check-for-updates",

	// File
	newSession: "file.new-session",
	openFolder: "file.open-folder",
	closeWindow: "file.close-window",

	// View
	toggleSidebar: "view.toggle-sidebar",
	toggleGitPanel: "view.toggle-git-panel",
	toggleTerminal: "view.toggle-terminal",
	showChat: "view.show-chat",
	newTerminal: "view.new-terminal",
	zoomIn: "view.zoom-in",
	zoomOut: "view.zoom-out",
	zoomActualSize: "view.zoom-actual-size",

	// Session
	abort: "session.abort",
	compact: "session.compact",
	exportSession: "session.export",
	switchModel: "session.switch-model",
	setThinking: "session.set-thinking",
} as const;

/**
 * Prefix for dynamic "Open Recent" menu item actions.
 * Each recent project gets an action like `file.open-recent:0`, `file.open-recent:1`, etc.
 * The index maps into the `recentProjectCwds` array maintained by the main process.
 */
export const OPEN_RECENT_ACTION_PREFIX = "file.open-recent:";

export type MenuAction = (typeof MENU_ACTIONS)[keyof typeof MENU_ACTIONS];

// ============================================================================
// Menu Configuration
// ============================================================================

/** Recent project entry for building the "Open Recent" submenu. */
export interface RecentProject {
	/** Display name (basename of the directory). */
	name: string;
	/** Full directory path. */
	cwd: string;
}

/**
 * Build the full application menu config array.
 *
 * Structure follows DESKTOP.md spec:
 * - PiBun (app menu — first entry with no label on macOS)
 * - File (New Session, Open Folder, Open Recent, Export Session, Close Window)
 * - Edit (standard roles: Undo, Redo, Cut, Copy, Paste, Select All)
 * - View (Toggle Sidebar, Zoom controls)
 * - Session (Abort, Compact, Switch Model, Set Thinking)
 *
 * @param recentProjects - Optional list of recent projects for the "Open Recent" submenu.
 */
export function buildMenuConfig(recentProjects?: RecentProject[]): ApplicationMenuItemConfig[] {
	return [
		// ── PiBun (App Menu) ─────────────────────────────────────
		// On macOS, the first menu item without a label becomes the app menu.
		{
			submenu: [
				{ label: "About PiBun", role: "about" },
				{
					label: "Check for Updates…",
					action: MENU_ACTIONS.checkForUpdates,
				},
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
				{ type: "separator" },
				{
					label: "Open Folder…",
					action: MENU_ACTIONS.openFolder,
					accelerator: "CommandOrControl+O",
				},
				{
					label: "Open Recent",
					submenu: buildOpenRecentSubmenu(recentProjects),
				},
				{ type: "separator" },
				{
					label: "Export Session…",
					action: MENU_ACTIONS.exportSession,
					accelerator: "CommandOrControl+Shift+E",
				},
				{ type: "separator" },
				{
					label: "Close Window",
					action: MENU_ACTIONS.closeWindow,
					accelerator: "CommandOrControl+Shift+W",
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
				{
					label: "Toggle Git Panel",
					action: MENU_ACTIONS.toggleGitPanel,
					accelerator: "CommandOrControl+G",
				},
				{
					label: "Toggle Terminal",
					action: MENU_ACTIONS.toggleTerminal,
					accelerator: "CommandOrControl+`",
				},
				{
					label: "Show Chat Tab",
					action: MENU_ACTIONS.showChat,
				},
				{
					label: "New Terminal Tab",
					action: MENU_ACTIONS.newTerminal,
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
// Open Recent Submenu Builder
// ============================================================================

/**
 * Build the "Open Recent" submenu items.
 *
 * Each project becomes a menu item with a dynamic action string.
 * The label shows the project name, and the action encodes the index
 * into the recent projects list maintained by the main process.
 *
 * Up to 10 recent projects are shown, matching the plan spec.
 */
function buildOpenRecentSubmenu(recentProjects?: RecentProject[]): ApplicationMenuItemConfig[] {
	if (!recentProjects || recentProjects.length === 0) {
		return [{ label: "No Recent Projects", enabled: false }];
	}

	// Limit to 10 most recent
	const items: ApplicationMenuItemConfig[] = recentProjects.slice(0, 10).map((project, index) => ({
		label: `${project.name} — ${project.cwd}`,
		action: `${OPEN_RECENT_ACTION_PREFIX}${String(index)}`,
	}));

	return items;
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
 * It filters for known action strings (static and dynamic) and delegates
 * to the provided handler.
 *
 * Static actions are matched by exact string (from `MENU_ACTIONS`).
 * Dynamic actions are matched by prefix (e.g., `file.open-recent:N`).
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
		} else if (action.startsWith(OPEN_RECENT_ACTION_PREFIX)) {
			// Dynamic "Open Recent" action — pass through to handler
			onAction(action as MenuAction);
		} else {
			// Role-based items or unknown actions — no-op on bun side.
			// Roles are handled natively by the OS.
			console.log(`[Menu] Unhandled action: ${action}`);
		}
	};
}
