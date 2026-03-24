/**
 * Workspace persistence — reads/writes `~/.pibun/workspace.json`.
 *
 * Tracks which session paths the user has explicitly "loaded" into
 * the sidebar. Loaded sessions persist across app restarts and appear
 * in the sidebar alongside running sessions.
 *
 * File format:
 * ```json
 * { "loadedSessionPaths": ["/path/to/session.jsonl", ...] }
 * ```
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

/** PiBun config directory. */
const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");

/** Path to the workspace persistence file. */
const WORKSPACE_FILE = join(PIBUN_CONFIG_DIR, "workspace.json");

/** Shape of the workspace JSON file. */
interface WorkspaceData {
	loadedSessionPaths: string[];
}

const DEFAULT_DATA: WorkspaceData = { loadedSessionPaths: [] };

// ============================================================================
// File I/O
// ============================================================================

async function ensureConfigDir(): Promise<void> {
	await mkdir(PIBUN_CONFIG_DIR, { recursive: true });
}

async function readWorkspace(): Promise<WorkspaceData> {
	try {
		const file = Bun.file(WORKSPACE_FILE);
		if (!(await file.exists())) return { ...DEFAULT_DATA };

		const parsed: unknown = JSON.parse(await file.text());
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { ...DEFAULT_DATA };
		}

		const raw = parsed as Record<string, unknown>;
		const paths = Array.isArray(raw.loadedSessionPaths) ? raw.loadedSessionPaths : [];

		return {
			loadedSessionPaths: paths.filter((p): p is string => typeof p === "string"),
		};
	} catch {
		return { ...DEFAULT_DATA };
	}
}

async function writeWorkspace(data: WorkspaceData): Promise<void> {
	await ensureConfigDir();
	await Bun.write(WORKSPACE_FILE, JSON.stringify(data, null, "\t"));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all loaded session paths.
 */
export async function getLoadedSessionPaths(): Promise<string[]> {
	const data = await readWorkspace();
	return data.loadedSessionPaths;
}

/**
 * Add a session path to the loaded list (idempotent).
 */
export async function addLoadedSessionPath(sessionPath: string): Promise<string[]> {
	const data = await readWorkspace();
	if (!data.loadedSessionPaths.includes(sessionPath)) {
		data.loadedSessionPaths.push(sessionPath);
		await writeWorkspace(data);
	}
	return data.loadedSessionPaths;
}

/**
 * Remove a session path from the loaded list.
 */
export async function removeLoadedSessionPath(sessionPath: string): Promise<string[]> {
	const data = await readWorkspace();
	data.loadedSessionPaths = data.loadedSessionPaths.filter((p) => p !== sessionPath);
	await writeWorkspace(data);
	return data.loadedSessionPaths;
}
