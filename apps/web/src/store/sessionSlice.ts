/**
 * Session slice — all conversation-flow state.
 *
 * Combines:
 * - Session state (Pi agent session ID, model, streaming flags, stats)
 * - Messages state (chat message array with streaming update actions)
 * - Models state (available model list fetched from Pi)
 * - Extension UI state (pending dialog requests from Pi extensions)
 *
 * These co-change during conversation flow — a user prompt triggers
 * session state changes, message appends, and potentially extension dialogs.
 *
 * Key conventions:
 * - `appendToContent` / `appendToThinking` — deltas, APPEND to existing string
 * - `updateToolOutput` — accumulated, REPLACE entire content (not delta)
 * - Messages are identified by `id` for updates during streaming
 */

import type { StateCreator } from "zustand";
import type {
	AppStore,
	ChatMessage,
	ExtensionUiSlice,
	MessagesSlice,
	ModelsSlice,
	SessionSlice as SessionSliceType,
} from "./types";

// ==== Combined Slice Type ====

type SessionSlice = SessionSliceType & MessagesSlice & ModelsSlice & ExtensionUiSlice;

// ==== Constants ====

/** Default thinking level before first state fetch. */
const DEFAULT_THINKING_LEVEL = "medium" as const;

// ==== Message Helpers ====

/**
 * Find a message by ID, scanning from the end.
 * Streaming messages are always recent, so reverse scan is faster.
 */
function findMessageIndex(messages: readonly ChatMessage[], id: string): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.id === id) {
			return i;
		}
	}
	return -1;
}

/**
 * Immutably update a message at the given index.
 * Returns a new array with the updated message, or the original if index is invalid.
 */
function updateAtIndex(
	messages: readonly ChatMessage[],
	index: number,
	updater: (msg: ChatMessage) => ChatMessage,
): ChatMessage[] {
	const msg = messages[index];
	if (index < 0 || !msg) return messages as ChatMessage[];
	const updated = [...messages];
	updated[index] = updater(msg);
	return updated;
}

// ==== Slice Creator ====

export const createSessionSlice: StateCreator<AppStore, [], [], SessionSlice> = (set) => ({
	// ---- Session state ----
	sessionId: null,
	model: null,
	thinkingLevel: DEFAULT_THINKING_LEVEL,
	isStreaming: false,
	agentStartedAt: 0,
	isCompacting: false,
	isRetrying: false,
	retryAttempt: 0,
	retryMaxAttempts: 0,
	retryDelayMs: 0,
	retryStartedAt: 0,
	stats: null,
	sessionName: null,
	sessionFile: null,
	sessionList: [],
	sessionListLoading: false,

	setSessionId: (id) => set({ sessionId: id }),
	setModel: (model) => set({ model }),
	setThinkingLevel: (level) => set({ thinkingLevel: level }),
	setIsStreaming: (streaming) => set({ isStreaming: streaming }),
	setAgentStartedAt: (timestamp) => set({ agentStartedAt: timestamp }),
	setIsCompacting: (compacting) => set({ isCompacting: compacting }),
	setRetrying: (retrying, attempt = 0, maxAttempts = 0, delayMs = 0) =>
		set({
			isRetrying: retrying,
			retryAttempt: attempt,
			retryMaxAttempts: maxAttempts,
			retryDelayMs: delayMs,
			retryStartedAt: retrying && delayMs > 0 ? Date.now() : 0,
		}),
	setStats: (stats) => set({ stats }),
	setSessionName: (name) => set({ sessionName: name }),
	setSessionFile: (path) => set({ sessionFile: path }),
	setSessionList: (sessions) => set({ sessionList: sessions }),
	setSessionListLoading: (loading) => set({ sessionListLoading: loading }),

	resetSession: () =>
		set({
			sessionId: null,
			model: null,
			thinkingLevel: DEFAULT_THINKING_LEVEL,
			isStreaming: false,
			agentStartedAt: 0,
			isCompacting: false,
			isRetrying: false,
			retryAttempt: 0,
			retryMaxAttempts: 0,
			retryDelayMs: 0,
			retryStartedAt: 0,
			stats: null,
			sessionName: null,
			sessionFile: null,
			// Keep sessionList — it's independent of the current session
		}),

	// ---- Messages state ----
	messages: [],

	appendMessage: (message) =>
		set((state) => ({
			messages: [...state.messages, message],
		})),

	appendToContent: (messageId, delta) =>
		set((state) => {
			const index = findMessageIndex(state.messages, messageId);
			return {
				messages: updateAtIndex(state.messages, index, (msg) => ({
					...msg,
					content: msg.content + delta,
				})),
			};
		}),

	appendToThinking: (messageId, delta) =>
		set((state) => {
			const index = findMessageIndex(state.messages, messageId);
			return {
				messages: updateAtIndex(state.messages, index, (msg) => ({
					...msg,
					thinking: msg.thinking + delta,
				})),
			};
		}),

	setMessageStreaming: (messageId, streaming) =>
		set((state) => {
			const index = findMessageIndex(state.messages, messageId);
			return {
				messages: updateAtIndex(state.messages, index, (msg) => ({
					...msg,
					streaming,
				})),
			};
		}),

	updateToolOutput: (toolCallId, output) =>
		set((state) => {
			// Find the tool_result message for this tool call
			const index = findMessageIndex(state.messages, `result-${toolCallId}`);
			return {
				messages: updateAtIndex(state.messages, index, (msg) => ({
					...msg,
					toolResult: {
						content: output,
						isError: msg.toolResult?.isError ?? false,
					},
				})),
			};
		}),

	finalizeToolResult: (toolCallId, content, isError) =>
		set((state) => {
			const index = findMessageIndex(state.messages, `result-${toolCallId}`);
			return {
				messages: updateAtIndex(state.messages, index, (msg) => ({
					...msg,
					toolResult: { content, isError },
					streaming: false,
				})),
			};
		}),

	setMessages: (messages) => set({ messages }),

	clearMessages: () => set({ messages: [] }),

	// ---- Models state ----
	availableModels: [],
	modelsLoading: false,

	setAvailableModels: (models) => set({ availableModels: models }),
	setModelsLoading: (loading) => set({ modelsLoading: loading }),

	// ---- Extension UI state ----
	pendingExtensionUi: null,

	setPendingExtensionUi: (request) => set({ pendingExtensionUi: request }),
	clearPendingExtensionUi: () => set({ pendingExtensionUi: null }),
});
