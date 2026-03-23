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

import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { WsTransport } from "@/transport";
import type {
	PiAgentMessage,
	PiEvent,
	PiImageContent,
	PiMessageUpdateEvent,
	PiTextContent,
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
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: `Context compaction started (reason: ${event.reason})`,
				}),
			);
			break;

		case "auto_compaction_end":
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: event.aborted ? "Context compaction aborted" : "Context compaction complete",
				}),
			);
			break;

		case "auto_retry_start":
			store.appendMessage(
				makeMessage({
					id: nextId("system"),
					type: "system",
					content: `Retrying (attempt ${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
				}),
			);
			break;

		case "auto_retry_end":
			if (!event.success && event.finalError) {
				store.appendMessage(
					makeMessage({
						id: nextId("system"),
						type: "system",
						content: `Retry failed: ${event.finalError}`,
					}),
				);
			}
			break;

		// ── Turn events — no state update needed ───────────────────────
		case "turn_start":
		case "turn_end":
			break;

		// ── Extension events — handled in Phase 1D ─────────────────────
		case "extension_ui_request":
		case "extension_error":
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
		case "error":
			// Mark streaming complete (message_end will also do this, but be safe)
			store.setMessageStreaming(currentAssistantMessageId, false);
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
// Initialization
// ============================================================================

/**
 * Initialize the WebSocket transport and wire it to the Zustand store.
 *
 * - Subscribes to `pi.event` → dispatches to store actions
 * - Subscribes to `server.welcome` / `server.error` → logs
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

	// Transport state → connection slice
	cleanups.push(
		transport.onStateChange((state) => {
			const store = useStore.getState();
			store.setConnectionStatus(state);
			store.setReconnectAttempt(transport?.currentReconnectAttempt ?? 0);
		}),
	);

	// pi.event → Zustand store
	cleanups.push(transport.subscribe("pi.event", handlePiEvent));

	// server.welcome → log
	cleanups.push(
		transport.subscribe("server.welcome", (data) => {
			console.log(`[PiBun] Connected to server — cwd: ${data.cwd}, version: ${data.version}`);
		}),
	);

	// server.error → store + log
	cleanups.push(
		transport.subscribe("server.error", (data) => {
			console.error(`[PiBun] Server error: ${data.message}`);
			useStore.getState().setLastError(data.message);
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
