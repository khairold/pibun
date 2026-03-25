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
import { SessionBrowserDialog } from "@/components/SessionBrowserDialog";
import { addProject, createTerminal, openProject, removeProject } from "@/lib/appActions";
import { fetchSessionList, switchSession } from "@/lib/sessionActions";
import { startSession, switchTabAction } from "@/lib/tabActions";
import { cn, onShortcut } from "@/lib/utils";
import { removeLoadedSession } from "@/lib/appActions";
import { useStore } from "@/store";
import { getTransport, showNativeContextMenu } from "@/wireTransport";
import type { ContextMenuItem, Project, Session, WsSessionSummary } from "@pibun/contracts";
import {
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
// Unified Session Item
// ============================================================================

/**
 * A merged session entry — either an active tab or a past session from disk.
 * Both render identically in the sidebar: name/first-message, date, count.
 */
type UnifiedSession =
	| { kind: "active"; tab: Session }
	| { kind: "past"; session: WsSessionSummary };

/** Get a stable key for a unified session entry. */
function unifiedSessionKey(entry: UnifiedSession): string {
	return entry.kind === "active" ? `tab-${entry.tab.id}` : `past-${entry.session.sessionPath}`;
}

/**
 * Get display name for a session entry.
 *
 * Priority for active tabs:
 *   1. Pi session name (`tab.name`, synced from `store.sessionName`) — if Pi explicitly names it
 *   2. First user message (`tab.firstMessage`) — auto-detected, truncated to ~100 chars
 *   3. "New session" — fallback for brand-new empty sessions
 *
 * Priority for past sessions (from disk):
 *   1. Pi session name (`s.name`)
 *   2. First user message (`s.firstMessage`)
 *   3. Short session ID — fallback for very old sessions without metadata
 */
function unifiedSessionName(entry: UnifiedSession): string {
	if (entry.kind === "active") {
		const tab = entry.tab;
		return tab.name || tab.firstMessage || "New session";
	}
	const s = entry.session;
	return s.name || s.firstMessage || formatSessionId(s.sessionId);
}

/** Get message count for a unified session. */
function unifiedSessionMessageCount(entry: UnifiedSession): number {
	return entry.kind === "active" ? entry.tab.messageCount : entry.session.messageCount;
}

/** Get date string for a unified session. */
function unifiedSessionDate(entry: UnifiedSession): string {
	if (entry.kind === "active") return "";
	return formatDate(entry.session.createdAt);
}

interface SessionItemProps {
	entry: UnifiedSession;
	isActive: boolean;
	isSwitching: boolean;
	onClickActive: (tabId: string) => void;
	onClickPast: (sessionPath: string) => void;
	onRemoveLoaded?: (sessionPath: string) => void;
}

/**
 * Unified session item — renders active tabs and loaded past sessions.
 *
 * - **Active (current)** → highlighted background
 * - **Running** → pulse indicator
 * - **Loaded (past)** → lighter text, click to resume, [×] to hide from sidebar
 */
const SessionItem = memo(function SessionItem({
	entry,
	isActive,
	isSwitching,
	onClickActive,
	onClickPast,
	onRemoveLoaded,
}: SessionItemProps) {
	const displayName = unifiedSessionName(entry);
	const messageCount = unifiedSessionMessageCount(entry);
	const dateStr = unifiedSessionDate(entry);

	const handleClick = useCallback(() => {
		if (isSwitching) return;
		if (entry.kind === "active") {
			onClickActive(entry.tab.id);
		} else {
			onClickPast(entry.session.sessionPath);
		}
	}, [entry, isSwitching, onClickActive, onClickPast]);

	const handleRemove = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (entry.kind === "past" && onRemoveLoaded) {
				onRemoveLoaded(entry.session.sessionPath);
			}
		},
		[entry, onRemoveLoaded],
	);

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={isSwitching}
			className={cn(
				"group/session flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left transition-colors",
				isActive
					? "border-l-2 border-accent-primary bg-surface-secondary text-text-primary"
					: "border-l-2 border-transparent text-text-tertiary hover:bg-surface-secondary/50 hover:text-text-secondary",
				isSwitching && "cursor-wait opacity-60",
			)}
		>
			{/* Status indicator — muted dot for past sessions only */}
			{entry.kind === "past" ? (
				<span className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center">
					<span className="h-1.5 w-1.5 rounded-full bg-text-muted/50" />
				</span>
			) : null}

			<div className="min-w-0 flex-1">
				<span
					className={cn("block truncate text-xs", isActive ? "font-medium text-text-primary" : "")}
				>
					{displayName}
				</span>
				<span className="text-[10px] text-text-muted">
					{dateStr}
					{dateStr && messageCount > 0 ? " · " : ""}
					{messageCount > 0 ? `${String(messageCount)} msgs` : ""}
				</span>
			</div>

			{/* Remove button — only for loaded (past) sessions */}
			{entry.kind === "past" && onRemoveLoaded && (
				<button
					type="button"
					onClick={handleRemove}
					className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-transparent transition-colors group-hover/session:text-text-muted group-hover/session:hover:text-text-secondary"
					title="Remove from sidebar"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3"
						aria-hidden="true"
					>
						<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
					</svg>
				</button>
			)}
		</button>
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

/** Shorten a model name for display in a badge. */
/** Check if the current viewport is below the md breakpoint. */
function isMobileWidth(): boolean {
	return typeof window !== "undefined" && window.innerWidth < MD_BREAKPOINT;
}

/** Normalize a CWD string for comparison (strip trailing slash, lowercase). */
function normalizeCwd(cwd: string): string {
	return cwd.replace(/\/$/, "");
}

/**
 * A project group in the sidebar — unifies active sessions (tabs),
 * past sessions, and the project metadata under one collapsible node.
 */
interface ProjectGroup {
	/** The project, or null for the "(no project)" catch-all. */
	project: Project | null;
	/** CWD for display / matching. Null only for the orphan group. */
	cwd: string | null;
	/** Display name: project name, or short CWD, or "(no project)". */
	displayName: string;
	/** Active sessions (open tabs) belonging to this project. */
	activeSessions: Session[];
	/** Past sessions (from Pi filesystem) belonging to this project. */
	pastSessions: WsSessionSummary[];
}

/**
 * Build a unified project tree from tabs, projects, and past sessions.
 *
 * Matching: tabs and past sessions are matched to projects by CWD.
 * Unmatched items go into an "(no project)" catch-all group.
 * Projects with no sessions still appear (so users can click to create one).
 */
function buildProjectGroups(
	projects: Project[],
	tabs: Session[],
	pastSessions: WsSessionSummary[],
	openSessionIds: Set<string>,
): ProjectGroup[] {
	// Build CWD → project lookup
	const cwdToProject = new Map<string, Project>();
	for (const p of projects) {
		cwdToProject.set(normalizeCwd(p.cwd), p);
	}

	// Group active sessions by project
	const projectActiveSessions = new Map<string, Session[]>();
	const orphanActiveSessions: Session[] = [];
	for (const tab of tabs) {
		if (!tab.cwd) {
			orphanActiveSessions.push(tab);
			continue;
		}
		const normalized = normalizeCwd(tab.cwd);
		const project = cwdToProject.get(normalized);
		if (project) {
			const list = projectActiveSessions.get(project.id) ?? [];
			list.push(tab);
			projectActiveSessions.set(project.id, list);
		} else {
			orphanActiveSessions.push(tab);
		}
	}

	// Group past sessions by project (exclude already-open ones)
	const projectPastSessions = new Map<string, WsSessionSummary[]>();
	const orphanPastSessions: WsSessionSummary[] = [];
	for (const session of pastSessions) {
		if (openSessionIds.has(session.sessionId)) continue;
		const normalized = normalizeCwd(session.cwd);
		const project = cwdToProject.get(normalized);
		if (project) {
			const list = projectPastSessions.get(project.id) ?? [];
			list.push(session);
			projectPastSessions.set(project.id, list);
		} else {
			orphanPastSessions.push(session);
		}
	}

	// Build groups: one per project
	const groups: ProjectGroup[] = projects.map((p) => ({
		project: p,
		cwd: p.cwd,
		displayName: p.name,
		activeSessions: projectActiveSessions.get(p.id) ?? [],
		pastSessions: projectPastSessions.get(p.id) ?? [],
	}));

	// Orphan sessions (no matching project) are hidden.
	// Add the project to see its sessions.

	return groups;
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
	const piSessionId = useStore((s) => s.piSessionId);
	const sessionList = useStore((s) => s.sessionList);
	const sessionListLoading = useStore((s) => s.sessionListLoading);
	const projects = useStore((s) => s.projects);
	const activeProjectId = useStore((s) => s.activeProjectId);
	const loadedSessionPaths = useStore((s) => s.loadedSessionPaths);
	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const setSidebarOpen = useStore((s) => s.setSidebarOpen);

	const [isCreating, setIsCreating] = useState(false);
	const [switchingPath, setSwitchingPath] = useState<string | null>(null);
	const [showAddProjectInput, setShowAddProjectInput] = useState(false);
	const [isAddingProject, setIsAddingProject] = useState(false);
	const [sessionBrowserCwd, setSessionBrowserCwd] = useState<string | null>(null);
	const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(
		null,
	);
	const addToast = useStore((s) => s.addToast);

	const isConnected = connectionStatus === "open";

	// Set of Pi internal UUIDs that are currently open as tabs (for filtering past sessions).
	// Uses piSessionId (Pi's UUID) because session list entries use Pi UUIDs.
	const openSessionIds = useMemo(() => {
		const ids = new Set<string>();
		for (const tab of tabs) {
			if (tab.piSessionId) ids.add(tab.piSessionId);
		}
		return ids;
	}, [tabs]);

	// Loaded session paths as a Set for O(1) lookup
	const loadedPathsSet = useMemo(() => new Set(loadedSessionPaths), [loadedSessionPaths]);

	// Past sessions: only show loaded ones, exclude already-open tabs
	const pastSessions = useMemo(
		() =>
			sessionList.filter(
				(s) => loadedPathsSet.has(s.sessionPath) && !openSessionIds.has(s.sessionId),
			),
		[sessionList, openSessionIds, loadedPathsSet],
	);

	// Unified project tree: projects with their active + past sessions
	const projectGroups = useMemo(
		() => buildProjectGroups(projects, tabs, pastSessions, openSessionIds),
		[projects, tabs, pastSessions, openSessionIds],
	);

	// Track which project groups are expanded (by project ID, "orphan" for no-project)
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

	const toggleGroupExpanded = useCallback((groupKey: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupKey)) {
				next.delete(groupKey);
			} else {
				next.add(groupKey);
			}
			return next;
		});
	}, []);

	// Auto-expand groups that contain the active tab
	useEffect(() => {
		if (!activeTabId) return;
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (!activeTab) return;
		for (const group of projectGroups) {
			if (group.activeSessions.some((s) => s.id === activeTabId)) {
				const key = group.project?.id ?? "orphan";
				setExpandedGroups((prev) => {
					if (prev.has(key)) return prev;
					const next = new Set(prev);
					next.add(key);
					return next;
				});
				break;
			}
		}
	}, [activeTabId, tabs, projectGroups]);

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
			}
			// null means user cancelled — do nothing
		} catch {
			// Native dialog not available (browser mode) — show text input
			setShowAddProjectInput(true);
		} finally {
			setIsAddingProject(false);
		}
	}, [isConnected, isAddingProject]);

	const handleAddProjectFromInput = useCallback(
		async (cwd: string) => {
			setShowAddProjectInput(false);
			if (!isConnected) return;
			await addProject(cwd);
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

	/**
	 * Create a new session inside a specific project.
	 *
	 * If the active tab is already in this project and has zero messages,
	 * reuse it instead of creating another empty session.
	 * Otherwise, creates a fresh tab + Pi session.
	 */
	const handleNewSessionInProject = useCallback(
		async (project: Project) => {
			if (!isConnected || isCreating) return;

			// Reuse the active tab if it's in the same project and empty
			const store = useStore.getState();
			const activeTab = store.getActiveTab();
			if (
				activeTab?.cwd &&
				normalizeCwd(activeTab.cwd) === normalizeCwd(project.cwd) &&
				store.messages.length === 0
			) {
				// Already have an empty session for this project — just focus it
				if (isMobileWidth()) {
					setSidebarOpen(false);
				}
				return;
			}

			setIsCreating(true);
			try {
				store.setActiveProjectId(project.id);
				await startSession({ cwd: project.cwd });
				// Auto-close sidebar on mobile after creating
				if (isMobileWidth()) {
					setSidebarOpen(false);
				}
			} finally {
				setIsCreating(false);
			}
		},
		[isConnected, isCreating, setSidebarOpen],
	);

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

	const handleRemoveLoaded = useCallback((sessionPath: string) => {
		removeLoadedSession(sessionPath);
	}, []);

	const handleOpenSessionBrowser = useCallback((cwd: string) => {
		setSessionBrowserCwd(cwd);
	}, []);

	const handleCloseSessionBrowser = useCallback(() => {
		setSessionBrowserCwd(null);
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
					{/* Close sidebar button — visible on mobile */}
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

			{/* ── Projects header + Add button ─────────────────────────── */}
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
					Projects
				</span>
				<div className="flex items-center gap-1">
					{/* Add Project */}
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
					{/* Refresh */}
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
						aria-label="Refresh sessions"
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
			</div>

			{/* ── Unified project tree ─────────────────────────────────── */}
			<div className="flex-1 overflow-y-auto px-2 py-1">
				{/* Add project input (browser fallback) */}
				{showAddProjectInput && (
					<AddProjectInput onAdd={handleAddProjectFromInput} onCancel={handleCancelAddProject} />
				)}

				{projectGroups.length === 0 && !showAddProjectInput ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8">
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
				) : (
					<div className="flex flex-col gap-1">
						{projectGroups.map((group) => {
							const groupKey = group.project?.id ?? "orphan";
							const isExpanded = expandedGroups.has(groupKey);
							// Count only sessions with messages — excludes empty "New session" placeholders
							const activeWithMessages = group.activeSessions.filter(
								(s) => s.messageCount > 0,
							).length;
							const totalSessions = activeWithMessages + group.pastSessions.length;
							const isActiveProject = group.project?.id === activeProjectId;

							return (
								<div key={groupKey}>
									{/* ── Project header row ─────────────── */}
									<div
										className={cn(
											"group/project flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors",
											isActiveProject ? "bg-surface-secondary/50" : "hover:bg-surface-secondary/30",
										)}
									>
										{/* Expand/collapse chevron */}
										<button
											type="button"
											onClick={() => toggleGroupExpanded(groupKey)}
											className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted"
											aria-label={isExpanded ? "Collapse" : "Expand"}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")}
												aria-hidden="true"
											>
												<path
													fillRule="evenodd"
													d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06z"
													clipRule="evenodd"
												/>
											</svg>
										</button>

										{/* Favicon / folder icon */}
										{group.cwd ? (
											<ProjectFavicon
												cwd={group.cwd}
												isActive={isActiveProject}
												className="h-3.5 w-3.5"
											/>
										) : (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className="h-3.5 w-3.5 text-text-muted"
												aria-hidden="true"
											>
												<path d={FOLDER_ICON_PATH} />
											</svg>
										)}

										{/* Project name — clickable to open/focus */}
										{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by expand button */}
										<div
											className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
											onClick={() => {
												if (group.project) {
													handleOpenProject(group.project);
												}
												if (!isExpanded) {
													toggleGroupExpanded(groupKey);
												}
											}}
											onContextMenu={(e) => {
												if (group.project) {
													e.preventDefault();
													e.stopPropagation();
													handleProjectContextMenu(group.project.id, e.clientX, e.clientY);
												}
											}}
										>
											<span className="truncate text-xs font-medium text-text-primary">
												{group.displayName}
											</span>
											{totalSessions > 0 && (
												<span className="shrink-0 text-[10px] text-text-muted">
													{String(totalSessions)}
												</span>
											)}
										</div>

										{/* New session in this project — reuses empty active tab if same project */}
										{group.project && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													if (group.project && isConnected && !isCreating) {
														handleNewSessionInProject(group.project);
													}
												}}
												disabled={!isConnected || isCreating}
												className={cn(
													"flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
													!isConnected || isCreating
														? "cursor-not-allowed text-transparent"
														: "text-transparent group-hover/project:text-text-muted group-hover/project:hover:text-text-secondary",
												)}
												title="New session in this project (Ctrl+T)"
												aria-label="New session"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 16 16"
													fill="currentColor"
													className="h-3 w-3"
													aria-hidden="true"
												>
													<path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
												</svg>
											</button>
										)}

										{/* Remove project from sidebar */}
										{group.project && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													if (group.project) {
														handleRemoveProject(group.project.id);
													}
												}}
												className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-transparent transition-colors group-hover/project:text-text-muted group-hover/project:hover:text-text-secondary"
												title="Remove from sidebar"
												aria-label="Remove project"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 16 16"
													fill="currentColor"
													className="h-3 w-3"
													aria-hidden="true"
												>
													<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
												</svg>
											</button>
										)}
									</div>

									{/* ── Expanded children: unified session list ── */}
									{isExpanded && (
										<div className="ml-3 flex flex-col gap-0.5 border-l border-border-secondary pl-2 pt-0.5">
											{(() => {
												// Merge active tabs + past sessions into one list
												const entries: UnifiedSession[] = [
													...group.activeSessions.map(
														(tab): UnifiedSession => ({ kind: "active", tab }),
													),
													...group.pastSessions.map(
														(session): UnifiedSession => ({ kind: "past", session }),
													),
												];

												if (entries.length === 0 && group.project) {
													return (
														<button
															type="button"
															onClick={() => {
																if (group.project) {
																	handleNewSessionInProject(group.project);
																}
															}}
															className="px-3 py-1.5 text-left text-[11px] text-text-muted transition-colors hover:text-text-secondary"
														>
															Start a session…
														</button>
													);
												}

												return entries.map((entry) => (
													<SessionItem
														key={unifiedSessionKey(entry)}
														entry={entry}
														isActive={
															(entry.kind === "active" && entry.tab.id === activeTabId) ||
															(entry.kind === "past" &&
																!!piSessionId &&
																entry.session.sessionId === piSessionId)
														}
														isSwitching={
															entry.kind === "past" && switchingPath === entry.session.sessionPath
														}
														onClickActive={handleSwitchTab}
														onClickPast={handleSwitchSession}
														onRemoveLoaded={handleRemoveLoaded}
													/>
												));
											})()}

											{/* Browse past sessions for this project */}
											{group.cwd && (
												<button
													type="button"
													onClick={() => {
														if (group.cwd) {
															handleOpenSessionBrowser(group.cwd);
														}
													}}
													className="flex items-center gap-1 px-3 py-1 text-left text-[11px] text-text-muted transition-colors hover:text-text-secondary"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 16 16"
														fill="currentColor"
														className="h-2.5 w-2.5"
														aria-hidden="true"
													>
														<path
															fillRule="evenodd"
															d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
															clipRule="evenodd"
														/>
													</svg>
													Browse past sessions…
												</button>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}

				{/* ── Plugin Sidebar Panels ─────────────────────────────── */}
				<PluginSidebarPanels />
			</div>

			{/* ── Update Footer ────────────────────────────────────────── */}
			<SidebarUpdateFooter />
		</>
	);

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

			{/* Session browser dialog — filtered to a specific project CWD */}
			{sessionBrowserCwd && (
				<SessionBrowserDialog cwd={sessionBrowserCwd} onClose={handleCloseSessionBrowser} />
			)}
		</>
	);
}
