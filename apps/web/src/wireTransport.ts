/**
 * Wire WsTransport → Zustand store.
 *
 * Creates the transport singleton and subscribes to push channels:
 * - `pi.event` → dispatches Pi events to store actions (event→state mapping from WEB_UI.md)
 * - `server.welcome` → logs server info
 * - `server.error` → logs errors
 * - Transport state changes → connection slice
 *
 * Call `initTransport()` once at app startup (before React renders).
 * Use `getTransport()` to access the singleton for sending requests.
 */

import { fetchGitStatus } from "@/lib/gitActions";
import { fetchPlugins } from "@/lib/pluginActions";
import { forwardPiEventToPlugins, initPluginMessageBridge } from "@/lib/pluginMessageBridge";
import { addProject, fetchProjects, openProject } from "@/lib/projectActions";
import {
	compactSession,
	fetchSessionList,
	fetchSessionStats,
	startNewSession,
	startSessionInFolder,
} from "@/lib/sessionActions";
import { fetchAndApplySettings } from "@/lib/settingsActions";
import { emitShortcut } from "@/lib/shortcuts";
import {
	closeTab,
	createNewTab,
	switchTabAction,
	updateTabStreamingBySessionId,
} from "@/lib/tabActions";
import { createTerminal } from "@/lib/terminalActions";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { WsTransport } from "@/transport";
import type {
	PiAgentMessage,
	PiEvent,
	PiExtensionUIRequest,
	PiImageContent,
	PiMessageUpdateEvent,
	PiTextContent,
	WsMenuActionData,
	WsPiEventData,
} from "@pibun/contracts";

// ============================================================================
// Singleton
// ============================================================================

let transport: WsTransport | null = null;

/** Get the transport singleton. Throws if not initialized. */
export function getTransport(): WsTransport {
	if (!transport) {
		throw new Error("Transport not initialized — call initTransport() first");
	}
	return transport;
}

// ============================================================================
// Internal State
// ============================================================================

/** Auto-incrementing counter for generating unique message IDs. */
let messageIdCounter = 0;

/** ID of the currently streaming assistant message (for routing deltas). */
let currentAssistantMessageId: string | null = null;

