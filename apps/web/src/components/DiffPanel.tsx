/**
 * DiffPanel — side panel showing per-turn diffs with file tree and view toggle.
 *
 * Toggled via Ctrl/Cmd+D or the "View Diff" button on turn dividers.
 * Renders as a right-side panel beside the main chat area.
 *
 * Features:
 * - File tree sidebar with per-file addition/deletion stats
 * - Stacked (unified) or split diff view toggle
 * - Syntax-highlighted unified diff rendering
 * - Click file in tree to scroll to that file's diff
 * - Loading/empty/error states
 *
 * Uses `session.getTurnDiff` WS method for data. When opened from a turn
 * divider's "View Diff" button, shows diffs filtered by that turn's changed
 * files. When toggled via keyboard shortcut, shows all changes.
 */

import { cn, shortPath } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { TurnDiffFileSummary } from "@pibun/contracts";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

// ============================================================================
// Diff Fetch — loads diff data when panel opens or files change
// ============================================================================

/**
 * Fetch turn diff data from the server and update the store.
 * Called when the diff panel opens or when files change.
 */
async function fetchDiffData(files: string[]): Promise<void> {
	const store = useStore.getState();
	store.setDiffPanelLoading(true);
	store.setDiffPanelError(null);

	try {
		const params = files.length > 0 ? { files } : {};
		const result = await getTransport().request("session.getTurnDiff", params);
		useStore.getState().setDiffPanelResult(result.turnDiff);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		useStore.getState().setDiffPanelError(msg);
	} finally {
		useStore.getState().setDiffPanelLoading(false);
	}
}

// ============================================================================
// Diff Parsing — parse unified diff into per-file sections
// ============================================================================

/** A parsed file diff section from unified diff output. */
interface ParsedFileDiff {
	/** File path (from the diff header). */
	path: string;
	/** Raw diff lines for this file (including header). */
	lines: string[];
}

/** Line classification for diff rendering. */
type DiffLineKind = "header" | "hunk" | "addition" | "deletion" | "context";

/** Classify a diff line for rendering. */
function classifyDiffLine(line: string): DiffLineKind {
	if (
		line.startsWith("diff --git") ||
		line.startsWith("---") ||
		line.startsWith("+++") ||
		line.startsWith("index ")
	) {
		return "header";
	}
	if (line.startsWith("@@")) return "hunk";
	if (line.startsWith("+")) return "addition";
	if (line.startsWith("-")) return "deletion";
	return "context";
}

/**
 * Parse a unified diff string into per-file diff sections.
 * Splits on `diff --git` boundaries.
 */
function parseUnifiedDiff(diff: string): ParsedFileDiff[] {
	if (!diff.trim()) return [];

	const lines = diff.split("\n");
	const files: ParsedFileDiff[] = [];
	let currentFile: ParsedFileDiff | null = null;

	for (const line of lines) {
		if (line.startsWith("diff --git")) {
			// Extract file path from "diff --git a/path b/path"
			const match = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
			const path = match?.[2] ?? match?.[1] ?? "unknown";
			currentFile = { path, lines: [line] };
			files.push(currentFile);
		} else if (currentFile) {
			currentFile.lines.push(line);
		}
	}

	return files;
}

// ============================================================================
// Sub-components
// ============================================================================

/** File tree item in the diff panel sidebar. */
const DiffFileItem = memo(function DiffFileItem({
	file,
	isSelected,
	onSelect,
}: {
	file: TurnDiffFileSummary;
	isSelected: boolean;
	onSelect: (path: string) => void;
}) {
	const isBinary = file.additions === -1 && file.deletions === -1;
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav not needed for file tree items
		<div
			onClick={() => onSelect(file.path)}
			className={cn(
				"flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
				isSelected
					? "bg-accent-bg/20 text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
			)}
			title={file.path}
		>
			{/* File icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0 text-text-muted"
				aria-label="File"
				role="img"
			>
				<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm7 7a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5A.75.75 0 0 1 11 9Zm0 2.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 .75.75Z" />
			</svg>
			<span className="min-w-0 flex-1 truncate">{shortPath(file.path)}</span>
			{/* Stats */}
			{isBinary ? (
				<span className="shrink-0 text-[10px] text-text-muted">binary</span>
			) : (
				<span className="flex shrink-0 items-center gap-1 text-[10px]">
					{file.additions > 0 && <span className="text-green-500">+{file.additions}</span>}
					{file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
				</span>
			)}
		</div>
	);
});

