/**
 * ToolCallMessage — renders a tool call card in the chat.
 *
 * Shows the tool name and arguments. Basic rendering for Phase 1C —
 * more sophisticated tool-specific rendering comes in Phase 1D.
 */

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

interface ToolCallMessageProps {
	message: ChatMessage;
}

export const ToolCallMessage = memo(function ToolCallMessage({ message }: ToolCallMessageProps) {
	const [expanded, setExpanded] = useState(false);
	const toolCall = message.toolCall;

	const toggleExpanded = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	if (!toolCall) return null;

	const icon = TOOL_ICONS[toolCall.name] ?? "🔧";
	const hasArgs = Object.keys(toolCall.args).length > 0;

	return (
		<div
			className={cn(
				"max-w-[85%] rounded-lg border border-neutral-800",
				"overflow-hidden transition-colors",
			)}
		>
			{/* Header — always visible */}
			<button
				type="button"
				onClick={toggleExpanded}
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left",
					"text-xs transition-colors hover:bg-neutral-800/50",
				)}
			>
				<span className="shrink-0">{icon}</span>
				<span className="font-medium text-blue-400">{toolCall.name}</span>
				{hasArgs && (
					<span className="truncate text-neutral-500">{summarizeArgs(toolCall.args)}</span>
				)}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn(
						"ml-auto h-3 w-3 shrink-0 text-neutral-600 transition-transform",
						expanded && "rotate-90",
					)}
					aria-label="Toggle details"
					role="img"
				>
					<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z" />
				</svg>
			</button>

			{/* Args — expanded view */}
			{expanded && hasArgs && (
				<div className="border-t border-neutral-800 bg-neutral-900/50 px-3 py-2">
					<pre className="overflow-x-auto text-xs text-neutral-400">
						{JSON.stringify(toolCall.args, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
});

/** Produce a one-line summary of tool arguments for the collapsed view. */
function summarizeArgs(args: Record<string, unknown>): string {
	const entries = Object.entries(args);
	if (entries.length === 0) return "";

	// For common tools, show the most relevant argument
	const first = entries[0];
	if (!first) return "";

	const [key, value] = first;
	if (typeof value === "string") {
		// Truncate long strings
		const display = value.length > 60 ? `${value.slice(0, 57)}…` : value;
		return entries.length === 1 ? display : `${key}: ${display}`;
	}

	return `${entries.length} arg${entries.length === 1 ? "" : "s"}`;
}
