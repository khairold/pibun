/**
 * Tab management actions — coordinate tab switching with
 * transport session routing and Pi message loading.
 *
 * Sits between TabBar UI and the tabsSlice/sessionActions.
 * Handles the async coordination that pure Zustand slices can't:
 * - Setting the active WS session on the transport
 * - Fetching messages from Pi when switching to a tab with no cached messages
 * - Refreshing session state (model, thinking, etc.) after a switch
 * - Creating new tabs with their own Pi processes
 *
 * Dependency direction: tabActions → sessionActions (not circular).
 * Tab creation/association during session.start is handled inline
 * in sessionActions.ts and Composer.tsx to avoid circular imports.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { deleteComposerDraft, fetchGitStatus } from "./appActions";
import { loadSessionMessages, refreshSessionState } from "./sessionActions";

// ============================================================================
// Tab Close
// ============================================================================

/**
 * Close a tab — stops its Pi session and removes the tab from the store.
 *
 * Flow:
 * 1. Find the tab to close
 * 2. If the tab has a Pi session:
 *    a. Abort streaming if active
 *    b. Stop the Pi process via `session.stop` (targeting the tab's sessionId)
 * 3. Remove the tab from the store (store handles adjacent tab switching)
 * 4. Route transport to the new active tab's session (or null if last tab)
 * 5. If the new active tab has a session, refresh its state; fetch messages if cache empty
 *
 * If this was the last tab, the store clears everything → empty state.
 * Session stop failures don't block tab removal (no orphan UI).
 */
export async function closeTab(tabId: string): Promise<void> {
	const store = useStore.getState();
	const transport = getTransport();

	// Find the tab we're closing
	const tabToClose = store.tabs.find((t) => t.id === tabId);
	if (!tabToClose) return;

	const isActiveTab = tabId === store.activeTabId;

	// ── Stop the Pi session ──────────────────────────────────────
	if (tabToClose.sessionId) {
		// Save and temporarily switch transport to target the closing tab's session
		const previousActiveSession = transport.activeSessionId;
		transport.setActiveSession(tabToClose.sessionId);

		try {
			// Abort streaming first — session.stop may hang if agent is running
			if (tabToClose.isStreaming) {
				try {
					await transport.request("session.abort");
				} catch {
					// Continue even if abort fails
				}
			}

			await transport.request("session.stop");
		} catch (err) {
			console.warn(`[closeTab] Failed to stop session for tab ${tabId}:`, err);
			// Continue with tab removal — don't leave orphan UI
		}

		// Restore transport routing if we didn't close the active tab
		if (!isActiveTab) {
			transport.setActiveSession(previousActiveSession);
		}
	}

	// ── Determine next tab before removal ────────────────────────
	// We need this to know if we should fetch messages after removal
	let nextTab: { id: string; sessionId: string | null } | null = null;
	if (isActiveTab) {
		const oldIndex = store.tabs.findIndex((t) => t.id === tabId);
		const remaining = store.tabs.filter((t) => t.id !== tabId);
		const candidate = remaining[oldIndex > 0 ? oldIndex - 1 : 0] ?? null;
		if (candidate) {
			nextTab = { id: candidate.id, sessionId: candidate.sessionId };
		}
	}

	// Check if the next tab has cached messages BEFORE removal
	// (removeTab deletes the closed tab's cache but not others')
	const nextTabHasCache = nextTab ? (store.tabMessages.get(nextTab.id)?.length ?? 0) > 0 : false;

	// ── Clean up composer draft for the closed tab ──────────────
	deleteComposerDraft(tabId);

	// ── Close terminals owned by this tab ────────────────────────
	const ownedTerminals = store.terminalTabs.filter((t) => t.ownerTabId === tabId);
	for (const term of ownedTerminals) {
		transport.request("terminal.close", { terminalId: term.terminalId }).catch(() => {});
	}

	// ── Remove the tab ───────────────────────────────────────────
	// The store handles: adjacent tab switching, session state restore,
	// message cache restore, and empty state if last tab.
	store.removeTab(tabId);

	// ── Route transport to new active tab ────────────────────────
	if (isActiveTab) {
		if (nextTab?.sessionId) {
			transport.setActiveSession(nextTab.sessionId);

			// Fetch messages from Pi if the cache was empty
			if (!nextTabHasCache) {
				await loadSessionMessages();
			}

			// Refresh session state for live data (model, thinking, etc.)
			await refreshSessionState();

			// Sync tab metadata with refreshed state
			useStore.getState().syncActiveTabState();
		} else {
			// No session on the next tab, or no next tab at all
			transport.setActiveSession(null);
		}
	}
}

// ============================================================================
// Tab Creation
// ============================================================================

/**
 * Create a new tab and spawn a Pi process for it.
 *
 * Flow:
 * 1. Create a tab in the store
 * 2. Switch to it (saves current tab's messages to cache)
 * 3. Clear messages for the fresh tab
 * 4. Start a new Pi session with `keepExisting: true` (preserves other tabs' sessions)
 * 5. Associate the session with the tab
 * 6. Set transport active session for routing
 * 7. Refresh session state (model, thinking, etc.)
 *
 * If session start fails, the tab is removed and an error is shown.
 *
 * @param options Optional CWD for the new session.
 * @returns The new tab ID on success, null on failure.
 */
export async function createNewTab(options?: { cwd?: string }): Promise<string | null> {
	const store = useStore.getState();

	// 1. Create a new tab
	const tabId = store.addTab({
		...(options?.cwd ? { cwd: options.cwd } : {}),
	});

	// 2. Switch to the new tab — saves current tab's messages, activates new tab
	store.switchTab(tabId);

	// 3. Clear messages for a fresh start (switchTab restores empty cache)
	store.clearMessages();

	// 4. Start a new Pi session (keepExisting prevents killing other tabs' sessions)
	try {
		const result = await getTransport().request("session.start", {
			keepExisting: true,
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
		useStore.getState().setLastError(`Failed to create new tab: ${msg}`);
		return null;
	}
}

// ============================================================================
// Tab Switching
// ============================================================================

/**
 * Switch to a different tab — coordinated with transport and Pi.
 *
 * Flow:
 * 1. Call `tabsSlice.switchTab(tabId)` — saves current messages, restores cached state
 * 2. Set `transport.setActiveSession(targetSessionId)` — route WS requests
 * 3. If target tab has a sessionId but no cached messages → fetch from Pi
 * 4. If target tab has a sessionId → refresh session state
 */
export async function switchTabAction(tabId: string): Promise<void> {
	const store = useStore.getState();

	// Find target tab BEFORE switching (switchTab mutates state)
	const targetTab = store.tabs.find((t) => t.id === tabId);
	if (!targetTab || targetTab.id === store.activeTabId) return;

	// Check if we have cached messages for this tab
	const hasCachedMessages = (store.tabMessages.get(tabId)?.length ?? 0) > 0;

	// 1. Switch tab in store — saves current, restores cached
	store.switchTab(tabId);

	// 2. Route transport to target session
	getTransport().setActiveSession(targetTab.sessionId);

	// 3. If target has a session but no cached messages, fetch from Pi
	if (targetTab.sessionId && !hasCachedMessages) {
		await loadSessionMessages();
	}

	// 4. Refresh session state for live data (model, thinking, streaming status)
	if (targetTab.sessionId) {
		await refreshSessionState();
		// Refresh git status for the new tab's CWD
		fetchGitStatus();
	}
}

// Note: Background tab status updates (streaming, waiting, error) are handled
// inline in wireTransport.ts pi.event handler for efficiency — all status
// fields (isStreaming, status) are updated together on each event.
