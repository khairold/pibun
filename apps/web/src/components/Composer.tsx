/**
 * Composer — message input area with send/steer/follow-up/abort controls.
 *
 * Features:
 * - Multi-line textarea with auto-resize
 * - Enter to send (when not streaming), Shift+Enter for newline
 * - During streaming: Enter to steer, Ctrl+Enter for follow-up
 * - Abort button visible during streaming
 * - Send button (disabled when empty or while starting session)
 * - Auto-starts Pi session on first prompt if none exists
 * - Image paste from clipboard (Ctrl+V / Cmd+V)
 * - Image preview strip with remove buttons
 * - Draft persistence per tab (text + images + mentions survive tab switch and page reload)
 * - Slash command menu: type `/` at line start to see available commands
 * - File mention chips: type `@` to search files, selected files show as removable chips
 * - Terminal context chips: selected terminal text attached as context, formatted as <terminal_context> blocks on send
 */

import {
	type PersistedFileMention,
	type PersistedImageAttachment,
	clearComposerDraft,
	getComposerDraft,
	saveComposerDraft,
} from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { TerminalContext } from "@/store/types";
import { getTransport } from "@/wireTransport";
import type { PiModel, PiSlashCommand } from "@pibun/contracts";
import {
	type ClipboardEvent,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type CommandMenuItem,
	ComposerCommandMenu,
	ComposerModelPicker,
	FileMentionMenu,
	type FileMentionMenuItem,
	buildCommandMenuItems,
	buildFileMentionItems,
	detectAtTrigger,
	detectSlashTrigger,
	filterCommandMenuItems,
} from "./ComposerCommandMenu";

// ============================================================================
// Types
// ============================================================================

/** A pending image attachment before sending. */
interface ImageAttachment {
	/** Unique ID for this attachment (for key and removal). */
	id: string;
	/** Base64-encoded image data (no data-URL prefix). */
	data: string;
	/** MIME type, e.g. "image/png", "image/jpeg". */
	mimeType: string;
	/** Data URL for preview rendering (data:mimeType;base64,data). */
	previewUrl: string;
	/** File size in bytes. */
	fileSize: number;
}

/** A file mention chip in the composer. */
interface FileMention {
	/** Unique ID for this mention (for key and removal). */
	id: string;
	/** Relative path from project root. */
	path: string;
	/** File or directory. */
	kind: "file" | "directory";
}

/** Auto-incrementing counter for file mention IDs. */
let mentionIdCounter = 0;

/** Accepted image MIME types. */
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Maximum number of images that can be attached. */
const MAX_IMAGES = 10;

// ============================================================================
// Helpers
// ============================================================================

/** Extract a user-friendly error message. */
function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/** Maximum textarea height in pixels before scrolling. */
const MAX_TEXTAREA_HEIGHT = 200;

