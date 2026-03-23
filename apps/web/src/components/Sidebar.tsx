/**
 * Sidebar — session list with switch, current session info, new session button.
 *
 * Responsive behavior:
 * - On narrow viewports (< md): overlay panel with backdrop, slides in from left
 * - On desktop viewports (≥ md): inline panel, toggleable via Ctrl/Cmd+B
 * - Controlled by `sidebarOpen` state in the UI slice
 * - Clicking a session or the backdrop on mobile auto-closes the sidebar
 */

import { cn } from "@/lib/cn";
import { fetchSessionList, startNewSession, switchSession } from "@/lib/sessionActions";
import { onShortcut } from "@/lib/shortcuts";
import { useStore } from "@/store";
import type { WsSessionSummary } from "@pibun/contracts";
import { memo, useCallback, useEffect, useState } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Tailwind `md` breakpoint in pixels. */
const MD_BREAKPOINT = 768;

// ============================================================================
// Session Item
// ============================================================================

interface SessionItemProps {
	session: WsSessionSummary;
	isCurrent: boolean;
	onSwitch: (sessionPath: string) => void;
	isSwitching: boolean;
}

const SessionItem = memo(function SessionItem({
	session,
	isCurrent,
	onSwitch,
	isSwitching,
}: SessionItemProps) {
	const displayName = session.name ?? session.firstMessage ?? formatSessionId(session.sessionId);
	const dateStr = formatDate(session.createdAt);

	return (
		<button
			type="button"
			onClick={() => {
				if (!isCurrent && !isSwitching) {
					onSwitch(session.sessionPath);
				}
			}}
			disabled={isSwitching}
			className={cn(
				"group flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
				isCurrent
					? "bg-neutral-800 text-neutral-100"
					: "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200",
				isSwitching && "cursor-wait opacity-60",
			)}
		>
			<div className="flex items-center gap-2">
				{/* Current indicator dot */}
				{isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
				<span className="truncate text-sm font-medium">{displayName}</span>
			</div>
			<span className="truncate text-xs text-neutral-500">
				{dateStr}
				{session.messageCount > 0 ? ` · ${session.messageCount} msgs` : ""}
			</span>
		</button>
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

/** Check if the current viewport is below the md breakpoint. */
function isMobileWidth(): boolean {
	return typeof window !== "undefined" && window.innerWidth < MD_BREAKPOINT;
}

// ============================================================================
// Sidebar Component
// ============================================================================

export function Sidebar() {
	const connectionStatus = useStore((s) => s.connectionStatus);
	const sessionFile = useStore((s) => s.sessionFile);
	const sessionList = useStore((s) => s.sessionList);
	const sessionListLoading = useStore((s) => s.sessionListLoading);
	const sessionName = useStore((s) => s.sessionName);
	const model = useStore((s) => s.model);
	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const setSidebarOpen = useStore((s) => s.setSidebarOpen);

	const [isCreating, setIsCreating] = useState(false);
	const [switchingPath, setSwitchingPath] = useState<string | null>(null);

	const isConnected = connectionStatus === "open";

	// Subscribe to toggle sidebar shortcut (Ctrl/Cmd+B)
	useEffect(() => {
		return onShortcut((action) => {
			if (action === "toggleSidebar") {
				toggleSidebar();
			}
		});
	}, [toggleSidebar]);

	// Auto-close sidebar on resize from mobile to desktop (and vice versa)
	// to keep sidebar state in sync with viewport width
	useEffect(() => {
		let lastWasMobile = isMobileWidth();

		function handleResize() {
			const nowMobile = isMobileWidth();
			if (lastWasMobile && !nowMobile) {
				// Crossed from mobile → desktop: open sidebar
				setSidebarOpen(true);
			} else if (!lastWasMobile && nowMobile) {
				// Crossed from desktop → mobile: close sidebar
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

	const handleNewSession = useCallback(async () => {
		if (!isConnected || isCreating) return;
		setIsCreating(true);
		try {
			await startNewSession();
			await fetchSessionList();
		} finally {
			setIsCreating(false);
		}
	}, [isConnected, isCreating]);

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

	const handleRefresh = useCallback(() => {
		if (isConnected) {
			fetchSessionList();
		}
	}, [isConnected]);

	const handleBackdropClick = useCallback(() => {
		setSidebarOpen(false);
	}, [setSidebarOpen]);

	// The sidebar panel content (shared between mobile overlay and desktop inline)
	const sidebarContent = (
		<>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
				<h1 className="text-sm font-bold tracking-tight text-neutral-200">PiBun</h1>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleNewSession}
						disabled={!isConnected || isCreating}
						title="New Session (Ctrl+N)"
						className={cn(
							"flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
							!isConnected || isCreating
								? "cursor-not-allowed text-neutral-600"
								: "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200",
						)}
					>
						{/* Plus icon */}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-3.5 w-3.5"
							aria-label="New session"
							role="img"
						>
							<path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
						</svg>
						{isCreating ? "Creating…" : "New"}
					</button>
					{/* Close sidebar button — visible on mobile, hidden on desktop */}
					<button
						type="button"
						onClick={() => setSidebarOpen(false)}
						className="rounded-md p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 md:hidden"
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

			{/* Current session info */}
			{model && (
				<div className="border-b border-neutral-800 px-4 py-2">
					<div className="text-xs text-neutral-500">Current session</div>
					<div className="mt-0.5 truncate text-sm text-neutral-300">{sessionName ?? "Unnamed"}</div>
					<div className="mt-0.5 truncate text-xs text-neutral-500">{model.name}</div>
				</div>
			)}

			{/* Session list header */}
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
					Sessions
				</span>
				<button
					type="button"
					onClick={handleRefresh}
					disabled={!isConnected || sessionListLoading}
					title="Refresh session list"
					className={cn(
						"rounded p-0.5 transition-colors",
						sessionListLoading
							? "animate-spin text-neutral-500"
							: "text-neutral-600 hover:text-neutral-400",
					)}
				>
					{/* Refresh icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3"
						aria-label="Refresh sessions"
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

			{/* Session list */}
			<div className="flex-1 overflow-y-auto px-2 py-1">
				{sessionListLoading && sessionList.length === 0 ? (
					<div className="flex items-center justify-center py-8">
						<span className="text-xs text-neutral-600">Loading sessions…</span>
					</div>
				) : sessionList.length === 0 ? (
					<div className="flex items-center justify-center py-8">
						<span className="text-xs text-neutral-600">No sessions yet</span>
					</div>
				) : (
					<div className="flex flex-col gap-0.5">
						{sessionList.map((session) => (
							<SessionItem
								key={session.sessionPath}
								session={session}
								isCurrent={sessionFile === session.sessionPath}
								onSwitch={handleSwitchSession}
								isSwitching={switchingPath === session.sessionPath}
							/>
						))}
					</div>
				)}
			</div>

			{/* Footer — session count */}
			<div className="border-t border-neutral-800 px-4 py-2">
				<span className="text-xs text-neutral-600">
					{sessionList.length} session{sessionList.length !== 1 ? "s" : ""}
				</span>
			</div>
		</>
	);

	return (
		<>
			{/* Mobile backdrop — shown when sidebar is open below md breakpoint */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
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
					"z-50 flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900",
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
