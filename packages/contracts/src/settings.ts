/**
 * PiBun application settings — persisted to `~/.pibun/settings.json`.
 *
 * Used by the desktop app to persist user preferences across sessions.
 * In browser mode, localStorage is the primary store; server-side settings
 * act as a backup that syncs on connect.
 */

import type { ThemeId } from "./theme.js";

/**
 * Application settings that persist across app restarts.
 *
 * Extensible — new fields can be added without breaking existing settings
 * files (unknown fields are preserved on load, new fields get defaults).
 */
export interface PiBunSettings {
	/** Active theme ID. Defaults to system preference detection. */
	themeId: ThemeId | null;
}
