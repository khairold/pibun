/**
 * @pibun/contracts — WebSocket Protocol Types
 *
 * Message contract between the browser (React) and server (Bun).
 * Simple request/response + push model. No Effect Schema, no tagged unions.
 * Method strings like "session.prompt" discriminate request types.
 *
 * ## Protocol Overview
 *
 * Three message shapes flow over the WebSocket:
 *
 * - **WsRequest** (browser → server): `{ id, method, params?, sessionId? }`
 *   Every request gets exactly one WsResponse back, correlated by `id`.
 *
 * - **WsResponse** (server → browser): `{ id, result? }` or `{ id, error }`
 *
 * - **WsPush** (server → browser, unsolicited): `{ type: "push", channel, data }`
 *   Push channels: pi.event, pi.response, server.welcome, server.error,
 *   menu.action, terminal.data, terminal.exit
 *
 * This file is the single source of truth. All 42 methods and 7 push channels
 * are defined here with full TypeScript types. The compiler enforces correctness.
 */

import type {
	GitDiffResult,
	GitLogResult,
	GitStatusResult,
	PiBunSettings,
	Plugin,
	Project,
} from "./domain.js";
import type {
	PiAgentMessage,
	PiEvent,
	PiModel,
	PiResponse,
	PiSessionState,
	PiSessionStats,
	PiThinkingLevel,
} from "./piProtocol.js";

// ============================================================================
// Method Names
// ============================================================================

/** All WebSocket RPC method names, keyed for autocomplete. */
export const WS_METHODS = {
	// Session lifecycle
	sessionStart: "session.start",
	sessionStop: "session.stop",
	sessionGetState: "session.getState",
	sessionGetMessages: "session.getMessages",
	sessionGetStats: "session.getStats",

	// Prompting
	sessionPrompt: "session.prompt",
	sessionSteer: "session.steer",
	sessionFollowUp: "session.followUp",
	sessionAbort: "session.abort",

	// Model / Settings
	sessionSetModel: "session.setModel",
	sessionSetThinking: "session.setThinking",
	sessionGetModels: "session.getModels",

	// Session management
	sessionNew: "session.new",
	sessionCompact: "session.compact",
	sessionFork: "session.fork",
	sessionSetName: "session.setName",
	sessionGetForkMessages: "session.getForkMessages",

	// Extension UI
	sessionExtensionUiResponse: "session.extensionUiResponse",

	// Session listing (server-side, not Pi RPC)
	sessionListSessions: "session.listSessions",
	sessionSwitchSession: "session.switchSession",

	// Project management (server-side persistence)
	projectList: "project.list",
	projectAdd: "project.add",
	projectRemove: "project.remove",
	projectUpdate: "project.update",

	// Git integration (server-side, not Pi RPC)
	gitStatus: "git.status",
	gitBranch: "git.branch",
	gitDiff: "git.diff",
	gitLog: "git.log",

	// Terminal integration
	terminalCreate: "terminal.create",
	terminalWrite: "terminal.write",
	terminalResize: "terminal.resize",
	terminalClose: "terminal.close",

	// Session export
	sessionExportHtml: "session.exportHtml",

	// App-level (desktop integration)
	appApplyUpdate: "app.applyUpdate",
	appCheckForUpdates: "app.checkForUpdates",
	appOpenFolderDialog: "app.openFolderDialog",
	appSetWindowTitle: "app.setWindowTitle",
	appSaveExportFile: "app.saveExportFile",

	// Settings (server-side persistence)
	settingsGet: "settings.get",
	settingsUpdate: "settings.update",

	// Plugin management (server-side)
	pluginList: "plugin.list",
	pluginInstall: "plugin.install",
	pluginUninstall: "plugin.uninstall",
	pluginSetEnabled: "plugin.setEnabled",
} as const;

/** Union of all WebSocket method strings. */
export type WsMethod = (typeof WS_METHODS)[keyof typeof WS_METHODS];

// ============================================================================
// Push Channel Names
// ============================================================================

