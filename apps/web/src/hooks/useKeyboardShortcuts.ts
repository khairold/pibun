/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 *
 * Resolves keydown events against the configurable keybinding system
 * (defaults + user overrides from `~/.pibun/keybindings.json`).
 *
 * Command dispatch is centralized here. The keybinding resolver
 * determines WHICH command to run; this hook determines HOW to run it.
 *
 * Must be mounted once at the app level (AppShell).
 */

import { createTerminal, splitTerminal } from "@/lib/appActions";
import type { WhenContext } from "@/lib/keybindings";
import { getActiveBindings, resolveCommand } from "@/lib/keybindings";
import { compactSession, fetchSessionList, startNewSession } from "@/lib/sessionActions";
import { closeTab, createNewTab, switchTabAction } from "@/lib/tabActions";
import { emitShortcut } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { useEffect } from "react";

/** Check if there's a text selection in the document. */
function hasTextSelection(): boolean {
	const selection = window.getSelection();
	return selection !== null && selection.toString().length > 0;
}

/** Build the current `when` context from store state. */
function buildWhenContext(): WhenContext {
	const state = useStore.getState();
	return {
		terminalFocus:
			state.terminalPanelOpen &&
			document.activeElement?.closest("[data-terminal-container]") !== null,
		terminalOpen: state.terminalPanelOpen,
		streaming: state.isStreaming,
		hasSession: state.sessionId !== null,
		isConnected: state.connectionStatus === "open",
	};
}

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Must have at least one modifier (Ctrl or Cmd)
			if (!e.metaKey && !e.ctrlKey) return;
			// Ignore if Alt is held (different shortcut family)
			if (e.altKey) return;

			const bindings = getActiveBindings();
			const context = buildWhenContext();
			const command = resolveCommand(e, bindings, context);

			if (!command) return;

			const state = useStore.getState();
			const isConnected = state.connectionStatus === "open";

			// Dispatch command
			switch (command) {
				case "abort": {
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
				case "compact": {
					if (isConnected && state.sessionId) {
						e.preventDefault();
						emitShortcut("compact");
						compactSession().catch((err: unknown) => {
							console.error("[Shortcut] Failed to compact:", err);
						});
					}
					break;
				}
				case "copyLastResponse": {
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
				case "cycleModel": {
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
				case "cycleThinking": {
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
				case "newSession": {
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
				case "newTab": {
					if (isConnected) {
						e.preventDefault();
						emitShortcut("newTab");
						// Create new tab in the active tab's CWD (project-scoped)
						const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
						createNewTab(activeTab?.cwd ? { cwd: activeTab.cwd } : undefined).catch(
							(err: unknown) => {
								console.error("[Shortcut] Failed to create new tab:", err);
							},
						);
					}
					break;
				}
				case "closeTab": {
					if (state.tabs.length > 1 && state.activeTabId) {
						e.preventDefault();
						emitShortcut("closeTab");
						closeTab(state.activeTabId).catch((err: unknown) => {
							console.error("[Shortcut] Failed to close tab:", err);
						});
					}
					break;
				}
				case "nextTab": {
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
				case "prevTab": {
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
				case "jumpToTab1":
				case "jumpToTab2":
				case "jumpToTab3":
				case "jumpToTab4":
				case "jumpToTab5":
				case "jumpToTab6":
				case "jumpToTab7":
				case "jumpToTab8":
				case "jumpToTab9": {
					if (state.tabs.length > 1) {
						const tabIndex = Number.parseInt(command.replace("jumpToTab", ""), 10) - 1;
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
				case "settings": {
					e.preventDefault();
					const uiState = useStore.getState();
					uiState.setSettingsOpen(!uiState.settingsOpen);
					break;
				}
				case "toggleSidebar": {
					e.preventDefault();
					emitShortcut("toggleSidebar");
					break;
				}
				case "toggleDiffPanel": {
					e.preventDefault();
					emitShortcut("toggleDiffPanel");
					useStore.getState().toggleDiffPanel();
					break;
				}
				case "toggleGitPanel": {
					e.preventDefault();
					emitShortcut("toggleGitPanel");
					useStore.getState().toggleGitPanel();
					break;
				}
				case "toggleModelSelector": {
					if (isConnected) {
						e.preventDefault();
						emitShortcut("toggleModelSelector");
					}
					break;
				}
				case "toggleThinkingSelector": {
					if (isConnected) {
						e.preventDefault();
						emitShortcut("toggleThinkingSelector");
					}
					break;
				}
				case "toggleExportDialog": {
					if (isConnected && state.sessionId) {
						e.preventDefault();
						emitShortcut("toggleExportDialog");
					}
					break;
				}
				case "togglePluginManager": {
					if (isConnected) {
						e.preventDefault();
						emitShortcut("togglePluginManager");
					}
					break;
				}
				case "toggleBashInput": {
					if (isConnected) {
						e.preventDefault();
						emitShortcut("toggleBashInput");
						const s = useStore.getState();
						s.setBashInputOpen(!s.bashInputOpen);
					}
					break;
				}
				case "splitTerminal": {
					if (
						isConnected &&
						state.terminalPanelOpen &&
						state.terminalTabs.some((t) => t.ownerTabId === state.activeTabId)
					) {
						e.preventDefault();
						emitShortcut("splitTerminal");
						splitTerminal().catch((err: unknown) => {
							console.error("[Shortcut] Failed to split terminal:", err);
						});
					}
					break;
				}
				case "toggleTerminal": {
					e.preventDefault();
					emitShortcut("toggleTerminal");
					const termState = useStore.getState();
					const hasOwnedTerminals = termState.terminalTabs.some(
						(t) => t.ownerTabId === termState.activeTabId,
					);
					if (termState.terminalPanelOpen) {
						termState.setTerminalPanelOpen(false);
					} else if (hasOwnedTerminals) {
						termState.setTerminalPanelOpen(true);
					} else if (isConnected) {
						createTerminal().catch((err: unknown) => {
							console.error("[Shortcut] Failed to create terminal:", err);
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
