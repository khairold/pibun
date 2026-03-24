/**
 * Settings actions — coordinate transport + localStorage for settings persistence.
 *
 * On connect, fetches settings from server and applies (server is source of truth
 * in desktop mode). On theme change, saves to both localStorage and server.
 *
 * @module
 */

import { getTransport } from "@/wireTransport";
import { applyTheme, getThemeById } from "./themes";

const THEME_STORAGE_KEY = "pibun-theme";

/**
 * Fetch settings from the server and apply them.
 *
 * Called on `server.welcome` to sync server-persisted settings.
 * If the server has a saved theme that differs from localStorage,
 * the server's value wins (handles desktop webview state resets).
 */
export async function fetchAndApplySettings(): Promise<void> {
	try {
		const transport = getTransport();
		const result = await transport.request("settings.get");
		const { settings } = result;

		if (settings.themeId) {
			const currentLocalTheme = localStorage.getItem(THEME_STORAGE_KEY);

			// Server has a saved theme — apply it if different from current
			if (settings.themeId !== currentLocalTheme) {
				const theme = getThemeById(settings.themeId);
				applyTheme(theme);
				localStorage.setItem(THEME_STORAGE_KEY, settings.themeId);
			}
		}
	} catch {
		// Settings fetch failed (standalone server without settings support, etc.)
		// Silently fall back to localStorage-only persistence
	}
}

/**
 * Persist theme choice to the server.
 *
 * Called from ThemeSelector after applying a theme locally.
 * Fire-and-forget — doesn't block the UI on server response.
 */
export function persistThemeToServer(themeId: string): void {
	try {
		const transport = getTransport();
		// Fire-and-forget — don't await, don't block UI
		transport.request("settings.update", { themeId }).catch(() => {
			// Silent failure — localStorage is the primary store in browser mode
		});
	} catch {
		// Transport not ready — skip server persistence
	}
}
