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
 *
 * Each instance subscribes to the `terminal.data` push channel and
 * filters by its own `terminalId`.
 */

import { resizeTerminal, writeTerminal } from "@/lib/appActions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Theme — matches PiBun's dark neutral palette
// ============================================================================

const TERMINAL_THEME = {
	background: "#0a0a0a", // neutral-950
	foreground: "#e5e5e5", // neutral-200
	cursor: "#e5e5e5",
	cursorAccent: "#0a0a0a",
	selectionBackground: "#404040", // neutral-700
	selectionForeground: "#e5e5e5",
	// ANSI colors (standard dark theme)
	black: "#171717", // neutral-900
	red: "#ef4444", // red-500
	green: "#22c55e", // green-500
	yellow: "#eab308", // yellow-500
	blue: "#3b82f6", // blue-500
	magenta: "#a855f7", // purple-500
	cyan: "#06b6d4", // cyan-500
	white: "#d4d4d4", // neutral-300
	brightBlack: "#525252", // neutral-600
	brightRed: "#f87171", // red-400
	brightGreen: "#4ade80", // green-400
	brightYellow: "#facc15", // yellow-400
	brightBlue: "#60a5fa", // blue-400
	brightMagenta: "#c084fc", // purple-400
	brightCyan: "#22d3ee", // cyan-400
	brightWhite: "#fafafa", // neutral-50
};

// ============================================================================
// Selection action helpers
// ============================================================================

/** Delay before showing the "Add to composer" button after mouse-up, to avoid
 *  interfering with double/triple-click word/line selection gestures. */
const SELECTION_ACTION_DELAY_MS = 250;

/** Auto-incrementing counter for terminal context IDs. */
let terminalContextIdCounter = 0;

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
}

export const TerminalInstance = memo(function TerminalInstance({
	terminalId,
	isActive,
	terminalLabel,
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
			theme: TERMINAL_THEME,
			fontFamily:
				"'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Courier New', monospace",
			fontSize: 13,
			lineHeight: 1.2,
			cursorBlink: true,
			cursorStyle: "block",
			scrollback: 10000,
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		// Mount terminal to DOM
		terminal.open(container);

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

		// Cleanup
		return () => {
			observer.disconnect();
			resizeObserverRef.current = null;
			dataDisposable.dispose();
			selectionDisposable.dispose();
			unsubData();
			unsubExit();
			container.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("mouseup", handleMouseUp);
			if (selectionTimerRef.current) {
				clearTimeout(selectionTimerRef.current);
				selectionTimerRef.current = null;
			}
			terminal.dispose();
			terminalRef.current = null;
			fitAddonRef.current = null;
		};
	}, [terminalId, clearSelectionAction]);

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
