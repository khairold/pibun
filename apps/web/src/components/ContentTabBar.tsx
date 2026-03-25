/**
 * ContentTabBar — tab bar above the main content area.
 *
 * Renders: [Chat] [Terminal 1] [Terminal 2] ... [+]
 *
 * - Chat tab is always first and cannot be closed.
 * - Terminal tabs come from the current project's terminal set.
 * - Active tab is highlighted with accent styling + bottom border.
 * - Close button on terminal tabs (disabled when it's the last terminal for the project).
 * - [+] button at the end creates a new terminal for the current project.
 *
 * State:
 * - `activeContentTab` ("chat" | terminal tab ID) controls which tab is displayed.
 * - `setActiveContentTab(tab)` updates the active content tab (also persists per-project).
 * - Terminal tabs are filtered by `t.projectPath === activeTab.cwd`.
 */

import { closeTerminal, createTerminal } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { TerminalTab } from "@/store/types";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

// ============================================================================
// Sub-components
// ============================================================================

/** Chat tab — always first, never closable. */
function ChatTab({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			onClick={onClick}
			className={cn(
				"flex items-center gap-1.5 border-r border-border-secondary px-3 py-1.5 text-xs font-medium transition-colors select-none",
				isActive
					? "border-b-2 border-b-accent-primary bg-surface-primary text-text-primary"
					: "border-b-2 border-b-transparent bg-surface-base text-text-tertiary hover:bg-surface-primary/50 hover:text-text-secondary",
			)}
		>
			{/* Chat bubble icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5 shrink-0"
				aria-hidden="true"
			>
				<path
					fillRule="evenodd"
					d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.351a.75.75 0 0 0 1.28.53l2.51-2.51c.182-.181.427-.283.684-.293A44.137 44.137 0 0 0 12.31 10.7c.978-.128 1.69-.962 1.69-1.96V4.26c0-.998-.712-1.832-1.69-1.96A44.645 44.645 0 0 0 8 2c-1.438 0-2.86.085-4.31.3C2.713 2.428 2 3.262 2 4.26v4.48H1Z"
					clipRule="evenodd"
				/>
			</svg>
			Chat
		</button>
	);
}

/**
 * A single terminal tab with optional close button and inline rename.
 *
 * Double-click the tab label to enter rename mode. Press Enter or blur to confirm.
 * Press Escape to cancel. Empty names revert to the previous name.
 */
const TerminalTabItem = memo(function TerminalTabItem({
	tab,
	isActive,
	canClose,
	onSelect,
	onClose,
	onRename,
}: {
	tab: TerminalTab;
	isActive: boolean;
	canClose: boolean;
	onSelect: (tabId: string) => void;
	onClose: (tabId: string) => void;
	onRename: (tabId: string, newName: string) => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(tab.name);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus + select all when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const commitRename = useCallback(() => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== tab.name) {
			onRename(tab.id, trimmed);
		}
		setIsEditing(false);
	}, [editValue, tab.name, tab.id, onRename]);

	const cancelRename = useCallback(() => {
		setEditValue(tab.name);
		setIsEditing(false);
	}, [tab.name]);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setEditValue(tab.name);
			setIsEditing(true);
		},
		[tab.name],
	);

	const handleInputKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commitRename();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cancelRename();
			}
			// Stop propagation so tab-level keyboard shortcuts don't fire
			e.stopPropagation();
		},
		[commitRename, cancelRename],
	);

	return (
		<div
			role="tab"
			tabIndex={0}
			aria-selected={isActive}
			className={cn(
				"group flex items-center gap-1.5 border-r border-border-secondary px-3 py-1.5 text-xs font-medium cursor-pointer select-none transition-colors",
				isActive
					? "border-b-2 border-b-accent-primary bg-surface-primary text-text-primary"
					: "border-b-2 border-b-transparent bg-surface-base text-text-tertiary hover:bg-surface-primary/50 hover:text-text-secondary",
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
				className="h-3.5 w-3.5 shrink-0"
				aria-hidden="true"
			>
				<path d="M3.5 5.5l3 2.5-3 2.5V5.5zM8 10h4.5v1H8v-1z" />
			</svg>

			{/* Tab name — inline edit on double-click */}
			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={commitRename}
					onKeyDown={handleInputKeyDown}
					onClick={(e) => e.stopPropagation()}
					className="max-w-[120px] bg-transparent text-xs font-medium text-text-primary outline-none border-b border-accent-primary"
					spellCheck={false}
					autoComplete="off"
				/>
			) : (
				<span className="max-w-[120px] truncate" onDoubleClick={handleDoubleClick}>
					{tab.name}
				</span>
			)}

			{/* Running/exited indicator */}
			{tab.isRunning ? (
				<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" title="Running" />
			) : (
				<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" title="Exited" />
			)}

			{/* Close button — visible on hover or when active, disabled when last terminal */}
			<button
				type="button"
				disabled={!canClose}
				onClick={(e) => {
					e.stopPropagation();
					if (canClose) onClose(tab.id);
				}}
				className={cn(
					"ml-0.5 rounded p-0.5 transition-colors",
					canClose
						? "text-text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-tertiary hover:text-text-secondary"
						: "cursor-not-allowed text-text-muted/30 opacity-0 group-hover:opacity-100",
					isActive && "opacity-100",
				)}
				title={canClose ? "Close terminal" : "Can't close last terminal"}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3"
					aria-hidden="true"
				>
					<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
				</svg>
			</button>
		</div>
	);
});

