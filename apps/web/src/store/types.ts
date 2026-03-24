/**
 * Store types — Zustand state shapes and ChatMessage definition.
 *
 * All fields are non-optional (no `undefined` values) to work with
 * `exactOptionalPropertyTypes`. Use `null` for absent values, `""` for
 * empty strings.
 */

import type { TransportState } from "@/transport";
import type {
	AppUpdateStatus,
	GitChangedFile,
	PiExtensionDialogRequest,
	PiModel,
	PiSessionStats,
	PiThinkingLevel,
	Plugin,
	PluginPanelPosition,
	Project,
	SessionTab,
	TimestampFormat,
	TurnDiffResult,
	WsSessionSummary,
} from "@pibun/contracts";

// ============================================================================
// ChatMessage — unified message type for rendering
// ============================================================================

/** Tool call info embedded in a ChatMessage. */
export interface ChatToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

/** Tool execution result embedded in a ChatMessage. */
export interface ChatToolResult {
	content: string;
	isError: boolean;
}

/**
 * Unified message type for the chat UI.
 *
 * Each message maps to one visual element in the chat view:
 * - `"user"` — user prompt bubble
 * - `"assistant"` — streaming assistant text (may include thinking)
 * - `"tool_call"` — tool call card (name + args)
 * - `"tool_result"` — tool execution output
 * - `"system"` — compaction notices, retry banners, errors
 */
export interface ChatMessage {
	/** Unique message ID (Pi's message ID, tool call ID, or generated). */
	id: string;
	/** Unix timestamp in milliseconds. */
	timestamp: number;
	/** Message category for rendering. */
	type: "user" | "assistant" | "tool_call" | "tool_result" | "system";
	/** Text content. For assistant messages, accumulated from text_delta events. */
	content: string;
	/** Thinking content. Accumulated from thinking_delta events. */
	thinking: string;
	/** Tool call info (only for type === "tool_call"). */
	toolCall: ChatToolCall | null;
	/** Tool execution result (only for type === "tool_result"). */
	toolResult: ChatToolResult | null;
	/** True while this message is actively being streamed. */
	streaming: boolean;
}

// ============================================================================
// Store Slices
// ============================================================================

/**
 * Provider health issue — persistent problem requiring user attention.
 *
 * Unlike `lastError` (auto-dismissing after 10s), health issues persist
 * until manually dismissed or the underlying issue is resolved.
 */
export interface ProviderHealthIssue {
	/** Category of the health issue. */
	kind: "process_crashed" | "session_start_failed" | "repeated_model_errors";
	/** Human-readable description. */
	message: string;
	/** Session ID affected, if applicable. */
	sessionId: string | null;
	/** Unix timestamp when the issue was detected. */
	detectedAt: number;
}

/** Connection state — mirrors WsTransport lifecycle. */
export interface ConnectionSlice {
	/** Current WebSocket transport state. */
	connectionStatus: TransportState;
	/** Current reconnection attempt number (0 when connected). */
	reconnectAttempt: number;
	/** Last error message to display to the user, null when no error. */
	lastError: string | null;
	/**
	 * Persistent provider health issue. Null when healthy.
	 * Not auto-dismissed — must be cleared manually or by starting a new session.
	 */
	providerHealth: ProviderHealthIssue | null;

	/** Update the connection status. */
	setConnectionStatus: (status: TransportState) => void;
	/** Update the reconnection attempt counter. */
	setReconnectAttempt: (attempt: number) => void;
	/** Set an error message to display. */
	setLastError: (error: string) => void;
	/** Clear the displayed error. */
	clearLastError: () => void;
	/** Set a provider health issue (persistent until dismissed). */
	setProviderHealth: (issue: ProviderHealthIssue | null) => void;
}

