/**
 * Git actions — async operations that coordinate
 * transport calls with Zustand store updates.
 *
 * Encapsulates the fetch-git-status → update-store pattern.
 * Called after agent_end events (agent likely modified files),
 * on session start/switch, and on manual refresh.
 *
 * Pattern: call transport → update store from response.
 * Follows thin bridge principle — server runs git commands,
 * we just update the client-side git slice.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";

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
	} catch (err) {
		console.warn("[gitActions] Failed to fetch git status:", err);
		// Don't show error banner — git status is non-critical
		store.resetGit();
	}
}
