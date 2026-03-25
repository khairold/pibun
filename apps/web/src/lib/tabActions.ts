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
// Switch Generation (race condition guard)
// ============================================================================

/**
 * Monotonically increasing counter to detect stale tab/session switch operations.
 *
 * When the user switches tabs rapidly, multiple `resumeActiveTabSession` calls
 * overlap. Each call spawns a Pi process via `session.start`. The server's single-
 * session model means each new `session.start` kills the previous process. If a
 * stale switch then calls `session.switchSession` targeting the killed process,
 * the server returns "Session not found" — which is correct server behavior but
 * a confusing error for the user.
 *
 * The generation counter lets each async switch operation detect if it's been
 * superseded and bail out silently instead of surfacing stale errors.
 */
let switchGeneration = 0;

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

// ============================================================================
// Session Resume (shared between switchTabAction and addAndSwitchTabAction)
// ============================================================================

/**
 * Resume a session for the currently active tab.
 *
 * Handles the async work after a tab switch: start Pi process, load session
 * messages, refresh state. Called by both switchTabAction and addAndSwitchTabAction.
 *
 * Uses the `switchGeneration` counter to detect when a newer switch has started.
 * If superseded, the operation bails silently — the newer switch will handle
 * everything. This prevents "Session not found" errors from rapid switching.
 *
 * @param sessionFile The session file to resume, or null if no session.
 */
async function resumeActiveTabSession(sessionFile: string | null): Promise<void> {
	const myGeneration = ++switchGeneration;

	if (sessionFile) {
		// Clear sessionId so ensureSession starts a fresh Pi process
		// (the old process was stopped when another session started)
		useStore.getState().setSessionId(null);

		// switchSession handles: ensureSession (start process) → switch to file → load messages → refresh state
		const success = await switchSession(sessionFile);

		// Bail if a newer switch has started — our session was likely killed by it
		if (switchGeneration !== myGeneration) return;

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

	// Capture leaving tab info for server-side cleanup (fire-and-forget)
	const leavingTab = store.getActiveTab();
	const leavingIsEmpty = leavingTab !== null && store.messages.length === 0;

	// 1. Switch tab in store — snapshots leaving tab, clears messages.
	//    If the leaving tab is empty (0 messages), it's auto-removed synchronously
	//    in the same state update — no flicker.
	store.switchTab(tabId);

	// 2. Clean up empty leaving tab's UI artifacts (draft).
	//    No need to call session.stop — session.start (in ensureSession below)
	//    automatically stops any existing session on the server.
	if (leavingIsEmpty && leavingTab) {
		deleteComposerDraft(leavingTab.id);
	}

	// 3. Resume target session
	await resumeActiveTabSession(targetTab.sessionFile);
}

/**
 * Atomically create a new tab, switch to it, and resume a session — single-session model.
 *
 * Uses store.addAndSwitchTab() to create the tab and remove the empty leaving tab
 * in a single store update, preventing the flash of both tabs appearing momentarily.
 * Then performs the async session resume (start Pi process, load messages, etc.).
 *
 * @param partial Tab creation params (cwd, sessionFile, etc.)
 * @returns The new tab ID.
 */
export async function addAndSwitchTabAction(
	partial: Partial<
		Pick<
			import("@pibun/contracts").Session,
			| "name"
			| "sessionId"
			| "piSessionId"
			| "cwd"
			| "model"
			| "thinkingLevel"
			| "sessionFile"
			| "firstMessage"
			| "messageCount"
		>
	>,
): Promise<string> {
	const store = useStore.getState();

	// Capture leaving tab info for draft cleanup
	const leavingTab = store.getActiveTab();
	const leavingIsEmpty = leavingTab !== null && store.messages.length === 0;

	// Atomic: create tab + snapshot leaving tab + remove empty leaving tab + switch
	const tabId = store.addAndSwitchTab(partial);

	// Clean up empty leaving tab's draft
	if (leavingIsEmpty && leavingTab) {
		deleteComposerDraft(leavingTab.id);
	}

	// Resume session
	await resumeActiveTabSession(partial.sessionFile ?? null);

	return tabId;
}
