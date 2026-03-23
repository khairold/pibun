/**
 * Terminal state slice — tracks terminal tabs and panel visibility.
 *
 * Each terminal tab represents a PTY session on the server.
 * Terminal data (stdout) flows through push channels, not the store —
 * xterm.js instances consume data directly via subscription callbacks.
 */

import type { StateCreator } from "zustand";
import type { AppStore, TerminalSlice, TerminalTab } from "./types";

/** Auto-incrementing counter for unique terminal tab IDs. */
let terminalTabCounter = 0;

export const createTerminalSlice: StateCreator<AppStore, [], [], TerminalSlice> = (set, get) => ({
	// State
	terminalPanelOpen: false,
	terminalTabs: [],
	activeTerminalTabId: null,

	// Actions
	toggleTerminalPanel: () => set((state) => ({ terminalPanelOpen: !state.terminalPanelOpen })),

	setTerminalPanelOpen: (open) => set({ terminalPanelOpen: open }),

	addTerminalTab: (terminalId, cwd) => {
		const tabId = `ttab-${String(++terminalTabCounter)}`;
		const tab: TerminalTab = {
			id: tabId,
			terminalId,
			name: `Terminal ${String(terminalTabCounter)}`,
			cwd,
			isRunning: true,
		};
		set((state) => ({
			terminalTabs: [...state.terminalTabs, tab],
			// Auto-activate the new tab
			activeTerminalTabId: tabId,
		}));
		return tabId;
	},

	removeTerminalTab: (tabId) => {
		const state = get();
		const idx = state.terminalTabs.findIndex((t) => t.id === tabId);
		const newTabs = state.terminalTabs.filter((t) => t.id !== tabId);

		let newActiveId = state.activeTerminalTabId;
		if (state.activeTerminalTabId === tabId) {
			// Switch to adjacent tab
			if (newTabs.length === 0) {
				newActiveId = null;
			} else {
				const newIdx = Math.min(idx, newTabs.length - 1);
				const adjacent = newTabs[newIdx];
				newActiveId = adjacent ? adjacent.id : null;
			}
		}

		set({
			terminalTabs: newTabs,
			activeTerminalTabId: newActiveId,
			// Close panel if no terminals left
			...(newTabs.length === 0 ? { terminalPanelOpen: false } : {}),
		});
	},

	setActiveTerminalTabId: (tabId) => set({ activeTerminalTabId: tabId }),

	updateTerminalTab: (tabId, updates) =>
		set((state) => ({
			terminalTabs: state.terminalTabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
		})),

	getActiveTerminalTab: () => {
		const state = get();
		if (!state.activeTerminalTabId) return null;
		return state.terminalTabs.find((t) => t.id === state.activeTerminalTabId) ?? null;
	},

	getTerminalTabByTerminalId: (terminalId) => {
		const state = get();
		return state.terminalTabs.find((t) => t.terminalId === terminalId) ?? null;
	},
});
