/**
 * TerminalInstance — single xterm.js terminal bound to a server PTY.
 *
 * Handles:
 * - xterm.js lifecycle (create, mount, dispose)
 * - FitAddon for auto-resize
 * - Data flow: xterm.onData → writeTerminal (stdin)
 * - Data flow: terminal.data push → xterm.write (stdout)
 * - Resize: ResizeObserver → fitAddon.fit → resizeTerminal (PTY cols/rows)
 * - Selection detection → floating "Add to composer" button
 * - Link detection → Cmd/Ctrl-clickable file paths and URLs
 *
 * Enhanced rendering addons:
 * - **WebGL** — GPU-accelerated rendering with automatic canvas fallback
 * - **Unicode 11** — correct width for emoji, CJK, combining characters
 * - **Ligatures** — font ligature rendering (JetBrains Mono, Fira Code, etc.)
 * - **Image** — Sixel inline image protocol support
 * - **Clipboard** — OSC 52 clipboard integration (remote SSH → host clipboard)
 * - **Serialize** — buffer serialization for future session restore
 *
 * Each instance subscribes to the `terminal.data` push channel and
 * filters by its own `terminalId`.
 */

import { resizeTerminal, writeTerminal } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { ILink, ILinkProvider, ITheme } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Terminal Theme — derived from PiBun theme CSS custom properties
// ============================================================================

/** ANSI color palette for dark themes. */
const DARK_ANSI = {
	black: "#171717",
	red: "#ef4444",
	green: "#22c55e",
	yellow: "#eab308",
	blue: "#3b82f6",
	magenta: "#a855f7",
	cyan: "#06b6d4",
	white: "#d4d4d4",
	brightBlack: "#525252",
	brightRed: "#f87171",
	brightGreen: "#4ade80",
	brightYellow: "#facc15",
	brightBlue: "#60a5fa",
	brightMagenta: "#c084fc",
	brightCyan: "#22d3ee",
	brightWhite: "#fafafa",
};

/** ANSI color palette for light themes. */
const LIGHT_ANSI = {
	black: "#2c3542",
	red: "#bf4657",
	green: "#3c7e56",
	yellow: "#927023",
	blue: "#4866a3",
	magenta: "#845695",
	cyan: "#357f8d",
	white: "#d2d7df",
	brightBlack: "#707b8c",
	brightRed: "#d45f70",
	brightGreen: "#55946f",
	brightYellow: "#ad852d",
	brightBlue: "#5b7cc2",
	brightMagenta: "#996bac",
	brightCyan: "#4695a4",
	brightWhite: "#ecf0f6",
};

/** Read a CSS custom property value from the document root. */
function getCssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}

/**
 * Build an xterm.js ITheme from the current PiBun theme's CSS custom properties.
 *
 * Maps semantic theme tokens to terminal roles:
 * - `surface-base` → terminal background
 * - `text-primary` → terminal foreground + cursor
 * - `surface-tertiary` → selection background (semi-transparent)
 * - `scrollbar-thumb` / `scrollbar-track` → scrollbar styling
 * - ANSI colors → dark or light palette based on `data-theme` isDark
 */
function buildTerminalTheme(): ITheme {
	const bg = getCssVar("surface-base") || "#0a0a0a";
	const fg = getCssVar("text-primary") || "#e5e5e5";
	const selection = getCssVar("surface-tertiary") || "#404040";
	const scrollThumb = getCssVar("scrollbar-thumb") || "#404040";

	// Determine if the current theme is dark by checking computed background luminance
	// or falling back to the data-theme attribute
	const dataTheme = document.documentElement.getAttribute("data-theme") ?? "dark";
	const isDark = !dataTheme.includes("light");

	const ansi = isDark ? DARK_ANSI : LIGHT_ANSI;

	return {
		background: bg,
		foreground: fg,
		cursor: fg,
		cursorAccent: bg,
		selectionBackground: selection,
		selectionForeground: fg,
		scrollbarSliderBackground: scrollThumb,
		...ansi,
	};
}

// ============================================================================
// Selection action helpers
// ============================================================================

/** Delay before showing the "Add to composer" button after mouse-up, to avoid
 *  interfering with double/triple-click word/line selection gestures. */
const SELECTION_ACTION_DELAY_MS = 250;

/** Auto-incrementing counter for terminal context IDs. */
let terminalContextIdCounter = 0;

// ============================================================================
// Terminal Link Detection
// ============================================================================

