/**
 * ToolExecutionCard — unified card combining a tool call and its result.
 *
 * Renders as a single visual unit:
 * - Header: tool icon + name + args summary + status badge
 * - Body (expandable): full args details + execution output
 *
 * States:
 * - Running: result is null or result.streaming === true → blue border, spinner
 * - Success: result finalized, no error → green check
 * - Error: result finalized, isError === true → red border, error icon
 */

import { ToolOutput } from "@/components/chat/tools/ToolOutput";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useState } from "react";

/** Icons for common Pi tools. */
const TOOL_ICONS: Record<string, string> = {
	bash: "⌘",
	read: "📄",
	edit: "✏️",
	write: "📝",
	glob: "🔍",
	grep: "🔎",
};

/** Maximum output lines to show before collapsing. */
const OUTPUT_COLLAPSE_THRESHOLD = 12;

interface ToolExecutionCardProps {
	toolCall: ChatMessage;
	toolResult: ChatMessage | null;
}

type ToolStatus = "running" | "success" | "error";

function getToolStatus(toolResult: ChatMessage | null): ToolStatus {
	if (!toolResult || toolResult.streaming) return "running";
	if (toolResult.toolResult?.isError) return "error";
	return "success";
}

/** Tool names that have specialized output renderers. */
const SPECIALIZED_TOOLS = new Set(["bash", "read", "edit", "write"]);

export const ToolExecutionCard = memo(function ToolExecutionCard({
	toolCall,
	toolResult,
}: ToolExecutionCardProps) {
	const [expanded, setExpanded] = useState(false);
	const tc = toolCall.toolCall;

	const toggleExpanded = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	if (!tc) return null;

	const icon = TOOL_ICONS[tc.name] ?? "🔧";
	const hasArgs = Object.keys(tc.args).length > 0;
	const status = getToolStatus(toolResult);
	const isSpecialized = SPECIALIZED_TOOLS.has(tc.name);
	const resultContent = toolResult?.toolResult?.content ?? "";
	const hasOutput = resultContent.length > 0;
	const outputLines = resultContent.split("\n");

	return (
		<div
			className={cn(
				"max-w-[85%] overflow-hidden rounded-lg border",
				status === "running" && "border-accent-primary/30",
				status === "success" && "border-border-secondary",
				status === "error" && "border-status-error-border",
			)}
		>
			{/* Header — always visible */}
			<button
				type="button"
				onClick={toggleExpanded}
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left",
					"text-xs transition-colors hover:bg-surface-secondary/50",
				)}
			>
				<span className="shrink-0">{icon}</span>
				<span className="font-medium text-accent-text">{tc.name}</span>
				{hasArgs && (
					<span className="min-w-0 truncate text-text-tertiary">{summarizeArgs(tc)}</span>
				)}

				{/* Status badge — right side */}
				<span className="ml-auto flex shrink-0 items-center gap-1.5">
					<StatusBadge status={status} />
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className={cn(
							"h-3 w-3 text-text-muted transition-transform duration-150",
							expanded && "rotate-90",
						)}
						aria-label="Toggle details"
						role="img"
					>
						<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z" />
					</svg>
				</span>
			</button>

			{/* Expanded body */}
			{expanded && (
				<div className="border-t border-border-secondary">
					{isSpecialized ? (
						/* Specialized tool output — handles its own layout */
						<div className="p-2">
							<ToolOutput toolCall={toolCall} toolResult={toolResult} />
						</div>
					) : (
						/* Default: raw args + raw output */
						<DefaultExpandedBody
							tc={tc}
							hasArgs={hasArgs}
							resultContent={resultContent}
							hasOutput={hasOutput}
							status={status}
						/>
					)}
				</div>
			)}

			{/* Inline output preview when collapsed (one-line summary) */}
			{!expanded && hasOutput && status !== "running" && (
				<div className="border-t border-border-muted px-3 py-1.5">
					<p
						className={cn(
							"truncate text-xs",
							status === "error" ? "text-status-error-text/70" : "text-text-tertiary",
						)}
					>
						{outputLines[0]}
						{outputLines.length > 1 && ` (+${outputLines.length - 1} lines)`}
					</p>
				</div>
			)}

			{/* Inline running indicator when collapsed */}
			{!expanded && status === "running" && (
				<div className="border-t border-border-muted px-3 py-1.5">
					<span className="flex items-center gap-1.5 text-xs text-accent-text/70">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
						Running…
					</span>
				</div>
			)}
		</div>
	);
});

