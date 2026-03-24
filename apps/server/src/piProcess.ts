/**
 * PiProcess — Wraps a single `pi --mode rpc` subprocess.
 *
 * Responsibilities:
 * - Spawn Pi with appropriate CLI flags via Bun.spawn()
 * - Read stdout via strict JSONL parser (LF-only splitting, never readline)
 * - Write commands to stdin with automatic ID correlation for request/response
 * - Capture stderr for debugging
 * - Track process lifecycle (idle → running → stopped/crashed)
 *
 * Listeners:
 * - `onEvent` — Pi RPC events (agent_start, message_update, tool_execution_*, etc.)
 * - `onResponse` — Pi command responses (for WS forwarding, fires for ALL responses)
 * - `onExit` — Process exited (with exit code)
 * - `onError` — Process-level error (parse failure, stream error)
 * - `onStderr` — Stderr data received
 *
 * @see reference/pi-mono/packages/coding-agent/docs/rpc.md — Authoritative Pi RPC protocol reference
 * @see packages/shared/src/jsonl.ts — JSONL parser
 */

import type {
	PiCommand,
	PiEvent,
	PiExtensionUIResponse,
	PiResponse,
	PiThinkingLevel,
} from "@pibun/contracts";
import { JsonlParser, serializeJsonl } from "@pibun/shared/jsonl";
import type { Subprocess } from "bun";

// ============================================================================
// Types
// ============================================================================

/** Process lifecycle state. */
export type PiProcessState = "idle" | "running" | "stopped" | "crashed";

/** Options for spawning a Pi RPC process. */
export interface PiProcessOptions {
	/** LLM provider (anthropic, openai, google, etc.) */
	provider?: string;
	/** Model ID or pattern */
	model?: string;
	/** Thinking / reasoning level */
	thinking?: PiThinkingLevel;
	/** Resume a specific session file */
	session?: string;
	/** Continue most recent session (-c flag) */
	continueSession?: boolean;
	/** Ephemeral mode — no session persistence */
	noSession?: boolean;
	/** Working directory for the Pi process */
	cwd?: string;
	/** Additional environment variables (merged with process.env) */
	env?: Record<string, string>;
	/** Path to the `pi` binary (default: "pi", found via PATH) */
	piCommand?: string;
	/** Timeout in ms for command responses (default: 30000) */
	commandTimeout?: number;
}

/** Callback for Pi RPC events from stdout. */
export type PiEventListener = (event: PiEvent) => void;

/** Callback for Pi RPC responses from stdout (fires for ALL responses). */
export type PiResponseListener = (response: PiResponse) => void;

/** Callback when the Pi process exits. */
export type PiExitListener = (code: number) => void;

/** Callback for process-level errors (parse failures, stream errors). */
export type PiErrorListener = (error: Error) => void;

/** Callback for stderr data chunks. */
export type PiStderrListener = (data: string) => void;

/** Internal pending request tracker. */
interface PendingRequest {
	resolve: (response: PiResponse) => void;
	reject: (error: Error) => void;
}

/**
 * Subprocess with all stdio set to "pipe".
 * stdin = FileSink, stdout/stderr = ReadableStream<Uint8Array>.
 */
type PipedSubprocess = Subprocess<"pipe", "pipe", "pipe">;

/** Default timeout for command responses (30 seconds). */
const DEFAULT_COMMAND_TIMEOUT = 30_000;

// ============================================================================
// PiProcess
// ============================================================================

export class PiProcess {
	private subprocess: PipedSubprocess | null = null;
	private parser: JsonlParser;
	private stderrBuffer = "";
	private pendingRequests = new Map<string, PendingRequest>();
	private requestCounter = 0;
	private processState: PiProcessState = "idle";
	private readonly commandTimeout: number;

	// Listener arrays
	private eventListeners: PiEventListener[] = [];
	private responseListeners: PiResponseListener[] = [];
	private exitListeners: PiExitListener[] = [];
	private errorListeners: PiErrorListener[] = [];
	private stderrListeners: PiStderrListener[] = [];