/** Match result for a detected link in terminal output. */
interface TerminalLinkMatch {
	kind: "url" | "path";
	text: string;
	/** 0-based start index in the line string. */
	start: number;
	/** 0-based end index (exclusive) in the line string. */
	end: number;
}

/** URL pattern — standard http(s) links. */
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;

/**
 * File path pattern — matches:
 * - Absolute paths: /foo/bar, ~/foo/bar
 * - Relative paths: ./foo, ../foo
 * - Windows paths: C:\foo, \\server\share
 * - Bare relative paths: src/foo/bar.ts, foo/bar.ts:10:5
 * - Paths with line:col suffixes: file.ts:42, file.ts:42:10
 */
const FILE_PATH_PATTERN =
	/(?:~\/|\.{1,2}\/|\/|[A-Za-z]:\\|\\\\)[^\s"'`<>]+|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}/g;

/** Trailing punctuation to trim from matched links. */
const TRAILING_PUNCTUATION_PATTERN = /[.,;!?:]+$/;

/** Trim unbalanced closing delimiters and trailing punctuation from a matched string. */
function trimClosingDelimiters(value: string): string {
	let output = value.replace(TRAILING_PUNCTUATION_PATTERN, "");
	if (output.length === 0) return output;

	const trimUnbalanced = (open: string, close: string) => {
		while (output.endsWith(close)) {
			const opens = output.split(open).length - 1;
			const closes = output.split(close).length - 1;
			if (opens >= closes) return;
			output = output.slice(0, -1);
		}
	};

	trimUnbalanced("(", ")");
	trimUnbalanced("[", "]");
	trimUnbalanced("{", "}");
	return output;
}

/** Check if two ranges overlap. */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
	return a.start < b.end && b.start < a.end;
}

/** Collect regex matches of a given kind from a line, avoiding overlap with existing matches. */
function collectMatches(
	line: string,
	kind: "url" | "path",
	pattern: RegExp,
	existing: TerminalLinkMatch[],
): TerminalLinkMatch[] {
	const matches: TerminalLinkMatch[] = [];
	pattern.lastIndex = 0;

	for (const rawMatch of line.matchAll(pattern)) {
		const raw = rawMatch[0];
		const start = rawMatch.index ?? -1;
		if (start < 0 || raw.length === 0) continue;

		const trimmed = trimClosingDelimiters(raw);
		if (trimmed.length === 0) continue;
		// Skip path matches that are actually URLs
		if (kind === "path" && /^https?:\/\//i.test(trimmed)) continue;

		const candidate: TerminalLinkMatch = {
			kind,
			text: trimmed,
			start,
			end: start + trimmed.length,
		};

		const collides = [...existing, ...matches].some((other) => overlaps(candidate, other));
		if (collides) continue;

		matches.push(candidate);
	}

	return matches;
}

/** Extract all terminal links (URLs and file paths) from a single line of text. */
function extractTerminalLinks(line: string): TerminalLinkMatch[] {
	const urlMatches = collectMatches(line, "url", URL_PATTERN, []);
	const pathMatches = collectMatches(line, "path", FILE_PATH_PATTERN, urlMatches);
	return [...urlMatches, ...pathMatches].sort((a, b) => a.start - b.start);
}

/**
 * Split a path string into the file path and optional line:column position.
 * Handles: `file.ts:42`, `file.ts:42:10`, `file.ts`
 */
function splitPathAndPosition(value: string): {
	path: string;
	line: number | undefined;
	column: number | undefined;
} {
	let path = value;
	let column: number | undefined;
	let line: number | undefined;

	// Try to extract trailing :number (column)
	const colMatch = path.match(/:(\d+)$/);
	if (!colMatch?.[1]) {
		return { path, line: undefined, column: undefined };
	}

	const firstNum = Number.parseInt(colMatch[1], 10);
	path = path.slice(0, -colMatch[0].length);

	// Try to extract another trailing :number (line — then firstNum is column)
	const lineMatch = path.match(/:(\d+)$/);
	if (lineMatch?.[1]) {
		line = Number.parseInt(lineMatch[1], 10);
		column = firstNum;
		path = path.slice(0, -lineMatch[0].length);
	} else {
		// Only one number — it's the line
		line = firstNum;
		column = undefined;
	}

	return { path, line, column };
}

/** Resolve a potentially relative path against a CWD. */
function resolveFilePath(rawPath: string, cwd: string): string {
	if (rawPath.startsWith("~/")) {
		// Infer home directory from CWD
		const homeMatch = cwd.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/);
		if (homeMatch?.[1]) {
			return `${homeMatch[1]}/${rawPath.slice(2)}`;
		}
		return rawPath; // Can't resolve ~ without knowing home
	}
	if (rawPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawPath)) {
		return rawPath; // Already absolute
	}
	// Relative path — resolve against CWD
	const cleanCwd = cwd.replace(/\/+$/, "");
	return `${cleanCwd}/${rawPath.replace(/^\.\//, "")}`;
}

