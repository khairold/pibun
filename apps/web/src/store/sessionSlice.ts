/**
 * Session slice — Pi agent session state.
 *
 * Updated from Pi events (agent_start/end) and RPC responses
 * (getState, setModel, setThinking). Components read these to
 * show model info, streaming indicators, and session stats.
 */

import type { StateCreator } from "zustand";
import type { AppStore, SessionSlice } from "./types";

/** Default thinking level before first state fetch. */
const DEFAULT_THINKING_LEVEL = "medium" as const;

export const createSessionSlice: StateCreator<AppStore, [], [], SessionSlice> = (set) => ({
	sessionId: null,
	model: null,
	thinkingLevel: DEFAULT_THINKING_LEVEL,
	isStreaming: false,
	stats: null,

	setSessionId: (id) => set({ sessionId: id }),
	setModel: (model) => set({ model }),
	setThinkingLevel: (level) => set({ thinkingLevel: level }),
	setIsStreaming: (streaming) => set({ isStreaming: streaming }),
	setStats: (stats) => set({ stats }),

	resetSession: () =>
		set({
			sessionId: null,
			model: null,
			thinkingLevel: DEFAULT_THINKING_LEVEL,
			isStreaming: false,
			stats: null,
		}),
});
