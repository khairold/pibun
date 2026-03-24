/**
 * ToolOutput — dispatcher and specialized renderers for tool execution output.
 *
 * Routes to the appropriate renderer based on tool name:
 * - `bash` → BashOutput (terminal-style with command header)
 * - `read` → ReadOutput (syntax-highlighted file with path and line range)
 * - `edit` → EditOutput (unified diff view with old/new text)
 * - `write` → WriteOutput (syntax-highlighted file preview)
 * - All others → DefaultOutput (raw preformatted text)
 *
 * Each renderer is a named export for direct use, though typically
 * only `ToolOutput` (the dispatcher) is consumed externally.
 */

import { CodeBlock } from "@/components/CodeBlock";
import { cn, getFileName, inferLanguageFromPath } from "@/lib/utils";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useState } from "react";

// ==== Dispatcher ====

interface ToolOutputProps {
	/** The tool call message (contains name and args). */
	toolCall: ChatMessage;
	/** The tool result message (contains output), null if still running. */
	toolResult: ChatMessage | null;
}

export const ToolOutput = memo(function ToolOutput({ toolCall, toolResult }: ToolOutputProps) {
	const tc = toolCall.toolCall;
	if (!tc) return null;

	const output = toolResult?.toolResult?.content ?? "";
	const isRunning = !toolResult || toolResult.streaming;
	const isError = toolResult?.toolResult?.isError ?? false;

	switch (tc.name) {
		case "bash":
			return (
				<BashOutput
					command={safeString(tc.args.command)}
					output={output}
					isRunning={isRunning}
					isError={isError}
				/>
			);

		case "read":
			return (
				<ReadOutput
					path={safeString(tc.args.path)}
					output={output}
					isRunning={isRunning}
					isError={isError}
					offset={safeNumber(tc.args.offset)}
					limit={safeNumber(tc.args.limit)}
				/>
			);

		case "edit":
			return (
				<EditOutput
					path={safeString(tc.args.path)}
					oldText={safeString(tc.args.oldText)}
					newText={safeString(tc.args.newText)}
					output={output}
					isRunning={isRunning}
					isError={isError}
				/>
			);

		case "write":
			return (
				<WriteOutput
					path={safeString(tc.args.path)}
					fileContent={safeString(tc.args.content)}
					output={output}
					isRunning={isRunning}
					isError={isError}
				/>
			);

		default:
			return <DefaultOutput output={output} isRunning={isRunning} isError={isError} />;
	}
});

// ==== DefaultOutput ====