/** Session state — Pi agent session info. */
export interface SessionSlice {
	/** Current Pi session ID, null before session.start. */
	sessionId: string | null;
	/**
	 * Pi's internal session UUID (from the session file).
	 * Different from `sessionId` which is the PiBun manager ID used for event routing.
	 * Used for session list matching and past session highlighting.
	 * Null before `get_state` is called.
	 */
	piSessionId: string | null;
	/** Active model, null before first state fetch. */
	model: PiModel | null;
	/** Current thinking level. */
	thinkingLevel: PiThinkingLevel;
	/** True while Pi agent is processing (between agent_start and agent_end). */
	isStreaming: boolean;
	/** True while context compaction is in progress (manual or auto). */
	isCompacting: boolean;
	/** Timestamp (Date.now()) when the current agent run started. 0 when not running. */
	agentStartedAt: number;
	/** True while Pi is auto-retrying after an error. */
	isRetrying: boolean;
	/** Current retry attempt number (0 when not retrying). */
	retryAttempt: number;
	/** Maximum retry attempts (0 when not retrying). */
	retryMaxAttempts: number;
	/** Delay in ms before the next retry attempt (0 when not retrying). */
	retryDelayMs: number;
	/** Timestamp (Date.now()) when the current retry delay started (0 when not retrying). */
	retryStartedAt: number;
	/** Session statistics (tokens, cost), null before first fetch. */
	stats: PiSessionStats | null;
	/** Current session display name, null if not set. */
	sessionName: string | null;
	/** Current session file path, null before state fetch. */
	sessionFile: string | null;
	/** List of available sessions from the file system. */
	sessionList: WsSessionSummary[];
	/** True while fetching session list. */
	sessionListLoading: boolean;

	/** Set the session ID. */
	setSessionId: (id: string | null) => void;
	/** Set Pi's internal session UUID (from get_state). */
	setPiSessionId: (id: string | null) => void;
	/** Set the active model. */
	setModel: (model: PiModel | null) => void;
	/** Set the thinking level. */
	setThinkingLevel: (level: PiThinkingLevel) => void;
	/** Set streaming state. */
	setIsStreaming: (streaming: boolean) => void;
	/** Set the agent start timestamp. */
	setAgentStartedAt: (timestamp: number) => void;
	/** Set compacting state. */
	setIsCompacting: (compacting: boolean) => void;
	/** Set retrying state with attempt info. */
	setRetrying: (
		retrying: boolean,
		attempt?: number,
		maxAttempts?: number,
		delayMs?: number,
	) => void;
	/** Set session stats. */
	setStats: (stats: PiSessionStats | null) => void;
	/** Set session display name. */
	setSessionName: (name: string | null) => void;
	/** Set session file path. */
	setSessionFile: (path: string | null) => void;
	/** Set the session list. */
	setSessionList: (sessions: WsSessionSummary[]) => void;
	/** Set session list loading state. */
	setSessionListLoading: (loading: boolean) => void;
	/** Reset all session state to initial values. */
	resetSession: () => void;
}

/** Messages state — chat message array with streaming update actions. */
export interface MessagesSlice {
	/** Ordered list of chat messages. */
	messages: ChatMessage[];

	/** Append a new message to the end of the list. */
	appendMessage: (message: ChatMessage) => void;
	/** Append a text delta to an assistant message's content. */
	appendToContent: (messageId: string, delta: string) => void;
	/** Append a thinking delta to an assistant message's thinking. */
	appendToThinking: (messageId: string, delta: string) => void;
	/** Mark a message as no longer streaming. */
	setMessageStreaming: (messageId: string, streaming: boolean) => void;
	/** Update tool execution output (replaces content — accumulated, not delta). */
	updateToolOutput: (toolCallId: string, output: string) => void;
	/** Finalize a tool result (set content and isError). */
	finalizeToolResult: (toolCallId: string, content: string, isError: boolean) => void;
	/** Replace the entire messages array (for session restore). */
	setMessages: (messages: ChatMessage[]) => void;
	/** Clear all messages (for new session). */
	clearMessages: () => void;
}

/** Models state — available models list fetched from Pi. */
export interface ModelsSlice {
	/** List of available models from Pi. Empty before first fetch. */
	availableModels: PiModel[];
	/** True while fetching models from Pi. */
	modelsLoading: boolean;

	/** Set the available models list. */
	setAvailableModels: (models: PiModel[]) => void;
	/** Set the loading state for model fetching. */
	setModelsLoading: (loading: boolean) => void;
}

/** Extension UI state — pending dialog request from Pi. */
export interface ExtensionUiSlice {
	/** The current pending extension dialog request, null when no dialog is active. */
	pendingExtensionUi: PiExtensionDialogRequest | null;

	/** Set the pending extension dialog request. */
	setPendingExtensionUi: (request: PiExtensionDialogRequest | null) => void;
	/** Clear the pending dialog (after response sent or timeout). */
	clearPendingExtensionUi: () => void;
}

// ============================================================================
// Toast & Status Types
// ============================================================================

