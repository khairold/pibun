/**
 * Application settings persistence — reads/writes `~/.pibun/settings.json`.
 *
 * Settings are user preferences (theme, etc.) that persist across app restarts.
 * File format: JSON object with `PiBunSettings` fields.
 *
 * Unknown fields are preserved on load/save to support forward compatibility.
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PiBunSettings } from "@pibun/contracts";

// ============================================================================
// Constants
// ============================================================================

/** PiBun config directory. */
const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");

/** Path to the settings persistence file. */
const SETTINGS_FILE = join(PIBUN_CONFIG_DIR, "settings.json");

/** Default settings when no file exists. */
const DEFAULT_SETTINGS: PiBunSettings = {
	themeId: null,
	autoCompaction: null,
	autoRetry: null,
	steeringMode: null,
	followUpMode: null,
	timestampFormat: "locale",
};

// ============================================================================
// File I/O
// ============================================================================

/**
 * Ensure the `~/.pibun/` directory exists.
 */
async function ensureConfigDir(): Promise<void> {
	await mkdir(PIBUN_CONFIG_DIR, { recursive: true });
}

/**
 * Load settings from disk.
 *
 * Returns default settings if the file doesn't exist or is malformed.
 * Preserves any extra fields in the JSON (forward compatibility).
 */
export async function loadSettings(): Promise<PiBunSettings> {
	try {
		const file = Bun.file(SETTINGS_FILE);
		const exists = await file.exists();
		if (!exists) return { ...DEFAULT_SETTINGS };

		const text = await file.text();
		const parsed: unknown = JSON.parse(text);

		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { ...DEFAULT_SETTINGS };
		}

		const raw = parsed as Record<string, unknown>;

		// Merge with defaults — unknown fields preserved
		return {
			...DEFAULT_SETTINGS,
			themeId: typeof raw.themeId === "string" ? (raw.themeId as PiBunSettings["themeId"]) : null,
			autoCompaction: typeof raw.autoCompaction === "boolean" ? raw.autoCompaction : null,
			autoRetry: typeof raw.autoRetry === "boolean" ? raw.autoRetry : null,
			steeringMode:
				typeof raw.steeringMode === "string" && ["all", "one-at-a-time"].includes(raw.steeringMode)
					? (raw.steeringMode as PiBunSettings["steeringMode"])
					: null,
			followUpMode:
				typeof raw.followUpMode === "string" && ["all", "one-at-a-time"].includes(raw.followUpMode)
					? (raw.followUpMode as PiBunSettings["followUpMode"])
					: null,
			...(typeof raw.timestampFormat === "string" &&
				["relative", "locale", "12h", "24h"].includes(raw.timestampFormat) && {
					timestampFormat: raw.timestampFormat as PiBunSettings["timestampFormat"],
				}),
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/**
 * Save settings to disk.
 *
 * Creates the `~/.pibun/` directory if it doesn't exist.
 */
export async function saveSettings(settings: PiBunSettings): Promise<void> {
	await ensureConfigDir();
	await Bun.write(SETTINGS_FILE, JSON.stringify(settings, null, "\t"));
}

/**
 * Update specific settings fields.
 *
 * Loads current settings, merges provided updates, saves back.
 * Only provided fields are changed — omitted fields are unchanged.
 *
 * @returns The updated settings object.
 */
export async function updateSettings(updates: Partial<PiBunSettings>): Promise<PiBunSettings> {
	const current = await loadSettings();

	if (updates.themeId !== undefined) {
		current.themeId = updates.themeId;
	}
	if (updates.autoCompaction !== undefined) {
		current.autoCompaction = updates.autoCompaction;
	}
	if (updates.autoRetry !== undefined) {
		current.autoRetry = updates.autoRetry;
	}
	if (updates.steeringMode !== undefined) {
		current.steeringMode = updates.steeringMode;
	}
	if (updates.followUpMode !== undefined) {
		current.followUpMode = updates.followUpMode;
	}
	if (updates.timestampFormat !== undefined) {
		current.timestampFormat = updates.timestampFormat;
	}

	await saveSettings(current);
	return current;
}
