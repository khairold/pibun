/**
 * Git integration WebSocket method handlers.
 *
 * Handles git operations for the active session's working directory:
 * - `git.status` — branch name + changed files
 * - `git.branch` — current branch name
 * - `git.diff` — unified diff output
 * - `git.log` — recent commit history
 *
 * These are NOT Pi RPC commands — they run git directly on the server
 * filesystem, similar to project handlers. CWD is resolved from the
 * active session's Pi process options, or overridden via params.
 */

import type {
	WsGitBranchParams,
	WsGitBranchResult,
	WsGitDiffParams,
	WsGitDiffResult,
	WsGitLogParams,
	WsGitLogResult,
	WsGitStatusParams,
	WsGitStatusResult,
} from "@pibun/contracts";
import { gitBranch, gitDiff, gitLog, gitStatus } from "../gitService.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Resolve the CWD for git operations.
 *
 * Priority: explicit `params.cwd` → session's Pi process CWD → server CWD.
 * Does NOT require an active session — falls back to `process.cwd()`.
 */
function resolveCwd(paramsCwd: string | undefined, ctx: HandlerContext): string {
	// 1. Explicit CWD from params
	if (paramsCwd) {
		return paramsCwd;
	}

	// 2. CWD from the active session's Pi process
	if (ctx.targetSessionId) {
		const session = ctx.rpcManager.getSession(ctx.targetSessionId);
		if (session) {
			const sessionCwd = session.process.options.cwd;
			if (sessionCwd) {
				return sessionCwd;
			}
		}
	}

	// 3. Fallback to server's CWD
	return process.cwd();
}

// ============================================================================
// git.status
// ============================================================================

/**
 * Get git status: branch name + changed files list.
 *
 * Returns `{ isRepo: false }` for non-git directories (doesn't throw).
 */
export const handleGitStatus: WsHandler<"git.status"> = async (
	params: WsGitStatusParams,
	ctx: HandlerContext,
): Promise<WsGitStatusResult> => {
	const cwd = resolveCwd(params?.cwd, ctx);
	const status = await gitStatus(cwd);
	return { status };
};

// ============================================================================
// git.branch
// ============================================================================

/**
 * Get the current branch name.
 *
 * Returns null for detached HEAD or non-git directories.
 */
export const handleGitBranch: WsHandler<"git.branch"> = async (
	params: WsGitBranchParams,
	ctx: HandlerContext,
): Promise<WsGitBranchResult> => {
	const cwd = resolveCwd(params?.cwd, ctx);
	const branch = await gitBranch(cwd);
	return { branch };
};

// ============================================================================
// git.diff
// ============================================================================

/**
 * Get unified diff output.
 *
 * By default shows unstaged changes. Pass `staged: true` for staged changes.
 * Pass `path` to restrict to a specific file.
 *
 * @throws If the directory is not a git repo.
 */
export const handleGitDiff: WsHandler<"git.diff"> = async (
	params: WsGitDiffParams,
	ctx: HandlerContext,
): Promise<WsGitDiffResult> => {
	const cwd = resolveCwd(params?.cwd, ctx);
	const diff = await gitDiff(cwd, {
		...(params?.staged !== undefined && { staged: params.staged }),
		...(params?.path !== undefined && { path: params.path }),
	});
	return { diff };
};

// ============================================================================
// git.log
// ============================================================================

/**
 * Get recent commit history as oneline entries.
 *
 * @throws If the directory is not a git repo or has no commits.
 */
export const handleGitLog: WsHandler<"git.log"> = async (
	params: WsGitLogParams,
	ctx: HandlerContext,
): Promise<WsGitLogResult> => {
	const cwd = resolveCwd(params?.cwd, ctx);
	const log = await gitLog(cwd, params?.count);
	return { log };
};
