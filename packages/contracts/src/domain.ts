/**
 * @pibun/contracts — Domain types
 *
 * All application domain types in one file: session tabs, projects, themes,
 * settings, plugins, and git. Types-only, zero runtime code.
 *
 * @module
 */

import type { PiFollowUpMode, PiModel, PiSteeringMode, PiThinkingLevel } from "./piProtocol.js";

// ============================================================================
// Session Tab
// ============================================================================

/**
 * Visual status of a session tab, derived from Pi events.
 *
 * - `"idle"` — no agent activity (default state, gray dot)
 * - `"running"` — agent is processing (between agent_start and agent_end, blue pulse)
 * - `"waiting"` — agent is blocked waiting for user input via extension UI dialog (amber pulse)
 * - `"error"` — session encountered an error (retry failure, process exit, red dot)
 */
export type TabStatus = "idle" | "running" | "waiting" | "error";

/**
 * A session tab — client-side container for a Pi session.
 *
 * Only one session is active at a time (single-session model).
 * The sidebar lists sessions under projects; switching sessions stops
 * the old Pi process and starts a new one. Tabs are managed by the
 * web app's tabsSlice — the server doesn't know about tabs.
 */
export interface SessionTab {
	/** Unique tab ID (client-generated, e.g., "tab-1"). */
	id: string;
	/** Display name for the tab (from Pi session name, or auto-generated). */
	name: string;
	/** The Pi session ID bound to this tab. Null before session starts. */
	sessionId: string | null;
	/**
	 * Pi's internal session UUID (from the session file).
	 * Different from `sessionId` which is the PiBun manager ID used for routing.
	 * Used for session list matching (Pi lists sessions by this UUID).
	 * Null before `get_state` is called.
	 */
	piSessionId: string | null;
	/** Working directory for this session. Null before session starts. */
	cwd: string | null;
	/** Active model for this session. Null before first state fetch. */
	model: PiModel | null;
	/** Thinking level for this session. */
	thinkingLevel: PiThinkingLevel;
	/** True while this session's Pi agent is processing. */
	isStreaming: boolean;
	/** Visual status indicator for the tab (idle, running, waiting, error). */
	status: TabStatus;
	/** True if this session's CWD has uncommitted git changes. */
	gitDirty: boolean;
	/** Number of messages in this tab's conversation. */
	messageCount: number;
	/** Text of the first user message, for display when no name is set. */
	firstMessage: string | null;
	/** Unix timestamp when this tab was created. */
	createdAt: number;
	/**
	 * Session file path (from Pi's get_state response).
	 * Stored per-tab so we can resume the session when switching back.
	 * Null before a session is started or before get_state is called.
	 */
	sessionFile: string | null;
}

// ============================================================================
// Project
// ============================================================================

/** Model preference for a project — provider + model ID pair. */
export interface ProjectModelPreference {
	provider: string;
	modelId: string;
}

/**
 * A project directory entry.
 *
 * Projects are persisted to `~/.pibun/projects.json` on the server.
 * The web app manages them via `project.*` WS methods.
 */
export interface Project {
	/** Unique project ID (server-generated UUID). */
	id: string;
	/** Display name (defaults to directory basename, user-editable). */
	name: string;
	/** Absolute path to the project directory. */
	cwd: string;
	/** Unix timestamp (ms) of last time this project was opened/used. */
	lastOpened: number;
	/** Preferred model for new sessions in this project, null if no preference. */
	favoriteModel: ProjectModelPreference | null;
	/** Preferred thinking level for new sessions, null if no preference. */
	defaultThinking: PiThinkingLevel | null;
	/** Number of sessions historically started in this project. */
	sessionCount: number;
}

// ============================================================================
// Theme
// ============================================================================

/**
 * Semantic color token names for the UI.
 *
 * Each token maps to a CSS custom property: `--color-{token-name}`.
 * Values are CSS color strings (hex, rgb, hsl, oklch, etc.).
 */
