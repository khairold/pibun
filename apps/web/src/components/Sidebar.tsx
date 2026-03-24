/**
 * Sidebar — active tabs grouped by CWD + past sessions for resuming.
 *
 * Primary section: Open tabs — each clickable to switch. Grouped by CWD
 * when tabs span multiple directories. Shows streaming indicator and model badge.
 *
 * Secondary section: Past sessions — collapsible list from Pi's session filesystem.
 * Useful for resuming old conversations. Sessions that are already open as tabs are
 * excluded to avoid confusion.
 *
 * Responsive behavior:
 * - On narrow viewports (< md): overlay panel with backdrop, slides in from left
 * - On desktop viewports (≥ md): inline panel, toggleable via Ctrl/Cmd+B
 * - Clicking a tab or session on mobile auto-closes the sidebar
 */

import { PluginSidebarPanels } from "@/components/PluginPanel";
import {
	addProject,
	createTerminal,
	fetchProjects,
	openProject,
	removeProject,
} from "@/lib/appActions";
import { fetchSessionList, switchSession } from "@/lib/sessionActions";
import { closeTab, createNewTab, switchTabAction } from "@/lib/tabActions";
import { cn, onShortcut } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport, showNativeContextMenu } from "@/wireTransport";
import type {
	ContextMenuItem,
	Project,
	SessionTab,
	TabStatus,
	WsSessionSummary,
} from "@pibun/contracts";
import {
	type MouseEvent as ReactMouseEvent,
	type SyntheticEvent,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

// ============================================================================
// Constants
// ============================================================================

/** Tailwind `md` breakpoint in pixels. */
const MD_BREAKPOINT = 768;

// ============================================================================
// Project Favicon
// ============================================================================

/** Build the URL for a project's favicon. Uses the same origin as the app. */
function faviconUrl(cwd: string): string {
	return `/api/project-favicon?cwd=${encodeURIComponent(cwd)}`;
}

/** Folder icon SVG path — reused as fallback when no favicon is available. */
const FOLDER_ICON_PATH =
	"M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z";

/**
 * Project favicon with folder icon fallback.
 *
 * Attempts to load the project's favicon from the server endpoint.
 * On error (404 or load failure), falls back to a folder SVG icon.
 * Uses the `cwd` as key — favicon URL is cached by the browser (1h Cache-Control).
 */
const ProjectFavicon = memo(function ProjectFavicon({
	cwd,
	isActive,
	className,
}: {
	cwd: string;
	isActive: boolean;
	className?: string;
}) {
	const [hasError, setHasError] = useState(false);

	const handleError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
		e.currentTarget.style.display = "none";
		setHasError(true);
	}, []);

	if (hasError) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className={cn(className, isActive ? "text-accent-text" : "text-text-muted")}
				aria-label="Project folder"
				role="img"
			>
				<path d={FOLDER_ICON_PATH} />
			</svg>
		);
	}

	return (
		<img
			src={faviconUrl(cwd)}
			alt=""
			className={cn(className, "rounded-sm object-contain")}
			onError={handleError}
		/>
	);
});

// ============================================================================
// Tab Status Indicator
// ============================================================================

/**
 * Status dot for a session tab.
 *
 * - `running` — blue pulsing dot (agent is processing)
 * - `waiting` — amber pulsing dot (waiting for user input via extension dialog)
 * - `error` — red dot (session error, retry failure)
 * - `idle` — small accent dot if active tab, gray dot otherwise
 */
function TabStatusDot({ status, isActive }: { status: TabStatus; isActive: boolean }) {
	switch (status) {
		case "running":
			return <span className="h-2 w-2 animate-pulse rounded-full bg-accent-primary" />;
		case "waiting":
			return <span className="h-2 w-2 animate-pulse rounded-full bg-status-warning" />;
		case "error":
			return <span className="h-2 w-2 rounded-full bg-status-error" />;
		default:
			return isActive ? (
				<span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
			) : (
				<span className="h-1.5 w-1.5 rounded-full bg-surface-tertiary" />
			);
	}
}

// ============================================================================
// Thread Context Menu (HTML fallback for browser mode)
// ============================================================================

interface ContextMenuState {
	/** Tab the menu is open for. */
	tabId: string;
	/** Position of the menu (viewport coordinates). */
	x: number;
	y: number;
}

/**
 * HTML fallback context menu for thread items in the sidebar.
 *
 * Shown when native context menu is unavailable (browser mode).
 * Positioned at click coordinates, closes on outside click or Escape.
 *
 * Actions:
 * - **Rename** — triggers inline edit mode on the tab item
 * - **Copy Path** — copies CWD to clipboard
 * - **Copy Session ID** — copies session ID to clipboard
 * - **Mark Unread** — sets hasUnread on the tab
 * - **Delete** — closes the tab (stops session + removes)
 */
