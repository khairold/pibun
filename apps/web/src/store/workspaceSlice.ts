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
	type WorkspacePersistSlice,
} from "./types";

// ============================================================================
// Combined workspace type
// ============================================================================

type WorkspaceSlice = TabsSlice &
	TerminalSlice &
	GitSlice &
	PluginsSlice &
	ProjectsSlice &
	WorkspacePersistSlice;

// ============================================================================
// Tabs helpers
// ============================================================================

/** Auto-incrementing counter for unique tab IDs. */
let tabIdCounter = 0;

/** Generate a unique tab ID. */
function nextTabId(): string {
	return `tab-${String(++tabIdCounter)}`;
}

/**
 * Default tab name — empty string so display logic falls through
 * to firstMessage (auto-named from first user prompt).
 * The sidebar shows "New session" as the final fallback.
 */
function defaultTabName(): string {
	return "";
}

/**
 * Extract the first user message text from a messages array.
 *
 * Used for auto-naming sessions in the sidebar when no Pi session name is set.
 * Truncated to 100 chars and collapsed to a single line for sidebar display.
 * Display priority: Pi session name → firstMessage → "New session".
 */
function getFirstUserMessage(messages: readonly ChatMessage[]): string | null {
	const first = messages.find((m) => m.type === "user" && m.content.trim());
	if (!first) return null;
	// Collapse whitespace/newlines to single spaces, trim, cap at 100 chars
	const text = first.content.trim().replace(/\s+/g, " ");
	return text.length > 100 ? `${text.slice(0, 100)}…` : text;
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

	addTab: (partial) => {
		const state = get();
		const id = nextTabId();
		const tab: SessionTab = {
			id,
			name: partial?.name ?? defaultTabName(),
			sessionId: partial?.sessionId ?? null,
			piSessionId: null,
			cwd: partial?.cwd ?? null,
			model: partial?.model ?? null,
			thinkingLevel: partial?.thinkingLevel ?? "medium",
			isStreaming: false,
			status: "idle",
			gitDirty: false,
			messageCount: 0,
			firstMessage: null,
			createdAt: Date.now(),
			sessionFile: null,
		};

		set((s) => ({
			tabs: [...s.tabs, tab],
		}));

		return id;
	},

	removeTab: (tabId) => {
		set((s) => {
			const newTabs = s.tabs.filter((t) => t.id !== tabId);
			const removedTab = s.tabs.find((t) => t.id === tabId);
			const removedCwd = removedTab?.cwd ?? "";

			// Remove terminals owned by this tab's project
			// NOTE: 1.4 will change this to NOT remove terminals (they belong to the project)
			const newTerminalTabs = s.terminalTabs.filter((t) => t.projectPath !== removedCwd);
			// If active terminal was in the removed tab's project, clear it
			const activeTerminalOwned = s.terminalTabs.some(
				(t) => t.id === s.activeTerminalTabId && t.projectPath === removedCwd,
			);

			const updates: Partial<AppStore> = {
				tabs: newTabs,
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

				if (nextTab) {
					// Set session metadata from the next tab.
					// Messages are NOT restored from cache — the async action layer
					// loads them from Pi via session.getMessages.
					updates.messages = [];
					updates.statuses = new Map<string, string>();
					updates.extensionWidgets = new Map<string, ExtensionWidget>();
					updates.sessionId = nextTab.sessionId;
					updates.piSessionId = nextTab.piSessionId;
					updates.model = nextTab.model;
					updates.thinkingLevel = nextTab.thinkingLevel;
					updates.isStreaming = nextTab.isStreaming;
					updates.sessionName = nextTab.name;
					updates.sessionFile = nextTab.sessionFile;
					// Select first terminal in the next tab's project, if any
					const nextTabTerminal = newTerminalTabs.find(
						(t) => t.projectPath === (nextTab.cwd ?? ""),
					);
					updates.activeTerminalTabId = nextTabTerminal?.id ?? null;
				} else {
					// No tabs left — clear everything
					updates.messages = [];
					updates.statuses = new Map<string, string>();
					updates.extensionWidgets = new Map<string, ExtensionWidget>();
					updates.extensionTitle = null;
					updates.sessionId = null;
					updates.piSessionId = null;
					updates.model = null;
					updates.thinkingLevel = "medium";
					updates.isStreaming = false;
					updates.sessionName = null;
					updates.sessionFile = null;
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
			// Snapshot the leaving tab's metadata from current session state
			let updatedTabs = s.tabs;
			if (s.activeTabId) {
				// NOTE: Do NOT overwrite t.sessionId — it holds the PiBun manager ID
				// from session.start. Only sync piSessionId for session list matching.
				updatedTabs = s.tabs.map((t) =>
					t.id === s.activeTabId
						? {
								...t,
								isStreaming: s.isStreaming,
								status: deriveTabStatus(s.isStreaming, s.pendingExtensionUi !== null, t.status),
								messageCount: s.messages.length,
								firstMessage: getFirstUserMessage(s.messages) ?? t.firstMessage,
								model: s.model,
								thinkingLevel: s.thinkingLevel,
								piSessionId: s.piSessionId,
								name: s.sessionName ?? t.name,
								sessionFile: s.sessionFile,
							}
						: t,
				);
			}

			// Select first terminal in the target tab's project, if any
			const targetTerminal = s.terminalTabs.find((t) => t.projectPath === (targetTab?.cwd ?? ""));

			return {
				tabs: updatedTabs,
				activeTabId: tabId,
				// Clear messages/statuses/widgets — the async action layer
				// loads fresh data from Pi via session.getMessages
				messages: [],
				statuses: new Map<string, string>(),
				extensionWidgets: new Map<string, ExtensionWidget>(),
				extensionTitle: null, // Extension title is per-session, clear on switch
				// Set session metadata from target tab
				sessionId: targetTab.sessionId,
				piSessionId: targetTab.piSessionId,
				model: targetTab.model,
				thinkingLevel: targetTab.thinkingLevel,
				isStreaming: targetTab.isStreaming,
				sessionName: targetTab.name,
				sessionFile: targetTab.sessionFile,
				stats: null, // Will be refreshed
				agentStartedAt: 0,
				isCompacting: false,
				isRetrying: false,
				retryAttempt: 0,
				retryMaxAttempts: 0,
				retryDelayMs: 0,
				retryStartedAt: 0,
				// Restore terminal state for target tab
				activeTerminalTabId: targetTerminal?.id ?? null,
				// Close diff panel on tab switch (diff is per-session context)
				diffPanelOpen: false,
				diffPanelFiles: [],
				diffPanelResult: null,
				diffPanelError: null,
				diffPanelSelectedFile: null,
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

	syncActiveTabState: () => {
		const state = get();
		if (!state.activeTabId) return;

		set((s) => ({
			tabs: s.tabs.map((t) =>
				t.id === s.activeTabId
					? {
							...t,
							// NOTE: Do NOT overwrite t.sessionId here — it holds the PiBun manager ID
							// set during session.start. store.sessionId must stay as the routing key.
							piSessionId: s.piSessionId,
							isStreaming: s.isStreaming,
							status: deriveTabStatus(s.isStreaming, s.pendingExtensionUi !== null, t.status),
							messageCount: s.messages.length,
							firstMessage: getFirstUserMessage(s.messages) ?? t.firstMessage,
							model: s.model,
							thinkingLevel: s.thinkingLevel,
							name: s.sessionName ?? t.name,
							sessionFile: s.sessionFile,
						}
					: t,
			),
		}));
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
		const activeTab = state.getActiveTab();
		const projectPath = activeTab?.cwd ?? "";
		const tab: TerminalTab = {
			id: tabId,
			terminalId,
			name: `Terminal ${String(terminalTabCounter)}`,
			cwd,
			isRunning: true,
			groupId: tabId, // Each new terminal starts in its own group
			projectPath,
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
		const projectPath = removedTab?.projectPath ?? state.getActiveTab()?.cwd ?? "";

		// Only consider sibling terminals from the same project for active selection
		const projectTabs = newTabs.filter((t) => t.projectPath === projectPath);

		let newActiveId = state.activeTerminalTabId;
		if (state.activeTerminalTabId === tabId) {
			if (projectTabs.length === 0) {
				newActiveId = null;
			} else if (removedTab) {
				// Prefer a sibling in the same split group first
				const groupSibling = projectTabs.find((t) => t.groupId === removedTab.groupId);
				if (groupSibling) {
					newActiveId = groupSibling.id;
				} else {
					// Fall back to first terminal in the same project
					const first = projectTabs[0];
					newActiveId = first ? first.id : null;
				}
			} else {
				const first = projectTabs[0];
				newActiveId = first ? first.id : null;
			}
		}

		set({
			terminalTabs: newTabs,
			activeTerminalTabId: newActiveId,
			// Close panel if no terminals left for the project
			...(projectTabs.length === 0 ? { terminalPanelOpen: false } : {}),
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
		const activeTermTab = state.activeTerminalTabId
			? state.terminalTabs.find((t) => t.id === state.activeTerminalTabId)
			: null;
		const groupId = activeTermTab ? activeTermTab.groupId : null;
		const activeSessionTab = state.getActiveTab();
		const projectPath = activeSessionTab?.cwd ?? "";

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
			projectPath,
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

	// ==== Workspace persistence state ====
	loadedSessionPaths: [],

	setLoadedSessionPaths: (paths) => {
		set({ loadedSessionPaths: paths });
	},
});
