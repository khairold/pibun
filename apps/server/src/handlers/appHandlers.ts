/**
 * Non-session WebSocket method handlers.
 *
 * Handles all WS methods that are NOT Pi RPC pass-throughs:
 * - `app.*` — desktop integration (hooks, native dialogs)
 * - `git.*` — git operations on the server filesystem
 * - `plugin.*` — plugin CRUD in ~/.pibun/plugins/
 * - `project.*` — project persistence in ~/.pibun/projects.json
 * - `settings.*` — app preferences in ~/.pibun/settings.json
 * - `terminal.*` — PTY shell sessions via bun-pty
 *
 * These call server-side services, not Pi RPC. Organized by domain.
 */

import type {
	PiBunSettings,
	WsAppOpenFolderDialogResult,
	WsAppSaveExportFileParams,
	WsAppSaveExportFileResult,
	WsAppSetWindowTitleParams,
	WsGitBranchParams,
	WsGitBranchResult,
	WsGitDiffParams,
	WsGitDiffResult,
	WsGitLogParams,
	WsGitLogResult,
	WsGitStatusParams,
	WsGitStatusResult,
	WsOkResult,
	WsPluginInstallParams,
	WsPluginInstallResult,
	WsPluginListResult,
	WsPluginSetEnabledParams,
	WsPluginUninstallParams,
	WsProjectAddParams,
	WsProjectAddResult,
	WsProjectListResult,
	WsProjectRemoveParams,
	WsProjectUpdateParams,
	WsSettingsGetResult,
	WsSettingsUpdateParams,
	WsSettingsUpdateResult,
	WsTerminalCloseParams,
	WsTerminalCreateParams,
	WsTerminalCreateResult,
	WsTerminalResizeParams,
	WsTerminalWriteParams,
} from "@pibun/contracts";
import { gitBranch, gitDiff, gitLog, gitStatus } from "../gitService.js";
import { installPlugin, loadPlugins, setPluginEnabled, uninstallPlugin } from "../pluginStore.js";
import { addProject, loadProjects, removeProject, updateProject } from "../projectStore.js";
import { loadSettings, updateSettings } from "../settingsStore.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// App — Desktop Integration
// ============================================================================

/**
 * Apply a downloaded update. Triggers app restart.
 * Only works in desktop mode where the `onApplyUpdate` hook is registered.
 */
export const handleAppApplyUpdate: WsHandler<"app.applyUpdate"> = (
	_params: undefined,
	ctx: HandlerContext,
): WsOkResult => {
	if (!ctx.hooks.onApplyUpdate) {
		throw new Error("Auto-update is not available in browser mode");
	}
	ctx.hooks.onApplyUpdate();
	return { ok: true };
};

/**
 * Manually trigger an update check.
 * Only works in desktop mode where the `onCheckForUpdates` hook is registered.
 */
export const handleAppCheckForUpdates: WsHandler<"app.checkForUpdates"> = (
	_params: undefined,
	ctx: HandlerContext,
): WsOkResult => {
	if (!ctx.hooks.onCheckForUpdates) {
		throw new Error("Auto-update is not available in browser mode");
	}
	ctx.hooks.onCheckForUpdates();
	return { ok: true };
};

/**
 * Open a native folder picker dialog.
 * Only works in desktop mode where the `onOpenFolderDialog` hook is registered.
 * Returns the selected path, or null if the user cancelled.
 */
export const handleAppOpenFolderDialog: WsHandler<"app.openFolderDialog"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsAppOpenFolderDialogResult> => {
	if (!ctx.hooks.onOpenFolderDialog) {
		throw new Error("Native folder dialog is not available in browser mode");
	}
	const folderPath = await ctx.hooks.onOpenFolderDialog();
	return { folderPath };
};

/**
 * Set the native window title.
 * Only works in desktop mode where the `onSetWindowTitle` hook is registered.
 * In browser mode, silently succeeds (the web app also sets document.title).
 */
export const handleAppSetWindowTitle: WsHandler<"app.setWindowTitle"> = (
	params: WsAppSetWindowTitleParams,
	ctx: HandlerContext,
): WsOkResult => {
	if (ctx.hooks.onSetWindowTitle) {
		ctx.hooks.onSetWindowTitle(params.title);
	}
	return { ok: true };
};

/**
 * Save exported content to disk via native folder picker.
 * Desktop: opens native folder dialog → writes file to selectedFolder/defaultFilename.
 * Browser: throws error — client falls back to blob URL download.
 */
export const handleAppSaveExportFile: WsHandler<"app.saveExportFile"> = async (
	params: WsAppSaveExportFileParams,
	ctx: HandlerContext,
): Promise<WsAppSaveExportFileResult> => {
	if (!ctx.hooks.onSaveExportFile) {
		throw new Error("Native save dialog is not available in browser mode");
	}
	const filePath = await ctx.hooks.onSaveExportFile(params.content, params.defaultFilename);
	return { filePath };
};

