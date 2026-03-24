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
- **Handlers** (`handlers/`) — One file per domain. Translate WebSocket requests into Pi RPC commands. Most are thin pass-throughs; session handlers have real logic.

Pi handles session state, model management, compaction, and retries internally. The server is a thin bridge.

### `apps/web`

React 19 + Vite SPA. Connects to the server via WebSocket.

- **WireTransport** (`wireTransport.ts`) — Singleton that subscribes to WebSocket push channels and maps Pi events to Zustand store actions.
- **Store** (`store/`) — Zustand store with typed slices: session, messages, models, tabs, terminal, git, plugins, projects, settings, UI state, notifications, updates, extension UI, connection.
- **Components** (`components/`) — Chat view with streaming text/thinking/tool output, sidebar with session list, composer with image paste, model selector, terminal, extension UI dialogs, settings panel.
- **Lib** (`lib/`) — Action modules (session, tab, git, project, plugin, settings, terminal) that call WsTransport methods and update the store. Theme engine with CSS variable injection. Shiki highlighter setup.

### `apps/desktop`

Electrobun native app. Embeds server in-process (same Bun event loop, no child process).

- Starts server on a random port at launch
- Opens a native webview pointing at the server
- Native menus forwarded via WebSocket push (`menu.action` channel)
- PTY-based terminal via `bun-pty` native library
- See [DESKTOP.md](DESKTOP.md) for Electrobun specifics and distribution

### `packages/contracts`

Types-only package. Zero runtime code. Three domains:

- **Pi protocol types** — Events, commands, responses mirroring Pi's JSONL protocol
- **WebSocket protocol types** (`wsProtocol.ts`) — All 42 method params/results, 7 push channels, request/response envelopes. Single source of truth for the client ↔ server contract.
- **Domain types** — Session tabs, projects, themes, settings, plugins, git types

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

## Multi-Session Model

- **Tab IDs** are client-generated (UI concept, can exist before session starts)
- **Session IDs** come from Pi (assigned when `pi --mode rpc` spawns)
- `SessionTab.sessionId` links a tab to its Pi session
- `PiRpcManager` maps session ID → PiProcess instance
- `WsRequest.sessionId` routes each request to the correct process
