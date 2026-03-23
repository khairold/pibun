/**
 * Messages slice — chat message array with streaming update actions.
 *
 * Key conventions (from CONVENTIONS.md / MEMORY.md):
 * - `appendToContent` / `appendToThinking` — deltas, APPEND to existing string
 * - `updateToolOutput` — accumulated, REPLACE entire content (not delta)
 * - Messages are identified by `id` for updates during streaming
 *
 * Performance: find-by-id scans from the end since streaming messages
 * are always at the tail of the array.
 */

import type { StateCreator } from "zustand";
import type { AppStore, ChatMessage, MessagesSlice } from "./types";

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

export const createMessagesSlice: StateCreator<AppStore, [], [], MessagesSlice> = (set) => ({
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
});
