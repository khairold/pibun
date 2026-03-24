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
import { createAppSlice } from "./appSlice";
import { createSessionSlice } from "./sessionSlice";
import type { AppStore } from "./types";
import { createWorkspaceSlice } from "./workspaceSlice";

/** The main application store. Use selectors for fine-grained reactivity. */
export const useStore = create<AppStore>()((...a) => ({
	...createAppSlice(...a),
	...createSessionSlice(...a),
	...createWorkspaceSlice(...a),
}));

// Re-export types for convenience
export type { AppStore, ChatMessage, ChatToolCall, ChatToolResult, Toast } from "./types";
export type {
	ActivePluginPanel,
	ConnectionSlice,
	ExtensionUiSlice,
	GitSlice,
	MessagesSlice,
	ModelsSlice,
	NotificationsSlice,
	PluginsSlice,
	ProjectsSlice,
	SessionSlice,
	TabsSlice,
	TerminalSlice,
	TerminalTab,
	UiSlice,
	UpdateSlice,
} from "./types";
