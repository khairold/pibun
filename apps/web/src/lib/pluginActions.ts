/**
 * Plugin actions — coordinate transport + store for plugin operations.
 *
 * Handles fetching the plugin list from the server, installing/uninstalling
 * plugins, and toggling enabled state. Auto-activates panels for enabled plugins.
 *
 * @module
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";

/**
 * Fetch the list of installed plugins from the server.
 *
 * Called on `server.welcome` to populate the plugins store.
 * Automatically activates panels for enabled plugins.
 */
export async function fetchPlugins(): Promise<void> {
	const store = useStore.getState();
	store.setPluginsLoading(true);

	try {
		const transport = getTransport();
		const result = await transport.request("plugin.list");
		store.setPlugins(result.plugins);

		// Auto-activate panels for enabled plugins (if not already active)
		for (const plugin of result.plugins) {
			if (!plugin.enabled || plugin.error) continue;
			for (const panel of plugin.manifest.panels) {
				const panelKey = `${plugin.manifest.id}:${panel.id}`;
				store.setPluginPanelOpen(panelKey, true);
			}
		}
	} catch (err) {
		console.error("[PiBun] Failed to fetch plugins:", err);
	} finally {
		store.setPluginsLoading(false);
	}
}

/**
 * Install a plugin from a URL or local file path.
 *
 * After installation, refreshes the plugin list to pick up the new plugin
 * and auto-activates its panels.
 */
export async function installPlugin(source: string): Promise<void> {
	const transport = getTransport();
	await transport.request("plugin.install", { source });
	// Refresh full list (re-scans directory, activates new panels)
	await fetchPlugins();
}

/**
 * Uninstall a plugin by its ID.
 *
 * Closes all panels belonging to the plugin before removing it,
 * then refreshes the plugin list.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
	const store = useStore.getState();

	// Close all panels for this plugin before uninstalling
	const plugin = store.plugins.find((p) => p.manifest.id === pluginId);
	if (plugin) {
		for (const panel of plugin.manifest.panels) {
			const panelKey = `${pluginId}:${panel.id}`;
			store.setPluginPanelOpen(panelKey, false);
		}
	}

	const transport = getTransport();
	await transport.request("plugin.uninstall", { pluginId });
	// Refresh full list
	await fetchPlugins();
}

/**
 * Enable or disable a plugin.
 *
 * When enabling, auto-activates all panels. When disabling, closes all panels.
 * Updates the store optimistically then confirms via server round-trip.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
	const store = useStore.getState();

	// Optimistic update — toggle panels immediately
	const plugin = store.plugins.find((p) => p.manifest.id === pluginId);
	if (plugin) {
		for (const panel of plugin.manifest.panels) {
			const panelKey = `${pluginId}:${panel.id}`;
			store.setPluginPanelOpen(panelKey, enabled);
		}
	}

	const transport = getTransport();
	await transport.request("plugin.setEnabled", { pluginId, enabled });
	// Refresh to get canonical server state
	await fetchPlugins();
}

/**
 * Resolve a plugin panel's component URL for iframe embedding.
 *
 * - Absolute URLs (http://, https://) are returned as-is.
 * - Relative paths (./panel.html) are resolved to the server's plugin
 *   asset route: `/plugin/{pluginId}/{path}`.
 */
export function resolvePluginComponentUrl(pluginId: string, component: string): string {
	// Absolute URL — use as-is
	if (component.startsWith("http://") || component.startsWith("https://")) {
		return component;
	}

	// Relative path — resolve to plugin asset route
	const cleanPath = component.replace(/^\.\//, "");
	return `/plugin/${pluginId}/${cleanPath}`;
}
