/**
 * Project management WebSocket method handlers.
 *
 * Handles CRUD operations for project directories:
 * - `project.list` — list all persisted projects
 * - `project.add` — add a new project directory
 * - `project.remove` — remove a project by ID
 * - `project.update` — update a project's metadata
 *
 * Projects are persisted server-side to `~/.pibun/projects.json`.
 * These are NOT Pi RPC commands — purely server-side persistence.
 */

import type {
	WsOkResult,
	WsProjectAddParams,
	WsProjectAddResult,
	WsProjectListResult,
	WsProjectRemoveParams,
	WsProjectUpdateParams,
} from "@pibun/contracts";
import { addProject, loadProjects, removeProject, updateProject } from "../projectStore.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// project.list
// ============================================================================

/**
 * List all persisted projects.
 * Returns projects sorted by `lastOpened` descending (most recent first).
 */
export const handleProjectList: WsHandler<"project.list"> = async (
	_params: undefined,
	_ctx: HandlerContext,
): Promise<WsProjectListResult> => {
	const projects = await loadProjects();
	return { projects };
};

// ============================================================================
// project.add
// ============================================================================

/**
 * Add a new project directory.
 *
 * Generates a UUID, defaults name to directory basename.
 * If a project with the same CWD already exists, updates its `lastOpened`
 * and returns the existing project.
 */
export const handleProjectAdd: WsHandler<"project.add"> = async (
	params: WsProjectAddParams,
	ctx: HandlerContext,
): Promise<WsProjectAddResult> => {
	if (!params.cwd) {
		throw new Error("project.add requires a 'cwd' parameter");
	}

	const project = await addProject(params.cwd, params.name);
	ctx.hooks.onProjectsChanged?.();
	return { project };
};

// ============================================================================
// project.remove
// ============================================================================

/**
 * Remove a project by ID.
 * Throws if the project ID is not found.
 */
export const handleProjectRemove: WsHandler<"project.remove"> = async (
	params: WsProjectRemoveParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.projectId) {
		throw new Error("project.remove requires a 'projectId' parameter");
	}

	await removeProject(params.projectId);
	ctx.hooks.onProjectsChanged?.();
	return { ok: true };
};

// ============================================================================
// project.update
// ============================================================================

/**
 * Update a project's metadata.
 *
 * Only provided fields are merged. The `projectId` identifies the target.
 * Throws if the project ID is not found.
 */
export const handleProjectUpdate: WsHandler<"project.update"> = async (
	params: WsProjectUpdateParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	if (!params.projectId) {
		throw new Error("project.update requires a 'projectId' parameter");
	}

	// Use conditional spread to avoid passing `undefined` to optional properties
	// (required by exactOptionalPropertyTypes — MEMORY #52)
	await updateProject(params.projectId, {
		...(params.name !== undefined && { name: params.name }),
		...(params.favoriteModel !== undefined && { favoriteModel: params.favoriteModel }),
		...(params.defaultThinking !== undefined && { defaultThinking: params.defaultThinking }),
		...(params.lastOpened !== undefined && { lastOpened: params.lastOpened }),
		...(params.sessionCount !== undefined && { sessionCount: params.sessionCount }),
	});
	ctx.hooks.onProjectsChanged?.();
	return { ok: true };
};
