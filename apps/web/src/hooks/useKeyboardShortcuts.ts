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
	const terminalOpen = state.activeContentTab !== "chat";
	return {
		terminalFocus:
			terminalOpen && document.activeElement?.closest("[data-terminal-container]") !== null,
		terminalOpen,
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
				case "contentTab1":
				case "contentTab2":
				case "contentTab3":
				case "contentTab4":
				case "contentTab5":
				case "contentTab6":
				case "contentTab7":
				case "contentTab8":
				case "contentTab9": {
					e.preventDefault();
					const tabIndex = Number(command.slice(-1)) - 1; // 0-based: 0=chat, 1=first terminal, etc.
					const ctState = useStore.getState();
					if (tabIndex === 0) {
						// mod+1 = always chat
						ctState.setActiveContentTab("chat");
					} else {
						// mod+2-9 = terminal tabs by position (1-based index into project terminals)
						const ctActiveProjectPath = ctState.getActiveTab()?.cwd ?? "";
						if (ctActiveProjectPath) {
							const ctProjectTerminals = ctState.terminalTabs.filter(
								(t) => t.projectPath === ctActiveProjectPath,
							);
							const targetTerminal = ctProjectTerminals[tabIndex - 1]; // -1 because tabIndex 1 = first terminal
							if (targetTerminal) {
								ctState.setActiveContentTab(targetTerminal.id);
							}
						}
					}
					break;
				}
				case "splitTerminal": {
					const splitActiveTabCwd = state.getActiveTab()?.cwd ?? "";
					if (
						isConnected &&
						state.activeContentTab !== "chat" &&
						state.terminalTabs.some((t) => t.projectPath === splitActiveTabCwd)
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
					const toggleActiveTabCwd = termState.getActiveTab()?.cwd ?? "";
					const hasOwnedTerminals = termState.terminalTabs.some(
						(t) => t.projectPath === toggleActiveTabCwd,
					);
					if (termState.activeContentTab !== "chat") {
						// Currently on a terminal tab — switch back to chat
						termState.setActiveContentTab("chat");
					} else if (hasOwnedTerminals) {
						// On chat tab with existing terminals — switch to the active terminal
						const targetTab =
							termState.activeTerminalTabId ??
							termState.terminalTabs.find((t) => t.projectPath === toggleActiveTabCwd)?.id;
						if (targetTab) {
							termState.setActiveContentTab(targetTab);
						}
					} else if (isConnected) {
						// No terminals exist — create one (auto-switches via createTerminal)
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
