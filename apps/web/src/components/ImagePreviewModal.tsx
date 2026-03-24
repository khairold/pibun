/**
 * ImagePreviewModal — full-size image overlay.
 *
 * Opens when the user clicks an image (in markdown content or composer preview).
 * Closes on Escape, backdrop click, or close button.
 *
 * State is managed via `imagePreviewUrl` in UiSlice — set it to a URL to open,
 * null to close.
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { useCallback, useEffect } from "react";

export function ImagePreviewModal() {
	const imagePreviewUrl = useStore((s) => s.imagePreviewUrl);
	const imagePreviewAlt = useStore((s) => s.imagePreviewAlt);
	const setImagePreview = useStore((s) => s.setImagePreview);

	const close = useCallback(() => {
		setImagePreview(null);
	}, [setImagePreview]);

	// Close on Escape key
	useEffect(() => {
		if (!imagePreviewUrl) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				close();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [imagePreviewUrl, close]);

	if (!imagePreviewUrl) return null;

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center",
				"bg-surface-base/80 backdrop-blur-sm",
			)}
			onClick={close}
			onKeyDown={undefined}
		>
			{/* Close button — top right */}
			<button
				type="button"
				onClick={close}
				className={cn(
					"absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full",
					"bg-surface-secondary/80 text-text-secondary transition-colors",
					"hover:bg-surface-tertiary hover:text-text-primary",
				)}
				aria-label="Close preview"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-4 w-4"
					aria-label="Close"
					role="img"
				>
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
				</svg>
			</button>

			{/* Image — stop click propagation so clicking image doesn't close */}
			<img
				src={imagePreviewUrl}
				alt={imagePreviewAlt || "Image preview"}
				className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={undefined}
			/>
		</div>
	);
}
