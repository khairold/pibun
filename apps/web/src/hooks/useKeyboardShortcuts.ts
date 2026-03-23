/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 *
 * Registers a document-level keydown listener that handles:
 * - Ctrl/Cmd+C — abort streaming (when streaming and no text selected)
 * - Ctrl/Cmd+L — toggle model selector
 * - Ctrl/Cmd+N — create new session
 *
 * Reads store state imperatively (via getState) to avoid unnecessary
 * re-renders. Must be mounted once at the app level (AppShell).
 */

import { fetchSessionList, startNewSession } from "@/lib/sessionActions";
import { emitShortcut } from "@/lib/shortcuts";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { useEffect } from "react";

/** Check if the platform modifier key is pressed (Ctrl or Cmd). */
function isPlatformMod(e: KeyboardEvent): boolean {
	return e.metaKey || e.ctrlKey;
}

/** Check if there's a text selection in the document. */
function hasTextSelection(): boolean {
	const selection = window.getSelection();
	return selection !== null && selection.toString().length > 0;
}

export function useKeyboardShortcuts(): void {
	// Effect runs once — reads store imperatively inside the handler
	// so no reactive dependencies needed.
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Only handle platform modifier combos (Ctrl/Cmd + key)
			if (!isPlatformMod(e)) return;
			// Ignore if Alt or Shift is also held (different shortcut)
			if (e.altKey || e.shiftKey) return;

			const state = useStore.getState();
			const isConnected = state.connectionStatus === "open";

			switch (e.key.toLowerCase()) {
				case "c": {
					// Ctrl/Cmd+C — abort streaming
					// Only abort if streaming AND no text is selected (preserve copy)
					if (state.isStreaming && !hasTextSelection()) {
						e.preventDefault();
						getTransport()
							.request("session.abort")
							.catch((err: unknown) => {
								const msg = err instanceof Error ? err.message : String(err);
								useStore.getState().setLastError(`Failed to abort: ${msg}`);
							});
					}
					break;
				}
				case "l": {
					// Ctrl/Cmd+L — toggle model selector
					if (isConnected) {
						e.preventDefault();
						emitShortcut("toggleModelSelector");
					}
					break;
				}
				case "b": {
					// Ctrl/Cmd+B — toggle sidebar
					e.preventDefault();
					emitShortcut("toggleSidebar");
					break;
				}
				case "n": {
					// Ctrl/Cmd+N — new session
					if (isConnected) {
						e.preventDefault();
						startNewSession()
							.then(() => fetchSessionList())
							.catch((err: unknown) => {
								console.error("[Shortcut] Failed to create new session:", err);
							});
					}
					break;
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