function nextId(prefix: string): string {
	return `${prefix}-${String(++messageIdCounter)}`;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract text content from Pi tool result content blocks. */
function extractText(content: readonly (PiTextContent | PiImageContent)[]): string {
	return content
		.filter((block): block is PiTextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

/** Extract user message content as a plain string. */
function extractUserContent(content: string | readonly (PiTextContent | PiImageContent)[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((block): block is PiTextContent => block.type === "text")
		.map((block) => block.text)
		.join("");
}

/**
 * Create a ChatMessage with defaults for all required fields.
 * Caller provides id, type, content (required) and any overrides.
 */
function makeMessage(
	partial: Pick<ChatMessage, "id" | "type" | "content"> &
		Partial<Omit<ChatMessage, "id" | "type" | "content">>,
): ChatMessage {
	return {
		timestamp: Date.now(),
		thinking: "",
		toolCall: null,
		toolResult: null,
		streaming: false,
		...partial,
	};
}

// ============================================================================
// Pi Event → Zustand Dispatch
// ============================================================================

/**
 * Route a Pi event to the appropriate Zustand store actions.
 *
 * Event → State mapping (from WEB_UI.md):
 * - agent_start → isStreaming = true
 * - agent_end → isStreaming = false
 * - message_start → append ChatMessage (user or assistant)
 * - message_update (text_delta) → append to content
 * - message_update (thinking_delta) → append to thinking
 * - message_end → mark streaming = false
 * - tool_execution_start → append tool_call + tool_result placeholder
 * - tool_execution_update → replace tool output (accumulated, NOT delta)
 * - tool_execution_end → finalize tool result
 * - auto_compaction/retry → system messages
 */
function handlePiEvent(event: PiEvent): void {
	const store = useStore.getState();

	switch (event.type) {
		// ── Agent lifecycle ────────────────────────────────────────────
		case "agent_start":
			store.setIsStreaming(true);
			break;

		case "agent_end":
			store.setIsStreaming(false);
			currentAssistantMessageId = null;
			// Fetch updated session stats (tokens, cost) after each agent turn
			fetchSessionStats();
			// Refresh git status — agent likely modified files
			fetchGitStatus();
			break;

		// ── Message lifecycle ──────────────────────────────────────────
		case "message_start":
			handleMessageStart(event.message);
			break;

		case "message_update":
			handleMessageUpdate(event);
			break;

		case "message_end":
			if (event.message.role === "assistant" && currentAssistantMessageId) {
				store.setMessageStreaming(currentAssistantMessageId, false);
			}
			break;

		// ── Tool execution ─────────────────────────────────────────────
		case "tool_execution_start":
			// Tool call card (shows tool name + args)
			store.appendMessage(
				makeMessage({
					id: event.toolCallId,
					type: "tool_call",
					content: "",
					toolCall: {
						id: event.toolCallId,
						name: event.toolName,
						args: event.args,
					},
				}),
			);
			// Tool result placeholder (updated by execution_update/end)
			store.appendMessage(
				makeMessage({
					id: `result-${event.toolCallId}`,
					type: "tool_result",
					content: "",
					toolResult: { content: "", isError: false },
					streaming: true,
				}),
			);
			break;

		case "tool_execution_update":
			// partialResult is ACCUMULATED (not delta) — replace entire output
			store.updateToolOutput(event.toolCallId, extractText(event.partialResult.content));
			break;

		case "tool_execution_end":
			store.finalizeToolResult(event.toolCallId, extractText(event.result.content), event.isError);
			break;

		// ── Auto-recovery ──────────────────────────────────────────────
		case "auto_compaction_start":
			store.setIsCompacting(true);
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: `⚙️ Context compaction started (reason: ${event.reason})`,
				}),
			);
			break;

		case "auto_compaction_end":
			store.setIsCompacting(false);
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: event.aborted
						? "⚠️ Context compaction aborted"
						: "✅ Context compaction complete",
				}),
			);
			break;

		case "auto_retry_start":
			store.setRetrying(true, event.attempt, event.maxAttempts);
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: `🔄 Retrying (attempt ${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
				}),
			);
			break;

		case "auto_retry_end":
			store.setRetrying(false);
			if (event.success) {
				store.appendMessage(
					makeMessage({
						id: nextId("system"),
						type: "system",
						content: "✅ Retry succeeded",
					}),
				);
			} else if (event.finalError) {
				store.appendMessage(
					makeMessage({
						id: nextId("system"),
						type: "system",
						content: `❌ Retry failed after ${event.attempt} attempts: ${event.finalError}`,
					}),
				);
				store.setLastError(`Retry failed: ${event.finalError}`);
			}
			break;

		// ── Turn events — no state update needed ───────────────────────
		case "turn_start":
		case "turn_end":
			break;

		// ── Extension events ───────────────────────────────────────────
		case "extension_ui_request":
			handleExtensionUiRequest(event);
			break;

		case "extension_error":
			console.error(
				`[PiBun] Extension error: ${event.extensionPath} — ${event.event}: ${event.error}`,
			);
			store.setLastError(`Extension error: ${event.error}`);
			break;
	}
}

/** Handle message_start: create a ChatMessage from the Pi message. */
function handleMessageStart(message: PiAgentMessage): void {
	const store = useStore.getState();

	if (message.role === "user") {
		store.appendMessage(
			makeMessage({
				id: nextId("user"),
				type: "user",
				content: extractUserContent(message.content),
				timestamp: message.timestamp,
			}),
		);
	} else if (message.role === "assistant") {
		const id = nextId("assistant");
		currentAssistantMessageId = id;
		store.appendMessage(
			makeMessage({
				id,
				type: "assistant",
				content: "",
				timestamp: message.timestamp,
				streaming: true,
			}),
		);
	}
	// toolResult and bashExecution roles don't create standalone UI messages
}

/** Handle message_update: route assistant message streaming deltas. */
function handleMessageUpdate(event: PiMessageUpdateEvent): void {
	if (!currentAssistantMessageId) return;

	const store = useStore.getState();
	const ame = event.assistantMessageEvent;

	switch (ame.type) {
		case "text_delta":
			store.appendToContent(currentAssistantMessageId, ame.delta);
			break;

		case "thinking_delta":
			store.appendToThinking(currentAssistantMessageId, ame.delta);
			break;

		case "done":
			// Mark streaming complete (message_end will also do this, but be safe)
			store.setMessageStreaming(currentAssistantMessageId, false);
			break;

		case "error":
			// Mark streaming complete and surface the error
			store.setMessageStreaming(currentAssistantMessageId, false);
			if (ame.reason === "error") {
				store.setLastError("Assistant response ended with an error");
			}
			// "aborted" reason is expected (user pressed abort) — no error banner
			break;

		// toolcall_end: tool_execution_start will create the tool_call card
		// Other sub-events: no state update needed
		case "toolcall_end":
		case "start":
		case "text_start":
		case "text_end":
		case "thinking_start":
		case "thinking_end":
		case "toolcall_start":
		case "toolcall_delta":
			break;
	}
}

// ============================================================================
// Extension UI Handling
// ============================================================================

/**
 * Handle extension_ui_request events.
 *
 * Dialog requests (select, confirm, input, editor) are set on the store's
 * `pendingExtensionUi` field, which triggers the ExtensionDialog modal.
 * Pi BLOCKS until we respond — the dialog must be rendered promptly (MEMORY #14).
 *
 * Fire-and-forget requests (notify, setStatus, setWidget, setTitle, set_editor_text)
 * are handled inline — no response needed.
 */
function handleExtensionUiRequest(event: PiExtensionUIRequest): void {
	const store = useStore.getState();

	switch (event.method) {
		// Dialog types — block Pi, require response
		case "select":
		case "confirm":
		case "input":
		case "editor":
			store.setPendingExtensionUi(event);
			break;

		// Fire-and-forget: notify → toast notification
		case "notify":
			store.addToast(event.message, event.notifyType ?? "info");
			break;

		// Fire-and-forget: setStatus → persistent status indicator
		case "setStatus":
			store.setExtensionStatus(event.statusKey, event.statusText);
			break;

		// Fire-and-forget: other types — log only (no UI for these yet)
		case "setWidget":
		case "setTitle":
		case "set_editor_text":
			console.log(`[PiBun] Extension ${event.method}:`, event);
			break;
	}
}

// ============================================================================
// Open Folder / Open Recent Helpers
// ============================================================================

/**
 * Open a folder as a project: add to the project list (if not present),
 * then open it (switch to existing tab or create new one).
 *
 * Used by:
 * - `file.open-folder` menu action (Cmd+O — native folder picker)
 * - 2.8: Ensures the opened folder is always tracked as a project.
 */
async function openFolderAsProject(folderPath: string): Promise<void> {
	const project = await addProject(folderPath);
	if (project) {
		await openProject(project);
	} else {
		// Fallback if addProject failed — just start a session
		await startSessionInFolder(folderPath);
	}
	await fetchSessionList();
}

/**
 * Open a recent project from the desktop "Open Recent" menu.
 *
 * Looks up the project by CWD in the store. If found, uses openProject()
 * for switch-or-create behavior. If the project was removed but still
 * in the menu, re-adds it and opens.
 */
async function openRecentProject(cwd: string): Promise<void> {
	const currentStore = useStore.getState();
	const normalizedCwd = cwd.replace(/\/$/, "");

	const project = currentStore.projects.find((p) => p.cwd.replace(/\/$/, "") === normalizedCwd);

	if (project) {
		await openProject(project);
	} else {
		// Project was removed but still in Open Recent — re-add and open
		const newProject = await addProject(cwd);
		if (newProject) {
			await openProject(newProject);
		} else {
			await startSessionInFolder(cwd);
		}
	}
	await fetchSessionList();
}

// ============================================================================
// Menu Action Dispatch (desktop native menus → web app)
// ============================================================================

/**
 * Handle a native menu action forwarded from the desktop main process
 * via the `menu.action` WebSocket push channel.
 *
 * Maps dot-namespaced action strings to the same operations triggered
 * by keyboard shortcuts and UI buttons. Actions that map to UI toggles
 * (sidebar, model selector, thinking selector) use the shortcut event bus.
 * Actions that trigger operations (new session, abort, compact) call the
 * appropriate async functions directly.
 */
function handleMenuAction(data: WsMenuActionData): void {
	const { action } = data;
	const store = useStore.getState();

	switch (action) {
		// ── File ──────────────────────────────────────────────────
		case "file.new-session":
			startNewSession()
				.then(() => fetchSessionList())
				.catch((err: unknown) => {
					console.error("[Menu] Failed to create new session:", err);
				});
			break;

		case "file.new-tab":
			createNewTab().catch((err: unknown) => {
				console.error("[Menu] Failed to create new tab:", err);
			});
			break;

		case "file.close-tab": {
			if (store.tabs.length > 1 && store.activeTabId) {
				closeTab(store.activeTabId).catch((err: unknown) => {
					console.error("[Menu] Failed to close tab:", err);
				});
			}
			break;
		}

		case "file.open-folder": {
			// Extract the folder path from the data payload.
			// 2.8: Also adds to the project list if not already present.
			const folderPath = data.data?.folderPath;
			if (typeof folderPath === "string" && folderPath) {
				openFolderAsProject(folderPath).catch((err: unknown) => {
					console.error("[Menu] Failed to open folder:", err);
				});
			}
			break;
		}

		case "file.open-recent": {
			// Open a recent project from the desktop "Open Recent" submenu.
			// Uses openProject() for switch-or-create behavior.
			const recentPath = data.data?.folderPath;
			if (typeof recentPath === "string" && recentPath) {
				openRecentProject(recentPath).catch((err: unknown) => {
					console.error("[Menu] Failed to open recent project:", err);
				});
			}
			break;
		}

		// ── View ─────────────────────────────────────────────────
		case "view.toggle-sidebar":
			emitShortcut("toggleSidebar");
			break;

		case "view.toggle-git-panel":
			emitShortcut("toggleGitPanel");
			useStore.getState().toggleGitPanel();
			break;

		case "view.toggle-terminal": {
			emitShortcut("toggleTerminal");
			const termStore = useStore.getState();
			if (termStore.terminalPanelOpen) {
				termStore.setTerminalPanelOpen(false);
			} else if (termStore.terminalTabs.length > 0) {
				termStore.setTerminalPanelOpen(true);
			} else {
				createTerminal().catch((err: unknown) => {
					console.error("[Menu] Failed to create terminal:", err);
				});
			}
			break;
		}

		case "view.next-tab": {
			if (store.tabs.length > 1 && store.activeTabId) {
				const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
				const nextIdx = idx >= store.tabs.length - 1 ? 0 : idx + 1;
				const nextTab = store.tabs[nextIdx];
				if (nextTab) {
					switchTabAction(nextTab.id).catch((err: unknown) => {
						console.error("[Menu] Failed to switch to next tab:", err);
					});
				}
			}
			break;
		}

		case "view.prev-tab": {
			if (store.tabs.length > 1 && store.activeTabId) {
				const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
				const prevIdx = idx <= 0 ? store.tabs.length - 1 : idx - 1;
				const prevTab = store.tabs[prevIdx];
				if (prevTab) {
					switchTabAction(prevTab.id).catch((err: unknown) => {
						console.error("[Menu] Failed to switch to previous tab:", err);
					});
				}
			}
			break;
		}

		// ── Session ──────────────────────────────────────────────
		case "session.abort":
			if (store.isStreaming) {
				getTransport()
					.request("session.abort")
					.catch((err: unknown) => {
						const msg = err instanceof Error ? err.message : String(err);
						useStore.getState().setLastError(`Failed to abort: ${msg}`);
					});
			}
			break;

		case "session.compact":
			compactSession().catch((err: unknown) => {
				console.error("[Menu] Failed to compact:", err);
			});
			break;

		case "session.switch-model":
			emitShortcut("toggleModelSelector");
			break;

		case "session.set-thinking":
			emitShortcut("toggleThinkingSelector");
			break;

		case "session.export":
			emitShortcut("toggleExportDialog");
			break;

		default:
			console.log(`[Menu] Unhandled menu action: ${action}`);
			break;
	}
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the WebSocket transport and wire it to the Zustand store.
 *
 * - Subscribes to `pi.event` → dispatches to store actions
 * - Subscribes to `server.welcome` / `server.error` → logs
 * - Subscribes to `menu.action` → dispatches desktop menu actions
 * - Syncs transport state → connection slice
 *
 * Call once at app startup. Returns a cleanup function.
 */
export function initTransport(): () => void {
	if (transport) {
		console.warn("[PiBun] Transport already initialized");
		return () => {};
	}

	transport = new WsTransport();
	const cleanups: Array<() => void> = [];

	// Plugin message bridge — listens for postMessage from plugin iframes
	cleanups.push(initPluginMessageBridge());

	// Transport state → connection slice
	cleanups.push(
		transport.onStateChange((state) => {
			const store = useStore.getState();
			store.setConnectionStatus(state);
			store.setReconnectAttempt(transport?.currentReconnectAttempt ?? 0);
		}),
	);

	// pi.event → Zustand store (unwrap sessionId-tagged envelope)
	cleanups.push(
		transport.subscribe("pi.event", (data: WsPiEventData) => {
			const store = useStore.getState();
			const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
			const activeSessionId = activeTab?.sessionId ?? store.sessionId;

			// If event is for the active tab's session (or no tabs exist yet), dispatch normally
			if (!data.sessionId || !activeSessionId || data.sessionId === activeSessionId) {
				handlePiEvent(data.event);
				// Forward Pi events to subscribed plugin iframes
				forwardPiEventToPlugins(data.event);
				// Sync active tab metadata with current streaming state
				store.syncActiveTabState();
			} else {
				// Event is for a background tab — update tab's streaming indicator only
				if (data.event.type === "agent_start") {
					updateTabStreamingBySessionId(data.sessionId, true);
				} else if (data.event.type === "agent_end") {
					updateTabStreamingBySessionId(data.sessionId, false);
					// Optimistically mark background tab as git-dirty — agent likely modified files.
					// Actual status will be fetched when the tab becomes active.
					const bgTab = store.tabs.find((t) => t.sessionId === data.sessionId);
					if (bgTab) {
						store.updateTab(bgTab.id, { gitDirty: true });
					}
				}
			}
		}),
	);

	// server.welcome → log + fetch session list + fetch projects + git status
	cleanups.push(
		transport.subscribe("server.welcome", (data) => {
			console.log(`[PiBun] Connected to server — cwd: ${data.cwd}, version: ${data.version}`);
			// Fetch available sessions for the sidebar
			fetchSessionList();
			// Fetch saved projects for the sidebar
			fetchProjects();
			// Fetch initial git status for the active session
			fetchGitStatus();
			// Fetch server-persisted settings (theme, etc.) and apply
			fetchAndApplySettings();
			// Fetch installed plugins
			fetchPlugins();
		}),
	);

	// server.error → store + log
	cleanups.push(
		transport.subscribe("server.error", (data) => {
			console.error(`[PiBun] Server error: ${data.message}`);
			useStore.getState().setLastError(data.message);
		}),
	);

	// menu.action → dispatch native menu actions from desktop
	cleanups.push(transport.subscribe("menu.action", handleMenuAction));

	// app.update → update slice (auto-updater status from desktop)
	cleanups.push(
		transport.subscribe("app.update", (data) => {
			console.log(`[PiBun] Update status: ${data.status} — ${data.message}`);
			useStore
				.getState()
				.setUpdateState(data.status, data.message, data.newVersion, data.progress, data.error);
		}),
	);

	// terminal.exit → mark terminal tab as not running
	cleanups.push(
		transport.subscribe("terminal.exit", (data) => {
			const store = useStore.getState();
			const tab = store.getTerminalTabByTerminalId(data.terminalId);
			if (tab) {
				store.updateTerminalTab(tab.id, { isRunning: false });
			}
		}),
	);

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
		transport?.dispose();
		transport = null;
		currentAssistantMessageId = null;
		messageIdCounter = 0;
	};
}
