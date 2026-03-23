/**
 * Projects slice — project directory management.
 *
 * Projects are persisted on the server at `~/.pibun/projects.json`.
 * This slice manages the client-side state. Server interactions
 * (project.list, project.add, etc.) happen via WS transport in
 * `lib/projectActions.ts`.
 *
 * Projects are sorted by `lastOpened` descending (most recent first).
 */

import type { Project } from "@pibun/contracts";
import type { StateCreator } from "zustand";
import type { AppStore, ProjectsSlice } from "./types";

// ============================================================================
// Helpers
// ============================================================================

/** Sort projects by lastOpened descending (most recent first). */
function sortByLastOpened(projects: Project[]): Project[] {
	return [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
}

// ============================================================================
// Slice
// ============================================================================

export const createProjectsSlice: StateCreator<AppStore, [], [], ProjectsSlice> = (set) => ({
	projects: [],
	activeProjectId: null,
	projectsLoading: false,

	setProjects: (projects) => {
		set({ projects: sortByLastOpened(projects) });
	},

	addProject: (project) => {
		set((s) => ({
			projects: sortByLastOpened([...s.projects, project]),
		}));
	},

	removeProject: (projectId) => {
		set((s) => ({
			projects: s.projects.filter((p) => p.id !== projectId),
			activeProjectId: s.activeProjectId === projectId ? null : s.activeProjectId,
		}));
	},

	updateProject: (projectId, updates) => {
		set((s) => {
			const updated = s.projects.map((p) => (p.id === projectId ? { ...p, ...updates } : p));
			return { projects: sortByLastOpened(updated) };
		});
	},

	setActiveProjectId: (projectId) => {
		set({ activeProjectId: projectId });
	},

	setProjectsLoading: (loading) => {
		set({ projectsLoading: loading });
	},
});
