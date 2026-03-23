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
