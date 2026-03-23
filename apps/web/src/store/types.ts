/**
 * Store types — Zustand state shapes and ChatMessage definition.
 *
 * All fields are non-optional (no `undefined` values) to work with
 * `exactOptionalPropertyTypes`. Use `null` for absent values, `""` for
 * empty strings.
 */

import type { TransportState } from "@/transport";
import type {
	PiExtensionDialogRequest,
	PiModel,
	PiSessionStats,
	PiThinkingLevel,
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

/** Connection state — mirrors WsTransport lifecycle. */
export interface ConnectionSlice {
	/** Current WebSocket transport state. */
	connectionStatus: TransportState;
	/** Current reconnection attempt number (0 when connected). */
	reconnectAttempt: number;
	/** Last error message to display to the user, null when no error. */
	lastError: string | null;

	/** Update the connection status. */
	setConnectionStatus: (status: TransportState) => void;
	/** Update the reconnection attempt counter. */
	setReconnectAttempt: (attempt: number) => void;
	/** Set an error message to display. */
	setLastError: (error: string) => void;
	/** Clear the displayed error. */
	clearLastError: () => void;
}

/** Session state — Pi agent session info. */
export interface SessionSlice {
	/** Current Pi session ID, null before session.start. */
	sessionId: string | null;
	/** Active model, null before first state fetch. */
	model: PiModel | null;
	/** Current thinking level. */
	thinkingLevel: PiThinkingLevel;
	/** True while Pi agent is processing (between agent_start and agent_end). */
	isStreaming: boolean;
	/** True while context compaction is in progress (manual or auto). */
	isCompacting: boolean;
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
	/** Set the active model. */
	setModel: (model: PiModel | null) => void;
	/** Set the thinking level. */
	setThinkingLevel: (level: PiThinkingLevel) => void;
	/** Set streaming state. */
	setIsStreaming: (streaming: boolean) => void;
	/** Set compacting state. */
	setIsCompacting: (compacting: boolean) => void;
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

// ============================================================================
// Combined AppStore
// ============================================================================

/** Full Zustand store type — union of all slices. */
export type AppStore = ConnectionSlice &
	SessionSlice &
	MessagesSlice &
	ModelsSlice &
	ExtensionUiSlice &
	NotificationsSlice;