// ============================================================================
// Git — Server-side git operations
// ============================================================================

/**
 * Resolve the CWD for git operations.
 * Priority: explicit `params.cwd` → session's Pi process CWD → server CWD.
 */
function resolveGitCwd(paramsCwd: string | undefined, ctx: HandlerContext): string {
	if (paramsCwd) {
		return paramsCwd;
	}
	if (ctx.targetSessionId) {
		const session = ctx.rpcManager.getSession(ctx.targetSessionId);
		if (session?.process.options.cwd) {
			return session.process.options.cwd;
		}
	}
	return process.cwd();
}

/**
 * Get git status: branch name + changed files list.
 * Returns `{ isRepo: false }` for non-git directories (doesn't throw).
 */
export const handleGitStatus: WsHandler<"git.status"> = async (
	params: WsGitStatusParams,
	ctx: HandlerContext,
): Promise<WsGitStatusResult> => {
	const cwd = resolveGitCwd(params?.cwd, ctx);
	const status = await gitStatus(cwd);
	return { status };
};

/**
 * Get the current branch name. Returns null for detached HEAD or non-git directories.
 */
export const handleGitBranch: WsHandler<"git.branch"> = async (
	params: WsGitBranchParams,
	ctx: HandlerContext,
): Promise<WsGitBranchResult> => {
	const cwd = resolveGitCwd(params?.cwd, ctx);
	const branch = await gitBranch(cwd);
	return { branch };
};

/**
 * Get unified diff output.
 * By default shows unstaged changes. Pass `staged: true` for staged changes.
 */
export const handleGitDiff: WsHandler<"git.diff"> = async (
	params: WsGitDiffParams,
	ctx: HandlerContext,
): Promise<WsGitDiffResult> => {
	const cwd = resolveGitCwd(params?.cwd, ctx);
	const diff = await gitDiff(cwd, {
		...(params?.staged !== undefined && { staged: params.staged }),
		...(params?.path !== undefined && { path: params.path }),
	});
	return { diff };
};

/**
 * Get recent commit history as oneline entries.
 */
export const handleGitLog: WsHandler<"git.log"> = async (
	params: WsGitLogParams,
	ctx: HandlerContext,
): Promise<WsGitLogResult> => {
	const cwd = resolveGitCwd(params?.cwd, ctx);
	const log = await gitLog(cwd, params?.count);
	return { log };
};

// ============================================================================
// Plugin — Plugin CRUD in ~/.pibun/plugins/
// ============================================================================

/**
 * List all installed plugins with runtime state.
 * Scans `~/.pibun/plugins/` directory, loads manifests, returns sorted by name.
 */
export const handlePluginList: WsHandler<"plugin.list"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsPluginListResult> => {
	const plugins = await loadPlugins();
	return { plugins };
};

/**
 * Install a plugin from a local directory path.
 * Reads and validates the `plugin.json` manifest, copies to `~/.pibun/plugins/{id}/`.
 */
export const handlePluginInstall: WsHandler<"plugin.install"> = async (
	params: WsPluginInstallParams,
	_ctx: HandlerContext,
): Promise<WsPluginInstallResult> => {
	if (!params.source) {
		throw new Error("plugin.install requires a 'source' parameter");
	}
	const plugin = await installPlugin(params.source);
	return { plugin };
};

/**
 * Uninstall a plugin by removing its directory and persisted state.
 */
export const handlePluginUninstall: WsHandler<"plugin.uninstall"> = async (
	params: WsPluginUninstallParams,
	_ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.pluginId) {
		throw new Error("plugin.uninstall requires a 'pluginId' parameter");
	}
	await uninstallPlugin(params.pluginId);
	return { ok: true };
};

/**
 * Enable or disable a plugin. Persists state to `~/.pibun/plugins-state.json`.
 */
export const handlePluginSetEnabled: WsHandler<"plugin.setEnabled"> = async (
	params: WsPluginSetEnabledParams,
	_ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.pluginId) {
		throw new Error("plugin.setEnabled requires a 'pluginId' parameter");
	}
	if (typeof params.enabled !== "boolean") {
		throw new Error("plugin.setEnabled requires an 'enabled' boolean parameter");
	}
	await setPluginEnabled(params.pluginId, params.enabled);
	return { ok: true };
};

// ============================================================================
// Project — Project persistence in ~/.pibun/projects.json
// ============================================================================

/**
 * List all persisted projects, sorted by `lastOpened` descending.
 */
export const handleProjectList: WsHandler<"project.list"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsProjectListResult> => {
	const projects = await loadProjects();
	return { projects };
};

/**
 * Add a new project directory.
 * Generates a UUID, defaults name to directory basename.
 * If a project with the same CWD already exists, updates its `lastOpened`.
 */
