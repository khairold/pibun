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
import { forkFromMessage, getForkableMessages } from "@/lib/sessionActions";
import { cn, formatDuration, formatTimestamp } from "@/lib/utils";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { showNativeContextMenu } from "@/wireTransport";
import type { ContextMenuItem } from "@pibun/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ==== UserMessage ====

interface UserMessageProps {
	message: ChatMessage;
	onContextMenu?: ((e: React.MouseEvent, message: ChatMessage) => void) | undefined;
}

/** Renders a user prompt as a right-aligned bubble with pre-wrapped text. */
export const UserMessage = memo(function UserMessage({ message, onContextMenu }: UserMessageProps) {
	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			if (onContextMenu) {
				e.preventDefault();
				onContextMenu(e, message);
			}
		},
		[onContextMenu, message],
	);

	return (
		<div className="flex justify-end">
			<div
				className={cn(
					"max-w-[85%] rounded-2xl bg-user-bubble-bg px-4 py-3",
					"text-sm text-user-bubble-text",
				)}
				onContextMenu={handleContextMenu}
			>
				<p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
			</div>
		</div>
	);
});

// ==== AssistantMessage ====

interface AssistantMessageProps {
	message: ChatMessage;
	onContextMenu?: ((e: React.MouseEvent, message: ChatMessage) => void) | undefined;
}

/**
 * Renders an assistant response with:
 * - Thinking section: auto-expands while thinking is streaming, collapsible toggle,
 *   character count indicator, visual distinction with indigo tint
 * - Streaming cursor (blinking block) while message is actively streaming
 * - Content rendered as markdown with syntax-highlighted code blocks (Shiki)
 */
export const AssistantMessage = memo(function AssistantMessage({
	message,
	onContextMenu,
}: AssistantMessageProps) {
	const [thinkingExpanded, setThinkingExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	/** Whether the user has explicitly toggled thinking (overrides auto-expand). */
	const userToggledRef = useRef(false);
	const addToast = useStore((s) => s.addToast);
	const hasThinking = message.thinking.length > 0;
	const hasContent = message.content.length > 0;
	const isThinkingActive = message.streaming && hasThinking && !hasContent;

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			if (onContextMenu) {
				e.preventDefault();
				onContextMenu(e, message);
			}
		},
		[onContextMenu, message],
	);

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
		<div className="group/assistant max-w-[85%]" onContextMenu={handleContextMenu}>
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
	| "default";

/** Detect message category for styling. */
function getCategory(content: string): SystemCategory {
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
} {
	switch (category) {
		case "compaction":
			return {
				textClass: "text-status-warning/70",
				dividerClass: "bg-status-warning/20",
			};
		case "retry-progress":
			return {
				textClass: "text-status-warning-text/80",
				dividerClass: "bg-status-warning/20",
			};
		case "retry-success":
			return {
				textClass: "text-status-success-text/70",
				dividerClass: "bg-status-success/20",
			};
		case "retry-failed":
			return {
				textClass: "text-status-error-text/80",
				dividerClass: "bg-status-error/20",
			};
		default:
			return {
				textClass: "text-text-tertiary",
				dividerClass: "bg-surface-secondary",
			};
	}
}

/**
 * Renders system notices (compaction, retry, errors) as subtle centered
 * text with divider-like appearance and category-specific colors.
 *
 * NOTE: Completion summaries ("✓ Worked for Xm Ys") are no longer rendered
 * by SystemMessage — they are promoted to first-class `"completion-summary"`
 * timeline entries and rendered by `CompletionSummary`.
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

// ==== CompletionSummary ====

interface CompletionSummaryProps {
	/** The completion text, e.g. "✓ Worked for 2m 15s". */
	content: string;
}

/**
 * Renders a completion summary divider — the "✓ Worked for Xm Ys" line
 * that appears after an agent turn completes.
 *
 * Previously rendered as a SystemMessage with string-matching, now a
 * first-class timeline entry with dedicated styling: muted text with
 * subtle divider lines.
 */
export const CompletionSummary = memo(function CompletionSummary({
	content,
}: CompletionSummaryProps) {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-border-secondary" />
			<span className="shrink-0 text-xs text-text-muted">{content}</span>
			<div className="h-px flex-1 bg-border-secondary" />
		</div>
	);
});