/** Default raw output renderer for tools without specialized rendering. */
export const DefaultOutput = memo(function DefaultOutput({
	output,
	isRunning,
	isError,
}: {
	output: string;
	isRunning: boolean;
	isError: boolean;
}) {
	return (
		<pre
			className={cn(
				"overflow-x-auto px-3 py-2 text-xs leading-relaxed",
				isError ? "text-status-error-text" : "text-text-secondary",
				!output && !isRunning && "italic text-text-muted",
			)}
		>
			{output || (isRunning ? "" : "(no output)")}
			{isRunning && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent-text" />}
		</pre>
	);
});

// ==== BashOutput ====

interface BashOutputProps {
	/** The command that was executed. */
	command: string;
	/** Tool execution output (stdout/stderr combined). */
	output: string;
	/** Whether the tool is still running. */
	isRunning: boolean;
	/** Whether the result was an error. */
	isError: boolean;
}

/**
 * BashOutput — terminal-style renderer for `bash` tool output.
 *
 * Renders output in a terminal-styled container with:
 * - Dark terminal background with monospace font
 * - Command display at top (from tool args)
 * - Stdout/stderr output below
 * - Streaming cursor while running
 */
export const BashOutput = memo(function BashOutput({
	command,
	output,
	isRunning,
	isError,
}: BashOutputProps) {
	return (
		<div className="overflow-hidden rounded-md border border-border-secondary bg-code-bg font-mono">
			{/* Terminal header bar with command */}
			<div className="flex items-center gap-2 border-b border-border-muted bg-surface-primary px-3 py-1.5">
				{/* Terminal dots */}
				<div className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-surface-tertiary" />
					<span className="inline-block h-2 w-2 rounded-full bg-surface-tertiary" />
					<span className="inline-block h-2 w-2 rounded-full bg-surface-tertiary" />
				</div>
				<span className="text-[10px] text-text-tertiary">Terminal</span>
			</div>

			{/* Command line */}
			<div className="border-b border-border-muted px-3 py-1.5">
				<span className="text-xs text-status-success">$</span>
				<span className="ml-2 text-xs text-text-secondary">{command}</span>
			</div>

			{/* Output area */}
			<div className="relative">
				<pre
					className={cn(
						"overflow-x-auto px-3 py-2 text-xs leading-relaxed",
						isError ? "text-status-error-text" : "text-text-secondary",
						!output && !isRunning && "italic text-text-muted",
					)}
				>
					{output || (isRunning ? "" : "(no output)")}
					{isRunning && (
						<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-status-success/70" />
					)}
				</pre>
			</div>
		</div>
	);
});

// ==== ReadOutput ====

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

/**
 * ReadOutput — syntax-highlighted file content for `read` tool output.
 *
 * Renders output with:
 * - File path in header with file icon
 * - Syntax highlighting based on file extension (via Shiki)
 * - Line numbers (optional, offset-aware if `offset` arg was provided)
 * - Copy button in header
 */
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
			<div className="overflow-hidden rounded-md border border-status-error-border">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<pre className="px-3 py-2 text-xs text-status-error-text">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-border-secondary">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<div className="px-3 py-2 text-xs text-text-tertiary">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-accent-text/70" />
				</div>
			</div>
		);
	}

	if (!output) {
		return (
			<div className="overflow-hidden rounded-md border border-border-secondary">
				<FileHeader filename={filename} path={path} rangeInfo={rangeInfo} />
				<pre className="px-3 py-2 text-xs italic text-text-muted">(empty file)</pre>
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

/** File path header with icon and optional range info (used by ReadOutput). */
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
				className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
				aria-label="File"
				role="img"
			>
				<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm5 1.5v2A1.5 1.5 0 0 0 10.5 7h2L9 3.5Z" />
			</svg>
			<span className={cn("min-w-0 truncate text-xs", "text-accent-text")} title={path}>
				{filename}
			</span>
			{rangeInfo && <span className="shrink-0 text-[10px] text-text-muted">{rangeInfo}</span>}
		</div>
	);
});

// ==== EditOutput ====

/** Maximum diff lines before collapsing. */
const EDIT_COLLAPSE_THRESHOLD = 20;

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

/**
 * EditOutput — diff view for `edit` tool output.
 *
 * Renders a unified-style diff showing:
 * - File path in header
 * - Removed lines (old text) in red
 * - Added lines (new text) in green
 * - Collapsible to save space for large diffs
 */
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
			<div className="overflow-hidden rounded-md border border-status-error-border">
				<DiffHeader filename={filename} path={path} />
				<pre className="px-3 py-2 text-xs text-status-error-text">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-border-secondary">
				<DiffHeader filename={filename} path={path} />
				<div className="px-3 py-2 text-xs text-text-tertiary">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-accent-text/70" />
				</div>
			</div>
		);
	}

	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const totalDiffLines = oldLines.length + newLines.length;
	const isLong = totalDiffLines > EDIT_COLLAPSE_THRESHOLD;
	const showAll = !isLong || expanded;

	return (
		<div className="overflow-hidden rounded-md border border-border-secondary bg-surface-primary">
			<DiffHeader filename={filename} path={path} />

			{/* Diff content */}
			<div className="overflow-x-auto font-mono text-xs leading-relaxed">
				{/* Removed lines (old text) */}
				{(showAll ? oldLines : oldLines.slice(0, Math.floor(EDIT_COLLAPSE_THRESHOLD / 2))).map(
					(line, i) => (
						<div
							key={`old-${i.toString()}`}
							className="flex border-b border-status-error/5 bg-status-error-bg/60"
						>
							<span className="w-8 shrink-0 select-none px-2 text-right text-status-error/40">
								−
							</span>
							<pre className="min-w-0 flex-1 px-2 py-px text-status-error-text/80">{line}</pre>
						</div>
					),
				)}

				{/* Separator between old and new */}
				{oldLines.length > 0 && newLines.length > 0 && showAll && (
					<div className="border-b border-border-muted bg-surface-secondary/20 px-3 py-0.5 text-center text-[10px] text-text-muted">
						···
					</div>
				)}

				{/* Added lines (new text) */}
				{(showAll ? newLines : newLines.slice(0, Math.floor(EDIT_COLLAPSE_THRESHOLD / 2))).map(
					(line, i) => (
						<div
							key={`new-${i.toString()}`}
							className="flex border-b border-status-success/5 bg-status-success-bg/60"
						>
							<span className="w-8 shrink-0 select-none px-2 text-right text-status-success/40">
								+
							</span>
							<pre className="min-w-0 flex-1 px-2 py-px text-status-success-text/80">{line}</pre>
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
						"w-full border-t border-border-secondary px-3 py-1.5",
						"text-xs text-text-tertiary transition-colors hover:text-text-secondary",
					)}
				>
					{expanded ? "Show less" : `Show all ${totalDiffLines} lines`}
				</button>
			)}

			{/* Confirmation message from Pi */}
			{output && (
				<div className="border-t border-border-muted px-3 py-1.5">
					<p className="text-xs text-text-tertiary">{output}</p>
				</div>
			)}
		</div>
	);
});

