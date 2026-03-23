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
