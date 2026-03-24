/**
 * WorkGroup — collapsible group of tool executions within a single turn.
 *
 * Groups consecutive tool_call + tool_result pairs into one visual unit
 * with a summary header showing:
 * - Total tool count and overall status (running/success/error)
 * - Collapse/expand toggle (collapsed by default when ≥2 tools and all done)
 * - When collapsed: compact list of tool names + one-line summaries
 * - When expanded: full ToolExecutionCard for each tool
 *
 * Design follows T3Code's work group pattern but adapted for PiBun's
 * simpler architecture and Tailwind styling.
 */

import type { ToolGroupEntry } from "@/components/ChatView";
import { ToolExecutionCard } from "@/components/chat/ToolCards";
import { cn } from "@/lib/utils";
import { memo, useCallback, useState } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Maximum entries visible when collapsed. */
const MAX_VISIBLE_COLLAPSED = 6;

/** Tool icons — mirrors ToolCards.tsx for consistency. */
const TOOL_ICONS: Record<string, string> = {
	bash: "⌘",
	read: "📄",
	edit: "✏️",
	write: "📝",
	glob: "🔍",
	grep: "🔎",
};

// ============================================================================
// Helpers
// ============================================================================

type GroupStatus = "running" | "success" | "error";

/** Derive the overall status of a work group from its entries. */
function getGroupStatus(entries: readonly ToolGroupEntry[]): GroupStatus {
	let hasRunning = false;
	let hasError = false;
	for (const entry of entries) {
		if (!entry.toolResult || entry.toolResult.streaming) {
			hasRunning = true;
		} else if (entry.toolResult.toolResult?.isError) {
			hasError = true;
		}
	}
	if (hasRunning) return "running";
	if (hasError) return "error";
	return "success";
}

/** One-line summary of a tool entry for the collapsed view. */
function summarizeEntry(entry: ToolGroupEntry): string {
	const tc = entry.toolCall.toolCall;
	if (!tc) return "";
	switch (tc.name) {
		case "bash": {
			const cmd = tc.args.command;
			if (typeof cmd === "string") return cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd;
			break;
		}
		case "read":
		case "edit":
		case "write": {
			const path = tc.args.path;
			if (typeof path === "string") return path;
			break;
		}
		case "glob":
		case "grep": {
			const pattern = tc.args.pattern;
			if (typeof pattern === "string") return pattern;
			break;
		}
	}
	const entries = Object.entries(tc.args);
	if (entries.length === 0) return "";
	const first = entries[0];
	if (!first) return "";
	const [, value] = first;
	if (typeof value === "string") {
		return value.length > 80 ? `${value.slice(0, 77)}…` : value;
	}
	return "";
}

/** Get entry-level status for status dot coloring. */
function getEntryStatus(entry: ToolGroupEntry): GroupStatus {
	if (!entry.toolResult || entry.toolResult.streaming) return "running";
	if (entry.toolResult.toolResult?.isError) return "error";
	return "success";
}

// ============================================================================
// WorkGroup
// ============================================================================

interface WorkGroupProps {
	entries: ToolGroupEntry[];
}

/**
 * Collapsible work group showing all tool executions in a consecutive run.
 *
 * - Auto-expands when any tool is still running
 * - Defaults to collapsed when all tools are complete and there are ≥2
 * - Single-tool groups start expanded (no benefit to collapsing one item)
 */