/** All server-initiated push channel names. */
export const WS_CHANNELS = {
	/** All Pi RPC events (streaming text, tool calls, lifecycle). */
	piEvent: "pi.event",
	/** Pi command acknowledgment responses. */
	piResponse: "pi.response",
	/** Sent on WebSocket connect with server info. */
	serverWelcome: "server.welcome",
	/** Server-level error notifications. */
	serverError: "server.error",
	/** Native menu action forwarded from desktop app. */
	menuAction: "menu.action",
	/** App update status from desktop auto-updater. */
	appUpdate: "app.update",
	/** Terminal stdout data from a PTY shell session. */
	terminalData: "terminal.data",
	/** Terminal exited (process finished). */
	terminalExit: "terminal.exit",
	/** Session lifecycle status (crashed, stopped unexpectedly). */
	sessionStatus: "session.status",
} as const;

/** Union of all push channel strings. */
export type WsChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

// ============================================================================
// Request Parameters (per method)
// ============================================================================

/** Params for `session.start` — spawn a new Pi RPC process. */
export interface WsSessionStartParams {
	cwd?: string;
	provider?: string;
	model?: string;
	thinkingLevel?: PiThinkingLevel;
	/**
	 * If true, don't stop existing sessions on this connection.
	 * Used by the tab system to create additional concurrent sessions.
	 * Default: false (stops existing primary session for backward compat).
	 */
	keepExisting?: boolean;
}

/** An image attachment with base64 data and MIME type. */
export interface WsImageAttachment {
	/** Base64-encoded image data (no data-URL prefix). */
	data: string;
	/** MIME type, e.g. "image/png", "image/jpeg", "image/gif", "image/webp". */
	mimeType: string;
}

/** Params for `session.prompt` — send a user message. */
export interface WsSessionPromptParams {
	message: string;
	images?: WsImageAttachment[];
}

/** Params for `session.steer` — queue a steering message during streaming. */
export interface WsSessionSteerParams {
	message: string;
}

/** Params for `session.followUp` — queue a follow-up message. */
export interface WsSessionFollowUpParams {
	message: string;
}

/** Params for `session.setModel` — switch model. */
export interface WsSessionSetModelParams {
	provider: string;
	modelId: string;
}

/** Params for `session.setThinking` — set thinking level. */
export interface WsSessionSetThinkingParams {
	level: PiThinkingLevel;
}

/** Params for `session.compact` — compact context window. */
export interface WsSessionCompactParams {
	customInstructions?: string;
}

/** Params for `session.fork` — fork conversation from a previous message. */
export interface WsSessionForkParams {
	entryId: string;
}

/** Params for `session.setName` — set session display name. */
export interface WsSessionSetNameParams {
	name: string;
}

/** Params for `session.extensionUiResponse` — respond to extension UI dialog. */
export interface WsSessionExtensionUiResponseParams {
	id: string;
	value?: string;
	confirmed?: boolean;
	cancelled?: boolean;
}

/** Params for `session.switchSession` — switch to a different session file. */
export interface WsSessionSwitchSessionParams {
	sessionPath: string;
}

// ============================================================================
// Project Management Parameters
// ============================================================================

/**
 * Params for `project.add` — add a new project directory.
 *
 * Only `cwd` is required. Server generates `id`, defaults `name` to
 * directory basename, and initializes timestamps/counters.
 */
export interface WsProjectAddParams {
	cwd: string;
	name?: string;
}

/** Params for `project.remove` — remove a project by ID. */
export interface WsProjectRemoveParams {
	projectId: string;
}

/**
 * Params for `project.update` — update a project's metadata.
 *
 * Only the fields that are provided will be updated. The `id` field
 * identifies the project to update (separate from the update payload).
 */
export interface WsProjectUpdateParams {
	projectId: string;
	name?: string;
	favoriteModel?: { provider: string; modelId: string } | null;
	defaultThinking?: PiThinkingLevel | null;
	lastOpened?: number;
	sessionCount?: number;
}

