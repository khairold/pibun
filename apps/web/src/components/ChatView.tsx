/**
 * ChatView — scrollable message area rendering the conversation.
 *
 * Renders all ChatMessage types using dedicated sub-components:
 * - UserMessage — user prompts (right-aligned bubbles)
 * - AssistantMessage — assistant text with streaming cursor + thinking
 * - ToolCallMessage — tool name + args (collapsible)
 * - ToolResultMessage — tool output (collapsible for long content)
 * - SystemMessage — compaction/retry notices (centered dividers)
 *
 * Auto-scrolls to bottom on new content when user is at/near bottom.
 * Shows a floating "↓ New messages" button when user has scrolled up.
 */

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { SystemMessage } from "@/components/chat/SystemMessage";
import { ToolCallMessage } from "@/components/chat/ToolCallMessage";
import { ToolResultMessage } from "@/components/chat/ToolResultMessage";
import { UserMessage } from "@/components/chat/UserMessage";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import type { ChatMessage } from "@/store/types";
import { memo, useRef } from "react";

/** Render a single message based on its type. */
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

export function ChatView() {
	const messages = useStore((s) => s.messages);
	const isStreaming = useStore((s) => s.isStreaming);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const { showScrollButton, scrollToBottom } = useAutoScroll(scrollContainerRef, messages);

	// Empty state
	if (messages.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center px-4">
				<div className="text-center">
					<div className="mb-3 text-3xl">🥧</div>
					<p className="text-sm text-neutral-400">Send a message to start a conversation with Pi</p>
					<p className="mt-1 text-xs text-neutral-600">A session will be created automatically</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={scrollContainerRef} className="relative flex flex-1 flex-col overflow-y-auto">
			{/* Messages list — centered with max-width */}
			<div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
				<div className="flex flex-col gap-4">
					{messages.map((msg) => (
						<MessageItem key={msg.id} message={msg} />
					))}
				</div>

				{/* Streaming indicator when agent is working but no messages are streaming */}
				{isStreaming && !hasStreamingMessage(messages) && (
					<div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
						<span>Pi is thinking…</span>
					</div>
				)}
			</div>

			{/* Bottom padding for visual breathing room */}
			<div className="h-4 shrink-0" />

			{/* Floating "New messages" button when scrolled up */}
			{showScrollButton && (
				<button
					type="button"
					onClick={scrollToBottom}
					className={cn(
						"absolute bottom-4 left-1/2 z-10 -translate-x-1/2",
						"flex items-center gap-1.5 rounded-full",
						"border border-neutral-700 bg-neutral-800 px-3 py-1.5",
						"text-xs text-neutral-300 shadow-lg",
						"transition-colors hover:bg-neutral-700 hover:text-neutral-100",
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
