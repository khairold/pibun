/**
 * Server-side git operations.
 *
 * Executes git commands via `Bun.spawn` in a given working directory.
 * Each function is independent — no shared state. The CWD parameter
 * determines which repository is queried.
 *
 * These functions are NOT Pi RPC commands — they run directly on the
 * server filesystem, similar to projectStore.ts.
 */

import type {
	GitChangedFile,
	GitDiffResult,
	GitLogEntry,
	GitLogResult,
	GitStatusResult,
	TurnDiffFileSummary,
	TurnDiffResult,
} from "@pibun/contracts";

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Run a git command in the specified directory.
 *
 * @returns `{ stdout, stderr, exitCode }`.
 * @throws If `Bun.spawn` itself fails (e.g., `git` binary not found).
 */
async function runGit(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		// Don't inherit env vars that might interfere with git output
		env: {
			...process.env,
			// Disable git pager — we want raw output
			GIT_PAGER: "",
			// Force English output for consistent parsing
			LC_ALL: "C",
		},
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	const exitCode = await proc.exited;

	return { stdout, stderr, exitCode };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check whether a directory is inside a git repository.
 *
 * Uses `git rev-parse --is-inside-work-tree` which returns "true\n"
 * with exit code 0 inside a repo, and exit code 128 outside.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
	try {
		const { exitCode, stdout } = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
		return exitCode === 0 && stdout.trim() === "true";
	} catch {
		// git binary not found or spawn failed
		return false;
	}
}

/**
 * Get the current branch name and changed files.
 *
 * Combines `git branch --show-current` and `git status --porcelain=v1`
 * into a single result. Returns `{ isRepo: false, ... }` if the
 * directory is not a git repository.
 */
export async function gitStatus(cwd: string): Promise<GitStatusResult> {
	// Check if this is a git repo first
	const repo = await isGitRepo(cwd);
	if (!repo) {
		return {
			isRepo: false,
			branch: null,
			files: [],
			isDirty: false,
		};
	}

	// Run branch and status in parallel
	const [branchResult, statusResult] = await Promise.all([
		runGit(["branch", "--show-current"], cwd),
		runGit(["status", "--porcelain=v1"], cwd),
	]);

	// Parse branch
	const branch =
		branchResult.exitCode === 0
			? branchResult.stdout.trim() || null // empty string = detached HEAD
			: null;

	// Parse porcelain status
	const files = parsePorcelainStatus(statusResult.stdout);

	return {
		isRepo: true,
		branch,
		files,
		isDirty: files.length > 0,
	};
}

/**
 * Get the current branch name.
 *
 * Returns null if detached HEAD or not a git repo.
 */
export async function gitBranch(cwd: string): Promise<string | null> {
	try {
		const { exitCode, stdout } = await runGit(["branch", "--show-current"], cwd);
		if (exitCode !== 0) return null;
		const branch = stdout.trim();
		return branch || null; // empty = detached HEAD
	} catch {
		return null;
	}
}

/**
 * Get the unified diff of working tree changes.
 *
 * By default shows unstaged changes (`git diff`). Pass `staged: true`
 * to show staged changes (`git diff --cached`). Pass a `path` to
 * restrict the diff to a specific file.
 *
 * @throws If the directory is not a git repo.
 */
export async function gitDiff(
	cwd: string,
	options?: { staged?: boolean; path?: string },
): Promise<GitDiffResult> {
	const repo = await isGitRepo(cwd);
	if (!repo) {
		throw new Error("Not a git repository");
	}

	const args = ["diff"];

	if (options?.staged) {
		args.push("--cached");
	}

	// Add -- separator before path to avoid ambiguity
	if (options?.path) {
		args.push("--", options.path);
	}

	const { stdout } = await runGit(args, cwd);

	return { diff: stdout };
}

/**
 * Get unified diff + per-file summary for specific files or all changes.
 *
 * Uses `git diff HEAD` to compare working tree + staged changes against
 * the last commit. When `files` is provided, restricts the diff to those
 * paths. Also runs `git diff HEAD --numstat` to get per-file line counts.
 *
 * If there's no HEAD commit (empty repo), falls back to `git diff --cached`
 * to show staged changes.
 *
 * @throws If the directory is not a git repo.
 */
export async function gitTurnDiff(cwd: string, files?: string[]): Promise<TurnDiffResult> {
	const repo = await isGitRepo(cwd);
	if (!repo) {
		throw new Error("Not a git repository");
	}

	// Check if HEAD exists (empty repos have no commits)
	const hasHead = await hasHeadCommit(cwd);

	// Build base args: diff against HEAD, or just staged if no HEAD
	const baseArgs = hasHead ? ["diff", "HEAD"] : ["diff", "--cached"];

	// Build file args (-- separator + file paths)
	const fileArgs = files && files.length > 0 ? ["--", ...files] : [];

	// Run unified diff and numstat in parallel
	const [diffResult, numstatResult] = await Promise.all([
		runGit([...baseArgs, ...fileArgs], cwd),
		runGit([...baseArgs, "--numstat", ...fileArgs], cwd),
	]);

	const fileSummaries = parseNumstat(numstatResult.stdout);

	return {
		diff: diffResult.stdout,
		files: fileSummaries,
		cwd,
	};
}

