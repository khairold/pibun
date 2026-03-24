/**
 * UpdateBanner — shows auto-update notifications from the desktop main process.
 *
 * Renders a dismissible banner at the top of the app when an update is
 * available, downloading, or ready to install. The user can trigger the
 * update installation by clicking "Restart to Update".
 *
 * Only visible in desktop mode — standalone browser mode never receives
 * `app.update` pushes.
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { useCallback } from "react";

export function UpdateBanner() {
	const updateStatus = useStore((s) => s.updateStatus);
	const updateMessage = useStore((s) => s.updateMessage);
	const updateVersion = useStore((s) => s.updateVersion);
	const updateProgress = useStore((s) => s.updateProgress);
	const dismissUpdate = useStore((s) => s.dismissUpdate);

	const handleApplyUpdate = useCallback(() => {
		getTransport()
			.request("app.applyUpdate")
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				useStore.getState().setLastError(`Failed to apply update: ${msg}`);
			});
	}, []);

	const handleCheckForUpdates = useCallback(() => {
		getTransport()
			.request("app.checkForUpdates")
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				useStore.getState().setLastError(`Failed to check for updates: ${msg}`);
			});
	}, []);

	// Don't render if no update activity
	if (!updateStatus || updateStatus === "no-update") {
		return null;
	}

	const isReady = updateStatus === "update-ready";
	const isDownloading = updateStatus === "downloading" || updateStatus === "download-progress";
	const isError = updateStatus === "error";
	const isChecking = updateStatus === "checking";

	return (
		<div
			className={cn(
				"flex items-center gap-3 px-4 py-2 text-sm",
				isReady &&
					"bg-status-success-bg text-status-success-text border-b border-status-success-border",
				isDownloading &&
					"bg-status-info-bg text-status-info-text border-b border-accent-primary/50",
				isError && "bg-status-error-bg text-status-error-text border-b border-status-error-border",
				isChecking && "bg-surface-secondary text-text-secondary border-b border-border-secondary",
				updateStatus === "update-available" &&
					"bg-status-warning-bg text-status-warning-text border-b border-status-warning/50",
				updateStatus === "applying" &&
					"bg-status-success-bg text-status-success-text border-b border-status-success-border",
			)}
		>
			{/* Icon */}
			<svg
				aria-label="Update"
				role="img"
				className="h-4 w-4 shrink-0"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11ZM8 4a.75.75 0 0 1 .75.75v3.69l2.03 2.03a.75.75 0 1 1-1.06 1.06l-2.25-2.25A.75.75 0 0 1 7.25 8.75V4.75A.75.75 0 0 1 8 4Z" />
			</svg>

			{/* Message */}
			<span className="flex-1 truncate">
				{updateMessage}
				{isDownloading && updateProgress != null && (
					<span className="ml-2 text-xs opacity-75">({updateProgress}%)</span>
				)}
			</span>

			{/* Progress bar */}
			{isDownloading && updateProgress != null && (
				<div className="w-24 h-1.5 bg-accent-primary/20 rounded-full overflow-hidden">
					<div
						className="h-full bg-accent-text rounded-full transition-all duration-300"
						style={{ width: `${updateProgress}%` }}
					/>
				</div>
			)}

			{/* Actions */}
			{isReady && (
				<button
					type="button"
					onClick={handleApplyUpdate}
					className="shrink-0 rounded bg-status-success px-3 py-1 text-xs font-medium text-text-on-accent hover:bg-status-success/80 transition-colors"
				>
					Restart to Update{updateVersion ? ` v${updateVersion}` : ""}
				</button>
			)}

			{isError && (
				<button
					type="button"
					onClick={handleCheckForUpdates}
					className="shrink-0 rounded bg-surface-tertiary px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-tertiary/80 transition-colors"
				>
					Retry
				</button>
			)}

			{/* Dismiss button */}
			<button
				type="button"
				onClick={dismissUpdate}
				className="shrink-0 rounded p-0.5 hover:bg-text-on-accent/10 transition-colors"
				aria-label="Dismiss update notification"
			>
				<svg
					aria-label="Close"
					role="img"
					className="h-3.5 w-3.5"
					viewBox="0 0 16 16"
					fill="currentColor"
				>
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
				</svg>
			</button>
		</div>
	);
}
