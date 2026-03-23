/**
 * SystemMessage — renders system notices in the chat.
 *
 * Used for compaction notices, retry banners, and other system events.
 * Displayed as subtle centered text with a divider-like appearance.
 */

import type { ChatMessage } from "@/store/types";
import { memo } from "react";

interface SystemMessageProps {
	message: ChatMessage;
}

export const SystemMessage = memo(function SystemMessage({ message }: SystemMessageProps) {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-neutral-800" />
			<span className="shrink-0 text-xs text-neutral-500">{message.content}</span>
			<div className="h-px flex-1 bg-neutral-800" />
		</div>
	);
});
