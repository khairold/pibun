/**
 * TerminalInstance — single xterm.js terminal bound to a server PTY.
 *
 * Handles:
 * - xterm.js lifecycle (create, mount, dispose)
 * - FitAddon for auto-resize
 * - Data flow: xterm.onData → writeTerminal (stdin)
 * - Data flow: terminal.data push → xterm.write (stdout)
 * - Resize: ResizeObserver → fitAddon.fit → resizeTerminal (PTY cols/rows)
 *
 * Each instance subscribes to the `terminal.data` push channel and
 * filters by its own `terminalId`.
 */

import { resizeTerminal, writeTerminal } from "@/lib/terminalActions";
import { getTransport } from "@/wireTransport";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { memo, useEffect, useRef } from "react";

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
// Component
// ============================================================================

interface TerminalInstanceProps {
	/** Server-side terminal ID for routing data and resize commands. */
	terminalId: string;
	/** Whether this terminal is the active visible tab. */
	isActive: boolean;
}

export const TerminalInstance = memo(function TerminalInstance({
	terminalId,
	isActive,
}: TerminalInstanceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);

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
			unsubData();
			unsubExit();
			terminal.dispose();
			terminalRef.current = null;
			fitAddonRef.current = null;
		};
	}, [terminalId]);

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
			className="h-full w-full overflow-hidden"
			style={{ padding: "4px 0 0 4px" }}
		/>
	);
});
