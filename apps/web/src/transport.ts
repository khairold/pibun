/**
 * WsTransport — WebSocket client for PiBun server.
 *
 * Handles connection lifecycle, reconnection with exponential backoff,
 * request/response correlation, push channel subscriptions, outbound
 * queue for messages during disconnect, and latest-push replay.
 *
 * Uses @pibun/contracts types for compile-time safety.
 */

import type {
	WsChannel,
	WsChannelDataMap,
	WsMethod,
	WsMethodParamsMap,
	WsMethodResultMap,
	WsPush,
	WsResponse,
	WsServerMessage,
} from "@pibun/contracts";

// ============================================================================
// Types
// ============================================================================

/** WebSocket connection state. */
export type TransportState = "connecting" | "open" | "reconnecting" | "closed" | "disposed";

/** Callback for transport state changes. */
export type StateChangeListener = (state: TransportState) => void;

/** Typed push listener for a specific channel. */
export type PushListener<C extends WsChannel> = (data: WsChannelDataMap[C]) => void;

/** Options for subscribing to push channels. */
export interface SubscribeOptions {
	/** If true, immediately replay the most recent push on this channel. */
	readonly replayLatest?: boolean;
}

/** Pending request awaiting a response. */
interface PendingRequest {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Constants
// ============================================================================

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Reconnection delays in milliseconds (exponential backoff). */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

// ============================================================================
// Helpers
// ============================================================================

/** Discriminate push messages from responses. */
function isPush(msg: WsServerMessage): msg is WsPush {
	return "type" in msg && msg.type === "push";
}

/** Discriminate error responses. */
function isError(msg: WsResponse): msg is WsResponse & { error: { message: string } } {
	return "error" in msg;
}

// ============================================================================
// WsTransport
// ============================================================================

/**
 * WebSocket transport for PiBun.
 *
 * Usage:
 * ```typescript
 * const transport = new WsTransport("ws://localhost:24242");
 *
 * // Subscribe to push channels
 * const unsub = transport.subscribe("pi.event", (event) => {
 *   console.log("Pi event:", event);
 * });
 *
 * // Send typed requests
 * const result = await transport.request("session.start", { provider: "anthropic" });
 *
 * // Clean up
 * unsub();
 * transport.dispose();
 * ```
 */
export class WsTransport {
	private ws: WebSocket | null = null;
	private nextId = 1;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly listeners = new Map<string, Set<(data: unknown) => void>>();
	private readonly stateListeners = new Set<StateChangeListener>();
	private readonly latestPushByChannel = new Map<string, unknown>();
	private readonly outboundQueue: string[] = [];
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;
	private _state: TransportState = "connecting";
	private readonly url: string;

	/**
	 * Active session ID for multi-session support.
	 * When set, all outgoing requests include this sessionId in the envelope.
	 * Allows the server to route requests to the correct Pi process.
	 */
	private _activeSessionId: string | null = null;

