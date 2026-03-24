/**
 * Workspace slice — tabs, terminal, git, plugins, and projects.
 *
 * Combines five workspace-level concerns into a single slice creator.
 * These features are all "workspace infrastructure" that supports the
 * main chat session flow but doesn't directly participate in it.
 *
 * Sections:
 * - Tabs: multi-session tab management (client-side concept)
 * - Terminal: embedded PTY panel and tabs
 * - Git: repository status for the active session's CWD
 * - Plugins: installed plugins and panel visibility
 * - Projects: project directory management
 */

import type { GitChangedFile, Project, SessionTab, TabStatus } from "@pibun/contracts";
import type { StateCreator } from "zustand";
import {
	type AppStore,
	type ChatMessage,
	type ExtensionWidget,
	type GitSlice,
	MAX_TERMINALS_PER_GROUP,
	type PluginsSlice,
	type ProjectsSlice,
	type TabsSlice,
	type TerminalSlice,
	type TerminalTab,
} from "./types";

// ============================================================================
// Combined workspace type
// ============================================================================

type WorkspaceSlice = TabsSlice & TerminalSlice & GitSlice & PluginsSlice & ProjectsSlice;

// ============================================================================
// Tabs helpers
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
// Terminal helpers
// ============================================================================

/** Auto-incrementing counter for unique terminal tab IDs. */
let terminalTabCounter = 0;

// ============================================================================
// Projects helpers
// ============================================================================

