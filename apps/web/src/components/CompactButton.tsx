/**
 * CompactButton — triggers manual context compaction.
 *
 * Shows in the toolbar alongside session management controls.
 * Disabled when not connected, no session, or compaction already in progress.
 * Shows a spinning indicator while compacting (from either manual or auto trigger).
 */

import { cn } from "@/lib/cn";
import { compactSession } from "@/lib/sessionActions";
import { useStore } from "@/store";
import { useCallback } from "react";

export function CompactButton() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const sessionId = useStore((s) => s.sessionId);
	const isCompacting = useStore((s) => s.isCompacting);
	const isStreaming = useStore((s) => s.isStreaming);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;
	const isDisabled = !isConnected || !hasSession || isCompacting || isStreaming;

	const handleClick = useCallback(async () => {
		if (isDisabled) return;
		await compactSession();
	}, [isDisabled]);

	// Only show when a session is active
	if (!isConnected || !hasSession) return null;

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={isDisabled}
			title={
				isCompacting
					? "Compacting context…"
					: isStreaming
						? "Cannot compact while streaming"
						: "Compact context window"
			}
			className={cn(
				"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
				isDisabled
					? "cursor-not-allowed text-neutral-600"
					: "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
				isCompacting && "text-amber-500/70",
			)}
		>
			{/* Compress/compact icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className={cn("h-3.5 w-3.5", isCompacting && "animate-spin")}
				aria-label="Compact context"
				role="img"
			>
				<path
					fillRule="evenodd"
					d="M8 1a.75.75 0 0 1 .75.75V4.5h1.97a.75.75 0 0 1 .53 1.28L8.53 8.53a.75.75 0 0 1-1.06 0L4.75 5.78a.75.75 0 0 1 .53-1.28H7.25V1.75A.75.75 0 0 1 8 1zM8 15a.75.75 0 0 1-.75-.75V11.5H5.28a.75.75 0 0 1-.53-1.28l2.72-2.75a.75.75 0 0 1 1.06 0l2.72 2.75a.75.75 0 0 1-.53 1.28H8.75v2.75A.75.75 0 0 1 8 15z"
					clipRule="evenodd"
				/>
			</svg>
			{isCompacting ? "Compacting…" : "Compact"}
		</button>
	);
}