	constructor(url?: string) {
		this.url = url ?? WsTransport.inferUrl();
		this.connect();
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Send a typed RPC request to the server.
	 *
	 * Type-safe: params and return type are inferred from the method string.
	 *
	 * Methods with no params:
	 * ```typescript
	 * const result = await transport.request("session.stop");
	 * ```
	 *
	 * Methods with params:
	 * ```typescript
	 * const result = await transport.request("session.prompt", { message: "hello" });
	 * ```
	 */
	request<M extends WsMethod>(
		...args: WsMethodParamsMap[M] extends undefined
			? [method: M]
			: [method: M, params: WsMethodParamsMap[M]]
	): Promise<WsMethodResultMap[M]> {
		const [method, params] = args;

		if (this.disposed) {
			return Promise.reject(new Error("Transport disposed"));
		}

		const id = String(this.nextId++);
		const envelope: Record<string, unknown> = { id, method };
		if (params !== undefined) {
			envelope.params = params;
		}
		// Multi-session: include active session ID if set
		if (this._activeSessionId) {
			envelope.sessionId = this._activeSessionId;
		}
		const encoded = JSON.stringify(envelope);

		return new Promise<WsMethodResultMap[M]>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Request timed out: ${method}`));
			}, REQUEST_TIMEOUT_MS);

			this.pending.set(id, {
				resolve: resolve as (result: unknown) => void,
				reject,
				timeout,
			});

			this.send(encoded);
		});
	}

	/**
	 * Set the active session ID for multi-session support.
	 *
	 * When set, all outgoing requests automatically include this sessionId
	 * in the WsRequest envelope, routing them to the correct Pi process.
	 *
	 * Set to `null` to clear (uses the server's connection-level default).
	 */
	setActiveSession(sessionId: string | null): void {
		this._activeSessionId = sessionId;
	}

	/** Get the currently active session ID. */
	get activeSessionId(): string | null {
		return this._activeSessionId;
	}

	/**
	 * Subscribe to a push channel.
	 *
	 * Returns an unsubscribe function.
	 *
	 * ```typescript
	 * const unsub = transport.subscribe("pi.event", (event) => {
	 *   // event is typed as PiEvent
	 * });
	 * unsub();
	 * ```
	 */
	subscribe<C extends WsChannel>(
		channel: C,
		listener: PushListener<C>,
		options?: SubscribeOptions,
	): () => void {
		let channelListeners = this.listeners.get(channel);
		if (!channelListeners) {
			channelListeners = new Set<(data: unknown) => void>();
			this.listeners.set(channel, channelListeners);
		}

		const wrappedListener = (data: unknown) => {
			listener(data as WsChannelDataMap[C]);
		};
		channelListeners.add(wrappedListener);

		// Replay latest push if requested
		if (options?.replayLatest) {
			const latest = this.latestPushByChannel.get(channel);
			if (latest !== undefined) {
				wrappedListener(latest);
			}
		}

		return () => {
			channelListeners.delete(wrappedListener);
			if (channelListeners.size === 0) {
				this.listeners.delete(channel);
			}
		};
	}

	/**
	 * Get the latest push data for a channel, if any.
	 * Useful for getting initial state without subscribing.
	 */
	getLatestPush<C extends WsChannel>(channel: C): WsChannelDataMap[C] | null {
		const latest = this.latestPushByChannel.get(channel);
		return latest !== undefined ? (latest as WsChannelDataMap[C]) : null;
	}

	/** Register a listener for transport state changes. Returns unsubscribe function. */
	onStateChange(listener: StateChangeListener): () => void {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}

	/** Current transport state. */
	get state(): TransportState {
		return this._state;
	}

	/** Current reconnection attempt number (0 when connected). */
	get currentReconnectAttempt(): number {
		return this.reconnectAttempt;
	}

	/**
	 * Dispose the transport. Closes the WebSocket, rejects all pending requests,
	 * clears all listeners and timers. Cannot be reused after disposal.
	 */
	dispose(): void {
		this.disposed = true;
		this.setState("disposed");

		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Transport disposed"));
		}
		this.pending.clear();
		this.outboundQueue.length = 0;
		this.listeners.clear();
		this.stateListeners.clear();
		this.latestPushByChannel.clear();

		this.ws?.close();
		this.ws = null;
	}

	// ========================================================================
	// Private — Connection
	// ========================================================================

	private connect(): void {
		if (this.disposed) {
			return;
		}

		this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

		const ws = new WebSocket(this.url);

		ws.addEventListener("open", () => {
			this.ws = ws;
			this.setState("open");
			this.reconnectAttempt = 0;
			this.flushQueue();
		});

		ws.addEventListener("message", (event) => {
			this.handleMessage(event.data);
		});

		ws.addEventListener("close", () => {
			if (this.ws === ws) {
				this.ws = null;
			}
			if (this.disposed) {
				return;
			}
			this.setState("closed");
			this.scheduleReconnect();
		});

		ws.addEventListener("error", () => {
			// Close event will follow — reconnection handled there
		});
	}

	private setState(state: TransportState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;
		for (const listener of this.stateListeners) {
			try {
				listener(state);
			} catch {
				// Swallow listener errors
			}
		}
	}

	// ========================================================================
	// Private — Message Handling
	// ========================================================================

	private handleMessage(raw: unknown): void {
		if (typeof raw !== "string") {
			return;
		}

		let msg: WsServerMessage;
		try {
			msg = JSON.parse(raw) as WsServerMessage;
		} catch {
			console.warn("WsTransport: failed to parse message", raw);
			return;
		}

		// Push message — dispatch to channel subscribers
		if (isPush(msg)) {
			this.latestPushByChannel.set(msg.channel, msg.data);
			const channelListeners = this.listeners.get(msg.channel);
			if (channelListeners) {
				for (const listener of channelListeners) {
					try {
						listener(msg.data);
					} catch {
						// Swallow listener errors
					}
				}
			}
			return;
		}

		// Response message — correlate with pending request
		const response = msg as WsResponse;
		if (!response.id) {
			return;
		}

		const pending = this.pending.get(response.id);
		if (!pending) {
			return;
		}

		clearTimeout(pending.timeout);
		this.pending.delete(response.id);

		if (isError(response)) {
			pending.reject(new Error(response.error.message));
			return;
		}

		pending.resolve(response.result);
	}

	// ========================================================================
	// Private — Outbound Queue
	// ========================================================================

	private send(encoded: string): void {
		if (this.disposed) {
			return;
		}
		this.outboundQueue.push(encoded);
		this.flushQueue();
	}

	private flushQueue(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		while (this.outboundQueue.length > 0) {
			const message = this.outboundQueue.shift();
			if (!message) {
				continue;
			}
			try {
				this.ws.send(message);
			} catch {
				// Put it back and stop flushing — will retry on reconnect
				this.outboundQueue.unshift(message);
				return;
			}
		}
	}

	// ========================================================================
	// Private — Reconnection
	// ========================================================================

	private scheduleReconnect(): void {
		if (this.disposed || this.reconnectTimer !== null) {
			return;
		}

		const delayIndex = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
		const delay = RECONNECT_DELAYS_MS[delayIndex] ?? RECONNECT_DELAYS_MS[0];

		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	// ========================================================================
	// Static
	// ========================================================================

	/** Infer WebSocket URL from the current page location (uses /ws path for Vite proxy compat). */
	private static inferUrl(): string {
		const protocol = window.location.protocol === "https:" ? "wss" : "ws";
		return `${protocol}://${window.location.hostname}:${window.location.port}/ws`;
	}
}