// ============================================================================
// Git Integration Parameters
// ============================================================================

/**
 * Params for `git.status` — get branch + changed files.
 *
 * CWD is resolved from the active session's Pi process if not provided.
 */
export interface WsGitStatusParams {
	/** Override CWD instead of using the session's CWD. */
	cwd?: string;
}

/**
 * Params for `git.branch` — get the current branch name.
 */
export interface WsGitBranchParams {
	/** Override CWD instead of using the session's CWD. */
	cwd?: string;
}

/**
 * Params for `git.diff` — get unified diff output.
 */
export interface WsGitDiffParams {
	/** Override CWD instead of using the session's CWD. */
	cwd?: string;
	/** If true, show staged changes (--cached). Default: unstaged. */
	staged?: boolean;
	/** Restrict diff to a specific file path. */
	path?: string;
}

/**
 * Params for `git.log` — get recent commit history.
 */
export interface WsGitLogParams {
	/** Override CWD instead of using the session's CWD. */
	cwd?: string;
	/** Number of commits to return (default: 10). */
	count?: number;
}

// ============================================================================
// Terminal Integration Parameters
// ============================================================================

/**
 * Params for `terminal.create` — spawn a new PTY shell session.
 *
 * If `cwd` is not provided, inherits from the active Pi session's CWD.
 */
export interface WsTerminalCreateParams {
	/** Working directory for the shell. Falls back to active session CWD. */
	cwd?: string;
	/** Initial column count (default: 80). */
	cols?: number;
	/** Initial row count (default: 24). */
	rows?: number;
}

/** Params for `terminal.write` — write data to terminal stdin. */
export interface WsTerminalWriteParams {
	/** Terminal ID returned from `terminal.create`. */
	terminalId: string;
	/** Data to write (e.g., keystrokes, pasted text). */
	data: string;
}

/** Params for `terminal.resize` — resize terminal PTY dimensions. */
export interface WsTerminalResizeParams {
	/** Terminal ID returned from `terminal.create`. */
	terminalId: string;
	/** New column count. */
	cols: number;
	/** New row count. */
	rows: number;
}

/** Params for `terminal.close` — close a terminal and kill the shell process. */
export interface WsTerminalCloseParams {
	/** Terminal ID returned from `terminal.create`. */
	terminalId: string;
}

/** Params for `session.exportHtml` — export session as HTML. */
export interface WsSessionExportHtmlParams {
	/** Optional output file path. If omitted, Pi generates a temp path. */
	outputPath?: string;
}

/** Params for `app.setWindowTitle` — set the native window title. */
export interface WsAppSetWindowTitleParams {
	title: string;
}

/** Params for `app.saveExportFile` — save exported content to disk via native dialog. */
export interface WsAppSaveExportFileParams {
	/** The file content to save. */
	content: string;
	/** Suggested filename (e.g., "session_2026-03-23.md"). */
	defaultFilename: string;
}

// ============================================================================
// Settings Parameters
// ============================================================================

/**
 * Params for `settings.update` — update application settings.
 *
 * Only provided fields are merged into existing settings.
 * Omitted fields are unchanged.
 */
export interface WsSettingsUpdateParams {
	/** Theme ID to persist. Pass `null` to clear (use system default). */
	themeId?: string | null;
}

// ============================================================================
// Plugin Parameters
// ============================================================================

/**
 * Params for `plugin.install` — install a plugin from a URL or local path.
 *
 * - URL: downloads the plugin archive and extracts to `~/.pibun/plugins/`
 * - Path: copies the directory to `~/.pibun/plugins/`
 */
export interface WsPluginInstallParams {
	/** URL or absolute file path to the plugin source. */
	source: string;
}

/** Params for `plugin.uninstall` — remove a plugin by ID. */
export interface WsPluginUninstallParams {
	/** The plugin ID to uninstall. */
	pluginId: string;
}

/** Params for `plugin.setEnabled` — enable or disable a plugin. */
export interface WsPluginSetEnabledParams {
	/** The plugin ID. */
	pluginId: string;
	/** Whether to enable (true) or disable (false). */
	enabled: boolean;
}

