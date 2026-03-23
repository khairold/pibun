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
import { createExtensionUiSlice } from "./extensionUiSlice";
import { createMessagesSlice } from "./messagesSlice";
import { createModelsSlice } from "./modelsSlice";
import { createNotificationsSlice } from "./notificationsSlice";
import { createSessionSlice } from "./sessionSlice";
import type { AppStore } from "./types";

/** The main application store. Use selectors for fine-grained reactivity. */
export const useStore = create<AppStore>()((...a) => ({
	...createConnectionSlice(...a),
	...createSessionSlice(...a),
	...createMessagesSlice(...a),
	...createModelsSlice(...a),
	...createExtensionUiSlice(...a),
	...createNotificationsSlice(...a),
}));

// Re-export types for convenience
export type { AppStore, ChatMessage, ChatToolCall, ChatToolResult, Toast } from "./types";
export type {
	ConnectionSlice,
	ExtensionUiSlice,
	MessagesSlice,
	ModelsSlice,
	NotificationsSlice,
	SessionSlice,
} from "./types";
