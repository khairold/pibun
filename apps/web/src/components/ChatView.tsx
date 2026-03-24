/**
 * ChatView — virtualized scrollable message area rendering the conversation.
 *
 * Uses react-virtuoso for windowed rendering — only visible messages plus a
 * small overscan buffer are mounted in the DOM. This keeps long conversations
 * (100+ messages) performant by avoiding rendering hundreds of off-screen
 * React subtrees.
 *
 * Renders all ChatMessage types via a `TimelineEntry` union type:
 * - `"message"` — user/assistant/system messages (UserMessage, AssistantMessage, SystemMessage)
 * - `"tool-group"` — grouped tool_call + tool_result (ToolExecutionCard)
 * - `"turn-divider"` — visual separator between turns with timestamp + tool count
 * - `"completion-summary"` — "✓ Worked for Xm Ys" divider after an agent turn
 *
 * The `groupMessages()` function transforms the flat `ChatMessage[]` array into
 * a `TimelineEntry[]` by grouping adjacent tool messages, inserting turn dividers,
 * and promoting completion system messages to first-class timeline entries.
 *
 * Auto-scrolls to bottom on new content using pointer-aware scroll detection
 * (via `useChatScroll` hook). Tracks mouse/wheel/touch interactions to
 * distinguish user scroll intent from content-growth shifts. Shows a floating
 * "↓ New messages" button when user has intentionally scrolled up.
 */