// ==== MessageContextMenu ====

/** State for the message context menu (which message, where to render). */
export interface MessageContextMenuState {
	/** The message to show context actions for. */
	message: ChatMessage;
	/** Viewport X coordinate. */
	x: number;
	/** Viewport Y coordinate. */
	y: number;
}

/**
 * Build context menu items for a message.
 *
 * Actions vary by message type:
 * - **User**: Copy Text, Fork from Here
 * - **Assistant**: Copy Text, Copy as Markdown, Fork from Here
 */
function buildMessageContextMenuItems(
	message: ChatMessage,
	hasSession: boolean,
): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];
	const hasContent = message.content.length > 0;

	// Copy Text — available for user and assistant messages with content
	if (hasContent) {
		items.push({ label: "Copy Text", action: "copy-text" });
	}

	// Copy as Markdown — assistant messages only (content IS markdown)
	if (message.type === "assistant" && hasContent) {
		items.push({ label: "Copy as Markdown", action: "copy-markdown" });
	}

	// Fork from Here — requires active session
	if (hasSession && hasContent) {
		items.push({ type: "separator" });
		items.push({ label: "Fork from Here", action: "fork" });
	}

	return items;
}

/**
 * Strip markdown formatting to produce plain text.
 *
 * Handles common markdown patterns: headers, bold, italic, code fences,
 * inline code, links, images, blockquotes, horizontal rules, list markers.
 * Not a full parser — handles the common cases for "Copy Text" action.
 */
