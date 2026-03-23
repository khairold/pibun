/**
 * Terminal Manager — manages PTY shell sessions.
 *
 * Uses bun-pty (Rust FFI) for cross-platform PTY support.
 * Each terminal is an independent shell with its own CWD, cols/rows.
 * Data from the shell is forwarded via callbacks (wired to WS push by the server).
 *
 * @see docs/ARCHITECTURE.md
 */

import type { IPty } from "bun-pty";
import { spawn } from "bun-pty";

// ============================================================================
// Types
// ============================================================================

/** Options for creating a new terminal. */
export interface TerminalCreateOptions {
	/** Working directory for the shell. Defaults to process.cwd(). */
	cwd?: string;
	/** Initial column count (default: 80). */
	cols?: number;
	/** Initial row count (default: 24). */
	rows?: number;
}

/** Information about a managed terminal. */
export interface ManagedTerminal {
	/** Unique terminal identifier. */
	id: string;
	/** The underlying PTY process. */
	pty: IPty;
	/** Owner connection ID (for push routing). */
	connectionId: string;
	/** When this terminal was created. */
	createdAt: number;
}

/**
 * Callback for terminal data events.
 * Called when the PTY shell writes to stdout.
 */
export type TerminalDataCallback = (terminalId: string, connectionId: string, data: string) => void;

/**
 * Callback for terminal exit events.
 * Called when the PTY shell process exits.
 */
export type TerminalExitCallback = (
	terminalId: string,
	connectionId: string,
	exitCode: number,
	signal?: number | string,
) => void;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Detect the user's default shell.
 * Falls back to /bin/sh on Unix, cmd.exe on Windows.
 */
function getDefaultShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC ?? "cmd.exe";
	}
	return process.env.SHELL ?? "/bin/sh";
}

// ============================================================================
// Terminal Manager
// ============================================================================

/**
 * Manages multiple PTY terminal sessions.
 *
 * Each terminal is spawned with bun-pty, mapped by ID, and associated
 * with a connection (for push routing). Supports create, write, resize,
 * close, and cleanup-on-disconnect.
 */
export class TerminalManager {
	/** Map of terminal ID → managed terminal info. */
	private readonly terminals = new Map<string, ManagedTerminal>();

	/** Counter for generating unique terminal IDs. */
	private nextId = 1;

	/** Callback for terminal data events. */
	private onData: TerminalDataCallback | null = null;

	/** Callback for terminal exit events. */
	private onExit: TerminalExitCallback | null = null;

	/**
	 * Register a callback for terminal data (stdout) events.
	 * Called whenever a shell writes output.
	 */
	setOnData(callback: TerminalDataCallback): void {
		this.onData = callback;
	}

	/**
	 * Register a callback for terminal exit events.
	 * Called when a shell process exits.
	 */
	setOnExit(callback: TerminalExitCallback): void {
		this.onExit = callback;
	}

	/**
	 * Create a new terminal with a PTY shell.
	 *
	 * @param connectionId - Owner connection ID (for push routing).
	 * @param options - Terminal creation options (cwd, cols, rows).
	 * @returns The terminal ID and PID.
	 */
	create(
		connectionId: string,
		options: TerminalCreateOptions = {},
	): { terminalId: string; pid: number } {
		const terminalId = `term-${this.nextId++}`;
		const cols = options.cols ?? DEFAULT_COLS;
		const rows = options.rows ?? DEFAULT_ROWS;
		const cwd = options.cwd ?? process.cwd();
		const shell = getDefaultShell();

		const pty = spawn(shell, [], {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: process.env as Record<string, string>,
		});

		const managed: ManagedTerminal = {
			id: terminalId,
			pty,
			connectionId,
			createdAt: Date.now(),
		};

		this.terminals.set(terminalId, managed);

		// Wire PTY data → callback
		pty.onData((data: string) => {
			if (this.onData) {
				this.onData(terminalId, connectionId, data);
			}
		});

		// Wire PTY exit → callback + cleanup
		pty.onExit((event) => {
			if (this.onExit) {
				this.onExit(terminalId, connectionId, event.exitCode, event.signal);
			}
			// Remove from map after exit
			this.terminals.delete(terminalId);
		});

		return { terminalId, pid: pty.pid };
	}

	/**
	 * Write data to a terminal's stdin.
	 *
	 * @param terminalId - Target terminal ID.
	 * @param data - Data to write (keystrokes, pasted text, etc.).
	 * @throws If the terminal doesn't exist.
	 */
	write(terminalId: string, data: string): void {
		const managed = this.terminals.get(terminalId);
		if (!managed) {
			throw new Error(`Terminal not found: ${terminalId}`);
		}
		managed.pty.write(data);
	}

	/**
	 * Resize a terminal's PTY dimensions.
	 *
	 * @param terminalId - Target terminal ID.
	 * @param cols - New column count.
	 * @param rows - New row count.
	 * @throws If the terminal doesn't exist.
	 */
	resize(terminalId: string, cols: number, rows: number): void {
		const managed = this.terminals.get(terminalId);
		if (!managed) {
			throw new Error(`Terminal not found: ${terminalId}`);
		}
		managed.pty.resize(cols, rows);
	}

	/**
	 * Close a terminal (kill the shell process).
	 *
	 * @param terminalId - Target terminal ID.
	 * @throws If the terminal doesn't exist.
	 */
	close(terminalId: string): void {
		const managed = this.terminals.get(terminalId);
		if (!managed) {
			throw new Error(`Terminal not found: ${terminalId}`);
		}
		managed.pty.kill();
		// Note: onExit handler will remove from map
	}

	/**
	 * Close all terminals owned by a specific connection.
	 * Called when a WebSocket connection disconnects to prevent orphaned PTY processes.
	 *
	 * @param connectionId - Connection ID to clean up.
	 */
	closeByConnection(connectionId: string): void {
		const toClose: string[] = [];
		for (const [id, managed] of this.terminals) {
			if (managed.connectionId === connectionId) {
				toClose.push(id);
			}
		}
		for (const id of toClose) {
			try {
				this.close(id);
			} catch {
				// Terminal may have already exited
				this.terminals.delete(id);
			}
		}
	}

	/**
	 * Close all terminals (for shutdown).
	 */
	closeAll(): void {
		const ids = [...this.terminals.keys()];
		for (const id of ids) {
			try {
				this.close(id);
			} catch {
				this.terminals.delete(id);
			}
		}
	}

	/**
	 * Get a terminal by ID.
	 *
	 * @param terminalId - Terminal ID.
	 * @returns The managed terminal, or undefined if not found.
	 */
	get(terminalId: string): ManagedTerminal | undefined {
		return this.terminals.get(terminalId);
	}

	/**
	 * Get all terminal IDs owned by a connection.
	 */
	getByConnection(connectionId: string): string[] {
		const result: string[] = [];
		for (const [id, managed] of this.terminals) {
			if (managed.connectionId === connectionId) {
				result.push(id);
			}
		}
		return result;
	}

	/**
	 * Number of active terminals.
	 */
	get size(): number {
		return this.terminals.size;
	}
}
