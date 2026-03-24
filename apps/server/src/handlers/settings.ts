/**
 * Settings WebSocket method handlers.
 *
 * Handles application preference persistence:
 * - `settings.get` — load current settings
 * - `settings.update` — update settings fields
 *
 * Settings are persisted server-side to `~/.pibun/settings.json`.
 * These are NOT Pi RPC commands — purely server-side persistence.
 */

import type {
	PiBunSettings,
	WsSettingsGetResult,
	WsSettingsUpdateParams,
	WsSettingsUpdateResult,
} from "@pibun/contracts";
import { loadSettings, updateSettings } from "../settingsStore.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// settings.get
// ============================================================================

/**
 * Load current application settings.
 * Returns defaults if no settings file exists.
 */
export const handleSettingsGet: WsHandler<"settings.get"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsSettingsGetResult> => {
	const settings = await loadSettings();
	return { settings };
};

// ============================================================================
// settings.update
// ============================================================================

/**
 * Update application settings.
 *
 * Only provided fields are merged. Omitted fields are unchanged.
 * Returns the full updated settings for confirmation.
 */
export const handleSettingsUpdate: WsHandler<"settings.update"> = async (
	params: WsSettingsUpdateParams,
	_ctx: HandlerContext,
): Promise<WsSettingsUpdateResult> => {
	// Build updates with proper ThemeId typing (params.themeId is string | null from wire)
	const updates: Partial<PiBunSettings> = {};
	if (params.themeId !== undefined) {
		updates.themeId = params.themeId as PiBunSettings["themeId"];
	}

	const settings = await updateSettings(updates);
	return { settings };
};