/** Render a single diff line with appropriate coloring. */
function DiffLine({ line, lineNumber }: { line: string; lineNumber: number }) {
	const kind = classifyDiffLine(line);

	return (
		<div
			className={cn(
				"flex font-mono text-[11px] leading-5",
				kind === "addition" && "bg-green-500/10",
				kind === "deletion" && "bg-red-500/10",
				kind === "hunk" && "bg-accent-bg/10 text-text-muted",
				kind === "header" && "text-text-muted",
				kind === "context" && "text-text-secondary",
			)}
		>
			<span className="w-10 shrink-0 select-none pr-2 text-right text-text-muted/50">
				{kind === "header" || kind === "hunk" ? "" : lineNumber}
			</span>
			<span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-4">
				<span
					className={cn(
						"select-none",
						kind === "addition" && "text-green-500",
						kind === "deletion" && "text-red-500",
					)}
				>
					{kind === "addition" ? "+" : kind === "deletion" ? "-" : " "}
				</span>
				<span
					className={cn(
						kind === "addition" && "text-green-400",
						kind === "deletion" && "text-red-400",
					)}
				>
					{line.length > 0 ? line.slice(1) : ""}
				</span>
			</span>
		</div>
	);
}

/** Render a single file diff section with header and lines. */
const FileDiffSection = memo(function FileDiffSection({
	fileDiff,
	id,
}: {
	fileDiff: ParsedFileDiff;
	id: string;
}) {
	let contextLineNum = 0;

	return (
		<div id={id} className="overflow-hidden rounded-md border border-border-secondary">
			{/* File header */}
			<div className="flex items-center gap-2 border-b border-border-secondary bg-surface-secondary/50 px-3 py-1.5 text-xs">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 shrink-0 text-text-muted"
					aria-label="File"
					role="img"
				>
					<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm7 7a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5A.75.75 0 0 1 11 9Zm0 2.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 .75.75Z" />
				</svg>
				<span className="min-w-0 flex-1 truncate font-medium text-text-primary">
					{fileDiff.path}
				</span>
			</div>
			{/* Diff lines */}
			<div className="overflow-x-auto bg-surface-base">
				{fileDiff.lines.map((line, idx) => {
					const kind = classifyDiffLine(line);
					// Track line numbers for non-header/hunk lines
					if (kind !== "header" && kind !== "hunk") {
						contextLineNum++;
					}
					// Parse hunk header for starting line number
					if (kind === "hunk") {
						const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
						if (hunkMatch?.[1]) {
							contextLineNum = Number.parseInt(hunkMatch[1], 10) - 1;
						}
					}
					const key = `${fileDiff.path}-${idx}`;
					return <DiffLine key={key} line={line} lineNumber={contextLineNum} />;
				})}
			</div>
		</div>
	);
});

/** Total stats summary for all files. */
function DiffSummary({ files }: { files: TurnDiffFileSummary[] }) {
	const totalAdditions = files.reduce((sum, f) => sum + (f.additions > 0 ? f.additions : 0), 0);
	const totalDeletions = files.reduce((sum, f) => sum + (f.deletions > 0 ? f.deletions : 0), 0);

	return (
		<div className="flex items-center gap-3 border-b border-border-secondary px-4 py-2 text-xs text-text-secondary">
			<span>
				{files.length} {files.length === 1 ? "file" : "files"} changed
			</span>
			{totalAdditions > 0 && <span className="text-green-500">+{totalAdditions}</span>}
			{totalDeletions > 0 && <span className="text-red-500">-{totalDeletions}</span>}
		</div>
	);
}

// ============================================================================
// DiffPanel — main component
// ============================================================================

