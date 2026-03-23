/**
 * @pibun/contracts — WebSocket Protocol Types
 *
 * Message contract between the browser (React) and server (Bun).
 * Simple request/response + push model. No Effect Schema, no tagged unions.
 * Method strings like "session.prompt" discriminate request types.
 *
 * See docs/WS_PROTOCOL.md for the full protocol specification.
 */

import type {
	PiAgentMessage,
	PiEvent,
	PiModel,
	PiResponse,
	PiSessionState,
	PiSessionStats,
	PiThinkingLevel,
} from "./index.js";

// ============================================================================
// Method Names
// ============================================================================

/** All WebSocket RPC method names, keyed for autocomplete. */
export const WS_METHODS = {
	// Session lifecycle
	sessionStart: "session.start",
	sessionStop: "session.stop",
	sessionGetState: "session.getState",
	sessionGetMessages: "session.getMessages",
	sessionGetStats: "session.getStats",

	// Prompting
	sessionPrompt: "session.prompt",
	sessionSteer: "session.steer",
	sessionFollowUp: "session.followUp",
	sessionAbort: "session.abort",

	// Model / Settings
	sessionSetModel: "session.setModel",
	sessionSetThinking: "session.setThinking",
	sessionGetModels: "session.getModels",

	// Session management
	sessionNew: "session.new",
	sessionCompact: "session.compact",
	sessionFork: "session.fork",
	sessionSetName: "session.setName",
	sessionGetForkMessages: "session.getForkMessages",

	// Extension UI
	sessionExtensionUiResponse: "session.extensionUiResponse",

	// Session listing (server-side, not Pi RPC)
	sessionListSessions: "session.listSessions",
	sessionSwitchSession: "session.switchSession",

	// App-level (desktop integration)
	appApplyUpdate: "app.applyUpdate",
	appCheckForUpdates: "app.checkForUpdates",
} as const;

/** Union of all WebSocket method strings. */
export type WsMethod = (typeof WS_METHODS)[keyof typeof WS_METHODS];

// ============================================================================
// Push Channel Names
// ============================================================================

/** All server-initiated push channel names. */
export const WS_CHANNELS = {
	/** All Pi RPC events (streaming text, tool calls, lifecycle). */
	piEvent: "pi.event",
	/** Pi command acknowledgment responses. */
	piResponse: "pi.response",
	/** Sent on WebSocket connect with server info. */
	serverWelcome: "server.welcome",
	/** Server-level error notifications. */
	serverError: "server.error",
	/** Native menu action forwarded from desktop app. */
	menuAction: "menu.action",
	/** App update status from desktop auto-updater. */
	appUpdate: "app.update",
} as const;

/** Union of all push channel strings. */
export type WsChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

// ============================================================================
// Request Parameters (per method)
// ============================================================================

/** Params for `session.start` — spawn a new Pi RPC process. */
export interface WsSessionStartParams {
	cwd?: string;
	provider?: string;
	model?: string;
	thinkingLevel?: PiThinkingLevel;
	/**
	 * If true, don't stop existing sessions on this connection.
	 * Used by the tab system to create additional concurrent sessions.
	 * Default: false (stops existing primary session for backward compat).
	 */
	keepExisting?: boolean;
}

/** An image attachment with base64 data and MIME type. */
export interface WsImageAttachment {
	/** Base64-encoded image data (no data-URL prefix). */
	data: string;
	/** MIME type, e.g. "image/png", "image/jpeg", "image/gif", "image/webp". */
	mimeType: string;
}

/** Params for `session.prompt` — send a user message. */
export interface WsSessionPromptParams {
	message: string;
	images?: WsImageAttachment[];
}

/** Params for `session.steer` — queue a steering message during streaming. */
export interface WsSessionSteerParams {
	message: string;
}

/** Params for `session.followUp` — queue a follow-up message. */
export interface WsSessionFollowUpParams {
	message: string;
}

/** Params for `session.setModel` — switch model. */
export interface WsSessionSetModelParams {
	provider: string;
	modelId: string;
}

/** Params for `session.setThinking` — set thinking level. */
export interface WsSessionSetThinkingParams {
	level: PiThinkingLevel;
}

/** Params for `session.compact` — compact context window. */
export interface WsSessionCompactParams {
	customInstructions?: string;
}

/** Params for `session.fork` — fork conversation from a previous message. */
export interface WsSessionForkParams {
	entryId: string;
}

/** Params for `session.setName` — set session display name. */
export interface WsSessionSetNameParams {
	name: string;
}

/** Params for `session.extensionUiResponse` — respond to extension UI dialog. */
export interface WsSessionExtensionUiResponseParams {
	id: string;
	value?: string;
	confirmed?: boolean;
	cancelled?: boolean;
}

/** Params for `session.switchSession` — switch to a different session file. */
export interface WsSessionSwitchSessionParams {
	sessionPath: string;
}

// ============================================================================
// Method → Params Type Map
// ============================================================================

