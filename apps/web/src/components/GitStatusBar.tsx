/**
 * GitStatusBar — branch name + changed file count in the toolbar.
 *
 * Shows the current git branch with a branch icon and the number of
 * changed files (if any). Only renders when the session's CWD is inside
 * a git repository.
 *
 * Clicking the changed files badge toggles the git panel (GitPanel).
 * Ctrl+G also toggles the panel (wired in 3.9).
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import { useCallback } from "react";

export function GitStatusBar() {
	const gitIsRepo = useStore((s) => s.gitIsRepo);
	const gitBranch = useStore((s) => s.gitBranch);
	const gitChangedFiles = useStore((s) => s.gitChangedFiles);
	const gitIsDirty = useStore((s) => s.gitIsDirty);
	const gitLoading = useStore((s) => s.gitLoading);
	const gitPanelOpen = useStore((s) => s.gitPanelOpen);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const sessionId = useStore((s) => s.sessionId);
	const toggleGitPanel = useStore((s) => s.toggleGitPanel);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;

	const handleTogglePanel = useCallback(() => {
		toggleGitPanel();
	}, [toggleGitPanel]);

	// Don't render if not connected, no session, or not a git repo
	if (!isConnected || !hasSession || !gitIsRepo) return null;

	const changedCount = gitChangedFiles.length;

	return (
		<div className="flex items-center gap-1.5">
			{/* Branch indicator */}
			<button
				type="button"
				onClick={handleTogglePanel}
				className={cn(
					"flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
					"text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300",
					gitPanelOpen && "bg-neutral-800 text-neutral-300",
					gitLoading && "animate-pulse",
				)}
				title={
					gitBranch
						? `Branch: ${gitBranch} — click to toggle git panel`
						: "Detached HEAD — click to toggle git panel"
				}
			>
				{/* Git branch icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 shrink-0"
					aria-label="Git branch"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"
						clipRule="evenodd"
					/>
				</svg>
				<span className="max-w-[120px] truncate">{gitBranch ?? "HEAD"}</span>
			</button>

			{/* Changed files count badge — click toggles git panel */}
			{gitIsDirty && changedCount > 0 && (
				<button
					type="button"
					onClick={handleTogglePanel}
					className={cn(
						"flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] tabular-nums transition-colors",
						"text-amber-500/80 hover:bg-neutral-800 hover:text-amber-400",
						gitPanelOpen && "bg-neutral-800 text-amber-400",
					)}
					title={`${String(changedCount)} changed file${changedCount === 1 ? "" : "s"} — click to toggle git panel`}
				>
					{/* Modified file icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3 shrink-0"
						aria-label="Changed files"
						role="img"
					>
						<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
					</svg>
					<span>{changedCount}</span>
				</button>
			)}

			{/* Clean indicator — small green dot when no changes */}
			{gitIsRepo && !gitIsDirty && (
				<div className="flex items-center px-1" title="Working tree clean">
					<div className="h-1.5 w-1.5 rounded-full bg-green-500/60" />
				</div>
			)}
		</div>
	);
}