// ============================================================================
// Method → Params Type Map
// ============================================================================

/**
 * Maps each method string to its params type.
 * `undefined` means the method takes no parameters.
 *
 * Use with typed helpers:
 * ```typescript
 * function send<M extends WsMethod>(
 *   method: M,
 *   params: WsMethodParamsMap[M]
 * ): Promise<WsMethodResultMap[M]>;
 * ```
 */
export interface WsMethodParamsMap {
	"session.start": WsSessionStartParams;
	"session.stop": undefined;
	"session.getState": undefined;
	"session.getMessages": undefined;
	"session.getStats": undefined;
	"session.prompt": WsSessionPromptParams;
	"session.steer": WsSessionSteerParams;
	"session.followUp": WsSessionFollowUpParams;
	"session.abort": undefined;
	"session.setModel": WsSessionSetModelParams;
	"session.setThinking": WsSessionSetThinkingParams;
	"session.getModels": undefined;
	"session.new": undefined;
	"session.compact": WsSessionCompactParams;
	"session.fork": WsSessionForkParams;
	"session.setName": WsSessionSetNameParams;
	"session.getForkMessages": undefined;
	"session.extensionUiResponse": WsSessionExtensionUiResponseParams;
	"session.listSessions": undefined;
	"session.switchSession": WsSessionSwitchSessionParams;
	"project.list": undefined;
	"project.add": WsProjectAddParams;
	"project.remove": WsProjectRemoveParams;
	"project.update": WsProjectUpdateParams;
	"git.status": WsGitStatusParams;
	"git.branch": WsGitBranchParams;
	"git.diff": WsGitDiffParams;
	"git.log": WsGitLogParams;
	"session.exportHtml": WsSessionExportHtmlParams;
	"terminal.create": WsTerminalCreateParams;
	"terminal.write": WsTerminalWriteParams;
	"terminal.resize": WsTerminalResizeParams;
	"terminal.close": WsTerminalCloseParams;
	"app.applyUpdate": undefined;
	"app.checkForUpdates": undefined;
	"app.openFolderDialog": undefined;
	"app.setWindowTitle": WsAppSetWindowTitleParams;
	"app.saveExportFile": WsAppSaveExportFileParams;
	"settings.get": undefined;
	"settings.update": WsSettingsUpdateParams;
	"plugin.list": undefined;
	"plugin.install": WsPluginInstallParams;
	"plugin.uninstall": WsPluginUninstallParams;
	"plugin.setEnabled": WsPluginSetEnabledParams;
}

// ============================================================================
// Response Results (per method)
// ============================================================================

/** Generic success acknowledgment for methods with no meaningful return data. */
export interface WsOkResult {
	ok: true;
}

/** Result for `session.start`. */
export interface WsSessionStartResult {
	sessionId: string;
}

/** Result for `session.getState`. */
export interface WsSessionGetStateResult {
	state: PiSessionState;
}

/** Result for `session.getMessages`. */
export interface WsSessionGetMessagesResult {
	messages: PiAgentMessage[];
}

/** Result for `session.getStats`. */
export interface WsSessionGetStatsResult {
	stats: PiSessionStats;
}

/** Result for `session.getModels`. */
export interface WsSessionGetModelsResult {
	models: PiModel[];
}

/** Result for `session.new`. */
export interface WsSessionNewResult {
	sessionId: string;
}

/** Result for `session.fork`. */
export interface WsSessionForkResult {
	sessionId: string;
}

/** A forkable message entry from Pi. */
export interface WsForkableMessage {
	entryId: string;
	text: string;
}

/** Result for `session.getForkMessages`. */
export interface WsSessionGetForkMessagesResult {
	messages: WsForkableMessage[];
}

