/**
 * TerminalPane — embedded terminal with xterm.js and resizable splitter.
 *
 * Renders as a bottom panel below ChatView, similar to VS Code's terminal panel.
 * Features:
 * - xterm.js terminal instance with fit addon for auto-resize
 * - Multiple terminal tabs
 * - Resizable via drag handle
 * - Theme-matched colors (semantic theme tokens)
 * - Terminal data flows: xterm onData → writeTerminal → server → PTY stdin
 *                        PTY stdout → server → terminal.data push → xterm.write
 */

import { cn } from "@/lib/cn";
import { closeTerminal, createTerminal } from "@/lib/terminalActions";
import { useStore } from "@/store";
import type { TerminalTab } from "@/store/types";
import { memo, useCallback, useRef } from "react";
import { TerminalInstance } from "./TerminalInstance";

// ============================================================================
// Terminal Tab Bar
// ============================================================================

interface TerminalTabItemProps {
	tab: TerminalTab;
	isActive: boolean;
	onSelect: (tabId: string) => void;
	onClose: (tabId: string) => void;
}

const TerminalTabItem = memo(function TerminalTabItem({
	tab,
	isActive,
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
// Resize Handle
// ============================================================================

interface ResizeHandleProps {
	onResize: (deltaY: number) => void;
}

function ResizeHandle({ onResize }: ResizeHandleProps) {
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
// Main TerminalPane
// ============================================================================

/** Minimum and maximum height constraints for the terminal panel. */
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7; // 70% of viewport
const DEFAULT_HEIGHT = 280;

export function TerminalPane() {
	const terminalPanelOpen = useStore((s) => s.terminalPanelOpen);
	const terminalTabs = useStore((s) => s.terminalTabs);
	const activeTerminalTabId = useStore((s) => s.activeTerminalTabId);
	const setActiveTerminalTabId = useStore((s) => s.setActiveTerminalTabId);
	const setTerminalPanelOpen = useStore((s) => s.setTerminalPanelOpen);

	const heightRef = useRef(DEFAULT_HEIGHT);
	const panelRef = useRef<HTMLDivElement>(null);

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

	const handleClosePanel = useCallback(() => {
		setTerminalPanelOpen(false);
	}, [setTerminalPanelOpen]);

	if (!terminalPanelOpen) return null;

	return (
		<div
			ref={panelRef}
			className="flex flex-col border-t border-border-secondary bg-surface-base shrink-0"
			style={{ height: DEFAULT_HEIGHT }}
		>
			{/* Resize handle */}
			<ResizeHandle onResize={handleResize} />

			{/* Terminal tab bar */}
			<div className="flex items-center border-b border-border-secondary bg-surface-base shrink-0">
				{/* Tab list */}
				<div className="flex items-center overflow-x-auto" role="tablist">
					{terminalTabs.map((tab) => (
						<TerminalTabItem
							key={tab.id}
							tab={tab}
							isActive={tab.id === activeTerminalTabId}
							onSelect={handleTabSelect}
							onClose={handleTabClose}
						/>
					))}
				</div>

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
					terminalTabs.map((tab) => (
						<div
							key={tab.id}
							className={cn(
								"absolute inset-0",
								tab.id === activeTerminalTabId ? "block" : "hidden",
							)}
						>
							<TerminalInstance
								terminalId={tab.terminalId}
								isActive={tab.id === activeTerminalTabId}
							/>
						</div>
					))
				)}
			</div>
		</div>
	);
}
