/**
 * WriteOutput — file preview for `write` tool output.
 *
 * Renders a preview of the written file with:
 * - File path in header with a "created"/"written" badge
 * - Syntax-highlighted content preview (from tool args)
 * - Collapsible for large files
 * - Error state for failed writes
 */

import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/cn";
import { getFileName, inferLanguageFromPath } from "@/lib/fileUtils";
import { memo, useCallback, useState } from "react";

/** Maximum content lines before collapsing in preview. */
const PREVIEW_COLLAPSE_THRESHOLD = 30;

interface WriteOutputProps {
	/** File path being written. */
	path: string;
	/** File content (from tool args). */
	fileContent: string;
	/** Tool execution output (confirmation message from Pi). */
	output: string;
	/** Whether the tool is still running. */
	isRunning: boolean;
	/** Whether the result was an error. */
	isError: boolean;
}

export const WriteOutput = memo(function WriteOutput({
	path,
	fileContent,
	output,
	isRunning,
	isError,
}: WriteOutputProps) {
	const [previewExpanded, setPreviewExpanded] = useState(false);
	const filename = getFileName(path);
	const language = inferLanguageFromPath(path);

	const togglePreview = useCallback(() => {
		setPreviewExpanded((prev) => !prev);
	}, []);

	if (isError) {
		return (
			<div className="overflow-hidden rounded-md border border-red-500/30">
				<WriteHeader filename={filename} path={path} />
				<pre className="px-3 py-2 text-xs text-red-300">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-neutral-800">
				<WriteHeader filename={filename} path={path} />
				<div className="px-3 py-2 text-xs text-neutral-500">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-blue-400/70" />
				</div>
			</div>
		);
	}

	const contentLines = fileContent.split("\n");
	const isLong = contentLines.length > PREVIEW_COLLAPSE_THRESHOLD;
	const displayContent =
		!previewExpanded && isLong
			? contentLines.slice(0, PREVIEW_COLLAPSE_THRESHOLD).join("\n")
			: fileContent;

	return (
		<div className="overflow-hidden rounded-md border border-neutral-800">
			<WriteHeader filename={filename} path={path} />

			{/* File content preview */}
			{fileContent ? (
				<div className="relative">
					<CodeBlock code={displayContent} language={language} />

					{/* Fade gradient when collapsed */}
					{isLong && !previewExpanded && (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-neutral-900 to-transparent" />
					)}
				</div>
			) : (
				<pre className="px-3 py-2 text-xs italic text-neutral-600">(empty file)</pre>
			)}

			{/* Expand/collapse for long files */}
			{isLong && (
				<button
					type="button"
					onClick={togglePreview}
					className={cn(
						"w-full border-t border-neutral-800 px-3 py-1.5",
						"text-xs text-neutral-500 transition-colors hover:text-neutral-300",
					)}
				>
					{previewExpanded ? "Show less" : `Show all ${contentLines.length} lines`}
				</button>
			)}

			{/* Confirmation message */}
			{output && (
				<div className="border-t border-neutral-800/50 px-3 py-1.5">
					<p className="text-xs text-neutral-500">{output}</p>
				</div>
			)}
		</div>
	);
});

/** Header with file icon and "written" badge. */
const WriteHeader = memo(function WriteHeader({
	filename,
	path,
}: {
	filename: string;
	path: string;
}) {
	return (
		<div className="flex items-center gap-2 px-3 py-1.5">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0 text-green-500/70"
				aria-label="Write file"
				role="img"
			>
				<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm5 1.5v2A1.5 1.5 0 0 0 10.5 7h2L9 3.5Z" />
			</svg>
			<span className="min-w-0 truncate text-xs text-green-400" title={path}>
				{filename}
			</span>
			<span className="shrink-0 text-[10px] text-neutral-600">written</span>
		</div>
	);
});