/** Header with file icon and path (used by EditOutput). */
const DiffHeader = memo(function DiffHeader({
	filename,
	path,
}: {
	filename: string;
	path: string;
}) {
	return (
		<div className="flex items-center gap-2 border-b border-border-secondary bg-surface-primary/50 px-3 py-1.5">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0 text-status-warning/70"
				aria-label="Edit"
				role="img"
			>
				<path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61ZM11.189 4 3.75 11.44l-.528 1.848 1.848-.528L12.51 5.31 11.189 4Z" />
			</svg>
			<span className="min-w-0 truncate text-xs text-status-warning-text" title={path}>
				{filename}
			</span>
			<span className="shrink-0 text-[10px] text-text-muted">edited</span>
		</div>
	);
});

// ==== WriteOutput ====

/** Maximum content lines before collapsing in preview. */
const WRITE_PREVIEW_COLLAPSE_THRESHOLD = 30;

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

/**
 * WriteOutput — file preview for `write` tool output.
 *
 * Renders a preview of the written file with:
 * - File path in header with a "created"/"written" badge
 * - Syntax-highlighted content preview (from tool args)
 * - Collapsible for large files
 * - Error state for failed writes
 */
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
			<div className="overflow-hidden rounded-md border border-status-error-border">
				<WriteHeader filename={filename} path={path} />
				<pre className="px-3 py-2 text-xs text-status-error-text">{output}</pre>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className="overflow-hidden rounded-md border border-border-secondary">
				<WriteHeader filename={filename} path={path} />
				<div className="px-3 py-2 text-xs text-text-tertiary">
					<span className="inline-block h-3 w-1.5 animate-pulse bg-accent-text/70" />
				</div>
			</div>
		);
	}

	const contentLines = fileContent.split("\n");
	const isLong = contentLines.length > WRITE_PREVIEW_COLLAPSE_THRESHOLD;
	const displayContent =
		!previewExpanded && isLong
			? contentLines.slice(0, WRITE_PREVIEW_COLLAPSE_THRESHOLD).join("\n")
			: fileContent;

	return (
		<div className="overflow-hidden rounded-md border border-border-secondary">
			<WriteHeader filename={filename} path={path} />

			{/* File content preview */}
			{fileContent ? (
				<div className="relative">
					<CodeBlock code={displayContent} language={language} />

					{/* Fade gradient when collapsed */}
					{isLong && !previewExpanded && (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-primary to-transparent" />
					)}
				</div>
			) : (
				<pre className="px-3 py-2 text-xs italic text-text-muted">(empty file)</pre>
			)}

			{/* Expand/collapse for long files */}
			{isLong && (
				<button
					type="button"
					onClick={togglePreview}
					className={cn(
						"w-full border-t border-border-secondary px-3 py-1.5",
						"text-xs text-text-tertiary transition-colors hover:text-text-secondary",
					)}
				>
					{previewExpanded ? "Show less" : `Show all ${contentLines.length} lines`}
				</button>
			)}

			{/* Confirmation message */}
			{output && (
				<div className="border-t border-border-muted px-3 py-1.5">
					<p className="text-xs text-text-tertiary">{output}</p>
				</div>
			)}
		</div>
	);
});

/** Header with file icon and "written" badge (used by WriteOutput). */
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
				className="h-3.5 w-3.5 shrink-0 text-status-success/70"
				aria-label="Write file"
				role="img"
			>
				<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm5 1.5v2A1.5 1.5 0 0 0 10.5 7h2L9 3.5Z" />
			</svg>
			<span className="min-w-0 truncate text-xs text-status-success-text" title={path}>
				{filename}
			</span>
			<span className="shrink-0 text-[10px] text-text-muted">written</span>
		</div>
	);
});

// ==== Helpers ====

/** Safely extract a string from unknown args value. */
function safeString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Safely extract a number from unknown args value, or null. */
function safeNumber(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}