export interface ThemeColors {
	// ── Surface (backgrounds) ──────────────────────────────────────────
	/** App-level background (deepest layer). */
	"surface-base": string;
	/** Primary panel/card background. */
	"surface-primary": string;
	/** Elevated card/section background. */
	"surface-secondary": string;
	/** Hover/pressed states on surfaces. */
	"surface-tertiary": string;
	/** Modal/overlay backdrop tint. */
	"surface-overlay": string;

	// ── Text ───────────────────────────────────────────────────────────
	/** Primary body text. */
	"text-primary": string;
	/** Secondary text (descriptions, labels). */
	"text-secondary": string;
	/** Tertiary text (placeholders, hints). */
	"text-tertiary": string;
	/** Muted text (timestamps, disabled items). */
	"text-muted": string;
	/** Text on colored/accent backgrounds. */
	"text-on-accent": string;

	// ── Border ─────────────────────────────────────────────────────────
	/** Primary borders (panels, cards). */
	"border-primary": string;
	/** Secondary/subtle borders (dividers, separators). */
	"border-secondary": string;
	/** Muted borders (very subtle divisions). */
	"border-muted": string;

	// ── Accent ─────────────────────────────────────────────────────────
	/** Primary accent color (buttons, links, active indicators). */
	"accent-primary": string;
	/** Hovered accent. */
	"accent-primary-hover": string;
	/** Soft accent background tint. */
	"accent-soft": string;
	/** Accent-colored text (links, active labels). */
	"accent-text": string;

	// ── Status: Error ──────────────────────────────────────────────────
	/** Error indicator color. */
	"status-error": string;
	/** Error background tint. */
	"status-error-bg": string;
	/** Error text. */
	"status-error-text": string;
	/** Error border. */
	"status-error-border": string;

	// ── Status: Success ────────────────────────────────────────────────
	/** Success indicator color. */
	"status-success": string;
	/** Success background tint. */
	"status-success-bg": string;
	/** Success text. */
	"status-success-text": string;
	/** Success border. */
	"status-success-border": string;

	// ── Status: Warning ────────────────────────────────────────────────
	/** Warning indicator color. */
	"status-warning": string;
	/** Warning background tint. */
	"status-warning-bg": string;
	/** Warning text. */
	"status-warning-text": string;

	// ── Status: Info ───────────────────────────────────────────────────
	/** Info indicator color. */
	"status-info": string;
	/** Info background tint. */
	"status-info-bg": string;
	/** Info text. */
	"status-info-text": string;

	// ── Thinking (assistant reasoning) ─────────────────────────────────
	/** Thinking section background tint. */
	"thinking-bg": string;
	/** Thinking section border. */
	"thinking-border": string;
	/** Thinking section text. */
	"thinking-text": string;

	// ── Code ───────────────────────────────────────────────────────────
	/** Code block background. */
	"code-bg": string;
	/** Inline code background. */
	"code-inline-bg": string;

	// ── User message bubble ────────────────────────────────────────────
	/** User message background. */
	"user-bubble-bg": string;
	/** User message text. */
	"user-bubble-text": string;

	// ── Scrollbar ──────────────────────────────────────────────────────
	/** Scrollbar thumb color. */
	"scrollbar-thumb": string;
	/** Scrollbar track color. */
	"scrollbar-track": string;
}

/**
 * A complete UI theme definition.
 *
 * Theme colors are CSS custom property values. The theme is applied by setting
 * `data-theme="{id}"` on `<html>` and injecting CSS custom properties.
 */
export interface Theme {
	/** Unique identifier (kebab-case, e.g. "dark", "high-contrast-dark"). */
	id: string;
	/** Display name shown in the theme selector UI. */
	name: string;
	/** Whether this is a dark theme. Affects system preference matching. */
	isDark: boolean;
	/** Semantic color values keyed by token name. */
	colors: ThemeColors;
	/** Shiki theme name to use for code highlighting in this theme. */
	shikiTheme: string;
}

/**
 * Available built-in theme IDs.
 * Used for type-safe theme references and persistence.
 */
export type ThemeId = "light" | "dark" | "dimmed" | "high-contrast-dark" | "high-contrast-light";

