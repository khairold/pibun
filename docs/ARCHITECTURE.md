# Architecture

## Overview

PiBun is a Bun monorepo with three apps and two shared packages. The server spawns Pi as a subprocess (RPC mode), translates its JSONL events into WebSocket pushes, and the React UI renders them. Electrobun wraps everything into a native desktop app.

## Monorepo Structure

```
pibun/
├── apps/
│   ├── server/          # Bun server — Pi RPC bridge + WebSocket
│   ├── web/             # React/Vite UI
│   └── desktop/         # Electrobun native wrapper
│
├── packages/
│   ├── contracts/       # Shared TypeScript types (no runtime logic)
│   └── shared/          # Shared runtime utilities
│
├── package.json         # Workspace root
└── turbo.json           # Build orchestration
```

## Package Roles

### `apps/server`

Bun/Node server. Two responsibilities:

1. **Pi RPC Manager** — Spawns and manages `pi --mode rpc` subprocesses. One Pi process per session. Reads JSONL events from stdout, writes commands to stdin.
2. **WebSocket Server** — Accepts browser connections. Routes client requests to the correct Pi process. Pushes Pi events to connected clients. Also serves the built web app as static files in production.

No orchestration engine, no event sourcing, no projectors. Pi handles session state, model management, compaction, and retries internally. The server is a thin bridge.

### `apps/web`

React + Vite SPA. Connects to the server via WebSocket. Responsibilities:

- Render streaming conversations (text deltas, thinking blocks)
- Render tool calls and their output (bash, read, edit, write)
- Session controls (new, switch, fork, compact)
- Model and thinking level selection
- Message composer with image paste support
- Message queue (steer and follow-up)

State management via Zustand. No Effect, no Schema — plain TypeScript.

### `apps/desktop`

Electrobun native app. Wraps the server + web into a single desktop application:

- Starts the server on a random port at launch
- Opens a native webview pointing at the server
- Native menus, window management
- Auto-update support (future)

### `packages/contracts`

Shared TypeScript types and constants. No runtime code. Contains:

- Pi RPC event types (mirroring Pi's JSONL protocol)
- Pi RPC command types
- WebSocket protocol types (client ↔ server)
- Session and model type definitions

### `packages/shared`

Shared runtime utilities used by both server and web:

- JSONL parser (strict LF splitting — Pi docs warn against `readline`)
- Common helpers

Uses explicit subpath exports (e.g., `@pibun/shared/jsonl`). No barrel index.

## Key Design Decisions

### Why RPC mode, not SDK?

Pi offers both an in-process SDK and a subprocess RPC mode. We chose RPC because:

- **Process isolation** — Pi crash ≠ server crash
- **Same pattern as T3 Code** — proven architecture with Codex
- **Language agnostic** — the server could be rewritten in any language later
- **Clean boundary** — Pi manages its own state; we just pipe events through

### Why not Effect/Schema?

T3 Code uses Effect heavily for the server. We're starting with plain TypeScript because:

- Simpler onboarding — fewer concepts to learn
- Pi's RPC protocol is simple enough that raw types suffice
- Can add Effect later if complexity warrants it

### Why Electrobun, not Electron?

- **Bun-native** — PiBun already uses Bun as its runtime
- **Native webview** — no bundled Chromium, much smaller binaries
- **Modern** — designed for the Bun ecosystem from day one

### Why not fork T3 Code?

~60% of T3 Code's server is Codex-specific protocol plumbing (approval flows, collaboration modes, plan mode instructions, thread/turn mapping, model normalization). The orchestration layer (event sourcing with decider/projector) adds complexity that isn't needed when Pi already manages its own state. Starting fresh with Pi's clean RPC protocol is faster than ripping out Codex internals.

## What We Keep From T3 Code (As Reference)

- WebSocket transport pattern (`WsTransport` class with reconnect, pending requests, push subscriptions)
- Zustand store structure for UI state
- Chat rendering approach (streaming text deltas, collapsible tool output)
- General UX patterns (sidebar, composer, model selector)
