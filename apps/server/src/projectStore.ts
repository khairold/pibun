/**
 * Project persistence — reads/writes `~/.pibun/projects.json`.
 *
 * Projects are directories the user works in frequently. They persist
 * across app restarts and remember CWD, model preferences, and session
 * history.
 *
 * File format: JSON array of `Project` objects, sorted by `lastOpened`
 * descending (most recent first).
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Project, ProjectModelPreference } from "@pibun/contracts";
import type { PiThinkingLevel } from "@pibun/contracts";

// ============================================================================
// Constants
// ============================================================================

/** PiBun config directory. */
const PIBUN_CONFIG_DIR = join(homedir(), ".pibun");

/** Path to the projects persistence file. */
const PROJECTS_FILE = join(PIBUN_CONFIG_DIR, "projects.json");

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
 * Load projects from disk.
 *
 * Returns an empty array if the file doesn't exist or is malformed.
 * Projects are returned sorted by `lastOpened` descending.
 */
export async function loadProjects(): Promise<Project[]> {
	try {
		const file = Bun.file(PROJECTS_FILE);
		const exists = await file.exists();
		if (!exists) return [];

		const text = await file.text();
		const parsed: unknown = JSON.parse(text);

		if (!Array.isArray(parsed)) return [];

		// Validate each entry has at minimum id and cwd
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
	} catch {
		return [];
	}
}

/**
 * Save projects to disk.
 *
 * Creates the `~/.pibun/` directory if it doesn't exist.
 * Sorts by `lastOpened` descending before writing.
 */
export async function saveProjects(projects: Project[]): Promise<void> {
	await ensureConfigDir();

	// Sort by lastOpened descending before persisting
	const sorted = [...projects].sort((a, b) => b.lastOpened - a.lastOpened);

	await Bun.write(PROJECTS_FILE, JSON.stringify(sorted, null, "\t"));
}

// ============================================================================
// CRUD Operations
// ============================================================================

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

	// Check for duplicate CWD — if exists, update lastOpened and return
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
