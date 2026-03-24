/**
 * App-level actions — async operations that coordinate
 * transport calls with Zustand store updates.
 *
 * Consolidates: git, project, plugin, settings, and terminal actions.
 * All follow the same pattern: call transport → update store from response.
 *
 * The server handles persistence and subprocess management.
 * These functions just bridge transport ↔ store.
 *
 * @module
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { PiThinkingLevel, Project, ThemePreference } from "@pibun/contracts";
import { createNewTab, switchTabAction } from "./tabActions";
import { THEME_STORAGE_KEY, applyTheme, resolveTheme } from "./themes";

// ============================================================================
// Helpers
// ============================================================================

/** Extract a user-friendly error message from any thrown value. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// ============================================================================
// Git Actions
// ============================================================================

/**
 * Fetch git status for the active session's CWD and update the store.
 *
 * Called:
 * - After `agent_end` events (files may have changed)
 * - On session start/switch (new CWD may have different git state)
 * - On manual refresh (user clicks refresh in GitStatusBar)
 * - On `server.welcome` (initial connection)
 *
 * Silent on failure — git status is informational, not critical.
 */
export async function fetchGitStatus(): Promise<void> {
	const store = useStore.getState();
	if (!store.sessionId) {
		store.resetGit();
		return;
	}

	store.setGitLoading(true);

	try {
		const result = await getTransport().request("git.status", {});
		const { status } = result;
		store.setGitStatus(status.isRepo, status.branch, status.files, status.isDirty);

		// Sync gitDirty to the active tab for tab bar indicator
		const current = useStore.getState();
		if (current.activeTabId) {
			current.updateTab(current.activeTabId, { gitDirty: status.isDirty });
		}
	} catch (err) {
		console.warn("[gitActions] Failed to fetch git status:", err);
		// Don't show error banner — git status is non-critical
		store.resetGit();

		// Clear gitDirty on the active tab too
		const current = useStore.getState();
		if (current.activeTabId) {
			current.updateTab(current.activeTabId, { gitDirty: false });
		}
	}
}

/**
 * Fetch the diff for a specific file and update the store.
 *
 * Called when the user clicks a file in the GitChangedFiles panel.
 * If the file is already selected, clicking again deselects it.
 *
 * @param filePath - The file path to diff (relative to repo root).
 */
export async function fetchGitDiff(filePath: string): Promise<void> {
	const store = useStore.getState();

	// Toggle off if clicking the already-selected file
	if (store.selectedDiffPath === filePath) {
		store.setSelectedDiff(null, null);
		return;
	}

	store.setDiffLoading(true);
	store.setSelectedDiff(filePath, null);

	try {
		const result = await getTransport().request("git.diff", { path: filePath });
		store.setSelectedDiff(filePath, result.diff.diff);
	} catch (err) {
		console.warn("[gitActions] Failed to fetch diff for", filePath, err);
		store.setSelectedDiff(null, null);
	}
}

// ============================================================================
// Project Actions
// ============================================================================

/**
 * Fetch the full project list from the server and populate the store.
 *
 * Called on connect (via server.welcome) and after add/remove operations.
 * Returns the project list on success, empty array on failure.
 */
export async function fetchProjects(): Promise<Project[]> {
	const store = useStore.getState();
	store.setProjectsLoading(true);

	try {
		const result = await getTransport().request("project.list");
		store.setProjects(result.projects);
		return result.projects;
	} catch (err) {
		console.warn("[projectActions] Failed to fetch projects:", err);
		return [];
	} finally {
		store.setProjectsLoading(false);
	}
}

/**
 * Add a project directory.
 *
 * Server generates ID, defaults name to directory basename, deduplicates
 * by CWD (returns existing project with updated lastOpened if same path).
 *
 * Returns the added/existing project on success, null on failure.
 */
export async function addProject(cwd: string, name?: string): Promise<Project | null> {
	const store = useStore.getState();

	try {
		const params: { cwd: string; name?: string } = { cwd };
		if (name) {
			params.name = name;
		}
		const result = await getTransport().request("project.add", params);
		// Refresh the full list to stay in sync (server may have deduped)
		await fetchProjects();
		return result.project;
	} catch (err) {
		store.setLastError(`Failed to add project: ${errorMessage(err)}`);
		return null;
	}
}

/**
 * Remove a project by ID.
 *
 * Returns true on success, false on failure.
 */
