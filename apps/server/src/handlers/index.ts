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
	handleAppSaveExportFile,
	handleAppSetWindowTitle,
	handleAppShowContextMenu,
	handleGitBranch,
	handleGitDiff,
	handleGitLog,
	handleGitStatus,
	handleKeybindingsGet,
	handlePluginInstall,
	handlePluginList,
	handlePluginSetEnabled,
	handlePluginUninstall,
	handleProjectAdd,
	handleProjectList,
	handleProjectOpenFileInEditor,
	handleProjectOpenInEditor,
	handleProjectRemove,
	handleProjectSearchFiles,
	handleProjectUpdate,
	handleSessionGetTurnDiff,
	handleSettingsGet,
	handleSettingsUpdate,
	handleTerminalClose,
	handleTerminalCreate,
	handleTerminalResize,
	handleTerminalWrite,
} from "./appHandlers.js";
import {
	handleExtensionUiResponse,
	handleSessionAbort,
	handleSessionAbortBash,
	handleSessionBash,
	handleSessionCompact,
	handleSessionCycleModel,
	handleSessionCycleThinking,
	handleSessionExportHtml,
	handleSessionFollowUp,
	handleSessionFork,
	handleSessionGetCommands,
	handleSessionGetForkMessages,
	handleSessionGetLastAssistantText,
	handleSessionGetMessages,
	handleSessionGetModels,
	handleSessionGetState,
	handleSessionGetStats,
	handleSessionListSessions,
	handleSessionNew,
	handleSessionPrompt,
	handleSessionSetAutoCompaction,
	handleSessionSetAutoRetry,
	handleSessionSetFollowUpMode,
	handleSessionSetModel,
	handleSessionSetName,
	handleSessionSetSteeringMode,
	handleSessionSetThinking,
	handleSessionStart,
	handleSessionSteer,
	handleSessionStop,
	handleSessionSwitchSession,
} from "./session.js";
import type { HandlerRegistry } from "./types.js";

export type { AnyWsHandler, HandlerContext, HandlerRegistry, WsHandler } from "./types.js";
export { assertSuccess, getProcess, piPassthrough } from "./types.js";

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
	"session.bash": handleSessionBash,
	"session.abortBash": handleSessionAbortBash,

	// Model / Settings
	"session.setModel": handleSessionSetModel,
	"session.setThinking": handleSessionSetThinking,
	"session.getModels": handleSessionGetModels,
	"session.setAutoCompaction": handleSessionSetAutoCompaction,
	"session.setAutoRetry": handleSessionSetAutoRetry,
	"session.setSteeringMode": handleSessionSetSteeringMode,
	"session.setFollowUpMode": handleSessionSetFollowUpMode,

	// Session management
	"session.new": handleSessionNew,
	"session.compact": handleSessionCompact,
	"session.fork": handleSessionFork,
	"session.setName": handleSessionSetName,
	"session.getForkMessages": handleSessionGetForkMessages,
	"session.getCommands": handleSessionGetCommands,
	"session.cycleModel": handleSessionCycleModel,
	"session.cycleThinking": handleSessionCycleThinking,
	"session.getLastAssistantText": handleSessionGetLastAssistantText,

	// Extension UI
	"session.extensionUiResponse": handleExtensionUiResponse,

	// Session export
	"session.exportHtml": handleSessionExportHtml,

	// Session listing (server-side)
	"session.listSessions": handleSessionListSessions,
	"session.switchSession": handleSessionSwitchSession,

	// Project management (server-side persistence)
	"project.list": handleProjectList,
	"project.add": handleProjectAdd,
	"project.remove": handleProjectRemove,
	"project.update": handleProjectUpdate,
	"project.searchFiles": handleProjectSearchFiles,
	"project.openInEditor": handleProjectOpenInEditor,
	"project.openFileInEditor": handleProjectOpenFileInEditor,

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

	// Turn diff (server-side git diff for specific files)
	"session.getTurnDiff": handleSessionGetTurnDiff,

	// App-level (desktop integration)
	"app.applyUpdate": handleAppApplyUpdate,
	"app.checkForUpdates": handleAppCheckForUpdates,
	"app.openFolderDialog": handleAppOpenFolderDialog,
	"app.setWindowTitle": handleAppSetWindowTitle,
	"app.saveExportFile": handleAppSaveExportFile,
	"app.showContextMenu": handleAppShowContextMenu,

	// Settings (server-side persistence)
	"settings.get": handleSettingsGet,
	"settings.update": handleSettingsUpdate,

	// Keybindings (server-side persistence)
	"keybindings.get": handleKeybindingsGet,

	// Plugin management (server-side)
	"plugin.list": handlePluginList,
	"plugin.install": handlePluginInstall,
	"plugin.uninstall": handlePluginUninstall,
	"plugin.setEnabled": handlePluginSetEnabled,
};
