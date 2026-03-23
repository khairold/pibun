/**
 * Terminal actions — coordinate transport + store for terminal lifecycle.
 *
 * Handles creating, closing, and writing to terminal sessions.
 * Terminal data/exit push channels are wired separately in wireTransport.ts.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";

/**
 * Create a new terminal tab and spawn a PTY on the server.
 * Optionally pass a CWD; defaults to the active session's CWD.
 */
export async function createTerminal(cwd?: string): Promise<string | null> {
	const store = useStore.getState();
	const transport = getTransport();

	// Resolve CWD: explicit → active tab's CWD → no CWD (server will use process.cwd())
	let resolvedCwd = cwd;
	if (!resolvedCwd) {
		const activeTab = store.getActiveTab();
		if (activeTab?.cwd) {
			resolvedCwd = activeTab.cwd;
		}
	}

	try {
		const result = await transport.request("terminal.create", {
			...(resolvedCwd ? { cwd: resolvedCwd } : {}),
		});
		const terminalId = result.terminalId;

		// Add terminal tab to store and open panel
		const tabId = store.addTerminalTab(terminalId, resolvedCwd ?? "~");
		store.setTerminalPanelOpen(true);

		return tabId;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		useStore.getState().setLastError(`Failed to create terminal: ${msg}`);
		return null;
	}
}

/**
 * Close a terminal tab and kill the PTY on the server.
 */
export async function closeTerminal(tabId: string): Promise<void> {
	const store = useStore.getState();
	const tab = store.terminalTabs.find((t) => t.id === tabId);
	if (!tab) return;

	const transport = getTransport();

	// Remove from store first (prevents re-entrant issues — MEMORY #35 pattern)
	store.removeTerminalTab(tabId);

	try {
		await transport.request("terminal.close", { terminalId: tab.terminalId });
	} catch {
		// Terminal may already be dead — ignore errors
	}
}

/**
 * Write data to a terminal's stdin.
 */
export function writeTerminal(terminalId: string, data: string): void {
	const transport = getTransport();
	transport.request("terminal.write", { terminalId, data }).catch((err: unknown) => {
		console.error("[Terminal] Failed to write:", err);
	});
}

/**
 * Resize a terminal's PTY dimensions.
 */
export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
	const transport = getTransport();
	transport.request("terminal.resize", { terminalId, cols, rows }).catch((err: unknown) => {
		console.error("[Terminal] Failed to resize:", err);
	});
}
