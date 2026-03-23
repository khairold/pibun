/**
 * GitPanel — collapsible panel showing changed files and inline diffs.
 *
 * Sits between the toolbar and ChatView in AppShell. Opens when the user
 * clicks the changed files badge in GitStatusBar or presses Ctrl+G (3.9).
 *
 * Left side: file list with status badges (M/A/D/?).
 * Right side: raw diff preview for the selected file (upgraded to
 * syntax-highlighted DiffViewer in 3.7).
 */

import { cn } from "@/lib/cn";
import { fetchGitDiff, fetchGitStatus } from "@/lib/gitActions";
import { useStore } from "@/store";
import type { GitChangedFile } from "@pibun/contracts";
import { memo, useCallback } from "react";
import { DiffViewer } from "./DiffViewer";

// ============================================================================
// Status badge helpers
// ============================================================================

/** Map two-character porcelain status to a human-readable short label. */
function statusLabel(status: string): string {
	const trimmed = status.trim();
	if (trimmed === "??") return "?";
	if (trimmed === "!!") return "!";
	// Use the most significant char (index or worktree)
	// index status is first char, worktree is second
	if (status[0] === "R" || status[1] === "R") return "R";
	if (status[0] === "C" || status[1] === "C") return "C";
	if (status[0] === "D" || status[1] === "D") return "D";
	if (status[0] === "A" || status[1] === "A") return "A";
	if (status[0] === "M" || status[1] === "M") return "M";
	return trimmed.charAt(0) || "?";
}

/** Color class for status badge by status label. */
function statusColor(label: string): string {
	switch (label) {
		case "M":
			return "text-amber-400 bg-amber-400/10";
		case "A":
			return "text-green-400 bg-green-400/10";
		case "D":
			return "text-red-400 bg-red-400/10";
		case "R":
			return "text-blue-400 bg-blue-400/10";
		case "C":
			return "text-blue-400 bg-blue-400/10";
		case "?":
			return "text-neutral-400 bg-neutral-400/10";
		case "!":
			return "text-neutral-600 bg-neutral-600/10";
		default:
			return "text-neutral-400 bg-neutral-400/10";
	}
}

/** Full status description for tooltip. */
function statusTooltip(status: string): string {
	const trimmed = status.trim();
	if (trimmed === "??") return "Untracked";
	if (trimmed === "!!") return "Ignored";
	const labels: string[] = [];
	if (status[0] === "M") labels.push("Staged modification");
	if (status[1] === "M") labels.push("Unstaged modification");
	if (status[0] === "A") labels.push("Staged addition");
	if (status[1] === "A") labels.push("Unstaged addition");
	if (status[0] === "D") labels.push("Staged deletion");
	if (status[1] === "D") labels.push("Unstaged deletion");
	if (status[0] === "R") labels.push("Renamed (staged)");
	if (status[1] === "R") labels.push("Renamed (unstaged)");
	if (status[0] === "C") labels.push("Copied (staged)");
	if (status[1] === "C") labels.push("Copied (unstaged)");
	return labels.length > 0 ? labels.join(", ") : `Status: ${status}`;
}

// ============================================================================
// File list item
// ============================================================================

interface FileItemProps {
	file: GitChangedFile;
	isSelected: boolean;
	onSelect: (path: string) => void;
}

const FileItem = memo(function FileItem({ file, isSelected, onSelect }: FileItemProps) {
	const label = statusLabel(file.status);
	const color = statusColor(label);
	const tooltip = statusTooltip(file.status);

	const handleClick = useCallback(() => {
		onSelect(file.path);
	}, [file.path, onSelect]);

	// Extract filename from path for compact display
	const parts = file.path.split("/");
	const fileName = parts[parts.length - 1] ?? file.path;
	const directory = parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "";

	return (
		<button
			type="button"
			aria-pressed={isSelected}
			onClick={handleClick}
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
				"hover:bg-neutral-800",
				isSelected && "bg-neutral-800 ring-1 ring-neutral-700",
			)}
			title={`${tooltip}\n${file.path}`}
		>
			{/* Status badge */}
			<span
				className={cn(
					"inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
					color,
				)}
			>
				{label}
			</span>

			{/* File path */}
			<span className="min-w-0 flex-1 truncate">
				{directory && <span className="text-neutral-600">{directory}</span>}
				<span className="text-neutral-300">{fileName}</span>
			</span>

			{/* Rename indicator */}
			{file.originalPath && (
				<span className="shrink-0 text-[10px] text-neutral-600" title={`from ${file.originalPath}`}>
					← {file.originalPath.split("/").pop()}
				</span>
			)}
		</button>
	);
});

