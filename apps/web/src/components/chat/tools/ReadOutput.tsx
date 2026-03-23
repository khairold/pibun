/**
 * ReadOutput — syntax-highlighted file content for `read` tool output.
 *
 * Renders output with:
 * - File path in header with file icon
 * - Syntax highlighting based on file extension (via Shiki)
 * - Line numbers (optional, offset-aware if `offset` arg was provided)
 * - Copy button in header
 */

import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/cn";
import { getFileName, inferLanguageFromPath } from "@/lib/fileUtils";
import { memo } from "react";

interface ReadOutputProps {
	/** File path that was read. */
	path: string;
	/** File content (tool output). */
	output: string;
	/** Whether the tool is still running. */
	isRunning: boolean;
	/** Whether the result was an error. */
	isError: boolean;
	/** Starting line offset (from tool args), 1-indexed. */
	offset: number | null;
	/** Line limit (from tool args). */
	limit: number | null;
}

export const ReadOutput = memo(function ReadOutput({
	path,
	output,
	isRunning,
	isError,
	offset,
	limit,
}: ReadOutputProps) {
	const language = inferLanguageFromPath(path);
	const filename = getFileName(path);

	// Build info badge text (e.g., "lines 10-30")
	let rangeInfo = "";
	if (offset != null && offset > 1) {
		if (limit != null) {
			rangeInfo = `lines ${offset}–${offset + limit - 1}`;
		} else {
			rangeInfo = `from line ${offset}`;
		}
	} else if (limit != null) {
		rangeInfo = `first ${limit} lines`;
	}

	if (isError) {
		return (
			<div className="overflow-hidden rounded-md border border-red-500/30">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<pre className="px-3 py-2 text-xs text-red-300">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-neutral-800">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<div className="px-3 py-2 text-xs text-neutral-500">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-blue-400/70" />
				</div>
			</div>
		);
	}

	if (!output) {
		return (
			<div className="overflow-hidden rounded-md border border-neutral-800">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<pre className="px-3 py-2 text-xs italic text-neutral-600">(empty file)</pre>
			</div>
		);
	}

	return (
		<div>
			<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
			<CodeBlock code={output} language={language} />
		</div>
	);
});

/** File path header with icon and optional range info. */
const FileHeader = memo(function FileHeader({
	filename,
	path,
	rangeInfo,
}: {
	filename: string;
	path: string;
	rangeInfo: string;
}) {
	return (
		<div className="flex items-center gap-2 px-3 py-1.5">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0 text-neutral-500"
				aria-label="File"
				role="img"
			>
				<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm5 1.5v2A1.5 1.5 0 0 0 10.5 7h2L9 3.5Z" />
			</svg>
			<span className={cn("min-w-0 truncate text-xs", "text-blue-400")} title={path}>
				{filename}
			</span>
			{rangeInfo && <span className="shrink-0 text-[10px] text-neutral-600">{rangeInfo}</span>}
		</div>
	);
});
