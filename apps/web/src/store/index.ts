/**
 * PiBun Zustand store — combined from slice creators.
 *
 * Usage:
 * ```typescript
 * import { useStore } from "@/store";
 *
 * // In components — select only what you need
 * const status = useStore((s) => s.connectionStatus);
 * const messages = useStore((s) => s.messages);
 * const isStreaming = useStore((s) => s.isStreaming);
 *
 * // Actions
 * const appendMessage = useStore((s) => s.appendMessage);
 * ```
 */

import { create } from "zustand";
import { createConnectionSlice } from "./connectionSlice";
import { createMessagesSlice } from "./messagesSlice";
import { createSessionSlice } from "./sessionSlice";
import type { AppStore } from "./types";

/** The main application store. Use selectors for fine-grained reactivity. */
export const useStore = create<AppStore>()((...a) => ({
	...createConnectionSlice(...a),
	...createSessionSlice(...a),
	...createMessagesSlice(...a),
}));

// Re-export types for convenience
export type { AppStore, ChatMessage, ChatToolCall, ChatToolResult } from "./types";
export type { ConnectionSlice, MessagesSlice, SessionSlice } from "./types";
