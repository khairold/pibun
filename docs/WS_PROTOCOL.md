# WebSocket Protocol

## Overview

The WebSocket protocol connects the React UI to the Bun server. It's a simple request/response + push model. Much simpler than T3 Code's Effect/Schema-based protocol.

```
Browser (React)  ──WsRequest──►  Server (Bun)
                 ◄──WsResponse──
                 ◄──WsPush──────  (server-initiated events)
```

## Connection

The browser connects to `ws://localhost:<port>`. On connection, the server sends a `server.welcome` push with initial state.

Optional auth: `ws://localhost:<port>?token=<auth-token>`

Reconnection: the client retries with exponential backoff (500ms → 1s → 2s → 4s → 8s cap).

## Message Types

### WsRequest (browser → server)

```json
{
  "id": "req-1",
  "method": "session.prompt",
  "params": { "message": "What files are here?" }
}
```

Every request gets exactly one `WsResponse` back.

### WsResponse (server → browser)

Success:
```json
{ "id": "req-1", "result": { "ok": true } }
```

Error:
```json
{ "id": "req-1", "error": { "message": "No active session" } }
```

### WsPush (server → browser, unsolicited)

```json
{
  "type": "push",
  "channel": "pi.event",
  "data": { "type": "message_update", "assistantMessageEvent": { "type": "text_delta", "delta": "Hello" } }
}
```

## Methods

### Session Lifecycle

| Method | Params | Description |
|--------|--------|-------------|
| `session.start` | `{ cwd?, provider?, model?, thinkingLevel? }` | Spawn a new Pi RPC process |
| `session.stop` | — | Stop current Pi process |
| `session.getState` | — | Get current session state |
| `session.getMessages` | — | Get full conversation history |
| `session.getStats` | — | Get token usage and cost |

### Prompting

| Method | Params | Description |
|--------|--------|-------------|
| `session.prompt` | `{ message, images? }` | Send a user message |
| `session.steer` | `{ message }` | Queue a steering message |
| `session.followUp` | `{ message }` | Queue a follow-up message |
| `session.abort` | — | Abort current operation |

### Model / Settings

| Method | Params | Description |
|--------|--------|-------------|
| `session.setModel` | `{ provider, modelId }` | Switch model |
| `session.setThinking` | `{ level }` | Set thinking level |
| `session.getModels` | — | List available models |

### Session Management

| Method | Params | Description |
|--------|--------|-------------|
| `session.new` | — | Start a new session |
| `session.compact` | `{ customInstructions? }` | Compact context |
| `session.fork` | `{ entryId }` | Fork from a previous message |
| `session.setName` | `{ name }` | Set session display name |

### Extension UI

| Method | Params | Description |
|--------|--------|-------------|
| `session.extensionUiResponse` | `{ id, value?, confirmed?, cancelled? }` | Respond to extension UI request |

## Push Channels

| Channel | Data | Description |
|---------|------|-------------|
| `pi.event` | Pi RPC event | All Pi events (streaming text, tool calls, lifecycle) |
| `pi.response` | Pi RPC response | Command acknowledgments from Pi |
| `server.welcome` | `{ cwd, version }` | Sent on WebSocket connect |
| `server.error` | `{ message }` | Server-level errors |

## Differences from T3 Code

| T3 Code | PiBun |
|---------|-------|
| Effect Schema for encode/decode | Plain `JSON.parse` / `JSON.stringify` |
| Orchestration domain events | Raw Pi events passed through |
| Multiple push channels for orchestration, terminal, git, keybindings | Primarily `pi.event` — all Pi activity on one channel |
| Request body uses tagged unions (`_tag` field) | Simple `method` string |
| Provider-specific event normalization | None needed — Pi's events are already normalized |

## Client Implementation Notes

The browser-side `WsTransport` class handles:

- Connection lifecycle and reconnection
- Request/response correlation via `id`
- Push channel subscriptions with listener sets
- Outbound queue for messages sent while disconnecting/reconnecting
- Latest-push replay for channels (so a newly mounted component gets current state)
