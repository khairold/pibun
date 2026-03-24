/**
 * TerminalPane — embedded terminal with xterm.js, resizable splitter, and split panes.
 *
 * Renders as a bottom panel below ChatView, similar to VS Code's terminal panel.
 * Features:
 * - xterm.js terminal instances with fit addon for auto-resize
 * - Multiple terminal tabs with split pane grouping
 * - Split current terminal horizontally (side-by-side) with independent resize handles
 * - Resizable panel height via drag handle
 * - Theme-matched colors (semantic theme tokens)
 * - Terminal data flows: xterm onData → writeTerminal → server → PTY stdin
 *                        PTY stdout → server → terminal.data push → xterm.write
 */

import { closeTerminal, createTerminal, splitTerminal } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { TerminalTab } from "@/store/types";
import { MAX_TERMINALS_PER_GROUP } from "@/store/types";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { TerminalInstance } from "./TerminalInstance";

// ============================================================================
// Terminal Tab Bar
// ============================================================================

interface TerminalTabItemProps {
	tab: TerminalTab;
	isActive: boolean;
	isGroupVisible: boolean;
	onSelect: (tabId: string) => void;
	onClose: (tabId: string) => void;
}

const TerminalTabItem = memo(function TerminalTabItem({
	tab,
	isActive,
	isGroupVisible,
	onSelect,
	onClose,
}: TerminalTabItemProps) {
	return (
		<div
			role="tab"
			tabIndex={0}
			aria-selected={isActive}
			className={cn(
				"flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer select-none border-r border-border-secondary transition-colors",
				isActive
					? "bg-surface-primary text-text-primary"
					: isGroupVisible
						? "bg-surface-primary/70 text-text-secondary"
						: "bg-surface-base text-text-tertiary hover:text-text-secondary hover:bg-surface-primary/50",
			)}
			onClick={() => onSelect(tab.id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(tab.id);
				}
			}}
		>
			{/* Terminal icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3 w-3 shrink-0"
				aria-label="Terminal"
				role="img"
			>
				<path d="M3.5 5.5l3 2.5-3 2.5V5.5zM8 10h4.5v1H8v-1z" />
			</svg>

			{/* Tab name */}
			<span className="truncate max-w-[100px]">{tab.name}</span>

			{/* Running/exited indicator */}
			{tab.isRunning ? (
				<span className="h-1.5 w-1.5 rounded-full bg-status-success shrink-0" title="Running" />
			) : (
				<span className="h-1.5 w-1.5 rounded-full bg-text-muted shrink-0" title="Exited" />
			)}

			{/* Close button */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose(tab.id);
				}}
				className="ml-0.5 rounded p-0.5 text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
				title="Close terminal"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3"
					aria-label="Close terminal"
					role="img"
				>
					<path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22z" />
				</svg>
			</button>
		</div>
	);
});

// ============================================================================
// Panel Height Resize Handle (vertical — top of panel)
// ============================================================================

interface PanelResizeHandleProps {
	onResize: (deltaY: number) => void;
}

function PanelResizeHandle({ onResize }: PanelResizeHandleProps) {
	const isDragging = useRef(false);
	const lastY = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isDragging.current = true;
			lastY.current = e.clientY;

			const handleMouseMove = (me: MouseEvent) => {
				if (!isDragging.current) return;
				const deltaY = lastY.current - me.clientY;
				lastY.current = me.clientY;
				onResize(deltaY);
			};

			const handleMouseUp = () => {
				isDragging.current = false;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
		},
		[onResize],
	);

	return (
		<div
			className="h-1 cursor-row-resize bg-surface-secondary hover:bg-accent-primary-hover transition-colors shrink-0"
			onMouseDown={handleMouseDown}
			title="Drag to resize terminal"
		/>
	);
}

// ============================================================================
// Split Pane Resize Handle (horizontal — between split panes)
// ============================================================================

interface SplitResizeHandleProps {
	/** Index of the divider between pane[index] and pane[index+1]. */
	index: number;
	/** Callback to adjust sizes: positive deltaX grows left pane, shrinks right. */
	onResize: (index: number, deltaX: number) => void;
}

