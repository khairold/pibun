/**
 * PiBun application settings — persisted to `~/.pibun/settings.json`.
 *
 * Used by the desktop app to persist user preferences across sessions.
 * In browser mode, localStorage is the primary store; server-side settings
 * act as a backup that syncs on connect.
 */

import type { ThemePreference } from "./theme.js";

/**
 * Application settings that persist across app restarts.
 *
 * Extensible — new fields can be added without breaking existing settings
 * files (unknown fields are preserved on load, new fields get defaults).
 */
export interface PiBunSettings {
	/**
	 * User's theme preference. Can be a specific theme ID (e.g., "dark",
	 * "light") or "system" to follow the OS dark/light mode setting.
	 * Null means no preference saved — falls back to system detection.
	 */
	themeId: ThemePreference | null;
}
