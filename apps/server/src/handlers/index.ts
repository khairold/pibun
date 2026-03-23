/**
 * WebSocket method handler registry.
 *
 * Maps each WS method string to its handler function.
 * The dispatch function in server.ts looks up methods from this registry.
 */

import { handleAppApplyUpdate, handleAppCheckForUpdates } from "./app.js";
import {
	handleExtensionUiResponse,
	handleSessionAbort,
	handleSessionCompact,
	handleSessionFollowUp,
	handleSessionFork,
	handleSessionGetForkMessages,
	handleSessionGetMessages,
	handleSessionGetModels,
	handleSessionGetState,
	handleSessionGetStats,
	handleSessionListSessions,
	handleSessionNew,
	handleSessionPrompt,
	handleSessionSetModel,
	handleSessionSetName,
	handleSessionSetThinking,
	handleSessionStart,
	handleSessionSteer,
	handleSessionStop,
	handleSessionSwitchSession,
} from "./session.js";
import type { HandlerRegistry } from "./types.js";

export type { AnyWsHandler, HandlerContext, HandlerRegistry, WsHandler } from "./types.js";

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Complete handler registry mapping WS method strings to handler functions.
 */
export const handlers: HandlerRegistry = {
	// Session lifecycle
	"session.start": handleSessionStart,
	"session.stop": handleSessionStop,
	"session.getState": handleSessionGetState,
	"session.getMessages": handleSessionGetMessages,
	"session.getStats": handleSessionGetStats,

	// Prompting
	"session.prompt": handleSessionPrompt,
	"session.steer": handleSessionSteer,
	"session.followUp": handleSessionFollowUp,
	"session.abort": handleSessionAbort,

	// Model / Settings
	"session.setModel": handleSessionSetModel,
	"session.setThinking": handleSessionSetThinking,
	"session.getModels": handleSessionGetModels,

	// Session management
	"session.new": handleSessionNew,
	"session.compact": handleSessionCompact,
	"session.fork": handleSessionFork,
	"session.setName": handleSessionSetName,
	"session.getForkMessages": handleSessionGetForkMessages,

	// Extension UI
	"session.extensionUiResponse": handleExtensionUiResponse,

	// Session listing (server-side)
	"session.listSessions": handleSessionListSessions,
	"session.switchSession": handleSessionSwitchSession,

	// App-level (desktop integration)
	"app.applyUpdate": handleAppApplyUpdate,
	"app.checkForUpdates": handleAppCheckForUpdates,
};
