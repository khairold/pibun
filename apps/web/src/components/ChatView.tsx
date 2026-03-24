/**
 * ChatView — virtualized scrollable message area rendering the conversation.
 *
 * Uses react-virtuoso for windowed rendering — only visible messages plus a
 * small overscan buffer are mounted in the DOM. This keeps long conversations
 * (100+ messages) performant by avoiding rendering hundreds of off-screen
 * React subtrees.
 *
 * Renders all ChatMessage types using dedicated sub-components:
 * - UserMessage — user prompts (right-aligned bubbles)
 * - AssistantMessage — streaming assistant text with streaming cursor + thinking
 * - ToolExecutionCard — unified tool call + result card (status, expandable output)
 * - SystemMessage — compaction/retry notices (centered dividers)
 *
 * Tool calls and their results are automatically grouped into ToolExecutionCard
 * when they appear as adjacent messages (tool_call followed by tool_result).
 *
 * Auto-scrolls to bottom on new content when user is at/near bottom (via
 * Virtuoso's `followOutput`). Shows a floating "↓ New messages" button when
 * user has scrolled up.
 */

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { SystemMessage } from "@/components/chat/SystemMessage";
import { ToolCallMessage } from "@/components/chat/ToolCallMessage";
import { ToolExecutionCard } from "@/components/chat/ToolExecutionCard";
import { ToolResultMessage } from "@/components/chat/ToolResultMessage";
import { UserMessage } from "@/components/chat/UserMessage";
import { openProject } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import type { Project } from "@pibun/contracts";
import { type ReactElement, memo, useCallback, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

// ============================================================================
// Message grouping — combine tool_call + tool_result into unified items
// ============================================================================

/** A renderable item in the chat — either a single message or a tool group. */
type ChatItem =
	| { kind: "message"; message: ChatMessage }
	| { kind: "tool_group"; toolCall: ChatMessage; toolResult: ChatMessage | null };

/**
 * Group messages into renderable items.
 * Adjacent tool_call + tool_result pairs become tool_group items.
 */
function groupMessages(messages: readonly ChatMessage[]): ChatItem[] {
	const items: ChatItem[] = [];
	let i = 0;

	while (i < messages.length) {
		const msg = messages[i];
		if (!msg) {
			i++;
			continue;
		}

		if (msg.type === "tool_call") {
			// Look ahead for matching tool_result
			const next = i + 1 < messages.length ? messages[i + 1] : undefined;
			if (next?.type === "tool_result") {
				items.push({ kind: "tool_group", toolCall: msg, toolResult: next });
				i += 2; // Skip both messages
				continue;
			}
			// tool_call without immediate result — render as group with null result
			items.push({ kind: "tool_group", toolCall: msg, toolResult: null });
			i++;
			continue;
		}

		// Skip tool_result that isn't preceded by a tool_call (shouldn't happen, but be safe)
		if (msg.type === "tool_result") {
			// Orphan result — render as standalone
			items.push({ kind: "message", message: msg });
			i++;
			continue;
		}

		items.push({ kind: "message", message: msg });
		i++;
	}

	return items;
}

// ============================================================================
// Render items
// ============================================================================

/** Render a single message based on its type (non-grouped messages only). */
const MessageItem = memo(function MessageItem({ message }: { message: ChatMessage }) {
	switch (message.type) {
		case "user":
			return <UserMessage message={message} />;
		case "assistant":
			return <AssistantMessage message={message} />;
		case "tool_call":
			return <ToolCallMessage message={message} />;
		case "tool_result":
			return <ToolResultMessage message={message} />;
		case "system":
			return <SystemMessage message={message} />;
		default:
			return null;
	}
});

/** Render a chat item (message or tool group). */
const ChatItemRenderer = memo(function ChatItemRenderer({ item }: { item: ChatItem }) {
	if (item.kind === "tool_group") {
		return <ToolExecutionCard toolCall={item.toolCall} toolResult={item.toolResult} />;
	}
	return <MessageItem message={item.message} />;
});

/** Unique key for a chat item. */
function chatItemKey(item: ChatItem): string {
	if (item.kind === "tool_group") {
		return `tool-group-${item.toolCall.id}`;
	}
	return item.message.id;
}

// ============================================================================
// Virtuoso sub-components (stable references for perf)
// ============================================================================

/** Wrapper div for the Virtuoso list — centers content with max-width. */
function VirtuosoList({
	style,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>): ReactElement {
	return (
		<div {...props} style={style} className="mx-auto w-full max-w-3xl px-4 pb-4">
			{children}
		</div>
	);
}

/** Individual item wrapper — adds vertical gap between items. */
function VirtuosoItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement>): ReactElement {
	return (
		<div {...props} className="pt-4">
			{children}
		</div>
	);
}

// ============================================================================
// Recent Project Item
// ============================================================================

/** Maximum number of recent projects to show in the empty state. */
const MAX_RECENT_PROJECTS = 10;

interface RecentProjectItemProps {
	project: Project;
	onOpen: (project: Project) => void;
}

const RecentProjectItem = memo(function RecentProjectItem({
	project,
	onOpen,
}: RecentProjectItemProps) {
	return (
		<button
			type="button"
			onClick={() => onOpen(project)}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
				"text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
			)}
		>
			{/* Folder icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-4 w-4 shrink-0 text-text-muted"
				aria-label="Project folder"
				role="img"
			>
				<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" />
			</svg>
			<div className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{project.name}</span>
				<span className="block truncate text-[11px] text-text-muted">{project.cwd}</span>
			</div>
		</button>
	);
});

// ============================================================================
// Empty State
// ============================================================================

/**
 * Empty state shown when there are no messages in the current tab.
 *
 * Shows a welcome prompt and recent projects (top 10 by lastOpened)
 * for quick access. Clicking a project opens it in a new tab or
 * switches to an existing tab with the same CWD.
 */
function EmptyState() {
	const projects = useStore((s) => s.projects);

	const recentProjects = useMemo(() => projects.slice(0, MAX_RECENT_PROJECTS), [projects]);

	const handleOpenProject = useCallback((project: Project) => {
		openProject(project).catch((err: unknown) => {
			console.error("[ChatView] Failed to open project:", err);
		});
	}, []);

	return (
		<div className="flex flex-1 flex-col items-center justify-center px-4">
			<div className="w-full max-w-md text-center">
				<div className="mb-3 text-3xl">{"\u{1F967}"}</div>
				<p className="text-sm text-text-secondary">
					Send a message to start a conversation with Pi
				</p>
				<p className="mt-1 text-xs text-text-muted">A session will be created automatically</p>

				{/* Recent projects */}
				{recentProjects.length > 0 && (
					<div className="mt-8">
						<p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
							Recent Projects
						</p>
						<div className="flex flex-col gap-0.5 rounded-lg border border-border-secondary bg-surface-primary/50 p-1">
							{recentProjects.map((project) => (
								<RecentProjectItem key={project.id} project={project} onOpen={handleOpenProject} />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// ChatView
// ============================================================================

export function ChatView() {
	const messages = useStore((s) => s.messages);
	const isStreaming = useStore((s) => s.isStreaming);
	const isCompacting = useStore((s) => s.isCompacting);
	const isRetrying = useStore((s) => s.isRetrying);
	const retryAttempt = useStore((s) => s.retryAttempt);
	const retryMaxAttempts = useStore((s) => s.retryMaxAttempts);

	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const [showScrollButton, setShowScrollButton] = useState(false);

	// Group messages into renderable items (memoize to avoid re-grouping on every render)
	const items = useMemo(() => groupMessages(messages), [messages]);

	// ── Virtuoso callbacks (stable refs) ─────────────────────────────

	/** Track whether user is at the bottom — controls scroll button visibility. */
	const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
		setShowScrollButton(!atBottom);
	}, []);

	/**
	 * followOutput — tells Virtuoso whether to auto-scroll when new items
	 * appear or existing items grow. Returns "smooth" when at bottom so
	 * streaming text scrolls naturally.
	 */
	const followOutput = useCallback((isAtBottom: boolean): false | "smooth" | "auto" => {
		if (isAtBottom) return "smooth";
		// When streaming and not at bottom, don't force scroll
		return false;
	}, []);

	/** Render a single item by index. */
	const itemContent = useCallback(
		(index: number) => {
			const item = items[index];
			if (!item) return null;
			return <ChatItemRenderer item={item} />;
		},
		[items],
	);

	/** Compute stable key per item for reconciliation. */
	const computeItemKey = useCallback(
		(index: number) => {
			const item = items[index];
			if (!item) return `item-${index}`;
			return chatItemKey(item);
		},
		[items],
	);

	/** Scroll to bottom on button click. */
	const scrollToBottom = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({
			index: "LAST",
			behavior: "smooth",
		});
		setShowScrollButton(false);
	}, []);

	// ── Footer: status indicators below the message list ─────────────
	const footer = useCallback(() => {
		const showThinking = isStreaming && !hasStreamingMessage(messages);
		const showCompacting = isCompacting;
		const showRetrying = isRetrying;

		if (!showThinking && !showCompacting && !showRetrying) return null;

		return (
			<div className="mx-auto w-full max-w-3xl px-4 pb-4">
				{/* Streaming indicator when agent is working but no messages are streaming */}
				{showThinking && (
					<div className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
						<span>Pi is thinking{"\u2026"}</span>
					</div>
				)}

				{/* Compaction indicator when context is being compressed */}
				{showCompacting && (
					<div className="mt-4 flex items-center gap-2 text-xs text-status-warning/70">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-warning-text" />
						<span>Compacting context{"\u2026"}</span>
					</div>
				)}

				{/* Retry indicator when Pi is auto-retrying after an error */}
				{showRetrying && (
					<div className="mt-4 flex items-center gap-2 text-xs text-status-warning-text/80">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-warning-text" />
						<span>
							Retrying{"\u2026"} (attempt {retryAttempt}/{retryMaxAttempts})
						</span>
					</div>
				)}
			</div>
		);
	}, [isStreaming, messages, isCompacting, isRetrying, retryAttempt, retryMaxAttempts]);

	// ── Empty state ──────────────────────────────────────────────────

	if (items.length === 0) {
		return <EmptyState />;
	}

	// ── Virtualized message list ─────────────────────────────────────

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<Virtuoso
				ref={virtuosoRef}
				totalCount={items.length}
				itemContent={itemContent}
				computeItemKey={computeItemKey}
				followOutput={followOutput}
				atBottomStateChange={handleAtBottomStateChange}
				atBottomThreshold={50}
				increaseViewportBy={{ top: 400, bottom: 400 }}
				defaultItemHeight={80}
				components={{
					List: VirtuosoList,
					Item: VirtuosoItem,
					Footer: footer,
				}}
				className="flex-1"
				initialTopMostItemIndex={items.length - 1}
			/>

			{/* Floating "New messages" button when scrolled up */}
			{showScrollButton && (
				<button
					type="button"
					onClick={scrollToBottom}
					className={cn(
						"absolute bottom-4 left-1/2 z-10 -translate-x-1/2",
						"flex items-center gap-1.5 rounded-full",
						"border border-border-primary bg-surface-secondary px-3 py-1.5",
						"text-xs text-text-secondary shadow-lg",
						"transition-colors hover:bg-surface-tertiary hover:text-text-primary",
					)}
				>
					{/* Down arrow icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3"
						aria-label="Scroll down"
						role="img"
					>
						<path d="M8 13.5a.5.5 0 0 1-.354-.146l-4-4a.5.5 0 0 1 .708-.708L7.5 11.793V3a.5.5 0 0 1 1 0v8.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4A.5.5 0 0 1 8 13.5z" />
					</svg>
					<span>New messages</span>
				</button>
			)}
		</div>
	);
}

/** Check if any message in the array is currently streaming. */
function hasStreamingMessage(messages: readonly ChatMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.streaming) return true;
	}
	return false;
}
