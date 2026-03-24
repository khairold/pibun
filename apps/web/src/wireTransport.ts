/**
 * Wire WsTransport → Zustand store.
 *
 * Creates the transport singleton and subscribes to push channels:
 * - `pi.event` → dispatches Pi events to store actions (event→state mapping below)
 * - `server.welcome` → logs server info
 * - `server.error` → logs errors
 * - Transport state changes → connection slice
 *
 * Call `initTransport()` once at app startup (before React renders).
 * Use `getTransport()` to access the singleton for sending requests.
 */

import {
	addProject,
	createTerminal,
	fetchAndApplyKeybindings,
	fetchAndApplySettings,
	fetchGitStatus,
	fetchPlugins,
	fetchProjects,
	initComposerDraftPersistence,
	initUiPersistence,
	openProject,
	restorePersistedUiState,
} from "@/lib/appActions";
import { forwardPiEventToPlugins, initPluginMessageBridge } from "@/lib/pluginMessageBridge";
import {
	compactSession,
	fetchSessionList,
	fetchSessionStats,
	startNewSession,
	startSessionInFolder,
} from "@/lib/sessionActions";
import { switchTabAction } from "@/lib/tabActions";
import { emitShortcut, formatDuration } from "@/lib/utils";
import { addLoadedSession, fetchLoadedSessionPaths } from "@/lib/workspaceActions";
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
	WsContextMenuActionData,
	WsMenuActionData,
	WsPiEventData,
	WsSessionStatusData,
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

/**
 * Show a native context menu via the desktop main process.
 *
 * Sends the menu items to the server (`app.showContextMenu`), which forwards
 * to the Electrobun main process. When the user clicks an item, the result
 * arrives via the `context-menu.action` push channel and is dispatched to
 * the `onAction` callback.
 *
 * Only works in desktop mode. In browser mode, the server returns an error —
 * callers should catch this and fall back to a custom HTML context menu.
 *
 * @param items - Context menu items to display.
 * @param onAction - Callback invoked with the clicked item's action and data.
 */
export async function showNativeContextMenu(
	items: import("@pibun/contracts").ContextMenuItem[],
	onAction: (data: WsContextMenuActionData) => void,
): Promise<void> {
	const t = getTransport();
	contextMenuActionHandler = onAction;
	try {
		await t.request("app.showContextMenu", { items });
	} catch {
		// Browser mode or desktop unavailable — clear handler, let caller handle fallback
		contextMenuActionHandler = null;
		throw new Error("Native context menu is not available");
	}
}

// ============================================================================
// Internal State
// ============================================================================

/** Auto-incrementing counter for generating unique message IDs. */
let messageIdCounter = 0;

/** ID of the currently streaming assistant message (for routing deltas). */
let currentAssistantMessageId: string | null = null;

/**
 * Registered context menu action handler.
 *
 * When the web app calls `showNativeContextMenu()`, it passes an `onAction`
 * callback. The callback is stored here and invoked when the `context-menu.action`
 * push arrives from the desktop process. Only one context menu can be active
 * at a time (native OS limitation), so a single callback slot is sufficient.
 */
let contextMenuActionHandler: ((data: WsContextMenuActionData) => void) | null = null;