/** Default expanded body for non-specialized tools (raw args + output). */
const DefaultExpandedBody = memo(function DefaultExpandedBody({
	tc,
	hasArgs,
	resultContent,
	hasOutput,
	status,
}: {
	tc: { args: Record<string, unknown> };
	hasArgs: boolean;
	resultContent: string;
	hasOutput: boolean;
	status: ToolStatus;
}) {
	const [outputExpanded, setOutputExpanded] = useState(false);

	const toggleOutputExpanded = useCallback(() => {
		setOutputExpanded((prev) => !prev);
	}, []);

	const outputLines = resultContent.split("\n");
	const isLongOutput = outputLines.length > OUTPUT_COLLAPSE_THRESHOLD;
	const displayOutput =
		!outputExpanded && isLongOutput
			? outputLines.slice(0, OUTPUT_COLLAPSE_THRESHOLD).join("\n")
			: resultContent;

	return (
		<>
			{/* Args section */}
			{hasArgs && (
				<div className="border-b border-border-muted bg-surface-primary/30 px-3 py-2">
					<pre className="overflow-x-auto text-xs text-text-tertiary">
						{JSON.stringify(tc.args, null, 2)}
					</pre>
				</div>
			)}

			{/* Output section */}
			<div className="relative">
				<pre
					className={cn(
						"overflow-x-auto px-3 py-2 text-xs leading-relaxed",
						status === "error" ? "text-status-error-text" : "text-text-secondary",
						!hasOutput && "italic text-text-muted",
					)}
				>
					{displayOutput || (status === "running" ? "Running…" : "(no output)")}
					{status === "running" && hasOutput && (
						<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent-text" />
					)}
				</pre>

				{/* Fade gradient when collapsed */}
				{isLongOutput && !outputExpanded && (
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-primary to-transparent" />
				)}
			</div>

			{/* Expand/collapse toggle for long output */}
			{isLongOutput && (
				<button
					type="button"
					onClick={toggleOutputExpanded}
					className={cn(
						"w-full border-t border-border-secondary px-3 py-1.5",
						"text-xs text-text-tertiary transition-colors hover:text-text-secondary",
					)}
				>
					{outputExpanded ? "Show less" : `Show all ${outputLines.length} lines`}
				</button>
			)}
		</>
	);
});

/** Status badge component showing running/success/error state. */
const StatusBadge = memo(function StatusBadge({ status }: { status: ToolStatus }) {
	switch (status) {
		case "running":
			return (
				<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
			);
		case "success":
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3 text-status-success"
					aria-label="Success"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
						clipRule="evenodd"
					/>
				</svg>
			);
		case "error":
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3 text-status-error"
					aria-label="Error"
					role="img"
				>
					<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
				</svg>
			);
	}
});

/** Produce a one-line summary of tool arguments for the header. */
function summarizeArgs(tc: { name: string; args: Record<string, unknown> }): string {
	const entries = Object.entries(tc.args);
	if (entries.length === 0) return "";

	// Tool-specific summaries for common Pi tools
	switch (tc.name) {
		case "bash": {
			const cmd = tc.args.command;
			if (typeof cmd === "string") {
				return cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
			}
			break;
		}
		case "read": {
			const path = tc.args.path;
			if (typeof path === "string") return path;
			break;
		}
		case "edit": {
			const path = tc.args.path;
			if (typeof path === "string") return path;
			break;
		}
		case "write": {
			const path = tc.args.path;
			if (typeof path === "string") return path;
			break;
		}
		case "glob": {
			const pattern = tc.args.pattern;
			if (typeof pattern === "string") return pattern;
			break;
		}
		case "grep": {
			const pattern = tc.args.pattern;
			if (typeof pattern === "string") return pattern;
			break;
		}
	}

	// Generic fallback: show first argument value
	const first = entries[0];
	if (!first) return "";
	const [key, value] = first;
	if (typeof value === "string") {
		const display = value.length > 60 ? `${value.slice(0, 57)}…` : value;
		return entries.length === 1 ? display : `${key}: ${display}`;
	}

	return `${entries.length} arg${entries.length === 1 ? "" : "s"}`;
}
