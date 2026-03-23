/**
 * Window state persistence — saves/restores window frame (position + size)
 * to a JSON file at `~/.pibun/window-state.json`.
 *
 * - Loaded once at startup before BrowserWindow creation
 * - Saved (debounced) on resize/move events
 * - Flushed immediately on window close
 *
 * @see docs/DESKTOP.md — Window Management
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface WindowFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = join(homedir(), ".pibun");
const STATE_FILE = join(CONFIG_DIR, "window-state.json");

export const DEFAULT_FRAME: WindowFrame = {
	x: 100,
	y: 100,
	width: 1200,
	height: 800,
};

/** Minimum window dimensions for usability. */
const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

/** Debounce interval for save operations during resize/move. */
const SAVE_DEBOUNCE_MS = 500;

// ============================================================================
// State
// ============================================================================

let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Load
// ============================================================================

/**
 * Load saved window state from disk. Returns defaults if the file
 * doesn't exist, is corrupted, or contains invalid values.
 */
export function loadWindowState(): WindowFrame {
	try {
		if (!existsSync(STATE_FILE)) {
			return { ...DEFAULT_FRAME };
		}
		const raw = readFileSync(STATE_FILE, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		return validateFrame(parsed);
	} catch {
		// Corrupted file, permission error, etc. — start fresh.
		return { ...DEFAULT_FRAME };
	}
}

// ============================================================================
// Save
// ============================================================================

/**
 * Save window state to disk immediately.
 */
export function saveWindowState(frame: WindowFrame): void {
	try {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(STATE_FILE, JSON.stringify(frame, null, "\t"), "utf-8");
	} catch (error) {
		console.warn("Failed to save window state:", error);
	}
}

/**
 * Schedule a debounced save. Multiple rapid calls (e.g., during a drag)
 * are coalesced into a single write after the debounce interval.
 */
export function debouncedSaveWindowState(frame: WindowFrame): void {
	if (saveTimer) {
		clearTimeout(saveTimer);
	}
	saveTimer = setTimeout(() => {
		saveWindowState(frame);
		saveTimer = null;
	}, SAVE_DEBOUNCE_MS);
}

/**
 * Flush any pending debounced save immediately. Call this before
 * the window closes to ensure the final state is persisted.
 */
export function flushWindowState(frame: WindowFrame): void {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	saveWindowState(frame);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate and sanitize a parsed window frame. Ensures all fields are
 * numbers within reasonable bounds. Falls back to defaults for any
 * invalid or missing values.
 */
function validateFrame(parsed: unknown): WindowFrame {
	if (typeof parsed !== "object" || parsed === null) {
		return { ...DEFAULT_FRAME };
	}

	const obj = parsed as Record<string, unknown>;

	const width =
		typeof obj.width === "number" && Number.isFinite(obj.width)
			? Math.max(obj.width, MIN_WIDTH)
			: DEFAULT_FRAME.width;

	const height =
		typeof obj.height === "number" && Number.isFinite(obj.height)
			? Math.max(obj.height, MIN_HEIGHT)
			: DEFAULT_FRAME.height;

	const x = typeof obj.x === "number" && Number.isFinite(obj.x) ? obj.x : DEFAULT_FRAME.x;

	const y = typeof obj.y === "number" && Number.isFinite(obj.y) ? obj.y : DEFAULT_FRAME.y;

	return { x, y, width, height };
}