/** Check if link activation requires modifier key (Cmd on Mac, Ctrl on others). */
function isLinkActivation(event: Pick<MouseEvent, "metaKey" | "ctrlKey">): boolean {
	const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
	return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/**
 * Create an xterm.js link provider that detects file paths and URLs in terminal output.
 *
 * - **URLs**: Opened in the system browser via window.open
 * - **File paths**: Opened in the preferred code editor via `project.openFileInEditor` WS method
 * - **Activation**: Cmd-click (macOS) or Ctrl-click (other platforms)
 */
function createTerminalLinkProvider(
	terminalRef: React.RefObject<Terminal | null>,
	cwd: string,
	addToast: (message: string, level: "info" | "warning" | "error") => void,
): ILinkProvider {
	return {
		provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
			const terminal = terminalRef.current;
			if (!terminal) {
				callback(undefined);
				return;
			}

			const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
			if (!line) {
				callback(undefined);
				return;
			}

			const lineText = line.translateToString(true);
			const matches = extractTerminalLinks(lineText);
			if (matches.length === 0) {
				callback(undefined);
				return;
			}

			callback(
				matches.map(
					(match): ILink => ({
						text: match.text,
						range: {
							// xterm ranges are 1-based
							start: { x: match.start + 1, y: bufferLineNumber },
							end: { x: match.end, y: bufferLineNumber },
						},
						decorations: {
							pointerCursor: true,
							underline: true,
						},
						activate(event: MouseEvent) {
							if (!isLinkActivation(event)) return;

							if (match.kind === "url") {
								window.open(match.text, "_blank", "noopener,noreferrer");
								return;
							}

							// File path — resolve and open in editor
							const { path, line: lineNum, column } = splitPathAndPosition(match.text);
							const resolvedPath = resolveFilePath(path, cwd);
							const transport = getTransport();
							transport
								.request("project.openFileInEditor", {
									filePath: resolvedPath,
									...(lineNum != null && { line: lineNum }),
									...(column != null && { column }),
								})
								.catch(() => {
									addToast(`Could not open ${match.text} in editor`, "warning");
								});
						},
					}),
				),
			);
		},
	};
}

// ============================================================================
// Component
// ============================================================================

interface TerminalInstanceProps {
	/** Server-side terminal ID for routing data and resize commands. */
	terminalId: string;
	/** Whether this terminal is the active visible tab. */
	isActive: boolean;
	/** Display name for the terminal tab (used in context labels). */
	terminalLabel: string;
	/** Working directory of the terminal — used to resolve relative file paths in links. */
	cwd: string;
}

