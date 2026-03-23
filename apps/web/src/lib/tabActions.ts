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
import { loadSessionMessages, refreshSessionState } from "./sessionActions";

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
	}
}

// ============================================================================
// Background Tab Updates
// ============================================================================

/**
 * Update a tab's streaming state by session ID.
 *
 * Called when Pi events arrive for non-active tabs so the tab bar
 * streaming indicator stays accurate.
 */
export function updateTabStreamingBySessionId(sessionId: string, isStreaming: boolean): void {
	const store = useStore.getState();
	const tab = store.tabs.find((t) => t.sessionId === sessionId);
	if (tab) {
		store.updateTab(tab.id, { isStreaming });
	}
}
