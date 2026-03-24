/**
 * @pibun/contracts — Plugin types
 *
 * Plugins extend PiBun's UI with custom panels. Each plugin is loaded from
 * `~/.pibun/plugins/{id}/` and describes its capabilities via a manifest file
 * (`plugin.json`). Types-only, zero runtime code.
 */

// ============================================================================
// Panel Configuration
// ============================================================================

/**
 * Position where a plugin panel can be rendered.
 *
 * - `"sidebar"` — left sidebar, below projects/sessions
 * - `"bottom"` — bottom panel area (alongside terminal)
 * - `"right"` — right panel (secondary sidebar)
 */
export type PluginPanelPosition = "sidebar" | "bottom" | "right";

/**
 * Configuration for a single plugin panel.
 *
 * A plugin can register one or more panels. Each panel is an isolated
 * UI surface rendered in a sandboxed iframe (web) or BrowserView (desktop).
 */
export interface PluginPanelConfig {
	/** Unique panel identifier within the plugin (e.g., "main", "settings"). */
	id: string;
	/** Display title shown in the panel header / tab. */
	title: string;
	/**
	 * Icon identifier for the panel tab/header.
	 * Can be a built-in icon name (e.g., "book-open", "terminal", "puzzle")
	 * or a relative path to an SVG file within the plugin directory.
	 */
	icon: string;
	/** Where the panel is rendered in the PiBun layout. */
	position: PluginPanelPosition;
	/**
	 * URL or relative file path for the panel content.
	 *
	 * - Absolute URL (e.g., `"https://example.com/panel"`) — loaded as-is
	 * - Relative path (e.g., `"./panel.html"`) — resolved from plugin directory
	 *
	 * The content is loaded in a sandboxed iframe with restricted permissions.
	 * Communication with PiBun happens via `postMessage` bridge.
	 */
	component: string;
	/**
	 * Default width in pixels (for "right" position) or height in pixels
	 * (for "bottom" position). Sidebar panels use the sidebar's full width.
	 * Null means use the layout default.
	 */
	defaultSize: number | null;
}

// ============================================================================
// Plugin Manifest
// ============================================================================

/**
 * Plugin manifest — the `plugin.json` file at the root of a plugin directory.
 *
 * Located at `~/.pibun/plugins/{id}/plugin.json`.
 *
 * Example:
 * ```json
 * {
 *   "id": "prompt-library",
 *   "name": "Prompt Library",
 *   "version": "1.0.0",
 *   "description": "Browse and insert saved prompts into the composer.",
 *   "author": "PiBun",
 *   "panels": [
 *     {
 *       "id": "main",
 *       "title": "Prompts",
 *       "icon": "book-open",
 *       "position": "sidebar",
 *       "component": "./panel.html",
 *       "defaultSize": null
 *     }
 *   ]
 * }
 * ```
 */
export interface PluginManifest {
	/** Unique plugin identifier (kebab-case, e.g., "prompt-library"). */
	id: string;
	/** Human-readable plugin name. */
	name: string;
	/**
	 * Semantic version string (e.g., "1.0.0").
	 * Used for update detection and compatibility checks.
	 */
	version: string;
	/** Brief description of what the plugin does. */
	description: string;
	/** Plugin author name or organization (optional). */
	author: string | null;
	/** List of panels this plugin provides. At least one panel is required. */
	panels: PluginPanelConfig[];
}

// ============================================================================
// Plugin Runtime State
// ============================================================================

/**
 * Runtime state of an installed plugin.
 *
 * Combines the static manifest with runtime state (enabled/disabled, errors).
 * Stored in the server's plugin registry and synced to the UI.
 */
export interface Plugin {
	/** The plugin's manifest (loaded from `plugin.json`). */
	manifest: PluginManifest;
	/** Whether the plugin is currently enabled and its panels should render. */
	enabled: boolean;
	/**
	 * If the plugin failed to load or has runtime errors, the error message.
	 * Null when the plugin is healthy.
	 */
	error: string | null;
	/**
	 * Absolute path to the plugin directory on disk.
	 * e.g., `/Users/alice/.pibun/plugins/prompt-library`
	 */
	directory: string;
}

// ============================================================================
// Plugin ↔ PiBun Message Bridge
// ============================================================================

/**
 * Messages that a plugin iframe can send to PiBun via `postMessage`.
 *
 * The plugin uses `window.parent.postMessage({ type, ... }, "*")` and PiBun
 * validates the origin before processing.
 */
export type PluginToPiBunMessage =
	| PluginReadyMessage
	| PluginGetSessionStateMessage
	| PluginSendPromptMessage
	| PluginSubscribeEventsMessage
	| PluginUnsubscribeEventsMessage;

/** Plugin has loaded and is ready to receive messages. */
export interface PluginReadyMessage {
	type: "plugin:ready";
	/** Plugin ID for identification. */
	pluginId: string;
}

/** Plugin requests the current session state. */
export interface PluginGetSessionStateMessage {
	type: "plugin:getSessionState";
	/** Unique request ID for correlating the response. */
	requestId: string;
}

/** Plugin wants to insert a prompt into the composer or send it directly. */
export interface PluginSendPromptMessage {
	type: "plugin:sendPrompt";
	/** The prompt text to send or insert. */
	message: string;
	/**
	 * Whether to send the prompt immediately or just insert it into
	 * the composer for the user to review/edit.
	 * Default: `false` (insert only).
	 */
	sendImmediately: boolean;
}

/** Plugin wants to subscribe to Pi events. */
export interface PluginSubscribeEventsMessage {
	type: "plugin:subscribeEvents";
	/**
	 * Event types to subscribe to (e.g., ["agent_start", "agent_end"]).
	 * Empty array means subscribe to all events.
	 */
	eventTypes: string[];
}

/** Plugin wants to unsubscribe from Pi events. */
export interface PluginUnsubscribeEventsMessage {
	type: "plugin:unsubscribeEvents";
}

/**
 * Messages that PiBun sends to a plugin iframe via `postMessage`.
 *
 * PiBun targets the iframe's `contentWindow.postMessage(message, origin)`.
 */
export type PiBunToPluginMessage =
	| PiBunSessionStateMessage
	| PiBunEventMessage
	| PiBunThemeChangedMessage;

/** Response to `plugin:getSessionState` — current session info. */
export interface PiBunSessionStateMessage {
	type: "pibun:sessionState";
	/** Correlates with the plugin's request. */
	requestId: string;
	/** Current session ID, null if no active session. */
	sessionId: string | null;
	/** Current model name (e.g., "claude-sonnet-4-20250514"). */
	model: string | null;
	/** Whether the agent is currently streaming. */
	isStreaming: boolean;
	/** Current working directory. */
	cwd: string | null;
}

/** A Pi event forwarded to the plugin. */
export interface PiBunEventMessage {
	type: "pibun:event";
	/** The Pi event type (e.g., "agent_start", "text_delta"). */
	eventType: string;
	/** The full event data. */
	data: unknown;
}

/** Notification that the app theme changed. */
export interface PiBunThemeChangedMessage {
	type: "pibun:themeChanged";
	/** The new theme ID. */
	themeId: string;
	/** Whether the theme is dark. */
	isDark: boolean;
}
