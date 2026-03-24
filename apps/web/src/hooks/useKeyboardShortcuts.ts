/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 *
 * Registers a document-level keydown listener that handles:
 * - Ctrl/Cmd+C — abort streaming (when streaming and no text selected)
 * - Ctrl/Cmd+L — toggle model selector
 * - Ctrl/Cmd+M — cycle model
 * - Ctrl/Cmd+N — create new session
 * - Ctrl/Cmd+B — toggle sidebar
 * - Ctrl/Cmd+G — toggle git panel
 * - Ctrl/Cmd+T — new tab
 * - Ctrl/Cmd+W — close active tab
 * - Ctrl/Cmd+Tab — next tab
 * - Ctrl/Cmd+Shift+Tab — previous tab
 * - Ctrl/Cmd+1-9 — jump to tab by position
 * - Ctrl/Cmd+` — toggle terminal panel
 * - Ctrl/Cmd+Shift+K — compact context
 * - Ctrl/Cmd+Shift+M — cycle thinking level
 * - Ctrl/Cmd+Shift+T — toggle thinking selector
 *
 * Reads store state imperatively (via getState) to avoid unnecessary
 * re-renders. Must be mounted once at the app level (AppShell).
 */

import { createTerminal } from "@/lib/appActions";
import { compactSession, fetchSessionList, startNewSession } from "@/lib/sessionActions";
import { closeTab, createNewTab, switchTabAction } from "@/lib/tabActions";
import { emitShortcut } from "@/lib/utils";
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
			// Ignore if Alt is held (different shortcut family)
			if (e.altKey) return;

			const state = useStore.getState();
			const isConnected = state.connectionStatus === "open";
			const key = e.key.toLowerCase();

			// ── Shift combos (Ctrl/Cmd+Shift+Key) ────────────────────
			if (e.shiftKey) {
				switch (key) {
					case "k": {
						// Ctrl/Cmd+Shift+K — compact context
						if (isConnected && state.sessionId) {
							e.preventDefault();
							emitShortcut("compact");
							compactSession().catch((err: unknown) => {
								console.error("[Shortcut] Failed to compact:", err);
							});
						}
						break;
					}
					case "m": {
						// Ctrl/Cmd+Shift+M — cycle thinking level
						if (isConnected && state.sessionId) {
							e.preventDefault();
							emitShortcut("cycleThinking");
							getTransport()
								.request("session.cycleThinking")
								.then((result) => {
									if (result.level) {
										useStore.getState().setThinkingLevel(result.level);
										useStore.getState().addToast(`Thinking: ${result.level}`, "info");
									} else {
										useStore.getState().addToast("Model doesn't support thinking", "warning");
									}
								})
								.catch((err: unknown) => {
									const msg = err instanceof Error ? err.message : String(err);
									useStore.getState().setLastError(`Failed to cycle thinking: ${msg}`);
								});
						}
						break;
					}
					case "b": {
						// Ctrl/Cmd+Shift+B — toggle bash command input
						if (isConnected) {
							e.preventDefault();
							emitShortcut("toggleBashInput");
							const s = useStore.getState();
							s.setBashInputOpen(!s.bashInputOpen);
						}
						break;
					}
					case "c": {
						// Ctrl/Cmd+Shift+C — copy last assistant response
						if (isConnected && state.sessionId && !hasTextSelection()) {
							e.preventDefault();
							emitShortcut("copyLastResponse");
							getTransport()
								.request("session.getLastAssistantText")
								.then((result) => {
									if (result.text) {
										navigator.clipboard.writeText(result.text).then(() => {
											useStore.getState().addToast("Last response copied", "info");
										});
									} else {
										useStore.getState().addToast("No assistant response to copy", "warning");
									}
								})
								.catch((err: unknown) => {
									const msg = err instanceof Error ? err.message : String(err);
									useStore.getState().setLastError(`Failed to copy last response: ${msg}`);
								});
						}
						break;
					}
					case "t": {
						// Ctrl/Cmd+Shift+T — toggle thinking selector
						if (isConnected) {
							e.preventDefault();
							emitShortcut("toggleThinkingSelector");
						}
						break;
					}
					case "e": {
						// Ctrl/Cmd+Shift+E — toggle export dialog
						if (isConnected && state.sessionId) {
							e.preventDefault();
							emitShortcut("toggleExportDialog");
						}
						break;
					}
					case "p": {
						// Ctrl/Cmd+Shift+P — toggle plugin manager
						if (isConnected) {
							e.preventDefault();
							emitShortcut("togglePluginManager");
						}
						break;
					}
					case "tab": {
						// Ctrl/Cmd+Shift+Tab — previous tab
						if (state.tabs.length > 1 && state.activeTabId) {
							e.preventDefault();
							emitShortcut("prevTab");
							const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
							const prevIdx = idx <= 0 ? state.tabs.length - 1 : idx - 1;
							const prevTab = state.tabs[prevIdx];
							if (prevTab) {
								switchTabAction(prevTab.id).catch((err: unknown) => {
									console.error("[Shortcut] Failed to switch tab:", err);
								});
							}
						}
						break;
					}
				}
				return;
			}

			// ── Non-shift combos (Ctrl/Cmd+Key) ─────────────────────
			switch (key) {
				case "m": {
					// Ctrl/Cmd+M — cycle model
					if (isConnected && state.sessionId) {
						e.preventDefault();
						emitShortcut("cycleModel");
						getTransport()
							.request("session.cycleModel")
							.then((result) => {
								if (result.model) {
									useStore.getState().setModel(result.model);
									if (result.thinkingLevel) {
										useStore.getState().setThinkingLevel(result.thinkingLevel);
									}
									useStore
										.getState()
										.addToast(`Model: ${result.model.name || result.model.id}`, "info");
								} else {
									useStore.getState().addToast("Only one model available", "warning");
								}
							})
							.catch((err: unknown) => {
								const msg = err instanceof Error ? err.message : String(err);
								useStore.getState().setLastError(`Failed to cycle model: ${msg}`);
							});
					}
					break;
				}
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
				case "d": {
					// Ctrl/Cmd+D — toggle diff panel
					e.preventDefault();
					emitShortcut("toggleDiffPanel");
					useStore.getState().toggleDiffPanel();
					break;
				}
				case "g": {
					// Ctrl/Cmd+G — toggle git panel
					e.preventDefault();
					emitShortcut("toggleGitPanel");
					useStore.getState().toggleGitPanel();
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
				case "t": {
					// Ctrl/Cmd+T — new tab
					if (isConnected) {
						e.preventDefault();
						emitShortcut("newTab");
						createNewTab().catch((err: unknown) => {
							console.error("[Shortcut] Failed to create new tab:", err);
						});
					}
					break;
				}
				case "w": {
					// Ctrl/Cmd+W — close active tab
					if (state.tabs.length > 1 && state.activeTabId) {
						e.preventDefault();
						emitShortcut("closeTab");
						closeTab(state.activeTabId).catch((err: unknown) => {
							console.error("[Shortcut] Failed to close tab:", err);
						});
					}
					break;
				}
				case "tab": {
					// Ctrl/Cmd+Tab — next tab (Shift+Tab handled above)
					if (state.tabs.length > 1 && state.activeTabId) {
						e.preventDefault();
						emitShortcut("nextTab");
						const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
						const nextIdx = idx >= state.tabs.length - 1 ? 0 : idx + 1;
						const nextTab = state.tabs[nextIdx];
						if (nextTab) {
							switchTabAction(nextTab.id).catch((err: unknown) => {
								console.error("[Shortcut] Failed to switch tab:", err);
							});
						}
					}
					break;
				}
				case ",": {
					// Ctrl/Cmd+, — toggle settings dialog
					e.preventDefault();
					const uiState = useStore.getState();
					uiState.setSettingsOpen(!uiState.settingsOpen);
					break;
				}
				case "`": {
					// Ctrl/Cmd+` — toggle terminal panel
					e.preventDefault();
					emitShortcut("toggleTerminal");
					const termState = useStore.getState();
					if (termState.terminalPanelOpen) {
						termState.setTerminalPanelOpen(false);
					} else if (termState.terminalTabs.length > 0) {
						// Re-open panel with existing terminals
						termState.setTerminalPanelOpen(true);
					} else if (isConnected) {
						// No terminals — create one and open panel
						createTerminal().catch((err: unknown) => {
							console.error("[Shortcut] Failed to create terminal:", err);
						});
					}
					break;
				}
				case "1":
				case "2":
				case "3":
				case "4":
				case "5":
				case "6":
				case "7":
				case "8":
				case "9": {
					// Ctrl/Cmd+1-9 — jump to tab N
					if (state.tabs.length > 1) {
						const tabIndex = Number.parseInt(key, 10) - 1;
						const targetTab = state.tabs[tabIndex];
						if (targetTab && targetTab.id !== state.activeTabId) {
							e.preventDefault();
							switchTabAction(targetTab.id).catch((err: unknown) => {
								console.error("[Shortcut] Failed to jump to tab:", err);
							});
						}
					}
					break;
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
