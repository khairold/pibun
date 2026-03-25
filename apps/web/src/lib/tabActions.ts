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
import { getTransport, reestablishStreamingContext } from "@/wireTransport";
import { deleteComposerDraft, fetchGitStatus } from "./appActions";
import { loadSessionMessages, refreshSessionState, switchSession } from "./sessionActions";

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
// Session Cleanup (multi-session)
// ============================================================================

/**
 * Stop the Pi process for a specific session (fire-and-forget).
 *
 * Used when closing a tab or cleaning up an empty tab. The transport's
 * active session is temporarily set to target the correct process, then
 * restored. Errors are silently ignored (process may already be dead).
 */
function stopSessionProcess(sessionId: string): void {
	try {
		const transport = getTransport();
		const prevActive = transport.activeSessionId;
		transport.setActiveSession(sessionId);
		transport.request("session.stop").catch(() => {});
		transport.setActiveSession(prevActive);
	} catch {
		// Transport not initialized or already disposed — ignore
	}
}

// ============================================================================
// Session Resume (shared between switchTabAction and addAndSwitchTabAction)
// ============================================================================

/**
 * Resume a session for the currently active tab.
 *
 * Three paths:
 * 1. **Reuse** — tab has `sessionId` (Pi process still alive in background):
 *    route transport → refresh state + messages from Pi → done.
 * 2. **Resume from file** — tab has `sessionFile` but no `sessionId`:
 *    start new Pi process → switch to session file → load messages.
 * 3. **Empty** — no session, no file: clear routing, user starts by typing.
 *
 * Uses the `switchGeneration` counter to detect when a newer switch has started.
 * If superseded, the operation bails silently.
 *
 * @param sessionFile The session file to resume, or null if no session.
 * @param tabSessionId The tab's existing session ID (process may still be alive), or null.
 */
async function resumeActiveTabSession(
	sessionFile: string | null,
	tabSessionId: string | null,
): Promise<void> {
	const myGeneration = ++switchGeneration;

	if (tabSessionId) {
		// Path 1: Tab has an existing Pi process — try to reuse it.
		// The process kept running in the background while we were on another tab.
		useStore.getState().setSessionId(tabSessionId);
		getTransport().setActiveSession(tabSessionId);

		try {
			// Refresh session state (model, thinking, streaming status)
			await refreshSessionState();
			if (switchGeneration !== myGeneration) return;

			// Load messages from Pi — may include work completed while away.
			// Force refresh to replace cached messages with authoritative state.
			await loadSessionMessages({ force: true });
			if (switchGeneration !== myGeneration) return;

			// If session is mid-stream, re-establish the streaming context
			// so incoming text_delta events append to the correct message.
			reestablishStreamingContext();

			useStore.getState().syncActiveTabState();
			fetchGitStatus();
		} catch {
			// Process died while we were away — fall through to sessionFile path
			if (switchGeneration !== myGeneration) return;
			useStore.getState().setSessionId(null);

			if (sessionFile) {
				const success = await switchSession(sessionFile);
				if (switchGeneration !== myGeneration) return;
				if (success) {
					useStore.getState().syncActiveTabState();
					fetchGitStatus();
				}
			}
		}
	} else if (sessionFile) {
		// Path 2: No running process, but has a session file — start fresh
		useStore.getState().setSessionId(null);
		const success = await switchSession(sessionFile);
		if (switchGeneration !== myGeneration) return;
		if (success) {
			useStore.getState().syncActiveTabState();
			fetchGitStatus();
		}
	} else {
		// Path 3: No session at all — route transport to null
		// User will start a session by typing (triggers ensureSession)
		getTransport().setActiveSession(null);
	}
}

// ============================================================================
// Tab Switching
// ============================================================================

/**
 * Switch to a different tab — multi-session model.
 *
 * Multiple Pi processes run concurrently. Switching tabs:
 * - Auto-removes the leaving tab if it has zero messages (+ stops its process)
 * - Snapshots the leaving tab's metadata
 * - Reuses the target tab's existing Pi process if alive (instant switch)
 * - Falls back to starting a new process from sessionFile if process died
 *
 * Flow:
 * 0. If leaving tab is empty (0 messages): stop its Pi process, mark for removal
 * 1. `switchTab(tabId)` — snapshot leaving tab, set target metadata, restore cached messages
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

	// 2. Clean up empty leaving tab — stop its Pi process + remove draft.
	if (leavingIsEmpty && leavingTab) {
		if (leavingTab.sessionId) {
			stopSessionProcess(leavingTab.sessionId);
		}
		deleteComposerDraft(leavingTab.id);
	}

	// 3. Resume target session (pass sessionId for process reuse)
	await resumeActiveTabSession(targetTab.sessionFile, targetTab.sessionId);
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

	// Clean up empty leaving tab — stop its Pi process + remove draft
	if (leavingIsEmpty && leavingTab) {
		if (leavingTab.sessionId) {
			stopSessionProcess(leavingTab.sessionId);
		}
		deleteComposerDraft(leavingTab.id);
	}

	// Resume session (new tabs don't have a sessionId — always start fresh)
	await resumeActiveTabSession(partial.sessionFile ?? null, partial.sessionId ?? null);

	return tabId;
}