/** Format file size as human-readable string. */
function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${String(bytes)} B`;
	if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Auto-incrementing counter for image attachment IDs. */
let imageIdCounter = 0;

/**
 * Read a File (Blob) as a base64 string (without the data-URL prefix).
 * Returns the base64 data and the MIME type.
 */
function readFileAsBase64(file: File): Promise<{ data: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// result is "data:image/png;base64,iVBOR..." — extract after comma
			const commaIndex = result.indexOf(",");
			if (commaIndex === -1) {
				reject(new Error("Invalid data URL from FileReader"));
				return;
			}
			resolve({
				data: result.substring(commaIndex + 1),
				mimeType: file.type,
			});
		};
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

/**
 * Format a terminal context label like "Terminal 1 lines 5-12" or "Terminal 1 line 5".
 */
function formatTerminalContextLabel(ctx: TerminalContext): string {
	const range =
		ctx.lineStart === ctx.lineEnd
			? `line ${String(ctx.lineStart)}`
			: `lines ${String(ctx.lineStart)}-${String(ctx.lineEnd)}`;
	return `${ctx.terminalLabel} ${range}`;
}

/**
 * Build a `<terminal_context>` block from terminal contexts, following T3Code's format.
 * Each context is listed with a header and line-numbered body.
 * Returns empty string if no contexts.
 */
function buildTerminalContextBlock(contexts: TerminalContext[]): string {
	if (contexts.length === 0) return "";

	const lines: string[] = [];
	for (let i = 0; i < contexts.length; i++) {
		const ctx = contexts[i];
		if (!ctx) continue;
		lines.push(`- ${formatTerminalContextLabel(ctx)}:`);
		const textLines = ctx.text.split("\n");
		for (let j = 0; j < textLines.length; j++) {
			lines.push(`  ${String(ctx.lineStart + j)} | ${textLines[j]}`);
		}
		if (i < contexts.length - 1) {
			lines.push("");
		}
	}

	return ["<terminal_context>", ...lines, "</terminal_context>"].join("\n");
}

// ============================================================================
// BashInput — inline command execution strip above the Composer
// ============================================================================

/**
 * BashInput — a command input strip for executing shell commands via Pi's `bash` RPC.
 *
 * Shows when `bashInputOpen` is true (toggled via Ctrl+Shift+B or `/bash` slash command).
 * Commands run via Pi's bash RPC — output is added to Pi's context and shown as system messages.
 * The output will be included in the next prompt to the LLM.
 */
function BashInput() {
	const bashInputOpen = useStore((s) => s.bashInputOpen);
	const setBashInputOpen = useStore((s) => s.setBashInputOpen);
	const sessionId = useStore((s) => s.sessionId);

	const [command, setCommand] = useState("");
	const [isRunning, setIsRunning] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-focus the input when it opens
	useEffect(() => {
		if (bashInputOpen) {
			requestAnimationFrame(() => {
				inputRef.current?.focus();
			});
		}
	}, [bashInputOpen]);

	const handleSubmit = useCallback(async () => {
		const cmd = command.trim();
		if (!cmd || isRunning) return;

		setIsRunning(true);
		try {
			const { executeBash } = await import("@/lib/sessionActions");
			await executeBash(cmd);
			setCommand("");
		} finally {
			setIsRunning(false);
			// Re-focus the input after execution
			requestAnimationFrame(() => {
				inputRef.current?.focus();
			});
		}
	}, [command, isRunning]);

	const handleAbort = useCallback(async () => {
		try {
			const { abortBash } = await import("@/lib/sessionActions");
			await abortBash();
		} catch {
			// Silently ignore abort errors
		}
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === "Escape") {
				e.preventDefault();
				setBashInputOpen(false);
			} else if (e.key === "c" && (e.metaKey || e.ctrlKey) && isRunning) {
				e.preventDefault();
				handleAbort();
			}
		},
		[handleSubmit, setBashInputOpen, isRunning, handleAbort],
	);

	if (!bashInputOpen) return null;

	return (
		<div className="flex items-center gap-2 border-b border-border-primary bg-surface-secondary px-4 py-2">
			{/* Terminal icon */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				className="h-4 w-4 shrink-0 text-text-tertiary"
				aria-label="Bash command"
				role="img"
			>
				<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM5.22 5.22a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1 0 1.06l-2 2a.75.75 0 0 1-1.06-1.06L6.72 7.75 5.22 6.28a.75.75 0 0 1 0-1.06zM8.5 10.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75z" />
			</svg>

			{/* Command label */}
			<span className="shrink-0 font-mono text-xs text-text-secondary">$</span>

			{/* Command input */}
			<input
				ref={inputRef}
				type="text"
				value={command}
				onChange={(e) => setCommand(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={sessionId ? "Enter a shell command…" : "Start a session first"}
				disabled={!sessionId}
				className={cn(
					"flex-1 bg-transparent font-mono text-sm text-text-primary",
					"placeholder-text-tertiary outline-none",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
			/>

			{/* Execute / Abort button */}
			{isRunning ? (
				<button
					type="button"
					onClick={handleAbort}
					className={cn(
						"flex h-7 shrink-0 items-center gap-1 rounded px-2",
						"text-xs font-medium transition-colors",
						"bg-status-error text-text-on-accent hover:bg-status-error/80",
					)}
					title="Abort (Ctrl+C)"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3 w-3"
						aria-label="Stop"
						role="img"
					>
						<rect x="3" y="3" width="10" height="10" rx="1" />
					</svg>
					Stop
				</button>
			) : (
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!command.trim() || !sessionId}
					className={cn(
						"flex h-7 shrink-0 items-center gap-1 rounded px-2",
						"text-xs font-medium transition-colors",
						command.trim() && sessionId
							? "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover"
							: "cursor-not-allowed bg-surface-tertiary text-text-tertiary",
					)}
					title="Run (Enter)"
				>
					Run
				</button>
			)}

			{/* Close button */}
			<button
				type="button"
				onClick={() => setBashInputOpen(false)}
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
				title="Close (Escape)"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					fill="currentColor"
					className="h-3.5 w-3.5"
					aria-label="Close"
					role="img"
				>
					<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
				</svg>
			</button>
		</div>
	);
}

// ============================================================================
// Component
// ============================================================================

export function Composer() {
	const isStreaming = useStore((s) => s.isStreaming);
	const sessionId = useStore((s) => s.sessionId);
	const connectionStatus = useStore((s) => s.connectionStatus);
	const setSessionId = useStore((s) => s.setSessionId);
	const setLastError = useStore((s) => s.setLastError);
	const addToast = useStore((s) => s.addToast);
	const activeTabId = useStore((s) => s.activeTabId);
	const pendingTerminalContexts = useStore((s) => s.pendingTerminalContexts);
	const removeTerminalContext = useStore((s) => s.removeTerminalContext);
	const clearTerminalContexts = useStore((s) => s.clearTerminalContexts);

	const [value, setValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [images, setImages] = useState<ImageAttachment[]>([]);
	const [mentions, setMentions] = useState<FileMention[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	/** Auto-resize textarea to fit content. */
	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		// Reset height to auto to measure scrollHeight accurately
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
	}, []);

	const setImagePreview = useStore((s) => s.setImagePreview);
	const pendingComposerText = useStore((s) => s.pendingComposerText);
	const setPendingComposerText = useStore((s) => s.setPendingComposerText);

	// Track previous tab ID and current draft values for tab-switch persistence.
	// Refs avoid exhaustive-deps issues — we read current state at switch time,
	// not reactively (the separate save-on-change effect handles reactive saves).
	const prevTabIdRef = useRef<string | null>(activeTabId);
	const valueRef = useRef(value);
	const imagesRef = useRef(images);
	const mentionsRef = useRef(mentions);
	valueRef.current = value;
	imagesRef.current = images;
	mentionsRef.current = mentions;

	// ── Slash command menu state ──
	/** Cached Pi slash commands (fetched once per session, cleared on session change). */
	const commandsCacheRef = useRef<PiSlashCommand[] | null>(null);
	/** All command menu items (derived from cache). */
	const [commandMenuItems, setCommandMenuItems] = useState<CommandMenuItem[]>([]);
	/** Whether commands are currently being fetched. */
	const [commandsLoading, setCommandsLoading] = useState(false);
	/** ID of the currently highlighted menu item. */
	const [activeCommandItemId, setActiveCommandItemId] = useState<string | null>(null);
	/** Current slash trigger info (query + range), null when menu is closed. */
	const [slashTrigger, setSlashTrigger] = useState<{
		query: string;
		rangeStart: number;
		rangeEnd: number;
	} | null>(null);

	// ── File mention (@) menu state ──
	/** Current @ trigger info (query + range), null when menu is closed. */
	const [atTrigger, setAtTrigger] = useState<{
		query: string;
		rangeStart: number;
		rangeEnd: number;
	} | null>(null);
	/** File search results as menu items. */
	const [fileMentionItems, setFileMentionItems] = useState<FileMentionMenuItem[]>([]);
	/** Whether a file search is in progress. */
	const [fileMentionLoading, setFileMentionLoading] = useState(false);
	/** ID of the currently highlighted file mention item. */
	const [activeFileMentionId, setActiveFileMentionId] = useState<string | null>(null);
	/** Debounce timer for file search requests. */
	const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Sequence counter to discard stale search results. */
	const fileSearchSeqRef = useRef(0);

	// ── Model picker state (shown when /model is selected) ──
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [modelPickerIndex, setModelPickerIndex] = useState(0);
	const currentModel = useStore((s) => s.model);
	const availableModels = useStore((s) => s.availableModels);
	const modelsLoading = useStore((s) => s.modelsLoading);
	const setAvailableModels = useStore((s) => s.setAvailableModels);
	const setModelsLoading = useStore((s) => s.setModelsLoading);
	const setModel = useStore((s) => s.setModel);

	/** Fetch commands from Pi (lazy — only on first `/` trigger). */
	const fetchCommands = useCallback(async () => {
		if (commandsCacheRef.current !== null || commandsLoading) return;
		setCommandsLoading(true);
		try {
			const result = await getTransport().request("session.getCommands");
			commandsCacheRef.current = result.commands;
			setCommandMenuItems(buildCommandMenuItems(result.commands));
		} catch (err) {
			console.error("[Composer] Failed to fetch commands:", err);
			// Don't block the menu — show empty state
			commandsCacheRef.current = [];
			setCommandMenuItems([]);
		} finally {
			setCommandsLoading(false);
		}
	}, [commandsLoading]);

	/** Fetch models from Pi (for model picker). */
	const fetchModels = useCallback(async () => {
		if (modelsLoading || availableModels.length > 0) return;
		setModelsLoading(true);
		try {
			const result = await getTransport().request("session.getModels");
			setAvailableModels(result.models);
		} catch (err) {
			console.error("[Composer] Failed to fetch models:", err);
		} finally {
			setModelsLoading(false);
		}
	}, [modelsLoading, availableModels.length, setModelsLoading, setAvailableModels]);

	/** Handle model selection from the model picker. */
	const handleModelSelect = useCallback(
		async (model: PiModel) => {
			setModelPickerOpen(false);
			setModelPickerIndex(0);
			// Clear any remaining /model text from textarea
			setValue("");
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
				resizeTextarea();
			});

			// Optimistically update store
			const previousModel = currentModel;
			setModel(model);
			try {
				await getTransport().request("session.setModel", {
					provider: model.provider,
					modelId: model.id,
				});
				addToast(`Switched to ${model.name || model.id}`, "info");
			} catch (err) {
				console.error("[Composer] Failed to set model:", err);
				setModel(previousModel);
				setLastError(`Failed to switch model: ${errorMessage(err)}`);
			}
		},
		[currentModel, setModel, setLastError, addToast, resizeTextarea],
	);

	/** Clear command cache when session changes (different session may have different commands). */
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is the trigger — clear cache when session changes
	useEffect(() => {
		commandsCacheRef.current = null;
		setCommandMenuItems([]);
	}, [sessionId]);

	/** Update trigger detection whenever value or cursor changes. */
	const updateSlashTrigger = useCallback(
		(text: string, cursorPos: number) => {
			const trigger = detectSlashTrigger(text, cursorPos);
			setSlashTrigger(trigger);

			if (trigger) {
				// Fetch commands if not yet cached (requires active session)
				if (sessionId && commandsCacheRef.current === null) {
					fetchCommands();
				}
			} else {
				setActiveCommandItemId(null);
			}
		},
		[sessionId, fetchCommands],
	);

	/** Update `@` file mention trigger detection and fire debounced search. */
	const updateAtTrigger = useCallback(
		(text: string, cursorPos: number) => {
			const trigger = detectAtTrigger(text, cursorPos);
			setAtTrigger(trigger);

			if (!trigger) {
				setActiveFileMentionId(null);
				setFileMentionItems([]);
				// Cancel any pending search
				if (fileSearchTimerRef.current) {
					clearTimeout(fileSearchTimerRef.current);
					fileSearchTimerRef.current = null;
				}
				return;
			}

			// Debounced file search (120ms)
			if (fileSearchTimerRef.current) {
				clearTimeout(fileSearchTimerRef.current);
			}
			const seq = ++fileSearchSeqRef.current;
			setFileMentionLoading(true);

			fileSearchTimerRef.current = setTimeout(async () => {
				try {
					const result = await getTransport().request("project.searchFiles", {
						query: trigger.query,
						limit: 20,
					});
					// Only apply results if this is still the latest search
					if (seq === fileSearchSeqRef.current) {
						setFileMentionItems(buildFileMentionItems(result.files));
						setFileMentionLoading(false);
					}
				} catch (err) {
					console.error("[Composer] File search failed:", err);
					if (seq === fileSearchSeqRef.current) {
						setFileMentionItems([]);
						setFileMentionLoading(false);
					}
				}
			}, 120);
		},
		[], // no deps needed — reads from refs and transport singleton
	);

	// Cleanup file search timer on unmount
	useEffect(() => {
		return () => {
			if (fileSearchTimerRef.current) {
				clearTimeout(fileSearchTimerRef.current);
			}
		};
	}, []);

	/** Whether the command menu should be visible. */
	const commandMenuOpen = slashTrigger !== null;

	/** Filtered items based on current query. */
	const filteredCommandItems = useMemo(() => {
		if (!slashTrigger) return [];
		return filterCommandMenuItems(commandMenuItems, slashTrigger.query);
	}, [slashTrigger, commandMenuItems]);

	/** Whether the file mention menu should be visible. */
	const fileMentionMenuOpen = atTrigger !== null && !commandMenuOpen && !modelPickerOpen;

	/** Handle file mention selection — add as chip and remove trigger text. */
	const handleFileMentionSelect = useCallback(
		(item: FileMentionMenuItem) => {
			if (!atTrigger) return;

			// Add mention chip (avoid duplicates by path)
			setMentions((prev) => {
				if (prev.some((m) => m.path === item.path)) return prev;
				return [
					...prev,
					{
						id: `mention-${String(++mentionIdCounter)}`,
						path: item.path,
						kind: item.file.kind,
					},
				];
			});

			// Remove the @query trigger text from textarea
			const before = value.slice(0, atTrigger.rangeStart);
			const after = value.slice(atTrigger.rangeEnd);
			const newValue = `${before}${after}`;

			setValue(newValue);
			setAtTrigger(null);
			setActiveFileMentionId(null);
			setFileMentionItems([]);

			// Set cursor position where the trigger was
			const newCursorPos = atTrigger.rangeStart;
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (textarea) {
					textarea.setSelectionRange(newCursorPos, newCursorPos);
					textarea.focus();
				}
				resizeTextarea();
			});
		},
		[value, atTrigger, resizeTextarea],
	);

	/** Navigate the file mention menu (called from keyboard handler). */
	const nudgeFileMentionHighlight = useCallback(
		(direction: "up" | "down") => {
			if (fileMentionItems.length === 0) return;

			const currentIndex = fileMentionItems.findIndex((item) => item.id === activeFileMentionId);
			let nextIndex: number;
			if (direction === "down") {
				nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % fileMentionItems.length;
			} else {
				nextIndex =
					currentIndex <= 0
						? fileMentionItems.length - 1
						: (currentIndex - 1 + fileMentionItems.length) % fileMentionItems.length;
			}
			const nextItem = fileMentionItems[nextIndex];
			setActiveFileMentionId(nextItem?.id ?? null);
		},
		[fileMentionItems, activeFileMentionId],
	);

	/** Handle command selection — replace trigger text with command. */
	const handleCommandSelect = useCallback(
		(item: CommandMenuItem) => {
			if (!slashTrigger) return;

			// Special handling for /model — open inline model picker
			if (item.command.name === "model") {
				setSlashTrigger(null);
				setActiveCommandItemId(null);
				setModelPickerOpen(true);
				setModelPickerIndex(0);
				// Fetch models if not cached
				if (sessionId) {
					fetchModels();
				}
				// Clear the /model text from textarea
				const before = value.slice(0, slashTrigger.rangeStart);
				const after = value.slice(slashTrigger.rangeEnd);
				setValue(`${before}${after}`);
				return;
			}

			// Replace the trigger range with the full command (e.g., "/skill-name ")
			const replacement = `/${item.command.name} `;
			const before = value.slice(0, slashTrigger.rangeStart);
			const after = value.slice(slashTrigger.rangeEnd);
			const newValue = `${before}${replacement}${after}`;

			setValue(newValue);
			setSlashTrigger(null);
			setActiveCommandItemId(null);

			// Set cursor position after the replacement
			const newCursorPos = slashTrigger.rangeStart + replacement.length;
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (textarea) {
					textarea.setSelectionRange(newCursorPos, newCursorPos);
					textarea.focus();
				}
			});
		},
		[value, slashTrigger, sessionId, fetchModels],
	);

	/** Navigate the command menu (called from keyboard handler). */
	const nudgeCommandHighlight = useCallback(
		(direction: "up" | "down") => {
			if (filteredCommandItems.length === 0) return;

			const currentIndex = filteredCommandItems.findIndex(
				(item) => item.id === activeCommandItemId,
			);
			let nextIndex: number;
			if (direction === "down") {
				nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % filteredCommandItems.length;
			} else {
				nextIndex =
					currentIndex <= 0
						? filteredCommandItems.length - 1
						: (currentIndex - 1 + filteredCommandItems.length) % filteredCommandItems.length;
			}
			const nextItem = filteredCommandItems[nextIndex];
			setActiveCommandItemId(nextItem?.id ?? null);
		},
		[filteredCommandItems, activeCommandItemId],
	);

	const isConnected = connectionStatus === "open";
	const hasContent =
		value.trim().length > 0 ||
		images.length > 0 ||
		mentions.length > 0 ||
		pendingTerminalContexts.length > 0;
	const canSend = isConnected && hasContent && !isSending;

	// Watch for pending text from plugins — insert into textarea and clear.
	useEffect(() => {
		if (pendingComposerText !== null) {
			setValue(pendingComposerText);
			setPendingComposerText(null);
			// Focus the textarea and auto-resize after inserting text
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
				resizeTextarea();
			});
		}
	}, [pendingComposerText, setPendingComposerText, resizeTextarea]);

	// ── Draft persistence: save on tab switch, restore on tab activate ──
	// Uses refs for value/images to avoid running on every keystroke.
	// The separate save-on-change effect handles continuous persistence.
	useEffect(() => {
		const prevTabId = prevTabIdRef.current;
		prevTabIdRef.current = activeTabId;

		// Save draft for the tab we're leaving (read from refs — current state)
		if (prevTabId && prevTabId !== activeTabId) {
			const currentImages: PersistedImageAttachment[] = imagesRef.current.map((img) => ({
				id: img.id,
				data: img.data,
				mimeType: img.mimeType,
				previewUrl: img.previewUrl,
				fileSize: img.fileSize,
			}));
			const currentMentions: PersistedFileMention[] = mentionsRef.current.map((m) => ({
				id: m.id,
				path: m.path,
				kind: m.kind,
			}));
			saveComposerDraft(prevTabId, {
				text: valueRef.current,
				images: currentImages,
				mentions: currentMentions,
			});
		}

		// Restore draft for the tab we're switching to
		if (activeTabId) {
			const draft = getComposerDraft(activeTabId);
			if (draft) {
				setValue(draft.text);
				setImages(
					draft.images.map((img) => ({
						id: img.id,
						data: img.data,
						mimeType: img.mimeType,
						previewUrl: img.previewUrl,
						fileSize: img.fileSize ?? 0,
					})),
				);
				setMentions(
					(draft.mentions ?? []).map((m) => ({
						id: m.id,
						path: m.path,
						kind: m.kind,
					})),
				);
			} else {
				setValue("");
				setImages([]);
				setMentions([]);
			}
			// Resize textarea to fit restored content
			requestAnimationFrame(resizeTextarea);
		}
	}, [activeTabId, resizeTextarea]);

	// ── Draft persistence: save on every text/image/mention change (debounced via module) ──
	useEffect(() => {
		if (!activeTabId) return;
		const currentImages: PersistedImageAttachment[] = images.map((img) => ({
			id: img.id,
			data: img.data,
			mimeType: img.mimeType,
			previewUrl: img.previewUrl,
			fileSize: img.fileSize,
		}));
		const currentMentions: PersistedFileMention[] = mentions.map((m) => ({
			id: m.id,
			path: m.path,
			kind: m.kind,
		}));
		saveComposerDraft(activeTabId, {
			text: value,
			images: currentImages,
			mentions: currentMentions,
		});
	}, [activeTabId, value, images, mentions]);

	/** Reset textarea, images, mentions, and terminal contexts after sending. Also clears the persisted draft. */
	const clearInput = useCallback(() => {
		setValue("");
		setImages([]);
		setMentions([]);
		clearTerminalContexts();
		if (activeTabId) {
			clearComposerDraft(activeTabId);
		}
		requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			if (textarea) {
				textarea.style.height = "auto";
			}
		});
	}, [activeTabId, clearTerminalContexts]);

	/** Add images from a FileList (paste or drop). */
	const addImagesFromFiles = useCallback(
		async (files: FileList | File[]) => {
			const imageFiles = Array.from(files).filter((f) => ACCEPTED_IMAGE_TYPES.has(f.type));

			if (imageFiles.length === 0) return;

			const remaining = MAX_IMAGES - images.length;
			if (remaining <= 0) {
				addToast(`Maximum ${String(MAX_IMAGES)} images allowed`, "warning");
				return;
			}

			const filesToProcess = imageFiles.slice(0, remaining);
			if (filesToProcess.length < imageFiles.length) {
				addToast(`Only ${String(remaining)} more image(s) can be attached`, "warning");
			}

			try {
				const newAttachments: ImageAttachment[] = await Promise.all(
					filesToProcess.map(async (file) => {
						const { data, mimeType } = await readFileAsBase64(file);
						const id = `img-${String(++imageIdCounter)}`;
						return {
							id,
							data,
							mimeType,
							previewUrl: `data:${mimeType};base64,${data}`,
							fileSize: file.size,
						};
					}),
				);
				setImages((prev) => [...prev, ...newAttachments]);
			} catch (err) {
				console.error("[Composer] Failed to read image:", err);
				addToast("Failed to read image", "error");
			}
		},
		[images.length, addToast],
	);

	/** Remove an image attachment by ID. */
	const removeImage = useCallback((id: string) => {
		setImages((prev) => prev.filter((img) => img.id !== id));
	}, []);

	/** Remove a file mention by ID. */
	const removeMention = useCallback((id: string) => {
		setMentions((prev) => prev.filter((m) => m.id !== id));
	}, []);

	/** Ensure a session exists, starting one if needed. Returns true if ready. */
	const ensureSession = useCallback(async (): Promise<boolean> => {
		if (sessionId) return true;
		try {
			// Use active tab's CWD so new sessions inherit the project directory
			const activeTabCwd = useStore.getState().getActiveTab()?.cwd;
			const result = await getTransport().request("session.start", {
				...(activeTabCwd ? { cwd: activeTabCwd } : {}),
			});
			setSessionId(result.sessionId);
			// Multi-session: set active session + create/associate tab
			getTransport().setActiveSession(result.sessionId);
			{
				const s = useStore.getState();
				if (s.tabs.length === 0 || !s.activeTabId) {
					const tabId = s.addTab();
					s.switchTab(tabId);
				}
				// Re-read state after potential tab mutations
				const updated = useStore.getState();
				if (updated.activeTabId) {
					updated.updateTab(updated.activeTabId, { sessionId: result.sessionId });
				}
			}
			return true;
		} catch (err) {
			console.error("[Composer] Failed to start session:", err);
			setLastError(`Failed to start session: ${errorMessage(err)}`);
			return false;
		}
	}, [sessionId, setSessionId, setLastError]);

	/** Build the images param array for the WS request. */
	const buildImagesParam = useCallback(() => {
		if (images.length === 0) return undefined;
		return images.map((img) => ({ data: img.data, mimeType: img.mimeType }));
	}, [images]);

	/** Build the prompt message with file mentions expanded as @path references and terminal context appended. */
	const buildPromptMessage = useCallback((): string => {
		const text = value.trim();

		// Build base prompt with file mention @path references prepended
		let prompt: string;
		if (mentions.length > 0) {
			const mentionRefs = mentions.map((m) => `@${m.path}`).join(" ");
			prompt = text ? `${mentionRefs} ${text}` : mentionRefs;
		} else {
			prompt = text;
		}

		// Append terminal context block if any contexts are pending
		const contextBlock = buildTerminalContextBlock(pendingTerminalContexts);
		if (contextBlock.length > 0) {
			return prompt.length > 0 ? `${prompt}\n\n${contextBlock}` : contextBlock;
		}

		return prompt || " ";
	}, [value, mentions, pendingTerminalContexts]);

	/** Send the current message as a prompt (when not streaming). */
	const handleSend = useCallback(async () => {
		if (!hasContent || isSending) return;

		// Intercept `/bash <command>` — execute as bash command instead of prompt
		const bashMatch = value.match(/^\/bash\s+(.+)/s);
		if (bashMatch?.[1] && mentions.length === 0 && images.length === 0) {
			const bashCommand = bashMatch[1].trim();
			if (bashCommand) {
				setIsSending(true);
				try {
					const { executeBash } = await import("@/lib/sessionActions");
					await executeBash(bashCommand);
					clearInput();
				} catch (err) {
					console.error("[Composer] Failed to run bash:", err);
					setLastError(`Bash failed: ${errorMessage(err)}`);
				} finally {
					setIsSending(false);
				}
				return;
			}
		}

		setIsSending(true);
		try {
			const ready = await ensureSession();
			if (!ready) return;

			const imagesParam = buildImagesParam();
			const message = buildPromptMessage();
			await getTransport().request("session.prompt", {
				message,
				...(imagesParam && { images: imagesParam }),
			});
			clearInput();
		} catch (err) {
			console.error("[Composer] Failed to send prompt:", err);
			setLastError(`Failed to send message: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [
		hasContent,
		isSending,
		ensureSession,
		setLastError,
		clearInput,
		buildImagesParam,
		buildPromptMessage,
		value,
		mentions.length,
		images.length,
	]);

	/** Send a steering message (redirects Pi during streaming). */
	const handleSteer = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending || !isStreaming) return;

		setIsSending(true);
		try {
			await getTransport().request("session.steer", { message });
			clearInput();
			addToast("Steering message sent", "info");
		} catch (err) {
			console.error("[Composer] Failed to steer:", err);
			setLastError(`Failed to steer: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, isStreaming, setLastError, clearInput, addToast]);

	/** Queue a follow-up message (delivered after Pi finishes). */
	const handleFollowUp = useCallback(async () => {
		const message = value.trim();
		if (!message || isSending || !isStreaming) return;

		setIsSending(true);
		try {
			await getTransport().request("session.followUp", { message });
			clearInput();
			addToast("Follow-up queued", "info");
		} catch (err) {
			console.error("[Composer] Failed to queue follow-up:", err);
			setLastError(`Failed to queue follow-up: ${errorMessage(err)}`);
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, isStreaming, setLastError, clearInput, addToast]);

	/** Abort the currently streaming response. */
	const handleAbort = useCallback(async () => {
		try {
			await getTransport().request("session.abort");
		} catch (err) {
			console.error("[Composer] Failed to abort:", err);
			setLastError(`Failed to abort: ${errorMessage(err)}`);
		}
	}, [setLastError]);

	/** Handle keyboard events. */
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			// ── Model picker keyboard handling ──
			if (modelPickerOpen) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setModelPickerIndex((prev) => (prev >= availableModels.length - 1 ? 0 : prev + 1));
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setModelPickerIndex((prev) => (prev <= 0 ? availableModels.length - 1 : prev - 1));
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					const model = availableModels[modelPickerIndex];
					if (model) {
						handleModelSelect(model);
					}
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setModelPickerOpen(false);
					setModelPickerIndex(0);
					return;
				}
			}

			// ── File mention menu keyboard handling ──
			if (fileMentionMenuOpen) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					nudgeFileMentionHighlight("down");
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					nudgeFileMentionHighlight("up");
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					const selectedItem =
						fileMentionItems.find((item) => item.id === activeFileMentionId) ?? fileMentionItems[0];
					if (selectedItem) {
						e.preventDefault();
						handleFileMentionSelect(selectedItem);
						return;
					}
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setAtTrigger(null);
					setActiveFileMentionId(null);
					setFileMentionItems([]);
					return;
				}
				if (e.key === "Tab") {
					const selectedItem =
						fileMentionItems.find((item) => item.id === activeFileMentionId) ?? fileMentionItems[0];
					if (selectedItem) {
						e.preventDefault();
						handleFileMentionSelect(selectedItem);
						return;
					}
				}
			}

			// ── Command menu keyboard handling ──
			if (commandMenuOpen) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					nudgeCommandHighlight("down");
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					nudgeCommandHighlight("up");
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					// Select the active item, or the first item if none highlighted
					const selectedItem =
						filteredCommandItems.find((item) => item.id === activeCommandItemId) ??
						filteredCommandItems[0];
					if (selectedItem) {
						e.preventDefault();
						handleCommandSelect(selectedItem);
						return;
					}
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSlashTrigger(null);
					setActiveCommandItemId(null);
					return;
				}
				if (e.key === "Tab") {
					// Tab selects the active or first item (same as Enter)
					const selectedItem =
						filteredCommandItems.find((item) => item.id === activeCommandItemId) ??
						filteredCommandItems[0];
					if (selectedItem) {
						e.preventDefault();
						handleCommandSelect(selectedItem);
						return;
					}
				}
			}

			// ── Standard keyboard handling ──
			if (e.key === "Enter" && !e.shiftKey) {
				if (isStreaming && canSend) {
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Enter / Cmd+Enter during streaming → follow-up
						handleFollowUp();
					} else {
						// Enter during streaming → steer
						handleSteer();
					}
				} else if (!isStreaming && canSend && !e.ctrlKey && !e.metaKey) {
					// Enter when not streaming → send prompt
					e.preventDefault();
					handleSend();
				}
			}
		},
		[
			canSend,
			isStreaming,
			handleSend,
			handleSteer,
			handleFollowUp,
			commandMenuOpen,
			filteredCommandItems,
			activeCommandItemId,
			nudgeCommandHighlight,
			handleCommandSelect,
			modelPickerOpen,
			availableModels,
			modelPickerIndex,
			handleModelSelect,
			fileMentionMenuOpen,
			fileMentionItems,
			activeFileMentionId,
			nudgeFileMentionHighlight,
			handleFileMentionSelect,
		],
	);

	/** Handle paste events — extract images from clipboard. */
	const handlePaste = useCallback(
		(e: ClipboardEvent<HTMLTextAreaElement>) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			const imageFiles: File[] = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item && item.kind === "file" && ACCEPTED_IMAGE_TYPES.has(item.type)) {
					const file = item.getAsFile();
					if (file) {
						imageFiles.push(file);
					}
				}
			}

			if (imageFiles.length > 0) {
				// Prevent pasting file name text when we got an image
				e.preventDefault();
				addImagesFromFiles(imageFiles);
			}
			// If no image items, allow default paste (text)
		},
		[addImagesFromFiles],
	);

	/** Handle drag over events. */
	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	/** Handle drag leave events. */
	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	/** Handle drop events — extract images from dropped files. */
	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				addImagesFromFiles(files);
			}
		},
		[addImagesFromFiles],
	);

	/** Determine placeholder text based on current state. */
	const placeholder = !isConnected
		? "Connecting…"
		: isStreaming
			? "Enter to steer · Ctrl+Enter for follow-up…"
			: "Send a message… (paste or drop images)";

	return (
		<div className="flex flex-col">
			{/* Bash command input strip */}
			<BashInput />

			<div
				className={cn(
					"relative border-t bg-surface-base px-4 py-3",
					isDragOver ? "border-accent-primary" : "border-border-secondary",
				)}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{/* Model picker — positioned absolutely above composer */}
				{modelPickerOpen && (
					<ComposerModelPicker
						models={availableModels}
						isLoading={modelsLoading}
						currentModel={currentModel}
						activeIndex={modelPickerIndex}
						onSelect={handleModelSelect}
						onDismiss={() => {
							setModelPickerOpen(false);
							setModelPickerIndex(0);
						}}
						onHighlightChange={setModelPickerIndex}
					/>
				)}

				{/* File mention menu — positioned absolutely above composer */}
				{fileMentionMenuOpen && (
					<FileMentionMenu
						items={fileMentionItems}
						activeItemId={activeFileMentionId}
						isLoading={fileMentionLoading}
						onSelect={handleFileMentionSelect}
						onHighlightChange={setActiveFileMentionId}
					/>
				)}

				{/* Slash command menu — positioned absolutely above composer */}
				{commandMenuOpen && !modelPickerOpen && (
					<ComposerCommandMenu
						items={filteredCommandItems}
						activeItemId={activeCommandItemId}
						isLoading={commandsLoading}
						onSelect={handleCommandSelect}
						onHighlightChange={setActiveCommandItemId}
					/>
				)}

				<div className="mx-auto max-w-3xl">
					{/* Image preview strip */}
					{images.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-2">
							{images.map((img) => (
								<div
									key={img.id}
									className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-surface-primary"
								>
									<img
										src={img.previewUrl}
										alt="Attachment preview"
										className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
										onClick={(e: MouseEvent<HTMLImageElement>) => {
											e.stopPropagation();
											setImagePreview(img.previewUrl, "Attachment preview");
										}}
										onKeyDown={undefined}
									/>
									{/* File size badge */}
									{img.fileSize > 0 && (
										<span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white">
											{formatFileSize(img.fileSize)}
										</span>
									)}
									{/* Remove button */}
									<button
										type="button"
										onClick={() => removeImage(img.id)}
										className={cn(
											"absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center",
											"rounded-full bg-surface-secondary text-text-secondary shadow-sm",
											"opacity-0 transition-opacity group-hover:opacity-100",
											"hover:bg-status-error hover:text-text-on-accent",
										)}
										aria-label={`Remove image ${img.id}`}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 16 16"
											fill="currentColor"
											className="h-3 w-3"
											aria-label="Remove"
											role="img"
										>
											<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
										</svg>
									</button>
								</div>
							))}

							{/* Add more indicator (when under max) */}
							{images.length < MAX_IMAGES && (
								<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-primary text-text-muted">
									<span className="text-xs">+</span>
								</div>
							)}
						</div>
					)}

					{/* File mention chips */}
					{mentions.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-1.5">
							{mentions.map((mention) => {
								const segments = mention.path.split("/");
								const filename = segments[segments.length - 1] ?? mention.path;
								return (
									<span
										key={mention.id}
										className={cn(
											"group/chip inline-flex items-center gap-1 rounded-md border px-2 py-1",
											"border-border-primary bg-surface-primary text-xs text-text-secondary",
											"transition-colors hover:border-accent-primary hover:bg-accent-soft",
										)}
										title={mention.path}
									>
										{/* File/directory icon */}
										{mention.kind === "directory" ? (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className="h-3 w-3 shrink-0 text-accent-text"
												aria-label="Directory"
												role="img"
											>
												<path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z" />
											</svg>
										) : (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className="h-3 w-3 shrink-0 text-text-muted"
												aria-label="File"
												role="img"
											>
												<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z" />
											</svg>
										)}
										{/* Filename */}
										<span className="max-w-[200px] truncate">{filename}</span>
										{/* Remove button */}
										<button
											type="button"
											onClick={() => removeMention(mention.id)}
											className={cn(
												"ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm",
												"text-text-tertiary opacity-0 transition-opacity",
												"hover:bg-status-error hover:text-text-on-accent",
												"group-hover/chip:opacity-100",
											)}
											aria-label={`Remove ${filename}`}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className="h-2.5 w-2.5"
												aria-label="Remove"
												role="img"
											>
												<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
											</svg>
										</button>
									</span>
								);
							})}
						</div>
					)}

					{/* Terminal context chips */}
					{pendingTerminalContexts.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-1.5">
							{pendingTerminalContexts.map((ctx) => {
								const label = formatTerminalContextLabel(ctx);
								return (
									<span
										key={ctx.id}
										className={cn(
											"group/chip inline-flex items-center gap-1 rounded-md border px-2 py-1",
											"border-border-primary bg-surface-primary text-xs text-text-secondary",
											"transition-colors hover:border-accent-primary hover:bg-accent-soft",
										)}
										title={ctx.text.length > 200 ? `${ctx.text.slice(0, 200)}…` : ctx.text}
									>
										{/* Terminal icon */}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 16 16"
											fill="currentColor"
											className="h-3 w-3 shrink-0 text-accent-text"
											aria-label="Terminal"
											role="img"
										>
											<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM5.354 5.646a.5.5 0 1 0-.708.708L6.293 8 4.646 9.646a.5.5 0 0 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2zM8 10.5a.5.5 0 0 0 0 1h2.5a.5.5 0 0 0 0-1H8z" />
										</svg>
										{/* Label: e.g., "Terminal 1 lines 5-12" */}
										<span className="max-w-[200px] truncate">{label}</span>
										{/* Remove button */}
										<button
											type="button"
											onClick={() => removeTerminalContext(ctx.id)}
											className={cn(
												"ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm",
												"text-text-tertiary opacity-0 transition-opacity",
												"hover:bg-status-error hover:text-text-on-accent",
												"group-hover/chip:opacity-100",
											)}
											aria-label={`Remove ${label}`}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 16 16"
												fill="currentColor"
												className="h-2.5 w-2.5"
												aria-label="Remove"
												role="img"
											>
												<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
											</svg>
										</button>
									</span>
								);
							})}
						</div>
					)}

					{/* Drag overlay hint */}
					{isDragOver && (
						<div className="mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-accent-primary bg-accent-soft py-4">
							<p className="text-sm text-accent-text">Drop images here</p>
						</div>
					)}

					{/* Input row */}
					<div className="flex items-end gap-2">
						{/* Textarea */}
						<textarea
							ref={textareaRef}
							value={value}
							onChange={(e) => {
								const newValue = e.target.value;
								const cursorPos = e.target.selectionStart ?? newValue.length;
								setValue(newValue);
								resizeTextarea();
								updateSlashTrigger(newValue, cursorPos);
								updateAtTrigger(newValue, cursorPos);
							}}
							onKeyDown={handleKeyDown}
							onPaste={handlePaste}
							onSelect={(e) => {
								// Re-check triggers when cursor position changes (click, arrow keys)
								const textarea = e.target as HTMLTextAreaElement;
								updateSlashTrigger(textarea.value, textarea.selectionStart);
								updateAtTrigger(textarea.value, textarea.selectionStart);
							}}
							placeholder={placeholder}
							disabled={!isConnected}
							rows={1}
							className={cn(
								"flex-1 resize-none rounded-lg border bg-surface-primary px-4 py-3",
								"text-sm text-text-primary placeholder-text-tertiary",
								"outline-none transition-colors",
								"focus:border-text-tertiary",
								"disabled:cursor-not-allowed disabled:opacity-50",
								isStreaming ? "border-accent-primary/50" : "border-border-primary",
							)}
							style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
						/>

						{/* Action buttons */}
						{isStreaming ? (
							<div className="flex items-end gap-1.5">
								{/* Steer / Follow-up send button (shown when there's text) */}
								{value.trim().length > 0 && (
									<button
										type="button"
										onClick={handleSteer}
										disabled={!canSend}
										className={cn(
											"flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3",
											"text-xs font-medium transition-colors",
											canSend
												? "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover"
												: "cursor-not-allowed bg-surface-secondary text-text-tertiary",
										)}
										title="Steer (Enter) — redirect Pi during streaming"
									>
										{/* Steer icon — curved arrow */}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 16 16"
											fill="currentColor"
											className="h-3.5 w-3.5"
											aria-label="Steer"
											role="img"
										>
											<path d="M2.5 8a5.5 5.5 0 0 1 9.3-4l-1.65.95a.5.5 0 0 0 .25.93H14a.5.5 0 0 0 .5-.5V1.8a.5.5 0 0 0-.93-.25l-.95 1.65A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0A5.5 5.5 0 0 1 2.5 8z" />
										</svg>
										Steer
									</button>
								)}

								{/* Abort button */}
								<button
									type="button"
									onClick={handleAbort}
									className={cn(
										"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
										"bg-status-error text-text-on-accent transition-colors hover:bg-status-error",
									)}
									title="Abort (Ctrl+C)"
								>
									{/* Stop icon — square */}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="currentColor"
										className="h-4 w-4"
										aria-label="Abort"
										role="img"
									>
										<rect x="3" y="3" width="10" height="10" rx="1" />
									</svg>
								</button>
							</div>
						) : (
							<button
								type="button"
								onClick={handleSend}
								disabled={!canSend}
								className={cn(
									"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
									"transition-colors",
									canSend
										? "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover"
										: "cursor-not-allowed bg-surface-secondary text-text-tertiary",
								)}
								title="Send (Enter)"
							>
								{/* Send icon — arrow up */}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="currentColor"
									className="h-4 w-4"
									aria-label="Send"
									role="img"
								>
									<path d="M8 2.5a.5.5 0 0 1 .354.146l4 4a.5.5 0 0 1-.708.708L8.5 4.207V13a.5.5 0 0 1-1 0V4.207L4.354 7.354a.5.5 0 1 1-.708-.708l4-4A.5.5 0 0 1 8 2.5z" />
								</svg>
							</button>
						)}
					</div>

					{/* Streaming mode hint */}
					{isStreaming && (
						<div className="mt-1.5">
							<p className="text-xs text-text-tertiary">
								<span className="text-accent-text">Enter</span> to steer ·{" "}
								<span className="text-accent-text">Ctrl+Enter</span> for follow-up ·{" "}
								<span className="text-status-error-text">Ctrl+C</span> to abort
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
