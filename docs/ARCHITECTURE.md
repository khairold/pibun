# Architecture

## Overview

PiBun is a Bun monorepo with three apps and two shared packages. The server spawns Pi as a subprocess (RPC mode), translates its JSONL events into WebSocket pushes, and the React UI renders them. Electrobun wraps everything into a native desktop app.

```
┌─────────────┐     WebSocket      ┌──────────────┐     stdio/JSONL     ┌─────────┐
│  React UI   │ ◄──────────────────►│  Bun Server  │ ◄──────────────────►│ pi --rpc│
│  (Vite)     │                     │              │                     │         │
│  Chat, Tools│                     │ piRpcManager  │                     │ LLM API │
│  Sessions   │                     │ wsServer      │                     │ Tools   │
└─────────────┘                     └──────────────┘                     └─────────┘
         ▲                                  ▲
         └──────── Electrobun webview ──────┘
```

## Monorepo Layout

```
pibun/
├── apps/
│   ├── server/          # Bun HTTP + WebSocket server — Pi RPC bridge
│   ├── web/             # React 19 + Vite + Zustand + Tailwind CSS v4
│   └── desktop/         # Electrobun native wrapper
├── packages/
│   ├── contracts/       # Shared TypeScript types (no runtime logic)
│   └── shared/          # Shared runtime utilities (@pibun/shared/jsonl)
├── docs/                # ARCHITECTURE.md, DESKTOP.md, CODE_SIGNING.md, ROADMAP.md
└── reference/           # Read-only reference repos (pi-mono, t3code, electrobun)
```

## Package Roles

### `apps/server`

Bun HTTP + WebSocket server. Two modules:

- **PiRpcManager** (`piRpcManager.ts`) — Maps session IDs to PiProcess instances. One `pi --mode rpc` subprocess per session. Handles spawn, lifecycle, and cleanup.
- **PiProcess** (`piProcess.ts`) — Wraps a single Pi subprocess. Reads JSONL from stdout, writes commands to stdin. Provides typed command methods and event listeners.
- **WebSocket Server** (`server.ts`) — Accepts browser connections. Routes client requests (42 methods across session, app, git, terminal, project, settings, plugin domains) to the correct Pi process via handler functions. Pushes Pi events to connected clients on 7 push channels.
- **Handlers** (`handlers/`) — Two handler files: `session.ts` (Pi RPC session lifecycle, event forwarding) and `appHandlers.ts` (app/git/plugin/project/settings/terminal — server-side service calls). Plus `types.ts` (shared helpers including `piPassthrough`) and `index.ts` (dispatch registry mapping 42 methods).

Pi handles session state, model management, compaction, and retries internally. The server is a thin bridge.

### `apps/web`

React 19 + Vite SPA. Connects to the server via WebSocket.

- **WireTransport** (`wireTransport.ts`) — Singleton that subscribes to WebSocket push channels and maps Pi events to Zustand store actions.
- **Store** (`store/`) — Zustand store with 3 deep slices: `appSlice` (connection+ui+update+notifications), `sessionSlice` (session+messages+models+extensionUi), `workspaceSlice` (tabs+terminal+git+plugins+projects). Plus `types.ts` (all slice interfaces) and `index.ts` (store creation).
- **Components** (`components/`) — Chat rendering in 3 deep files (`ChatMessages`, `ToolCards`, `ToolOutput`). Top-level layout: AppShell, Sidebar, Composer, ChatView, ContentTabBar, TerminalInstance, GitPanel, etc. Extension UI dialogs in `extension/`.
- **Lib** (`lib/`) — 7 action/utility files: `appActions` (git+project+plugin+settings+terminal), `sessionActions`, `tabActions`, `themes` (CSS variable injection), `highlighter` (Shiki setup), `pluginMessageBridge`, `utils` (cn+fileUtils+shortcuts).

### `apps/desktop`

Electrobun native app. Embeds server in-process (same Bun event loop, no child process).

- Starts server on a random port at launch
- Opens a native webview pointing at the server
- Native menus forwarded via WebSocket push (`menu.action` channel)
- PTY-based terminal via `bun-pty` native library
- See [DESKTOP.md](DESKTOP.md) for Electrobun specifics and distribution

### `packages/contracts`

Types-only package. Zero runtime code. Three domains:

- **`piProtocol.ts`** — All Pi RPC types in one file: events, commands, responses, content blocks, messages, model types
- **`wsProtocol.ts`** — All 42 method params/results, 7 push channels, request/response envelopes. Single source of truth for the client ↔ server contract.
- **`domain.ts`** — All app domain types: sessions, terminals, projects, themes, settings, plugins, git types

### `packages/shared`

Shared runtime utilities with explicit subpath exports:

- `@pibun/shared/jsonl` — JSONL parser (strict LF splitting, never readline)

## Data Flow

1. User types in Composer → calls `sessionActions.sendPrompt()`
2. `sendPrompt` sends `session.prompt` via WsTransport
3. Server handler receives request, calls `piProcess.prompt()`
4. Pi subprocess processes prompt, streams JSONL events on stdout
5. PiProcess parses JSONL, emits typed events
6. Server pushes events to WebSocket clients on `pi.event` channel
7. WireTransport receives push, dispatches to Zustand store
8. React components re-render from store state (streaming text, tool output, etc.)

## Session Model

Single active session — one Pi process runs at a time. Sidebar lists sessions under projects; clicking switches.

- **Tab IDs** are client-generated (UI concept, can exist before session starts)
- **Two session ID domains** — `sessionId` = PiBun manager ID (`session_{N}_{timestamp}`, for event routing). `piSessionId` = Pi internal UUID (for session list matching). Never conflate.
- `Session.sessionId` links a tab to its Pi process via PiBun manager ID
- `PiRpcManager` maps session ID → PiProcess instance
- `WsRequest.sessionId` routes each request to the correct process
- Switching sessions: stop old process → start new → load messages from Pi
- Empty sessions (0 messages) auto-removed when switching away

## Content Tab Model

Main content area has a tab bar: `[Chat] [Terminal 1] [Terminal 2] [+]`

- **Chat tab** (always first) — active Pi session's conversation. Changes when sidebar session selection changes.
- **Terminal tabs** — project-scoped, not session-scoped. Switching sessions within the same project keeps terminal tabs intact. Switching to a different project swaps to that project's terminal set (kept alive in background).
- **Minimum tabs** — 1 chat + 1 terminal when a project is active. Default terminal auto-created on project activation.
- **Terminal tabs are renameable** — double-click label to edit. Default names auto-increment per project ("Terminal 1", "Terminal 2").
- **Full-height terminals** — no bottom panel. Content area uses absolute-positioned layers with `hidden` toggling to preserve xterm.js instances.
- **State** — `activeContentTab: "chat" | terminalTabId` tracks the visible tab. `projectContentTabs: Record<string, string>` saves/restores the last active content tab per project on project switch.
- **Keyboard navigation** — `Ctrl+1` = chat, `Ctrl+2-9` = terminal by position, `Ctrl+J` = toggle chat ↔ last terminal.
