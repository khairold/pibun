/**
 * ExtensionWidgets — renders extension widget blocks near the Composer.
 *
 * Extensions can set widgets via `setWidget` fire-and-forget method.
 * Widgets are keyed text blocks with configurable placement:
 * - `aboveEditor` — rendered above the Composer
 * - `belowEditor` — rendered below the Composer
 *
 * Each widget is a simple multi-line text block with an extension icon
 * and dismiss button. Hidden when no widgets exist.
 */

import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { ExtensionWidget } from "@/store/types";
import { useMemo } from "react";

/** Props for the ExtensionWidgetBar — filters by placement. */
interface ExtensionWidgetBarProps {
	placement: "aboveEditor" | "belowEditor";
}

/** Renders all extension widgets for a specific placement. */
export function ExtensionWidgetBar({ placement }: ExtensionWidgetBarProps) {
	const extensionWidgets = useStore((s) => s.extensionWidgets);
	const setExtensionWidget = useStore((s) => s.setExtensionWidget);

	// Filter widgets by placement — memoize to avoid new array on every render
	const filteredEntries = useMemo(() => {
		const entries: Array<[string, ExtensionWidget]> = [];
		for (const [key, widget] of extensionWidgets) {
			if (widget.placement === placement) {
				entries.push([key, widget]);
			}
		}
		return entries;
	}, [extensionWidgets, placement]);

	if (filteredEntries.length === 0) return null;

	return (
		<div
			className={cn(
				"flex flex-col gap-1 px-4 py-1.5",
				"border-border-secondary text-xs",
				placement === "aboveEditor" ? "border-b" : "border-t",
			)}
		>
			{filteredEntries.map(([key, widget]) => (
				<div
					key={key}
					className="group/widget flex items-start gap-2 rounded bg-surface-secondary/50 px-2.5 py-1.5"
				>
					{/* Extension puzzle piece icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="mt-0.5 h-3 w-3 shrink-0 text-text-tertiary"
						aria-label="Extension widget"
						role="img"
					>
						<path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v.5h2V5a1.5 1.5 0 0 1 3 0v.5h.5A1.5 1.5 0 0 1 14 7v1h-.5a1.5 1.5 0 0 0 0 3h.5v1.5a1.5 1.5 0 0 1-1.5 1.5H11v-.5a1.5 1.5 0 0 0-3 0v.5H6.5A1.5 1.5 0 0 1 5 12v-1.5h-.5a1.5 1.5 0 0 1 0-3H5V6H3.5A1.5 1.5 0 0 1 2 4.5v-1A1.5 1.5 0 0 1 3.5 2h1A1.5 1.5 0 0 1 6 3.5h-.5Z" />
					</svg>

					{/* Widget content — multi-line text */}
					<div className="min-w-0 flex-1 font-mono text-text-secondary">
						{widget.lines.map((line, i) => (
							<div
								key={`${key}-${String(i)}`}
								className="whitespace-pre-wrap break-words leading-relaxed"
							>
								{line || "\u00A0"}
							</div>
						))}
					</div>

					{/* Dismiss button — visible on hover */}
					<button
						type="button"
						onClick={() => setExtensionWidget(key, undefined, widget.placement)}
						className="shrink-0 rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-tertiary hover:text-text-secondary group-hover/widget:opacity-100"
						aria-label={`Dismiss widget ${key}`}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3 w-3"
							aria-label="Dismiss"
							role="img"
						>
							<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
						</svg>
					</button>
				</div>
			))}
		</div>
	);
}
