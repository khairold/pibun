/**
 * @pibun/contracts — Pi RPC Protocol Types
 *
 * All types for Pi's RPC protocol: base types (content blocks, messages, model),
 * events (stdout JSONL stream), commands (stdin JSONL), and responses (stdout).
 * Types-only, zero runtime code.
 *
 * Authoritative source: reference/pi-mono/packages/coding-agent/docs/rpc.md
 * and the underlying pi-ai/pi-agent-core TypeScript types.
 */

// ============================================================================
// CONTENT BLOCKS
// ============================================================================

/** Plain text content block. */
export interface PiTextContent {
	type: "text";
	text: string;
}

/** Extended thinking / reasoning content block. */
export interface PiThinkingContent {
	type: "thinking";
	thinking: string;
	/** Opaque signature for multi-turn thinking continuity. */
	thinkingSignature?: string;
	/** When true, thinking was redacted by safety filters. */
	redacted?: boolean;
}

/** Base64-encoded image content block. */
export interface PiImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

/** Tool call content block emitted by assistant messages. */
export interface PiToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

// ============================================================================
// USAGE & COST
// ============================================================================

export interface PiUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

// ============================================================================
// STOP REASONS & THINKING LEVELS
// ============================================================================

export type PiStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ============================================================================
// MESSAGES
// ============================================================================

export interface PiUserMessage {
	role: "user";
	content: string | (PiTextContent | PiImageContent)[];
	timestamp: number;
}

export interface PiAssistantMessage {
	role: "assistant";
	content: (PiTextContent | PiThinkingContent | PiToolCall)[];
	api: string;
	provider: string;
	model: string;
	responseId?: string;
	usage: PiUsage;
	stopReason: PiStopReason;
	errorMessage?: string;
	timestamp: number;
}

export interface PiToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (PiTextContent | PiImageContent)[];
	details?: unknown;
	isError: boolean;
	timestamp: number;
}

/**
 * Created by the `bash` RPC command (not by LLM tool calls).
 * Stored internally; does NOT emit an event. Included in `get_messages` responses.
 */
export interface PiBashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath: string | null;
	timestamp: number;
}

/**
 * Union of all message types that can appear in Pi's message history.
 * Custom extension messages may also appear — those are typed as unknown.
 */
export type PiAgentMessage =
	| PiUserMessage
	| PiAssistantMessage
	| PiToolResultMessage
	| PiBashExecutionMessage;

// ============================================================================
// MODEL
// ============================================================================

/** Pi model descriptor as returned from RPC responses. */
export interface PiModel {
	id: string;
	name: string;
	api: string;
	provider: string;
	baseUrl: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
}

// ============================================================================
// ASSISTANT MESSAGE STREAMING EVENTS
// ============================================================================

/**
 * Streaming delta events carried inside `message_update.assistantMessageEvent`.
 * Discriminated on the `type` field.
 */
export type PiAssistantMessageEvent =
	| { type: "start"; partial: PiAssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: PiAssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: PiAssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: PiAssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: PiAssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: PiAssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: PiAssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: PiAssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: PiAssistantMessage }
	| {
			type: "toolcall_end";
			contentIndex: number;
			toolCall: PiToolCall;
			partial: PiAssistantMessage;
	  }
	| {
			type: "done";
			reason: Extract<PiStopReason, "stop" | "length" | "toolUse">;
			message: PiAssistantMessage;
	  }
	| {
			type: "error";
			reason: Extract<PiStopReason, "aborted" | "error">;
			error: PiAssistantMessage;
	  };

// ============================================================================
// TOOL EXECUTION RESULTS
// ============================================================================

/**
 * Tool execution result. Used in both `tool_execution_update` (partial, accumulated)
 * and `tool_execution_end` (final).
 */
export interface PiToolResult {
	content: (PiTextContent | PiImageContent)[];
	details?: unknown;
}

// ============================================================================
// COMPACTION RESULT
// ============================================================================

export interface PiCompactionResult {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details: unknown;
}

// ============================================================================
// SESSION STATS
// ============================================================================

export interface PiSessionStats {
	sessionFile: string;
	sessionId: string;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
}

// ============================================================================
// BASH RESULT
// ============================================================================

