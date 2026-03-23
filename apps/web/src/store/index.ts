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
import { createTabsSlice } from "./tabsSlice";
import type { AppStore } from "./types";
import { createUiSlice } from "./uiSlice";
import { createUpdateSlice } from "./updateSlice";

/** The main application store. Use selectors for fine-grained reactivity. */
export const useStore = create<AppStore>()((...a) => ({
	...createConnectionSlice(...a),
	...createSessionSlice(...a),
	...createMessagesSlice(...a),
	...createModelsSlice(...a),
	...createExtensionUiSlice(...a),
	...createNotificationsSlice(...a),
	...createUpdateSlice(...a),
	...createUiSlice(...a),
	...createTabsSlice(...a),
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
	TabsSlice,
	UiSlice,
	UpdateSlice,
} from "./types";