function stripMarkdown(md: string): string {
	return (
		md
			// Remove code fences (``` blocks) — keep inner content
			.replace(/```[\s\S]*?```/g, (match) => {
				const lines = match.split("\n");
				// Remove first line (```lang) and last line (```)
				return lines.slice(1, -1).join("\n");
			})
			// Remove inline code backticks
			.replace(/`([^`]+)`/g, "$1")
			// Remove images ![alt](url)
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
			// Convert links [text](url) to just text
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			// Remove headers (# through ######)
			.replace(/^#{1,6}\s+/gm, "")
			// Remove bold/italic markers
			.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
			.replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
			// Remove blockquote markers
			.replace(/^>\s?/gm, "")
			// Remove horizontal rules
			.replace(/^[-*_]{3,}\s*$/gm, "")
			// Remove unordered list markers
			.replace(/^[\s]*[-*+]\s+/gm, "")
			// Remove ordered list markers
			.replace(/^[\s]*\d+\.\s+/gm, "")
			// Collapse multiple blank lines
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

/**
 * Handle a message context menu action.
 *
 * Processes: copy-text, copy-markdown, fork.
 * Fork finds the nearest user message content for the fork entry ID match.
 */
async function handleMessageContextAction(
	action: string,
	message: ChatMessage,
	messages: readonly ChatMessage[],
	addToast: (msg: string, level: "info" | "error" | "warning") => void,
	setLastError: (msg: string) => void,
): Promise<void> {
	switch (action) {
		case "copy-text": {
			// For user messages, content is plain text. For assistant, strip markdown.
			const text = message.type === "assistant" ? stripMarkdown(message.content) : message.content;
			await navigator.clipboard.writeText(text);
			addToast("Copied to clipboard", "info");
			break;
		}
		case "copy-markdown": {
			// Copy raw content (which is markdown for assistant messages)
			await navigator.clipboard.writeText(message.content);
			addToast("Copied as Markdown", "info");
			break;
		}
		case "fork": {
			// Find the user message content to fork from.
			// If this IS a user message, use its content directly.
			// If this is an assistant message, find the preceding user message.
			let forkContent: string | null = null;
			if (message.type === "user") {
				forkContent = message.content;
			} else {
				// Walk backwards through messages to find the preceding user message
				const msgIndex = messages.findIndex((m) => m.id === message.id);
				if (msgIndex >= 0) {
					for (let i = msgIndex - 1; i >= 0; i--) {
						const m = messages[i];
						if (m?.type === "user") {
							forkContent = m.content;
							break;
						}
					}
				}
			}

			if (!forkContent) {
				setLastError("Could not find a user message to fork from.");
				return;
			}

			const entryId = await findForkEntryId(forkContent);
			if (!entryId) {
				setLastError("Could not find the matching message to fork from.");
				return;
			}

			await forkFromMessage(entryId);
			// On success, session is replaced — component unmounts/re-renders
			break;
		}
	}
}

/**
 * HTML fallback context menu for messages in the chat timeline.
 *
 * Shown when native context menu is unavailable (browser mode).
 * Positioned at right-click coordinates, closes on outside click or Escape.
 *
 * Actions:
 * - **Copy Text** — copies plain text (strips markdown for assistant messages)
 * - **Copy as Markdown** — copies raw markdown source (assistant only)
 * - **Fork from Here** — forks conversation from this message's user turn
 */
export const HtmlMessageContextMenu = memo(function HtmlMessageContextMenu({
	menu,
	messages,
	onClose,
}: {
	menu: MessageContextMenuState;
	messages: readonly ChatMessage[];
	onClose: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const addToast = useStore((s) => s.addToast);
	const setLastError = useStore((s) => s.setLastError);
	const sessionId = useStore((s) => s.sessionId);
	const hasSession = sessionId !== null;

	// Close on outside click or Escape
	useEffect(() => {
		function handleClick(e: globalThis.MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handleAction = useCallback(
		(action: string) => {
			onClose();
			handleMessageContextAction(action, menu.message, messages, addToast, setLastError).catch(
				(err: unknown) => {
					console.error("[MessageContextMenu] Action failed:", err);
				},
			);
		},
		[onClose, menu.message, messages, addToast, setLastError],
	);

	const hasContent = menu.message.content.length > 0;
	const isAssistant = menu.message.type === "assistant";

	return (
		<div
			ref={menuRef}
			className="fixed z-[100] min-w-[160px] rounded-lg border border-border-primary bg-surface-secondary py-1 shadow-lg"
			style={{ left: menu.x, top: menu.y }}
		>
			{/* Copy Text */}
			{hasContent && (
				<button
					type="button"
					onClick={() => handleAction("copy-text")}
					className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
				>
					{/* Copy icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5 text-text-muted"
						aria-label="Copy text"
						role="img"
					>
						<path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 10.5v-7Z" />
						<path d="M3 5a1 1 0 0 0-1 1v7.5A1.5 1.5 0 0 0 3.5 15H11a1 1 0 0 0 1-1H3.5a.5.5 0 0 1-.5-.5V5Z" />
					</svg>
					Copy Text
				</button>
			)}

			{/* Copy as Markdown — assistant only */}
			{isAssistant && hasContent && (
				<button
					type="button"
					onClick={() => handleAction("copy-markdown")}
					className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
				>
					{/* Markdown icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5 text-text-muted"
						aria-label="Copy as Markdown"
						role="img"
					>
						<path
							fillRule="evenodd"
							d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2-.5h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm1.25 2.5v4h1.5V7.87l1.25 1.56 1.25-1.56V10h1.5V6H9.5l-1.25 1.5L7 6H5.25Z"
							clipRule="evenodd"
						/>
					</svg>
					Copy as Markdown
				</button>
			)}

			{/* Fork from Here — requires session */}
			{hasSession && hasContent && (
				<>
					<div className="my-1 h-px bg-border-primary" />
					<button
						type="button"
						onClick={() => handleAction("fork")}
						className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
					>
						{/* Fork icon */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3.5 w-3.5 text-text-muted"
							aria-label="Fork from here"
							role="img"
						>
							<path
								fillRule="evenodd"
								d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v5.256a2.25 2.25 0 1 0 1.5 0V5.372Zm-1 7.878a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm7.75-7a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm.75 1.122a2.25 2.25 0 1 0-1.5 0V8c0 .828-.672 1.5-1.5 1.5H7.75a.75.75 0 0 0 0 1.5h1.75A3.001 3.001 0 0 0 12.5 8V7.372Z"
								clipRule="evenodd"
							/>
						</svg>
						Fork from Here
					</button>
				</>
			)}
		</div>
	);
});

/**
 * Show a context menu for a message — tries native first, falls back to HTML.
 *
 * Returns `true` if native menu was shown (no HTML fallback needed),
 * `false` if native menu failed (caller should show HTML menu).
 */
export async function showMessageContextMenu(
	message: ChatMessage,
	messages: readonly ChatMessage[],
	hasSession: boolean,
	addToast: (msg: string, level: "info" | "error" | "warning") => void,
	setLastError: (msg: string) => void,
): Promise<boolean> {
	const items = buildMessageContextMenuItems(message, hasSession);
	if (items.length === 0) return true; // Nothing to show

	try {
		await showNativeContextMenu(items, (data) => {
			if (data.action) {
				handleMessageContextAction(data.action, message, messages, addToast, setLastError).catch(
					(err: unknown) => {
						console.error("[MessageContextMenu] Native action failed:", err);
					},
				);
			}
		});
		return true;
	} catch {
		return false; // Native menu unavailable — caller should show HTML fallback
	}
}

// ==== Helpers ====

/**
 * Shorten an absolute file path to just the last 2 segments for compact display.
 * e.g., `/Users/foo/project/src/components/App.tsx` → `components/App.tsx`
 */
function shortenPath(filePath: string): string {
	const segments = filePath.split("/").filter(Boolean);
	if (segments.length <= 2) return filePath;
	return segments.slice(-2).join("/");
}

// ==== TurnDivider ====

interface TurnDividerProps {
	/** Unix timestamp (ms) of the next user message in this turn boundary. */
	timestamp: number;
	/** Number of tool calls in the preceding assistant turn. */
	toolCount: number;
	/** Elapsed wall-clock time (ms) since the previous user message, or null if not available. */
	elapsedMs: number | null;
	/** Unique file paths modified (edit/write) in the preceding assistant turn. */
	changedFiles: string[];
	/** Text content of the user message this divider precedes (for fork matching). */
	userMessageContent: string;
}

/**
 * Visual separator between user→assistant turns.
 *
 * Shows a subtle divider line with:
 * - Timestamp of the turn boundary
 * - Elapsed time since the previous turn (wall-clock duration)
 * - Tool call count badge from the preceding assistant turn (if any)
 *
 * Designed to be a low-contrast, non-intrusive visual break that helps
 * users orient in long conversations without competing with the
 * completion summary ("✓ Worked for Xm Ys") which appears just above.
 */
/** Revert states for the confirm-then-fork flow. */
type RevertState = "idle" | "confirming" | "loading" | "forking";

/**
 * Find the matching Pi entryId for a user message by matching text content.
 *
 * Pi's `get_fork_messages` returns `{ entryId, text }[]` in session order.
 * We match by comparing `userMessageContent` against each entry's `text`.
 * If multiple entries have the same text, we match the first one found
 * (Pi returns entries in chronological order, matching the UI order).
 */
async function findForkEntryId(userMessageContent: string): Promise<string | null> {
	const forkMessages = await getForkableMessages();
	if (!forkMessages || forkMessages.length === 0) return null;

	// Normalize whitespace for comparison (Pi may strip/trim differently)
	const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
	const target = normalize(userMessageContent);

	for (const msg of forkMessages) {
		if (normalize(msg.text) === target) {
			return msg.entryId;
		}
	}

	return null;
}

export const TurnDivider = memo(function TurnDivider({
	timestamp,
	toolCount,
	elapsedMs,
	changedFiles,
	userMessageContent,
}: TurnDividerProps) {
	const timestampFormat = useStore((s) => s.timestampFormat);
	const sessionId = useStore((s) => s.sessionId);
	const [filesExpanded, setFilesExpanded] = useState(false);
	const [revertState, setRevertState] = useState<RevertState>("idle");
	const fileCount = changedFiles.length;

	const handleRevert = useCallback(async () => {
		if (revertState === "idle") {
			setRevertState("confirming");
			return;
		}
		if (revertState !== "confirming") return;

		setRevertState("loading");
		const entryId = await findForkEntryId(userMessageContent);
		if (!entryId) {
			useStore.getState().setLastError("Could not find the matching message to revert to.");
			setRevertState("idle");
			return;
		}

		setRevertState("forking");
		const success = await forkFromMessage(entryId);
		if (!success) {
			// Error already shown by forkFromMessage
			setRevertState("idle");
		}
		// On success, the session is replaced — component will unmount/re-render
	}, [revertState, userMessageContent]);

	const handleCancelRevert = useCallback(() => {
		setRevertState("idle");
	}, []);

	return (
		<div className="flex flex-col items-center gap-0.5 py-1">
			<div className="flex w-full items-center gap-2">
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
					{fileCount > 0 && (
						<button
							type="button"
							onClick={() => setFilesExpanded((p) => !p)}
							className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
							title={`${changedFiles.join("\n")}\n\nClick to expand file list`}
						>
							{/* File icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-2.5 w-2.5"
								aria-label="Changed files"
								role="img"
							>
								<path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm7 7a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5A.75.75 0 0 1 11 9Zm0 2.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 .75.75Z" />
							</svg>
							{fileCount} {fileCount === 1 ? "file" : "files"} changed
							{/* Chevron */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className={cn(
									"h-2.5 w-2.5 transition-transform duration-150",
									filesExpanded && "rotate-180",
								)}
								aria-label="Toggle file list"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					)}
					{fileCount > 0 && (
						<button
							type="button"
							onClick={() => {
								useStore.getState().openDiffPanel(changedFiles);
							}}
							className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-accent-bg/20 hover:text-accent-text"
							title="View diff for changed files (Ctrl+D)"
						>
							{/* Diff icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-2.5 w-2.5"
								aria-label="View diff"
								role="img"
							>
								<path d="M8 1a.75.75 0 0 1 .75.75V6.5h4.75a.75.75 0 0 1 0 1.5H8.75v4.75a.75.75 0 0 1-1.5 0V8H2.5a.75.75 0 0 1 0-1.5h4.75V1.75A.75.75 0 0 1 8 1Z" />
							</svg>
							diff
						</button>
					)}
					{/* Revert button — only when there's an active session */}
					{sessionId && revertState === "idle" && (
						<button
							type="button"
							onClick={handleRevert}
							className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-warning-bg/20 hover:text-warning-text"
							title="Revert to this point — fork the conversation from this message"
						>
							{/* Undo/revert icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-2.5 w-2.5"
								aria-label="Revert to this point"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M2.22 4.22a.75.75 0 0 1 1.06 0L5 5.94V4.5a4.5 4.5 0 0 1 9 0v4a4.5 4.5 0 0 1-9 0V7.25a.75.75 0 0 1 1.5 0V8.5a3 3 0 1 0 6 0v-4a3 3 0 0 0-6 0v1.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z"
									clipRule="evenodd"
								/>
							</svg>
							revert
						</button>
					)}
					{elapsedMs !== null && (
						<span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted">
							{formatDuration(elapsedMs)}
						</span>
					)}
					<span className="text-[10px] text-text-muted/60">
						{formatTimestamp(timestamp, timestampFormat)}
					</span>
				</div>
				<div className="h-px flex-1 bg-border-primary/30" />
			</div>
			{/* Revert confirmation */}
			{revertState !== "idle" && (
				<div className="flex items-center gap-2 py-1">
					{revertState === "confirming" && (
						<>
							<span className="text-[11px] text-warning-text">
								Fork from this point? This creates a new session branch.
							</span>
							<button
								type="button"
								onClick={handleRevert}
								className="rounded-md bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning-text transition-colors hover:bg-warning-bg/80"
							>
								Confirm
							</button>
							<button
								type="button"
								onClick={handleCancelRevert}
								className="rounded-md bg-surface-secondary px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-surface-tertiary"
							>
								Cancel
							</button>
						</>
					)}
					{revertState === "loading" && (
						<span className="flex items-center gap-1.5 text-[11px] text-text-muted">
							<span className="h-3 w-3 animate-spin rounded-full border border-text-muted border-t-text-secondary" />
							Finding message…
						</span>
					)}
					{revertState === "forking" && (
						<span className="flex items-center gap-1.5 text-[11px] text-text-muted">
							<span className="h-3 w-3 animate-spin rounded-full border border-text-muted border-t-text-secondary" />
							Forking session…
						</span>
					)}
				</div>
			)}
			{/* Expanded file list */}
			{filesExpanded && fileCount > 0 && (
				<div className="flex flex-col items-center gap-0.5 py-0.5">
					{changedFiles.map((filePath) => (
						<span
							key={filePath}
							className="max-w-md truncate text-[10px] text-text-muted/70"
							title={filePath}
						>
							{shortenPath(filePath)}
						</span>
					))}
				</div>
			)}
		</div>
	);
});
