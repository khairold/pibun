/**
 * ChatMessages — renderers for the non-tool message types + turn dividers.
 *
 * - UserMessage — user prompts (right-aligned bubble)
 * - AssistantMessage — streaming text with thinking section + markdown + copy button
 * - SystemMessage — compaction/retry notices (centered dividers)
 * - TurnDivider — visual separator between user→assistant turns with timestamp and tool count
 *
 * These are stable rendering components consumed by ChatView.tsx.
 */

import { MarkdownContent } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ==== UserMessage ====

interface UserMessageProps {
	message: ChatMessage;
}

/** Renders a user prompt as a right-aligned bubble with pre-wrapped text. */
export const UserMessage = memo(function UserMessage({ message }: UserMessageProps) {
	return (
		<div className="flex justify-end">
			<div
				className={cn(
					"max-w-[85%] rounded-2xl bg-user-bubble-bg px-4 py-3",
					"text-sm text-user-bubble-text",
				)}
			>
				<p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
			</div>
		</div>
	);
});

// ==== AssistantMessage ====

interface AssistantMessageProps {
	message: ChatMessage;
}

/**
 * Renders an assistant response with:
 * - Thinking section: auto-expands while thinking is streaming, collapsible toggle,
 *   character count indicator, visual distinction with indigo tint
 * - Streaming cursor (blinking block) while message is actively streaming
 * - Content rendered as markdown with syntax-highlighted code blocks (Shiki)
 */
export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
	const [thinkingExpanded, setThinkingExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	/** Whether the user has explicitly toggled thinking (overrides auto-expand). */
	const userToggledRef = useRef(false);
	const addToast = useStore((s) => s.addToast);
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

	/** Copy assistant message content to clipboard. */
	const handleCopy = useCallback(() => {
		if (!message.content) return;
		navigator.clipboard.writeText(message.content).then(
			() => {
				setCopied(true);
				addToast("Copied to clipboard", "info");
				setTimeout(() => setCopied(false), 2000);
			},
			() => {
				addToast("Failed to copy", "error");
			},
		);
	}, [message.content, addToast]);

	/** Format character count for display. */
	const thinkingCharCount = message.thinking.length;
	const charLabel =
		thinkingCharCount >= 1000
			? `${(thinkingCharCount / 1000).toFixed(1)}k chars`
			: `${thinkingCharCount} chars`;

	return (
		<div className="group/assistant max-w-[85%]">
			{/* Thinking section */}
			{hasThinking && (
				<div className="mb-2">
					<button
						type="button"
						onClick={toggleThinking}
						className={cn(
							"flex items-center gap-1.5 text-xs",
							isThinkingActive
								? "text-thinking-text"
								: "text-text-tertiary transition-colors hover:text-text-secondary",
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
							<span className="text-text-muted">({charLabel})</span>
						)}
					</button>

					{thinkingExpanded && (
						<div
							className={cn(
								"mt-1.5 rounded-lg border px-3 py-2",
								"max-h-80 overflow-y-auto",
								isThinkingActive
									? "border-thinking-border bg-thinking-bg"
									: "border-border-secondary bg-surface-primary/50",
							)}
						>
							<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">
								{message.thinking}
								{isThinkingActive && (
									<span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-thinking-text" />
								)}
							</p>
						</div>
					)}
				</div>
			)}

			{/* Main content — rendered as markdown */}
			{(hasContent || (!hasThinking && message.streaming)) && (
				<div className="text-sm text-text-primary">
					{hasContent && <MarkdownContent content={message.content} />}
					{message.streaming && (
						<span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-text-secondary" />
					)}
				</div>
			)}

			{/* Empty streaming state — no content and no thinking yet */}
			{!hasContent && !hasThinking && message.streaming && (
				<div className="text-sm text-text-tertiary">
					<span className="inline-block h-4 w-1.5 animate-pulse bg-text-tertiary" />
				</div>
			)}

			{/* Copy button — visible on hover, hidden while streaming */}
			{hasContent && !message.streaming && (
				<div className="mt-1 flex opacity-0 transition-opacity group-hover/assistant:opacity-100">
					<button
						type="button"
						onClick={handleCopy}
						className={cn(
							"flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
							copied
								? "text-status-success-text"
								: "text-text-muted hover:bg-surface-secondary hover:text-text-secondary",
						)}
						title="Copy message"
					>
						{copied ? (
							/* Check icon */
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-3.5 w-3.5"
								aria-label="Copied"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
									clipRule="evenodd"
								/>
							</svg>
						) : (
							/* Copy icon */
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-3.5 w-3.5"
								aria-label="Copy"
								role="img"
							>
								<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 10.5v-7Z" />
								<path d="M3 5a1 1 0 0 0-1 1v7.5A1.5 1.5 0 0 0 3.5 15H11a1 1 0 0 0 1-1H3.5a.5.5 0 0 1-.5-.5V5Z" />
							</svg>
						)}
						<span>{copied ? "Copied" : "Copy"}</span>
					</button>
				</div>
			)}
		</div>
	);
});