/** [+] button to add a new terminal tab. */
function AddTerminalButton({
	onClick,
	disabled,
}: {
	onClick: () => void;
	disabled: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex items-center rounded-md px-2 py-1.5 text-text-tertiary transition-colors",
				disabled
					? "cursor-not-allowed opacity-40"
					: "hover:bg-surface-primary/50 hover:text-text-secondary",
			)}
			title="New terminal"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-3.5 w-3.5"
				aria-hidden="true"
			>
				<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
			</svg>
		</button>
	);
}

// ============================================================================
// ContentTabBar
// ============================================================================

/**
 * ContentTabBar — renders above main content area.
 *
 * Only visible when a session/project is active (has at least a CWD).
 * When no project is active, the entire main area is just the chat view.
 */
export const ContentTabBar = memo(function ContentTabBar() {
	const activeContentTab = useStore((s) => s.activeContentTab);
	const setActiveContentTab = useStore((s) => s.setActiveContentTab);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const isConnected = connectionStatus === "open";

	// Get current project path from the active session tab
	const activeProjectPath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.cwd ?? "");

	// Get terminal tabs for the current project — stable reference via useMemo
	const allTerminalTabs = useStore((s) => s.terminalTabs);
	const projectTerminals = useMemo(
		() =>
			activeProjectPath ? allTerminalTabs.filter((t) => t.projectPath === activeProjectPath) : [],
		[allTerminalTabs, activeProjectPath],
	);

	const canCloseTerminal = projectTerminals.length > 1;

	const handleSelectChat = useCallback(() => {
		setActiveContentTab("chat");
	}, [setActiveContentTab]);

	const handleSelectTerminal = useCallback(
		(tabId: string) => {
			setActiveContentTab(tabId);
		},
		[setActiveContentTab],
	);

	const handleCloseTerminal = useCallback((tabId: string) => {
		closeTerminal(tabId).catch((err: unknown) => {
			console.error("[ContentTabBar] Failed to close terminal:", err);
		});
	}, []);

	const updateTerminalTab = useStore((s) => s.updateTerminalTab);
	const handleRenameTerminal = useCallback(
		(tabId: string, newName: string) => {
			updateTerminalTab(tabId, { name: newName });
		},
		[updateTerminalTab],
	);

	const handleAddTerminal = useCallback(() => {
		createTerminal().catch((err: unknown) => {
			console.error("[ContentTabBar] Failed to create terminal:", err);
		});
	}, []);

	// Don't render the tab bar if there's no active project (no CWD)
	if (!activeProjectPath) {
		return null;
	}

	return (
		<div
			className="flex items-center border-b border-border-secondary bg-surface-base"
			role="tablist"
			aria-label="Content tabs"
		>
			{/* Chat tab — always first */}
			<ChatTab isActive={activeContentTab === "chat"} onClick={handleSelectChat} />

			{/* Terminal tabs — from current project */}
			{projectTerminals.map((tab) => (
				<TerminalTabItem
					key={tab.id}
					tab={tab}
					isActive={activeContentTab === tab.id}
					canClose={canCloseTerminal}
					onSelect={handleSelectTerminal}
					onClose={handleCloseTerminal}
					onRename={handleRenameTerminal}
				/>
			))}

			{/* [+] Add terminal button */}
			<AddTerminalButton onClick={handleAddTerminal} disabled={!isConnected} />

			{/* Spacer to push right-aligned items (future: tab overflow menu) */}
			<div className="flex-1" />
		</div>
	);
});
