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
	KeybindingRule,
	PiBunSettings,
	Plugin,
	Project,
	TimestampFormat,
	TurnDiffResult,
} from "./domain.js";
import type {
	PiAgentMessage,
	PiEvent,
	PiFollowUpMode,
	PiModel,
	PiResponse,
	PiSessionState,
	PiSessionStats,
	PiSlashCommand,
	PiSteeringMode,
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
	sessionBash: "session.bash",
	sessionAbortBash: "session.abortBash",

	// Model / Settings
	sessionSetModel: "session.setModel",
	sessionSetThinking: "session.setThinking",
	sessionGetModels: "session.getModels",
	sessionSetAutoCompaction: "session.setAutoCompaction",
	sessionSetAutoRetry: "session.setAutoRetry",
	sessionSetSteeringMode: "session.setSteeringMode",
	sessionSetFollowUpMode: "session.setFollowUpMode",

	// Session management
	sessionNew: "session.new",
	sessionCompact: "session.compact",
	sessionFork: "session.fork",
	sessionSetName: "session.setName",
	sessionGetForkMessages: "session.getForkMessages",
	sessionGetCommands: "session.getCommands",
	sessionCycleModel: "session.cycleModel",
	sessionCycleThinking: "session.cycleThinking",
	sessionGetLastAssistantText: "session.getLastAssistantText",

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
	projectSearchFiles: "project.searchFiles",
	projectOpenInEditor: "project.openInEditor",
	projectOpenFileInEditor: "project.openFileInEditor",

	// Workspace (server-side persistence — loaded sessions in sidebar)
	workspaceGetLoaded: "workspace.getLoaded",
	workspaceAddLoaded: "workspace.addLoaded",
	workspaceRemoveLoaded: "workspace.removeLoaded",

	// Git integration (server-side, not Pi RPC)
	gitStatus: "git.status",
	gitBranch: "git.branch",
	gitDiff: "git.diff",
	gitLog: "git.log",

	// Turn diff (server-side git diff for specific files)
	sessionGetTurnDiff: "session.getTurnDiff",

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
	appCheckPrerequisites: "app.checkPrerequisites",
	appOpenFolderDialog: "app.openFolderDialog",
	appSetWindowTitle: "app.setWindowTitle",
	appSaveExportFile: "app.saveExportFile",
	appShowContextMenu: "app.showContextMenu",

	// Settings (server-side persistence)
	settingsGet: "settings.get",
	settingsUpdate: "settings.update",

	// Keybindings (server-side persistence)
	keybindingsGet: "keybindings.get",

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
	/** Context menu item clicked — forwarded from desktop native context menu. */
	contextMenuAction: "context-menu.action",
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

/**
 * Params for `session.bash` — execute a shell command and add output to Pi context.
 *
 * The output is stored as a `BashExecutionMessage` and included in the next prompt.
 * Multiple bash commands can be executed before prompting — all outputs are included.
 */
export interface WsSessionBashParams {
	/** Shell command to execute. */
	command: string;
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

/** Params for `session.setAutoCompaction` — enable/disable auto-compaction. */
export interface WsSessionSetAutoCompactionParams {
	enabled: boolean;
}

/** Params for `session.setAutoRetry` — enable/disable auto-retry. */
export interface WsSessionSetAutoRetryParams {
	enabled: boolean;
}

/** Params for `session.setSteeringMode` — set how steering messages are delivered. */
export interface WsSessionSetSteeringModeParams {
	mode: PiSteeringMode;
}

/** Params for `session.setFollowUpMode` — set how follow-up messages are delivered. */
export interface WsSessionSetFollowUpModeParams {
	mode: PiFollowUpMode;
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
// Project File Search Parameters
// ============================================================================

/**
 * Params for `project.searchFiles` — search for files in a project directory.
 *
 * Uses `fd` (fast file finder) on the server with `.gitignore` respect.
 * Designed for the `@` file mention trigger in the composer — debounce on the client,
 * the server runs the search and returns results.
 */
export interface WsProjectSearchFilesParams {
	/** Search query (matched against file paths, case-insensitive). Empty string returns recent/common files. */
	query: string;
	/** Working directory to search in. Falls back to active session's CWD, then server CWD. */
	cwd?: string;
	/** Maximum number of results to return (default: 50). */
	limit?: number;
}

/**
 * A file search result entry.
 */
export interface FileSearchResult {
	/** Relative path from the search root (e.g., "src/components/App.tsx"). */
	path: string;
	/** Entry kind: "file" or "directory". */
	kind: "file" | "directory";
}

/**
 * Result for `project.searchFiles` — matching files/directories.
 */
export interface WsProjectSearchFilesResult {
	/** Matched files and directories, ordered by relevance (path match quality). */
	files: FileSearchResult[];
	/** The root directory the search was performed in (resolved CWD). */
	cwd: string;
}

/**
 * Params for `project.openInEditor` — open a project directory in the system editor.
 *
 * Tries common code editors (cursor, code, zed) in order. Falls back to
 * the system's default handler for directories (`open` on macOS, `xdg-open` on Linux).
 */
export interface WsProjectOpenInEditorParams {
	/** Absolute path to the project directory. */
	cwd: string;
}

/**
 * Params for `project.openFileInEditor` — open a file in the system code editor.
 *
 * Supports line and column positioning. Tries common code editors (cursor, code, zed)
 * with `editor <file>:<line>:<col>` syntax. Falls back to `open`/`xdg-open` for the file.
 */
export interface WsProjectOpenFileInEditorParams {
	/** Absolute path to the file to open. */
	filePath: string;
	/** Optional line number (1-based) to jump to. */
	line?: number;
	/** Optional column number (1-based) to jump to. */
	column?: number;
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
// Turn Diff Parameters
// ============================================================================

/**
 * Params for `session.getTurnDiff` — get git diff for specific files or all changes.
 *
 * Without git checkpoints at turn boundaries, diffs are computed as
 * `git diff HEAD -- <files>` (working tree + staged vs last commit).
 * When `files` is empty/omitted, returns diff for all changes.
 *
 * The DiffPanel uses this with `changedFiles` from turn dividers to show
 * per-turn diffs (approximate — shows all changes to those files, not just
 * changes from a specific turn).
 */
export interface WsSessionGetTurnDiffParams {
	/** Override CWD instead of using the session's CWD. */
	cwd?: string;
	/**
	 * File paths to diff (relative to repo root).
	 * If empty or omitted, diffs all changes in the working tree.
	 */
	files?: string[];
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

/**
 * A single item in a native context menu.
 *
 * Matches Electrobun's `ApplicationMenuItemConfig` format.
 * Items can be normal (clickable), separators, or nested submenus.
 */
export interface ContextMenuItem {
	/** Display label. Required for non-separator items. */
	label?: string;
	/**
	 * Action identifier returned when item is clicked.
	 * This string is sent back via the `context-menu.action` push channel.
	 */
	action?: string;
	/** Menu item type. Defaults to "normal". */
	type?: "normal" | "separator" | "divider";
	/** Whether the item is enabled. Defaults to true. */
	enabled?: boolean;
	/** Arbitrary data associated with this item, echoed back on click. */
	data?: unknown;
	/** Nested submenu items. */
	submenu?: ContextMenuItem[];
}

/**
 * Params for `app.showContextMenu` — show a native context menu.
 *
 * Desktop-only. In browser mode, the server returns an error and the
 * web app should fall back to a custom HTML context menu.
 *
 * The result of the user's selection is delivered asynchronously via
 * the `context-menu.action` push channel.
 */
export interface WsAppShowContextMenuParams {
	/** The menu items to display. */
	items: ContextMenuItem[];
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
	/** Whether auto-compaction is enabled. `null` to use Pi default. */
	autoCompaction?: boolean | null;
	/** Whether auto-retry is enabled. `null` to use Pi default. */
	autoRetry?: boolean | null;
	/** Steering message delivery mode. `null` to use Pi default. */
	steeringMode?: PiSteeringMode | null;
	/** Follow-up message delivery mode. `null` to use Pi default. */
	followUpMode?: PiFollowUpMode | null;
	/** Timestamp display format. */
	timestampFormat?: TimestampFormat;
}

// ============================================================================
// Workspace Parameters
// ============================================================================

/** Params for `workspace.addLoaded` — add a session to the sidebar loaded list. */
export interface WsWorkspaceAddLoadedParams {
	/** Full path to the session JSONL file. */
	sessionPath: string;
}

/** Params for `workspace.removeLoaded` — remove a session from the sidebar loaded list. */
export interface WsWorkspaceRemoveLoadedParams {
	/** Full path to the session JSONL file. */
	sessionPath: string;
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
	"session.bash": WsSessionBashParams;
	"session.abortBash": undefined;
	"session.setModel": WsSessionSetModelParams;
	"session.setThinking": WsSessionSetThinkingParams;
	"session.getModels": undefined;
	"session.setAutoCompaction": WsSessionSetAutoCompactionParams;
	"session.setAutoRetry": WsSessionSetAutoRetryParams;
	"session.setSteeringMode": WsSessionSetSteeringModeParams;
	"session.setFollowUpMode": WsSessionSetFollowUpModeParams;
	"session.new": undefined;
	"session.compact": WsSessionCompactParams;
	"session.fork": WsSessionForkParams;
	"session.setName": WsSessionSetNameParams;
	"session.getForkMessages": undefined;
	"session.getCommands": undefined;
	"session.cycleModel": undefined;
	"session.cycleThinking": undefined;
	"session.getLastAssistantText": undefined;
	"session.extensionUiResponse": WsSessionExtensionUiResponseParams;
	"session.listSessions": undefined;
	"session.switchSession": WsSessionSwitchSessionParams;
	"workspace.getLoaded": undefined;
	"workspace.addLoaded": WsWorkspaceAddLoadedParams;
	"workspace.removeLoaded": WsWorkspaceRemoveLoadedParams;
	"project.list": undefined;
	"project.add": WsProjectAddParams;
	"project.remove": WsProjectRemoveParams;
	"project.update": WsProjectUpdateParams;
	"project.searchFiles": WsProjectSearchFilesParams;
	"project.openInEditor": WsProjectOpenInEditorParams;
	"project.openFileInEditor": WsProjectOpenFileInEditorParams;
	"git.status": WsGitStatusParams;
	"git.branch": WsGitBranchParams;
	"git.diff": WsGitDiffParams;
	"git.log": WsGitLogParams;
	"session.getTurnDiff": WsSessionGetTurnDiffParams;
	"session.exportHtml": WsSessionExportHtmlParams;
	"terminal.create": WsTerminalCreateParams;
	"terminal.write": WsTerminalWriteParams;
	"terminal.resize": WsTerminalResizeParams;
	"terminal.close": WsTerminalCloseParams;
	"app.applyUpdate": undefined;
	"app.checkForUpdates": undefined;
	"app.checkPrerequisites": undefined;
	"app.openFolderDialog": undefined;
	"app.setWindowTitle": WsAppSetWindowTitleParams;
	"app.saveExportFile": WsAppSaveExportFileParams;
	"app.showContextMenu": WsAppShowContextMenuParams;
	"settings.get": undefined;
	"settings.update": WsSettingsUpdateParams;
	"keybindings.get": undefined;
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

/**
 * Result for `session.bash` — executed shell command output.
 *
 * The output has been added to Pi's context and will be included in the next prompt.
 * If `truncated` is true, `fullOutputPath` points to a temp file with the full output.
 */
export interface WsSessionBashResult {
	/** Combined stdout + stderr output (possibly truncated). */
	output: string;
	/** Process exit code (undefined if killed/cancelled). */
	exitCode: number | undefined;
	/** Whether the command was cancelled via abort. */
	cancelled: boolean;
	/** Whether the output was truncated. */
	truncated: boolean;
	/** Path to temp file with full output (if truncated). */
	fullOutputPath?: string;
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

/** Result for `session.getCommands` — available slash commands. */
export interface WsSessionGetCommandsResult {
	commands: PiSlashCommand[];
}

/**
 * Result for `session.cycleModel` — the new model after cycling.
 * Returns `null` if only one model is available (nothing to cycle to).
 */
export interface WsSessionCycleModelResult {
	model: PiModel | null;
	thinkingLevel: PiThinkingLevel | null;
}

/**
 * Result for `session.cycleThinking` — the new thinking level after cycling.
 * Returns `null` if the model doesn't support thinking.
 */
export interface WsSessionCycleThinkingResult {
	level: PiThinkingLevel | null;
}

/**
 * Result for `session.getLastAssistantText` — text of the last assistant message.
 * Returns `null` if no assistant messages exist.
 */
export interface WsSessionGetLastAssistantTextResult {
	text: string | null;
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
// Turn Diff Results
// ============================================================================

/** Result for `session.getTurnDiff` — unified diff + per-file summary. */
export interface WsSessionGetTurnDiffResult {
	/** The complete turn diff data (diff text + file summaries + cwd). */
	turnDiff: TurnDiffResult;
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

// ============================================================================
// Prerequisites Results
// ============================================================================

/**
 * Status of a single prerequisite dependency.
 * `found: false` means the binary isn't on PATH.
 * `meetsMinimum: false` means it exists but is too old.
 */
export interface PrerequisiteCheck {
	/** Whether the binary was found on PATH. */
	found: boolean;
	/** Detected version string (e.g., "0.62.0"), null if not found. */
	version: string | null;
	/** Whether the detected version meets the minimum required. */
	meetsMinimum: boolean;
}

/**
 * Result for `app.checkPrerequisites` — system dependency status.
 *
 * PiBun requires the Pi CLI (`pi` command) to be installed via npm.
 * Pi in turn requires Node.js, but if Pi is found and meets the minimum
 * version, Node is implicitly satisfied.
 */
export interface WsAppCheckPrerequisitesResult {
	/** Status of the `pi` CLI binary. */
	pi: PrerequisiteCheck;
	/**
	 * Minimum Pi version required by this PiBun build.
	 * Displayed on the setup screen so users know what to install.
	 */
	minimumPiVersion: string;
	/** True when all prerequisites are met and sessions can be created. */
	ready: boolean;
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
// Keybindings Results
// ============================================================================

/**
 * Result for `keybindings.get` — user-defined keybinding overrides.
 *
 * Returns the rules from `~/.pibun/keybindings.json`.
 * Empty array means no user overrides (defaults apply).
 * The client merges these with built-in defaults (user rules win via last-match).
 */
export interface WsKeybindingsGetResult {
	rules: KeybindingRule[];
	/** Absolute path to the keybindings file (for display in settings). */
	configPath: string;
}

// ============================================================================
// Workspace Results
// ============================================================================

/** Result for `workspace.getLoaded` — session paths the user has loaded into sidebar. */
export interface WsWorkspaceGetLoadedResult {
	sessionPaths: string[];
}

/** Result for `workspace.addLoaded` — updated list after adding. */
export interface WsWorkspaceAddLoadedResult {
	sessionPaths: string[];
}

/** Result for `workspace.removeLoaded` — updated list after removing. */
export interface WsWorkspaceRemoveLoadedResult {
	sessionPaths: string[];
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
	"session.bash": WsSessionBashResult;
	"session.abortBash": WsOkResult;
	"session.setModel": WsOkResult;
	"session.setThinking": WsOkResult;
	"session.getModels": WsSessionGetModelsResult;
	"session.setAutoCompaction": WsOkResult;
	"session.setAutoRetry": WsOkResult;
	"session.setSteeringMode": WsOkResult;
	"session.setFollowUpMode": WsOkResult;
	"session.new": WsSessionNewResult;
	"session.compact": WsOkResult;
	"session.fork": WsSessionForkResult;
	"session.setName": WsOkResult;
	"session.getForkMessages": WsSessionGetForkMessagesResult;
	"session.getCommands": WsSessionGetCommandsResult;
	"session.cycleModel": WsSessionCycleModelResult;
	"session.cycleThinking": WsSessionCycleThinkingResult;
	"session.getLastAssistantText": WsSessionGetLastAssistantTextResult;
	"session.extensionUiResponse": WsOkResult;
	"session.exportHtml": WsSessionExportHtmlResult;
	"session.listSessions": WsSessionListSessionsResult;
	"session.switchSession": WsSessionSwitchSessionResult;
	"workspace.getLoaded": WsWorkspaceGetLoadedResult;
	"workspace.addLoaded": WsWorkspaceAddLoadedResult;
	"workspace.removeLoaded": WsWorkspaceRemoveLoadedResult;
	"project.list": WsProjectListResult;
	"project.add": WsProjectAddResult;
	"project.remove": WsOkResult;
	"project.update": WsOkResult;
	"project.searchFiles": WsProjectSearchFilesResult;
	"project.openInEditor": WsOkResult;
	"project.openFileInEditor": WsOkResult;
	"git.status": WsGitStatusResult;
	"git.branch": WsGitBranchResult;
	"git.diff": WsGitDiffResult;
	"git.log": WsGitLogResult;
	"session.getTurnDiff": WsSessionGetTurnDiffResult;
	"terminal.create": WsTerminalCreateResult;
	"terminal.write": WsOkResult;
	"terminal.resize": WsOkResult;
	"terminal.close": WsOkResult;
	"app.applyUpdate": WsOkResult;
	"app.checkForUpdates": WsOkResult;
	"app.checkPrerequisites": WsAppCheckPrerequisitesResult;
	"app.openFolderDialog": WsAppOpenFolderDialogResult;
	"app.setWindowTitle": WsOkResult;
	"app.saveExportFile": WsAppSaveExportFileResult;
	"app.showContextMenu": WsOkResult;
	"settings.get": WsSettingsGetResult;
	"settings.update": WsSettingsUpdateResult;
	"keybindings.get": WsKeybindingsGetResult;
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

/**
 * Data for `context-menu.action` push — native context menu item clicked.
 *
 * Sent when the user clicks an item in a native context menu that was
 * shown via `app.showContextMenu`. The `action` string and optional `data`
 * come from the `ContextMenuItem` that was clicked.
 */
export interface WsContextMenuActionData {
	/** Action string from the clicked menu item. */
	action: string;
	/** Optional data attached to the clicked menu item. */
	data?: unknown;
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
	"context-menu.action": WsContextMenuActionData;
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