// ==== SystemMessage ====

interface SystemMessageProps {
	message: ChatMessage;
}

type SystemCategory =
	| "compaction"
	| "retry-progress"
	| "retry-success"
	| "retry-failed"
	| "completion"
	| "default";

/** Detect message category for styling. */
function getCategory(content: string): SystemCategory {
	if (content.startsWith("✓ Worked for")) return "completion";
	if (content.includes("compaction")) return "compaction";
	if (content.startsWith("✅ Retry succeeded")) return "retry-success";
	if (content.startsWith("❌ Retry failed")) return "retry-failed";
	if (content.startsWith("🔄 Retrying")) return "retry-progress";
	return "default";
}

/** Get styling classes for a system message category. */
function getCategoryStyle(category: SystemCategory): {
	textClass: string;
	dividerClass: string;
	iconClass: string;
} {
	switch (category) {
		case "completion":
			return {
				textClass: "text-text-muted",
				dividerClass: "bg-border-secondary",
				iconClass: "",
			};
		case "compaction":
			return {
				textClass: "text-status-warning/70",
				dividerClass: "bg-status-warning/20",
				iconClass: "",
			};
		case "retry-progress":
			return {
				textClass: "text-status-warning-text/80",
				dividerClass: "bg-status-warning/20",
				iconClass: "animate-spin-slow",
			};
		case "retry-success":
			return {
				textClass: "text-status-success-text/70",
				dividerClass: "bg-status-success/20",
				iconClass: "",
			};
		case "retry-failed":
			return {
				textClass: "text-status-error-text/80",
				dividerClass: "bg-status-error/20",
				iconClass: "",
			};
		default:
			return {
				textClass: "text-text-tertiary",
				dividerClass: "bg-surface-secondary",
				iconClass: "",
			};
	}
}

/**
 * Renders system notices (compaction, retry, errors) as subtle centered
 * text with divider-like appearance and category-specific colors.
 */
export const SystemMessage = memo(function SystemMessage({ message }: SystemMessageProps) {
	const category = getCategory(message.content);
	const style = getCategoryStyle(category);

	return (
		<div className="flex items-center gap-3 py-1">
			<div className={cn("h-px flex-1", style.dividerClass)} />
			<span className={cn("shrink-0 text-xs", style.textClass)}>{message.content}</span>
			<div className={cn("h-px flex-1", style.dividerClass)} />
		</div>
	);
});

// ==== TurnDivider ====

interface TurnDividerProps {
	/** Unix timestamp (ms) of the next user message in this turn boundary. */
	timestamp: number;
	/** Number of tool calls in the preceding assistant turn. */
	toolCount: number;
}

/**
 * Format a timestamp into a short locale-aware time string.
 * Uses 12-hour format with AM/PM (e.g., "2:34 PM").
 */
function formatTimestamp(ts: number): string {
	const date = new Date(ts);
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Visual separator between user→assistant turns.
 *
 * Shows a subtle divider line with:
 * - Timestamp of the turn boundary
 * - Tool call count badge from the preceding assistant turn (if any)
 *
 * Designed to be a low-contrast, non-intrusive visual break that helps
 * users orient in long conversations without competing with the
 * completion summary ("✓ Worked for Xm Ys") which appears just above.
 */
export const TurnDivider = memo(function TurnDivider({ timestamp, toolCount }: TurnDividerProps) {
	return (
		<div className="flex items-center gap-2 py-1">
			<div className="h-px flex-1 bg-border-primary/30" />
			<div className="flex shrink-0 items-center gap-1.5">
				{toolCount > 0 && (
					<span className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted">
						{/* Wrench icon */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-2.5 w-2.5"
							aria-label="Tool calls"
							role="img"
						>
							<path
								fillRule="evenodd"
								d="M11.5 1a3.5 3.5 0 0 0-3.29 4.708L3.5 10.42l-.22.22a.75.75 0 0 0 0 1.06l1.06 1.06a.75.75 0 0 0 1.06 0l.22-.22 4.71-4.71A3.5 3.5 0 1 0 11.5 1ZM10 4.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
								clipRule="evenodd"
							/>
						</svg>
						{toolCount} {toolCount === 1 ? "tool call" : "tool calls"}
					</span>
				)}
				<span className="text-[10px] text-text-muted/60">{formatTimestamp(timestamp)}</span>
			</div>
			<div className="h-px flex-1 bg-border-primary/30" />
		</div>
	);
});
