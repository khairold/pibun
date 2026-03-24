/**
 * NewSessionButton — creates a fresh Pi session.
 *
 * Calls startNewSession() which aborts any streaming, tells Pi to
 * create a new session, clears local messages, and refreshes state.
 * Disabled when not connected or when a new session is being created.
 */

import { cn } from "@/lib/cn";
import { startNewSession } from "@/lib/sessionActions";
import { useStore } from "@/store";
import { useCallback, useState } from "react";

export function NewSessionButton() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const [isCreating, setIsCreating] = useState(false);

	const isConnected = connectionStatus === "open";
	const isDisabled = !isConnected || isCreating;

	const handleClick = useCallback(async () => {
		if (isDisabled) return;
		setIsCreating(true);
		try {
			await startNewSession();
		} finally {
			setIsCreating(false);
		}
	}, [isDisabled]);

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={isDisabled}
			title="New Session (Ctrl+N)"
			className={cn(
				"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
				isDisabled
					? "cursor-not-allowed text-text-muted"
					: "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
			)}
		>
			{/* Plus icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5"
				aria-label="New session"
				role="img"
			>
				<path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
			</svg>
			{isCreating ? "Creating…" : "New"}
		</button>
	);
}
