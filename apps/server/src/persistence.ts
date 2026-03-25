/**
 * Persistence layer — reads/writes PiBun configuration files in `~/.pibun/`.
 *
 * Three persistence domains, one file:
 * - **Settings** (`settings.json`) — user preferences (theme, auto-compaction, etc.)
 * - **Projects** (`projects.json`) — frequently used directories with model prefs
 * - **Workspace** (`workspace.json`) — loaded sidebar session paths
 *
 * All share the same config directory and file I/O patterns.
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type {
	PiBunSettings,
	PiThinkingLevel,
	Project,
	ProjectModelPreference,
} from "@pibun/contracts";

// ============================================================================
// Shared Infrastructure
// ============================================================================

/** PiBun config directory. */
const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");

/** Ensure the `~/.pibun/` directory exists. */
async function ensureConfigDir(): Promise<void> {
	await mkdir(PIBUN_CONFIG_DIR, { recursive: true });
}

/** Safely read and parse a JSON file. Returns null if missing or malformed. */
async function readJsonFile(fileName: string): Promise<unknown | null> {
	try {
		const file = Bun.file(join(PIBUN_CONFIG_DIR, fileName));
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text());
	} catch {
		return null;
	}
}

/** Write a JSON file to the config directory. */
async function writeJsonFile(fileName: string, data: unknown): Promise<void> {
	await ensureConfigDir();
	await Bun.write(join(PIBUN_CONFIG_DIR, fileName), JSON.stringify(data, null, "\t"));
}

// ============================================================================
// Settings — `~/.pibun/settings.json`
// ============================================================================

/** Default settings when no file exists. */
const DEFAULT_SETTINGS: PiBunSettings = {
	themeId: null,
	autoCompaction: null,
	autoRetry: null,
	steeringMode: null,
	followUpMode: null,
	timestampFormat: "locale",
};

/**
 * Load settings from disk.
 *
 * Returns default settings if the file doesn't exist or is malformed.
 * Preserves any extra fields in the JSON (forward compatibility).
 */
export async function loadSettings(): Promise<PiBunSettings> {
	const parsed = await readJsonFile("settings.json");

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ...DEFAULT_SETTINGS };
	}

	const raw = parsed as Record<string, unknown>;

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
}

/**
 * Save settings to disk.
 */
export async function saveSettings(settings: PiBunSettings): Promise<void> {
	await writeJsonFile("settings.json", settings);
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

// ============================================================================
// Projects — `~/.pibun/projects.json`
// ============================================================================

/**
 * Load projects from disk.
 *
 * Returns an empty array if the file doesn't exist or is malformed.
 * Projects are returned sorted by `lastOpened` descending.
 */
export async function loadProjects(): Promise<Project[]> {
	const parsed = await readJsonFile("projects.json");

	if (!Array.isArray(parsed)) return [];

	const projects = parsed.filter(
		(p): p is Project =>
			typeof p === "object" &&
			p !== null &&
			typeof (p as Record<string, unknown>).id === "string" &&
			typeof (p as Record<string, unknown>).cwd === "string",
	);

	// Sort by lastOpened descending
	projects.sort((a, b) => b.lastOpened - a.lastOpened);

	return projects;
}

/**
 * Save projects to disk. Sorts by `lastOpened` descending before writing.
 */
export async function saveProjects(projects: Project[]): Promise<void> {
	const sorted = [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
	await writeJsonFile("projects.json", sorted);
}

/**
 * Add a new project.
 *
 * Generates a UUID for the project ID, defaults the name to the directory
 * basename, and initializes timestamps and counters. If a project with the
 * same CWD already exists, updates its `lastOpened` and returns it.
 *
 * @returns The created (or existing) project.
 */
export async function addProject(cwd: string, name?: string): Promise<Project> {
	const projects = await loadProjects();

	const existing = projects.find((p) => p.cwd === cwd);
	if (existing) {
		existing.lastOpened = Date.now();
		await saveProjects(projects);
		return existing;
	}

	const project: Project = {
		id: crypto.randomUUID(),
		name: name ?? (basename(cwd) || cwd),
		cwd,
		lastOpened: Date.now(),
		favoriteModel: null,
		defaultThinking: null,
		sessionCount: 0,
	};

	projects.push(project);
	await saveProjects(projects);

	return project;
}

/**
 * Remove a project by ID.
 *
 * @throws If the project ID is not found.
 */
export async function removeProject(projectId: string): Promise<void> {
	const projects = await loadProjects();
	const index = projects.findIndex((p) => p.id === projectId);

	if (index === -1) {
		throw new Error(`Project not found: ${projectId}`);
	}

	projects.splice(index, 1);
	await saveProjects(projects);
}

/**
 * Update a project's metadata.
 *
 * Only the fields provided in `updates` are merged. The `projectId` identifies
 * the target project.
 *
 * @throws If the project ID is not found.
 */
export async function updateProject(
	projectId: string,
	updates: {
		name?: string;
		favoriteModel?: ProjectModelPreference | null;
		defaultThinking?: PiThinkingLevel | null;
		lastOpened?: number;
		sessionCount?: number;
	},
): Promise<void> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);

	if (!project) {
		throw new Error(`Project not found: ${projectId}`);
	}

	if (updates.name !== undefined) project.name = updates.name;
	if (updates.favoriteModel !== undefined) project.favoriteModel = updates.favoriteModel;
	if (updates.defaultThinking !== undefined) project.defaultThinking = updates.defaultThinking;
	if (updates.lastOpened !== undefined) project.lastOpened = updates.lastOpened;
	if (updates.sessionCount !== undefined) project.sessionCount = updates.sessionCount;

	await saveProjects(projects);
}

// ============================================================================
// Workspace — `~/.pibun/workspace.json`
// ============================================================================

/** Shape of the workspace JSON file. */
interface WorkspaceData {
	loadedSessionPaths: string[];
}

const DEFAULT_WORKSPACE: WorkspaceData = { loadedSessionPaths: [] };

/** Read workspace data from disk. */
async function readWorkspace(): Promise<WorkspaceData> {
	const parsed = await readJsonFile("workspace.json");

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ...DEFAULT_WORKSPACE };
	}

	const raw = parsed as Record<string, unknown>;
	const paths = Array.isArray(raw.loadedSessionPaths) ? raw.loadedSessionPaths : [];

	return {
		loadedSessionPaths: paths.filter((p): p is string => typeof p === "string"),
	};
}

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
		await writeJsonFile("workspace.json", data);
	}
	return data.loadedSessionPaths;
}

/**
 * Remove a session path from the loaded list.
 */
export async function removeLoadedSessionPath(sessionPath: string): Promise<string[]> {
	const data = await readWorkspace();
	data.loadedSessionPaths = data.loadedSessionPaths.filter((p) => p !== sessionPath);
	await writeJsonFile("workspace.json", data);
	return data.loadedSessionPaths;
}
