/**
 * AssistantMessage — renders an assistant response in the chat.
 *
 * Features:
 * - Streaming cursor (blinking block) while message is actively streaming
 * - Thinking section: auto-expands while thinking is streaming, collapsible toggle,
 *   character count indicator, visual distinction with indigo tint
 * - Content displayed as pre-wrapped text (markdown rendering in 1D.4)
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface AssistantMessageProps {
	message: ChatMessage;
}

export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
	const [thinkingExpanded, setThinkingExpanded] = useState(false);
	/** Whether the user has explicitly toggled thinking (overrides auto-expand). */
	const userToggledRef = useRef(false);
	const hasThinking = message.thinking.length > 0;
	const hasContent = message.content.length > 0;
	const isThinkingActive = message.streaming && hasThinking && !hasContent;

	// Auto-expand thinking while actively thinking (no content yet).
	// Auto-collapse once content starts arriving, unless user explicitly toggled.
	useEffect(() => {
		if (userToggledRef.current) return;
		if (isThinkingActive) {
			setThinkingExpanded(true);
		} else if (hasContent && hasThinking) {
			setThinkingExpanded(false);
		}
	}, [isThinkingActive, hasContent, hasThinking]);

	const toggleThinking = useCallback(() => {
		userToggledRef.current = true;
		setThinkingExpanded((prev) => !prev);
	}, []);

	/** Format character count for display. */
	const thinkingCharCount = message.thinking.length;
	const charLabel =
		thinkingCharCount >= 1000
			? `${(thinkingCharCount / 1000).toFixed(1)}k chars`
			: `${thinkingCharCount} chars`;

	return (
		<div className="max-w-[85%]">
			{/* Thinking section */}
			{hasThinking && (
				<div className="mb-2">
					<button
						type="button"
						onClick={toggleThinking}
						className={cn(
							"flex items-center gap-1.5 text-xs",
							isThinkingActive
								? "text-indigo-400"
								: "text-neutral-500 transition-colors hover:text-neutral-300",
						)}
					>
						{/* Brain icon */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							className={cn("h-3.5 w-3.5", isThinkingActive && "animate-pulse")}
							aria-label="Thinking"
							role="img"
						>
							<path d="M10 2a6 6 0 0 0-5.98 5.55A4 4 0 0 0 5 15.46V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1.54A4 4 0 0 0 15.98 7.55 6 6 0 0 0 10 2ZM8 17v-1h4v1H8Zm1-4v-2.5L7.5 9l1-1L10 9.5 11.5 8l1 1L11 10.5V13H9Z" />
						</svg>
						{/* Chevron */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className={cn(
								"h-3 w-3 transition-transform duration-150",
								thinkingExpanded && "rotate-90",
							)}
							aria-label="Toggle thinking"
							role="img"
						>
							<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z" />
						</svg>
						<span>
							Thinking
							{isThinkingActive && <span className="ml-0.5 animate-pulse">…</span>}
						</span>
						{/* Character count (shown when collapsed and not actively thinking) */}
						{!thinkingExpanded && !isThinkingActive && (
							<span className="text-neutral-600">({charLabel})</span>
						)}
					</button>

					{thinkingExpanded && (
						<div
							className={cn(
								"mt-1.5 rounded-lg border px-3 py-2",
								"max-h-80 overflow-y-auto",
								isThinkingActive
									? "border-indigo-500/30 bg-indigo-950/20"
									: "border-neutral-800 bg-neutral-900/50",
							)}
						>
							<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-400">
								{message.thinking}
								{isThinkingActive && (
									<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-indigo-400" />
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
