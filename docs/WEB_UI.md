# Web UI

## Overview

React + Vite SPA. Connects to the server via WebSocket. Renders Pi's streaming output as a chat interface with tool call visualization.

## Tech Stack

- **React 19** — UI framework
- **Vite** — build tool
- **Zustand** — state management (simple, no boilerplate)
- **TanStack Router** — file-based routing (optional, evaluate need)
- **Tailwind CSS v4** — styling
- **Shiki** — syntax highlighting for code blocks
- **MDX / react-markdown** — render assistant markdown output

## Core Views

### Chat View

The main view. A scrollable conversation with streaming text.

**Message types to render:**

| Source | Rendering |
|--------|-----------|
| User message | Right-aligned bubble or simple block |
| Assistant text | Markdown-rendered, streamed via `text_delta` events |
| Thinking block | Collapsible section, streamed via `thinking_delta` events |
| Tool call | Collapsible card showing tool name + arguments |
| Tool result | Nested inside tool call card, shows output (syntax-highlighted for code) |
| Error | Red banner with error message |
| Compaction notice | Subtle divider: "Context compacted" |
| Retry notice | Subtle banner: "Retrying (attempt 2/3)..." |

**Streaming behavior:**

- `text_delta` events append to the current text block in real-time
- `thinking_delta` events append to a collapsible thinking section
- `tool_execution_update` events replace the tool output display (accumulated, not delta)
- Scroll-to-bottom on new content, unless the user has scrolled up
- Show a "↓ New messages" button when scrolled up and new content arrives

### Composer

Message input area at the bottom.

**Features:**

- Multi-line text input (Shift+Enter for newline, Enter to send)
- Image paste (Ctrl+V) — convert to base64 and attach
- File drag-and-drop for images
- During streaming: Enter sends a steer message, some modifier sends a follow-up
- Abort button (visible during streaming)
- Visual indicator when agent is working

### Sidebar

Session and model management.

**Sections:**

- **Session list** — previous sessions, click to switch
- **Current session info** — model, token usage, cost
- **New session** button
- **Model selector** — dropdown or modal to pick provider/model
- **Thinking level** — selector (off → xhigh)

### Model Selector

Modal or dropdown for choosing the active model.

- Groups models by provider
- Shows current selection
- Pi provides the list via `get_available_models` command
- Thinking level as a secondary control

### Extension UI Dialogs

When Pi extensions request user input, we render native-feeling dialogs:

- **Select** — list of options, click to choose
- **Confirm** — yes/no dialog
- **Input** — text field dialog
- **Editor** — multi-line text editor dialog
- **Notify** — toast notification
- **Status** — persistent status line item

## State Management

Zustand store with these slices:

```
AppState
├── connection: { status, reconnectAttempt }
├── session: { id, model, thinkingLevel, isStreaming, stats }
├── messages: ChatMessage[]
├── pendingExtensionUi: ExtensionUiRequest | null
└── models: AvailableModel[]
```

### ChatMessage Type

A unified message type that covers all Pi message variants:

```
ChatMessage
├── id: string
├── timestamp: number
├── type: "user" | "assistant" | "tool_call" | "tool_result" | "system"
├── content: string (for text)
├── thinking?: string (for assistant thinking)
├── toolCall?: { id, name, args } (for tool calls)
├── toolResult?: { content, isError } (for tool results)
├── streaming?: boolean (currently being streamed)
└── deltas: accumulated from message_update events
```

### Event → State Mapping

| Pi Event | State Update |
|----------|-------------|
| `agent_start` | `session.isStreaming = true` |
| `agent_end` | `session.isStreaming = false` |
| `message_start` | Append new `ChatMessage` to `messages` |
| `message_update (text_delta)` | Append delta to current message's content |
| `message_update (thinking_delta)` | Append delta to current message's thinking |
| `message_update (toolcall_end)` | Append tool call to current message |
| `message_end` | Mark message as `streaming = false` |
| `tool_execution_start` | Append tool call message |
| `tool_execution_update` | Replace tool output (accumulated) |
| `tool_execution_end` | Finalize tool result |
| `auto_compaction_start` | Show compaction indicator |
| `auto_retry_start` | Show retry banner |

## Rendering Details

### Code Blocks

- Syntax highlight with Shiki (lazy-loaded)
- Copy button on hover
- Language label in header
- Line numbers for longer blocks

### Tool Output

- `bash` — render as terminal-style output
- `read` — show file path + syntax-highlighted content
- `edit` — show diff (old → new) if possible, or just the edit description
- `write` — show file path + content preview

### Markdown

- Standard markdown rendering for assistant text
- Links open in new tab (or system browser in desktop mode)
- Tables, lists, headings all supported

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Send message (or steer if streaming) |
| Shift+Enter | Newline in composer |
| Ctrl+C | Abort current operation |
| Ctrl+L | Open model selector |
| Ctrl+N | New session |

## Performance Considerations

- Virtualize long conversations (only render visible messages)
- Debounce rapid `text_delta` events (batch DOM updates)
- Lazy-load Shiki grammars
- Keep WebSocket connection alive with ping/pong