/** A toast notification (auto-dismissing). */
export interface Toast {
	/** Unique ID for this toast. */
	id: string;
	/** Display message. */
	message: string;
	/** Visual severity — determines icon and color. */
	level: "info" | "warning" | "error";
	/** Unix timestamp when this toast was created. */
	createdAt: number;
}

/** Notifications state — toasts + persistent status indicators. */
export interface NotificationsSlice {
	/** Active toast notifications (auto-dismissed after timeout). */
	toasts: Toast[];
	/** Persistent status indicators keyed by statusKey. */
	statuses: Map<string, string>;

	/** Add a toast notification. Returns the toast ID. */
	addToast: (message: string, level: Toast["level"]) => string;
	/** Remove a toast by ID. */
	removeToast: (id: string) => void;
	/** Set or remove a persistent status indicator. Empty/undefined text removes it. */
	setExtensionStatus: (key: string, text: string | undefined) => void;
	/** Clear all statuses (e.g., on session reset). */
	clearStatuses: () => void;
}

/** Update state — auto-updater status from desktop main process. */
export interface UpdateSlice {
	/** Current update status. */
	updateStatus: AppUpdateStatus | null;
	/** Human-readable update message. */
	updateMessage: string;
	/** New version string, if an update is available. */
	updateVersion: string | null;
	/** Download progress percentage (0–100), null when not downloading. */
	updateProgress: number | null;
	/** Error message from the updater. */
	updateError: string | null;

	/** Set the full update state from an `app.update` push. */
	setUpdateState: (
		status: AppUpdateStatus,
		message: string,
		version?: string,
		progress?: number,
		error?: string,
	) => void;
	/** Clear the update notification (dismiss by user). */
	dismissUpdate: () => void;
}

/** Projects state — project directory management. */
export interface ProjectsSlice {
	/** List of saved projects, ordered by lastOpened (most recent first). */
	projects: Project[];
	/** ID of the currently active project, null when no project is selected. */
	activeProjectId: string | null;
	/** True while loading projects from the server. */
	projectsLoading: boolean;

	/** Set the full projects list (from server load). Sorts by lastOpened descending. */
	setProjects: (projects: Project[]) => void;
	/** Add a project to the list (from server response after project.add). */
	addProject: (project: Project) => void;
	/** Remove a project by ID. Clears activeProjectId if it was the removed one. */
	removeProject: (projectId: string) => void;
	/** Update a project's metadata. Merges with existing project fields. */
	updateProject: (projectId: string, updates: Partial<Project>) => void;
	/** Set the active project ID. */
	setActiveProjectId: (projectId: string | null) => void;
	/** Set the projects loading state. */
	setProjectsLoading: (loading: boolean) => void;
}

/**
 * An extension widget — multi-line text block displayed above or below the Composer.
 * Set by extensions via `setWidget` fire-and-forget method. Keyed by `widgetKey` —
 * setting `widgetLines` to empty/undefined removes the widget.
 */
export interface ExtensionWidget {
	/** Lines of text to display. */
	lines: string[];
	/** Where to display the widget relative to the Composer. */
	placement: "aboveEditor" | "belowEditor";
}

/**
 * A terminal context attachment — selected text from a terminal to include in a prompt.
 * Added via the "Add to composer" button in the terminal pane.
 */
export interface TerminalContext {
	/** Unique ID for this context (for key and removal). */
	id: string;
	/** Terminal tab name (e.g., "Terminal 1"). */
	terminalLabel: string;
	/** Server-side terminal ID (e.g., "term-1"). */
	terminalId: string;
	/** First selected line number (1-based). */
	lineStart: number;
	/** Last selected line number (1-based). */
	lineEnd: number;
	/** The selected text content (normalized — no \r\n, no leading/trailing newlines). */
	text: string;
}