/**
 * Maps each method string to its params type.
 * `undefined` means the method takes no parameters.
 *
 * Use with typed helpers:
 * ```typescript
 * function send<M extends WsMethod>(
 *   method: M,
 *   params: WsMethodParamsMap[M]
 * ): Promise<WsMethodResultMap[M]>;
 * ```
 */
export interface WsMethodParamsMap {
	"session.start": WsSessionStartParams;
	"session.stop": undefined;
	"session.getState": undefined;
	"session.getMessages": undefined;
	"session.getStats": undefined;
	"session.prompt": WsSessionPromptParams;
	"session.steer": WsSessionSteerParams;
	"session.followUp": WsSessionFollowUpParams;
	"session.abort": undefined;
	"session.setModel": WsSessionSetModelParams;
	"session.setThinking": WsSessionSetThinkingParams;
	"session.getModels": undefined;
	"session.new": undefined;
	"session.compact": WsSessionCompactParams;
	"session.fork": WsSessionForkParams;
	"session.setName": WsSessionSetNameParams;
	"session.getForkMessages": undefined;
	"session.extensionUiResponse": WsSessionExtensionUiResponseParams;
	"session.listSessions": undefined;
	"session.switchSession": WsSessionSwitchSessionParams;
	"app.applyUpdate": undefined;
	"app.checkForUpdates": undefined;
}

// ============================================================================
// Response Results (per method)
// ============================================================================

/** Generic success acknowledgment for methods with no meaningful return data. */
export interface WsOkResult {
	ok: true;
}

/** Result for `session.start`. */
export interface WsSessionStartResult {
	sessionId: string;
}

/** Result for `session.getState`. */
export interface WsSessionGetStateResult {
	state: PiSessionState;
}

/** Result for `session.getMessages`. */
export interface WsSessionGetMessagesResult {
	messages: PiAgentMessage[];
}

/** Result for `session.getStats`. */
export interface WsSessionGetStatsResult {
	stats: PiSessionStats;
}

/** Result for `session.getModels`. */
export interface WsSessionGetModelsResult {
	models: PiModel[];
}

/** Result for `session.new`. */
export interface WsSessionNewResult {
	sessionId: string;
}

/** Result for `session.fork`. */
export interface WsSessionForkResult {
	sessionId: string;
}

/** A forkable message entry from Pi. */
export interface WsForkableMessage {
	entryId: string;
	text: string;
}

/** Result for `session.getForkMessages`. */
export interface WsSessionGetForkMessagesResult {
	messages: WsForkableMessage[];
}

/** Summary info for a session file in the session list. */
export interface WsSessionSummary {
	/** Full path to the session file. */
	sessionPath: string;
	/** Pi session UUID. */
	sessionId: string;
	/** Session creation timestamp (ISO string). */
	createdAt: string;
	/** Display name set via set_session_name, or null. */
	name: string | null;
	/** Working directory the session was started in. */
	cwd: string;
	/** Text of the first user message, or null if no messages. */
	firstMessage: string | null;
	/** Number of messages in the session. */
	messageCount: number;
}

/** Result for `session.listSessions`. */
export interface WsSessionListSessionsResult {
	sessions: WsSessionSummary[];
}

/** Result for `session.switchSession`. */
export interface WsSessionSwitchSessionResult {
	/** True if an extension cancelled the switch. */
	cancelled: boolean;
}

// ============================================================================
// Method → Result Type Map
// ============================================================================

/**
 * Maps each method string to its success result type.
 * Used for type-safe response handling.
 */
export interface WsMethodResultMap {
	"session.start": WsSessionStartResult;
	"session.stop": WsOkResult;
	"session.getState": WsSessionGetStateResult;
	"session.getMessages": WsSessionGetMessagesResult;
	"session.getStats": WsSessionGetStatsResult;
	"session.prompt": WsOkResult;
	"session.steer": WsOkResult;
	"session.followUp": WsOkResult;
	"session.abort": WsOkResult;
	"session.setModel": WsOkResult;
	"session.setThinking": WsOkResult;
	"session.getModels": WsSessionGetModelsResult;
	"session.new": WsSessionNewResult;
	"session.compact": WsOkResult;
	"session.fork": WsSessionForkResult;
	"session.setName": WsOkResult;
	"session.getForkMessages": WsSessionGetForkMessagesResult;
	"session.extensionUiResponse": WsOkResult;
	"session.listSessions": WsSessionListSessionsResult;
	"session.switchSession": WsSessionSwitchSessionResult;
	"app.applyUpdate": WsOkResult;
	"app.checkForUpdates": WsOkResult;
}

// ============================================================================
// Push Channel Data Types
// ============================================================================

/**
 * Data for `pi.event` push — Pi RPC event tagged with source session ID.
 *
 * Multi-session: the client uses `sessionId` to route events to the correct tab.
 */
export interface WsPiEventData {
	/** Which session emitted this event. */
	sessionId: string;
	/** The raw Pi event. */
	event: PiEvent;
}

/**
 * Data for `pi.response` push — Pi command acknowledgment tagged with session ID.
 */