export interface PiBashResult {
	output: string;
	exitCode: number;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

// ============================================================================
// SESSION STATE
// ============================================================================

export interface PiSessionState {
	model?: PiModel;
	thinkingLevel: PiThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

// ============================================================================
// SLASH COMMANDS
// ============================================================================

/** A command available for invocation via prompt (prefixed with `/`). */
export interface PiSlashCommand {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	location?: "user" | "project" | "path";
	path?: string;
}

// ============================================================================
// QUEUE MODES
// ============================================================================

export type PiSteeringMode = "all" | "one-at-a-time";
export type PiFollowUpMode = "all" | "one-at-a-time";

// ============================================================================
// EVENTS — Agent Lifecycle
// ============================================================================

/** Agent begins processing a prompt. */
export interface PiAgentStartEvent {
	type: "agent_start";
}

/** Agent finished. Contains all messages generated during this run. */
export interface PiAgentEndEvent {
	type: "agent_end";
	messages: PiAgentMessage[];
}

// ============================================================================
// EVENTS — Turn Lifecycle
// A turn = one assistant response + any resulting tool calls and results.
// ============================================================================

export interface PiTurnStartEvent {
	type: "turn_start";
}

export interface PiTurnEndEvent {
	type: "turn_end";
	message: PiAgentMessage;
	toolResults: PiToolResultMessage[];
}

// ============================================================================
// EVENTS — Message Lifecycle
// ============================================================================

export interface PiMessageStartEvent {
	type: "message_start";
	message: PiAgentMessage;
}

/**
 * Streaming delta for an assistant message.
 * The `assistantMessageEvent` field carries the specific delta type
 * (text_delta, thinking_delta, toolcall_start/delta/end, done, error).
 */
export interface PiMessageUpdateEvent {
	type: "message_update";
	message: PiAgentMessage;
	assistantMessageEvent: PiAssistantMessageEvent;
}

export interface PiMessageEndEvent {
	type: "message_end";
	message: PiAgentMessage;
}

// ============================================================================
// EVENTS — Tool Execution
// ============================================================================

export interface PiToolExecutionStartEvent {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

/**
 * Streaming tool output. `partialResult` is **accumulated** (not a delta) —
 * replace the entire display on each update, don't append.
 */
export interface PiToolExecutionUpdateEvent {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	partialResult: PiToolResult;
}

export interface PiToolExecutionEndEvent {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result: PiToolResult;
	isError: boolean;
}

// ============================================================================
// EVENTS — Auto-Compaction
// ============================================================================

export interface PiAutoCompactionStartEvent {
	type: "auto_compaction_start";
	/** "threshold" = context getting large, "overflow" = context exceeded limit. */
	reason: "threshold" | "overflow";
}

export interface PiAutoCompactionEndEvent {
	type: "auto_compaction_end";
	/** Compaction result, or null if aborted or failed. */
	result: PiCompactionResult | null;
	aborted: boolean;
	/** If true, the agent will automatically retry the prompt. */
	willRetry: boolean;
	/** Error description if compaction failed (not aborted). */
	errorMessage?: string;
}

// ============================================================================
// EVENTS — Auto-Retry
// ============================================================================

export interface PiAutoRetryStartEvent {
	type: "auto_retry_start";
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	errorMessage: string;
}

export interface PiAutoRetryEndEvent {
	type: "auto_retry_end";
	success: boolean;
	attempt: number;
	/** Present only on final failure (max retries exceeded). */
	finalError?: string;
}

// ============================================================================
// EVENTS — Extension Error
// ============================================================================

/** Emitted when an extension throws an error. */
export interface PiExtensionErrorEvent {
	type: "extension_error";
	extensionPath: string;
	event: string;
	error: string;
}

// ============================================================================
// EVENTS — Extension UI Requests
//
// Emitted when an extension needs user interaction.
// Dialog methods (select, confirm, input, editor) block Pi until we respond.
// Fire-and-forget methods (notify, setStatus, setWidget, setTitle, set_editor_text)
// do not need a response.
// ============================================================================

export interface PiExtensionSelectRequest {
	type: "extension_ui_request";
	id: string;
	method: "select";
	title: string;
	options: string[];
	timeout?: number;
}

export interface PiExtensionConfirmRequest {
	type: "extension_ui_request";
	id: string;
	method: "confirm";
	title: string;
	message: string;
	timeout?: number;
}

export interface PiExtensionInputRequest {
	type: "extension_ui_request";
	id: string;
	method: "input";
	title: string;
	placeholder?: string;
	timeout?: number;
}

export interface PiExtensionEditorRequest {
	type: "extension_ui_request";
	id: string;
	method: "editor";
	title: string;
	prefill?: string;
}

export interface PiExtensionNotifyRequest {
	type: "extension_ui_request";
	id: string;
	method: "notify";
	message: string;
	notifyType?: "info" | "warning" | "error";
}

export interface PiExtensionSetStatusRequest {
	type: "extension_ui_request";
	id: string;
	method: "setStatus";
	statusKey: string;
	statusText?: string;
}

export interface PiExtensionSetWidgetRequest {
	type: "extension_ui_request";
	id: string;
	method: "setWidget";
	widgetKey: string;
	widgetLines?: string[];
	widgetPlacement?: "aboveEditor" | "belowEditor";
}

export interface PiExtensionSetTitleRequest {
	type: "extension_ui_request";
	id: string;
	method: "setTitle";
	title: string;
}

export interface PiExtensionSetEditorTextRequest {
	type: "extension_ui_request";
	id: string;
	method: "set_editor_text";
	text: string;
}

/** Dialog requests that block Pi until we send extension_ui_response. */
export type PiExtensionDialogRequest =
	| PiExtensionSelectRequest
	| PiExtensionConfirmRequest
	| PiExtensionInputRequest
	| PiExtensionEditorRequest;

/** Fire-and-forget requests that don't need a response. */
export type PiExtensionFireAndForgetRequest =
	| PiExtensionNotifyRequest
	| PiExtensionSetStatusRequest
	| PiExtensionSetWidgetRequest
	| PiExtensionSetTitleRequest
	| PiExtensionSetEditorTextRequest;

/** All extension UI request types. */
export type PiExtensionUIRequest = PiExtensionDialogRequest | PiExtensionFireAndForgetRequest;

// ============================================================================
// EVENTS — Unified Event Type
//
// Everything that can appear on Pi's stdout (except responses, which have
// type: "response" and are handled separately).
// ============================================================================

/**
 * Discriminated union of all Pi RPC events.
 * Discriminate on the `type` field.
 */
export type PiEvent =
	// Agent lifecycle
	| PiAgentStartEvent
	| PiAgentEndEvent
	// Turn lifecycle
	| PiTurnStartEvent
	| PiTurnEndEvent
	// Message lifecycle
	| PiMessageStartEvent
	| PiMessageUpdateEvent
	| PiMessageEndEvent
	// Tool execution
	| PiToolExecutionStartEvent
	| PiToolExecutionUpdateEvent
	| PiToolExecutionEndEvent
	// Auto-recovery
	| PiAutoCompactionStartEvent
	| PiAutoCompactionEndEvent
	| PiAutoRetryStartEvent
	| PiAutoRetryEndEvent
	// Extension events
	| PiExtensionErrorEvent
	| PiExtensionUIRequest;

// ============================================================================
// COMMANDS — Prompting
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
// COMMANDS — State
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
// COMMANDS — Model
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
// COMMANDS — Thinking
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
// COMMANDS — Queue Modes
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
// COMMANDS — Compaction
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
// COMMANDS — Retry
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
// COMMANDS — Bash
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
// COMMANDS — Session
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
// COMMANDS — Slash Commands
// ============================================================================

export interface PiGetCommandsCommand {
	id?: string;
	type: "get_commands";
}

// ============================================================================
// COMMANDS — Unified Command Type
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
// COMMANDS — Extension UI Responses (sent to stdin)
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

// ============================================================================
// RESPONSES — Prompting
// ============================================================================

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

// ============================================================================
// RESPONSES — State
// ============================================================================

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

// ============================================================================
// RESPONSES — Model
// ============================================================================

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

// ============================================================================
// RESPONSES — Thinking
// ============================================================================

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

// ============================================================================
// RESPONSES — Queue Modes
// ============================================================================

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

// ============================================================================
// RESPONSES — Compaction
// ============================================================================

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

// ============================================================================
// RESPONSES — Retry
// ============================================================================

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

// ============================================================================
// RESPONSES — Bash
// ============================================================================

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

// ============================================================================
// RESPONSES — Session
// ============================================================================

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

// ============================================================================
// RESPONSES — Slash Commands
// ============================================================================

export interface PiGetCommandsResponse {
	id?: string;
	type: "response";
	command: "get_commands";
	success: true;
	data: { commands: PiSlashCommand[] };
}

// ============================================================================
// RESPONSES — Error (any command can fail)
// ============================================================================

export interface PiErrorResponse {
	id?: string;
	type: "response";
	command: string;
	success: false;
	error: string;
}

// ============================================================================
// RESPONSES — Unified Response Type
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
// STDOUT LINE TYPE
//
// Everything that can appear as a JSONL line on Pi's stdout.
// Either an event or a response.
// ============================================================================

/** A single parsed JSONL line from Pi's stdout. */
export type PiStdoutLine = PiEvent | PiResponse;
