/**
 * Session WebSocket method handlers.
 *
 * Implements all session.* methods from the WS protocol.
 * All handlers follow the thin bridge principle: translate WS params
 * to Pi RPC commands, forward the response. No state caching.
 */

import type {
	PiCommand,
	PiResponse,
	WsForkableMessage,
	WsMethodResultMap,
	WsOkResult,
	WsSessionCompactParams,
	WsSessionExtensionUiResponseParams,
	WsSessionFollowUpParams,
	WsSessionForkParams,
	WsSessionPromptParams,
	WsSessionSetModelParams,
	WsSessionSetNameParams,
	WsSessionSetThinkingParams,
	WsSessionStartParams,
	WsSessionSteerParams,
} from "@pibun/contracts";
import type { PiProcess } from "../piProcess.js";
import type { HandlerContext, WsHandler } from "./types.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the Pi process for the current connection.
 * Throws if no session is bound to this connection.
 */
function getProcess(ctx: HandlerContext): PiProcess {
	const { sessionId } = ctx.connection;
	if (!sessionId) {
		throw new Error("No active session. Call session.start first.");
	}

	const session = ctx.rpcManager.getSession(sessionId);
	if (!session) {
		throw new Error(`Session '${sessionId}' not found. It may have been stopped or crashed.`);
	}

	return session.process;
}

/**
 * Send a Pi RPC command and return a simple { ok: true } result.
 * Throws if the Pi response indicates failure.
 */
async function sendAndAck(process: PiProcess, command: PiCommand): Promise<WsOkResult> {
	const response = await process.sendCommand(command);
	assertSuccess(response);
	return { ok: true };
}

/**
 * Assert a Pi response was successful.
 * Throws with the Pi error message if not.
 */
function assertSuccess(response: PiResponse): void {
	if (!response.success) {
		const errorResp = response as { error?: string };
		throw new Error(errorResp.error ?? "Pi command failed");
	}
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * session.start — Spawn a new Pi RPC process.
 *
 * Creates a Pi subprocess via PiRpcManager, binds it to this WebSocket
 * connection, and wires up event/response forwarding.
 */
export const handleSessionStart: WsHandler<"session.start"> = async (
	params: WsSessionStartParams,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.start"]> => {
	// If this connection already has a session, stop it first
	if (ctx.connection.sessionId) {
		await ctx.rpcManager.stopSession(ctx.connection.sessionId);
		ctx.connection.sessionId = null;
	}

	// Create the Pi session — only include defined options (exactOptionalPropertyTypes)
	const session = ctx.rpcManager.createSession({
		...(params?.provider && { provider: params.provider }),
		...(params?.model && { model: params.model }),
		...(params?.thinkingLevel && { thinking: params.thinkingLevel }),
		...(params?.cwd && { cwd: params.cwd }),
	});

	// Bind session to this connection
	ctx.connection.sessionId = session.id;

	// Wire event and response forwarding
	wireEventForwarding(session.process, ctx);

	return { sessionId: session.id };
};

/**
 * session.stop — Stop the current Pi process.
 */
export const handleSessionStop: WsHandler<"session.stop"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const { sessionId } = ctx.connection;
	if (!sessionId) {
		throw new Error("No active session to stop.");
	}

	await ctx.rpcManager.stopSession(sessionId);
	ctx.connection.sessionId = null;

	return { ok: true };
};

/**
 * session.getState — Get current Pi session state.
 */
export const handleSessionGetState: WsHandler<"session.getState"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.getState"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "get_state" });
	assertSuccess(response);

	if (response.command === "get_state" && response.success) {
		return { state: response.data };
	}

	throw new Error("Unexpected response from get_state");
};

/**
 * session.getMessages — Get full conversation history.
 */
export const handleSessionGetMessages: WsHandler<"session.getMessages"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.getMessages"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "get_messages" });
	assertSuccess(response);

	if (response.command === "get_messages" && response.success) {
		return { messages: response.data.messages };
	}

	throw new Error("Unexpected response from get_messages");
};

/**
 * session.getStats — Get token usage and cost.
 */
export const handleSessionGetStats: WsHandler<"session.getStats"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.getStats"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "get_session_stats" });
	assertSuccess(response);

	if (response.command === "get_session_stats" && response.success) {
		return { stats: response.data };
	}

	throw new Error("Unexpected response from get_session_stats");
};

// ============================================================================
// Prompting
// ============================================================================

/**
 * session.prompt — Send a user message to Pi.
 */
export const handleSessionPrompt: WsHandler<"session.prompt"> = async (
	params: WsSessionPromptParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	const command: PiCommand = {
		type: "prompt",
		message: params.message,
		...(params.images && {
			images: params.images.map((img) => ({
				type: "image" as const,
				data: img.data,
				mimeType: img.mimeType,
			})),
		}),
	};
	return sendAndAck(process, command);
};

/**
 * session.steer — Queue a steering message during streaming.
 */
export const handleSessionSteer: WsHandler<"session.steer"> = async (
	params: WsSessionSteerParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, { type: "steer", message: params.message });
};

/**
 * session.followUp — Queue a follow-up message.
 */
