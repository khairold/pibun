/**
 * useWindowTitle — sync document.title and native window title with active project/tab state.
 *
 * Title format:
 * - Active project: "{ProjectName} — PiBun"
 * - Tab with CWD but no project: "{cwdBasename} — PiBun"
 * - No tab or CWD: "PiBun"
 *
 * Sets `document.title` for browser mode and calls `app.setWindowTitle`
 * for the desktop native window. The server handler silently succeeds
 * in browser mode (no hook registered), so the WS call is always safe.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { useEffect } from "react";

const APP_TITLE = "PiBun";

/** Extract the last segment of a path (basename). */
function basename(cwd: string): string {
	const trimmed = cwd.replace(/\/+$/, "");
	const lastSlash = trimmed.lastIndexOf("/");
	return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

/**
 * Compute the window title from the current app state.
 *
 * Priority:
 * 1. Active project name
 * 2. Active tab's CWD basename
 * 3. Just "PiBun"
 */
function computeTitle(
	activeProjectId: string | null,
	projects: Array<{ id: string; name: string }>,
	activeTabCwd: string | null,
): string {
	// Try to find the active project's name
	if (activeProjectId) {
		const project = projects.find((p) => p.id === activeProjectId);
		if (project) {
			return `${project.name} — ${APP_TITLE}`;
		}
	}

	// Fall back to the active tab's CWD basename
	if (activeTabCwd) {
		return `${basename(activeTabCwd)} — ${APP_TITLE}`;
	}

	return APP_TITLE;
}

/**
 * Hook that keeps the document title and native window title in sync
 * with the active project and tab state.
 *
 * Call once in AppShell.
 */
export function useWindowTitle(): void {
	const activeProjectId = useStore((s) => s.activeProjectId);
	const projects = useStore((s) => s.projects);
	const activeTabId = useStore((s) => s.activeTabId);
	const tabs = useStore((s) => s.tabs);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const extensionTitle = useStore((s) => s.extensionTitle);

	useEffect(() => {
		// Extension title override takes precedence over computed title
		const activeTab = tabs.find((t) => t.id === activeTabId);
		const activeTabCwd = activeTab?.cwd ?? null;
		const title = extensionTitle ?? computeTitle(activeProjectId, projects, activeTabCwd);

		// Always set document.title (works in browser and webview)
		document.title = title;

		// Also update the native window title via WS (fire-and-forget).
		// Only attempt when connected — the server silently succeeds in browser mode.
		if (connectionStatus === "open") {
			try {
				getTransport()
					.request("app.setWindowTitle", { title })
					.catch(() => {
						// Silently ignore — not critical if native title update fails
					});
			} catch {
				// Transport not initialized — ignore
			}
		}
	}, [activeProjectId, projects, activeTabId, tabs, connectionStatus, extensionTitle]);
}