/** UI state — layout toggles and transient UI state. */
export interface UiSlice {
	/** Whether the sidebar is visible. Defaults to true on desktop, false on mobile. */
	sidebarOpen: boolean;
	/** Whether the settings dialog is open. */
	settingsOpen: boolean;
	/**
	 * Whether the browser/webview window currently has focus.
	 * Tracked via standard browser focus/blur events and document visibility API.
	 * Used for visual dimming (status bar opacity) and notification suppression.
	 */
	isWindowFocused: boolean;
	/**
	 * Text to insert into the Composer. Set by plugin `sendPrompt` (sendImmediately=false).
	 * Composer watches this field and picks up the text, then clears it.
	 * Null when no pending text.
	 */
	pendingComposerText: string | null;
	/**
	 * Image URL to show in the full-size preview modal. Null when modal is closed.
	 * Set by clicking an image in markdown content or composer preview strip.
	 */
	imagePreviewUrl: string | null;
	/** Alt text for the image preview modal. */
	imagePreviewAlt: string;
	/**
	 * Timestamp format preference for in-chat timestamps (turn dividers, etc.).
	 * Kept in Zustand so components re-render when the format changes.
	 * Synced from settings cache by `updateSetting("timestampFormat", ...)`.
	 */
	timestampFormat: TimestampFormat;
	/**
	 * Terminal context attachments pending in the Composer.
	 * Added by "Add to composer" in the terminal pane, consumed on send.
	 * Managed by Composer component (like file mentions and images).
	 */
	pendingTerminalContexts: TerminalContext[];
	/**
	 * Whether the diff panel side panel is open.
	 * Toggled via Ctrl/Cmd+D or the "View Diff" button on turn dividers.
	 */
	diffPanelOpen: boolean;
	/**
	 * File paths to show diffs for in the diff panel.
	 * Populated from a turn divider's `changedFiles` or empty for "all changes".
	 */
	diffPanelFiles: string[];
	/** True while loading diff data from the server. */
	diffPanelLoading: boolean;
	/** The loaded turn diff result, null when not loaded or panel is closed. */
	diffPanelResult: TurnDiffResult | null;
	/** Error message from diff loading, null when no error. */
	diffPanelError: string | null;
	/** Diff render mode — stacked (unified) or split (side-by-side). */
	diffPanelMode: "stacked" | "split";
	/** Currently selected file in the diff panel file tree, null for all files. */
	diffPanelSelectedFile: string | null;

	/**
	 * Whether the bash command input is visible above the Composer.
	 * Toggled via Ctrl+Shift+B or `/bash` slash command.
	 */
	bashInputOpen: boolean;

	/**
	 * Extension widgets keyed by widgetKey.
	 * Displayed above or below the Composer depending on their `placement`.
	 * Set by extensions via `setWidget` fire-and-forget method.
	 */
	extensionWidgets: Map<string, ExtensionWidget>;

	/**
	 * Extension-set title override. When non-null, overrides the computed window title.
	 * Set by extensions via `setTitle` fire-and-forget method. Null to clear (restore default).
	 */
	extensionTitle: string | null;

	/** Toggle the sidebar open/closed. */
	toggleSidebar: () => void;
	/** Set the sidebar open state explicitly. */
	setSidebarOpen: (open: boolean) => void;
	/** Set the settings dialog open state. */
	setSettingsOpen: (open: boolean) => void;
	/** Set the window focus state. */
	setWindowFocused: (focused: boolean) => void;
	/** Set pending text to insert into the Composer. Null to clear. */
	setPendingComposerText: (text: string | null) => void;
	/** Open the image preview modal with the given URL. Null to close. */
	setImagePreview: (url: string | null, alt?: string) => void;
	/** Update the timestamp format preference (triggers re-render of timestamp displays). */
	setTimestampFormat: (format: TimestampFormat) => void;
	/** Add a terminal context attachment to the pending list. Deduplicates by terminal+lines. */
	addTerminalContext: (context: TerminalContext) => void;
	/** Remove a terminal context by ID. */
	removeTerminalContext: (id: string) => void;
	/** Clear all pending terminal contexts. */
	clearTerminalContexts: () => void;
	/** Set the bash input visibility. */
	setBashInputOpen: (open: boolean) => void;
	/** Set or remove an extension widget. Empty/undefined lines removes it. */
	setExtensionWidget: (
		key: string,
		lines: string[] | undefined,
		placement: "aboveEditor" | "belowEditor",
	) => void;
	/** Clear all extension widgets (e.g., on session reset). */
	clearExtensionWidgets: () => void;
	/** Set extension title override. Null to clear (restore default). */
	setExtensionTitle: (title: string | null) => void;
	/** Toggle the diff panel open/closed. */
	toggleDiffPanel: () => void;
	/** Set the diff panel open state explicitly. */
	setDiffPanelOpen: (open: boolean) => void;
	/**
	 * Open the diff panel with specific files. Triggers a diff fetch.
	 * Pass empty array for "all changes since last commit".
	 */
	openDiffPanel: (files: string[]) => void;
	/** Set the diff panel loading state. */
	setDiffPanelLoading: (loading: boolean) => void;
	/** Set the diff panel result. */
	setDiffPanelResult: (result: TurnDiffResult | null) => void;
	/** Set the diff panel error. */
	setDiffPanelError: (error: string | null) => void;
	/** Set the diff render mode (stacked or split). */
	setDiffPanelMode: (mode: "stacked" | "split") => void;
	/** Set the selected file in the diff panel file tree. */
	setDiffPanelSelectedFile: (path: string | null) => void;
}

