/**
 * WebSocket method handler registry.
 *
 * Maps each WS method string to its handler function.
 * The dispatch function in server.ts looks up methods from this registry.
 */

import {
	handleAppApplyUpdate,
	handleAppCheckForUpdates,
	handleAppOpenFolderDialog,
	handleAppSetWindowTitle,
} from "./app.js";
import { handleGitBranch, handleGitDiff, handleGitLog, handleGitStatus } from "./git.js";
import {
	handleProjectAdd,
	handleProjectList,
	handleProjectRemove,
	handleProjectUpdate,
} from "./project.js";
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
import {
	handleTerminalClose,
	handleTerminalCreate,
	handleTerminalResize,
	handleTerminalWrite,
} from "./terminal.js";
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

	// Project management (server-side persistence)
	"project.list": handleProjectList,
	"project.add": handleProjectAdd,
	"project.remove": handleProjectRemove,
	"project.update": handleProjectUpdate,

	// Terminal integration
	"terminal.create": handleTerminalCreate,
	"terminal.write": handleTerminalWrite,
	"terminal.resize": handleTerminalResize,
	"terminal.close": handleTerminalClose,

	// Git integration (server-side)
	"git.status": handleGitStatus,
	"git.branch": handleGitBranch,
	"git.diff": handleGitDiff,
	"git.log": handleGitLog,

	// App-level (desktop integration)
	"app.applyUpdate": handleAppApplyUpdate,
	"app.checkForUpdates": handleAppCheckForUpdates,
	"app.openFolderDialog": handleAppOpenFolderDialog,
	"app.setWindowTitle": handleAppSetWindowTitle,
};
