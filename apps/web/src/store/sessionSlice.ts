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
	isCompacting: false,
	isRetrying: false,
	retryAttempt: 0,
	retryMaxAttempts: 0,
	stats: null,
	sessionName: null,
	sessionFile: null,
	sessionList: [],
	sessionListLoading: false,

	setSessionId: (id) => set({ sessionId: id }),
	setModel: (model) => set({ model }),
	setThinkingLevel: (level) => set({ thinkingLevel: level }),
	setIsStreaming: (streaming) => set({ isStreaming: streaming }),
	setIsCompacting: (compacting) => set({ isCompacting: compacting }),
	setRetrying: (retrying, attempt = 0, maxAttempts = 0) =>
		set({ isRetrying: retrying, retryAttempt: attempt, retryMaxAttempts: maxAttempts }),
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
			isCompacting: false,
			isRetrying: false,
			retryAttempt: 0,
			retryMaxAttempts: 0,
			stats: null,
			sessionName: null,
			sessionFile: null,
			// Keep sessionList — it's independent of the current session
		}),
});