/** Summary info for a session file in the session list. */
export interface WsSessionSummary {
	/** Full path to the session file. */
	sessionPath: string;
	/** Pi session UUID. */
	sessionId: string;
	/** Session creation timestamp (ISO string). */
	createdAt: string;
	/** Display name set via set_session_name, or null. */
	name: string | null;
	/** Working directory the session was started in. */
	cwd: string;
	/** Text of the first user message, or null if no messages. */
	firstMessage: string | null;
	/** Number of messages in the session. */
	messageCount: number;
}

/** Result for `session.listSessions`. */
export interface WsSessionListSessionsResult {
	sessions: WsSessionSummary[];
}

/** Result for `session.switchSession`. */
export interface WsSessionSwitchSessionResult {
	/** True if an extension cancelled the switch. */
	cancelled: boolean;
}

// ============================================================================
// Project Management Results
// ============================================================================

/** Result for `project.list`. */
export interface WsProjectListResult {
	projects: Project[];
}

/** Result for `project.add`. */
export interface WsProjectAddResult {
	project: Project;
}

// ============================================================================
// Git Integration Results
// ============================================================================

/** Result for `git.status` — branch + changed files. */
export interface WsGitStatusResult {
	status: GitStatusResult;
}

/** Result for `git.branch` — current branch name. */
export interface WsGitBranchResult {
	branch: string | null;
}

/** Result for `git.diff` — unified diff text. */
export interface WsGitDiffResult {
	diff: GitDiffResult;
}

/** Result for `git.log` — recent commits. */
export interface WsGitLogResult {
	log: GitLogResult;
}

// ============================================================================
// Terminal Integration Results
// ============================================================================

/** Result for `terminal.create` — the created terminal's ID. */
export interface WsTerminalCreateResult {
	terminalId: string;
	/** PID of the shell process. */
	pid: number;
}

/** Result for `session.exportHtml` — exported HTML file path and content. */
export interface WsSessionExportHtmlResult {
	/** Path where the HTML file was written. */
	path: string;
	/** The HTML content (for browser download without file system access). */
	html: string;
}

/** Result for `app.openFolderDialog` — native folder picker. */
export interface WsAppOpenFolderDialogResult {
	/** Selected folder path, or null if the user cancelled. */
	folderPath: string | null;
}

/** Result for `app.saveExportFile` — native save file dialog + write. */
export interface WsAppSaveExportFileResult {
	/** Full path of the saved file, or null if the user cancelled. */
	filePath: string | null;
}

// ============================================================================
// Settings Results
// ============================================================================

/** Result for `settings.get` — current application settings. */
export interface WsSettingsGetResult {
	settings: PiBunSettings;
}

/** Result for `settings.update` — updated settings returned for confirmation. */
export interface WsSettingsUpdateResult {
	settings: PiBunSettings;
}

// ============================================================================
// Plugin Results
// ============================================================================

/** Result for `plugin.list` — all installed plugins with runtime state. */
export interface WsPluginListResult {
	plugins: Plugin[];
}

/** Result for `plugin.install` — the newly installed plugin. */
export interface WsPluginInstallResult {
	plugin: Plugin;
}

// ============================================================================
// Method → Result Type Map
// ============================================================================

/**
 * Maps each method string to its success result type.
 * Used for type-safe response handling.
 */
