/**
 * Tab & session lifecycle actions — coordinate session switching with
 * transport routing and Pi message loading.
 *
 * Sits between UI and the tabsSlice/sessionActions.
 * Handles the async coordination that pure Zustand slices can't:
 * - Setting the active WS session on the transport
 * - Fetching messages from Pi when switching to a tab
 * - Refreshing session state (model, thinking, etc.) after a switch
 * - Starting sessions (single active session model)
 *
 * Single-session model: only one Pi process runs at a time.
 * Starting a new session automatically stops the existing one.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { deleteComposerDraft, fetchGitStatus } from "./appActions";
import { refreshSessionState, switchSession } from "./sessionActions";

// ============================================================================
// Session Start
// ============================================================================

/**
 * Start a new session — stops any existing session, creates a tab, spawns a Pi process.
 *
 * Single-session model: only one Pi process runs at a time. The server
 * automatically stops the existing session when `session.start` is called.
 *
 * Flow:
 * 1. Create a tab in the store
 * 2. Switch to it
 * 3. Clear messages for a fresh start
 * 4. Start a new Pi session (server stops any existing session)
 * 5. Associate the session with the tab
 * 6. Set transport active session for routing
 * 7. Refresh session state (model, thinking, etc.)
 *
 * If session start fails, the tab is removed and an error is shown.
 *
 * @param options Optional CWD for the new session.
 * @returns The new tab ID on success, null on failure.
 */
export async function startSession(options?: { cwd?: string }): Promise<string | null> {
	const store = useStore.getState();

	// 1. Create a new tab
	const tabId = store.addTab({
		...(options?.cwd ? { cwd: options.cwd } : {}),
	});

	// 2. Switch to the new tab
	store.switchTab(tabId);

	// 3. Clear messages for a fresh start
	store.clearMessages();

	// 4. Start a new Pi session (server stops any existing session automatically)
	try {
		const result = await getTransport().request("session.start", {
			...(options?.cwd ? { cwd: options.cwd } : {}),
		});

		// 5. Associate session with tab
		const current = useStore.getState();
		current.updateTab(tabId, { sessionId: result.sessionId });
		current.setSessionId(result.sessionId);

		// 6. Route transport to the new session
		getTransport().setActiveSession(result.sessionId);

		// 7. Refresh state to get model, thinking, session name, etc.
		await refreshSessionState();

		// Sync tab metadata with refreshed state
		useStore.getState().syncActiveTabState();

		return tabId;
	} catch (err) {
		// Session start failed — remove the orphan tab
		useStore.getState().removeTab(tabId);
		const msg = err instanceof Error ? err.message : String(err);
		useStore.getState().setLastError(`Failed to start session: ${msg}`);
		return null;
	}
}

// ============================================================================
// Empty Tab Cleanup
// ============================================================================

/**
 * Remove a tab's UI artifacts after switching away from it.
 * Closes its terminals on the server, deletes the composer draft,
 * and removes the tab from the store.
 *
 * Must be called AFTER the tab is no longer active (post-switchTab).
 * Session stop must happen BEFORE the switch (while transport routes to it).
 */
function cleanupEmptyTab(tabId: string): void {
	const store = useStore.getState();

	// Close terminals owned by the tab's project
	// NOTE: 1.4 will change this to NOT close terminals (they belong to the project)
	const tab = store.tabs.find((t) => t.id === tabId);
	const tabCwd = tab?.cwd ?? "";
	const ownedTerminals = store.terminalTabs.filter((t) => t.projectPath === tabCwd);
	for (const term of ownedTerminals) {
		getTransport()
			.request("terminal.close", { terminalId: term.terminalId })
			.catch(() => {});
	}

	// Delete composer draft
	deleteComposerDraft(tabId);

	// Remove from store (non-active tab — just filters it out)
	store.removeTab(tabId);
}

// ============================================================================
// Tab Switching
// ============================================================================

/**
 * Switch to a different tab — single-session model.
 *
 * Only one Pi process runs at a time. Switching tabs requires:
 * - Auto-removing the leaving tab if it has zero messages (empty session)
 * - Snapshotting the leaving tab's metadata
 * - If the target had a previous session (sessionFile), resuming it:
 *   start a new Pi process → switch to the session file → load messages
 * - If the target has no session, just clear routing (user starts by typing)
 *
 * Flow:
 * 0. If leaving tab is empty (0 messages): stop its Pi process, mark for removal
 * 1. `switchTab(tabId)` — snapshot leaving tab, set target metadata, clear messages
 * 1b. If leaving tab was empty: remove it from store + clean up terminals/draft
 * 2. If target has a sessionFile to resume:
 *    a. Clear sessionId (so ensureSession starts a fresh Pi process)
 *    b. `switchSession(sessionFile)` — handles: start process → switch file → load messages
 *    c. Sync tab metadata with refreshed state
 * 3. If target has no session: route transport to null
 */
export async function switchTabAction(tabId: string): Promise<void> {
	const store = useStore.getState();

	// Find target tab BEFORE switching (switchTab mutates state)
	const targetTab = store.tabs.find((t) => t.id === tabId);
	if (!targetTab || targetTab.id === store.activeTabId) return;

	// ── Auto-remove empty session ────────────────────────────────
	// If the leaving tab has zero messages, it's an unused session.
	// Stop its Pi process (while transport still routes to it), then
	// remove the tab after switching.
	const leavingTab = store.getActiveTab();
	const leavingIsEmpty = leavingTab !== null && store.messages.length === 0;

	if (leavingIsEmpty && leavingTab.sessionId) {
		try {
			if (store.isStreaming) {
				try {
					await getTransport().request("session.abort");
				} catch {
					// Continue even if abort fails
				}
			}
			await getTransport().request("session.stop");
		} catch (err) {
			console.warn("[switchTabAction] Failed to stop empty session:", err);
			// Continue — tab removal shouldn't be blocked by stop failure
		}
	}

	// 1. Switch tab in store — snapshots leaving tab, clears messages
	store.switchTab(tabId);

	// 1b. Clean up the empty leaving tab (now non-active)
	if (leavingIsEmpty && leavingTab) {
		cleanupEmptyTab(leavingTab.id);
	}

	// 2. Resume target session if it has a session file
	if (targetTab.sessionFile) {
		// Clear sessionId so ensureSession starts a fresh Pi process
		// (the old process was stopped when another session started)
		useStore.getState().setSessionId(null);

		// switchSession handles: ensureSession (start process) → switch to file → load messages → refresh state
		const success = await switchSession(targetTab.sessionFile);
		if (success) {
			// Sync tab metadata with refreshed session state
			useStore.getState().syncActiveTabState();
			// Refresh git status for the session's CWD
			fetchGitStatus();
		}
	} else {
		// No session to resume — route transport to null
		// User will start a session by typing (triggers ensureSession)
		getTransport().setActiveSession(null);
	}
}
