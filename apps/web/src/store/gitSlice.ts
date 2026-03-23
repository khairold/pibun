/**
 * Git state slice — branch, changed files, dirty status.
 *
 * Tracks the git status for the active session's working directory.
 * Updated by explicit refresh calls and after agent_end events.
 */

import type { GitChangedFile } from "@pibun/contracts";
import type { StateCreator } from "zustand";
import type { AppStore, GitSlice } from "./types";

export const createGitSlice: StateCreator<AppStore, [], [], GitSlice> = (set) => ({
	// State
	gitBranch: null,
	gitChangedFiles: [],
	gitIsDirty: false,
	gitIsRepo: false,
	gitLastFetched: null,
	gitLoading: false,
	gitPanelOpen: false,
	selectedDiffPath: null,
	selectedDiffContent: null,
	diffLoading: false,

	// Actions
	setGitStatus: (
		isRepo: boolean,
		branch: string | null,
		files: GitChangedFile[],
		isDirty: boolean,
	) =>
		set({
			gitIsRepo: isRepo,
			gitBranch: branch,
			gitChangedFiles: files,
			gitIsDirty: isDirty,
			gitLastFetched: Date.now(),
			gitLoading: false,
		}),

	setGitLoading: (loading: boolean) => set({ gitLoading: loading }),

	resetGit: () =>
		set({
			gitBranch: null,
			gitChangedFiles: [],
			gitIsDirty: false,
			gitIsRepo: false,
			gitLastFetched: null,
			gitLoading: false,
			gitPanelOpen: false,
			selectedDiffPath: null,
			selectedDiffContent: null,
			diffLoading: false,
		}),

	toggleGitPanel: () => set((state) => ({ gitPanelOpen: !state.gitPanelOpen })),

	setGitPanelOpen: (open: boolean) =>
		set({
			gitPanelOpen: open,
			// Clear selected diff when closing panel
			...(open ? {} : { selectedDiffPath: null, selectedDiffContent: null }),
		}),

	setSelectedDiff: (path: string | null, content: string | null) =>
		set({ selectedDiffPath: path, selectedDiffContent: content, diffLoading: false }),

	setDiffLoading: (loading: boolean) => set({ diffLoading: loading }),
});
