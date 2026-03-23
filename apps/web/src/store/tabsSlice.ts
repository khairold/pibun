/**
 * Tabs slice — multi-session tab management.
 *
 * Each tab represents an independent Pi RPC session. The active tab's
 * messages are in the messages slice; inactive tabs' messages are cached
 * in `tabMessages`. Switching tabs saves the current tab's state and
 * restores the target tab's cached state.
 *
 * Tabs are a client-side concept — the server doesn't know about tabs.
 * The `WsTransport.setActiveSession()` call routes requests to the
 * correct Pi process based on the active tab's sessionId.
 */

import type { SessionTab } from "@pibun/contracts";
import type { StateCreator } from "zustand";
import type { AppStore, ChatMessage, TabsSlice } from "./types";

// ============================================================================
// Helpers
// ============================================================================

/** Auto-incrementing counter for unique tab IDs. */
let tabIdCounter = 0;

/** Generate a unique tab ID. */
function nextTabId(): string {
	return `tab-${String(++tabIdCounter)}`;
}

/** Generate a default tab name based on tab count. */
function defaultTabName(index: number): string {
	return `Session ${String(index + 1)}`;
}

// ============================================================================
// Slice
// ============================================================================

export const createTabsSlice: StateCreator<AppStore, [], [], TabsSlice> = (set, get) => ({
	tabs: [],
	activeTabId: null,
	tabMessages: new Map<string, ChatMessage[]>(),

	addTab: (partial) => {
		const state = get();
		const id = nextTabId();
		const tab: SessionTab = {
			id,
			name: partial?.name ?? defaultTabName(state.tabs.length),
			sessionId: partial?.sessionId ?? null,
			cwd: partial?.cwd ?? null,
			model: partial?.model ?? null,
			thinkingLevel: partial?.thinkingLevel ?? "medium",
			isStreaming: false,
			messageCount: 0,
			createdAt: Date.now(),
		};

		set((s) => ({
			tabs: [...s.tabs, tab],
		}));

		return id;
	},

	removeTab: (tabId) => {
		set((s) => {
			const newTabs = s.tabs.filter((t) => t.id !== tabId);
			const newTabMessages = new Map(s.tabMessages);
			newTabMessages.delete(tabId);

			const updates: Partial<AppStore> = {
				tabs: newTabs,
				tabMessages: newTabMessages,
			};

			// If removing the active tab, switch to adjacent
			if (s.activeTabId === tabId) {
				const oldIndex = s.tabs.findIndex((t) => t.id === tabId);
				// Prefer the tab to the left, then to the right, then null
				const nextTab = newTabs[oldIndex > 0 ? oldIndex - 1 : 0] ?? null;
				updates.activeTabId = nextTab?.id ?? null;

				// If we switched to a different tab, restore its messages
				if (nextTab) {
					updates.messages = newTabMessages.get(nextTab.id) ?? [];
					updates.sessionId = nextTab.sessionId;
					updates.model = nextTab.model;
					updates.thinkingLevel = nextTab.thinkingLevel;
					updates.isStreaming = nextTab.isStreaming;
					updates.sessionName = nextTab.name;
				} else {
					// No tabs left — clear everything
					updates.messages = [];
					updates.sessionId = null;
					updates.model = null;
					updates.thinkingLevel = "medium";
					updates.isStreaming = false;
					updates.sessionName = null;
				}
			}

			return updates;
		});
	},

	switchTab: (tabId) => {
		const state = get();
		if (state.activeTabId === tabId) return;

		const targetTab = state.tabs.find((t) => t.id === tabId);
		if (!targetTab) return;

		set((s) => {
			const newTabMessages = new Map(s.tabMessages);

			// Save current tab's messages and state
			if (s.activeTabId) {
				newTabMessages.set(s.activeTabId, [...s.messages]);

				// Update the current tab's snapshot with current session state
				const updatedTabs = s.tabs.map((t) =>
					t.id === s.activeTabId
						? {
								...t,
								isStreaming: s.isStreaming,
								messageCount: s.messages.length,
								model: s.model,
								thinkingLevel: s.thinkingLevel,
								sessionId: s.sessionId,
								name: s.sessionName ?? t.name,
							}
						: t,
				);

				return {
					tabs: updatedTabs,
					activeTabId: tabId,
					tabMessages: newTabMessages,
					// Restore target tab's cached state
					messages: newTabMessages.get(tabId) ?? [],
					sessionId: targetTab.sessionId,
					model: targetTab.model,
					thinkingLevel: targetTab.thinkingLevel,
					isStreaming: targetTab.isStreaming,
					sessionName: targetTab.name,
					sessionFile: null, // Will be refreshed via get_state
					stats: null, // Will be refreshed
					isCompacting: false,
					isRetrying: false,
					retryAttempt: 0,
					retryMaxAttempts: 0,
				};
			}

			// No previous active tab — just activate target
			return {
				activeTabId: tabId,
				messages: newTabMessages.get(tabId) ?? [],
				sessionId: targetTab.sessionId,
				model: targetTab.model,
				thinkingLevel: targetTab.thinkingLevel,
				isStreaming: targetTab.isStreaming,
				sessionName: targetTab.name,
			};
		});
	},

	updateTab: (tabId, updates) => {
		set((s) => ({
			tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
		}));
	},

	getActiveTab: () => {
		const state = get();
		if (!state.activeTabId) return null;
		return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
	},

	saveActiveTabMessages: () => {
		const state = get();
		const activeId = state.activeTabId;
		if (!activeId) return;

		set((s) => {
			const newTabMessages = new Map(s.tabMessages);
			newTabMessages.set(activeId, [...s.messages]);
			return { tabMessages: newTabMessages };
		});
	},

	syncActiveTabState: () => {
		const state = get();
		if (!state.activeTabId) return;

		set((s) => ({
			tabs: s.tabs.map((t) =>
				t.id === s.activeTabId
					? {
							...t,
							sessionId: s.sessionId,
							isStreaming: s.isStreaming,
							messageCount: s.messages.length,
							model: s.model,
							thinkingLevel: s.thinkingLevel,
							name: s.sessionName ?? t.name,
						}
					: t,
			),
		}));
	},

	reorderTabs: (fromIndex, toIndex) => {
		set((s) => {
			if (
				fromIndex === toIndex ||
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= s.tabs.length ||
				toIndex >= s.tabs.length
			) {
				return s;
			}
			const newTabs = [...s.tabs];
			const [moved] = newTabs.splice(fromIndex, 1);
			if (!moved) return s;
			newTabs.splice(toIndex, 0, moved);
			return { tabs: newTabs };
		});
	},
});
