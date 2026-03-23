/**
 * ThinkingSelector — dropdown to pick the thinking/reasoning level.
 *
 * Shows the current thinking level as a trigger button. On click, opens
 * a dropdown listing all available levels (off → xhigh). Selecting a
 * level calls `session.setThinking` to switch.
 *
 * Unlike ModelSelector, the level list is static — no server fetch needed.
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { PiThinkingLevel } from "@pibun/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Ordered list of thinking levels from lowest to highest. */
const THINKING_LEVELS: readonly PiThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
];

/** Display labels and descriptions for each thinking level. */
const LEVEL_INFO: Record<PiThinkingLevel, { label: string; description: string }> = {
	off: { label: "Off", description: "No reasoning — fastest, cheapest" },
	minimal: { label: "Minimal", description: "Very brief reasoning" },
	low: { label: "Low", description: "Light reasoning for simple tasks" },
	medium: { label: "Medium", description: "Balanced reasoning (default)" },
	high: { label: "High", description: "Deep reasoning for complex tasks" },
	xhigh: { label: "Extra High", description: "Maximum reasoning depth" },
};

/** Extract a user-friendly error message. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

// ============================================================================
// Component
// ============================================================================

export function ThinkingSelector() {
	const currentLevel = useStore((s) => s.thinkingLevel);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const setThinkingLevel = useStore((s) => s.setThinkingLevel);
	const setLastError = useStore((s) => s.setLastError);

	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const isConnected = connectionStatus === "open";
	const hasSession = sessionId !== null;

	// ── Select a level ────────────────────────────────────────────────
	const handleSelect = useCallback(
		async (level: PiThinkingLevel) => {
			setIsOpen(false);
			if (!hasSession) return;
			if (level === currentLevel) return;

			// Optimistically update the store
			const previousLevel = currentLevel;
			setThinkingLevel(level);
			try {
				await getTransport().request("session.setThinking", { level });
			} catch (err) {
				console.error("[ThinkingSelector] Failed to set thinking level:", err);
				setLastError(`Failed to set thinking level: ${errorMessage(err)}`);
				// Revert optimistic update
				setThinkingLevel(previousLevel);
			}
		},
		[hasSession, currentLevel, setThinkingLevel, setLastError],
	);

	// ── Toggle dropdown ───────────────────────────────────────────────
	const handleToggle = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, []);

	// ── Click-outside to close ────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// ── Escape to close ───────────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// ── Display label ─────────────────────────────────────────────────
	const info = LEVEL_INFO[currentLevel];
	const triggerLabel = info.label;

	return (
		<div className="relative">
			{/* Trigger button */}
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				disabled={!isConnected || !hasSession}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
					"border border-neutral-700 bg-neutral-900 transition-colors",
					isConnected && hasSession
						? "text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
						: "cursor-not-allowed text-neutral-600",
					isOpen && "border-neutral-500 bg-neutral-800",
				)}
				title="Set thinking level"
			>
				{/* Brain icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5 shrink-0"
					aria-label="Thinking level"
					role="img"
				>
					<path d="M10 3.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V4H4.5A1.5 1.5 0 0 0 3 5.5v6A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 11.5 4H10v-.5zM7 4h2v-.5H7V4zm-2.5 1h7a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5z" />
					<path d="M5.5 7a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5z" />
				</svg>

				<span>{triggerLabel}</span>

				{/* Chevron */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")}
					aria-label="Toggle thinking level list"
					role="img"
				>
					<path
						fillRule="evenodd"
						d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
						clipRule="evenodd"
					/>
				</svg>
			</button>

			{/* Dropdown panel */}
			{isOpen && (
				<div
					ref={dropdownRef}
					className={cn(
						"absolute left-0 top-full z-50 mt-1 w-64",
						"rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl",
					)}
				>
					{/* Header */}
					<div className="border-b border-neutral-800 px-3 py-2">
						<span className="text-xs font-medium text-neutral-400">Thinking Level</span>
					</div>

					{/* Level list */}
					<div className="py-1">
						{THINKING_LEVELS.map((level) => {
							const levelInfo = LEVEL_INFO[level];
							const isActive = level === currentLevel;
							return (
								<button
									key={level}
									type="button"
									onClick={() => handleSelect(level)}
									className={cn(
										"flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
										isActive
											? "bg-blue-600/15 text-blue-400"
											: "text-neutral-300 hover:bg-neutral-800",
									)}
								>
									{/* Active indicator */}
									<span
										className={cn(
											"h-1.5 w-1.5 shrink-0 rounded-full",
											isActive ? "bg-blue-400" : "bg-transparent",
										)}
									/>

									{/* Level info */}
									<div className="min-w-0 flex-1">
										<div className="text-xs font-medium">{levelInfo.label}</div>
										<div className="mt-0.5 text-[10px] text-neutral-500">
											{levelInfo.description}
										</div>
									</div>

									{/* Intensity bar */}
									<div className="flex shrink-0 gap-0.5">
										{THINKING_LEVELS.map((l, i) => {
											const levelIndex = THINKING_LEVELS.indexOf(level);
											return (
												<div
													key={l}
													className={cn(
														"h-2 w-1 rounded-sm",
														i <= levelIndex
															? isActive
																? "bg-blue-400"
																: "bg-neutral-500"
															: "bg-neutral-800",
													)}
												/>
											);
										})}
									</div>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
