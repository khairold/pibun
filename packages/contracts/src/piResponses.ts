/**
 * @pibun/contracts — Pi RPC Response Types
 *
 * Responses emitted on Pi's stdout with `type: "response"`.
 * Every command gets exactly one response. The optional `id` field
 * correlates the response back to the originating command.
 *
 * Authoritative source: reference/pi-mono/packages/coding-agent/docs/rpc.md
 */

import type {
	PiAgentMessage,
	PiBashResult,
	PiCompactionResult,
	PiModel,
	PiSessionState,
	PiSessionStats,
	PiSlashCommand,
	PiThinkingLevel,
} from "./piTypes.js";

// ============================================================================
// Success Responses (per command)
// ============================================================================

// --- Prompting ---

export interface PiPromptResponse {
	id?: string;
	type: "response";
	command: "prompt";
	success: true;
}

export interface PiSteerResponse {
	id?: string;
	type: "response";
	command: "steer";
	success: true;
}

export interface PiFollowUpResponse {
	id?: string;
	type: "response";
	command: "follow_up";
	success: true;
}

export interface PiAbortResponse {
	id?: string;
	type: "response";
	command: "abort";
	success: true;
}

export interface PiNewSessionResponse {
	id?: string;
	type: "response";
	command: "new_session";
	success: true;
	data: { cancelled: boolean };
}

// --- State ---

export interface PiGetStateResponse {
	id?: string;
	type: "response";
	command: "get_state";
	success: true;
	data: PiSessionState;
}

export interface PiGetMessagesResponse {
	id?: string;
	type: "response";
	command: "get_messages";
	success: true;
	data: { messages: PiAgentMessage[] };
}

// --- Model ---

export interface PiSetModelResponse {
	id?: string;
	type: "response";
	command: "set_model";
	success: true;
	data: PiModel;
}

export interface PiCycleModelResponse {
	id?: string;
	type: "response";
	command: "cycle_model";
	success: true;
	data: {
		model: PiModel;
		thinkingLevel: PiThinkingLevel;
		isScoped: boolean;
	} | null;
}

export interface PiGetAvailableModelsResponse {
	id?: string;
	type: "response";
	command: "get_available_models";
	success: true;
	data: { models: PiModel[] };
}

// --- Thinking ---

export interface PiSetThinkingLevelResponse {
	id?: string;
	type: "response";
	command: "set_thinking_level";
	success: true;
}

export interface PiCycleThinkingLevelResponse {
	id?: string;
	type: "response";
	command: "cycle_thinking_level";
	success: true;
	data: { level: PiThinkingLevel } | null;
}

// --- Queue Modes ---

export interface PiSetSteeringModeResponse {
	id?: string;
	type: "response";
	command: "set_steering_mode";
	success: true;
}

export interface PiSetFollowUpModeResponse {
	id?: string;
	type: "response";
	command: "set_follow_up_mode";
	success: true;
}

// --- Compaction ---

export interface PiCompactResponse {
	id?: string;
	type: "response";
	command: "compact";
	success: true;
	data: PiCompactionResult;
}

export interface PiSetAutoCompactionResponse {
	id?: string;
	type: "response";
	command: "set_auto_compaction";
	success: true;
}

// --- Retry ---

export interface PiSetAutoRetryResponse {
	id?: string;
	type: "response";
	command: "set_auto_retry";
	success: true;
}

export interface PiAbortRetryResponse {
	id?: string;
	type: "response";
	command: "abort_retry";
	success: true;
}

// --- Bash ---

export interface PiBashResponse {
	id?: string;
	type: "response";
	command: "bash";
	success: true;
	data: PiBashResult;
}

export interface PiAbortBashResponse {
	id?: string;
	type: "response";
	command: "abort_bash";
	success: true;
}

// --- Session ---

export interface PiGetSessionStatsResponse {
	id?: string;
	type: "response";
	command: "get_session_stats";
	success: true;
	data: PiSessionStats;
}

export interface PiExportHtmlResponse {
	id?: string;
	type: "response";
	command: "export_html";
	success: true;
	data: { path: string };
}

export interface PiSwitchSessionResponse {
	id?: string;
	type: "response";
	command: "switch_session";
	success: true;
	data: { cancelled: boolean };
}

export interface PiForkResponse {
	id?: string;
	type: "response";
	command: "fork";
	success: true;
	data: { text: string; cancelled: boolean };
}

export interface PiGetForkMessagesResponse {
	id?: string;
	type: "response";
	command: "get_fork_messages";
	success: true;
	data: { messages: Array<{ entryId: string; text: string }> };
}

export interface PiGetLastAssistantTextResponse {
	id?: string;
	type: "response";
	command: "get_last_assistant_text";
	success: true;
	data: { text: string | null };
}

export interface PiSetSessionNameResponse {
	id?: string;
	type: "response";
	command: "set_session_name";
	success: true;
}

// --- Slash Commands ---

export interface PiGetCommandsResponse {
	id?: string;
	type: "response";
	command: "get_commands";
	success: true;
	data: { commands: PiSlashCommand[] };
}

// ============================================================================
// Error Response (any command can fail)
// ============================================================================

export interface PiErrorResponse {
	id?: string;
	type: "response";
	command: string;
	success: false;
	error: string;
}

// ============================================================================
// Unified Pi Response Type
// ============================================================================

/**
 * Discriminated union of all Pi RPC responses.
 *
 * All responses have `type: "response"`. Use `command` + `success` to
 * narrow to a specific response type.
 */
export type PiResponse =
	// Prompting
	| PiPromptResponse
	| PiSteerResponse
	| PiFollowUpResponse
	| PiAbortResponse
	| PiNewSessionResponse
	// State
	| PiGetStateResponse
	| PiGetMessagesResponse
	// Model
	| PiSetModelResponse
	| PiCycleModelResponse
	| PiGetAvailableModelsResponse
	// Thinking
	| PiSetThinkingLevelResponse
	| PiCycleThinkingLevelResponse
	// Queue modes
	| PiSetSteeringModeResponse
	| PiSetFollowUpModeResponse
	// Compaction
	| PiCompactResponse
	| PiSetAutoCompactionResponse
	// Retry
	| PiSetAutoRetryResponse
	| PiAbortRetryResponse
	// Bash
	| PiBashResponse
	| PiAbortBashResponse
	// Session
	| PiGetSessionStatsResponse
	| PiExportHtmlResponse
	| PiSwitchSessionResponse
	| PiForkResponse
	| PiGetForkMessagesResponse
	| PiGetLastAssistantTextResponse
	| PiSetSessionNameResponse
	// Slash commands
	| PiGetCommandsResponse
	// Error (any command)
	| PiErrorResponse;

// ============================================================================
// Stdout Line Type
//
// Everything that can appear as a JSONL line on Pi's stdout.
// Either an event or a response.
// ============================================================================

import type { PiEvent } from "./piEvents.js";

/** A single parsed JSONL line from Pi's stdout. */
export type PiStdoutLine = PiEvent | PiResponse;
