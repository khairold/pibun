/**
 * Project management actions — async operations that coordinate
 * transport calls with Zustand store updates.
 *
 * Used by the sidebar's project list to CRUD project entries.
 * Projects are persisted on the server at `~/.pibun/projects.json`.
 *
 * Pattern: call transport → update store from response.
 * Follows thin bridge principle — server handles persistence,
 * we just update the client-side list.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { PiThinkingLevel, Project } from "@pibun/contracts";
import { createNewTab, switchTabAction } from "./tabActions";

/** Extract a user-friendly error message from any thrown value. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// ============================================================================
// Fetch (load all projects)
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

// ============================================================================
// Add
// ============================================================================

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

// ============================================================================
// Remove
// ============================================================================

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

// ============================================================================
// Update
// ============================================================================

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
		await getTransport().request("project.update", { projectId, ...updates });
		// Refresh to pick up server-side changes
		await fetchProjects();
		return true;
	} catch (err) {
		store.setLastError(`Failed to update project: ${errorMessage(err)}`);
		return false;
	}
}

// ============================================================================
// Open (switch-or-create)
// ============================================================================

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
