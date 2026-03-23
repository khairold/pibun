/**
 * EditOutput — diff view for `edit` tool output.
 *
 * Renders a unified-style diff showing:
 * - File path in header
 * - Removed lines (old text) in red
 * - Added lines (new text) in green
 * - Collapsible to save space for large diffs
 */

import { cn } from "@/lib/cn";
import { getFileName } from "@/lib/fileUtils";
import { memo, useCallback, useState } from "react";

/** Maximum diff lines before collapsing. */
const COLLAPSE_THRESHOLD = 20;

interface EditOutputProps {
	/** File path being edited. */
	path: string;
	/** The old text being replaced. */
	oldText: string;
	/** The new text replacing the old. */
	newText: string;
	/** Tool execution output (confirmation message from Pi). */
	output: string;
	/** Whether the tool is still running. */
	isRunning: boolean;
	/** Whether the result was an error. */
	isError: boolean;
}

export const EditOutput = memo(function EditOutput({
	path,
	oldText,
	newText,
	output,
	isRunning,
	isError,
}: EditOutputProps) {
	const [expanded, setExpanded] = useState(false);
	const filename = getFileName(path);

	const toggleExpanded = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	if (isError) {
		return (
			<div className="overflow-hidden rounded-md border border-red-500/30">
				<DiffHeader filename={filename} path={path} />
				<pre className="px-3 py-2 text-xs text-red-300">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-neutral-800">
				<DiffHeader filename={filename} path={path} />
				<div className="px-3 py-2 text-xs text-neutral-500">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-blue-400/70" />
				</div>
			</div>
		);
	}

	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const totalDiffLines = oldLines.length + newLines.length;
	const isLong = totalDiffLines > COLLAPSE_THRESHOLD;
	const showAll = !isLong || expanded;

	return (
		<div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
			<DiffHeader filename={filename} path={path} />

			{/* Diff content */}
			<div className="overflow-x-auto font-mono text-xs leading-relaxed">
				{/* Removed lines (old text) */}
				{(showAll ? oldLines : oldLines.slice(0, Math.floor(COLLAPSE_THRESHOLD / 2))).map(
					(line, i) => (
						<div
							key={`old-${i.toString()}`}
							className="flex border-b border-red-500/5 bg-red-950/20"
						>
							<span className="w-8 shrink-0 select-none px-2 text-right text-red-500/40">−</span>
							<pre className="min-w-0 flex-1 px-2 py-px text-red-300/80">{line}</pre>
						</div>
					),
				)}

				{/* Separator between old and new */}
				{oldLines.length > 0 && newLines.length > 0 && showAll && (
					<div className="border-b border-neutral-800/50 bg-neutral-800/20 px-3 py-0.5 text-center text-[10px] text-neutral-600">
						···
					</div>
				)}

				{/* Added lines (new text) */}
				{(showAll ? newLines : newLines.slice(0, Math.floor(COLLAPSE_THRESHOLD / 2))).map(
					(line, i) => (
						<div
							key={`new-${i.toString()}`}
							className="flex border-b border-green-500/5 bg-green-950/20"
						>
							<span className="w-8 shrink-0 select-none px-2 text-right text-green-500/40">+</span>
							<pre className="min-w-0 flex-1 px-2 py-px text-green-300/80">{line}</pre>
						</div>
					),
				)}
			</div>

			{/* Expand/collapse for long diffs */}
			{isLong && (
				<button
					type="button"
					onClick={toggleExpanded}
					className={cn(
						"w-full border-t border-neutral-800 px-3 py-1.5",
						"text-xs text-neutral-500 transition-colors hover:text-neutral-300",
					)}
				>
					{expanded ? "Show less" : `Show all ${totalDiffLines} lines`}
				</button>
			)}

			{/* Confirmation message from Pi */}
			{output && (
				<div className="border-t border-neutral-800/50 px-3 py-1.5">
					<p className="text-xs text-neutral-500">{output}</p>
				</div>
			)}
		</div>
	);
});

/** Header with file icon and path. */
const DiffHeader = memo(function DiffHeader({
	filename,
	path,
}: {
	filename: string;
	path: string;
}) {
	return (
		<div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0 text-amber-500/70"
				aria-label="Edit"
				role="img"
			>
				<path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61ZM11.189 4 3.75 11.44l-.528 1.848 1.848-.528L12.51 5.31 11.189 4Z" />
			</svg>
			<span className="min-w-0 truncate text-xs text-amber-400" title={path}>
				{filename}
			</span>
			<span className="shrink-0 text-[10px] text-neutral-600">edited</span>
		</div>
	);
});