export interface WsPiResponseData {
	/** Which session this response belongs to. */
	sessionId: string;
	/** The raw Pi response. */
	response: PiResponse;
}

/** Data for `server.welcome` push — sent on WebSocket connect. */
export interface WsServerWelcomeData {
	cwd: string;
	version: string;
}

/** Data for `server.error` push — server-level error notification. */
export interface WsServerErrorData {
	message: string;
}

/**
 * Data for `menu.action` push — native menu action from desktop app.
 *
 * Action strings use dot-namespaced format matching the desktop menu
 * structure (e.g., "file.new-session", "session.abort").
 */
export interface WsMenuActionData {
	action: string;
	/** Optional extra data for actions that carry a payload (e.g., selected folder path). */
	data?: Record<string, unknown>;
}

/**
 * Update status types for the auto-updater.
 */
export type AppUpdateStatus =
	| "checking"
	| "no-update"
	| "update-available"
	| "downloading"
	| "download-progress"
	| "update-ready"
	| "applying"
	| "error";

/**
 * Data for `app.update` push — auto-update status from desktop main process.
 */
export interface WsAppUpdateData {
	status: AppUpdateStatus;
	message: string;
	/** The new version string, if available. */
	newVersion?: string;
	/** Download progress percentage (0–100). */
	progress?: number;
	/** Error message when status is "error". */
	error?: string;
}

// ============================================================================
// Channel → Data Type Map
// ============================================================================

/**
 * Maps each push channel to its data payload type.
 * Used for type-safe push handling.
 */
export interface WsChannelDataMap {
	"pi.event": WsPiEventData;
	"pi.response": WsPiResponseData;
	"server.welcome": WsServerWelcomeData;
	"server.error": WsServerErrorData;
	"menu.action": WsMenuActionData;
	"app.update": WsAppUpdateData;
}

// ============================================================================
// Wire Message Types (what actually goes over the WebSocket)
// ============================================================================

/**
 * Browser → Server request.
 *
 * Every request gets exactly one `WsResponse` back, correlated by `id`.
 *
 * Multi-session: `sessionId` targets a specific Pi session. If omitted,
 * the server uses the connection's primary session (backward compatible).
 *
 * ```json
 * { "id": "req-1", "method": "session.prompt", "params": { "message": "hello" }, "sessionId": "session_1_..." }
 * ```
 */
export interface WsRequest {
	id: string;
	method: WsMethod;
	params?: Record<string, unknown>;
	/** Target session ID for multi-session support. Falls back to connection's primary session. */
	sessionId?: string;
}

/**
 * Server → Browser success response.
 *
 * ```json
 * { "id": "req-1", "result": { "ok": true } }
 * ```
 */
export interface WsResponseOk {
	id: string;
	result: Record<string, unknown>;
}

/**
 * Server → Browser error response.
 *
 * ```json
 * { "id": "req-1", "error": { "message": "No active session" } }
 * ```
 */
export interface WsResponseError {
	id: string;
	error: { message: string };
}

/** Server → Browser response (success or error). Discriminate via `"error" in resp`. */
export type WsResponse = WsResponseOk | WsResponseError;

/**
 * Server → Browser push (unsolicited event).
 * Discriminated from responses by `type === "push"`.
 *
 * ```json
 * { "type": "push", "channel": "pi.event", "data": { ... } }
 * ```
 */
export interface WsPush {
	type: "push";
	channel: WsChannel;
	data: unknown;
}

/**
 * Any message the server can send to the browser.
 * Discriminate: if `"type" in msg && msg.type === "push"` → WsPush, else → WsResponse.
 */
export type WsServerMessage = WsResponse | WsPush;

// ============================================================================
// Type-Safe Generics (for compile-time safety in transport layers)
// ============================================================================

/**
 * Type-safe request for a specific method.
 * Used by the client transport layer for compile-time param checking.
 *
 * ```typescript
 * const req: WsTypedRequest<"session.prompt"> = {
 *   id: "1",
 *   method: "session.prompt",
 *   params: { message: "hello" },
 * };
 * ```
 */
export type WsTypedRequest<M extends WsMethod> = {
	id: string;
	method: M;
} & (WsMethodParamsMap[M] extends undefined
	? { params?: never }
	: { params: WsMethodParamsMap[M] });

/**
 * Type-safe success response for a specific method.
 * Used by the client transport layer for compile-time result typing.
 */
export interface WsTypedResponseOk<M extends WsMethod> {
	id: string;
	result: WsMethodResultMap[M];
}

/**
 * Type-safe response (success or error) for a specific method.
 */
export type WsTypedResponse<M extends WsMethod> = WsTypedResponseOk<M> | WsResponseError;

/**
 * Type-safe push for a specific channel.
 * Used by push subscription handlers for compile-time data typing.
 *
 * ```typescript
 * transport.subscribe<"pi.event">("pi.event", (data: PiEvent) => { ... });
 * ```
 */
export interface WsTypedPush<C extends WsChannel> {
	type: "push";
	channel: C;
	data: WsChannelDataMap[C];
}
