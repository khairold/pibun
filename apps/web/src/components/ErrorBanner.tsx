/**
 * ErrorBanner + HealthBanner — dismissible error/health banners.
 *
 * ErrorBanner: Shows a red banner with error message, auto-clears after 10 seconds.
 * HealthBanner: Shows a persistent amber/red banner for provider health issues
 * (Pi process crash, session start failure, repeated model errors).
 * Does NOT auto-dismiss — must be dismissed manually or cleared by successful activity.
 */

import { startNewSession } from "@/lib/sessionActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ProviderHealthIssue } from "@/store/types";
import { useCallback, useEffect } from "react";

/** Auto-dismiss timeout for ErrorBanner in milliseconds. */
const AUTO_DISMISS_MS = 10_000;

// ============================================================================
// ErrorBanner — transient errors (auto-dismiss after 10s)
// ============================================================================

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

// ============================================================================
// HealthBanner — persistent provider health issues
// ============================================================================

/** Label and icon style per health issue kind. */
const HEALTH_LABELS: Record<
	ProviderHealthIssue["kind"],
	{ label: string; severity: "error" | "warning" }
> = {
	process_crashed: {
		label: "Pi process crashed",
		severity: "error",
	},
	session_start_failed: {
		label: "Session failed to start",
		severity: "error",
	},
	repeated_model_errors: {
		label: "Model errors",
		severity: "warning",
	},
};

export function HealthBanner() {
	const health = useStore((s) => s.providerHealth);
	const setProviderHealth = useStore((s) => s.setProviderHealth);

	const handleDismiss = useCallback(() => {
		setProviderHealth(null);
	}, [setProviderHealth]);

	const handleRetry = useCallback(() => {
		setProviderHealth(null);
		startNewSession().catch((err: unknown) => {
			console.error("[HealthBanner] Failed to start new session:", err);
		});
	}, [setProviderHealth]);

	if (!health) return null;

	const { label, severity } = HEALTH_LABELS[health.kind];
	const isError = severity === "error";

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-4 py-2 text-xs font-medium",
				isError
					? "bg-status-error-bg text-status-error-text"
					: "bg-status-warning-bg text-status-warning-text",
			)}
		>
			{/* Warning/Error icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0"
				aria-label={label}
				role="img"
			>
				{isError ? (
					<path
						fillRule="evenodd"
						d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
						clipRule="evenodd"
					/>
				) : (
					<path
						fillRule="evenodd"
						d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l5.082 9.524c.633 1.187-.189 2.632-1.543 2.632H2.918c-1.354 0-2.176-1.445-1.543-2.632l5.082-9.524ZM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
						clipRule="evenodd"
					/>
				)}
			</svg>

			{/* Label + message */}
			<span className="font-semibold">{label}:</span>
			<span className="min-w-0 flex-1 truncate">{health.message}</span>

			{/* Retry button — start a new session */}
			{(health.kind === "process_crashed" || health.kind === "session_start_failed") && (
				<button
					type="button"
					onClick={handleRetry}
					className={cn(
						"shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors",
						isError
							? "bg-status-error-text/10 hover:bg-status-error-text/20"
							: "bg-status-warning-text/10 hover:bg-status-warning-text/20",
					)}
				>
					New Session
				</button>
			)}

			{/* Dismiss button */}
			<button
				type="button"
				onClick={handleDismiss}
				className={cn(
					"shrink-0 rounded p-0.5 transition-colors",
					isError ? "hover:bg-status-error-text/10" : "hover:bg-status-warning-text/10",
				)}
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
