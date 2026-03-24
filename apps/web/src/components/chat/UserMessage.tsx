/**
 * UserMessage — renders a user prompt in the chat.
 *
 * Simple block showing the user's text with a subtle background.
 * Content is displayed as pre-wrapped text (no markdown parsing yet — Phase 1D).
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo } from "react";

interface UserMessageProps {
	message: ChatMessage;
}

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
