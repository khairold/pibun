/**
 * Workspace actions — manage loaded sessions in the sidebar.
 *
 * "Loaded" sessions are ones the user has explicitly chosen to keep
 * visible in the sidebar. They persist across app restarts.
 * Running sessions auto-appear and auto-transition to loaded on stop.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";

/**
 * Fetch the list of loaded session paths from the server.
 * Called on app startup to restore sidebar state.
 */
export async function fetchLoadedSessionPaths(): Promise<string[]> {
	try {
		const result = await getTransport().request("workspace.getLoaded");
		useStore.getState().setLoadedSessionPaths(result.sessionPaths);
		return result.sessionPaths;
	} catch (err) {
		console.warn("[workspaceActions] Failed to fetch loaded sessions:", err);
		return [];
	}
}

/**
 * Add a session to the sidebar loaded list.
 * Called when user loads a past session from the browser, or when
 * a running session stops (auto-transition to loaded).
 */
export async function addLoadedSession(sessionPath: string): Promise<void> {
	try {
		const result = await getTransport().request("workspace.addLoaded", { sessionPath });
		useStore.getState().setLoadedSessionPaths(result.sessionPaths);
	} catch (err) {
		console.warn("[workspaceActions] Failed to add loaded session:", err);
	}
}

/**
 * Remove a session from the sidebar loaded list.
 * The session data is untouched — it just disappears from the sidebar.
 */
export async function removeLoadedSession(sessionPath: string): Promise<void> {
	try {
		const result = await getTransport().request("workspace.removeLoaded", { sessionPath });
		useStore.getState().setLoadedSessionPaths(result.sessionPaths);
	} catch (err) {
		console.warn("[workspaceActions] Failed to remove loaded session:", err);
	}
}