function SplitResizeHandle({ index, onResize }: SplitResizeHandleProps) {
	const isDragging = useRef(false);
	const lastX = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isDragging.current = true;
			lastX.current = e.clientX;

			const handleMouseMove = (me: MouseEvent) => {
				if (!isDragging.current) return;
				const deltaX = me.clientX - lastX.current;
				lastX.current = me.clientX;
				onResize(index, deltaX);
			};

			const handleMouseUp = () => {
				isDragging.current = false;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[index, onResize],
	);

	return (
		<div
			className="w-1 cursor-col-resize bg-border-secondary hover:bg-accent-primary-hover transition-colors shrink-0"
			onMouseDown={handleMouseDown}
			title="Drag to resize split"
		/>
	);
}

// ============================================================================
// Split Terminal Group — renders multiple terminals side-by-side
// ============================================================================

/** Minimum width fraction for a pane (prevents collapsing to zero). */
const MIN_PANE_FRACTION = 0.15;

interface SplitTerminalGroupProps {
	/** Terminals in this group (1 = single, 2+ = split view). */
	tabs: TerminalTab[];
	/** Which terminal tab is currently active (for focus). */
	activeTerminalTabId: string | null;
	/** Called when a pane is clicked to make it active. */
	onActivate: (tabId: string) => void;
}

function SplitTerminalGroup({ tabs, activeTerminalTabId, onActivate }: SplitTerminalGroupProps) {
	// Track pane width fractions (each starts at 1/N). Stored as fractions summing to 1.
	const [paneFractions, setPaneFractions] = useState<number[]>(() =>
		tabs.map(() => 1 / tabs.length),
	);
	const containerRef = useRef<HTMLDivElement>(null);

	// Note: paneFractions may go out of sync when tabs are added/removed.
	// The `fractions` fallback below handles this — if lengths don't match,
	// it falls back to equal distribution. The `key={activeGroupId}` on the
	// parent SplitTerminalGroup ensures re-mount when the group changes.

	// Resize handler: adjust adjacent pane fractions
	const handleSplitResize = useCallback((dividerIndex: number, deltaX: number) => {
		if (!containerRef.current) return;
		const containerWidth = containerRef.current.offsetWidth;
		if (containerWidth <= 0) return;

		const deltaFraction = deltaX / containerWidth;

		setPaneFractions((prev) => {
			const next = [...prev];
			const left = next[dividerIndex];
			const right = next[dividerIndex + 1];
			if (left === undefined || right === undefined) return prev;

			const newLeft = left + deltaFraction;
			const newRight = right - deltaFraction;

			// Enforce minimum widths
			if (newLeft < MIN_PANE_FRACTION || newRight < MIN_PANE_FRACTION) return prev;

			next[dividerIndex] = newLeft;
			next[dividerIndex + 1] = newRight;
			return next;
		});
	}, []);

	// Single terminal — no split chrome
	if (tabs.length === 1) {
		const tab = tabs[0];
		if (!tab) return null;
		return (
			<div className="h-full w-full">
				<TerminalInstance
					terminalId={tab.terminalId}
					isActive={tab.id === activeTerminalTabId}
					terminalLabel={tab.name}
				/>
			</div>
		);
	}

	// Ensure fractions match tab count (handles dynamic changes)
	const fractions =
		paneFractions.length === tabs.length ? paneFractions : tabs.map(() => 1 / tabs.length);

	return (
		<div ref={containerRef} className="flex h-full w-full min-w-0">
			{tabs.map((tab, i) => {
				const isLast = i === tabs.length - 1;
				const fraction = fractions[i] ?? 1 / tabs.length;

				return (
					<div key={tab.id} className="flex min-w-0" style={{ flex: `${String(fraction)} 1 0%` }}>
						{/* Terminal pane */}
						<div
							className={cn(
								"flex-1 min-w-0",
								tab.id === activeTerminalTabId ? "ring-1 ring-inset ring-accent-primary/30" : "",
							)}
							onMouseDown={() => {
								if (tab.id !== activeTerminalTabId) {
									onActivate(tab.id);
								}
							}}
						>
							<TerminalInstance
								terminalId={tab.terminalId}
								isActive={tab.id === activeTerminalTabId}
								terminalLabel={tab.name}
							/>
						</div>

						{/* Resize handle between panes */}
						{!isLast && <SplitResizeHandle index={i} onResize={handleSplitResize} />}
					</div>
				);
			})}
		</div>
	);
}