export function DiffPanel() {
	const diffPanelOpen = useStore((s) => s.diffPanelOpen);
	const diffPanelFiles = useStore((s) => s.diffPanelFiles);
	const diffPanelLoading = useStore((s) => s.diffPanelLoading);
	const diffPanelResult = useStore((s) => s.diffPanelResult);
	const diffPanelError = useStore((s) => s.diffPanelError);
	const diffPanelMode = useStore((s) => s.diffPanelMode);
	const diffPanelSelectedFile = useStore((s) => s.diffPanelSelectedFile);
	const setDiffPanelOpen = useStore((s) => s.setDiffPanelOpen);
	const setDiffPanelMode = useStore((s) => s.setDiffPanelMode);
	const setDiffPanelSelectedFile = useStore((s) => s.setDiffPanelSelectedFile);

	const contentRef = useRef<HTMLDivElement>(null);

	// Fetch diff data when panel opens or files change
	useEffect(() => {
		if (!diffPanelOpen) return;
		fetchDiffData(diffPanelFiles).catch((err: unknown) => {
			console.error("[DiffPanel] Failed to fetch diff:", err);
		});
	}, [diffPanelOpen, diffPanelFiles]);

	// Parse the unified diff into per-file sections
	const parsedFiles = useMemo(
		() => (diffPanelResult ? parseUnifiedDiff(diffPanelResult.diff) : []),
		[diffPanelResult],
	);

	// Filter to selected file if one is selected
	const visibleFiles = useMemo(() => {
		if (!diffPanelSelectedFile) return parsedFiles;
		return parsedFiles.filter((f) => f.path === diffPanelSelectedFile);
	}, [parsedFiles, diffPanelSelectedFile]);

	// Scroll to a file section when selected
	const handleFileSelect = useCallback(
		(path: string) => {
			const newPath = diffPanelSelectedFile === path ? null : path;
			setDiffPanelSelectedFile(newPath);

			// Scroll to file section
			if (newPath && contentRef.current) {
				const fileId = `diff-file-${newPath.replace(/[^a-zA-Z0-9]/g, "-")}`;
				const element = contentRef.current.querySelector(`#${CSS.escape(fileId)}`);
				element?.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		},
		[diffPanelSelectedFile, setDiffPanelSelectedFile],
	);

	if (!diffPanelOpen) return null;

	return (
		<div className="flex h-full w-[420px] min-w-[320px] max-w-[560px] shrink-0 flex-col border-l border-border-primary bg-surface-base">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border-secondary px-4 py-2">
				<div className="flex items-center gap-2">
					{/* Diff icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-4 w-4 text-text-muted"
						aria-label="Diff panel"
						role="img"
					>
						<path d="M8 1a.75.75 0 0 1 .75.75V6.5h4.75a.75.75 0 0 1 0 1.5H8.75v4.75a.75.75 0 0 1-1.5 0V8H2.5a.75.75 0 0 1 0-1.5h4.75V1.75A.75.75 0 0 1 8 1Z" />
					</svg>
					<span className="text-sm font-medium text-text-primary">Changes</span>
					{diffPanelFiles.length > 0 && (
						<span className="text-xs text-text-muted">
							({diffPanelFiles.length} {diffPanelFiles.length === 1 ? "file" : "files"})
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					{/* View mode toggle */}
					<div className="flex items-center rounded-md border border-border-secondary">
						<button
							type="button"
							onClick={() => setDiffPanelMode("stacked")}
							className={cn(
								"rounded-l-md px-2 py-1 text-xs transition-colors",
								diffPanelMode === "stacked"
									? "bg-surface-secondary text-text-primary"
									: "text-text-muted hover:text-text-secondary",
							)}
							title="Stacked (unified) view"
						>
							{/* Rows icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-3.5 w-3.5"
								aria-label="Stacked view"
								role="img"
							>
								<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v2A1.5 1.5 0 0 1 12.5 7h-9A1.5 1.5 0 0 1 2 5.5v-2Zm0 7A1.5 1.5 0 0 1 3.5 9h9a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-2Z" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => setDiffPanelMode("split")}
							className={cn(
								"rounded-r-md px-2 py-1 text-xs transition-colors",
								diffPanelMode === "split"
									? "bg-surface-secondary text-text-primary"
									: "text-text-muted hover:text-text-secondary",
							)}
							title="Split (side-by-side) view"
						>
							{/* Columns icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-3.5 w-3.5"
								aria-label="Split view"
								role="img"
							>
								<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2A1.5 1.5 0 0 1 7 3.5v9A1.5 1.5 0 0 1 5.5 14h-2A1.5 1.5 0 0 1 2 12.5v-9ZM9 3.5A1.5 1.5 0 0 1 10.5 2h2A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9 12.5v-9Z" />
							</svg>
						</button>
					</div>
					{/* Close button */}
					<button
						type="button"
						onClick={() => setDiffPanelOpen(false)}
						className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-secondary"
						title="Close diff panel (Ctrl+D)"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4"
							aria-label="Close"
							role="img"
						>
							<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
						</svg>
					</button>
				</div>
			</div>

			{/* Loading state */}
			{diffPanelLoading && (
				<div className="flex flex-1 items-center justify-center">
					<div className="flex items-center gap-2 text-xs text-text-muted">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
						<span>Loading diff{"\u2026"}</span>
					</div>
				</div>
			)}

			{/* Error state */}
			{!diffPanelLoading && diffPanelError && (
				<div className="flex flex-1 items-center justify-center px-4">
					<div className="text-center">
						<p className="text-xs text-red-400">{diffPanelError}</p>
						<button
							type="button"
							onClick={() => fetchDiffData(diffPanelFiles)}
							className="mt-2 text-xs text-accent-text hover:underline"
						>
							Retry
						</button>
					</div>
				</div>
			)}

			{/* Empty state */}
			{!diffPanelLoading && !diffPanelError && diffPanelResult && parsedFiles.length === 0 && (
				<div className="flex flex-1 items-center justify-center px-4">
					<p className="text-xs text-text-muted">
						{diffPanelResult.diff.trim().length === 0
							? "No changes detected."
							: "Could not parse diff output."}
					</p>
				</div>
			)}

			{/* Content: file tree + diff view */}
			{!diffPanelLoading && !diffPanelError && diffPanelResult && parsedFiles.length > 0 && (
				<>
					{/* File summary bar */}
					<DiffSummary files={diffPanelResult.files} />

					{/* File tree + diff content */}
					<div className="flex min-h-0 flex-1 flex-col">
						{/* File tree — clickable, compact */}
						{diffPanelResult.files.length > 1 && (
							<div className="max-h-40 shrink-0 overflow-y-auto border-b border-border-secondary p-1">
								{/* "All files" option */}
								{/* biome-ignore lint/a11y/useKeyWithClickEvents: click-only navigation */}
								<div
									onClick={() => setDiffPanelSelectedFile(null)}
									className={cn(
										"flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
										diffPanelSelectedFile === null
											? "bg-accent-bg/20 text-text-primary"
											: "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
									)}
								>
									<span className="font-medium">All files</span>
								</div>
								{diffPanelResult.files.map((file) => (
									<DiffFileItem
										key={file.path}
										file={file}
										isSelected={diffPanelSelectedFile === file.path}
										onSelect={handleFileSelect}
									/>
								))}
							</div>
						)}

						{/* Diff content */}
						<div ref={contentRef} className="flex-1 space-y-3 overflow-y-auto p-3">
							{visibleFiles.map((fileDiff) => (
								<FileDiffSection
									key={fileDiff.path}
									fileDiff={fileDiff}
									id={`diff-file-${fileDiff.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
								/>
							))}
						</div>
					</div>
				</>
			)}

			{/* Not loaded yet (panel just opened, waiting for session) */}
			{!diffPanelLoading && !diffPanelError && !diffPanelResult && (
				<div className="flex flex-1 items-center justify-center px-4">
					<p className="text-xs text-text-muted">Open a session to view changes.</p>
				</div>
			)}
		</div>
	);
}
