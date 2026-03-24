/**
 * Session management actions — async operations that coordinate
 * transport calls with Zustand store updates.
 *
 * Used by UI components (New Session button, Fork dialog, etc.)
 * to perform session lifecycle operations cleanly.
 *
 * Pattern: call transport → update store → refresh state.
 * Follows thin bridge principle — Pi handles all session state internally,
 * we just clear our local message cache and re-fetch.
 */

import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { getTransport } from "@/wireTransport";
import type {
	PiAgentMessage,
	PiAssistantMessage,
	PiBashExecutionMessage,
	PiImageContent,
	PiTextContent,
	PiThinkingContent,
	PiToolCall,
	PiToolResultMessage,
	WsForkableMessage,
	WsSessionSummary,
} from "@pibun/contracts";

/** Extract a user-friendly error message from any thrown value. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// ============================================================================
// Tab ↔ Session Helpers (inline to avoid circular dep with tabActions.ts)
// ============================================================================

/**
 * Ensure at least one tab exists. Creates the initial tab if needed.
 * Called when the first session starts so that tab switching is possible.
 */
function ensureTabExists(): void {
	const store = useStore.getState();
	if (store.tabs.length > 0 && store.activeTabId) return;

	const tabId = store.addTab();
	store.switchTab(tabId);
}

/**
 * Link a session ID to the currently active tab.
 * Called after session.start to associate the Pi session with its tab.
 */
function linkSessionToActiveTab(sessionId: string): void {
	const store = useStore.getState();
	if (!store.activeTabId) return;
	store.updateTab(store.activeTabId, { sessionId });
}

// ============================================================================
// Pi Message → ChatMessage Conversion
// ============================================================================

/** Auto-incrementing counter for history message IDs. */
let historyIdCounter = 0;

function nextHistoryId(prefix: string): string {
	return `hist-${prefix}-${String(++historyIdCounter)}`;
}

