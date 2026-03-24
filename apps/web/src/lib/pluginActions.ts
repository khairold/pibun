/**
 * Plugin actions — coordinate transport + store for plugin operations.
 *
 * Handles fetching the plugin list from the server and auto-activating
 * enabled plugin panels.
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
