/**
 * BashOutput — terminal-style renderer for `bash` tool output.
 *
 * Renders output in a terminal-styled container with:
 * - Dark terminal background with monospace font
 * - Command display at top (from tool args)
 * - Stdout/stderr output below
 * - Streaming cursor while running
 */

import { cn } from "@/lib/cn";
import { memo } from "react";

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