// ============================================================================
// Diff display — delegates to DiffViewer with loading/empty states
// ============================================================================

function DiffDisplay({
	diff,
	loading,
	filePath,
}: {
	diff: string | null;
	loading: boolean;
	filePath: string | null;
}) {
	if (loading) {
		return (
			<div className="flex items-center gap-2 p-4 text-xs text-neutral-500">
				<div className="h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-neutral-400" />
				Loading diff…
			</div>
		);
	}

	if (!diff) {
		return (
			<div className="flex items-center justify-center p-8 text-xs text-neutral-600">
				Select a file to view its diff
			</div>
		);
	}

	if (diff.trim() === "") {
		return (
			<div className="flex items-center justify-center p-8 text-xs text-neutral-600">
				No diff available (file may be untracked or binary)
			</div>
		);
	}

	return <DiffViewer diff={diff} filePath={filePath ?? undefined} />;
}

// ============================================================================
// GitPanel
// ============================================================================

export function GitPanel() {
	const gitPanelOpen = useStore((s) => s.gitPanelOpen);
	const gitChangedFiles = useStore((s) => s.gitChangedFiles);
	const gitIsDirty = useStore((s) => s.gitIsDirty);
	const gitLoading = useStore((s) => s.gitLoading);
	const selectedDiffPath = useStore((s) => s.selectedDiffPath);
	const selectedDiffContent = useStore((s) => s.selectedDiffContent);
	const diffLoading = useStore((s) => s.diffLoading);
	const setGitPanelOpen = useStore((s) => s.setGitPanelOpen);

	const handleFileSelect = useCallback((path: string) => {
		fetchGitDiff(path);
	}, []);

	const handleClose = useCallback(() => {
		setGitPanelOpen(false);
	}, [setGitPanelOpen]);

	const handleRefresh = useCallback(async () => {
		await fetchGitStatus();
	}, []);

	if (!gitPanelOpen) return null;

	const changedCount = gitChangedFiles.length;

	return (
		<div className="flex max-h-[40vh] flex-col border-b border-neutral-800 bg-neutral-950">
			{/* Panel header */}
			<div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-3 py-2">
				<div className="flex items-center gap-2">
					{/* Git icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5 text-neutral-500"
						aria-label="Git changes"
						role="img"
					>
						<path
							fillRule="evenodd"
							d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"
							clipRule="evenodd"
						/>
					</svg>
					<span className="text-xs font-medium text-neutral-400">
						Changed Files
						{changedCount > 0 && (
							<span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-400">
								{changedCount}
							</span>
						)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					{/* Refresh button */}
					<button
						type="button"
						onClick={handleRefresh}
						disabled={gitLoading}
						className={cn(
							"rounded p-1 text-neutral-500 transition-colors hover:text-neutral-300",
							gitLoading && "animate-spin",
						)}
						title="Refresh git status"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3.5 w-3.5"
							aria-label="Refresh"
							role="img"
						>
							<path
								fillRule="evenodd"
								d="M3.083 5.802a5 5 0 0 1 8.92-.798.75.75 0 1 0 1.37-.61 6.5 6.5 0 0 0-11.595 1.036L1 4.75V7.5h2.75L3.083 5.802zM12.917 10.198a5 5 0 0 1-8.92.798.75.75 0 0 0-1.37.61 6.5 6.5 0 0 0 11.595-1.036L15 11.25V8.5h-2.75l.667 1.698z"
								clipRule="evenodd"
							/>
						</svg>
					</button>
					{/* Close button */}
					<button
						type="button"
						onClick={handleClose}
						className="rounded p-1 text-neutral-500 transition-colors hover:text-neutral-300"
						title="Close git panel"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3.5 w-3.5"
							aria-label="Close"
							role="img"
						>
							<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
						</svg>
					</button>
				</div>
			</div>

			{/* Panel body — file list + diff preview */}
			{!gitIsDirty || changedCount === 0 ? (
				<div className="flex items-center justify-center py-6 text-xs text-neutral-600">
					Working tree clean — no changes to show
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					{/* File list (left) */}
					<nav
						aria-label="Changed files"
						className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800 p-1.5"
					>
						{gitChangedFiles.map((file) => (
							<FileItem
								key={file.path}
								file={file}
								isSelected={selectedDiffPath === file.path}
								onSelect={handleFileSelect}
							/>
						))}
					</nav>

					{/* Diff preview (right) */}
					<div className="min-w-0 flex-1 overflow-auto bg-neutral-900/50">
						{selectedDiffPath && (
							<div className="border-b border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
								{selectedDiffPath}
							</div>
						)}
						<DiffDisplay
							diff={selectedDiffContent}
							loading={diffLoading}
							filePath={selectedDiffPath}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
