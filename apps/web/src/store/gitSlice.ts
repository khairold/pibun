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
		}),
});
