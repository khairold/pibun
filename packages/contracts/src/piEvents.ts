/**
 * @pibun/contracts — Pi RPC Event Types
 *
 * Events streamed from Pi's stdout as JSONL during agent operation.
 * Discriminated on the `type` field.
 *
 * Authoritative source: reference/pi-mono/packages/coding-agent/docs/rpc.md
 */

import type {
	PiAgentMessage,
	PiAssistantMessageEvent,
	PiCompactionResult,
	PiToolResult,
	PiToolResultMessage,
} from "./piTypes.js";

// ============================================================================
// Agent Lifecycle Events
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
// Turn Lifecycle Events
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
// Message Lifecycle Events
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
// Tool Execution Events
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
// Auto-Compaction Events
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
// Auto-Retry Events
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
// Extension Events
// ============================================================================

/** Emitted when an extension throws an error. */
export interface PiExtensionErrorEvent {
	type: "extension_error";
	extensionPath: string;
	event: string;
	error: string;
}

// ============================================================================
// Extension UI Request Events
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
// Unified Pi Event Type
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