function nextId(prefix: string): string {
	return `${prefix}-${String(++messageIdCounter)}`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a duration in milliseconds into a human-readable string.
 * - Under 60s: "Xs" (e.g., "12s")
 * - 60s+: "Xm Ys" (e.g., "2m 15s")
 * - Under 1s: "<1s"
 */
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
 * Event → State mapping:
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
			store.setAgentStartedAt(Date.now());
			// Clear any previous health issue — agent is working
			if (store.providerHealth) {
				store.setProviderHealth(null);
			}
			break;

		case "agent_end": {
			// Insert completion summary with elapsed time
			const startedAt = store.agentStartedAt;
			if (startedAt > 0) {
				const elapsedMs = Date.now() - startedAt;
				store.appendMessage(
					makeMessage({
						id: nextId("completion"),
						type: "system",
						content: `✓ Worked for ${formatDuration(elapsedMs)}`,
					}),
				);
			}
			store.setIsStreaming(false);
			store.setAgentStartedAt(0);
			currentAssistantMessageId = null;
			// Fetch updated session stats (tokens, cost) after each agent turn
			fetchSessionStats();
			// Refresh git status — agent likely modified files
			fetchGitStatus();
			break;
		}

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
			store.setRetrying(true, event.attempt, event.maxAttempts, event.delayMs);
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
				// Mark active tab as error — will be preserved by deriveTabStatus
				if (store.activeTabId) {
					store.updateTab(store.activeTabId, { status: "error" });
				}
				// Set persistent health issue for repeated model errors
				store.setProviderHealth({
					kind: "repeated_model_errors",
					message: `Retry failed after ${event.attempt} attempts: ${event.finalError}`,
					sessionId: store.sessionId,
					detectedAt: Date.now(),
				});
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

		case "extension_error": {
			console.error(
				`[PiBun] Extension error: ${event.extensionPath} — ${event.event}: ${event.error}`,
			);
			const extName = event.extensionPath.split("/").pop() ?? event.extensionPath;
			store.addToast(`Extension "${extName}": ${event.error}`, "warning");
			break;
		}
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

		// Fire-and-forget: setWidget → extension widget blocks near composer
		case "setWidget":
			store.setExtensionWidget(
				event.widgetKey,
				event.widgetLines,
				event.widgetPlacement ?? "aboveEditor",
			);
			break;

		// Fire-and-forget: setTitle → override window title
		case "setTitle": {
			store.setExtensionTitle(event.title);
			document.title = event.title;
			// Also update native window title (fire-and-forget)
			try {
				getTransport()
					.request("app.setWindowTitle", { title: event.title })
					.catch(() => {});
			} catch {
				// Transport not initialized — ignore
			}
			break;
		}

		// Fire-and-forget: set_editor_text → prefill composer text
		case "set_editor_text":
			store.setPendingComposerText(event.text);
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
			const hasOwnedTerms = termStore.terminalTabs.some(
				(t) => t.ownerTabId === termStore.activeTabId,
			);
			if (termStore.terminalPanelOpen) {
				termStore.setTerminalPanelOpen(false);
			} else if (hasOwnedTerms) {
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

		// ── Tray ─────────────────────────────────────────────────
		case "tray.focus-session": {
			// Focus a specific session by finding the tab with that sessionId.
			const targetSessionId = data.data?.sessionId;
			if (typeof targetSessionId === "string" && targetSessionId) {
				const targetTab = store.tabs.find((t) => t.sessionId === targetSessionId);
				if (targetTab) {
					switchTabAction(targetTab.id).catch((err: unknown) => {
						console.error("[Tray] Failed to switch to session tab:", err);
					});
				}
			}
			break;
		}

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

	// Restore persisted UI state (sidebar, active tab) before React renders
	restorePersistedUiState();

	// Start UI state persistence (debounced localStorage writes + beforeunload flush)
	cleanups.push(initUiPersistence());

	// Start composer draft persistence (restore from localStorage + beforeunload flush)
	cleanups.push(initComposerDraftPersistence());

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
	// Single-session model: only one Pi process runs at a time, so all events
	// go to handlePiEvent. Stale events from an old session (during switch) are skipped.
	cleanups.push(
		transport.subscribe("pi.event", (data: WsPiEventData) => {
			const store = useStore.getState();
			const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
			const activeSessionId = activeTab?.sessionId ?? store.sessionId;

			// Skip stale events from an old session (can arrive briefly during session switch)
			if (data.sessionId && activeSessionId && data.sessionId !== activeSessionId) {
				console.debug(
					`[PiBun] Skipping stale event from old session ${data.sessionId} (active: ${activeSessionId})`,
				);
				return;
			}

			handlePiEvent(data.event);
			// Forward Pi events to subscribed plugin iframes
			forwardPiEventToPlugins(data.event);
			// Sync active tab metadata with current streaming state
			store.syncActiveTabState();
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
			// Fetch user keybinding overrides
			fetchAndApplyKeybindings();
			// Fetch installed plugins
			fetchPlugins();
			// Fetch loaded session paths for sidebar persistence
			fetchLoadedSessionPaths();
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

	// context-menu.action → dispatch to registered context menu handler
	cleanups.push(
		transport.subscribe("context-menu.action", (data: WsContextMenuActionData) => {
			if (contextMenuActionHandler) {
				const handler = contextMenuActionHandler;
				contextMenuActionHandler = null; // One-shot: clear after invocation
				handler(data);
			}
		}),
	);

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

	// session.status → provider health (Pi process crash)
	cleanups.push(
		transport.subscribe("session.status", (data: WsSessionStatusData) => {
			if (data.status === "crashed") {
				const store = useStore.getState();

				// Auto-transition: add crashed session to loaded list so it stays in sidebar.
				// Match by piSessionId: data.sessionId is PiBun manager ID, but session list
				// uses Pi UUIDs. Find the tab first, then use its piSessionId to match.
				const crashedTabForLookup = store.tabs.find((t) => t.sessionId === data.sessionId);
				if (crashedTabForLookup?.piSessionId) {
					const piUuid = crashedTabForLookup.piSessionId;
					const sessionSummary = store.sessionList.find((s) => s.sessionId === piUuid);
					if (sessionSummary) {
						addLoadedSession(sessionSummary.sessionPath);
					}
				}

				// Clear streaming state for the crashed session's tab
				const crashedTab = store.tabs.find((t) => t.sessionId === data.sessionId);
				if (crashedTab) {
					store.updateTab(crashedTab.id, {
						isStreaming: false,
						status: "error",
						sessionId: null,
					});
				}

				// If the crashed session is the active one, clear session state
				if (store.sessionId === data.sessionId) {
					store.setSessionId(null);
					store.setIsStreaming(false);
				}

				// Set the persistent health issue
				store.setProviderHealth({
					kind: "process_crashed",
					message: data.message,
					sessionId: data.sessionId,
					detectedAt: Date.now(),
				});
			}
		}),
	);

	// Window focus/blur tracking — used for visual dimming and notification suppression.
	// Uses both window focus/blur events (reliable for Electrobun webview and browser tabs)
	// and document visibilitychange (fires when tab is hidden/shown or window minimized).
	const handleWindowFocus = () => useStore.getState().setWindowFocused(true);
	const handleWindowBlur = () => useStore.getState().setWindowFocused(false);
	const handleVisibilityChange = () => {
		useStore.getState().setWindowFocused(!document.hidden);
	};

	window.addEventListener("focus", handleWindowFocus);
	window.addEventListener("blur", handleWindowBlur);
	document.addEventListener("visibilitychange", handleVisibilityChange);

	cleanups.push(() => {
		window.removeEventListener("focus", handleWindowFocus);
		window.removeEventListener("blur", handleWindowBlur);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
	});

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