/** Sort projects by lastOpened descending (most recent first). */
function sortByLastOpened(projects: Project[]): Project[] {
	return [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
}

/**
 * Derive tab status from session state flags and current tab status.
 *
 * Priority order: waiting > running > (preserve error) > idle.
 * - `waiting` — extension UI dialog is pending (Pi is blocked, needs user input)
 * - `running` — agent is streaming (between agent_start and agent_end)
 * - `error` — preserved from previous state (set explicitly by event handlers)
 * - `idle` — default, no activity
 *
 * The `error` status is set explicitly by event handlers (auto_retry_end failure,
 * process crash) and cleared when new activity starts (running or waiting).
 * It's preserved through `deriveTabStatus` to prevent `syncActiveTabState`
 * from accidentally clearing it.
 */
function deriveTabStatus(
	isStreaming: boolean,
	pendingExtensionUi: boolean,
	currentStatus?: TabStatus,
): TabStatus {
	if (pendingExtensionUi) return "waiting";
	if (isStreaming) return "running";
	// Preserve error status until new activity starts
	if (currentStatus === "error") return "error";
	return "idle";
}

// ============================================================================
// Slice
// ============================================================================

export const createWorkspaceSlice: StateCreator<AppStore, [], [], WorkspaceSlice> = (set, get) => ({
	// ==== Tabs state ====
	tabs: [],
	activeTabId: null,
	tabMessages: new Map<string, ChatMessage[]>(),
	tabStatuses: new Map<string, Map<string, string>>(),
	tabWidgets: new Map<string, Map<string, ExtensionWidget>>(),
	tabTerminalActiveIds: new Map<string, string | null>(),

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
			status: "idle",
			gitDirty: false,
			messageCount: 0,
			createdAt: Date.now(),
			hasUnread: false,
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
			const newTabStatuses = new Map(s.tabStatuses);
			newTabStatuses.delete(tabId);
			const newTabWidgets = new Map(s.tabWidgets);
			newTabWidgets.delete(tabId);
			const newTabTerminalActiveIds = new Map(s.tabTerminalActiveIds);
			newTabTerminalActiveIds.delete(tabId);

			// Remove terminals owned by this tab
			const newTerminalTabs = s.terminalTabs.filter((t) => t.ownerTabId !== tabId);
			// If active terminal was owned by removed tab, clear it
			const activeTerminalOwned = s.terminalTabs.some(
				(t) => t.id === s.activeTerminalTabId && t.ownerTabId === tabId,
			);

			const updates: Partial<AppStore> = {
				tabs: newTabs,
				tabMessages: newTabMessages,
				tabStatuses: newTabStatuses,
				tabWidgets: newTabWidgets,
				tabTerminalActiveIds: newTabTerminalActiveIds,
				terminalTabs: newTerminalTabs,
			};

			if (activeTerminalOwned) {
				updates.activeTerminalTabId = null;
			}

			// If removing the active tab, switch to adjacent
			if (s.activeTabId === tabId) {
				const oldIndex = s.tabs.findIndex((t) => t.id === tabId);
				// Prefer the tab to the left, then to the right, then null
				const nextTab = newTabs[oldIndex > 0 ? oldIndex - 1 : 0] ?? null;
				updates.activeTabId = nextTab?.id ?? null;

				// If we switched to a different tab, restore its messages
				if (nextTab) {
					updates.messages = newTabMessages.get(nextTab.id) ?? [];
					updates.statuses = newTabStatuses.get(nextTab.id) ?? new Map<string, string>();
					updates.extensionWidgets =
						newTabWidgets.get(nextTab.id) ?? new Map<string, ExtensionWidget>();
					updates.sessionId = nextTab.sessionId;
					updates.model = nextTab.model;
					updates.thinkingLevel = nextTab.thinkingLevel;
					updates.isStreaming = nextTab.isStreaming;
					updates.sessionName = nextTab.name;
					// Restore next tab's terminal state
					updates.activeTerminalTabId = newTabTerminalActiveIds.get(nextTab.id) ?? null;
				} else {
					// No tabs left — clear everything
					updates.messages = [];
					updates.statuses = new Map<string, string>();
					updates.extensionWidgets = new Map<string, ExtensionWidget>();
					updates.extensionTitle = null;
					updates.sessionId = null;
					updates.model = null;
					updates.thinkingLevel = "medium";
					updates.isStreaming = false;
					updates.sessionName = null;
					updates.activeTerminalTabId = null;
				}
			}

			// Close panel if no terminals left for the new active tab
			if (newTerminalTabs.length === 0) {
				updates.terminalPanelOpen = false;
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
			const newTabStatuses = new Map(s.tabStatuses);
			const newTabWidgets = new Map(s.tabWidgets);
			const newTabTerminalActiveIds = new Map(s.tabTerminalActiveIds);

			// Save current tab's messages, statuses, widgets, and state
			if (s.activeTabId) {
				newTabMessages.set(s.activeTabId, [...s.messages]);
				// Save current statuses for the leaving tab
				if (s.statuses.size > 0) {
					newTabStatuses.set(s.activeTabId, new Map(s.statuses));
				} else {
					newTabStatuses.delete(s.activeTabId);
				}
				// Save current widgets for the leaving tab
				if (s.extensionWidgets.size > 0) {
					newTabWidgets.set(s.activeTabId, new Map(s.extensionWidgets));
				} else {
					newTabWidgets.delete(s.activeTabId);
				}
				// Save current active terminal tab ID for the leaving tab
				newTabTerminalActiveIds.set(s.activeTabId, s.activeTerminalTabId);

				// Restore target tab's active terminal tab ID
				const targetTerminalActiveId = newTabTerminalActiveIds.get(tabId) ?? null;

				// Update the current tab's snapshot with current session state
				// Clear hasUnread on the target tab (user is now viewing it)
				const updatedTabs = s.tabs.map((t) =>
					t.id === s.activeTabId
						? {
								...t,
								isStreaming: s.isStreaming,
								status: deriveTabStatus(s.isStreaming, s.pendingExtensionUi !== null, t.status),
								messageCount: s.messages.length,
								model: s.model,
								thinkingLevel: s.thinkingLevel,
								sessionId: s.sessionId,
								name: s.sessionName ?? t.name,
							}
						: t.id === tabId
							? { ...t, hasUnread: false }
							: t,
				);

				return {
					tabs: updatedTabs,
					activeTabId: tabId,
					tabMessages: newTabMessages,
					tabStatuses: newTabStatuses,
					tabWidgets: newTabWidgets,
					tabTerminalActiveIds: newTabTerminalActiveIds,
					// Restore target tab's cached state
					messages: newTabMessages.get(tabId) ?? [],
					statuses: newTabStatuses.get(tabId) ?? new Map<string, string>(),
					extensionWidgets: newTabWidgets.get(tabId) ?? new Map<string, ExtensionWidget>(),
					extensionTitle: null, // Extension title is per-session, clear on switch
					sessionId: targetTab.sessionId,
					model: targetTab.model,
					thinkingLevel: targetTab.thinkingLevel,
					isStreaming: targetTab.isStreaming,
					sessionName: targetTab.name,
					sessionFile: null, // Will be refreshed via get_state
					stats: null, // Will be refreshed
					agentStartedAt: 0,
					isCompacting: false,
					isRetrying: false,
					retryAttempt: 0,
					retryMaxAttempts: 0,
					retryDelayMs: 0,
					retryStartedAt: 0,
					// Restore terminal state for target tab
					activeTerminalTabId: targetTerminalActiveId,
					// Close diff panel on tab switch (diff is per-session context)
					diffPanelOpen: false,
					diffPanelFiles: [],
					diffPanelResult: null,
					diffPanelError: null,
					diffPanelSelectedFile: null,
				};
			}

			// No previous active tab — just activate target
			const targetTerminalActiveId = newTabTerminalActiveIds.get(tabId) ?? null;
			return {
				activeTabId: tabId,
				messages: newTabMessages.get(tabId) ?? [],
				statuses: newTabStatuses.get(tabId) ?? new Map<string, string>(),
				extensionWidgets: newTabWidgets.get(tabId) ?? new Map<string, ExtensionWidget>(),
				extensionTitle: null,
				sessionId: targetTab.sessionId,
				model: targetTab.model,
				thinkingLevel: targetTab.thinkingLevel,
				isStreaming: targetTab.isStreaming,
				sessionName: targetTab.name,
				activeTerminalTabId: targetTerminalActiveId,
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
							status: deriveTabStatus(s.isStreaming, s.pendingExtensionUi !== null, t.status),
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

	setBackgroundTabStatus: (tabId, key, text) => {
		set((s) => {
			const newTabStatuses = new Map(s.tabStatuses);
			const tabMap = new Map(newTabStatuses.get(tabId) ?? []);
			if (text) {
				tabMap.set(key, text);
			} else {
				tabMap.delete(key);
			}
			if (tabMap.size > 0) {
				newTabStatuses.set(tabId, tabMap);
			} else {
				newTabStatuses.delete(tabId);
			}
			return { tabStatuses: newTabStatuses };
		});
	},

	setBackgroundTabWidget: (tabId, key, lines, placement) => {
		set((s) => {
			const newTabWidgets = new Map(s.tabWidgets);
			const tabMap = new Map(newTabWidgets.get(tabId) ?? []);
			if (lines && lines.length > 0) {
				tabMap.set(key, { lines, placement });
			} else {
				tabMap.delete(key);
			}
			if (tabMap.size > 0) {
				newTabWidgets.set(tabId, tabMap);
			} else {
				newTabWidgets.delete(tabId);
			}
			return { tabWidgets: newTabWidgets };
		});
	},

	// ==== Terminal state ====
	terminalPanelOpen: false,
	terminalTabs: [],
	activeTerminalTabId: null,

	toggleTerminalPanel: () => set((state) => ({ terminalPanelOpen: !state.terminalPanelOpen })),

	setTerminalPanelOpen: (open) => set({ terminalPanelOpen: open }),

	addTerminalTab: (terminalId, cwd) => {
		const state = get();
		const tabId = `ttab-${String(++terminalTabCounter)}`;
		const ownerTabId = state.activeTabId ?? "";
		const tab: TerminalTab = {
			id: tabId,
			terminalId,
			name: `Terminal ${String(terminalTabCounter)}`,
			cwd,
			isRunning: true,
			groupId: tabId, // Each new terminal starts in its own group
			ownerTabId,
		};
		set((s) => ({
			terminalTabs: [...s.terminalTabs, tab],
			// Auto-activate the new tab
			activeTerminalTabId: tabId,
		}));
		return tabId;
	},

	removeTerminalTab: (tabId) => {
		const state = get();
		const removedTab = state.terminalTabs.find((t) => t.id === tabId);
		const newTabs = state.terminalTabs.filter((t) => t.id !== tabId);
		const ownerTabId = removedTab?.ownerTabId ?? state.activeTabId ?? "";

		// Only consider sibling terminals from the same owner tab for active selection
		const ownerTabs = newTabs.filter((t) => t.ownerTabId === ownerTabId);

		let newActiveId = state.activeTerminalTabId;
		if (state.activeTerminalTabId === tabId) {
			if (ownerTabs.length === 0) {
				newActiveId = null;
			} else if (removedTab) {
				// Prefer a sibling in the same split group first
				const groupSibling = ownerTabs.find((t) => t.groupId === removedTab.groupId);
				if (groupSibling) {
					newActiveId = groupSibling.id;
				} else {
					// Fall back to first terminal in the same owner tab
					const first = ownerTabs[0];
					newActiveId = first ? first.id : null;
				}
			} else {
				const first = ownerTabs[0];
				newActiveId = first ? first.id : null;
			}
		}

		set({
			terminalTabs: newTabs,
			activeTerminalTabId: newActiveId,
			// Close panel if no terminals left for the owner tab
			...(ownerTabs.length === 0 ? { terminalPanelOpen: false } : {}),
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

	splitTerminalTab: (terminalId, cwd) => {
		const state = get();
		const activeTab = state.activeTerminalTabId
			? state.terminalTabs.find((t) => t.id === state.activeTerminalTabId)
			: null;
		const groupId = activeTab ? activeTab.groupId : null;
		const ownerTabId = state.activeTabId ?? "";

		// Check group size limit
		if (groupId) {
			const groupSize = state.terminalTabs.filter((t) => t.groupId === groupId).length;
			if (groupSize >= MAX_TERMINALS_PER_GROUP) return null;
		}

		const tabId = `ttab-${String(++terminalTabCounter)}`;
		const tab: TerminalTab = {
			id: tabId,
			terminalId,
			name: `Terminal ${String(terminalTabCounter)}`,
			cwd,
			isRunning: true,
			groupId: groupId ?? tabId, // Join active group, or create new group
			ownerTabId,
		};
		set((s) => ({
			terminalTabs: [...s.terminalTabs, tab],
			activeTerminalTabId: tabId,
		}));
		return tabId;
	},

	// ==== Git state ====
	gitBranch: null,
	gitChangedFiles: [],
	gitIsDirty: false,
	gitIsRepo: false,
	gitLastFetched: null,
	gitLoading: false,
	gitPanelOpen: false,
	selectedDiffPath: null,
	selectedDiffContent: null,
	diffLoading: false,

	setGitStatus: (
		isRepo: boolean,
		branch: string | null,
		files: GitChangedFile[],
		isDirty: boolean,
	) =>
		set({
			gitIsRepo: isRepo,
			gitBranch: branch,
			gitChangedFiles: files,
			gitIsDirty: isDirty,
			gitLastFetched: Date.now(),
			gitLoading: false,
		}),

	setGitLoading: (loading: boolean) => set({ gitLoading: loading }),

	resetGit: () =>
		set({
			gitBranch: null,
			gitChangedFiles: [],
			gitIsDirty: false,
			gitIsRepo: false,
			gitLastFetched: null,
			gitLoading: false,
			gitPanelOpen: false,
			selectedDiffPath: null,
			selectedDiffContent: null,
			diffLoading: false,
		}),

	toggleGitPanel: () => set((state) => ({ gitPanelOpen: !state.gitPanelOpen })),

	setGitPanelOpen: (open: boolean) =>
		set({
			gitPanelOpen: open,
			// Clear selected diff when closing panel
			...(open ? {} : { selectedDiffPath: null, selectedDiffContent: null }),
		}),

	setSelectedDiff: (path: string | null, content: string | null) =>
		set({ selectedDiffPath: path, selectedDiffContent: content, diffLoading: false }),

	setDiffLoading: (loading: boolean) => set({ diffLoading: loading }),

	// ==== Plugins state ====
	plugins: [],
	pluginsLoading: false,
	activePluginPanels: new Set<string>(),

	setPlugins: (plugins) => set({ plugins }),
	setPluginsLoading: (loading) => set({ pluginsLoading: loading }),

	togglePluginPanel: (panelKey) =>
		set((state) => {
			const next = new Set(state.activePluginPanels);
			if (next.has(panelKey)) {
				next.delete(panelKey);
			} else {
				next.add(panelKey);
			}
			return { activePluginPanels: next };
		}),

	setPluginPanelOpen: (panelKey, open) =>
		set((state) => {
			const next = new Set(state.activePluginPanels);
			if (open) {
				next.add(panelKey);
			} else {
				next.delete(panelKey);
			}
			return { activePluginPanels: next };
		}),

	getActivePluginPanelsByPosition: (position) => {
		const state = get();
		const panels: Array<{
			pluginId: string;
			panelId: string;
			title: string;
			icon: string;
			component: string;
			defaultSize: number | null;
		}> = [];

		for (const plugin of state.plugins) {
			if (!plugin.enabled || plugin.error) continue;
			for (const panel of plugin.manifest.panels) {
				if (panel.position !== position) continue;
				const panelKey = `${plugin.manifest.id}:${panel.id}`;
				if (state.activePluginPanels.has(panelKey)) {
					panels.push({
						pluginId: plugin.manifest.id,
						panelId: panel.id,
						title: panel.title,
						icon: panel.icon,
						component: panel.component,
						defaultSize: panel.defaultSize,
					});
				}
			}
		}

		return panels;
	},

	// ==== Projects state ====
	projects: [],
	activeProjectId: null,
	projectsLoading: false,

	setProjects: (projects) => {
		set({ projects: sortByLastOpened(projects) });
	},

	addProject: (project) => {
		set((s) => ({
			projects: sortByLastOpened([...s.projects, project]),
		}));
	},

	removeProject: (projectId) => {
		set((s) => ({
			projects: s.projects.filter((p) => p.id !== projectId),
			activeProjectId: s.activeProjectId === projectId ? null : s.activeProjectId,
		}));
	},

	updateProject: (projectId, updates) => {
		set((s) => {
			const updated = s.projects.map((p) => (p.id === projectId ? { ...p, ...updates } : p));
			return { projects: sortByLastOpened(updated) };
		});
	},

	setActiveProjectId: (projectId) => {
		set({ activeProjectId: projectId });
	},

	setProjectsLoading: (loading) => {
		set({ projectsLoading: loading });
	},
});