/**
 * User's theme preference — either a specific theme ID or "system" to
 * follow the OS dark/light mode setting.
 *
 * When "system" is selected, the app watches `prefers-color-scheme` and
 * auto-switches between "light" and "dark" themes as the OS changes.
 */
export type ThemePreference = ThemeId | "system";

// ============================================================================
// Settings
// ============================================================================

/**
 * Application settings that persist across app restarts.
 *
 * Persisted to `~/.pibun/settings.json`. In browser mode, localStorage is the
 * primary store; server-side settings act as a backup that syncs on connect.
 *
 * Extensible — new fields can be added without breaking existing settings
 * files (unknown fields are preserved on load, new fields get defaults).
 */
export interface PiBunSettings {
	/**
	 * User's theme preference. Can be a specific theme ID (e.g., "dark",
	 * "light") or "system" to follow the OS dark/light mode setting.
	 * Null means no preference saved — falls back to system detection.
	 */
	themeId: ThemePreference | null;

	/**
	 * Whether Pi auto-compaction is enabled.
	 * Null means use Pi's default (usually enabled).
	 */
	autoCompaction: boolean | null;

	/**
	 * Whether Pi auto-retry is enabled on transient errors.
	 * Null means use Pi's default (usually enabled).
	 */
	autoRetry: boolean | null;

	/**
	 * Steering message delivery mode.
	 * - `"all"` — deliver all queued steering messages after current turn
	 * - `"one-at-a-time"` — deliver one steering message per completed turn (Pi default)
	 * Null means use Pi's default.
	 */
	steeringMode: PiSteeringMode | null;

	/**
	 * Follow-up message delivery mode.
	 * - `"all"` — deliver all queued follow-up messages when agent finishes
	 * - `"one-at-a-time"` — deliver one follow-up per agent completion (Pi default)
	 * Null means use Pi's default.
	 */
	followUpMode: PiFollowUpMode | null;

	/**
	 * Timestamp display format throughout the UI.
	 * - `"relative"` — "2m ago", "1h ago"
	 * - `"locale"` — browser locale default (e.g., "3:42:15 PM")
	 * - `"12h"` — 12-hour clock (e.g., "3:42 PM")
	 * - `"24h"` — 24-hour clock (e.g., "15:42")
	 */
	timestampFormat: TimestampFormat;
}

/**
 * Supported timestamp display formats.
 */
export type TimestampFormat = "relative" | "locale" | "12h" | "24h";

// ============================================================================
// Keybindings
// ============================================================================

/**
 * A keybinding command — the action to execute when a shortcut is triggered.
 *
 * Commands map to the same `ShortcutAction` values used internally, plus
 * some that `useKeyboardShortcuts` handles directly (abort, settings, tabs).
 */
export type KeybindingCommand =
	| "abort"
	| "compact"
	| "contentTab1"
	| "contentTab2"
	| "contentTab3"
	| "contentTab4"
	| "contentTab5"
	| "contentTab6"
	| "contentTab7"
	| "contentTab8"
	| "contentTab9"
	| "copyLastResponse"
	| "cycleModel"
	| "cycleThinking"
	| "newSession"
	| "settings"
	| "toggleBashInput"
	| "toggleDiffPanel"
	| "toggleExportDialog"
	| "toggleGitPanel"
	| "toggleModelSelector"
	| "togglePluginManager"
	| "toggleSidebar"
	| "toggleTerminal"
	| "toggleThinkingSelector";

/**
 * A user-defined keybinding rule.
 *
 * Stored in `~/.pibun/keybindings.json` as a JSON array of these objects.
 *
 * **Key format**: `mod+shift+k` where:
 * - `mod` = Cmd on macOS, Ctrl on others (platform modifier)
 * - `ctrl` = always Ctrl
 * - `shift` = Shift
 * - `alt` / `option` = Alt/Option
 * - `meta` / `cmd` = always Meta/Cmd
 * - Last token = the key (single char, or named key like `tab`, `escape`, `backquote`)
 *
 * **When clause**: optional boolean condition string.
 * - `terminalFocus` — terminal panel has focus
 * - `!terminalFocus` — negation
 * - `terminalOpen` — terminal panel is open
 * - `streaming` — agent is streaming
 * - Combine with `&&` and `||`
 *
 * @example
 * ```json
 * [
 *   { "key": "mod+j", "command": "toggleTerminal" },
 *   { "key": "mod+1", "command": "contentTab1" },
 *   { "key": "mod+d", "command": "toggleDiffPanel", "when": "!terminalFocus" }
 * ]
 * ```
 */
