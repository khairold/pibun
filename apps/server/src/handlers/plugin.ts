/**
 * Plugin management WebSocket method handlers.
 *
 * Handles plugin CRUD operations:
 * - `plugin.list` — list all installed plugins with runtime state
 * - `plugin.install` — install a plugin from a local path
 * - `plugin.uninstall` — remove a plugin by ID
 * - `plugin.setEnabled` — enable or disable a plugin
 *
 * Plugins are stored in `~/.pibun/plugins/`, each with a `plugin.json` manifest.
 * These are NOT Pi RPC commands — purely server-side operations.
 */

import type {
	WsOkResult,
	WsPluginInstallParams,
	WsPluginInstallResult,
	WsPluginListResult,
	WsPluginSetEnabledParams,
	WsPluginUninstallParams,
} from "@pibun/contracts";
import { installPlugin, loadPlugins, setPluginEnabled, uninstallPlugin } from "../pluginStore.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// plugin.list
// ============================================================================

/**
 * List all installed plugins with runtime state.
 *
 * Scans `~/.pibun/plugins/` directory, loads manifests, and returns
 * plugins sorted by name. Includes plugins with load errors (error field set).
 */
export const handlePluginList: WsHandler<"plugin.list"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsPluginListResult> => {
	const plugins = await loadPlugins();
	return { plugins };
};

// ============================================================================
// plugin.install
// ============================================================================

/**
 * Install a plugin from a local directory path.
 *
 * Reads and validates the `plugin.json` manifest in the source directory,
 * copies the plugin to `~/.pibun/plugins/{id}/`, and returns the installed
 * plugin with runtime state.
 *
 * @throws If the source doesn't contain a valid manifest.
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

// ============================================================================
// plugin.uninstall
// ============================================================================

/**
 * Uninstall a plugin by removing its directory and persisted state.
 *
 * @throws If the plugin ID is not found.
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

// ============================================================================
// plugin.setEnabled
// ============================================================================

/**
 * Enable or disable a plugin.
 *
 * Persists the state to `~/.pibun/plugins-state.json`.
 *
 * @throws If the plugin ID is not found.
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
