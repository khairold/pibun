/**
 * ToolResultMessage — renders tool execution output in the chat.
 *
 * Shows the raw text output from a tool execution. Content is
 * accumulated (not delta) — each update replaces the previous content.
 *
 * Basic rendering for Phase 1C — tool-specific rendering (syntax highlighting,
 * diff views, terminal-style output) comes in Phase 1D.
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useState } from "react";

/** Maximum lines to show before collapsing. */
const COLLAPSE_THRESHOLD = 8;

interface ToolResultMessageProps {
	message: ChatMessage;
}

export const ToolResultMessage = memo(function ToolResultMessage({
	message,
}: ToolResultMessageProps) {
	const [expanded, setExpanded] = useState(false);
	const result = message.toolResult;

	const toggleExpanded = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	if (!result) return null;

	const content = result.content;
	const lines = content.split("\n");
	const isLong = lines.length > COLLAPSE_THRESHOLD;
	const displayContent =
		!expanded && isLong ? lines.slice(0, COLLAPSE_THRESHOLD).join("\n") : content;

	return (
		<div className="max-w-[85%]">
			<div
				className={cn(
					"rounded-lg border bg-surface-primary/50 overflow-hidden",
					result.isError ? "border-status-error-border" : "border-border-secondary",
				)}
			>
				{/* Output content */}
				<div className="relative">
					<pre
						className={cn(
							"overflow-x-auto px-3 py-2 text-xs leading-relaxed",
							result.isError ? "text-status-error-text" : "text-text-secondary",
							!content && "text-text-muted italic",
						)}
					>
						{displayContent || (message.streaming ? "Running…" : "(no output)")}
						{message.streaming && (
							<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-text-tertiary" />
						)}
					</pre>

					{/* Fade gradient when collapsed */}
					{isLong && !expanded && (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-primary/50 to-transparent" />
					)}
				</div>

				{/* Expand/collapse toggle */}
				{isLong && (
					<button
						type="button"
						onClick={toggleExpanded}
						className={cn(
							"w-full border-t border-border-secondary px-3 py-1.5",
							"text-xs text-text-tertiary transition-colors hover:text-text-secondary",
						)}
					>
						{expanded ? "Show less" : `Show all ${lines.length} lines`}
					</button>
				)}
			</div>
		</div>
	);
});