/**
 * Check if the repository has at least one commit (HEAD exists).
 */
async function hasHeadCommit(cwd: string): Promise<boolean> {
	try {
		const { exitCode } = await runGit(["rev-parse", "HEAD"], cwd);
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Parse `git diff --numstat` output into per-file summaries.
 *
 * Format: `<additions>\t<deletions>\t<filepath>`
 * Binary files show: `-\t-\t<filepath>`
 *
 * Example:
 * ```
 * 5       2       src/foo.ts
 * -       -       assets/icon.png
 * 10      0       src/new-file.ts
 * ```
 */
function parseNumstat(output: string): TurnDiffFileSummary[] {
	const summaries: TurnDiffFileSummary[] = [];

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parts = trimmed.split("\t");
		if (parts.length < 3) continue;

		const addStr = parts[0] ?? "-";
		const delStr = parts[1] ?? "-";
		const path = parts.slice(2).join("\t"); // Handle paths with tabs (unlikely but safe)

		// Binary files show "-" for additions/deletions
		const additions = addStr === "-" ? -1 : Number.parseInt(addStr, 10);
		const deletions = delStr === "-" ? -1 : Number.parseInt(delStr, 10);

		if (path) {
			summaries.push({ path, additions, deletions });
		}
	}

	return summaries.toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * Get the last N commits as oneline entries.
 *
 * @param count Number of commits to return (default: 10).
 * @throws If the directory is not a git repo or has no commits.
 */
export async function gitLog(cwd: string, count = 10): Promise<GitLogResult> {
	const repo = await isGitRepo(cwd);
	if (!repo) {
		throw new Error("Not a git repository");
	}

	const { exitCode, stdout, stderr } = await runGit(["log", "--oneline", `-${count}`], cwd);

	// Exit code 128 with "does not have any commits" is valid (empty repo)
	if (exitCode !== 0) {
		if (stderr.includes("does not have any commits")) {
			return { entries: [] };
		}
		throw new Error(`git log failed: ${stderr.trim()}`);
	}

	const entries = parseOnelineLog(stdout);

	return { entries };
}

// ============================================================================
// Parsers
// ============================================================================

/**
 * Parse `git status --porcelain=v1` output.
 *
 * Porcelain v1 format: two status characters, a space, then the path.
 * Renamed files have the format: `R  old -> new`
 *
 * Examples:
 * ```
 *  M src/foo.ts          — unstaged modification
 * M  src/bar.ts          — staged modification
 * ?? src/new.ts          — untracked
 * A  src/added.ts        — staged new file
 * D  src/deleted.ts      — staged deletion
 * R  old.ts -> new.ts    — rename
 * ```
 */
function parsePorcelainStatus(output: string): GitChangedFile[] {
	const files: GitChangedFile[] = [];

	for (const line of output.split("\n")) {
		if (!line || line.length < 4) continue;

		// First two chars are the status code
		const status = line.substring(0, 2);
		const rest = line.substring(3);

		// Check for rename/copy: "R  old -> new" or "C  old -> new"
		const isRenameOrCopy =
			status.charAt(0) === "R" ||
			status.charAt(0) === "C" ||
			status.charAt(1) === "R" ||
			status.charAt(1) === "C";

		if (isRenameOrCopy && rest.includes(" -> ")) {
			const arrowIndex = rest.indexOf(" -> ");
			const originalPath = rest.substring(0, arrowIndex);
			const newPath = rest.substring(arrowIndex + 4);
			files.push({ status, path: newPath, originalPath });
		} else {
			files.push({ status, path: rest, originalPath: null });
		}
	}

	return files;
}

/**
 * Parse `git log --oneline` output.
 *
 * Each line: `<abbreviated-hash> <message>`
 * Example: `a1b2c3d Fix the thing`
 */
function parseOnelineLog(output: string): GitLogEntry[] {
	const entries: GitLogEntry[] = [];

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const spaceIndex = trimmed.indexOf(" ");
		if (spaceIndex === -1) {
			// Hash-only line (no message)
			entries.push({ hash: trimmed, message: "" });
		} else {
			entries.push({
				hash: trimmed.substring(0, spaceIndex),
				message: trimmed.substring(spaceIndex + 1),
			});
		}
	}

	return entries;
}
