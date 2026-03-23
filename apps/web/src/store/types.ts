/**
 * Store types — Zustand state shapes and ChatMessage definition.
 *
 * All fields are non-optional (no `undefined` values) to work with
 * `exactOptionalPropertyTypes`. Use `null` for absent values, `""` for
 * empty strings.
 */

import type { TransportState } from "@/transport";
import type { PiModel, PiSessionStats, PiThinkingLevel } from "@pibun/contracts";

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

	/** Update the connection status. */
	setConnectionStatus: (status: TransportState) => void;
	/** Update the reconnection attempt counter. */
	setReconnectAttempt: (attempt: number) => void;
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
	/** Session statistics (tokens, cost), null before first fetch. */
	stats: PiSessionStats | null;

	/** Set the session ID. */
	setSessionId: (id: string | null) => void;
	/** Set the active model. */
	setModel: (model: PiModel | null) => void;
	/** Set the thinking level. */
	setThinkingLevel: (level: PiThinkingLevel) => void;
	/** Set streaming state. */
	setIsStreaming: (streaming: boolean) => void;
	/** Set session stats. */
	setStats: (stats: PiSessionStats | null) => void;
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

// ============================================================================
// Combined AppStore
// ============================================================================

/** Full Zustand store type — union of all slices. */
export type AppStore = ConnectionSlice & SessionSlice & MessagesSlice;