/** Git state — repository status for the active session's CWD. */
export interface GitSlice {
	/** Current branch name, null if not a git repo or detached HEAD. */
	gitBranch: string | null;
	/** List of changed files (staged, unstaged, untracked). */
	gitChangedFiles: GitChangedFile[];
	/** True if there are uncommitted changes. */
	gitIsDirty: boolean;
	/** True if the CWD is inside a git repository. */
	gitIsRepo: boolean;
	/** Unix timestamp of last status fetch, null if never fetched. */
	gitLastFetched: number | null;
	/** True while fetching git status. */
	gitLoading: boolean;
	/** Whether the git changed files panel is open. */
	gitPanelOpen: boolean;
	/** Path of the file currently selected for diff viewing, null if none. */
	selectedDiffPath: string | null;
	/** Raw unified diff text for the selected file, null if not loaded. */
	selectedDiffContent: string | null;
	/** True while fetching a file diff. */
	diffLoading: boolean;

	/** Set full git status from a git.status response. */
	setGitStatus: (
		isRepo: boolean,
		branch: string | null,
		files: GitChangedFile[],
		isDirty: boolean,
	) => void;
	/** Set the git loading state. */
	setGitLoading: (loading: boolean) => void;
	/** Reset all git state to initial values (e.g., on session change). */
	resetGit: () => void;
	/** Toggle the git panel open/closed. */
	toggleGitPanel: () => void;
	/** Set git panel open state explicitly. */
	setGitPanelOpen: (open: boolean) => void;
	/** Set the selected file diff (path + content). */
	setSelectedDiff: (path: string | null, content: string | null) => void;
	/** Set the diff loading state. */
	setDiffLoading: (loading: boolean) => void;
}

/** Workspace state — loaded session paths for sidebar persistence. */
export interface WorkspacePersistSlice {
	/**
	 * Session file paths the user has explicitly loaded into the sidebar.
	 * Persisted to `~/.pibun/workspace.json` via server.
	 * Running sessions auto-appear; loaded sessions persist across restart.
	 */
	loadedSessionPaths: string[];

	/** Replace the full loaded session paths list (from server fetch). */
	setLoadedSessionPaths: (paths: string[]) => void;
}

/**
 * Tabs state — single-active-session tab management.
 *
 * Only one Pi session runs at a time. Messages live in the MessagesSlice
 * (not cached per-tab). Switching tabs clears messages and loads from Pi.
 */
export interface TabsSlice {
	/** Ordered list of open tabs. */
	tabs: SessionTab[];
	/** ID of the currently active tab, null when no tabs exist. */
	activeTabId: string | null;

	/**
	 * Create a new tab with optional initial values.
	 * Returns the new tab's ID.
	 */
	addTab: (
		partial?: Partial<Pick<SessionTab, "name" | "sessionId" | "cwd" | "model" | "thinkingLevel">>,
	) => string;
	/** Remove a tab by ID. Switches to adjacent tab if active tab is removed. */
	removeTab: (tabId: string) => void;
	/**
	 * Switch to a different tab. Updates activeTabId and sets session metadata
	 * from the target tab. Clears messages/statuses/widgets — the async action
	 * layer loads fresh data from Pi via session.getMessages.
	 */
	switchTab: (tabId: string) => void;
	/** Update a tab's metadata (name, model, streaming state, etc.). */
	updateTab: (tabId: string, updates: Partial<SessionTab>) => void;
	/** Get the currently active tab, or null if no tabs. */
	getActiveTab: () => SessionTab | null;
	/** Sync the active tab's metadata with current session slice state. */
	syncActiveTabState: () => void;
}

/** Maximum number of terminals visible in a single split group. */
export const MAX_TERMINALS_PER_GROUP = 4;

