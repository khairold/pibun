/**
 * StatusBar — persistent extension status indicators.
 *
 * Renders a thin bar showing status indicators set by extensions via
 * `setStatus`. Each status is keyed by `statusKey` — setting statusText
 * to empty/undefined removes it. Hidden when no statuses are active.
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";

export function StatusBar() {
	const statuses = useStore((s) => s.statuses);

	if (statuses.size === 0) return null;

	const entries = Array.from(statuses.entries());

	return (
		<div
			className={cn(
				"flex items-center gap-3 border-t border-border-secondary px-4 py-1",
				"bg-surface-primary/80 text-xs text-text-secondary",
			)}
		>
			{/* Extension icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3 w-3 shrink-0 text-text-tertiary"
				aria-label="Extension status"
				role="img"
			>
				<path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v.5h2V5a1.5 1.5 0 0 1 3 0v.5h.5A1.5 1.5 0 0 1 14 7v1h-.5a1.5 1.5 0 0 0 0 3h.5v1.5a1.5 1.5 0 0 1-1.5 1.5H11v-.5a1.5 1.5 0 0 0-3 0v.5H6.5A1.5 1.5 0 0 1 5 12v-1.5h-.5a1.5 1.5 0 0 1 0-3H5V6H3.5A1.5 1.5 0 0 1 2 4.5v-1A1.5 1.5 0 0 1 3.5 2h1A1.5 1.5 0 0 1 6 3.5h-.5Z" />
			</svg>

			{/* Status entries separated by dots */}
			{entries.map(([key, text], index) => (
				<span key={key} className="flex items-center gap-1.5">
					{index > 0 && <span className="text-text-muted">·</span>}
					<span className="inline-flex items-center gap-1">
						{/* Pulsing dot to indicate active status */}
						<span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-primary" />
						<span className="text-text-secondary">{text}</span>
					</span>
				</span>
			))}
		</div>
	);
}
