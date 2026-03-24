/**
 * ErrorBanner — dismissible error message banner.
 *
 * Shows a red banner with the error message and a dismiss button.
 * Hidden when no error is set. Auto-clears after 10 seconds.
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { useCallback, useEffect } from "react";

/** Auto-dismiss timeout in milliseconds. */
const AUTO_DISMISS_MS = 10_000;

export function ErrorBanner() {
	const lastError = useStore((s) => s.lastError);
	const clearLastError = useStore((s) => s.clearLastError);

	const handleDismiss = useCallback(() => {
		clearLastError();
	}, [clearLastError]);

	// Auto-dismiss after timeout
	useEffect(() => {
		if (!lastError) return;
		const timer = setTimeout(clearLastError, AUTO_DISMISS_MS);
		return () => {
			clearTimeout(timer);
		};
	}, [lastError, clearLastError]);

	if (!lastError) return null;

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-4 py-1.5 text-xs font-medium",
				"bg-status-error-bg text-status-error-text",
			)}
		>
			{/* Error icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0"
				aria-label="Error"
				role="img"
			>
				<path
					fillRule="evenodd"
					d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
					clipRule="evenodd"
				/>
			</svg>

			{/* Error message */}
			<span className="flex-1 truncate">{lastError}</span>

			{/* Dismiss button */}
			<button
				type="button"
				onClick={handleDismiss}
				className="shrink-0 rounded p-0.5 transition-colors hover:bg-status-error-bg hover:text-status-error-text"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3"
					aria-label="Dismiss"
					role="img"
				>
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
				</svg>
			</button>
		</div>
	);
}