export const WorkGroup = memo(function WorkGroup({ entries }: WorkGroupProps) {
	const status = getGroupStatus(entries);
	const isSingleEntry = entries.length === 1;

	// Auto-expand: single entries always expanded, running groups always expanded
	// Multi-entry completed groups start collapsed
	const [userToggled, setUserToggled] = useState(false);
	const [userExpanded, setUserExpanded] = useState(false);

	const isExpanded = userToggled ? userExpanded : isSingleEntry || status === "running";

	const toggleExpanded = useCallback(() => {
		setUserToggled(true);
		setUserExpanded((prev) => !prev);
	}, []);

	// Single entry — render the ToolExecutionCard directly, no wrapper
	if (isSingleEntry) {
		const entry = entries[0];
		if (!entry) return null;
		return <ToolExecutionCard toolCall={entry.toolCall} toolResult={entry.toolResult} />;
	}

	return (
		<div
			className={cn(
				"max-w-[85%] overflow-hidden rounded-lg border",
				status === "running" && "border-accent-primary/30",
				status === "success" && "border-border-secondary",
				status === "error" && "border-status-error-border/50",
			)}
		>
			{/* Summary header — always visible */}
			<button
				type="button"
				onClick={toggleExpanded}
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left",
					"text-xs transition-colors hover:bg-surface-secondary/50",
				)}
			>
				{/* Wrench icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						status === "running" && "text-accent-text",
						status === "success" && "text-text-muted",
						status === "error" && "text-status-error-text",
					)}
					aria-label="Tool calls"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M11.5 1a3.5 3.5 0 0 0-3.29 4.708L3.5 10.42l-.22.22a.75.75 0 0 0 0 1.06l1.06 1.06a.75.75 0 0 0 1.06 0l.22-.22 4.71-4.71A3.5 3.5 0 1 0 11.5 1ZM10 4.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
						clipRule="evenodd"
					/>
				</svg>

				<span className="font-medium text-text-secondary">
					{entries.length} tool {entries.length === 1 ? "call" : "calls"}
				</span>

				{/* Status indicator */}
				<span className="ml-auto flex shrink-0 items-center gap-1.5">
					{status === "running" && (
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
					)}
					{status === "success" && (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3 w-3 text-status-success"
							aria-label="All succeeded"
							role="img"
						>
							<path
								fillRule="evenodd"
								d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
								clipRule="evenodd"
							/>
						</svg>
					)}
					{status === "error" && (
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
					)}
					{/* Chevron */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className={cn(
							"h-3 w-3 text-text-muted transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
						aria-label="Toggle details"
						role="img"
					>
						<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z" />
					</svg>
				</span>
			</button>

			{/* Expanded: full ToolExecutionCard for each entry */}
			{isExpanded && (
				<div className="border-t border-border-secondary">
					<div className="space-y-2 p-2">
						{entries.map((entry) => (
							<ToolExecutionCard
								key={`wg-tool-${entry.toolCall.id}`}
								toolCall={entry.toolCall}
								toolResult={entry.toolResult}
							/>
						))}
					</div>
				</div>
			)}

			{/* Collapsed: compact summary of each tool */}
			{!isExpanded && (
				<div className="border-t border-border-muted">
					<CollapsedToolList entries={entries} />
				</div>
			)}
		</div>
	);
});

// ============================================================================
// CollapsedToolList — compact summary rows when work group is collapsed
// ============================================================================

interface CollapsedToolListProps {
	entries: ToolGroupEntry[];
}

const CollapsedToolList = memo(function CollapsedToolList({ entries }: CollapsedToolListProps) {
	const hasOverflow = entries.length > MAX_VISIBLE_COLLAPSED;
	const visibleEntries = hasOverflow ? entries.slice(0, MAX_VISIBLE_COLLAPSED) : entries;
	const hiddenCount = entries.length - visibleEntries.length;

	return (
		<div className="py-1">
			{visibleEntries.map((entry) => (
				<CollapsedToolRow key={`collapsed-${entry.toolCall.id}`} entry={entry} />
			))}
			{hiddenCount > 0 && (
				<div className="px-3 py-0.5 text-[10px] text-text-muted/60">
					+{hiddenCount} more tool {hiddenCount === 1 ? "call" : "calls"}
				</div>
			)}
		</div>
	);
});

// ============================================================================
// CollapsedToolRow — single compact row for a tool call
// ============================================================================

interface CollapsedToolRowProps {
	entry: ToolGroupEntry;
}

const CollapsedToolRow = memo(function CollapsedToolRow({ entry }: CollapsedToolRowProps) {
	const tc = entry.toolCall.toolCall;
	if (!tc) return null;

	const icon = TOOL_ICONS[tc.name] ?? "🔧";
	const summary = summarizeEntry(entry);
	const entryStatus = getEntryStatus(entry);

	return (
		<div className="flex items-center gap-2 px-3 py-0.5">
			{/* Status dot */}
			<span
				className={cn(
					"inline-block h-1.5 w-1.5 shrink-0 rounded-full",
					entryStatus === "running" && "animate-pulse bg-accent-text",
					entryStatus === "success" && "bg-status-success",
					entryStatus === "error" && "bg-status-error",
				)}
			/>
			<span className="shrink-0 text-[11px]">{icon}</span>
			<span className="text-[11px] font-medium text-accent-text/80">{tc.name}</span>
			{summary && (
				<span className="min-w-0 truncate text-[11px] text-text-tertiary">{summary}</span>
			)}
		</div>
	);
});
