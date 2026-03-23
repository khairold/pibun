# Pi Integration

## How We Talk to Pi

PiBun communicates with Pi via its **RPC mode** — a JSONL protocol over stdin/stdout.

```bash
pi --mode rpc [options]
```

The server spawns one `pi --mode rpc` process per user session. Commands are written as JSON lines to stdin. Events and responses stream back as JSON lines on stdout.

## Process Lifecycle

### Spawning

```
pi --mode rpc --provider anthropic --model sonnet --thinking medium
```

Key spawn options:

| Flag | Purpose |
|------|---------|
| `--mode rpc` | Headless JSONL mode |
| `--provider <name>` | LLM provider (anthropic, openai, google, etc.) |
| `--model <pattern>` | Model ID or pattern |
| `--thinking <level>` | off, minimal, low, medium, high, xhigh |
| `--no-session` | Ephemeral (no persistence) |
| `--session <path>` | Resume specific session file |
| `-c` | Continue most recent session |

### JSONL Framing (Critical)

Pi uses **strict LF-delimited JSONL**. We must:

- Split records on `\n` only
- Strip optional trailing `\r`
- **Never use Node's `readline`** — it splits on Unicode line separators (`U+2028`, `U+2029`) which can appear inside JSON string payloads

We accumulate a string buffer and split on `\n` manually.

### Shutdown

- Write nothing further to stdin
- Call `child.kill()` (or `taskkill /T` on Windows for process tree cleanup)
- Clean up session mapping

## Commands (stdin → Pi)

### Core Commands

| Command | Description |
|---------|-------------|
| `prompt` | Send a user message. During streaming, must include `streamingBehavior: "steer"` or `"followUp"` |
| `steer` | Queue a message delivered after current turn's tool calls finish |
| `follow_up` | Queue a message delivered only after the agent fully stops |
| `abort` | Cancel current operation |

### Model / Settings

| Command | Description |
|---------|-------------|
| `set_model` | Switch provider + model |
| `set_thinking_level` | Set reasoning depth (off → xhigh) |
| `cycle_model` | Cycle to next available model |
| `get_available_models` | List all configured models |

### Session Management

| Command | Description |
|---------|-------------|
| `get_state` | Current model, streaming status, session info |
| `get_messages` | Full conversation history |
| `compact` | Manually compact context |
| `set_auto_compaction` | Toggle auto-compaction |
| `new_session` | Start fresh |
| `switch_session` | Load different session file |
| `fork` | Branch from a previous message |
| `set_session_name` | Set display name |
| `get_session_stats` | Token usage and cost |
| `get_commands` | List available slash commands |

### Extension UI Responses

When Pi extensions request user input (select, confirm, input), Pi emits an `extension_ui_request` event. We respond with:

```json
{"type": "extension_ui_response", "id": "<request-id>", "value": "Allow"}
```

## Events (Pi stdout → server)

### Agent Lifecycle

| Event | Description |
|-------|-------------|
| `agent_start` | Agent begins processing a prompt |
| `agent_end` | Agent finished (includes all generated messages) |

### Turn Lifecycle

A turn = one LLM response + any resulting tool calls.

| Event | Description |
|-------|-------------|
| `turn_start` | New turn begins |
| `turn_end` | Turn complete (includes assistant message + tool results) |

### Message Streaming

| Event | Description |
|-------|-------------|
| `message_start` | New message starting |
| `message_update` | Streaming delta (text, thinking, tool call arguments) |
| `message_end` | Message complete |

The `message_update` event is the workhorse. Its `assistantMessageEvent` field contains deltas:

- `text_delta` — streaming text output (render incrementally)
- `thinking_delta` — streaming thinking/reasoning
- `toolcall_start/delta/end` — tool call being constructed
- `done` — message finished (reason: stop, length, toolUse)
- `error` — message failed (reason: aborted, error)

### Tool Execution

| Event | Description |
|-------|-------------|
| `tool_execution_start` | Tool begins (name, args) |
| `tool_execution_update` | Streaming partial output (accumulated, not delta) |
| `tool_execution_end` | Tool complete (result, isError) |

`tool_execution_update.partialResult` contains the **accumulated** output so far (not just the new chunk). The UI can replace its display on each update.

### Auto-Recovery

| Event | Description |
|-------|-------------|
| `auto_compaction_start/end` | Context getting full, compacting |
| `auto_retry_start/end` | Transient error (rate limit, overload), retrying |

### Extension UI

| Event | Description |
|-------|-------------|
| `extension_ui_request` | Extension wants user input (select, confirm, input, editor) or fires a notification |

Dialog requests (`select`, `confirm`, `input`, `editor`) block until we send an `extension_ui_response`. Fire-and-forget requests (`notify`, `setStatus`, `setWidget`) don't need a response.

## Responses

Every command gets a response:

```json
{"type": "response", "command": "prompt", "success": true, "id": "req-1"}
{"type": "response", "command": "set_model", "success": false, "error": "Model not found"}
```

The optional `id` field correlates request ↔ response.

## What Pi Handles Internally

These are things we do NOT need to implement — Pi manages them:

- **Session persistence** — JSONL session files with tree structure
- **Model registry** — built-in models + custom models.json
- **API key management** — env vars, auth.json, OAuth
- **Auto-compaction** — context overflow detection and recovery
- **Auto-retry** — transient error handling with backoff
- **Tool execution** — read, bash, edit, write (+ extension tools)
- **Extensions** — custom tools, commands, event hooks
- **Skills** — on-demand capability packages
- **Prompt templates** — reusable slash commands

This is the key advantage over T3 Code's Codex integration: we don't need to reimplement any of this. We just pipe events through.