export interface WsMethodResultMap {
	"session.start": WsSessionStartResult;
	"session.stop": WsOkResult;
	"session.getState": WsSessionGetStateResult;
	"session.getMessages": WsSessionGetMessagesResult;
	"session.getStats": WsSessionGetStatsResult;
	"session.prompt": WsOkResult;
	"session.steer": WsOkResult;
	"session.followUp": WsOkResult;
	"session.abort": WsOkResult;
	"session.setModel": WsOkResult;
	"session.setThinking": WsOkResult;
	"session.getModels": WsSessionGetModelsResult;
	"session.new": WsSessionNewResult;
	"session.compact": WsOkResult;
	"session.fork": WsSessionForkResult;
	"session.setName": WsOkResult;
	"session.getForkMessages": WsSessionGetForkMessagesResult;
	"session.extensionUiResponse": WsOkResult;
	"session.exportHtml": WsSessionExportHtmlResult;
	"session.listSessions": WsSessionListSessionsResult;
	"session.switchSession": WsSessionSwitchSessionResult;
	"project.list": WsProjectListResult;
	"project.add": WsProjectAddResult;
	"project.remove": WsOkResult;
	"project.update": WsOkResult;
	"git.status": WsGitStatusResult;
	"git.branch": WsGitBranchResult;
	"git.diff": WsGitDiffResult;
	"git.log": WsGitLogResult;
	"terminal.create": WsTerminalCreateResult;
	"terminal.write": WsOkResult;
	"terminal.resize": WsOkResult;
	"terminal.close": WsOkResult;
	"app.applyUpdate": WsOkResult;
	"app.checkForUpdates": WsOkResult;
	"app.openFolderDialog": WsAppOpenFolderDialogResult;
	"app.setWindowTitle": WsOkResult;
	"app.saveExportFile": WsAppSaveExportFileResult;
	"settings.get": WsSettingsGetResult;
	"settings.update": WsSettingsUpdateResult;
	"plugin.list": WsPluginListResult;
	"plugin.install": WsPluginInstallResult;
	"plugin.uninstall": WsOkResult;
	"plugin.setEnabled": WsOkResult;
}

// ============================================================================
// Push Channel Data Types
// ============================================================================

/**
 * Data for `pi.event` push — Pi RPC event tagged with source session ID.
 *
 * Multi-session: the client uses `sessionId` to route events to the correct tab.
 */
export interface WsPiEventData {
	/** Which session emitted this event. */
	sessionId: string;
	/** The raw Pi event. */
	event: PiEvent;
}

/**
 * Data for `pi.response` push — Pi command acknowledgment tagged with session ID.
 */
export interface WsPiResponseData {
	/** Which session this response belongs to. */
	sessionId: string;
	/** The raw Pi response. */
	response: PiResponse;
}

/** Data for `server.welcome` push — sent on WebSocket connect. */
export interface WsServerWelcomeData {
	cwd: string;
	version: string;
}

/** Data for `server.error` push — server-level error notification. */
export interface WsServerErrorData {
	message: string;
}

/**
 * Data for `menu.action` push — native menu action from desktop app.
 *
 * Action strings use dot-namespaced format matching the desktop menu
 * structure (e.g., "file.new-session", "session.abort").
 */
export interface WsMenuActionData {
	action: string;
	/** Optional extra data for actions that carry a payload (e.g., selected folder path). */
	data?: Record<string, unknown>;
}

/**
 * Update status types for the auto-updater.
 */
export type AppUpdateStatus =
	| "checking"
	| "no-update"
	| "update-available"
	| "downloading"
	| "download-progress"
	| "update-ready"
	| "applying"
	| "error";

/**
 * Data for `app.update` push — auto-update status from desktop main process.
 */
export interface WsAppUpdateData {
	status: AppUpdateStatus;
	message: string;
	/** The new version string, if available. */
	newVersion?: string;
	/** Download progress percentage (0–100). */
	progress?: number;
	/** Error message when status is "error". */
	error?: string;
}

/**
 * Data for `terminal.data` push — stdout data from a PTY shell.
 */
export interface WsTerminalDataPush {
	/** Which terminal emitted this data. */
	terminalId: string;
	/** Raw terminal output (may contain ANSI escape codes). */
	data: string;
}

/**
 * Data for `terminal.exit` push — terminal process exited.
 */
export interface WsTerminalExitPush {
	/** Which terminal exited. */
	terminalId: string;
	/** Exit code of the shell process. */
	exitCode: number;
	/** Signal that caused exit, if any. */
	signal?: number | string;
}

/**
 * Data for `session.status` push — session lifecycle events from the server.
 *
 * Sent when a Pi process exits unexpectedly (crash) so the client can show
 * a persistent health banner. Not sent for expected stops (user-initiated).
 */