	/** Frozen copy of the options used to create this process. */
	readonly options: Readonly<PiProcessOptions>;

	constructor(options: PiProcessOptions = {}) {
		this.options = Object.freeze({ ...options });
		this.commandTimeout = options.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT;
		this.parser = new JsonlParser((line: string) => {
			this.handleLine(line);
		});
	}

	// =========================================================================
	// State
	// =========================================================================

	/** Current lifecycle state of the process. */
	get state(): PiProcessState {
		return this.processState;
	}

	/** PID of the subprocess, or null if not running. */
	get pid(): number | null {
		return this.subprocess?.pid ?? null;
	}

	/** Accumulated stderr output. Useful for debugging crashes. */
	get stderr(): string {
		return this.stderrBuffer;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Spawn the Pi RPC process.
	 *
	 * After calling start(), the process is ready to receive commands.
	 * Use `sendCommand()` to send a `get_state` command to verify readiness.
	 *
	 * @throws If the process is not in "idle" state.
	 * @throws If the `pi` binary cannot be found or fails to spawn.
	 */
	start(): void {
		if (this.processState !== "idle") {
			throw new Error(`Cannot start: PiProcess is in '${this.processState}' state`);
		}

		const args = this.buildArgs();

		try {
			// Spawn with all stdio piped for full control.
			// cwd defaults to process.cwd() if not specified.
			// env merges custom vars with current process.env.
			this.subprocess = Bun.spawn(args, {
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
				cwd: this.options.cwd ?? process.cwd(),
				env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
			});
		} catch (error) {
			this.processState = "crashed";
			throw new Error(
				`Failed to spawn Pi process: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		this.processState = "running";

		// Start background readers (fire-and-forget — they run until stream ends)
		this.readStdout();
		this.readStderr();

		// Handle process exit
		this.subprocess.exited.then((code: number) => {
			this.handleExit(code);
		});
	}

	/**
	 * Gracefully stop the Pi process.
	 *
	 * Sends SIGTERM, waits up to 3 seconds, then SIGKILL if needed.
	 * Rejects all pending command requests.
	 * Safe to call multiple times or when already stopped.
	 */
	async stop(): Promise<void> {
		if (this.processState !== "running" || !this.subprocess) {
			return;
		}

		this.processState = "stopped";

		// Reject all pending requests immediately
		this.rejectAllPending(new Error("PiProcess stopped"));

		// Capture reference before nulling
		const proc = this.subprocess;

		// Close stdin to signal we're done
		try {
			proc.stdin.end();
		} catch {
			// Already closed — ignore
		}

		// Send SIGTERM for graceful shutdown
		try {
			proc.kill("SIGTERM");
		} catch {
			// Process already dead — ignore
		}

		// Wait for exit with timeout
		const exitResult = await Promise.race([
			proc.exited.then(() => "exited" as const),
			new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 3000)),
		]);

		if (exitResult === "timeout") {
			// Force kill after timeout
			// Note: On Windows, use taskkill /T for process tree cleanup
			try {
				proc.kill("SIGKILL");
			} catch {
				// Already dead — ignore
			}
			await proc.exited;
		}

		this.subprocess = null;
	}

	// =========================================================================
	// Commands
	// =========================================================================

	/**
	 * Send a command to Pi's stdin and wait for the correlated response.
	 *
	 * Automatically generates a correlation ID if the command doesn't have one.
	 * Returns a Promise that resolves with the Pi response.
	 *
	 * @throws If the process is not running.
	 * @throws If the response times out (default: 30s).
	 */
	sendCommand(command: PiCommand): Promise<PiResponse> {
		if (this.processState !== "running" || !this.subprocess) {
			return Promise.reject(new Error("PiProcess is not running"));
		}

		const id = command.id ?? `pibun_${++this.requestCounter}`;
		const commandWithId = { ...command, id };

		// Capture subprocess reference for the closure
		const { subprocess } = this;

		return new Promise<PiResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(
					new Error(
						`Timeout (${this.commandTimeout}ms) waiting for response to '${command.type}' (id: ${id})`,
					),
				);
			}, this.commandTimeout);

			this.pendingRequests.set(id, {
				resolve: (response: PiResponse) => {
					clearTimeout(timer);
					resolve(response);
				},
				reject: (error: Error) => {
					clearTimeout(timer);
					reject(error);
				},
			});

			// Write command as JSONL to stdin
			subprocess.stdin.write(serializeJsonl(commandWithId));
		});
	}

	/**
	 * Send an extension UI response to Pi's stdin.
	 *
	 * Used to respond to `extension_ui_request` dialog events
	 * (select, confirm, input, editor). The response uses the same ID
	 * as the original request.
	 *
	 * This is fire-and-forget — Pi sends an acknowledgment response but
	 * we don't wait for it.
	 *
	 * @throws If the process is not running.
	 */
	sendExtensionResponse(response: PiExtensionUIResponse): void {
		if (this.processState !== "running" || !this.subprocess) {
			throw new Error("PiProcess is not running");
		}

		this.subprocess.stdin.write(serializeJsonl(response));
	}

	// =========================================================================
	// Listeners
	// =========================================================================

	/**
	 * Subscribe to Pi RPC events (agent_start, message_update, etc.).
	 * @returns Unsubscribe function.
	 */
	onEvent(listener: PiEventListener): () => void {
		this.eventListeners.push(listener);
		return () => removeFromArray(this.eventListeners, listener);
	}

	/**
	 * Subscribe to Pi RPC responses (fires for ALL responses, regardless of
	 * whether they matched a pending request). Useful for WS forwarding.
	 * @returns Unsubscribe function.
	 */
	onResponse(listener: PiResponseListener): () => void {
		this.responseListeners.push(listener);
		return () => removeFromArray(this.responseListeners, listener);
	}

	/**
	 * Subscribe to process exit events.
	 * Fires whether the exit was intentional (stop()) or a crash.
	 * @returns Unsubscribe function.
	 */
	onExit(listener: PiExitListener): () => void {
		this.exitListeners.push(listener);
		return () => removeFromArray(this.exitListeners, listener);
	}

	/**
	 * Subscribe to process-level errors (JSONL parse failures, stream errors).
	 * NOT for Pi RPC errors — those come as PiResponse with success: false.
	 * @returns Unsubscribe function.
	 */
	onError(listener: PiErrorListener): () => void {
		this.errorListeners.push(listener);
		return () => removeFromArray(this.errorListeners, listener);
	}

	/**
	 * Subscribe to stderr data.
	 * Pi writes debug/log info to stderr. Chunks are raw (not line-split).
	 * @returns Unsubscribe function.
	 */
	onStderr(listener: PiStderrListener): () => void {
		this.stderrListeners.push(listener);
		return () => removeFromArray(this.stderrListeners, listener);
	}

	// =========================================================================
	// Internal: Argument Building
	// =========================================================================

	/** Build the command-line arguments for spawning Pi. */
	private buildArgs(): string[] {
		const piCmd = this.options.piCommand ?? "pi";
		const args = [piCmd, "--mode", "rpc"];

		if (this.options.provider) {
			args.push("--provider", this.options.provider);
		}
		if (this.options.model) {
			args.push("--model", this.options.model);
		}
		if (this.options.thinking) {
			args.push("--thinking", this.options.thinking);
		}
		if (this.options.session) {
			args.push("--session", this.options.session);
		}
		if (this.options.continueSession) {
			args.push("-c");
		}
		if (this.options.noSession) {
			args.push("--no-session");
		}

		return args;
	}

	// =========================================================================
	// Internal: Stream Reading
	// =========================================================================

	/**
	 * Read Pi's stdout via the JSONL parser.
	 * Runs in the background until the stream ends.
	 */
	private async readStdout(): Promise<void> {
		if (!this.subprocess) return;

		const reader = this.subprocess.stdout.getReader();
		const decoder = new TextDecoder();

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				this.parser.feed(decoder.decode(value, { stream: true }));
			}
			// Flush any remaining buffered content when stream ends
			this.parser.flush();
		} catch (error) {
			// Only report error if we're still supposed to be running
			if (this.processState === "running") {
				this.emitError(
					new Error(`stdout read error: ${error instanceof Error ? error.message : String(error)}`),
				);
			}
		}
	}

	/**
	 * Read Pi's stderr for debugging.
	 * Accumulates all output in stderrBuffer.
	 */
	private async readStderr(): Promise<void> {
		if (!this.subprocess) return;

		const reader = this.subprocess.stderr.getReader();
		const decoder = new TextDecoder();

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value, { stream: true });
				this.stderrBuffer += text;
				for (const listener of this.stderrListeners) {
					listener(text);
				}
			}
		} catch {
			// stderr read errors are not critical — silently ignore
		}
	}

	// =========================================================================
	// Internal: Line Handling
	// =========================================================================

	/**
	 * Handle a single parsed JSONL line from Pi's stdout.
	 *
	 * Lines with `type: "response"` are Pi responses — forwarded to response
	 * listeners and used to resolve pending command requests.
	 * All other lines are Pi events — forwarded to event listeners.
	 */
	private handleLine(line: string): void {
		let data: unknown;
		try {
			data = JSON.parse(line);
		} catch (error) {
			this.emitError(
				new Error(
					`Failed to parse JSONL: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
			return;
		}

		// Validate: must be an object with a `type` field
		if (typeof data !== "object" || data === null || !("type" in data)) {
			this.emitError(new Error(`Unexpected JSONL line (no 'type' field): ${line.slice(0, 200)}`));
			return;
		}

		const typed = data as { type: string };

		if (typed.type === "response") {
			// Pi command response
			const response = data as PiResponse;

			// Notify all response listeners (for WS forwarding)
			for (const listener of this.responseListeners) {
				listener(response);
			}

			// Resolve matching pending request
			if (response.id && this.pendingRequests.has(response.id)) {
				const pending = this.pendingRequests.get(response.id);
				this.pendingRequests.delete(response.id);
				pending?.resolve(response);
			}
		} else {
			// Pi RPC event
			const event = data as PiEvent;
			for (const listener of this.eventListeners) {
				listener(event);
			}
		}
	}

	// =========================================================================
	// Internal: Exit Handling
	// =========================================================================

	/**
	 * Handle process exit.
	 *
	 * If state is "running" (not previously stopped), this is an unexpected
	 * exit (crash). If state is "stopped" (from stop()), this is expected.
	 */
	private handleExit(code: number): void {
		if (this.processState === "running") {
			// Unexpected exit — mark as crashed
			this.processState = "crashed";
			this.rejectAllPending(new Error(`Pi process exited unexpectedly (code: ${code})`));
		}

		// Clean up parser state
		this.parser.reset();

		// Notify exit listeners
		for (const listener of this.exitListeners) {
			listener(code);
		}
	}

	// =========================================================================
	// Internal: Helpers
	// =========================================================================

	/** Reject all pending command requests with the given error. */
	private rejectAllPending(error: Error): void {
		for (const [, pending] of this.pendingRequests) {
			pending.reject(error);
		}
		this.pendingRequests.clear();
	}

	/** Emit an error to all error listeners. */
	private emitError(error: Error): void {
		for (const listener of this.errorListeners) {
			listener(error);
		}
	}
}

// ============================================================================
// Utility
// ============================================================================

/** Remove a value from an array (by reference). */
function removeFromArray<T>(arr: T[], value: T): void {
	const index = arr.indexOf(value);
	if (index !== -1) {
		arr.splice(index, 1);
	}
}
