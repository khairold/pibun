/**
 * ConnectionBanner — shows a banner when the WebSocket is not connected.
 *
 * States:
 * - connecting / reconnecting → yellow banner with attempt count
 * - closed → red banner
 * - open → hidden (renders nothing)
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";

export function ConnectionBanner() {
	const status = useStore((s) => s.connectionStatus);
	const attempt = useStore((s) => s.reconnectAttempt);

	if (status === "open") return null;

	const isError = status === "closed" || status === "disposed";

	return (
		<div
			className={cn(
				"flex items-center justify-center px-4 py-1.5 text-xs font-medium",
				isError
					? "bg-status-error-bg text-status-error-text"
					: "bg-status-warning-bg text-status-warning-text",
			)}
		>
			{status === "connecting" && "Connecting to server…"}
			{status === "reconnecting" && `Reconnecting (attempt ${attempt})…`}
			{status === "closed" && "Disconnected from server"}
			{status === "disposed" && "Connection closed"}
		</div>
	);
}
