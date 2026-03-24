/**
 * @pibun/contracts — Session Tab types
 *
 * Types for the multi-session tab system. Each tab represents an
 * independent Pi RPC session with its own CWD, model, and conversation.
 */

import type { PiModel, PiThinkingLevel } from "./piProtocol.js";

// ============================================================================
// Session Tab
// ============================================================================

/**
 * A session tab in the multi-session UI.
 *
 * Each tab is an independent Pi RPC session. Tabs are managed by the
 * web app's tabsSlice — the server doesn't know about tabs.
 */
export interface SessionTab {
	/** Unique tab ID (client-generated, e.g., "tab-1"). */
	id: string;
	/** Display name for the tab (from Pi session name, or auto-generated). */
	name: string;
	/** The Pi session ID bound to this tab. Null before session starts. */
	sessionId: string | null;
	/** Working directory for this session. Null before session starts. */
	cwd: string | null;
	/** Active model for this session. Null before first state fetch. */
	model: PiModel | null;
	/** Thinking level for this session. */
	thinkingLevel: PiThinkingLevel;
	/** True while this session's Pi agent is processing. */
	isStreaming: boolean;
	/** True if this session's CWD has uncommitted git changes. */
	gitDirty: boolean;
	/** Number of messages in this tab's conversation. */
	messageCount: number;
	/** Unix timestamp when this tab was created. */
	createdAt: number;
}
