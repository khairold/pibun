/**
 * Plugins slice — plugin registry and panel visibility state.
 *
 * Stores the list of installed plugins fetched from the server,
 * tracks which plugin panels are currently visible, and provides
 * actions for toggling panels and refreshing the plugin list.
 */

import type { StateCreator } from "zustand";
import type { AppStore, PluginsSlice } from "./types";

export const createPluginsSlice: StateCreator<AppStore, [], [], PluginsSlice> = (set, get) => ({
	plugins: [],
	pluginsLoading: false,
	activePluginPanels: new Set<string>(),

	setPlugins: (plugins) => set({ plugins }),
	setPluginsLoading: (loading) => set({ pluginsLoading: loading }),

	togglePluginPanel: (panelKey) =>
		set((state) => {
			const next = new Set(state.activePluginPanels);
			if (next.has(panelKey)) {
				next.delete(panelKey);
			} else {
				next.add(panelKey);
			}
			return { activePluginPanels: next };
		}),

	setPluginPanelOpen: (panelKey, open) =>
		set((state) => {
			const next = new Set(state.activePluginPanels);
			if (open) {
				next.add(panelKey);
			} else {
				next.delete(panelKey);
			}
			return { activePluginPanels: next };
		}),

	getActivePluginPanelsByPosition: (position) => {
		const state = get();
		const panels: Array<{
			pluginId: string;
			panelId: string;
			title: string;
			icon: string;
			component: string;
			defaultSize: number | null;
		}> = [];

		for (const plugin of state.plugins) {
			if (!plugin.enabled || plugin.error) continue;
			for (const panel of plugin.manifest.panels) {
				if (panel.position !== position) continue;
				const panelKey = `${plugin.manifest.id}:${panel.id}`;
				if (state.activePluginPanels.has(panelKey)) {
					panels.push({
						pluginId: plugin.manifest.id,
						panelId: panel.id,
						title: panel.title,
						icon: panel.icon,
						component: panel.component,
						defaultSize: panel.defaultSize,
					});
				}
			}
		}

		return panels;
	},
});
