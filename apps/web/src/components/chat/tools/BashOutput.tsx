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
		<div className="overflow-hidden rounded-md border border-neutral-800 bg-[#0d1117] font-mono">
			{/* Terminal header bar with command */}
			<div className="flex items-center gap-2 border-b border-neutral-800/60 bg-[#161b22] px-3 py-1.5">
				{/* Terminal dots */}
				<div className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-neutral-700" />
					<span className="inline-block h-2 w-2 rounded-full bg-neutral-700" />
					<span className="inline-block h-2 w-2 rounded-full bg-neutral-700" />
				</div>
				<span className="text-[10px] text-neutral-500">Terminal</span>
			</div>

			{/* Command line */}
			<div className="border-b border-neutral-800/40 px-3 py-1.5">
				<span className="text-xs text-green-500">$</span>
				<span className="ml-2 text-xs text-neutral-300">{command}</span>
			</div>

			{/* Output area */}
			<div className="relative">
				<pre
					className={cn(
						"overflow-x-auto px-3 py-2 text-xs leading-relaxed",
						isError ? "text-red-300" : "text-neutral-400",
						!output && !isRunning && "italic text-neutral-600",
					)}
				>
					{output || (isRunning ? "" : "(no output)")}
					{isRunning && (
						<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-green-500/70" />
					)}
				</pre>
			</div>
		</div>
	);
});