// ============================================================================
// Main TerminalPane
// ============================================================================

/** Minimum and maximum height constraints for the terminal panel. */
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7; // 70% of viewport
const DEFAULT_HEIGHT = 280;

export function TerminalPane() {
	const terminalPanelOpen = useStore((s) => s.terminalPanelOpen);
	const allTerminalTabs = useStore((s) => s.terminalTabs);
	const activeTabId = useStore((s) => s.activeTabId);
	const activeTerminalTabId = useStore((s) => s.activeTerminalTabId);
	const setActiveTerminalTabId = useStore((s) => s.setActiveTerminalTabId);
	const setTerminalPanelOpen = useStore((s) => s.setTerminalPanelOpen);

	const heightRef = useRef(DEFAULT_HEIGHT);
	const panelRef = useRef<HTMLDivElement>(null);

	// Filter terminals to only show the current session tab's terminals in the tab bar
	const terminalTabs = useMemo(
		() => allTerminalTabs.filter((t) => t.ownerTabId === activeTabId),
		[allTerminalTabs, activeTabId],
	);

	// Terminals from other session tabs — kept mounted but hidden
	const otherTabTerminals = useMemo(
		() => allTerminalTabs.filter((t) => t.ownerTabId !== activeTabId),
		[allTerminalTabs, activeTabId],
	);

	// Derive the active group's tabs
	const activeGroup = useMemo(() => {
		if (!activeTerminalTabId) return [];
		const activeTab = terminalTabs.find((t) => t.id === activeTerminalTabId);
		if (!activeTab) return [];
		return terminalTabs.filter((t) => t.groupId === activeTab.groupId);
	}, [terminalTabs, activeTerminalTabId]);

	// Derive the active group ID for highlighting tabs in the bar
	const activeGroupId = useMemo(() => {
		if (!activeTerminalTabId) return null;
		const activeTab = terminalTabs.find((t) => t.id === activeTerminalTabId);
		return activeTab?.groupId ?? null;
	}, [terminalTabs, activeTerminalTabId]);

	// Check if split limit is reached for the active group
	const splitLimitReached = activeGroup.length >= MAX_TERMINALS_PER_GROUP;

	// Collect unique group IDs to show group separators in the tab bar
	const tabGroupInfo = useMemo(() => {
		const groupOrder: string[] = [];
		const groupSet = new Set<string>();
		for (const tab of terminalTabs) {
			if (!groupSet.has(tab.groupId)) {
				groupSet.add(tab.groupId);
				groupOrder.push(tab.groupId);
			}
		}
		return { groupOrder, groupSet };
	}, [terminalTabs]);

	const handleResize = useCallback((deltaY: number) => {
		const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
		heightRef.current = Math.max(MIN_HEIGHT, Math.min(maxHeight, heightRef.current + deltaY));
		if (panelRef.current) {
			panelRef.current.style.height = `${String(heightRef.current)}px`;
		}
	}, []);

	const handleTabSelect = useCallback(
		(tabId: string) => {
			setActiveTerminalTabId(tabId);
		},
		[setActiveTerminalTabId],
	);

	const handleTabClose = useCallback((tabId: string) => {
		closeTerminal(tabId).catch((err: unknown) => {
			console.error("[TerminalPane] Failed to close terminal:", err);
		});
	}, []);

	const handleNewTerminal = useCallback(() => {
		createTerminal().catch((err: unknown) => {
			console.error("[TerminalPane] Failed to create terminal:", err);
		});
	}, []);

	const handleSplitTerminal = useCallback(() => {
		splitTerminal().catch((err: unknown) => {
			console.error("[TerminalPane] Failed to split terminal:", err);
		});
	}, []);

	const handleClosePanel = useCallback(() => {
		setTerminalPanelOpen(false);
	}, [setTerminalPanelOpen]);

	if (!terminalPanelOpen) return null;

	// Build tab bar items with group separators
	const tabBarItems: Array<{ type: "tab"; tab: TerminalTab } | { type: "separator" }> = [];
	let prevGroupId: string | null = null;
	for (const tab of terminalTabs) {
		if (prevGroupId !== null && tab.groupId !== prevGroupId && tabGroupInfo.groupOrder.length > 1) {
			tabBarItems.push({ type: "separator" });
		}
		tabBarItems.push({ type: "tab", tab });
		prevGroupId = tab.groupId;
	}

	return (
		<div
			ref={panelRef}
			className="flex flex-col border-t border-border-secondary bg-surface-base shrink-0"
			style={{ height: DEFAULT_HEIGHT }}
		>
			{/* Resize handle */}
			<PanelResizeHandle onResize={handleResize} />

			{/* Terminal tab bar */}
			<div className="flex items-center border-b border-border-secondary bg-surface-base shrink-0">
				{/* Tab list */}
				<div className="flex items-center overflow-x-auto" role="tablist">
					{tabBarItems.map((item, i) => {
						if (item.type === "separator") {
							return (
								<div key={`sep-${String(i)}`} className="mx-0.5 h-4 w-px bg-border-secondary" />
							);
						}
						const { tab } = item;
						return (
							<TerminalTabItem
								key={tab.id}
								tab={tab}
								isActive={tab.id === activeTerminalTabId}
								isGroupVisible={tab.groupId === activeGroupId && tab.id !== activeTerminalTabId}
								onSelect={handleTabSelect}
								onClose={handleTabClose}
							/>
						);
					})}
				</div>

				{/* Split terminal button */}
				<button
					type="button"
					onClick={handleSplitTerminal}
					disabled={splitLimitReached || terminalTabs.length === 0}
					className={cn(
						"px-2 py-1.5 transition-colors",
						splitLimitReached || terminalTabs.length === 0
							? "text-text-muted cursor-not-allowed opacity-50"
							: "text-text-tertiary hover:text-text-secondary",
					)}
					title={
						splitLimitReached
							? `Split Terminal (max ${String(MAX_TERMINALS_PER_GROUP)} per group)`
							: "Split Terminal"
					}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5"
						aria-label="Split terminal"
						role="img"
					>
						<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H7.5V3H3.5zm5 0v10h4a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5H8.5z" />
					</svg>
				</button>

				{/* New terminal button */}
				<button
					type="button"
					onClick={handleNewTerminal}
					className="px-2 py-1.5 text-text-tertiary transition-colors hover:text-text-secondary"
					title="New Terminal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5"
						aria-label="New terminal"
						role="img"
					>
						<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5z" />
					</svg>
				</button>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Close panel button */}
				<button
					type="button"
					onClick={handleClosePanel}
					className="px-2 py-1.5 text-text-tertiary transition-colors hover:text-text-secondary"
					title="Close terminal panel"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5"
						aria-label="Close panel"
						role="img"
					>
						<path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22z" />
					</svg>
				</button>
			</div>

			{/* Terminal content area */}
			<div className="relative flex-1 min-h-0">
				{terminalTabs.length === 0 ? (
					<div className="flex h-full items-center justify-center text-text-muted text-sm">
						<button
							type="button"
							onClick={handleNewTerminal}
							className="flex items-center gap-2 rounded-md px-4 py-2 text-text-secondary transition-colors hover:bg-surface-primary hover:text-text-primary"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className="h-4 w-4"
								aria-label="Terminal"
								role="img"
							>
								<path d="M3.5 5.5l3 2.5-3 2.5V5.5zM8 10h4.5v1H8v-1z" />
							</svg>
							Create a terminal
						</button>
					</div>
				) : (
					<>
						{/* Active group: render all tabs in the group (split view) */}
						{activeGroup.length > 0 && (
							<div className="absolute inset-0">
								<SplitTerminalGroup
									key={activeGroupId ?? "none"}
									tabs={activeGroup}
									activeTerminalTabId={activeTerminalTabId}
									onActivate={handleTabSelect}
								/>
							</div>
						)}
						{/* Hidden tabs: keep mounted but invisible for other groups in this tab */}
						{terminalTabs
							.filter((tab) => tab.groupId !== activeGroupId)
							.map((tab) => (
								<div key={tab.id} className="absolute inset-0 hidden">
									<TerminalInstance
										terminalId={tab.terminalId}
										isActive={false}
										terminalLabel={tab.name}
									/>
								</div>
							))}
					</>
				)}
				{/* Hidden terminals from other session tabs — stay mounted to preserve xterm state */}
				{otherTabTerminals.map((tab) => (
					<div key={tab.id} className="absolute inset-0 hidden">
						<TerminalInstance
							terminalId={tab.terminalId}
							isActive={false}
							terminalLabel={tab.name}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
