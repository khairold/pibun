/**
 * @pibun/contracts — Pi RPC Command Types
 *
 * Commands sent to Pi's stdin as JSONL. Each command optionally carries an `id`
 * for request/response correlation. Discriminated on the `type` field.
 *
 * Also includes the extension UI response type (sent to stdin in response
 * to extension_ui_request dialog events).
 *
 * Authoritative source: reference/pi-mono/packages/coding-agent/docs/rpc.md
 */

import type { PiFollowUpMode, PiImageContent, PiSteeringMode, PiThinkingLevel } from "./piTypes.js";

// ============================================================================
// Prompting Commands
// ============================================================================

export interface PiPromptCommand {
	id?: string;
	type: "prompt";
	message: string;
	images?: PiImageContent[];
	/**
	 * Required when agent is already streaming.
	 * "steer" — delivered after current turn's tool calls finish.
	 * "followUp" — delivered only after agent fully stops.
	 */
	streamingBehavior?: "steer" | "followUp";
}

export interface PiSteerCommand {
	id?: string;
	type: "steer";
	message: string;
	images?: PiImageContent[];
}

export interface PiFollowUpCommand {
	id?: string;
	type: "follow_up";
	message: string;
	images?: PiImageContent[];
}

export interface PiAbortCommand {
	id?: string;
	type: "abort";
}

export interface PiNewSessionCommand {
	id?: string;
	type: "new_session";
	parentSession?: string;
}

// ============================================================================
// State Commands
// ============================================================================

export interface PiGetStateCommand {
	id?: string;
	type: "get_state";
}

export interface PiGetMessagesCommand {
	id?: string;
	type: "get_messages";
}

// ============================================================================
// Model Commands
// ============================================================================

export interface PiSetModelCommand {
	id?: string;
	type: "set_model";
	provider: string;
	modelId: string;
}

export interface PiCycleModelCommand {
	id?: string;
	type: "cycle_model";
}

export interface PiGetAvailableModelsCommand {
	id?: string;
	type: "get_available_models";
}

// ============================================================================
// Thinking Commands
// ============================================================================

export interface PiSetThinkingLevelCommand {
	id?: string;
	type: "set_thinking_level";
	level: PiThinkingLevel;
}

export interface PiCycleThinkingLevelCommand {
	id?: string;
	type: "cycle_thinking_level";
}

// ============================================================================
// Queue Mode Commands
// ============================================================================

export interface PiSetSteeringModeCommand {
	id?: string;
	type: "set_steering_mode";
	mode: PiSteeringMode;
}

export interface PiSetFollowUpModeCommand {
	id?: string;
	type: "set_follow_up_mode";
	mode: PiFollowUpMode;
}

// ============================================================================
// Compaction Commands
// ============================================================================

export interface PiCompactCommand {
	id?: string;
	type: "compact";
	customInstructions?: string;
}

export interface PiSetAutoCompactionCommand {
	id?: string;
	type: "set_auto_compaction";
	enabled: boolean;
}

// ============================================================================
// Retry Commands
// ============================================================================

export interface PiSetAutoRetryCommand {
	id?: string;
	type: "set_auto_retry";
	enabled: boolean;
}

export interface PiAbortRetryCommand {
	id?: string;
	type: "abort_retry";
}

// ============================================================================
// Bash Commands
// ============================================================================

export interface PiBashCommand {
	id?: string;
	type: "bash";
	command: string;
}

export interface PiAbortBashCommand {
	id?: string;
	type: "abort_bash";
}

// ============================================================================
// Session Commands
// ============================================================================

export interface PiGetSessionStatsCommand {
	id?: string;
	type: "get_session_stats";
}

export interface PiExportHtmlCommand {
	id?: string;
	type: "export_html";
	outputPath?: string;
}

export interface PiSwitchSessionCommand {
	id?: string;
	type: "switch_session";
	sessionPath: string;
}

export interface PiForkCommand {
	id?: string;
	type: "fork";
	entryId: string;
}

export interface PiGetForkMessagesCommand {
	id?: string;
	type: "get_fork_messages";
}

export interface PiGetLastAssistantTextCommand {
	id?: string;
	type: "get_last_assistant_text";
}

export interface PiSetSessionNameCommand {
	id?: string;
	type: "set_session_name";
	name: string;
}

// ============================================================================
// Slash Commands
// ============================================================================

export interface PiGetCommandsCommand {
	id?: string;
	type: "get_commands";
}

// ============================================================================
// Unified Pi Command Type
// ============================================================================

/**
 * Discriminated union of all Pi RPC commands (sent to stdin).
 * Discriminate on the `type` field.
 */
export type PiCommand =
	// Prompting
	| PiPromptCommand
	| PiSteerCommand
	| PiFollowUpCommand
	| PiAbortCommand
	| PiNewSessionCommand
	// State
	| PiGetStateCommand
	| PiGetMessagesCommand
	// Model
	| PiSetModelCommand
	| PiCycleModelCommand
	| PiGetAvailableModelsCommand
	// Thinking
	| PiSetThinkingLevelCommand
	| PiCycleThinkingLevelCommand
	// Queue modes
	| PiSetSteeringModeCommand
	| PiSetFollowUpModeCommand
	// Compaction
	| PiCompactCommand
	| PiSetAutoCompactionCommand
	// Retry
	| PiSetAutoRetryCommand
	| PiAbortRetryCommand
	// Bash
	| PiBashCommand
	| PiAbortBashCommand
	// Session
	| PiGetSessionStatsCommand
	| PiExportHtmlCommand
	| PiSwitchSessionCommand
	| PiForkCommand
	| PiGetForkMessagesCommand
	| PiGetLastAssistantTextCommand
	| PiSetSessionNameCommand
	// Slash commands
	| PiGetCommandsCommand;

/** Extract the `type` string literal union from PiCommand. */
export type PiCommandType = PiCommand["type"];

// ============================================================================
// Extension UI Responses (sent to stdin)
//
// Responses to extension_ui_request dialog events (select, confirm, input, editor).
// The `id` must match the request.
// ============================================================================

/** Value response for select, input, or editor dialogs. */
export interface PiExtensionUIValueResponse {
	type: "extension_ui_response";
	id: string;
	value: string;
}

/** Confirmation response for confirm dialogs. */
export interface PiExtensionUIConfirmResponse {
	type: "extension_ui_response";
	id: string;
	confirmed: boolean;
}

/** Cancellation response — dismisses any dialog type. */
export interface PiExtensionUICancelResponse {
	type: "extension_ui_response";
	id: string;
	cancelled: true;
}

/** Union of all extension UI response types. */
export type PiExtensionUIResponse =
	| PiExtensionUIValueResponse
	| PiExtensionUIConfirmResponse
	| PiExtensionUICancelResponse;
