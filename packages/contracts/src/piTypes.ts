/**
 * @pibun/contracts — Base Pi types
 *
 * Content blocks, messages, model, and supporting types used across
 * Pi RPC events, commands, and responses. Types-only, zero runtime code.
 *
 * Authoritative source: reference/pi-mono/packages/coding-agent/docs/rpc.md
 * and the underlying pi-ai/pi-agent-core TypeScript types.
 */

// ============================================================================
// Content Blocks
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
// Usage & Cost
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
// Stop Reasons & Thinking Levels
// ============================================================================

export type PiStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ============================================================================
// Messages
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
// Model
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
// Assistant Message Streaming Events
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
// Tool Execution Results
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
// Compaction Result
// ============================================================================

export interface PiCompactionResult {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details: unknown;
}

// ============================================================================
// Session Stats
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
// Bash Result
// ============================================================================

export interface PiBashResult {
	output: string;
	exitCode: number;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

// ============================================================================
// Session State
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
// Slash Commands
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
// Queue Modes
// ============================================================================

export type PiSteeringMode = "all" | "one-at-a-time";
export type PiFollowUpMode = "all" | "one-at-a-time";