export async function removeProject(projectId: string): Promise<boolean> {
	const store = useStore.getState();

	try {
		await getTransport().request("project.remove", { projectId });
		store.removeProject(projectId);
		return true;
	} catch (err) {
		store.setLastError(`Failed to remove project: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Update a project's metadata on the server.
 *
 * Only the provided fields are updated. Returns true on success.
 */
export async function updateProject(
	projectId: string,
	updates: {
		name?: string;
		favoriteModel?: { provider: string; modelId: string } | null;
		defaultThinking?: PiThinkingLevel | null;
		lastOpened?: number;
		sessionCount?: number;
	},
): Promise<boolean> {
	const store = useStore.getState();

	try {
		await getTransport().request("project.update", {
			projectId,
			...updates,
		});
		// Refresh to pick up server-side changes
		await fetchProjects();
		return true;
	} catch (err) {
		store.setLastError(`Failed to update project: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Open a project — switches to an existing tab with the same CWD,
 * or creates a new tab if none exists.
 *
 * Also sets the project as active and updates its `lastOpened` timestamp.
 *
 * When multiple tabs share the same CWD, switches to the most recently
 * created one (last in the tabs array with matching CWD).
 *
 * @returns `"switched"` if switched to existing tab, `"created"` if new tab was created, `null` on failure.
 */
export async function openProject(project: Project): Promise<"switched" | "created" | null> {
	const store = useStore.getState();

	// Set as active project immediately for visual feedback
	store.setActiveProjectId(project.id);

	// Update lastOpened on the server (fire-and-forget — don't block the switch)
	updateProject(project.id, { lastOpened: Date.now() }).catch((err: unknown) => {
		console.warn("[openProject] Failed to update lastOpened:", err);
	});

	// Check for an existing tab with the same CWD
	const existingTab = findTabForCwd(store.tabs, project.cwd);

	if (existingTab) {
		// Tab already open for this CWD — switch to it
		if (existingTab.id !== store.activeTabId) {
			await switchTabAction(existingTab.id);
		}
		return "switched";
	}

	// No existing tab — create a new one with the project's CWD
	const tabId = await createNewTab({ cwd: project.cwd });
	return tabId ? "created" : null;
}

/**
 * Find the best tab to switch to for a given CWD.
 *
 * Prefers the active tab if it matches. Otherwise returns the most
 * recently created tab with matching CWD (last in the array).
 * Returns null if no matching tab exists.
 */
function findTabForCwd(
	tabs: ReadonlyArray<{ id: string; cwd: string | null }>,
	cwd: string,
): { id: string } | null {
	// Normalize: strip trailing slash for comparison
	const normalizedCwd = cwd.replace(/\/$/, "");

	let lastMatch: { id: string } | null = null;
	for (const tab of tabs) {
		if (tab.cwd && tab.cwd.replace(/\/$/, "") === normalizedCwd) {
			lastMatch = tab;
		}
	}
	return lastMatch;
}

// ============================================================================
// Plugin Actions
// ============================================================================

/**
 * Fetch the list of installed plugins from the server.
 *
 * Called on `server.welcome` to populate the plugins store.
 * Automatically activates panels for enabled plugins.
 */
export async function fetchPlugins(): Promise<void> {
	const store = useStore.getState();
	store.setPluginsLoading(true);

	try {
		const transport = getTransport();
		const result = await transport.request("plugin.list");
		store.setPlugins(result.plugins);

		// Auto-activate panels for enabled plugins (if not already active)
		for (const plugin of result.plugins) {
			if (!plugin.enabled || plugin.error) continue;
			for (const panel of plugin.manifest.panels) {
				const panelKey = `${plugin.manifest.id}:${panel.id}`;
				store.setPluginPanelOpen(panelKey, true);
			}
		}
	} catch (err) {
		console.error("[PiBun] Failed to fetch plugins:", err);
	} finally {
		store.setPluginsLoading(false);
	}
}

/**
 * Install a plugin from a URL or local file path.
 *
 * After installation, refreshes the plugin list to pick up the new plugin
 * and auto-activates its panels.
 */
export async function installPlugin(source: string): Promise<void> {
	const transport = getTransport();
	await transport.request("plugin.install", { source });
	// Refresh full list (re-scans directory, activates new panels)
	await fetchPlugins();
}

/**
 * Uninstall a plugin by its ID.
 *
 * Closes all panels belonging to the plugin before removing it,
 * then refreshes the plugin list.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
	const store = useStore.getState();

	// Close all panels for this plugin before uninstalling
	const plugin = store.plugins.find((p) => p.manifest.id === pluginId);
	if (plugin) {
		for (const panel of plugin.manifest.panels) {
			const panelKey = `${pluginId}:${panel.id}`;
			store.setPluginPanelOpen(panelKey, false);
		}
	}

	const transport = getTransport();
	await transport.request("plugin.uninstall", { pluginId });
	// Refresh full list
	await fetchPlugins();
}

/**
 * Enable or disable a plugin.
 *
 * When enabling, auto-activates all panels. When disabling, closes all panels.
 * Updates the store optimistically then confirms via server round-trip.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
	const store = useStore.getState();

	// Optimistic update — toggle panels immediately
	const plugin = store.plugins.find((p) => p.manifest.id === pluginId);
	if (plugin) {
		for (const panel of plugin.manifest.panels) {
			const panelKey = `${pluginId}:${panel.id}`;
			store.setPluginPanelOpen(panelKey, enabled);
		}
	}

	const transport = getTransport();
	await transport.request("plugin.setEnabled", { pluginId, enabled });
	// Refresh to get canonical server state
	await fetchPlugins();
}

/**
 * Resolve a plugin panel's component URL for iframe embedding.
 *
 * - Absolute URLs (http://, https://) are returned as-is.
 * - Relative paths (./panel.html) are resolved to the server's plugin
 *   asset route: `/plugin/{pluginId}/{path}`.
 */
export function resolvePluginComponentUrl(pluginId: string, component: string): string {
	// Absolute URL — use as-is
	if (component.startsWith("http://") || component.startsWith("https://")) {
		return component;
	}

	// Relative path — resolve to plugin asset route
	const cleanPath = component.replace(/^\.\//, "");
	return `/plugin/${pluginId}/${cleanPath}`;
}

// ============================================================================
// Settings Actions
// ============================================================================

/**
 * Fetch settings from the server and apply them.
 *
 * Called on `server.welcome` to sync server-persisted settings.
 * If the server has a saved theme that differs from localStorage,
 * the server's value wins (handles desktop webview state resets).
 */
export async function fetchAndApplySettings(): Promise<void> {
	try {
		const transport = getTransport();
		const result = await transport.request("settings.get");
		const { settings } = result;

		if (settings.themeId) {
			const currentLocalPref = localStorage.getItem(THEME_STORAGE_KEY);

			// Server has a saved preference — apply it if different from current
			if (settings.themeId !== currentLocalPref) {
				applyTheme(resolveTheme(settings.themeId));
				localStorage.setItem(THEME_STORAGE_KEY, settings.themeId);
			}
		}
	} catch {
		// Settings fetch failed (standalone server without settings support, etc.)
		// Silently fall back to localStorage-only persistence
	}
}

/**
 * Persist theme preference to the server.
 *
 * Called from ThemeSelector after applying a theme locally.
 * Fire-and-forget — doesn't block the UI on server response.
 */
export function persistThemeToServer(preference: ThemePreference): void {
	try {
		const transport = getTransport();
		// Fire-and-forget — don't await, don't block UI
		transport.request("settings.update", { themeId: preference }).catch(() => {
			// Silent failure — localStorage is the primary store in browser mode
		});
	} catch {
		// Transport not ready — skip server persistence
	}
}

// ============================================================================
// Terminal Actions
// ============================================================================

/**
 * Create a new terminal tab and spawn a PTY on the server.
 * Optionally pass a CWD; defaults to the active session's CWD.
 */
export async function createTerminal(cwd?: string): Promise<string | null> {
	const store = useStore.getState();
	const transport = getTransport();

	// Resolve CWD: explicit → active tab's CWD → no CWD (server will use process.cwd())
	let resolvedCwd = cwd;
	if (!resolvedCwd) {
		const activeTab = store.getActiveTab();
		if (activeTab?.cwd) {
			resolvedCwd = activeTab.cwd;
		}
	}

	try {
		const result = await transport.request("terminal.create", {
			...(resolvedCwd ? { cwd: resolvedCwd } : {}),
		});
		const terminalId = result.terminalId;

		// Add terminal tab to store and open panel
		const tabId = store.addTerminalTab(terminalId, resolvedCwd ?? "~");
		store.setTerminalPanelOpen(true);

		return tabId;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		useStore.getState().setLastError(`Failed to create terminal: ${msg}`);
		return null;
	}
}

/**
 * Close a terminal tab and kill the PTY on the server.
 */
export async function closeTerminal(tabId: string): Promise<void> {
	const store = useStore.getState();
	const tab = store.terminalTabs.find((t) => t.id === tabId);
	if (!tab) return;

	const transport = getTransport();

	// Remove from store first (prevents re-entrant issues — MEMORY #35 pattern)
	store.removeTerminalTab(tabId);

	try {
		await transport.request("terminal.close", {
			terminalId: tab.terminalId,
		});
	} catch {
		// Terminal may already be dead — ignore errors
	}
}

/**
 * Write data to a terminal's stdin.
 */
export function writeTerminal(terminalId: string, data: string): void {
	const transport = getTransport();
	transport.request("terminal.write", { terminalId, data }).catch((err: unknown) => {
		console.error("[Terminal] Failed to write:", err);
	});
}

/**
 * Resize a terminal's PTY dimensions.
 */
export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
	const transport = getTransport();
	transport.request("terminal.resize", { terminalId, cols, rows }).catch((err: unknown) => {
		console.error("[Terminal] Failed to resize:", err);
	});
}

// ============================================================================
// UI State Persistence
// ============================================================================

/**
 * localStorage keys for persisted UI state.
 * Theme is handled separately via THEME_STORAGE_KEY in themes.ts.
 */
const UI_STORAGE_KEY = "pibun-ui-state";

/** Shape of persisted UI state in localStorage. */
interface PersistedUiState {
	sidebarOpen?: boolean;
	activeTabId?: string | null;
}

/** Debounce delay for writing UI state to localStorage (ms). */
const UI_PERSIST_DEBOUNCE_MS = 500;

/**
 * Read persisted UI state from localStorage.
 * Returns null if nothing is saved or parsing fails.
 */
export function getPersistedUiState(): PersistedUiState | null {
	try {
		const raw = localStorage.getItem(UI_STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as PersistedUiState;
	} catch {
		return null;
	}
}

/**
 * Apply persisted UI state to the Zustand store.
 *
 * Called once during app initialization (before React renders).
 * Only applies values that are present in the persisted state —
 * missing keys use the store's default values.
 *
 * Note: activeTabId is restored but only takes effect if tabs exist
 * (tabs are recreated from sessions, and the persisted activeTabId
 * will be matched after session list is loaded).
 */
export function restorePersistedUiState(): void {
	const persisted = getPersistedUiState();
	if (!persisted) return;

	const store = useStore.getState();

	if (persisted.sidebarOpen !== undefined) {
		store.setSidebarOpen(persisted.sidebarOpen);
	}

	// activeTabId is saved but restored later after tabs are created.
	// Store it for deferred restoration.
	if (persisted.activeTabId !== undefined) {
		_deferredActiveTabId = persisted.activeTabId;
	}
}

/** Deferred active tab ID — restored after tabs are created from sessions. */
let _deferredActiveTabId: string | null | undefined;

/**
 * Get the deferred active tab ID that was persisted.
 * Returns undefined if no deferred ID is pending.
 * Calling this clears the deferred value (one-shot).
 */
export function consumeDeferredActiveTabId(): string | null | undefined {
	const id = _deferredActiveTabId;
	_deferredActiveTabId = undefined;
	return id;
}

/**
 * Initialize UI state persistence — subscribe to store changes
 * and write to localStorage on debounced timer + beforeunload.
 *
 * Call once during app initialization. Returns a cleanup function.
 */
export function initUiPersistence(): () => void {
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	/** Write current UI state to localStorage immediately. */
	function flush(): void {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		const state = useStore.getState();
		const persisted: PersistedUiState = {
			sidebarOpen: state.sidebarOpen,
			activeTabId: state.activeTabId,
		};

		try {
			localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(persisted));
		} catch {
			// localStorage full or unavailable — ignore
		}
	}

	/** Schedule a debounced write. */
	function schedulePersist(): void {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(flush, UI_PERSIST_DEBOUNCE_MS);
	}

	// Subscribe to relevant store fields
	const unsubscribe = useStore.subscribe((state, prevState) => {
		if (
			state.sidebarOpen !== prevState.sidebarOpen ||
			state.activeTabId !== prevState.activeTabId
		) {
			schedulePersist();
		}
	});

	// Flush on page unload (tab close, navigation, reload)
	window.addEventListener("beforeunload", flush);

	return () => {
		unsubscribe();
		window.removeEventListener("beforeunload", flush);
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}
	};
}
