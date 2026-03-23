/**
 * AssistantMessage — renders an assistant response in the chat.
 *
 * Features:
 * - Streaming cursor (blinking block) while message is actively streaming
 * - Thinking section (collapsible, shown when thinking content exists)
 * - Content displayed as pre-wrapped text (markdown rendering in Phase 1D)
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useState } from "react";

interface AssistantMessageProps {
	message: ChatMessage;
}

export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
	const [thinkingExpanded, setThinkingExpanded] = useState(false);
	const hasThinking = message.thinking.length > 0;
	const hasContent = message.content.length > 0;

	const toggleThinking = useCallback(() => {
		setThinkingExpanded((prev) => !prev);
	}, []);

	return (
		<div className="max-w-[85%]">
			{/* Thinking section */}
			{hasThinking && (
				<div className="mb-2">
					<button
						type="button"
						onClick={toggleThinking}
						className={cn(
							"flex items-center gap-1.5 text-xs text-neutral-500",
							"transition-colors hover:text-neutral-300",
						)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className={cn("h-3 w-3 transition-transform", thinkingExpanded && "rotate-90")}
							aria-label="Toggle thinking"
							role="img"
						>
							<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z" />
						</svg>
						<span>
							Thinking
							{message.streaming && !hasContent && <span className="ml-1 animate-pulse">…</span>}
						</span>
					</button>
					{thinkingExpanded && (
						<div
							className={cn(
								"mt-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2",
								"max-h-60 overflow-y-auto",
							)}
						>
							<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-400">
								{message.thinking}
								{message.streaming && !hasContent && (
									<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-neutral-500" />
								)}
							</p>
						</div>
					)}
				</div>
			)}

			{/* Main content */}
			{(hasContent || (!hasThinking && message.streaming)) && (
				<div className="text-sm text-neutral-100">
					<p className="whitespace-pre-wrap break-words leading-relaxed">
						{message.content}
						{message.streaming && (
							<span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-neutral-400" />
						)}
					</p>
				</div>
			)}

			{/* Empty streaming state — no content and no thinking yet */}
			{!hasContent && !hasThinking && message.streaming && (
				<div className="text-sm text-neutral-500">
					<span className="inline-block h-4 w-1.5 animate-pulse bg-neutral-500" />
				</div>
			)}
		</div>
	);
});