function HtmlContextMenu({
	menu,
	tab,
	canClose,
	onClose,
	onRename,
	onDelete,
}: {
	menu: ContextMenuState;
	tab: SessionTab;
	canClose: boolean;
	onClose: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const addToast = useStore((s) => s.addToast);
	const updateTab = useStore((s) => s.updateTab);

	// Close on outside click or Escape
	useEffect(() => {
		function handleClick(e: globalThis.MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handleCopyPath = useCallback(() => {
		if (tab.cwd) {
			navigator.clipboard.writeText(tab.cwd).then(() => {
				addToast("Path copied to clipboard", "info");
			});
		}
		onClose();
	}, [tab.cwd, addToast, onClose]);

	const handleCopySessionId = useCallback(() => {
		if (tab.sessionId) {
			navigator.clipboard.writeText(tab.sessionId).then(() => {
				addToast("Session ID copied to clipboard", "info");
			});
		}
		onClose();
	}, [tab.sessionId, addToast, onClose]);

	const handleMarkUnread = useCallback(() => {
		updateTab(tab.id, { hasUnread: true });
		onClose();
	}, [tab.id, updateTab, onClose]);

	const handleRename = useCallback(() => {
		onClose();
		onRename();
	}, [onClose, onRename]);

	const handleDelete = useCallback(() => {
		onClose();
		onDelete();
	}, [onClose, onDelete]);

	return (
		<div
			ref={menuRef}
			className="fixed z-[100] min-w-[160px] rounded-lg border border-border-primary bg-surface-secondary py-1 shadow-lg"
			style={{ left: menu.x, top: menu.y }}
		>
			{/* Rename */}
			<button
				type="button"
				onClick={handleRename}
				disabled={!tab.sessionId}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.303a1 1 0 0 0-.258.442l-.96 3.425a.25.25 0 0 0 .305.305l3.425-.96a1 1 0 0 0 .442-.258l7.79-7.79a1.75 1.75 0 0 0 0-2.475l-.476-.479z" />
				</svg>
				Rename
			</button>

			{/* Separator */}
			<div className="my-1 border-t border-border-primary" />

			{/* Copy Path */}
			<button
				type="button"
				onClick={handleCopyPath}
				disabled={!tab.cwd}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d={FOLDER_ICON_PATH} />
				</svg>
				Copy Path
			</button>

			{/* Copy Session ID */}
			<button
				type="button"
				onClick={handleCopySessionId}
				disabled={!tab.sessionId}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path
						fillRule="evenodd"
						d="M10.986 3H12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1.014A2.25 2.25 0 0 1 7.25 1h1.5a2.25 2.25 0 0 1 2.236 2ZM9.5 4v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4h3Z"
						clipRule="evenodd"
					/>
				</svg>
				Copy Session ID
			</button>

			{/* Separator */}
			<div className="my-1 border-t border-border-primary" />

			{/* Mark Unread */}
			<button
				type="button"
				onClick={handleMarkUnread}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
					<path
						fillRule="evenodd"
						d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.238.006.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
						clipRule="evenodd"
					/>
				</svg>
				Mark Unread
			</button>

			{/* Delete */}
			{canClose && (
				<>
					<div className="my-1 border-t border-border-primary" />
					<button
						type="button"
						onClick={handleDelete}
						className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-status-error transition-colors hover:bg-status-error/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3.5 w-3.5"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 1 5.357 15h5.285a1.5 1.5 0 0 1 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
								clipRule="evenodd"
							/>
						</svg>
						Delete
					</button>
				</>
			)}
		</div>
	);
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

/**
 * Inline confirmation dialog for thread deletion.
 *
 * Shown as a fixed overlay positioned near the context menu trigger.
 * Displays session name and asks for confirmation before closing the tab.
 * Closes on Escape, outside click, or explicit Cancel/Delete actions.
 */
function DeleteConfirmDialog({
	tab,
	onConfirm,
	onCancel,
}: {
	tab: SessionTab;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const displayName = tab.name || "New Session";

	useEffect(() => {
		function handleClick(e: globalThis.MouseEvent) {
			if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
				onCancel();
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onCancel();
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onCancel]);

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-surface-overlay/50">
			<div
				ref={dialogRef}
				className="mx-4 w-full max-w-[280px] rounded-xl border border-border-primary bg-surface-secondary p-4 shadow-lg"
			>
				<h3 className="text-sm font-medium text-text-primary">Delete thread?</h3>
				<p className="mt-1 text-xs text-text-secondary">
					This will stop the session and close the tab for &ldquo;
					<span className="font-medium text-text-primary">{displayName}</span>&rdquo;.
				</p>
				<div className="mt-3 flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="rounded-md bg-status-error px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-status-error/80"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Project Context Menu (HTML fallback for browser mode)
// ============================================================================

interface ProjectContextMenuState {
	/** Project the menu is open for. */
	projectId: string;
	/** Position of the menu (viewport coordinates). */
	x: number;
	y: number;
}

/**
 * HTML fallback context menu for project items in the sidebar.
 *
 * Actions:
 * - **Open in Terminal** — creates a terminal tab in the project's CWD
 * - **Open in Editor** — opens the project in the system code editor
 * - **Copy Path** — copies CWD to clipboard
 * - **Remove** — removes the project from the list (does not delete files)
 */
function HtmlProjectContextMenu({
	menu,
	project,
	onClose,
	onOpenInTerminal,
	onOpenInEditor,
	onRemove,
}: {
	menu: ProjectContextMenuState;
	project: Project;
	onClose: () => void;
	onOpenInTerminal: () => void;
	onOpenInEditor: () => void;
	onRemove: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const addToast = useStore((s) => s.addToast);

	useEffect(() => {
		function handleClick(e: globalThis.MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handleCopyPath = useCallback(() => {
		navigator.clipboard.writeText(project.cwd).then(() => {
			addToast("Path copied to clipboard", "info");
		});
		onClose();
	}, [project.cwd, addToast, onClose]);

	const handleOpenInTerminal = useCallback(() => {
		onClose();
		onOpenInTerminal();
	}, [onClose, onOpenInTerminal]);

	const handleOpenInEditor = useCallback(() => {
		onClose();
		onOpenInEditor();
	}, [onClose, onOpenInEditor]);

	const handleRemove = useCallback(() => {
		onClose();
		onRemove();
	}, [onClose, onRemove]);

	return (
		<div
			ref={menuRef}
			className="fixed z-[100] min-w-[160px] rounded-lg border border-border-primary bg-surface-secondary py-1 shadow-lg"
			style={{ left: menu.x, top: menu.y }}
		>
			{/* Open in Terminal */}
			<button
				type="button"
				onClick={handleOpenInTerminal}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path
						fillRule="evenodd"
						d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm3.03.47a.75.75 0 0 0-1.06 1.06L5.69 7.5 3.97 9.22a.75.75 0 1 0 1.06 1.06l2.25-2.25a.75.75 0 0 0 0-1.06L5.03 4.72ZM7.75 10a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z"
						clipRule="evenodd"
					/>
				</svg>
				Open in Terminal
			</button>

			{/* Open in Editor */}
			<button
				type="button"
				onClick={handleOpenInEditor}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.303a1 1 0 0 0-.258.442l-.96 3.425a.25.25 0 0 0 .305.305l3.425-.96a1 1 0 0 0 .442-.258l7.79-7.79a1.75 1.75 0 0 0 0-2.475l-.476-.479z" />
				</svg>
				Open in Editor
			</button>

			{/* Separator */}
			<div className="my-1 border-t border-border-primary" />

			{/* Copy Path */}
			<button
				type="button"
				onClick={handleCopyPath}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d={FOLDER_ICON_PATH} />
				</svg>
				Copy Path
			</button>

			{/* Separator */}
			<div className="my-1 border-t border-border-primary" />

			{/* Remove */}
			<button
				type="button"
				onClick={handleRemove}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-status-error transition-colors hover:bg-status-error/10"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-hidden="true"
				>
					<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
				</svg>
				Remove Project
			</button>
		</div>
	);
}

// ============================================================================
// Tab Item (sidebar variant — more detailed than TabBar)
// ============================================================================

interface SidebarTabItemProps {
	tab: SessionTab;
	isActive: boolean;
	onSwitch: (tabId: string) => void;
	onClose: (tabId: string) => void;
	canClose: boolean;
	onContextMenu: (tabId: string, x: number, y: number) => void;
	isRenaming: boolean;
	onRenameStart: () => void;
	onRenameComplete: (newName: string) => void;
	onRenameCancel: () => void;
}

const SidebarTabItem = memo(function SidebarTabItem({
	tab,
	isActive,
	onSwitch,
	onClose,
	canClose,
	onContextMenu,
	isRenaming,
	onRenameComplete,
	onRenameCancel,
}: SidebarTabItemProps) {
	const displayName = tab.name || "New Session";
	const modelName = tab.model ? shortModelName(tab.model.name) : null;
	const renameInputRef = useRef<HTMLInputElement>(null);
	const [renameValue, setRenameValue] = useState(displayName);

	// Focus rename input when entering rename mode
	useEffect(() => {
		if (isRenaming && renameInputRef.current) {
			setRenameValue(displayName);
			renameInputRef.current.focus();
			renameInputRef.current.select();
		}
	}, [isRenaming, displayName]);

	const handleContextMenu = useCallback(
		(e: ReactMouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onContextMenu(tab.id, e.clientX, e.clientY);
		},
		[tab.id, onContextMenu],
	);

	const handleRenameSubmit = useCallback(() => {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== displayName) {
			onRenameComplete(trimmed);
		} else {
			onRenameCancel();
		}
	}, [renameValue, displayName, onRenameComplete, onRenameCancel]);

	return (
		<div
			role="tab"
			tabIndex={0}
			onClick={() => {
				if (!isRenaming) onSwitch(tab.id);
			}}
			onKeyDown={(e) => {
				if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					onSwitch(tab.id);
				}
			}}
			onContextMenu={handleContextMenu}
			className={cn(
				"group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
				isActive
					? "bg-surface-secondary text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary/50 hover:text-text-primary",
			)}
			aria-selected={isActive}
			aria-label={displayName}
		>
			{/* Status indicator — running (blue pulse), waiting (amber pulse), error (red), idle (gray/accent) */}
			<span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
				<TabStatusDot status={tab.status} isActive={isActive} />
			</span>

			{/* Tab info */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					{isRenaming ? (
						<input
							ref={renameInputRef}
							type="text"
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleRenameSubmit();
								} else if (e.key === "Escape") {
									e.preventDefault();
									onRenameCancel();
								}
								// Stop propagation so parent doesn't handle keydown
								e.stopPropagation();
							}}
							onBlur={handleRenameSubmit}
							onClick={(e) => e.stopPropagation()}
							className="min-w-0 flex-1 rounded border border-accent-primary bg-surface-primary px-1 py-0 text-sm font-medium text-text-primary outline-none"
						/>
					) : (
						<span className="truncate text-sm font-medium">{displayName}</span>
					)}
					{/* Unread indicator — shown on inactive tabs with new content */}
					{!isRenaming && !isActive && tab.hasUnread && (
						<span
							className="h-2 w-2 shrink-0 rounded-full bg-accent-primary"
							title="New activity"
						/>
					)}
					{!isRenaming && modelName && (
						<span className="shrink-0 rounded bg-surface-tertiary/50 px-1 py-0.5 text-[10px] leading-none text-text-tertiary">
							{modelName}
						</span>
					)}
				</div>
				{!isRenaming && tab.messageCount > 0 && (
					<span className="text-xs text-text-tertiary">
						{String(tab.messageCount)} message{tab.messageCount !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{/* Close button — visible on hover, hidden during rename */}
			{canClose && !isRenaming && (
				<button
					type="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						onClose(tab.id);
					}}
					className={cn(
						"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
						isActive
							? "text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary"
							: "text-transparent group-hover:text-text-tertiary group-hover:hover:bg-surface-tertiary group-hover:hover:text-text-secondary",
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
// CWD Group Header
// ============================================================================

interface CwdGroupProps {
	cwd: string;
	tabs: SessionTab[];
	activeTabId: string | null;
	onSwitchTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	canClose: boolean;
	onContextMenu: (tabId: string, x: number, y: number) => void;
	renamingTabId: string | null;
	onRenameStart: (tabId: string) => void;
	onRenameComplete: (tabId: string, newName: string) => void;
	onRenameCancel: () => void;
}

const CwdGroup = memo(function CwdGroup({
	cwd,
	tabs,
	activeTabId,
	onSwitchTab,
	onCloseTab,
	canClose,
	onContextMenu,
	renamingTabId,
	onRenameStart,
	onRenameComplete,
	onRenameCancel,
}: CwdGroupProps) {
	return (
		<div className="mb-1">
			{/* CWD label with favicon */}
			<div className="flex items-center gap-1.5 px-3 pb-1">
				<ProjectFavicon cwd={cwd} isActive={false} className="h-3 w-3" />
				<span className="truncate text-[10px] font-medium uppercase tracking-wider text-text-muted">
					{shortPath(cwd)}
				</span>
			</div>
			{/* Tabs in this CWD */}
			<div className="flex flex-col gap-0.5">
				{tabs.map((tab) => (
					<SidebarTabItem
						key={tab.id}
						tab={tab}
						isActive={tab.id === activeTabId}
						onSwitch={onSwitchTab}
						onClose={onCloseTab}
						canClose={canClose}
						onContextMenu={onContextMenu}
						isRenaming={renamingTabId === tab.id}
						onRenameStart={() => onRenameStart(tab.id)}
						onRenameComplete={(newName) => onRenameComplete(tab.id, newName)}
						onRenameCancel={onRenameCancel}
					/>
				))}
			</div>
		</div>
	);
});

// ============================================================================
// Past Session Item
// ============================================================================

interface PastSessionItemProps {
	session: WsSessionSummary;
	onSwitch: (sessionPath: string) => void;
	isSwitching: boolean;
}

const PastSessionItem = memo(function PastSessionItem({
	session,
	onSwitch,
	isSwitching,
}: PastSessionItemProps) {
	const displayName = session.name ?? session.firstMessage ?? formatSessionId(session.sessionId);
	const dateStr = formatDate(session.createdAt);

	return (
		<button
			type="button"
			onClick={() => {
				if (!isSwitching) onSwitch(session.sessionPath);
			}}
			disabled={isSwitching}
			className={cn(
				"flex w-full flex-col gap-0.5 rounded-lg px-3 py-1.5 text-left transition-colors",
				"text-text-tertiary hover:bg-surface-secondary/50 hover:text-text-secondary",
				isSwitching && "cursor-wait opacity-60",
			)}
		>
			<span className="truncate text-xs">{displayName}</span>
			<span className="text-[10px] text-text-muted">
				{dateStr}
				{session.messageCount > 0 ? ` · ${String(session.messageCount)} msgs` : ""}
			</span>
		</button>
	);
});

// ============================================================================
// Project Item
// ============================================================================

interface ProjectItemProps {
	project: Project;
	isActive: boolean;
	onOpen: (project: Project) => void;
	onRemove: (projectId: string) => void;
	onContextMenu: (projectId: string, x: number, y: number) => void;
}

const ProjectItem = memo(function ProjectItem({
	project,
	isActive,
	onOpen,
	onRemove,
	onContextMenu,
}: ProjectItemProps) {
	const lastOpenedStr = formatRelativeTime(project.lastOpened);

	const handleContextMenu = useCallback(
		(e: ReactMouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onContextMenu(project.id, e.clientX, e.clientY);
		},
		[project.id, onContextMenu],
	);

	return (
		<div
			role="tab"
			tabIndex={0}
			onClick={() => onOpen(project)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(project);
				}
			}}
			onContextMenu={handleContextMenu}
			className={cn(
				"group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
				isActive
					? "bg-surface-secondary text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary/50 hover:text-text-primary",
			)}
			aria-selected={isActive}
			aria-label={project.name}
		>
			{/* Project favicon (falls back to folder icon) */}
			<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
				<ProjectFavicon cwd={project.cwd} isActive={isActive} className="h-4 w-4" />
			</span>

			{/* Project info */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{project.name}</span>
					{/* Session count badge */}
					{project.sessionCount > 0 && (
						<span className="shrink-0 rounded-full bg-surface-tertiary/50 px-1.5 py-0.5 text-[10px] leading-none text-text-tertiary">
							{String(project.sessionCount)}
						</span>
					)}
				</div>
				<span className="text-[10px] text-text-tertiary">{lastOpenedStr}</span>
			</div>

			{/* Remove button — visible on hover */}
			<button
				type="button"
				tabIndex={-1}
				onClick={(e) => {
					e.stopPropagation();
					onRemove(project.id);
				}}
				className={cn(
					"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
					isActive
						? "text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary"
						: "text-transparent group-hover:text-text-tertiary group-hover:hover:bg-surface-tertiary group-hover:hover:text-text-secondary",
				)}
				aria-label={`Remove ${project.name}`}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3"
					aria-label="Remove project"
					role="img"
				>
					<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
				</svg>
			</button>
		</div>
	);
});

// ============================================================================
// Add Project UI
// ============================================================================

/**
 * Inline text input for adding a project by typing a folder path.
 * Shown in browser mode (no native dialog) or as a fallback in desktop mode.
 */
interface AddProjectInputProps {
	onAdd: (cwd: string) => void;
	onCancel: () => void;
}

const AddProjectInput = memo(function AddProjectInput({ onAdd, onCancel }: AddProjectInputProps) {
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(() => {
		const trimmed = value.trim();
		if (trimmed) {
			onAdd(trimmed);
		}
	}, [value, onAdd]);

	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<label htmlFor="add-project-path" className="text-[10px] text-text-tertiary">
				Enter folder path
			</label>
			<div className="flex items-center gap-1">
				<input
					ref={inputRef}
					id="add-project-path"
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							handleSubmit();
						} else if (e.key === "Escape") {
							e.preventDefault();
							onCancel();
						}
					}}
					placeholder="/path/to/project"
					className="min-w-0 flex-1 rounded border border-border-primary bg-surface-secondary px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary"
				/>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!value.trim()}
					className={cn(
						"rounded px-2 py-1 text-xs font-medium transition-colors",
						value.trim()
							? "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover"
							: "cursor-not-allowed bg-surface-tertiary text-text-tertiary",
					)}
				>
					Add
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded px-1.5 py-1 text-xs text-text-tertiary hover:text-text-secondary"
				>
					Cancel
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// Helpers
// ============================================================================

/** Format a unix timestamp (ms) to a human-readable relative time. */
function formatRelativeTime(timestampMs: number): string {
	const now = Date.now();
	const diffMs = now - timestampMs;
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${String(diffMin)}m ago`;
	if (diffHr < 24) return `${String(diffHr)}h ago`;
	if (diffDays < 7) return `${String(diffDays)}d ago`;

	return new Date(timestampMs).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

/** Format a session ID to a short display string. */
function formatSessionId(id: string): string {
	return id.slice(0, 8);
}

/** Format an ISO date string to a human-readable relative or short date. */
function formatDate(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${String(diffMin)}m ago`;
	if (diffHr < 24) return `${String(diffHr)}h ago`;
	if (diffDays < 7) return `${String(diffDays)}d ago`;

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

/** Shorten a CWD path for display (last 2 segments). */
function shortPath(fullPath: string): string {
	const parts = fullPath.replace(/\/$/, "").split("/");
	if (parts.length <= 2) return fullPath;
	return `…/${parts.slice(-2).join("/")}`;
}

/** Shorten a model name for display in a badge. */
function shortModelName(name: string): string {
	const stripped = name
		.replace(/^claude-/, "")
		.replace(/^gpt-/, "")
		.replace(/^gemini-/, "");
	if (stripped.length > 12) return `${stripped.slice(0, 10)}…`;
	return stripped;
}

/** Check if the current viewport is below the md breakpoint. */
function isMobileWidth(): boolean {
	return typeof window !== "undefined" && window.innerWidth < MD_BREAKPOINT;
}

/**
 * Group tabs by their CWD.
 * Returns an array of [cwd, tabs[]] pairs, sorted by CWD.
 * Tabs with null CWD are grouped under a "(no project)" key.
 */
function groupTabsByCwd(tabs: SessionTab[]): Array<[string, SessionTab[]]> {
	const groups = new Map<string, SessionTab[]>();
	for (const tab of tabs) {
		const key = tab.cwd ?? "(no project)";
		const existing = groups.get(key);
		if (existing) {
			existing.push(tab);
		} else {
			groups.set(key, [tab]);
		}
	}
	return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// ============================================================================
// Sidebar Update Footer
// ============================================================================

/**
 * SidebarUpdateFooter — compact auto-update status at the bottom of the sidebar.
 *
 * Shows download progress, "restart to update" prompt, and error states.
 * Only visible when there's active update activity (not shown for "no-update" or
 * when dismissed). Complements the top-level UpdateBanner with a persistent,
 * always-visible indicator in the sidebar.
 */
function SidebarUpdateFooter() {
	const updateStatus = useStore((s) => s.updateStatus);
	const updateMessage = useStore((s) => s.updateMessage);
	const updateVersion = useStore((s) => s.updateVersion);
	const updateProgress = useStore((s) => s.updateProgress);

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

	// Only show for active update states
	if (!updateStatus || updateStatus === "no-update" || updateStatus === "checking") {
		return null;
	}

	const isDownloading = updateStatus === "downloading" || updateStatus === "download-progress";
	const isReady = updateStatus === "update-ready";
	const isApplying = updateStatus === "applying";
	const isError = updateStatus === "error";

	return (
		<div className="shrink-0 border-t border-border-secondary">
			{/* Download progress bar (full-width, thin) */}
			{isDownloading && (
				<div className="h-1 w-full bg-accent-primary/20">
					<div
						className="h-full bg-accent-primary transition-all duration-300"
						style={{ width: `${String(updateProgress ?? 0)}%` }}
					/>
				</div>
			)}

			<div className="flex items-center gap-2 px-3 py-2">
				{/* Status icon */}
				{isDownloading && (
					<svg
						className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-primary"
						viewBox="0 0 16 16"
						fill="none"
						aria-label="Downloading update"
						role="img"
					>
						<circle
							cx="8"
							cy="8"
							r="6"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeDasharray="28"
							strokeDashoffset="8"
						/>
					</svg>
				)}
				{isReady && (
					<svg
						className="h-3.5 w-3.5 shrink-0 text-status-success"
						viewBox="0 0 16 16"
						fill="currentColor"
						aria-label="Update ready"
						role="img"
					>
						<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm11.78-1.72a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.28 6.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l4-4z" />
					</svg>
				)}
				{isApplying && (
					<svg
						className="h-3.5 w-3.5 shrink-0 animate-spin text-status-success"
						viewBox="0 0 16 16"
						fill="none"
						aria-label="Applying update"
						role="img"
					>
						<circle
							cx="8"
							cy="8"
							r="6"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeDasharray="28"
							strokeDashoffset="8"
						/>
					</svg>
				)}
				{isError && (
					<svg
						className="h-3.5 w-3.5 shrink-0 text-status-error"
						viewBox="0 0 16 16"
						fill="currentColor"
						aria-label="Update error"
						role="img"
					>
						<path d="M2.343 13.657A8 8 0 1 1 13.657 2.343 8 8 0 0 1 2.343 13.657zM6.03 4.97a.75.75 0 0 0-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 1 0 1.06 1.06L8 9.06l1.97 1.97a.75.75 0 1 0 1.06-1.06L9.06 8l1.97-1.97a.75.75 0 1 0-1.06-1.06L8 6.94 6.03 4.97z" />
					</svg>
				)}

				{/* Text content */}
				<div className="min-w-0 flex-1">
					{isDownloading && (
						<div className="flex items-baseline gap-1">
							<span className="truncate text-xs text-text-secondary">
								Downloading{updateVersion ? ` v${updateVersion}` : ""}
							</span>
							{updateProgress != null && (
								<span className="shrink-0 text-[10px] text-text-muted">
									{String(Math.round(updateProgress))}%
								</span>
							)}
						</div>
					)}
					{isReady && (
						<span className="truncate text-xs font-medium text-status-success">
							Update{updateVersion ? ` v${updateVersion}` : ""} ready
						</span>
					)}
					{isApplying && (
						<span className="truncate text-xs text-text-secondary">Installing update…</span>
					)}
					{isError && <span className="truncate text-xs text-status-error">Update failed</span>}
				</div>

				{/* Action buttons */}
				{isReady && (
					<button
						type="button"
						onClick={handleApplyUpdate}
						className="shrink-0 rounded-md bg-status-success px-2 py-0.5 text-[11px] font-medium text-text-on-accent transition-colors hover:bg-status-success/80"
					>
						Restart
					</button>
				)}
				{isError && (
					<button
						type="button"
						onClick={handleCheckForUpdates}
						className="shrink-0 rounded-md bg-surface-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-tertiary/80"
					>
						Retry
					</button>
				)}
			</div>

			{/* Update available — not yet downloading */}
			{updateStatus === "update-available" && (
				<div className="flex items-center gap-2 px-3 py-2">
					<svg
						className="h-3.5 w-3.5 shrink-0 text-status-warning"
						viewBox="0 0 16 16"
						fill="currentColor"
						aria-label="Update available"
						role="img"
					>
						<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm6.5-.25A.75.75 0 0 1 8 7h.01a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75zM8 10a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 10z" />
					</svg>
					<span className="min-w-0 flex-1 truncate text-xs text-status-warning-text">
						{updateMessage}
					</span>
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Sidebar Component
// ============================================================================

export function Sidebar() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const tabs = useStore((s) => s.tabs);
	const activeTabId = useStore((s) => s.activeTabId);
	const sessionList = useStore((s) => s.sessionList);
	const sessionListLoading = useStore((s) => s.sessionListLoading);
	const projects = useStore((s) => s.projects);
	const activeProjectId = useStore((s) => s.activeProjectId);
	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const setSidebarOpen = useStore((s) => s.setSidebarOpen);

	const [isCreating, setIsCreating] = useState(false);
	const [switchingPath, setSwitchingPath] = useState<string | null>(null);
	const [pastSessionsExpanded, setPastSessionsExpanded] = useState(false);
	const [projectsExpanded, setProjectsExpanded] = useState(true);
	const [showAddProjectInput, setShowAddProjectInput] = useState(false);
	const [isAddingProject, setIsAddingProject] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
	const [deletingTabId, setDeletingTabId] = useState<string | null>(null);
	const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(
		null,
	);
	const addToast = useStore((s) => s.addToast);
	const updateTab = useStore((s) => s.updateTab);

	const isConnected = connectionStatus === "open";

	// Group tabs by CWD — only show groups when there are multiple CWDs
	const tabGroups = useMemo(() => groupTabsByCwd(tabs), [tabs]);
	const hasMultipleCwds = tabGroups.length > 1;

	// Filter past sessions to exclude those already open as tabs
	const openSessionIds = useMemo(() => {
		const ids = new Set<string>();
		for (const tab of tabs) {
			if (tab.sessionId) ids.add(tab.sessionId);
		}
		return ids;
	}, [tabs]);

	const pastSessions = useMemo(
		() => sessionList.filter((s) => !openSessionIds.has(s.sessionId)),
		[sessionList, openSessionIds],
	);

	// Subscribe to toggle sidebar shortcut (Ctrl/Cmd+B)
	useEffect(() => {
		return onShortcut((action) => {
			if (action === "toggleSidebar") {
				toggleSidebar();
			}
		});
	}, [toggleSidebar]);

	// Auto-close sidebar on resize from mobile to desktop (and vice versa)
	useEffect(() => {
		let lastWasMobile = isMobileWidth();

		function handleResize() {
			const nowMobile = isMobileWidth();
			if (lastWasMobile && !nowMobile) {
				setSidebarOpen(true);
			} else if (!lastWasMobile && nowMobile) {
				setSidebarOpen(false);
			}
			lastWasMobile = nowMobile;
		}

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [setSidebarOpen]);

	// Fetch session list on mount and when connection opens
	useEffect(() => {
		if (isConnected) {
			fetchSessionList();
		}
	}, [isConnected]);

	/**
	 * Handle "Add Project" button click.
	 * In desktop mode: try native folder picker via `app.openFolderDialog`.
	 * Falls back to showing inline text input (browser mode or dialog error).
	 */
	const handleAddProject = useCallback(async () => {
		if (!isConnected || isAddingProject) return;
		setIsAddingProject(true);

		try {
			// Try native folder picker first (works in desktop mode)
			const result = await getTransport().request("app.openFolderDialog");
			if (result.folderPath) {
				await addProject(result.folderPath);
				// Ensure projects section is visible
				setProjectsExpanded(true);
			}
			// null means user cancelled — do nothing
		} catch {
			// Native dialog not available (browser mode) — show text input
			setShowAddProjectInput(true);
			setProjectsExpanded(true);
		} finally {
			setIsAddingProject(false);
		}
	}, [isConnected, isAddingProject]);

	const handleAddProjectFromInput = useCallback(
		async (cwd: string) => {
			setShowAddProjectInput(false);
			if (!isConnected) return;
			await addProject(cwd);
			setProjectsExpanded(true);
		},
		[isConnected],
	);

	const handleCancelAddProject = useCallback(() => {
		setShowAddProjectInput(false);
	}, []);

	const handleOpenProject = useCallback(
		async (project: Project) => {
			if (!isConnected) return;
			try {
				await openProject(project);
				// Auto-close sidebar on mobile after opening
				if (isMobileWidth()) {
					setSidebarOpen(false);
				}
			} catch (err) {
				console.error("[Sidebar] Failed to open project:", err);
			}
		},
		[isConnected, setSidebarOpen],
	);

	const handleRemoveProject = useCallback((projectId: string) => {
		removeProject(projectId).catch((err: unknown) => {
			console.error("[Sidebar] Failed to remove project:", err);
		});
	}, []);

	const handleNewTab = useCallback(async () => {
		if (!isConnected || isCreating) return;
		setIsCreating(true);
		try {
			await createNewTab();
			// Auto-close sidebar on mobile after creating
			if (isMobileWidth()) {
				setSidebarOpen(false);
			}
		} finally {
			setIsCreating(false);
		}
	}, [isConnected, isCreating, setSidebarOpen]);

	const handleSwitchTab = useCallback(
		(tabId: string) => {
			switchTabAction(tabId).catch((err: unknown) => {
				console.error("[Sidebar] Failed to switch tab:", err);
			});
			// Auto-close sidebar on mobile after switching
			if (isMobileWidth()) {
				setSidebarOpen(false);
			}
		},
		[setSidebarOpen],
	);

	const handleCloseTab = useCallback((tabId: string) => {
		closeTab(tabId).catch((err: unknown) => {
			console.error("[Sidebar] Failed to close tab:", err);
		});
	}, []);

	const handleSwitchSession = useCallback(
		async (sessionPath: string) => {
			if (!isConnected || switchingPath) return;
			setSwitchingPath(sessionPath);
			try {
				await switchSession(sessionPath);
				// Auto-close sidebar on mobile after switching
				if (isMobileWidth()) {
					setSidebarOpen(false);
				}
			} finally {
				setSwitchingPath(null);
			}
		},
		[isConnected, switchingPath, setSidebarOpen],
	);

	const handleBackdropClick = useCallback(() => {
		setSidebarOpen(false);
	}, [setSidebarOpen]);

	const handleRefresh = useCallback(() => {
		if (isConnected) {
			fetchSessionList();
		}
	}, [isConnected]);

	// ── Thread context menu ──────────────────────────────────────

	/**
	 * Open a context menu for a tab.
	 *
	 * Tries native context menu first (desktop mode). On failure (browser mode),
	 * falls back to an HTML context menu positioned at the click coordinates.
	 */
	const handleTabContextMenu = useCallback(
		(tabId: string, x: number, y: number) => {
			const tab = tabs.find((t) => t.id === tabId);
			if (!tab) return;

			const items: ContextMenuItem[] = [
				{ label: "Rename", action: "rename", enabled: !!tab.sessionId },
				{ type: "separator" },
				{ label: "Copy Path", action: "copy-path", enabled: !!tab.cwd },
				{ label: "Copy Session ID", action: "copy-session-id", enabled: !!tab.sessionId },
				{ type: "separator" },
				{ label: "Mark Unread", action: "mark-unread" },
			];

			if (tabs.length > 1) {
				items.push({ type: "separator" });
				items.push({ label: "Delete", action: "delete", data: { tabId } });
			}

			// Try native context menu (desktop). On error, fall back to HTML.
			showNativeContextMenu(items, (data) => {
				switch (data.action) {
					case "rename":
						setRenamingTabId(tabId);
						break;
					case "copy-path":
						if (tab.cwd) {
							navigator.clipboard.writeText(tab.cwd).then(() => {
								addToast("Path copied to clipboard", "info");
							});
						}
						break;
					case "copy-session-id":
						if (tab.sessionId) {
							navigator.clipboard.writeText(tab.sessionId).then(() => {
								addToast("Session ID copied to clipboard", "info");
							});
						}
						break;
					case "mark-unread":
						updateTab(tabId, { hasUnread: true });
						break;
					case "delete":
						setDeletingTabId(tabId);
						break;
				}
			}).catch(() => {
				// Native menu not available — show HTML context menu
				setContextMenu({ tabId, x, y });
			});
		},
		[tabs, addToast, updateTab],
	);

	const handleCloseContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	const handleContextMenuRename = useCallback((tabId: string) => {
		setContextMenu(null);
		setRenamingTabId(tabId);
	}, []);

	const handleContextMenuDelete = useCallback((tabId: string) => {
		setContextMenu(null);
		setDeletingTabId(tabId);
	}, []);

	const handleConfirmDelete = useCallback(() => {
		if (!deletingTabId) return;
		const tabId = deletingTabId;
		setDeletingTabId(null);
		closeTab(tabId).catch((err: unknown) => {
			console.error("[Sidebar] Failed to delete tab:", err);
		});
	}, [deletingTabId]);

	const handleCancelDelete = useCallback(() => {
		setDeletingTabId(null);
	}, []);

	/**
	 * Complete an inline rename — send `session.setName` to Pi and update the tab.
	 */
	const handleRenameComplete = useCallback(
		async (tabId: string, newName: string) => {
			setRenamingTabId(null);
			const tab = tabs.find((t) => t.id === tabId);
			if (!tab?.sessionId) return;

			// Optimistically update tab name
			updateTab(tabId, { name: newName });
			if (tabId === activeTabId) {
				useStore.getState().setSessionName(newName);
			}

			// Send rename to Pi via `session.setName`
			try {
				const transport = getTransport();
				const previousActiveSession = transport.activeSessionId;
				transport.setActiveSession(tab.sessionId);
				await transport.request("session.setName", { name: newName });
				transport.setActiveSession(previousActiveSession);
			} catch (err) {
				console.error("[Sidebar] Failed to rename session:", err);
				// Revert optimistic update
				updateTab(tabId, { name: tab.name });
				if (tabId === activeTabId) {
					useStore.getState().setSessionName(tab.name);
				}
				addToast("Failed to rename session", "error");
			}
		},
		[tabs, updateTab, activeTabId, addToast],
	);

	const handleRenameCancel = useCallback(() => {
		setRenamingTabId(null);
	}, []);

	// ── Project context menu ─────────────────────────────────────

	/**
	 * Open a context menu for a project.
	 *
	 * Tries native context menu first (desktop mode). On failure (browser mode),
	 * falls back to an HTML context menu positioned at the click coordinates.
	 */
	const handleProjectContextMenu = useCallback(
		(projectId: string, x: number, y: number) => {
			const project = projects.find((p) => p.id === projectId);
			if (!project) return;

			const items: ContextMenuItem[] = [
				{ label: "Open in Terminal", action: "open-terminal" },
				{ label: "Open in Editor", action: "open-editor" },
				{ type: "separator" },
				{ label: "Copy Path", action: "copy-path" },
				{ type: "separator" },
				{ label: "Remove Project", action: "remove" },
			];

			showNativeContextMenu(items, (data) => {
				switch (data.action) {
					case "open-terminal":
						createTerminal(project.cwd).catch((err: unknown) => {
							console.error("[Sidebar] Failed to open terminal:", err);
						});
						break;
					case "open-editor":
						getTransport()
							.request("project.openInEditor", { cwd: project.cwd })
							.catch((err: unknown) => {
								console.error("[Sidebar] Failed to open in editor:", err);
								addToast("Could not open in editor", "error");
							});
						break;
					case "copy-path":
						navigator.clipboard.writeText(project.cwd).then(() => {
							addToast("Path copied to clipboard", "info");
						});
						break;
					case "remove":
						handleRemoveProject(projectId);
						break;
				}
			}).catch(() => {
				setProjectContextMenu({ projectId, x, y });
			});
		},
		[projects, addToast, handleRemoveProject],
	);

	const handleCloseProjectContextMenu = useCallback(() => {
		setProjectContextMenu(null);
	}, []);

	const handleProjectOpenInTerminal = useCallback(
		(projectId: string) => {
			setProjectContextMenu(null);
			const project = projects.find((p) => p.id === projectId);
			if (!project) return;
			createTerminal(project.cwd).catch((err: unknown) => {
				console.error("[Sidebar] Failed to open terminal:", err);
			});
		},
		[projects],
	);

	const handleProjectOpenInEditor = useCallback(
		(projectId: string) => {
			setProjectContextMenu(null);
			const project = projects.find((p) => p.id === projectId);
			if (!project) return;
			getTransport()
				.request("project.openInEditor", { cwd: project.cwd })
				.catch((err: unknown) => {
					console.error("[Sidebar] Failed to open in editor:", err);
					addToast("Could not open in editor", "error");
				});
		},
		[projects, addToast],
	);

	const handleProjectContextRemove = useCallback(
		(projectId: string) => {
			setProjectContextMenu(null);
			handleRemoveProject(projectId);
		},
		[handleRemoveProject],
	);

	// The sidebar panel content (shared between mobile overlay and desktop inline)
	const sidebarContent = (
		<>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border-secondary px-4 py-3">
				<h1 className="text-sm font-bold tracking-tight text-text-primary">PiBun</h1>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleNewTab}
						disabled={!isConnected || isCreating}
						title="New Tab (Ctrl+T)"
						className={cn(
							"flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
							!isConnected || isCreating
								? "cursor-not-allowed text-text-muted"
								: "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary",
						)}
					>
						{/* Plus icon */}
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
						{isCreating ? "Creating…" : "New Tab"}
					</button>
					{/* Close sidebar button — visible on mobile, hidden on desktop */}
					<button
						type="button"
						onClick={() => setSidebarOpen(false)}
						className="rounded-md p-1 text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary md:hidden"
						title="Close sidebar"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4"
							aria-label="Close sidebar"
							role="img"
						>
							<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
						</svg>
					</button>
				</div>
			</div>

			{/* ── Active Tabs Section ──────────────────────────────────── */}
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
					Open Tabs
				</span>
				<span className="text-[10px] text-text-muted">
					{String(tabs.length)} tab{tabs.length !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="flex-1 overflow-y-auto px-2 py-1">
				{tabs.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8">
						<span className="text-xs text-text-muted">No open tabs</span>
						<button
							type="button"
							onClick={handleNewTab}
							disabled={!isConnected}
							className={cn(
								"rounded-md px-3 py-1 text-xs font-medium transition-colors",
								isConnected
									? "bg-surface-secondary text-text-secondary hover:bg-surface-tertiary"
									: "cursor-not-allowed text-text-muted",
							)}
						>
							Open a new tab
						</button>
					</div>
				) : hasMultipleCwds ? (
					/* Grouped by CWD */
					tabGroups.map(([cwd, groupTabs]) => (
						<CwdGroup
							key={cwd}
							cwd={cwd}
							tabs={groupTabs}
							activeTabId={activeTabId}
							onSwitchTab={handleSwitchTab}
							onCloseTab={handleCloseTab}
							canClose={tabs.length > 1}
							onContextMenu={handleTabContextMenu}
							renamingTabId={renamingTabId}
							onRenameStart={(tabId) => setRenamingTabId(tabId)}
							onRenameComplete={handleRenameComplete}
							onRenameCancel={handleRenameCancel}
						/>
					))
				) : (
					/* Flat list — all tabs share same CWD */
					<div className="flex flex-col gap-0.5">
						{tabs.map((tab) => (
							<SidebarTabItem
								key={tab.id}
								tab={tab}
								isActive={tab.id === activeTabId}
								onSwitch={handleSwitchTab}
								onClose={handleCloseTab}
								canClose={tabs.length > 1}
								onContextMenu={handleTabContextMenu}
								isRenaming={renamingTabId === tab.id}
								onRenameStart={() => setRenamingTabId(tab.id)}
								onRenameComplete={(newName) => handleRenameComplete(tab.id, newName)}
								onRenameCancel={handleRenameCancel}
							/>
						))}
					</div>
				)}

				{/* ── Projects Section ─────────────────────────────────── */}
				<div className="mt-3 border-t border-border-secondary pt-2">
					<div className="flex w-full items-center justify-between px-2 py-1">
						<button
							type="button"
							onClick={() => setProjectsExpanded(!projectsExpanded)}
							className="flex flex-1 items-center gap-1.5 text-left"
						>
							<span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
								Projects
							</span>
							{projects.length > 0 && (
								<span className="text-[10px] text-text-muted">{String(projects.length)}</span>
							)}
							{/* Chevron */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								className={cn(
									"h-3 w-3 text-text-muted transition-transform",
									projectsExpanded && "rotate-180",
								)}
								aria-label="Toggle projects"
								role="img"
							>
								<path
									fillRule="evenodd"
									d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
						<div className="flex items-center gap-1">
							{/* Add Project button */}
							<button
								type="button"
								onClick={handleAddProject}
								disabled={!isConnected || isAddingProject}
								className={cn(
									"rounded p-0.5 transition-colors",
									!isConnected || isAddingProject
										? "cursor-not-allowed text-text-muted"
										: "text-text-muted hover:text-text-secondary",
								)}
								title="Add Project"
								aria-label="Add project"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className="h-3.5 w-3.5"
									aria-label="Add"
									role="img"
								>
									<path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
								</svg>
							</button>
							{/* Refresh button */}
							{projects.length > 0 && (
								<button
									type="button"
									onClick={() => {
										if (isConnected) fetchProjects();
									}}
									className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
									aria-label="Refresh projects"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="currentColor"
										className="h-3 w-3"
										aria-label="Refresh"
										role="img"
									>
										<path
											fillRule="evenodd"
											d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37A5.508 5.508 0 0 0 8 3.5a5.5 5.5 0 1 0 5.215 3.772.75.75 0 1 1 1.423-.474A7 7 0 1 1 12.12 3.16l1.716.005z"
											clipRule="evenodd"
										/>
									</svg>
								</button>
							)}
						</div>
					</div>

					{projectsExpanded && (
						<div className="mt-1 flex flex-col gap-0.5">
							{/* Inline text input for adding a project (browser fallback) */}
							{showAddProjectInput && (
								<AddProjectInput
									onAdd={handleAddProjectFromInput}
									onCancel={handleCancelAddProject}
								/>
							)}

							{projects.length > 0 ? (
								projects.map((project) => (
									<ProjectItem
										key={project.id}
										project={project}
										isActive={project.id === activeProjectId}
										onOpen={handleOpenProject}
										onRemove={handleRemoveProject}
										onContextMenu={handleProjectContextMenu}
									/>
								))
							) : !showAddProjectInput ? (
								<div className="flex flex-col items-center gap-2 py-4 px-3">
									<span className="text-xs text-text-muted">No projects yet</span>
									<button
										type="button"
										onClick={handleAddProject}
										disabled={!isConnected || isAddingProject}
										className={cn(
											"rounded-md px-3 py-1 text-xs font-medium transition-colors",
											isConnected && !isAddingProject
												? "bg-surface-secondary text-text-secondary hover:bg-surface-tertiary"
												: "cursor-not-allowed text-text-muted",
										)}
									>
										{isAddingProject ? "Opening…" : "Add a project"}
									</button>
								</div>
							) : null}
						</div>
					)}
				</div>

				{/* ── Past Sessions Section ────────────────────────────── */}
				{pastSessions.length > 0 && (
					<div className="mt-3 border-t border-border-secondary pt-2">
						<div className="flex w-full items-center justify-between px-2 py-1">
							<button
								type="button"
								onClick={() => setPastSessionsExpanded(!pastSessionsExpanded)}
								className="flex flex-1 items-center gap-1.5 text-left"
							>
								<span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
									Past Sessions
								</span>
								<span className="text-[10px] text-text-muted">{String(pastSessions.length)}</span>
								{/* Chevron */}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className={cn(
										"h-3 w-3 text-text-muted transition-transform",
										pastSessionsExpanded && "rotate-180",
									)}
									aria-label="Toggle past sessions"
									role="img"
								>
									<path
										fillRule="evenodd"
										d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
										clipRule="evenodd"
									/>
								</svg>
							</button>
							{/* Refresh button — separate from toggle */}
							<button
								type="button"
								onClick={handleRefresh}
								disabled={sessionListLoading}
								className={cn(
									"rounded p-0.5 transition-colors",
									sessionListLoading
										? "animate-spin text-text-tertiary"
										: "text-text-muted hover:text-text-secondary",
								)}
								aria-label="Refresh past sessions"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className="h-3 w-3"
									aria-label="Refresh"
									role="img"
								>
									<path
										fillRule="evenodd"
										d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37A5.508 5.508 0 0 0 8 3.5a5.5 5.5 0 1 0 5.215 3.772.75.75 0 1 1 1.423-.474A7 7 0 1 1 12.12 3.16l1.716.005z"
										clipRule="evenodd"
									/>
								</svg>
							</button>
						</div>

						{pastSessionsExpanded && (
							<div className="mt-1 flex flex-col gap-0.5">
								{pastSessions.map((session) => (
									<PastSessionItem
										key={session.sessionPath}
										session={session}
										onSwitch={handleSwitchSession}
										isSwitching={switchingPath === session.sessionPath}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{/* ── Plugin Sidebar Panels ─────────────────────────────── */}
				<PluginSidebarPanels />
			</div>

			{/* ── Update Footer ────────────────────────────────────────── */}
			<SidebarUpdateFooter />
		</>
	);

	// Find the tab for the active context menu (if any)
	const contextMenuTab = contextMenu ? tabs.find((t) => t.id === contextMenu.tabId) : null;
	const deletingTab = deletingTabId ? tabs.find((t) => t.id === deletingTabId) : null;
	const contextMenuProject = projectContextMenu
		? projects.find((p) => p.id === projectContextMenu.projectId)
		: null;

	return (
		<>
			{/* Mobile backdrop — shown when sidebar is open below md breakpoint */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-40 bg-surface-overlay backdrop-blur-sm md:hidden"
					onClick={handleBackdropClick}
					onKeyDown={(e) => {
						if (e.key === "Escape") handleBackdropClick();
					}}
					role="button"
					tabIndex={-1}
					aria-label="Close sidebar"
				/>
			)}

			{/* Sidebar panel */}
			<aside
				className={cn(
					// Base styles: flex column, sidebar colors, border
					"z-50 flex w-64 shrink-0 flex-col border-r border-border-secondary bg-surface-primary",
					// Mobile: fixed overlay positioned from left, slide transition
					"fixed inset-y-0 left-0 transition-transform duration-200 ease-in-out md:relative md:z-auto md:transition-none",
					// Open/closed state
					sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden",
				)}
			>
				{sidebarContent}
			</aside>

			{/* HTML fallback context menu (shown in browser mode when native menu unavailable) */}
			{contextMenu && contextMenuTab && (
				<HtmlContextMenu
					menu={contextMenu}
					tab={contextMenuTab}
					canClose={tabs.length > 1}
					onClose={handleCloseContextMenu}
					onRename={() => handleContextMenuRename(contextMenu.tabId)}
					onDelete={() => handleContextMenuDelete(contextMenu.tabId)}
				/>
			)}

			{/* Delete confirmation dialog */}
			{deletingTab && (
				<DeleteConfirmDialog
					tab={deletingTab}
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
				/>
			)}

			{/* HTML fallback project context menu (browser mode) */}
			{projectContextMenu && contextMenuProject && (
				<HtmlProjectContextMenu
					menu={projectContextMenu}
					project={contextMenuProject}
					onClose={handleCloseProjectContextMenu}
					onOpenInTerminal={() => handleProjectOpenInTerminal(projectContextMenu.projectId)}
					onOpenInEditor={() => handleProjectOpenInEditor(projectContextMenu.projectId)}
					onRemove={() => handleProjectContextRemove(projectContextMenu.projectId)}
				/>
			)}
		</>
	);
}