/** Extract text from content blocks. */
function extractTextBlocks(content: readonly (PiTextContent | PiImageContent)[]): string {
	return content
		.filter((b): b is PiTextContent => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

/** Extract text from user message content (string or content blocks). */
function extractUserText(content: string | readonly (PiTextContent | PiImageContent)[]): string {
	if (typeof content === "string") return content;
	return extractTextBlocks(content);
}

/**
 * Convert Pi's `PiAgentMessage[]` (from `get_messages`) into `ChatMessage[]`
 * suitable for the Zustand store.
 *
 * Assistant messages may contain interleaved text, thinking, and tool_call blocks.
 * We extract text + thinking into the assistant ChatMessage, and emit separate
 * tool_call / tool_result entries for each tool call (matched with the following
 * toolResult message in the history).
 */
function convertPiMessages(piMessages: PiAgentMessage[]): ChatMessage[] {
	const result: ChatMessage[] = [];

	for (const msg of piMessages) {
		if (msg.role === "user") {
			result.push({
				id: nextHistoryId("user"),
				timestamp: msg.timestamp,
				type: "user",
				content: extractUserText(msg.content),
				thinking: "",
				toolCall: null,
				toolResult: null,
				streaming: false,
			});
		} else if (msg.role === "assistant") {
			const aMsg = msg as PiAssistantMessage;
			// Extract text and thinking from content blocks
			const textParts: string[] = [];
			const thinkingParts: string[] = [];
			const toolCalls: PiToolCall[] = [];

			for (const block of aMsg.content) {
				if (block.type === "text") {
					textParts.push((block as PiTextContent).text);
				} else if (block.type === "thinking") {
					thinkingParts.push((block as PiThinkingContent).thinking);
				} else if (block.type === "toolCall") {
					toolCalls.push(block as PiToolCall);
				}
			}

			// Assistant text/thinking message
			result.push({
				id: nextHistoryId("assistant"),
				timestamp: aMsg.timestamp,
				type: "assistant",
				content: textParts.join("\n"),
				thinking: thinkingParts.join("\n"),
				toolCall: null,
				toolResult: null,
				streaming: false,
			});

			// Tool call cards
			for (const tc of toolCalls) {
				result.push({
					id: tc.id,
					timestamp: aMsg.timestamp,
					type: "tool_call",
					content: "",
					thinking: "",
					toolCall: {
						id: tc.id,
						name: tc.name,
						args: tc.arguments,
					},
					toolResult: null,
					streaming: false,
				});
			}
		} else if (msg.role === "toolResult") {
			const trMsg = msg as PiToolResultMessage;
			result.push({
				id: `result-${trMsg.toolCallId}`,
				timestamp: trMsg.timestamp,
				type: "tool_result",
				content: extractTextBlocks(trMsg.content),
				thinking: "",
				toolCall: null,
				toolResult: {
					content: extractTextBlocks(trMsg.content),
					isError: trMsg.isError,
				},
				streaming: false,
			});
		} else if (msg.role === "bashExecution") {
			const beMsg = msg as PiBashExecutionMessage;
			result.push({
				id: nextHistoryId("bash"),
				timestamp: beMsg.timestamp,
				type: "system",
				content: `$ ${beMsg.command}\n${beMsg.output}`,
				thinking: "",
				toolCall: null,
				toolResult: null,
				streaming: false,
			});
		}
	}

	return result;
}

/**
 * Fetch the conversation history from Pi and populate the store.
 *
 * Called after session switch, fork, or folder open to load the
 * existing messages for display.
 */
export async function loadSessionMessages(): Promise<void> {
	try {
		const result = await getTransport().request("session.getMessages");
		const chatMessages = convertPiMessages(result.messages);
		const store = useStore.getState();
		store.clearMessages();
		for (const msg of chatMessages) {
			store.appendMessage(msg);
		}
	} catch (err) {
		console.warn("[sessionActions] Failed to load session messages:", err);
	}
}

/**
 * Ensure a session is active. If none exists, starts one.
 * Also ensures a tab exists and is associated with the session.
 * Returns true if a session is ready, false if start failed.
 */
async function ensureSession(): Promise<boolean> {
	const { sessionId, setSessionId, setLastError } = useStore.getState();
	if (sessionId) return true;

	try {
		const result = await getTransport().request("session.start", {});
		setSessionId(result.sessionId);
		// Multi-session: set as active session so subsequent requests target it
		getTransport().setActiveSession(result.sessionId);
		// Ensure a tab exists and associate it with this session
		ensureTabExists();
		linkSessionToActiveTab(result.sessionId);
		// Clear any previous health issue — session started successfully
		useStore.getState().setProviderHealth(null);
		return true;
	} catch (err) {
		const msg = `Failed to start session: ${errorMessage(err)}`;
		setLastError(msg);
		useStore.getState().setProviderHealth({
			kind: "session_start_failed",
			message: msg,
			sessionId: null,
			detectedAt: Date.now(),
		});
		return false;
	}
}

/**
 * Refresh session state from Pi after a session change (new, fork, switch).
 * Fetches get_state to update model/thinking/streaming/name info.
 */
export async function refreshSessionState(): Promise<void> {
	try {
		const result = await getTransport().request("session.getState");
		const store = useStore.getState();
		if (result.state.model) {
			store.setModel(result.state.model);
		}
		store.setThinkingLevel(result.state.thinkingLevel);
		store.setIsStreaming(result.state.isStreaming);
		store.setSessionName(result.state.sessionName ?? null);
		store.setSessionFile(result.state.sessionFile ?? null);
	} catch (err) {
		console.warn("[sessionActions] Failed to refresh state:", err);
	}
}

/**
 * Start a new session within the current Pi process.
 *
 * Flow:
 * 1. Ensure a session exists (spawns Pi process if needed)
 * 2. Call session.new → Pi creates a fresh session
 * 3. Clear local messages
 * 4. Refresh session state
 *
 * Returns true on success, false on failure.
 */
export async function startNewSession(): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	const ready = await ensureSession();
	if (!ready) return false;

	try {
		await getTransport().request("session.new");
		// Clear local messages — Pi starts a fresh session internally
		store.clearMessages();
		store.setIsStreaming(false);
		// Clear any previous health issue — new session started successfully
		store.setProviderHealth(null);
		// Refresh state to pick up new session info
		await refreshSessionState();
		return true;
	} catch (err) {
		store.setLastError(`Failed to create new session: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Get the list of messages that can be forked from.
 *
 * Returns the list on success, null on failure.
 */
export async function getForkableMessages(): Promise<WsForkableMessage[] | null> {
	const store = useStore.getState();
	const ready = await ensureSession();
	if (!ready) return null;

	try {
		const result = await getTransport().request("session.getForkMessages");
		return result.messages;
	} catch (err) {
		store.setLastError(`Failed to get fork messages: ${errorMessage(err)}`);
		return null;
	}
}

/**
 * Fetch session stats (tokens, cost) from Pi and update the store.
 *
 * Called after agent_end to show updated usage. Also callable on demand
 * (e.g., by a refresh button in the stats display).
 *
 * Returns true on success, false on failure (silent — doesn't show error banner).
 */
export async function fetchSessionStats(): Promise<boolean> {
	const store = useStore.getState();
	if (!store.sessionId) return false;

	try {
		const result = await getTransport().request("session.getStats");
		store.setStats(result.stats);
		return true;
	} catch (err) {
		console.warn("[sessionActions] Failed to fetch stats:", err);
		return false;
	}
}

/**
 * Manually compact the context window.
 *
 * Sets isCompacting state, calls session.compact, waits for response.
 * The auto_compaction_start/end events in wireTransport also update
 * isCompacting, so the state stays in sync for both manual and auto compaction.
 *
 * Returns true on success, false on failure.
 */
export async function compactSession(customInstructions?: string): Promise<boolean> {
	const store = useStore.getState();
	if (!store.sessionId) return false;

	store.setIsCompacting(true);
	try {
		const params: Record<string, string> = {};
		if (customInstructions) {
			params.customInstructions = customInstructions;
		}
		await getTransport().request("session.compact", params);
		return true;
	} catch (err) {
		store.setLastError(`Failed to compact context: ${errorMessage(err)}`);
		return false;
	} finally {
		// auto_compaction_end event will set isCompacting=false,
		// but if the command itself fails (before events fire), clear it here
		store.setIsCompacting(false);
	}
}

/**
 * Fork the conversation from a specific message.
 *
 * Flow:
 * 1. Call session.fork with the entryId
 * 2. Clear local messages
 * 3. Fetch the forked conversation's messages from Pi
 * 4. Rebuild local message state
 *
 * Returns true on success, false on failure.
 */
export async function forkFromMessage(entryId: string): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	try {
		await getTransport().request("session.fork", { entryId });
		store.setIsStreaming(false);
		// Refresh state
		await refreshSessionState();
		// Load the forked session's message history
		await loadSessionMessages();
		return true;
	} catch (err) {
		store.setLastError(`Failed to fork session: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Fetch the list of available sessions from the server.
 *
 * The server reads `~/.pi/agent/sessions/` for the current CWD.
 * Updates the store's sessionList.
 *
 * Returns the session list on success, empty array on failure.
 */
export async function fetchSessionList(): Promise<WsSessionSummary[]> {
	const store = useStore.getState();
	store.setSessionListLoading(true);

	try {
		const result = await getTransport().request("session.listSessions");
		store.setSessionList(result.sessions);
		return result.sessions;
	} catch (err) {
		console.warn("[sessionActions] Failed to fetch session list:", err);
		return [];
	} finally {
		store.setSessionListLoading(false);
	}
}

/**
 * Start a new session in a specific folder (CWD).
 *
 * Used when the user selects a folder via the native "Open Folder…" dialog.
 * Stops the current session, then starts a fresh one with the given CWD.
 *
 * Flow:
 * 1. Abort if streaming
 * 2. Stop current session (if any)
 * 3. Start new session with the specified CWD
 * 4. Clear messages, refresh state
 *
 * Returns true on success, false on failure.
 */
export async function startSessionInFolder(cwd: string): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	// Stop current session — we're switching to a different CWD
	// which requires a new Pi process
	if (store.sessionId) {
		try {
			await getTransport().request("session.stop");
		} catch {
			// Continue even if stop fails
		}
		store.setSessionId(null);
	}

	try {
		// Start a new session with the specified CWD
		const result = await getTransport().request("session.start", { cwd });
		store.setSessionId(result.sessionId);
		// Multi-session: set as active session for subsequent requests
		getTransport().setActiveSession(result.sessionId);
		// Associate the new session with the active tab
		ensureTabExists();
		linkSessionToActiveTab(result.sessionId);
		store.setIsStreaming(false);
		// Clear any previous health issue — session started successfully
		store.setProviderHealth(null);

		// Refresh state to pick up new session info (model, thinking, etc.)
		await refreshSessionState();
		// Load any existing messages (e.g., if resuming a session)
		await loadSessionMessages();

		store.addToast(`Opened folder: ${cwd}`, "info");
		return true;
	} catch (err) {
		const msg = `Failed to start session in folder: ${errorMessage(err)}`;
		store.setLastError(msg);
		store.setProviderHealth({
			kind: "session_start_failed",
			message: msg,
			sessionId: null,
			detectedAt: Date.now(),
		});
		return false;
	}
}

/**
 * Switch to a different session.
 *
 * Flow:
 * 1. Abort streaming if active
 * 2. Ensure a Pi process is running
 * 3. Call session.switchSession with the session file path
 * 4. Clear local messages
 * 5. Refresh session state
 *
 * Returns true on success, false on failure or cancellation.
 */
export async function switchSession(sessionPath: string): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	const ready = await ensureSession();
	if (!ready) return false;

	try {
		const result = await getTransport().request("session.switchSession", { sessionPath });
		if (result.cancelled) {
			store.addToast("Session switch was cancelled by an extension", "warning");
			return false;
		}

		store.setIsStreaming(false);
		// Refresh state to pick up new session info
		await refreshSessionState();
		// Load the switched-to session's message history
		await loadSessionMessages();
		// Refresh session list to update current indicators
		await fetchSessionList();
		return true;
	} catch (err) {
		store.setLastError(`Failed to switch session: ${errorMessage(err)}`);
		return false;
	}
}
