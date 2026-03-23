/**
 * SystemMessage — renders system notices in the chat.
 *
 * Used for compaction notices, retry banners, and other system events.
 * Displayed as subtle centered text with a divider-like appearance.
 * Compaction, retry, and error messages get distinct styling/colors.
 */

import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/store/types";
import { memo } from "react";

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
	iconClass: string;
} {
	switch (category) {
		case "compaction":
			return {
				textClass: "text-amber-500/70",
				dividerClass: "bg-amber-500/20",
				iconClass: "",
			};
		case "retry-progress":
			return {
				textClass: "text-orange-400/80",
				dividerClass: "bg-orange-500/20",
				iconClass: "animate-spin-slow",
			};
		case "retry-success":
			return {
				textClass: "text-green-400/70",
				dividerClass: "bg-green-500/20",
				iconClass: "",
			};
		case "retry-failed":
			return {
				textClass: "text-red-400/80",
				dividerClass: "bg-red-500/20",
				iconClass: "",
			};
		default:
			return {
				textClass: "text-neutral-500",
				dividerClass: "bg-neutral-800",
				iconClass: "",
			};
	}
}

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