export interface KeybindingRule {
	/** Key combination string (e.g., "mod+shift+k"). */
	key: string;
	/** Command to execute when the key is pressed. */
	command: KeybindingCommand;
	/** Optional condition for when this binding is active. */
	when?: string;
}

// ============================================================================
// Plugin
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

// ── Plugin ↔ PiBun Message Bridge ──────────────────────────────────────

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

// ============================================================================
// Git
// ============================================================================

/**
 * A file with changes detected by `git status --porcelain`.
 *
 * Status codes follow git's porcelain format:
 * - `M` — modified
 * - `A` — added (staged)
 * - `D` — deleted
 * - `R` — renamed
 * - `C` — copied
 * - `?` — untracked
 * - `!` — ignored
 *
 * Two-character status: first char = index status, second char = working tree status.
 * Example: `"M "` = staged modification, `" M"` = unstaged modification, `"??"` = untracked.
 */
export interface GitChangedFile {
	/** Two-character porcelain status code (e.g., "M ", " M", "??", "A ", "D "). */
	status: string;
	/** File path relative to the repo root. */
	path: string;
	/** Original path for renames/copies (when status contains R or C). */
	originalPath: string | null;
}

/**
 * Result of `git status` for a directory.
 */
export interface GitStatusResult {
	/** Whether the directory is inside a git repository. */
	isRepo: boolean;
	/** Current branch name, or null if detached HEAD or not a repo. */
	branch: string | null;
	/** List of changed files (staged, unstaged, and untracked). */
	files: GitChangedFile[];
	/** True if there are any uncommitted changes (files.length > 0). */
	isDirty: boolean;
}

/**
 * A single commit entry from `git log --oneline`.
 */
export interface GitLogEntry {
	/** Abbreviated commit hash. */
	hash: string;
	/** Commit message (first line / oneline summary). */
	message: string;
}

/**
 * Result of `git log`.
 */
export interface GitLogResult {
	entries: GitLogEntry[];
}

/**
 * Result of `git diff`.
 *
 * Contains the raw unified diff text. The web app handles parsing
 * and rendering (syntax highlighting, split view, etc.).
 */
export interface GitDiffResult {
	/** Raw unified diff output from git. Empty string if no changes. */
	diff: string;
}

// ============================================================================
// Turn Diff
// ============================================================================

/**
 * Per-file summary within a turn diff — path + addition/deletion line counts.
 *
 * Parsed from `git diff --numstat` output. Binary files show -1/-1.
 */
export interface TurnDiffFileSummary {
	/** File path relative to the repo root. */
	path: string;
	/** Number of added lines (-1 for binary files). */
	additions: number;
	/** Number of deleted lines (-1 for binary files). */
	deletions: number;
}

/**
 * Result of a turn diff request.
 *
 * Contains the raw unified diff text for all requested files,
 * plus a per-file summary with line counts. The web app handles
 * parsing and rendering the unified diff.
 *
 * Without git checkpoints (Pi doesn't create them), diffs are computed
 * as `git diff HEAD -- <files>` (working tree vs last commit). This
 * means the diff shows ALL changes to those files since the last commit,
 * not just changes from a single turn. This is a known limitation —
 * accurate per-turn diffs would require Pi to create git tags/stashes
 * at turn boundaries.
 */
export interface TurnDiffResult {
	/** Raw unified diff output. Empty string if no changes. */
	diff: string;
	/** Per-file summary with addition/deletion counts. */
	files: TurnDiffFileSummary[];
	/** The CWD used for the diff (for display purposes). */
	cwd: string;
}