export interface WsSessionStatusData {
	/** Which session this status change applies to. */
	sessionId: string;
	/** Type of status change. */
	status: "crashed";
	/** Human-readable description of what happened. */
	message: string;
	/** Process exit code (for crashes). */
	exitCode?: number;
}

// ============================================================================
// Channel → Data Type Map
// ============================================================================

/**
 * Maps each push channel to its data payload type.
 * Used for type-safe push handling.
 */
export interface WsChannelDataMap {
	"pi.event": WsPiEventData;
	"pi.response": WsPiResponseData;
	"server.welcome": WsServerWelcomeData;
	"server.error": WsServerErrorData;
	"menu.action": WsMenuActionData;
	"app.update": WsAppUpdateData;
	"terminal.data": WsTerminalDataPush;
	"terminal.exit": WsTerminalExitPush;
	"session.status": WsSessionStatusData;
}

// ============================================================================
// Wire Message Types (what actually goes over the WebSocket)
// ============================================================================

/**
 * Browser → Server request.
 *
 * Every request gets exactly one `WsResponse` back, correlated by `id`.
 *
 * Multi-session: `sessionId` targets a specific Pi session. If omitted,
 * the server uses the connection's primary session (backward compatible).
 *
 * ```json
 * { "id": "req-1", "method": "session.prompt", "params": { "message": "hello" }, "sessionId": "session_1_..." }
 * ```
 */
export interface WsRequest {
	id: string;
	method: WsMethod;
	params?: Record<string, unknown>;
	/** Target session ID for multi-session support. Falls back to connection's primary session. */
	sessionId?: string;
}

/**
 * Server → Browser success response.
 *
 * ```json
 * { "id": "req-1", "result": { "ok": true } }
 * ```
 */
export interface WsResponseOk {
	id: string;
	result: Record<string, unknown>;
}

/**
 * Server → Browser error response.
 *
 * ```json
 * { "id": "req-1", "error": { "message": "No active session" } }
 * ```
 */
export interface WsResponseError {
	id: string;
	error: { message: string };
}

/** Server → Browser response (success or error). Discriminate via `"error" in resp`. */
export type WsResponse = WsResponseOk | WsResponseError;

/**
 * Server → Browser push (unsolicited event).
 * Discriminated from responses by `type === "push"`.
 *
 * ```json
 * { "type": "push", "channel": "pi.event", "data": { ... } }
 * ```
 */
export interface WsPush {
	type: "push";
	channel: WsChannel;
	data: unknown;
}

/**
 * Any message the server can send to the browser.
 * Discriminate: if `"type" in msg && msg.type === "push"` → WsPush, else → WsResponse.
 */
export type WsServerMessage = WsResponse | WsPush;

// ============================================================================
// Type-Safe Generics (for compile-time safety in transport layers)
// ============================================================================

/**
 * Type-safe request for a specific method.
 * Used by the client transport layer for compile-time param checking.
 *
 * ```typescript
 * const req: WsTypedRequest<"session.prompt"> = {
 *   id: "1",
 *   method: "session.prompt",
 *   params: { message: "hello" },
 * };
 * ```
 */
export type WsTypedRequest<M extends WsMethod> = {
	id: string;
	method: M;
} & (WsMethodParamsMap[M] extends undefined
	? { params?: never }
	: { params: WsMethodParamsMap[M] });

/**
 * Type-safe success response for a specific method.
 * Used by the client transport layer for compile-time result typing.
 */
export interface WsTypedResponseOk<M extends WsMethod> {
	id: string;
	result: WsMethodResultMap[M];
}

/**
 * Type-safe response (success or error) for a specific method.
 */
export type WsTypedResponse<M extends WsMethod> = WsTypedResponseOk<M> | WsResponseError;

/**
 * Type-safe push for a specific channel.
 * Used by push subscription handlers for compile-time data typing.
 *
 * ```typescript
 * transport.subscribe<"pi.event">("pi.event", (data: PiEvent) => { ... });
 * ```
 */
export interface WsTypedPush<C extends WsChannel> {
	type: "push";
	channel: C;
	data: WsChannelDataMap[C];
}