export const handleProjectAdd: WsHandler<"project.add"> = async (
	params: WsProjectAddParams,
	ctx: HandlerContext,
): Promise<WsProjectAddResult> => {
	if (!params.cwd) {
		throw new Error("project.add requires a 'cwd' parameter");
	}
	const project = await addProject(params.cwd, params.name);
	ctx.hooks.onProjectsChanged?.();
	return { project };
};

/**
 * Remove a project by ID.
 */
export const handleProjectRemove: WsHandler<"project.remove"> = async (
	params: WsProjectRemoveParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.projectId) {
		throw new Error("project.remove requires a 'projectId' parameter");
	}
	await removeProject(params.projectId);
	ctx.hooks.onProjectsChanged?.();
	return { ok: true };
};

/**
 * Update a project's metadata. Only provided fields are merged.
 */
export const handleProjectUpdate: WsHandler<"project.update"> = async (
	params: WsProjectUpdateParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.projectId) {
		throw new Error("project.update requires a 'projectId' parameter");
	}
	await updateProject(params.projectId, {
		...(params.name !== undefined && { name: params.name }),
		...(params.favoriteModel !== undefined && { favoriteModel: params.favoriteModel }),
		...(params.defaultThinking !== undefined && { defaultThinking: params.defaultThinking }),
		...(params.lastOpened !== undefined && { lastOpened: params.lastOpened }),
		...(params.sessionCount !== undefined && { sessionCount: params.sessionCount }),
	});
	ctx.hooks.onProjectsChanged?.();
	return { ok: true };
};

// ============================================================================
// Settings — App preferences in ~/.pibun/settings.json
// ============================================================================

/**
 * Load current application settings. Returns defaults if no settings file exists.
 */
export const handleSettingsGet: WsHandler<"settings.get"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsSettingsGetResult> => {
	const settings = await loadSettings();
	return { settings };
};

/**
 * Update application settings. Only provided fields are merged.
 * Returns the full updated settings for confirmation.
 */
export const handleSettingsUpdate: WsHandler<"settings.update"> = async (
	params: WsSettingsUpdateParams,
	_ctx: HandlerContext,
): Promise<WsSettingsUpdateResult> => {
	const updates: Partial<PiBunSettings> = {};
	if (params.themeId !== undefined) {
		updates.themeId = params.themeId as PiBunSettings["themeId"];
	}
	const settings = await updateSettings(updates);
	return { settings };
};

// ============================================================================
// Terminal — PTY shell sessions via bun-pty
// ============================================================================

/**
 * Resolve the CWD for a new terminal.
 * Priority: explicit param → active session's CWD → server process CWD.
 */
function resolveTerminalCwd(params: WsTerminalCreateParams, ctx: HandlerContext): string {
	if (params.cwd) {
		return params.cwd;
	}
	if (ctx.targetSessionId) {
		const session = ctx.rpcManager.getSession(ctx.targetSessionId);
		if (session?.process.options.cwd) {
			return session.process.options.cwd;
		}
	}
	return process.cwd();
}

/**
 * `terminal.create` — spawn a new PTY shell session.
 * Creates a PTY via bun-pty with the resolved CWD. Terminal ID is returned
 * for subsequent write/resize/close operations.
 */
export const handleTerminalCreate: WsHandler<"terminal.create"> = (
	params,
	ctx,
): WsTerminalCreateResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}
	const cwd = resolveTerminalCwd(params, ctx);
	const { terminalId, pid } = ctx.terminalManager.create(ctx.connection.id, {
		cwd,
		...(params.cols !== undefined && { cols: params.cols }),
		...(params.rows !== undefined && { rows: params.rows }),
	});
	return { terminalId, pid };
};

/**
 * `terminal.write` — write data to terminal stdin.
 */
export const handleTerminalWrite: WsHandler<"terminal.write"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}
	const p = params as WsTerminalWriteParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}
	if (typeof p.data !== "string") {
		throw new Error("Missing data");
	}
	ctx.terminalManager.write(p.terminalId, p.data);
	return { ok: true };
};

/**
 * `terminal.resize` — resize terminal PTY dimensions.
 */
export const handleTerminalResize: WsHandler<"terminal.resize"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}
	const p = params as WsTerminalResizeParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}
	if (typeof p.cols !== "number" || typeof p.rows !== "number") {
		throw new Error("Missing cols/rows");
	}
	ctx.terminalManager.resize(p.terminalId, p.cols, p.rows);
	return { ok: true };
};

/**
 * `terminal.close` — close a terminal and kill the shell process.
 */
export const handleTerminalClose: WsHandler<"terminal.close"> = (params, ctx): WsOkResult => {
	if (!ctx.terminalManager) {
		throw new Error("Terminal manager not available");
	}
	const p = params as WsTerminalCloseParams;
	if (!p.terminalId) {
		throw new Error("Missing terminalId");
	}
	ctx.terminalManager.close(p.terminalId);
	return { ok: true };
};
