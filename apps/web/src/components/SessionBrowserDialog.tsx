/**
 * SessionBrowserDialog — modal for browsing past sessions in a project.
 *
 * Scoped to a single project CWD. Shows all sessions for that directory
 * from Pi's filesystem. Sessions already visible in the sidebar (running
 * or loaded) are marked. Clicking "Load" adds a session to the sidebar.
 *
 * Opened via the "Browse past sessions…" link under each project in the Sidebar.
 */

import { fetchSessionList } from "@/lib/sessionActions";
import { cn } from "@/lib/utils";
import { addLoadedSession, removeLoadedSession } from "@/lib/appActions";
import { useStore } from "@/store";
import type { WsSessionSummary } from "@pibun/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Helpers
// ============================================================================

/** Format an ISO date string to a readable format. */
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
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

/** Get display name for a session. */
function sessionDisplayName(session: WsSessionSummary): string {
	return session.name ?? session.firstMessage ?? session.sessionId.slice(0, 8);
}

/** Normalize CWD for comparison (strip trailing slash). */
function normalizeCwd(cwd: string): string {
	return cwd.replace(/\/$/, "");
}

// ============================================================================
// Session Row
// ============================================================================

const SessionRow = memo(function SessionRow({
	session,
	isLoaded,
	isRunning,
	onToggleLoaded,
}: {
	session: WsSessionSummary;
	isLoaded: boolean;
	isRunning: boolean;
	onToggleLoaded: (sessionPath: string, currentlyLoaded: boolean) => void;
}) {
	const displayName = sessionDisplayName(session);
	const isVisible = isLoaded || isRunning;

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
				isVisible ? "bg-surface-secondary/50" : "hover:bg-surface-secondary/30",
			)}
		>
			{/* Status dot */}
			<span className="flex h-4 w-4 shrink-0 items-center justify-center">
				{isRunning ? (
					<span className="h-2 w-2 animate-pulse rounded-full bg-accent-primary" />
				) : isLoaded ? (
					<span className="h-2 w-2 rounded-full bg-text-muted" />
				) : (
					<span className="h-2 w-2 rounded-full border border-border-primary" />
				)}
			</span>

			{/* Session info */}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm text-text-primary">{displayName}</div>
				<div className="text-xs text-text-muted">
					{formatDate(session.createdAt)}
					{session.messageCount > 0 ? ` · ${String(session.messageCount)} msgs` : ""}
				</div>
			</div>

			{/* Action button */}
			{isRunning ? (
				<span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-text">
					Running
				</span>
			) : (
				<button
					type="button"
					onClick={() => onToggleLoaded(session.sessionPath, isLoaded)}
					className={cn(
						"shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
						isLoaded
							? "bg-surface-tertiary text-text-secondary hover:bg-status-error/10 hover:text-status-error"
							: "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover",
					)}
				>
					{isLoaded ? "Remove" : "Load"}
				</button>
			)}
		</div>
	);
});

// ============================================================================
// Dialog
// ============================================================================

export function SessionBrowserDialog({
	cwd,
	onClose,
}: {
	/** Project CWD to filter sessions by. */
	cwd: string;
	onClose: () => void;
}) {
	const sessionList = useStore((s) => s.sessionList);
	const loadedSessionPaths = useStore((s) => s.loadedSessionPaths);
	const tabs = useStore((s) => s.tabs);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [filter, setFilter] = useState("");

	// Fetch fresh session list on open
	useEffect(() => {
		fetchSessionList();
	}, []);

	// Close on Escape
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Running session Pi UUIDs (from tabs with active Pi processes).
	// Uses piSessionId because session list entries use Pi's internal UUIDs.
	const runningSessionIds = useMemo(() => {
		const ids = new Set<string>();
		for (const tab of tabs) {
			if (tab.piSessionId) ids.add(tab.piSessionId);
		}
		return ids;
	}, [tabs]);

	// Loaded session paths as a Set for O(1) lookup
	const loadedPathsSet = useMemo(() => new Set(loadedSessionPaths), [loadedSessionPaths]);

	// Sessions for this project CWD, optionally filtered by search
	const normalizedCwd = normalizeCwd(cwd);
	const filteredSessions = useMemo(() => {
		const cwdMatched = sessionList.filter((s) => normalizeCwd(s.cwd) === normalizedCwd);
		if (!filter.trim()) return cwdMatched;
		const q = filter.toLowerCase();
		return cwdMatched.filter((s) => sessionDisplayName(s).toLowerCase().includes(q));
	}, [sessionList, normalizedCwd, filter]);

	const handleToggleLoaded = useCallback((sessionPath: string, currentlyLoaded: boolean) => {
		if (currentlyLoaded) {
			removeLoadedSession(sessionPath);
		} else {
			addLoadedSession(sessionPath);
		}
	}, []);

	// Project display name from CWD
	const projectName = cwd.split("/").filter(Boolean).pop() ?? cwd;

	return (
		<dialog
			open
			className="fixed inset-0 z-[200] flex h-full w-full items-center justify-center border-none bg-surface-overlay/60 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			aria-label="Browse past sessions"
		>
			<div
				ref={dialogRef}
				className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-xl border border-border-primary bg-surface-primary shadow-2xl"
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border-secondary px-4 py-3">
					<div className="min-w-0">
						<h2 className="text-sm font-semibold text-text-primary">Past Sessions</h2>
						<p className="truncate text-xs text-text-muted" title={cwd}>
							{projectName}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary"
						aria-label="Close"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4"
							aria-hidden="true"
						>
							<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
						</svg>
					</button>
				</div>

				{/* Search */}
				<div className="border-b border-border-secondary px-4 py-2">
					<input
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Filter sessions…"
						className="w-full rounded-md border border-border-primary bg-surface-secondary px-3 py-1.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-primary"
						ref={(el) => el?.focus()}
					/>
				</div>

				{/* Session list */}
				<div className="flex-1 overflow-y-auto px-2 py-2">
					{filteredSessions.length === 0 ? (
						<div className="py-8 text-center text-sm text-text-muted">
							{filter ? "No sessions match your filter" : "No past sessions for this project"}
						</div>
					) : (
						<div className="flex flex-col gap-0.5">
							{filteredSessions.map((session) => (
								<SessionRow
									key={session.sessionPath}
									session={session}
									isLoaded={loadedPathsSet.has(session.sessionPath)}
									isRunning={runningSessionIds.has(session.sessionId)}
									onToggleLoaded={handleToggleLoaded}
								/>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="border-t border-border-secondary px-4 py-2 text-center">
					<span className="text-xs text-text-muted">
						{String(filteredSessions.length)} session{filteredSessions.length !== 1 ? "s" : ""}
					</span>
				</div>
			</div>
		</dialog>
	);
}
