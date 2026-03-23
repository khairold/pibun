/**
 * @pibun/contracts — Git-related types
 *
 * Types for git status, branch, diff, and log data.
 * Used by the server-side git service and the WebSocket protocol.
 */

// ============================================================================
// Git Status
// ============================================================================

/**
 * A file with changes detected by `git status --porcelain`.
 *
 * Status codes follow git's porcelain format:
 * - `M` — modified
 * - `A` — added (staged)
 * - `D` — deleted
 * - `R` — renamed
 * - `C` — copied
 * - `?` — untracked
 * - `!` — ignored
 *
 * Two-character status: first char = index status, second char = working tree status.
 * Example: `"M "` = staged modification, `" M"` = unstaged modification, `"??"` = untracked.
 */
export interface GitChangedFile {
	/** Two-character porcelain status code (e.g., "M ", " M", "??", "A ", "D "). */
	status: string;
	/** File path relative to the repo root. */
	path: string;
	/** Original path for renames/copies (when status contains R or C). */
	originalPath: string | null;
}

/**
 * Result of `git status` for a directory.
 */
export interface GitStatusResult {
	/** Whether the directory is inside a git repository. */
	isRepo: boolean;
	/** Current branch name, or null if detached HEAD or not a repo. */
	branch: string | null;
	/** List of changed files (staged, unstaged, and untracked). */
	files: GitChangedFile[];
	/** True if there are any uncommitted changes (files.length > 0). */
	isDirty: boolean;
}

// ============================================================================
// Git Log
// ============================================================================

/**
 * A single commit entry from `git log --oneline`.
 */
export interface GitLogEntry {
	/** Abbreviated commit hash. */
	hash: string;
	/** Commit message (first line / oneline summary). */
	message: string;
}

/**
 * Result of `git log`.
 */
export interface GitLogResult {
	entries: GitLogEntry[];
}

// ============================================================================
// Git Diff
// ============================================================================

/**
 * Result of `git diff`.
 *
 * Contains the raw unified diff text. The web app handles parsing
 * and rendering (syntax highlighting, split view, etc.).
 */
export interface GitDiffResult {
	/** Raw unified diff output from git. Empty string if no changes. */
	diff: string;
}
