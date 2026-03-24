/**
 * ToastContainer — renders stacked toast notifications in the bottom-right.
 *
 * Toasts are triggered by extension `notify` events. They auto-dismiss
 * after 5 seconds and can be manually dismissed. Supports info/warning/error
 * severity levels with corresponding colors and icons.
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Toast } from "@/store/types";
import React, { useCallback } from "react";

// ============================================================================
// Icons (inline SVGs for each severity level)
// ============================================================================

function InfoIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-4 w-4 shrink-0"
			aria-label="Info"
			role="img"
		>
			<path
				fillRule="evenodd"
				d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function WarningIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-4 w-4 shrink-0"
			aria-label="Warning"
			role="img"
		>
			<path
				fillRule="evenodd"
				d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function ErrorIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 16 16"
			fill="currentColor"
			className="h-4 w-4 shrink-0"
			aria-label="Error"
			role="img"
		>
			<path
				fillRule="evenodd"
				d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

// ============================================================================
// Style maps
// ============================================================================

const LEVEL_STYLES: Record<Toast["level"], string> = {
	info: "border-status-info bg-status-info-bg text-status-info-text",
	warning: "border-status-warning bg-status-warning-bg text-status-warning-text",
	error: "border-status-error bg-status-error-bg text-status-error-text",
};

const LEVEL_ICONS: Record<Toast["level"], React.ReactNode> = {
	info: <InfoIcon />,
	warning: <WarningIcon />,
	error: <ErrorIcon />,
};

const DISMISS_STYLES: Record<Toast["level"], string> = {
	info: "hover:bg-status-info-bg hover:text-status-info-text",
	warning: "hover:bg-status-warning-bg hover:text-status-warning-text",
	error: "hover:bg-status-error-bg hover:text-status-error-text",
};

// ============================================================================
// ToastItem
// ============================================================================

interface ToastItemProps {
	toast: Toast;
	onDismiss: (id: string) => void;
}

const ToastItem = React.memo(function ToastItem({ toast, onDismiss }: ToastItemProps) {
	const handleDismiss = useCallback(() => {
		onDismiss(toast.id);
	}, [toast.id, onDismiss]);

	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg",
				"animate-in slide-in-from-right-full fade-in duration-200",
				"max-w-sm",
				LEVEL_STYLES[toast.level],
			)}
			role="alert"
		>
			{/* Severity icon */}
			<span className="mt-0.5">{LEVEL_ICONS[toast.level]}</span>

			{/* Message */}
			<p className="flex-1 text-sm leading-snug">{toast.message}</p>

			{/* Dismiss button */}
			<button
				type="button"
				onClick={handleDismiss}
				className={cn("shrink-0 rounded p-0.5 transition-colors", DISMISS_STYLES[toast.level])}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Dismiss"
					role="img"
				>
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
				</svg>
			</button>
		</div>
	);
});

// ============================================================================
// ToastContainer
// ============================================================================

export function ToastContainer() {
	const toasts = useStore((s) => s.toasts);
	const removeToast = useStore((s) => s.removeToast);

	if (toasts.length === 0) return null;

	return (
		<div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col-reverse gap-2">
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastItem toast={toast} onDismiss={removeToast} />
				</div>
			))}
		</div>
	);
}
