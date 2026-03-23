/**
 * Connection slice — WebSocket transport lifecycle state.
 *
 * Synced from WsTransport via `onStateChange()` callback.
 * Components read `connectionStatus` to show connecting/reconnecting/error UI.
 */

import type { StateCreator } from "zustand";
import type { AppStore, ConnectionSlice } from "./types";

export const createConnectionSlice: StateCreator<AppStore, [], [], ConnectionSlice> = (set) => ({
	connectionStatus: "connecting",
	reconnectAttempt: 0,
	lastError: null,

	setConnectionStatus: (status) => set({ connectionStatus: status }),
	setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
	setLastError: (error) => set({ lastError: error }),
	clearLastError: () => set({ lastError: null }),
});