import {
	AssistantMessage,
	CompletionSummary,
	SystemMessage,
	TurnDivider,
	UserMessage,
} from "@/components/chat/ChatMessages";
import { ToolCallMessage, ToolExecutionCard, ToolResultMessage } from "@/components/chat/ToolCards";
import { WorkGroup } from "@/components/chat/WorkGroup";
import { useChatScroll } from "@/hooks/useChatScroll";
import { openProject } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import type { Project } from "@pibun/contracts";
import { type ReactElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

// ============================================================================
// TimelineEntry — the renderable unit in the chat timeline
// ============================================================================

/** A single tool call + result pair within a work group. */
export interface ToolGroupEntry {
	toolCall: ChatMessage;
	toolResult: ChatMessage | null;
}

/**
 * A renderable entry in the chat timeline.
 *
 * The flat `ChatMessage[]` from the store is transformed into `TimelineEntry[]`
 * by `groupMessages()`. Each variant maps to a dedicated renderer:
 * - `"message"` → UserMessage / AssistantMessage / SystemMessage
 * - `"tool-group"` → ToolExecutionCard (single tool_call + tool_result, fallback)
 * - `"work-group"` → WorkGroup (collapsible group of tool executions per turn)
 * - `"turn-divider"` → TurnDivider (timestamp + elapsed time + tool count badge)
 * - `"completion-summary"` → CompletionSummary ("✓ Worked for Xm Ys")
 */
export type TimelineEntry =
	| { kind: "message"; message: ChatMessage }
	| { kind: "tool-group"; toolCall: ChatMessage; toolResult: ChatMessage | null }
	| { kind: "work-group"; id: string; entries: ToolGroupEntry[] }
	| {
			kind: "turn-divider";
			id: string;
			timestamp: number;
			toolCount: number;
			elapsedMs: number | null;
			/** Unique file paths modified by Edit/Write tool calls in the preceding turn. */
			changedFiles: string[];
	  }
	| { kind: "completion-summary"; id: string; timestamp: number; content: string };

/** Prefix used to identify completion summary system messages. */
const COMPLETION_PREFIX = "✓ Worked for";

/** Tool names whose `path` arg represents a file modification. */
const FILE_MODIFYING_TOOLS = new Set(["edit", "write"]);

/**
 * Extract the file path from a tool_call message if it's a file-modifying tool
 * (edit or write) and add it to the changed files set.
 */
function collectChangedFile(msg: ChatMessage, changedFiles: Set<string>): void {
	const tc = msg.toolCall;
	if (!tc || !FILE_MODIFYING_TOOLS.has(tc.name)) return;
	const path = tc.args.path;
	if (typeof path === "string" && path.length > 0) {
		changedFiles.add(path);
	}
}

/**
 * Group messages into timeline entries.
 *
 * Transformations applied:
 * 1. Adjacent tool_call + tool_result pairs → collected as `ToolGroupEntry`
 * 2. Consecutive tool entries → merged into `"work-group"` entries (collapsible)
 * 3. Turn dividers inserted before each user message (except the first)
 *    with the preceding turn's tool call count
 * 4. System messages starting with "✓ Worked for" → `"completion-summary"` entries
 */
function groupMessages(messages: readonly ChatMessage[]): TimelineEntry[] {
	const items: TimelineEntry[] = [];
	let i = 0;
	/** Whether we've seen the first user message (no divider before it). */
	let seenFirstUser = false;
	/** Tool call count accumulated in the current turn. */
	let turnToolCount = 0;
	/** Timestamp of the previous user message (to compute elapsed time between turns). */
	let prevUserTimestamp: number | null = null;
	/** Unique file paths modified by Edit/Write tool calls in the current turn. */
	let turnChangedFiles: Set<string> = new Set();
	/** Counter for generating unique IDs. */
	let dividerCounter = 0;
	let workGroupCounter = 0;

	while (i < messages.length) {
		const msg = messages[i];
		if (!msg) {
			i++;
			continue;
		}

		// Insert turn divider before each user message (except the first)
		if (msg.type === "user") {
			if (seenFirstUser) {
				const elapsedMs = prevUserTimestamp !== null ? msg.timestamp - prevUserTimestamp : null;
				items.push({
					kind: "turn-divider",
					id: `turn-divider-${String(++dividerCounter)}`,
					timestamp: msg.timestamp,
					toolCount: turnToolCount,
					elapsedMs: elapsedMs !== null && elapsedMs > 0 ? elapsedMs : null,
					changedFiles: Array.from(turnChangedFiles),
				});
			}
			seenFirstUser = true;
			turnToolCount = 0;
			turnChangedFiles = new Set();
			prevUserTimestamp = msg.timestamp;
		}

		if (msg.type === "tool_call") {
			// Collect all consecutive tool_call (+ optional tool_result) pairs
			const toolEntries: ToolGroupEntry[] = [];
			while (i < messages.length && messages[i]?.type === "tool_call") {
				const tc = messages[i] as ChatMessage;
				turnToolCount++;
				// Track file paths from file-modifying tools (edit, write)
				collectChangedFile(tc, turnChangedFiles);
				const next = i + 1 < messages.length ? messages[i + 1] : undefined;
				if (next?.type === "tool_result") {
					toolEntries.push({ toolCall: tc, toolResult: next });
					i += 2;
				} else {
					toolEntries.push({ toolCall: tc, toolResult: null });
					i += 1;
				}
			}

			// Emit as work-group (even for a single tool — consistent collapsible UI)
			items.push({
				kind: "work-group",
				id: `work-group-${String(++workGroupCounter)}`,
				entries: toolEntries,
			});
			continue;
		}

		// Skip tool_result that isn't preceded by a tool_call (shouldn't happen, but be safe)
		if (msg.type === "tool_result") {
			// Orphan result — render as standalone
			items.push({ kind: "message", message: msg });
			i++;
			continue;
		}

		// Promote completion system messages to first-class timeline entries
		if (msg.type === "system" && msg.content.startsWith(COMPLETION_PREFIX)) {
			items.push({
				kind: "completion-summary",
				id: msg.id,
				timestamp: msg.timestamp,
				content: msg.content,
			});
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

/** Render a timeline entry (message, work group, turn divider, or completion summary). */
const TimelineEntryRenderer = memo(function TimelineEntryRenderer({
	entry,
}: { entry: TimelineEntry }) {
	switch (entry.kind) {
		case "work-group":
			return <WorkGroup entries={entry.entries} />;
		case "tool-group":
			return <ToolExecutionCard toolCall={entry.toolCall} toolResult={entry.toolResult} />;
		case "turn-divider":
			return (
				<TurnDivider
					timestamp={entry.timestamp}
					toolCount={entry.toolCount}
					elapsedMs={entry.elapsedMs}
					changedFiles={entry.changedFiles}
				/>
			);
		case "completion-summary":
			return <CompletionSummary content={entry.content} />;
		case "message":
			return <MessageItem message={entry.message} />;
	}
});

/** Unique key for a timeline entry. */
function timelineEntryKey(entry: TimelineEntry): string {
	switch (entry.kind) {
		case "work-group":
			return entry.id;
		case "tool-group":
			return `tool-group-${entry.toolCall.id}`;
		case "turn-divider":
			return entry.id;
		case "completion-summary":
			return entry.id;
		case "message":
			return entry.message.id;
	}
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
// RetryIndicator — countdown progress bar during auto-retry delay
// ============================================================================

/**
 * Inline retry indicator shown when Pi is auto-retrying after an error.
 * Displays attempt count and an animated countdown progress bar that
 * drains over the retry delay period.
 */
function RetryIndicator({
	attempt,
	maxAttempts,
	delayMs,
	startedAt,
}: {
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	startedAt: number;
}) {
	const [progress, setProgress] = useState(1);

	useEffect(() => {
		if (delayMs <= 0 || startedAt <= 0) {
			setProgress(0);
			return;
		}

		let rafId: number;
		const tick = () => {
			const elapsed = Date.now() - startedAt;
			const remaining = Math.max(0, 1 - elapsed / delayMs);
			setProgress(remaining);
			if (remaining > 0) {
				rafId = requestAnimationFrame(tick);
			}
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [delayMs, startedAt]);

	const seconds = Math.max(0, Math.ceil((delayMs * progress) / 1000));

	return (
		<div className="mt-4 flex flex-col gap-1.5">
			<div className="flex items-center gap-2 text-xs text-status-warning-text/80">
				<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-warning-text" />
				<span>
					Retrying{"\u2026"} attempt {attempt}/{maxAttempts}
					{delayMs > 0 && seconds > 0 && <span className="text-text-tertiary"> — {seconds}s</span>}
				</span>
			</div>
			{delayMs > 0 && (
				<div className="h-1 w-full overflow-hidden rounded-full bg-status-warning/20">
					<div
						className="h-full rounded-full bg-status-warning-text/50 transition-none"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
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
	const retryDelayMs = useStore((s) => s.retryDelayMs);
	const retryStartedAt = useStore((s) => s.retryStartedAt);

	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const { followOutput, handleAtBottom, showScrollButton, scrollToBottom, containerProps } =
		useChatScroll(virtuosoRef);

	// Group messages into timeline entries (memoize to avoid re-grouping on every render)
	const entries = useMemo(() => groupMessages(messages), [messages]);

	// Derive whether any message is actively streaming (boolean, cheap to compare).
	// This avoids passing the full `messages` array into the footer callback.
	const anyMessageStreaming = useMemo(() => hasStreamingMessage(messages), [messages]);

	// ── Virtuoso callbacks (stable refs) ─────────────────────────────

	/** Render a single entry by index. */
	const itemContent = useCallback(
		(index: number) => {
			const entry = entries[index];
			if (!entry) return null;
			return <TimelineEntryRenderer entry={entry} />;
		},
		[entries],
	);

	/** Compute stable key per entry for reconciliation. */
	const computeItemKey = useCallback(
		(index: number) => {
			const entry = entries[index];
			if (!entry) return `entry-${index}`;
			return timelineEntryKey(entry);
		},
		[entries],
	);

	// ── Footer: status indicators below the message list ─────────────
	const footer = useCallback(() => {
		const showThinking = isStreaming && !anyMessageStreaming;
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

				{/* Retry indicator with countdown progress */}
				{showRetrying && (
					<RetryIndicator
						attempt={retryAttempt}
						maxAttempts={retryMaxAttempts}
						delayMs={retryDelayMs}
						startedAt={retryStartedAt}
					/>
				)}
			</div>
		);
	}, [
		isStreaming,
		anyMessageStreaming,
		isCompacting,
		isRetrying,
		retryAttempt,
		retryMaxAttempts,
		retryDelayMs,
		retryStartedAt,
	]);

	// ── Empty state ──────────────────────────────────────────────────

	if (entries.length === 0) {
		return <EmptyState />;
	}

	// ── Virtualized message list ─────────────────────────────────────

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" {...containerProps}>
			<Virtuoso
				ref={virtuosoRef}
				totalCount={entries.length}
				itemContent={itemContent}
				computeItemKey={computeItemKey}
				followOutput={followOutput}
				atBottomStateChange={handleAtBottom}
				atBottomThreshold={50}
				increaseViewportBy={{ top: 400, bottom: 400 }}
				defaultItemHeight={80}
				components={{
					List: VirtuosoList,
					Item: VirtuosoItem,
					Footer: footer,
				}}
				className="flex-1"
				initialTopMostItemIndex={entries.length - 1}
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
