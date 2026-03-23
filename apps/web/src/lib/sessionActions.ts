/**
 * Session management actions — async operations that coordinate
 * transport calls with Zustand store updates.
 *
 * Used by UI components (New Session button, Fork dialog, etc.)
 * to perform session lifecycle operations cleanly.
 *
 * Pattern: call transport → update store → refresh state.
 * Follows thin bridge principle — Pi handles all session state internally,
 * we just clear our local message cache and re-fetch.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { WsForkableMessage, WsSessionSummary } from "@pibun/contracts";

/** Extract a user-friendly error message from any thrown value. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/**
 * Ensure a session is active. If none exists, starts one.
 * Returns true if a session is ready, false if start failed.
 */
async function ensureSession(): Promise<boolean> {
	const { sessionId, setSessionId, setLastError } = useStore.getState();
	if (sessionId) return true;

	try {
		const result = await getTransport().request("session.start", {});
		setSessionId(result.sessionId);
		return true;
	} catch (err) {
		setLastError(`Failed to start session: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Refresh session state from Pi after a session change (new, fork, switch).
 * Fetches get_state to update model/thinking/streaming/name info.
 */
async function refreshSessionState(): Promise<void> {
	try {
		const result = await getTransport().request("session.getState");
		const store = useStore.getState();
		if (result.state.model) {
			store.setModel(result.state.model);
		}
		store.setThinkingLevel(result.state.thinkingLevel);
		store.setIsStreaming(result.state.isStreaming);
		store.setSessionName(result.state.sessionName ?? null);
		store.setSessionFile(result.state.sessionFile ?? null);
	} catch (err) {
		console.warn("[sessionActions] Failed to refresh state:", err);
	}
}

/**
 * Start a new session within the current Pi process.
 *
 * Flow:
 * 1. Ensure a session exists (spawns Pi process if needed)
 * 2. Call session.new → Pi creates a fresh session
 * 3. Clear local messages
 * 4. Refresh session state
 *
 * Returns true on success, false on failure.
 */
export async function startNewSession(): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	const ready = await ensureSession();
	if (!ready) return false;

	try {
		await getTransport().request("session.new");
		// Clear local messages — Pi starts a fresh session internally
		store.clearMessages();
		store.setIsStreaming(false);
		// Refresh state to pick up new session info
		await refreshSessionState();
		return true;
	} catch (err) {
		store.setLastError(`Failed to create new session: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Get the list of messages that can be forked from.
 *
 * Returns the list on success, null on failure.
 */
export async function getForkableMessages(): Promise<WsForkableMessage[] | null> {
	const store = useStore.getState();
	const ready = await ensureSession();
	if (!ready) return null;

	try {
		const result = await getTransport().request("session.getForkMessages");
		return result.messages;
	} catch (err) {
		store.setLastError(`Failed to get fork messages: ${errorMessage(err)}`);
		return null;
	}
}

/**
 * Fetch session stats (tokens, cost) from Pi and update the store.
 *
 * Called after agent_end to show updated usage. Also callable on demand
 * (e.g., by a refresh button in the stats display).
 *
 * Returns true on success, false on failure (silent — doesn't show error banner).
 */
export async function fetchSessionStats(): Promise<boolean> {
	const store = useStore.getState();
	if (!store.sessionId) return false;

	try {
		const result = await getTransport().request("session.getStats");
		store.setStats(result.stats);
		return true;
	} catch (err) {
		console.warn("[sessionActions] Failed to fetch stats:", err);
		return false;
	}
}

/**
 * Manually compact the context window.
 *
 * Sets isCompacting state, calls session.compact, waits for response.
 * The auto_compaction_start/end events in wireTransport also update
 * isCompacting, so the state stays in sync for both manual and auto compaction.
 *
 * Returns true on success, false on failure.
 */
export async function compactSession(customInstructions?: string): Promise<boolean> {
	const store = useStore.getState();
	if (!store.sessionId) return false;

	store.setIsCompacting(true);
	try {
		const params: Record<string, string> = {};
		if (customInstructions) {
			params.customInstructions = customInstructions;
		}
		await getTransport().request("session.compact", params);
		return true;
	} catch (err) {
		store.setLastError(`Failed to compact context: ${errorMessage(err)}`);
		return false;
	} finally {
		// auto_compaction_end event will set isCompacting=false,
		// but if the command itself fails (before events fire), clear it here
		store.setIsCompacting(false);
	}
}

/**
 * Fork the conversation from a specific message.
 *
 * Flow:
 * 1. Call session.fork with the entryId
 * 2. Clear local messages
 * 3. Fetch the forked conversation's messages from Pi
 * 4. Rebuild local message state
 *
 * Returns true on success, false on failure.
 */
export async function forkFromMessage(entryId: string): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	try {
		await getTransport().request("session.fork", { entryId });
		// Clear messages — the fork creates a new session with truncated history
		store.clearMessages();
		store.setIsStreaming(false);
		// Refresh state
		await refreshSessionState();
		return true;
	} catch (err) {
		store.setLastError(`Failed to fork session: ${errorMessage(err)}`);
		return false;
	}
}

/**
 * Fetch the list of available sessions from the server.
 *
 * The server reads `~/.pi/agent/sessions/` for the current CWD.
 * Updates the store's sessionList.
 *
 * Returns the session list on success, empty array on failure.
 */
export async function fetchSessionList(): Promise<WsSessionSummary[]> {
	const store = useStore.getState();
	store.setSessionListLoading(true);

	try {
		const result = await getTransport().request("session.listSessions");
		store.setSessionList(result.sessions);
		return result.sessions;
	} catch (err) {
		console.warn("[sessionActions] Failed to fetch session list:", err);
		return [];
	} finally {
		store.setSessionListLoading(false);
	}
}

/**
 * Switch to a different session.
 *
 * Flow:
 * 1. Abort streaming if active
 * 2. Ensure a Pi process is running
 * 3. Call session.switchSession with the session file path
 * 4. Clear local messages
 * 5. Refresh session state
 *
 * Returns true on success, false on failure or cancellation.
 */
export async function switchSession(sessionPath: string): Promise<boolean> {
	const store = useStore.getState();

	// If streaming, abort first
	if (store.isStreaming) {
		try {
			await getTransport().request("session.abort");
		} catch {
			// Continue even if abort fails
		}
	}

	const ready = await ensureSession();
	if (!ready) return false;

	try {
		const result = await getTransport().request("session.switchSession", { sessionPath });
		if (result.cancelled) {
			store.addToast("Session switch was cancelled by an extension", "warning");
			return false;
		}

		// Clear messages — switching loads a different conversation
		store.clearMessages();
		store.setIsStreaming(false);
		// Refresh state to pick up new session info
		await refreshSessionState();
		// Refresh session list to update current indicators
		await fetchSessionList();
		return true;
	} catch (err) {
		store.setLastError(`Failed to switch session: ${errorMessage(err)}`);
		return false;
	}
}