/** A terminal tab — represents one PTY session. */
export interface TerminalTab {
	/** Client-side tab ID (ttab-1, ttab-2, ...). */
	id: string;
	/** Server-side terminal ID (term-1, term-2, ...) from terminal.create. */
	terminalId: string;
	/** Display name for the tab. */
	name: string;
	/** Working directory of this terminal. */
	cwd: string;
	/** True while the shell process is running. */
	isRunning: boolean;
	/**
	 * Group ID for split pane grouping. Terminals with the same `groupId`
	 * are displayed side-by-side in a horizontal split layout.
	 * Each terminal starts with its own unique `groupId` (same as `id`).
	 * Splitting creates a new terminal and assigns it the same `groupId`.
	 */
	groupId: string;
	/**
	 * Session tab that owns this terminal. Terminals are scoped to the session tab
	 * that created them — switching session tabs shows only that tab's terminals.
	 * The TerminalPane filters by `ownerTabId === activeTabId`.
	 */
	ownerTabId: string;
}

/** Terminal state — embedded terminal panel and tabs. */
export interface TerminalSlice {
	/** Whether the terminal panel is visible. */
	terminalPanelOpen: boolean;
	/** Ordered list of terminal tabs. */
	terminalTabs: TerminalTab[];
	/** ID of the active terminal tab, null when no terminals exist. */
	activeTerminalTabId: string | null;

	/** Toggle the terminal panel open/closed. */
	toggleTerminalPanel: () => void;
	/** Set the terminal panel open state explicitly. */
	setTerminalPanelOpen: (open: boolean) => void;
	/** Add a new terminal tab. Returns the tab ID. */
	addTerminalTab: (terminalId: string, cwd: string) => string;
	/** Remove a terminal tab. Switches to adjacent tab if active. */
	removeTerminalTab: (tabId: string) => void;
	/** Set the active terminal tab. */
	setActiveTerminalTabId: (tabId: string | null) => void;
	/** Update a terminal tab's metadata. */
	updateTerminalTab: (tabId: string, updates: Partial<TerminalTab>) => void;
	/** Get the active terminal tab, or null. */
	getActiveTerminalTab: () => TerminalTab | null;
	/** Find a terminal tab by its server-side terminalId. */
	getTerminalTabByTerminalId: (terminalId: string) => TerminalTab | null;
	/**
	 * Add a new terminal tab into the same split group as the active terminal.
	 * If no active terminal exists, creates a new group. Returns the new tab ID.
	 * Enforces `MAX_TERMINALS_PER_GROUP` limit — returns null if group is full.
	 */
	splitTerminalTab: (terminalId: string, cwd: string) => string | null;
}

/** Active plugin panel info — resolved from Plugin + PanelConfig. */
export interface ActivePluginPanel {
	pluginId: string;
	panelId: string;
	title: string;
	icon: string;
	component: string;
	defaultSize: number | null;
}

/** Plugins state — installed plugins and panel visibility. */
export interface PluginsSlice {
	/** List of installed plugins (enabled + disabled, including those with errors). */
	plugins: Plugin[];
	/** True while loading plugins from the server. */
	pluginsLoading: boolean;
	/**
	 * Set of currently visible plugin panels.
	 * Keys are `{pluginId}:{panelId}` (e.g., "prompt-library:main").
	 */
	activePluginPanels: Set<string>;

	/** Set the full plugins list. */
	setPlugins: (plugins: Plugin[]) => void;
	/** Set the loading state. */
	setPluginsLoading: (loading: boolean) => void;
	/** Toggle a plugin panel's visibility. */
	togglePluginPanel: (panelKey: string) => void;
	/** Set a plugin panel's open state explicitly. */
	setPluginPanelOpen: (panelKey: string, open: boolean) => void;
	/** Get active panels filtered by layout position. */
	getActivePluginPanelsByPosition: (position: PluginPanelPosition) => ActivePluginPanel[];
}

// ============================================================================
// Combined AppStore
// ============================================================================

/** Full Zustand store type — union of all slices. */
export type AppStore = ConnectionSlice &
	SessionSlice &
	MessagesSlice &
	ModelsSlice &
	ExtensionUiSlice &
	NotificationsSlice &
	UpdateSlice &
	UiSlice &
	TabsSlice &
	ProjectsSlice &
	WorkspacePersistSlice &
	GitSlice &
	TerminalSlice &
	PluginsSlice;