export const handleSessionFollowUp: WsHandler<"session.followUp"> = async (
	params: WsSessionFollowUpParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, { type: "follow_up", message: params.message });
};

/**
 * session.abort — Abort the current Pi operation.
 */
export const handleSessionAbort: WsHandler<"session.abort"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, { type: "abort" });
};

// ============================================================================
// Model / Settings
// ============================================================================

/**
 * session.setModel — Switch the LLM model.
 */
export const handleSessionSetModel: WsHandler<"session.setModel"> = async (
	params: WsSessionSetModelParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, {
		type: "set_model",
		provider: params.provider,
		modelId: params.modelId,
	});
};

/**
 * session.setThinking — Set the thinking/reasoning level.
 */
export const handleSessionSetThinking: WsHandler<"session.setThinking"> = async (
	params: WsSessionSetThinkingParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, { type: "set_thinking_level", level: params.level });
};

/**
 * session.getModels — List available models.
 */
export const handleSessionGetModels: WsHandler<"session.getModels"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.getModels"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "get_available_models" });
	assertSuccess(response);

	if (response.command === "get_available_models" && response.success) {
		return { models: response.data.models };
	}

	throw new Error("Unexpected response from get_available_models");
};

// ============================================================================
// Session Management
// ============================================================================

/**
 * session.new — Start a new Pi session (within the same process).
 */
export const handleSessionNew: WsHandler<"session.new"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.new"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "new_session" });
	assertSuccess(response);

	// The session ID on the connection stays the same (same PiProcess).
	// Pi internally creates a new session file.
	const { sessionId } = ctx.connection;
	return { sessionId: sessionId ?? "unknown" };
};

/**
 * session.compact — Compact the context window.
 */
export const handleSessionCompact: WsHandler<"session.compact"> = async (
	params: WsSessionCompactParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, {
		type: "compact",
		...(params?.customInstructions && { customInstructions: params.customInstructions }),
	});
};

/**
 * session.fork — Fork the conversation from a previous message.
 */
export const handleSessionFork: WsHandler<"session.fork"> = async (
	params: WsSessionForkParams,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.fork"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "fork", entryId: params.entryId });
	assertSuccess(response);

	const { sessionId } = ctx.connection;
	return { sessionId: sessionId ?? "unknown" };
};

/**
 * session.getForkMessages — Get the list of messages that can be forked from.
 */
export const handleSessionGetForkMessages: WsHandler<"session.getForkMessages"> = async (
	_params: undefined,
	ctx: HandlerContext,
): Promise<WsMethodResultMap["session.getForkMessages"]> => {
	const process = getProcess(ctx);
	const response = await process.sendCommand({ type: "get_fork_messages" });
	assertSuccess(response);

	if (response.command === "get_fork_messages" && response.success) {
		const messages: WsForkableMessage[] = response.data.messages.map((m) => ({
			entryId: m.entryId,
			text: m.text,
		}));
		return { messages };
	}

	throw new Error("Unexpected response from get_fork_messages");
};

/**
 * session.setName — Set the session display name.
 */
export const handleSessionSetName: WsHandler<"session.setName"> = async (
	params: WsSessionSetNameParams,
	ctx: HandlerContext,
): Promise<WsOkResult> => {
	const process = getProcess(ctx);
	return sendAndAck(process, { type: "set_session_name", name: params.name });
};

// ============================================================================
// Extension UI
// ============================================================================

/**
 * session.extensionUiResponse — Respond to a Pi extension UI dialog.
 */
export const handleExtensionUiResponse: WsHandler<"session.extensionUiResponse"> = (
	params: WsSessionExtensionUiResponseParams,
	ctx: HandlerContext,
): WsOkResult => {
	const process = getProcess(ctx);

	if (params.cancelled) {
		process.sendExtensionResponse({
			type: "extension_ui_response",
			id: params.id,
			cancelled: true,
		});
	} else if (params.confirmed !== undefined) {
		process.sendExtensionResponse({
			type: "extension_ui_response",
			id: params.id,
			confirmed: params.confirmed,
		});
	} else if (params.value !== undefined) {
		process.sendExtensionResponse({
			type: "extension_ui_response",
			id: params.id,
			value: params.value,
		});
	} else {
		throw new Error("Extension UI response must include cancelled, confirmed, or value");
	}

	return { ok: true };
};

// ============================================================================
// Event Forwarding (1B.10, 1B.11)
// ============================================================================

/**
 * Wire Pi event and response forwarding from a PiProcess to the WebSocket client.
 *
 * Pi events → pushed to the client on `pi.event` channel.
 * Pi responses → pushed to the client on `pi.response` channel.
 *
 * Listener cleanup is handled by PiRpcManager when the session is stopped.
 */
function wireEventForwarding(process: PiProcess, ctx: HandlerContext): void {
	// Forward Pi events to the WebSocket client
	process.onEvent((event) => {
		try {
			ctx.sendPush(ctx.ws, "pi.event", event);
		} catch {
			// WebSocket may have closed — ignore send errors
		}
	});

	// Forward Pi responses to the WebSocket client
	process.onResponse((response) => {
		try {
			ctx.sendPush(ctx.ws, "pi.response", response);
		} catch {
			// WebSocket may have closed — ignore send errors
		}
	});
}
