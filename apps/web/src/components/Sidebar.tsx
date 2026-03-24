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
import { cn } from "@/lib/cn";
import { addProject, fetchProjects, openProject, removeProject } from "@/lib/projectActions";
import { fetchSessionList, switchSession } from "@/lib/sessionActions";
import { onShortcut } from "@/lib/shortcuts";
import { closeTab, createNewTab, switchTabAction } from "@/lib/tabActions";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import type { Project, SessionTab, WsSessionSummary } from "@pibun/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Tailwind `md` breakpoint in pixels. */
const MD_BREAKPOINT = 768;

// ============================================================================
// Tab Item (sidebar variant — more detailed than TabBar)
// ============================================================================

interface SidebarTabItemProps {
	tab: SessionTab;
	isActive: boolean;
	onSwitch: (tabId: string) => void;
	onClose: (tabId: string) => void;
	canClose: boolean;
}

const SidebarTabItem = memo(function SidebarTabItem({
	tab,
	isActive,
	onSwitch,
	onClose,
	canClose,
}: SidebarTabItemProps) {
	const displayName = tab.name || "New Session";
	const modelName = tab.model ? shortModelName(tab.model.name) : null;

	return (
		<div
			role="tab"
			tabIndex={0}
			onClick={() => onSwitch(tab.id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSwitch(tab.id);
				}
			}}
			className={cn(
				"group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
				isActive
					? "bg-surface-secondary text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary/50 hover:text-text-primary",
			)}
			aria-selected={isActive}
			aria-label={displayName}
		>
			{/* Streaming indicator or active dot */}
			<span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
				{tab.isStreaming ? (
					<span className="h-2 w-2 animate-pulse rounded-full bg-accent-primary" />
				) : isActive ? (
					<span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
				) : (
					<span className="h-1.5 w-1.5 rounded-full bg-surface-tertiary" />
				)}
			</span>

			{/* Tab info */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{displayName}</span>
					{modelName && (
						<span className="shrink-0 rounded bg-surface-tertiary/50 px-1 py-0.5 text-[10px] leading-none text-text-tertiary">
							{modelName}
						</span>
					)}
				</div>
				{tab.messageCount > 0 && (
					<span className="text-xs text-text-tertiary">
						{String(tab.messageCount)} message{tab.messageCount !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{/* Close button — visible on hover */}
			{canClose && (
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
}

const CwdGroup = memo(function CwdGroup({
	cwd,
	tabs,
	activeTabId,
	onSwitchTab,
	onCloseTab,
	canClose,
}: CwdGroupProps) {
	return (
		<div className="mb-1">
			{/* CWD label */}
			<div className="flex items-center gap-1.5 px-3 pb-1">
				{/* Folder icon */}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3 w-3 text-text-muted"
					aria-label="Folder"
					role="img"
				>
					<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" />
				</svg>
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
}

const ProjectItem = memo(function ProjectItem({
	project,
	isActive,
	onOpen,
	onRemove,
}: ProjectItemProps) {
	const lastOpenedStr = formatRelativeTime(project.lastOpened);

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
			className={cn(
				"group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
				isActive
					? "bg-surface-secondary text-text-primary"
					: "text-text-secondary hover:bg-surface-secondary/50 hover:text-text-primary",
			)}
			aria-selected={isActive}
			aria-label={project.name}
		>
			{/* Folder icon */}
			<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className={cn("h-4 w-4", isActive ? "text-accent-text" : "text-text-muted")}
					aria-label="Project folder"
					role="img"
				>
					<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" />
				</svg>
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
		</>
	);

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
		</>
	);
}
