/**
 * SystemMessage — renders system notices in the chat.
 *
 * Used for compaction notices, retry banners, and other system events.
 * Displayed as subtle centered text with a divider-like appearance.
 * Compaction and retry messages get distinct styling/colors.
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo } from "react";

interface SystemMessageProps {
	message: ChatMessage;
}

/** Detect message category for styling. */
function getSystemMessageStyle(content: string): {
	textClass: string;
	dividerClass: string;
} {
	if (content.includes("compaction")) {
		return {
			textClass: "text-amber-500/70",
			dividerClass: "bg-amber-500/20",
		};
	}
	if (content.includes("Retrying") || content.includes("Retry failed")) {
		return {
			textClass: "text-orange-500/70",
			dividerClass: "bg-orange-500/20",
		};
	}
	return {
		textClass: "text-neutral-500",
		dividerClass: "bg-neutral-800",
	};
}

export const SystemMessage = memo(function SystemMessage({ message }: SystemMessageProps) {
	const style = getSystemMessageStyle(message.content);

	return (
		<div className="flex items-center gap-3 py-1">
			<div className={cn("h-px flex-1", style.dividerClass)} />
			<span className={cn("shrink-0 text-xs", style.textClass)}>{message.content}</span>
			<div className={cn("h-px flex-1", style.dividerClass)} />
		</div>
	);
});
