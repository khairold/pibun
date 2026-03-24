/**
 * ToolOutput — dispatcher for tool-specific output rendering.
 *
 * Routes to the appropriate specialized renderer based on tool name:
 * - `bash` → BashOutput (terminal style)
 * - `read` → ReadOutput (syntax-highlighted file with path)
 * - `edit` → EditOutput (diff view with old/new text)
 * - `write` → WriteOutput (file preview with syntax highlighting)
 * - All others → DefaultOutput (raw preformatted text)
 *
 * The dispatcher extracts relevant args from the tool call and passes
 * them to the specialized renderer.
 */

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/store/types";
import { memo } from "react";
import { BashOutput } from "./BashOutput";
import { EditOutput } from "./EditOutput";
import { ReadOutput } from "./ReadOutput";
import { WriteOutput } from "./WriteOutput";

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

/** Default raw output renderer for tools without specialized rendering. */
const DefaultOutput = memo(function DefaultOutput({
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

/** Safely extract a string from unknown args value. */
function safeString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Safely extract a number from unknown args value, or null. */
function safeNumber(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}
