/**
 * TabBar — horizontal tab strip for multi-session UI.
 *
 * Renders a scrollable row of session tabs with:
 * - Session name (truncated)
 * - Model badge (short model name in pill)
 * - Streaming indicator (pulsing blue dot while agent is processing)
 * - Close button (× icon, visible on hover or when active)
 * - "+" button to create a new tab
 *
 * Active tab is visually highlighted. Tabs are scrollable horizontally
 * when they overflow. Sits at the top of the main area in AppShell.
 */

import { cn } from "@/lib/cn";
import { useStore } from "@/store";
import type { SessionTab } from "@pibun/contracts";
import { type MouseEvent, memo, useCallback, useRef } from "react";

// ============================================================================
// Tab Item
// ============================================================================

interface TabItemProps {
	tab: SessionTab;
	isActive: boolean;
	onSwitch: (tabId: string) => void;
	onClose: (tabId: string) => void;
	canClose: boolean;
}

const TabItem = memo(function TabItem({
	tab,
	isActive,
	onSwitch,
	onClose,
	canClose,
}: TabItemProps) {
	const displayName = tab.name || "New Session";
	const modelName = tab.model ? shortModelName(tab.model.name) : null;

	const handleClose = useCallback(
		(e: MouseEvent) => {
			e.stopPropagation();
			onClose(tab.id);
		},
		[onClose, tab.id],
	);

	const handleClick = useCallback(() => {
		onSwitch(tab.id);
	}, [onSwitch, tab.id]);

	return (
		<div
			role="tab"
			tabIndex={0}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			className={cn(
				"group relative flex h-9 min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-neutral-800 px-3 text-left transition-colors",
				isActive
					? "bg-neutral-950 text-neutral-100"
					: "bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200",
			)}
			aria-selected={isActive}
			aria-label={displayName}
		>
			{/* Active tab top indicator */}
			{isActive && <span className="absolute inset-x-0 top-0 h-0.5 bg-blue-500" />}

			{/* Streaming indicator — pulsing blue dot */}
			{tab.isStreaming && (
				<span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
			)}

			{/* Session name */}
			<span className="min-w-0 truncate text-xs font-medium">{displayName}</span>

			{/* Model badge */}
			{modelName && (
				<span className="shrink-0 rounded bg-neutral-800 px-1 py-0.5 text-[10px] leading-none text-neutral-500">
					{modelName}
				</span>
			)}

			{/* Close button — visible on hover for inactive tabs, always for active */}
			{canClose && (
				<button
					type="button"
					tabIndex={-1}
					onClick={handleClose}
					className={cn(
						"ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
						isActive
							? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
							: "text-transparent group-hover:text-neutral-500 group-hover:hover:bg-neutral-800 group-hover:hover:text-neutral-300",
					)}
					aria-label={`Close ${displayName}`}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3"
						aria-label="Close tab"
						role="img"
					>
						<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
					</svg>
				</button>
			)}
		</div>
	);
});

// ============================================================================
// Helpers
// ============================================================================

/** Shorten a model name for display in a badge (e.g., "claude-opus-4-6" → "opus-4"). */
function shortModelName(name: string): string {
	// Strip common prefixes
	const stripped = name
		.replace(/^claude-/, "")
		.replace(/^gpt-/, "")
		.replace(/^gemini-/, "");

	// Truncate if still long
	if (stripped.length > 12) {
		return `${stripped.slice(0, 10)}…`;
	}
	return stripped;
}

// ============================================================================
// TabBar Component
// ============================================================================

export function TabBar() {
	const tabs = useStore((s) => s.tabs);
	const activeTabId = useStore((s) => s.activeTabId);
	const switchTab = useStore((s) => s.switchTab);
	const addTab = useStore((s) => s.addTab);
	const removeTab = useStore((s) => s.removeTab);
	const connectionStatus = useStore((s) => s.connectionStatus);

	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const isConnected = connectionStatus === "open";

	const handleAddTab = useCallback(() => {
		if (!isConnected) return;
		const tabId = addTab();
		switchTab(tabId);
	}, [addTab, switchTab, isConnected]);

	const handleCloseTab = useCallback(
		(tabId: string) => {
			removeTab(tabId);
		},
		[removeTab],
	);

	const handleSwitchTab = useCallback(
		(tabId: string) => {
			switchTab(tabId);
		},
		[switchTab],
	);

	// Don't render the tab bar if there are 0 or 1 tabs
	if (tabs.length <= 1) {
		return null;
	}

	return (
		<div className="flex h-9 shrink-0 items-stretch border-b border-neutral-800 bg-neutral-900">
			{/* Scrollable tab container */}
			<div
				ref={scrollContainerRef}
				className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
				style={{ scrollbarWidth: "none" }}
			>
				{tabs.map((tab) => (
					<TabItem
						key={tab.id}
						tab={tab}
						isActive={tab.id === activeTabId}
						onSwitch={handleSwitchTab}
						onClose={handleCloseTab}
						canClose={tabs.length > 1}
					/>
				))}
			</div>

			{/* New tab button */}
			<button
				type="button"
				onClick={handleAddTab}
				disabled={!isConnected}
				title="New Tab (Ctrl+T)"
				className={cn(
					"flex h-9 w-9 shrink-0 items-center justify-center border-l border-neutral-800 transition-colors",
					isConnected
						? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
						: "cursor-not-allowed text-neutral-700",
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="New tab"
					role="img"
				>
					<path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
				</svg>
			</button>
		</div>
	);
}