export const TerminalInstance = memo(function TerminalInstance({
	terminalId,
	isActive,
	terminalLabel,
	cwd,
}: TerminalInstanceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);

	// Selection action state
	const [selectionAction, setSelectionAction] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const selectionPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const selectionGestureActiveRef = useRef(false);

	const addTerminalContext = useStore((s) => s.addTerminalContext);
	const addToast = useStore((s) => s.addToast);

	/** Extract selection from the terminal and add as a terminal context chip. */
	const handleAddToComposer = useCallback(() => {
		const terminal = terminalRef.current;
		if (!terminal || !terminal.hasSelection()) return;

		const selectionText = terminal.getSelection();
		const selectionPosition = terminal.getSelectionPosition();
		const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");

		if (!selectionPosition || normalizedText.length === 0) return;

		const lineStart = selectionPosition.start.y + 1;
		const lineCount = normalizedText.split("\n").length;
		const lineEnd = Math.max(lineStart, lineStart + lineCount - 1);

		addTerminalContext({
			id: `tctx-${String(++terminalContextIdCounter)}`,
			terminalLabel,
			terminalId,
			lineStart,
			lineEnd,
			text: normalizedText,
		});

		addToast("Terminal selection added to composer", "info");
		terminal.clearSelection();
		terminal.focus();
		setSelectionAction(null);
	}, [terminalId, terminalLabel, addTerminalContext, addToast]);

	/** Clear the selection action button. */
	const clearSelectionAction = useCallback(() => {
		if (selectionTimerRef.current) {
			clearTimeout(selectionTimerRef.current);
			selectionTimerRef.current = null;
		}
		setSelectionAction(null);
	}, []);

	// Create and mount xterm instance
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Create terminal
		const terminal = new Terminal({
			theme: buildTerminalTheme(),
			fontFamily:
				"'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Courier New', monospace",
			fontSize: 13,
			lineHeight: 1.2,
			cursorBlink: true,
			cursorStyle: "block",
			cursorInactiveStyle: "outline",
			scrollback: 10000,
			allowProposedApi: true,
		});

		// ── Core addons (load before open) ──
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);

		const serializeAddon = new SerializeAddon();
		terminal.loadAddon(serializeAddon);

		// Unicode 11 — correct width for emoji, CJK, combining characters
		const unicodeAddon = new Unicode11Addon();
		terminal.loadAddon(unicodeAddon);
		terminal.unicode.activeVersion = "11";

		// OSC 52 clipboard — remote SSH sessions can copy to host clipboard
		const clipboardAddon = new ClipboardAddon();
		terminal.loadAddon(clipboardAddon);

		// Sixel / inline image protocol support
		const imageAddon = new ImageAddon({
			enableSizeReports: true,
			sixelScrolling: true,
			sixelPaletteLimit: 4096,
		});
		terminal.loadAddon(imageAddon);

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		// Mount terminal to DOM
		terminal.open(container);

		// ── Post-open addons (require DOM context) ──

		// Ligatures — load BEFORE WebGL so font feature settings are picked up
		let ligaturesAddon: LigaturesAddon | null = null;
		try {
			ligaturesAddon = new LigaturesAddon();
			terminal.loadAddon(ligaturesAddon);
		} catch {
			// Ligatures addon can fail in some environments — non-critical
			console.warn("[terminal] Ligatures addon failed to load");
		}

		// WebGL renderer — GPU-accelerated rendering with canvas fallback
		let webglAddon: WebglAddon | null = null;
		try {
			webglAddon = new WebglAddon();
			// Fall back to canvas renderer on WebGL context loss
			webglAddon.onContextLoss(() => {
				console.warn("[terminal] WebGL context lost — falling back to canvas renderer");
				webglAddon?.dispose();
				webglAddon = null;
			});
			terminal.loadAddon(webglAddon);
		} catch {
			// WebGL not available — canvas renderer is the automatic fallback
			console.warn("[terminal] WebGL addon failed to load — using canvas renderer");
			webglAddon = null;
		}

		// Initial fit (deferred to ensure container has dimensions)
		requestAnimationFrame(() => {
			try {
				fitAddon.fit();
				// Send initial dimensions to server
				resizeTerminal(terminalId, terminal.cols, terminal.rows);
			} catch {
				// Container may not have dimensions yet
			}
		});

		// Wire stdin: xterm key input → write to server PTY
		const dataDisposable = terminal.onData((data: string) => {
			writeTerminal(terminalId, data);
		});

		// Subscribe to terminal.data push for stdout
		const transport = getTransport();
		const unsubData = transport.subscribe("terminal.data", (push) => {
			if (push.terminalId === terminalId) {
				terminal.write(push.data);
			}
		});

		// Subscribe to terminal.exit push
		const unsubExit = transport.subscribe("terminal.exit", (push) => {
			if (push.terminalId === terminalId) {
				const exitMsg = push.signal
					? `\r\n\x1b[90m[Process exited with signal ${String(push.signal)}]\x1b[0m\r\n`
					: `\r\n\x1b[90m[Process exited with code ${String(push.exitCode)}]\x1b[0m\r\n`;
				terminal.write(exitMsg);
			}
		});

		// Selection change: clear the action button when selection is cleared
		const selectionDisposable = terminal.onSelectionChange(() => {
			if (!terminal.hasSelection()) {
				clearSelectionAction();
			}
		});

		// Link detection: Cmd/Ctrl-clickable file paths and URLs
		const linkProvider = createTerminalLinkProvider(terminalRef, cwd, addToast);
		const linkDisposable = terminal.registerLinkProvider(linkProvider);

		// Mouse events for selection action detection
		const handlePointerDown = (event: PointerEvent) => {
			clearSelectionAction();
			selectionGestureActiveRef.current = event.button === 0;
		};

		const handleMouseUp = (event: MouseEvent) => {
			// Only handle left-button releases during an active selection gesture
			if (!selectionGestureActiveRef.current || event.button !== 0) {
				selectionGestureActiveRef.current = false;
				return;
			}
			selectionGestureActiveRef.current = false;

			// Record pointer position for action button placement
			selectionPointerRef.current = { x: event.clientX, y: event.clientY };

			// Delay to allow double/triple-click selection to complete
			if (selectionTimerRef.current) {
				clearTimeout(selectionTimerRef.current);
			}
			selectionTimerRef.current = setTimeout(() => {
				selectionTimerRef.current = null;
				requestAnimationFrame(() => {
					if (!terminal.hasSelection()) return;
					const selectionText = terminal
						.getSelection()
						.replace(/\r\n/g, "\n")
						.replace(/^\n+|\n+$/g, "");
					if (selectionText.length === 0) return;

					// Position the action button near the mouse pointer, relative to container
					const containerRect = container.getBoundingClientRect();
					const x = selectionPointerRef.current.x - containerRect.left;
					const y = selectionPointerRef.current.y - containerRect.top;
					setSelectionAction({ x, y });
				});
			}, SELECTION_ACTION_DELAY_MS);
		};

		container.addEventListener("pointerdown", handlePointerDown);
		// Use window for mouseup so we catch releases outside the terminal
		window.addEventListener("mouseup", handleMouseUp);

		// ResizeObserver for auto-fitting when panel is resized
		const observer = new ResizeObserver(() => {
			try {
				fitAddon.fit();
				resizeTerminal(terminalId, terminal.cols, terminal.rows);
			} catch {
				// Ignore resize errors during transitions
			}
		});
		observer.observe(container);
		resizeObserverRef.current = observer;

		// Theme sync: watch for theme changes on <html> element and re-apply terminal theme.
		// applyTheme() sets CSS custom properties + data-theme attribute on document.documentElement,
		// so MutationObserver on style/attributes catches all theme switches.
		const themeObserver = new MutationObserver(() => {
			terminal.options.theme = buildTerminalTheme();
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["style", "data-theme"],
		});

		// Cleanup
		return () => {
			observer.disconnect();
			themeObserver.disconnect();
			resizeObserverRef.current = null;
			dataDisposable.dispose();
			selectionDisposable.dispose();
			linkDisposable.dispose();
			unsubData();
			unsubExit();
			container.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("mouseup", handleMouseUp);
			if (selectionTimerRef.current) {
				clearTimeout(selectionTimerRef.current);
				selectionTimerRef.current = null;
			}
			// Dispose addons before terminal (terminal.dispose() also disposes them,
			// but explicit disposal avoids order-dependent bugs in WebGL teardown)
			webglAddon?.dispose();
			ligaturesAddon?.dispose();
			imageAddon.dispose();
			clipboardAddon.dispose();
			unicodeAddon.dispose();
			serializeAddon.dispose();
			terminal.dispose();
			terminalRef.current = null;
			fitAddonRef.current = null;
		};
	}, [terminalId, clearSelectionAction, cwd, addToast]);

	// Re-fit when tab becomes active (may have been resized while hidden)
	useEffect(() => {
		if (isActive && fitAddonRef.current && terminalRef.current) {
			// Defer to next frame so container has updated dimensions
			requestAnimationFrame(() => {
				try {
					fitAddonRef.current?.fit();
					const term = terminalRef.current;
					if (term) {
						resizeTerminal(terminalId, term.cols, term.rows);
					}
				} catch {
					// Ignore
				}
			});

			// Focus the terminal when it becomes active
			terminalRef.current.focus();
		}
	}, [isActive, terminalId]);

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full overflow-hidden"
			style={{ padding: "4px 0 0 4px" }}
		>
			{/* Floating "Add to composer" button — appears near mouse after text selection */}
			{selectionAction && (
				<button
					type="button"
					onMouseDown={(e) => {
						// Prevent terminal from losing selection
						e.preventDefault();
						e.stopPropagation();
					}}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						handleAddToComposer();
					}}
					className={cn(
						"absolute z-50 flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
						"bg-accent-primary text-text-on-accent text-xs font-medium",
						"shadow-lg transition-opacity hover:bg-accent-primary-hover",
						"animate-in fade-in-0 zoom-in-95 duration-150",
					)}
					style={{
						left: `${String(selectionAction.x)}px`,
						top: `${String(Math.max(0, selectionAction.y - 36))}px`,
					}}
					title="Add selected terminal text to composer"
				>
					{/* Plus/chat icon */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-3.5 w-3.5"
						aria-label="Add to composer"
						role="img"
					>
						<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5z" />
					</svg>
					Add to composer
				</button>
			)}
		</div>
	);
});
