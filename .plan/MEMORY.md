# Shared Memory

> Context and decisions that **every session must know**. Read this at the start of every session.

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use Pi's RPC mode (subprocess), not SDK (in-process) | Process isolation — Pi crash ≠ server crash. Same pattern as T3 Code with Codex. Clean boundary. Language agnostic. | 2026-03-23 |
| 2 | No Effect/Schema — plain TypeScript + Zustand | T3 Code uses Effect heavily. We start simple. Pi's RPC protocol is simple enough that raw types suffice. Can add Effect later if complexity warrants. | 2026-03-23 |
| 3 | Electrobun, not Electron | Bun-native runtime. Native webview instead of bundled Chromium (~20MB vs ~150MB+). Designed for the Bun ecosystem. | 2026-03-23 |
| 4 | Don't fork T3 Code — build fresh | ~60% of T3 Code's server is Codex-specific (approval flows, collaboration modes, plan mode, thread/turn mapping, model normalization). Its orchestration layer (event sourcing with decider/projector) adds complexity Pi doesn't need. Starting fresh is faster. | 2026-03-23 |
| 5 | Pi handles ALL state management internally | Session persistence, model registry, API keys, auto-compaction, auto-retry, tool execution, extensions, skills, prompt templates — all Pi's responsibility. Server is a thin bridge. | 2026-03-23 |
| 6 | Strict LF-delimited JSONL parsing — NEVER use readline | Pi docs warn: `readline` splits on Unicode line separators (U+2028, U+2029) which can appear inside JSON string payloads. Accumulate buffer, split on `\n` only, strip optional trailing `\r`. | 2026-03-23 |
| 7 | `tool_execution_update.partialResult` is ACCUMULATED, not delta | Each update contains the full output so far. UI replaces display on each update, not appends. Different from `text_delta` which IS a delta. | 2026-03-23 |
| 8 | WebSocket protocol: simple method strings, not tagged unions | T3 Code uses tagged unions with `_tag` field. We use `"session.prompt"` etc. Simpler to implement and debug. | 2026-03-23 |
| 9 | One Pi process per session | PiRpcManager maps session ID → PiProcess. Each process is independent. Start/stop lifecycle per session. | 2026-03-23 |
| 10 | Bun monorepo with Turbo | Standard Bun workspace layout. Turbo for build orchestration across packages. Two packages (contracts, shared), three apps (server, web, desktop). | 2026-03-23 |
| 11 | `packages/shared` uses explicit subpath exports, no barrel index | e.g., `@pibun/shared/jsonl`. Prevents unintended coupling and tree-shaking issues. | 2026-03-23 |
| 12 | `packages/contracts` is types-only, zero runtime code | Pure TypeScript interfaces and type aliases. No classes, no functions, no runtime dependencies. Importable by any package without side effects. | 2026-03-23 |
| 13 | steer vs follow_up: two different queue modes during streaming | `steer` — delivered after current turn's tool calls finish (agent processes immediately). `follow_up` — delivered only after agent fully stops (queued for next turn). Both set `streamingBehavior` on the prompt command. | 2026-03-23 |
| 14 | Extension UI requests BLOCK until response | `select`, `confirm`, `input`, `editor` dialogs block Pi until we send `extension_ui_response`. Fire-and-forget types (`notify`, `setStatus`, `setWidget`) don't need response. Must render dialogs promptly. | 2026-03-23 |
| 15 | Desktop is Phase 2 — web must work fully first | Server + web app must be stable and feature-complete before Electrobun wrapping begins. Browser-first development. | 2026-03-23 |
| 16 | Turbo 2.8+ requires `packageManager` field in root package.json | Without it, `turbo run` fails with "Could not resolve workspaces". Added `"packageManager": "bun@1.2.21"`. | 2026-03-23 |
| 17 | Biome formatter uses tabs, double quotes, semicolons | Configured in biome.json. All JSON and TS files must be tab-indented. Run `bun run format` after creating files written with spaces. | 2026-03-23 |
| 18 | `lint` runs Biome at root level, not per-package via Turbo | `bun run lint` = `biome check .` at monorepo root. Biome handles all file discovery. No `lint` task in turbo.json. `typecheck` still runs per-package via Turbo. | 2026-03-23 |
| 19 | Biome needs `bun pm trust @biomejs/biome` after first install | Bun blocks postinstall scripts by default. Biome's postinstall downloads the platform-specific binary. Must trust it. | 2026-03-23 |
| 20 | Pi RPC commands use `"type"` field, not `"command"` field | e.g., `{"type":"get_available_models","id":"test-1"}`. The `"command"` field appears only in responses. Verified with Pi 0.61.1. | 2026-03-23 |
| 21 | Pi RPC auto-creates session files on startup | Even without explicit session commands, `pi --mode rpc` creates a session file at `~/.pi/agent/sessions/`. The `get_state` response includes `sessionFile` and `sessionId`. | 2026-03-23 |
| 22 | esbuild also needs `bun pm trust` (pulled in by Vite) | Added `esbuild` to `trustedDependencies` in root package.json alongside `@biomejs/biome`. | 2026-03-23 |
| 23 | Biome import organizer: `node:` builtins first, then `@scoped`, then bare specifiers | Biome's `organizeImports` enforces `node:path` before `@tailwindcss/vite` before `vite`. Follow this in all files. | 2026-03-23 |
| 24 | Web app uses `@/` path alias for src-relative imports | Configured in both `tsconfig.json` (paths) and `vite.config.ts` (resolve.alias). Pattern: `import { Foo } from "@/components/Foo"`. | 2026-03-23 |
| 25 | Contracts types use `Pi` prefix for all exported names | e.g., `PiEvent`, `PiCommand`, `PiResponse`, `PiModel`, `PiTextContent`. Avoids collisions with React/DOM/library types and makes Pi-origin clear at usage sites. | 2026-03-23 |
| 26 | `PiStdoutLine = PiEvent \| PiResponse` covers all JSONL from Pi stdout | Two top-level discriminants: events have various `type` values, responses always have `type: "response"`. Parse a line, check `type === "response"` first, then narrow to event union. | 2026-03-23 |
| 27 | Contracts organized as 4 files: piTypes.ts, piEvents.ts, piCommands.ts, piResponses.ts | Base types in piTypes (content, messages, model). Events in piEvents. Commands + extension UI responses in piCommands. Responses in piResponses. All re-exported from index.ts. | 2026-03-23 |
| 28 | Tool args typed as `Record<string, unknown>` not `any` | Stricter than Pi's source (which uses `any`) but still flexible for varied tool argument shapes. Encourages explicit narrowing at usage sites. | 2026-03-23 |
| 29 | JSONL parser is a stateful `JsonlParser` class with `feed`/`flush`/`reset` | Follows Pi's own `attachJsonlLineReader` pattern but is framework-agnostic (not tied to Node `Readable`). Callback-based: constructor takes `onLine` callback. Works with any chunk source. | 2026-03-23 |
| 30 | Test files use `lineAt()` helper instead of non-null assertions for array access | Biome's `noNonNullAssertion` rule forbids `!`. Combined with TS `noUncheckedIndexedAccess`, array indexing needs a safe accessor. `lineAt(lines, i)` throws if out of bounds. | 2026-03-23 |
| 31 | Server tsconfig does NOT use project references — uses direct `.ts` resolution | Workspace packages export `.ts` source files directly (via `exports` in package.json). With `moduleResolution: "Bundler"`, TypeScript resolves these without needing compiled `.d.ts` files. Removed `composite`, `declaration`, `declarationMap`, and `references` from server tsconfig. | 2026-03-23 |
| 32 | `PiProcess` uses `Subprocess<"pipe","pipe","pipe">` type for full stdin/stdout/stderr typing | Bun's `Bun.spawn()` with `const` generic parameters infers literal types from options. `Subprocess<"pipe","pipe","pipe">` narrows `stdin` to `FileSink`, `stdout`/`stderr` to `ReadableStream<Uint8Array>`. Alias: `PipedSubprocess`. | 2026-03-23 |
| 33 | `Bun.spawn` cwd must not be `undefined` with `exactOptionalPropertyTypes` | Use `cwd: options.cwd ?? process.cwd()` to always provide a string. Same pattern for `env`: always pass `process.env` (merged or not). | 2026-03-23 |
| 34 | `PiProcess.sendExtensionResponse()` is fire-and-forget, not correlated | Extension UI responses use the original request ID. Pi sends back an acknowledgment but PiProcess doesn't wait for it. Separate from `sendCommand()` which correlates request/response via generated IDs. | 2026-03-23 |
| 35 | PiRpcManager removes session from map BEFORE calling `process.stop()` | Prevents re-entrant cleanup: `stop()` triggers process exit → `onExit` fires → `handleProcessExit` checks `sessions.has()` → already removed, so no double-cleanup. The "remove first, stop second" pattern avoids race conditions. | 2026-03-23 |
| 36 | PiRpcManager crash handling: non-fatal errors don't remove sessions | JSONL parse errors and stream errors from `onError` are non-fatal — the process may still be running. Only actual process exit (via `onExit`) with state === "crashed" triggers session cleanup and crash event emission. | 2026-03-23 |
| 37 | Tests use a fake Pi binary (test-fixtures/fake-pi.ts) for subprocess tests | Executable Bun script with `#!/usr/bin/env bun` shebang. Accepts same CLI args as `pi --mode rpc`, responds to JSONL commands with success responses. Configurable via env vars: `FAKE_PI_CRASH_AFTER_MS`, `FAKE_PI_EXIT_CODE`, `FAKE_PI_STDERR`. Use `piCommand` option in PiProcessOptions to point at it. | 2026-03-23 |
| 38 | Biome sorts `type` imports before value imports in named import groups | `import { type Foo, Bar }` not `import { Bar, type Foo }`. Also `process.env.KEY` not `process.env["KEY"]` (useLiteralKeys). |
| 39 | Integration test confirmed full Pi RPC event lifecycle | Observed sequence: `agent_start` → `turn_start` → `message_start` (user) → `message_end` (user) → `message_start` (assistant) → `message_update` (text_start) → `message_update` (text_delta) → `message_update` (text_end) → `message_end` (assistant) → `turn_end` → `agent_end`. Text deltas are inside `message_update.assistantMessageEvent.delta`. | 2026-03-23 |
| 40 | `PiResponse` union requires narrowing via `command` + `success` to access `data` | Can't access `.data` on the raw `PiResponse` type — must narrow with `stateResp.command === "get_state"` first. TS discriminated union pattern. | 2026-03-23 |
| 41 | `PiPromptCommand.message` is `string`, not content block array | The prompt command takes a plain string message. Images go in a separate `images` field. Don't send `[{ type: "text", text: "..." }]`. | 2026-03-23 |
| 42 | WebSocket protocol types in `packages/contracts/src/wsProtocol.ts` | File contains: `WS_METHODS` + `WS_CHANNELS` const objects, per-method params/result interfaces, `WsMethodParamsMap`/`WsMethodResultMap`/`WsChannelDataMap` type maps, wire types (`WsRequest`, `WsResponse`, `WsPush`), and generic typed variants (`WsTypedRequest<M>`, `WsTypedPush<C>`). Constants use `as const` for literal type inference. | 2026-03-23 |
| 43 | `WsResponse` discriminated via property presence, not literal discriminant | `WsResponseOk` has `result`, `WsResponseError` has `error`. Narrow with `"error" in resp`. `WsPush` discriminated from responses by `type === "push"`. | 2026-03-23 |
| 44 | `WsTypedRequest<M>` uses conditional type for optional params | Methods with `undefined` in `WsMethodParamsMap` get `params?: never`, methods with defined params get `params: T`. This makes `send("session.stop")` work without params while requiring params for `send("session.prompt", { message: "..." })`. | 2026-03-23 |
| 45 | `Server<WsConnectionData>` generic required for Bun's serve() | Bun's `Server` interface requires one generic type argument for WebSocket data. `server.upgrade()` does NOT take a type argument — it's inferred from `Bun.serve<T>()`. | 2026-03-23 |
| 46 | `createServer()` returns a `PiBunServer` facade with `stop()` method | Factory function pattern — not a class. Returns `{ server, connections, config, stop() }`. The `stop()` method closes all WS connections, then stops the HTTP server. Separates creation from entry-point bootstrap. | 2026-03-23 |
| 47 | Static file serving uses `Bun.file()` with SPA fallback | For paths with no extension (client routes), falls back to `index.html`. For paths with extension that don't exist, returns 404. Directory traversal prevented by stripping `..` from paths. | 2026-03-23 |
| 48 | Server config via env vars: `PIBUN_PORT`, `PIBUN_HOST`, `PIBUN_STATIC_DIR` | Defaults: port 24242, hostname "localhost", static dir = `apps/web/dist` relative to server source. Use `process.env.KEY` dot notation (Biome enforces `useLiteralKeys`). | 2026-03-23 |
| 49 | `WsConnectionData` carries per-connection state on Bun WebSocket `data` field | Fields: `id` (unique conn ID), `sessionId` (bound Pi session, null until session.start), `connectedAt` (timestamp). Set during `server.upgrade()`. | 2026-03-23 |
| 50 | Handler registry uses `AnyWsHandler` with `any` params for type erasure | Function params are contravariant — `(params: SpecificType) => R` is NOT assignable to `(params: unknown) => R`. The registry uses `any` at the type level; runtime dispatches `unknown`. Biome lint suppressed with inline comment. | 2026-03-23 |
| 51 | `sendPush` injected via HandlerContext to avoid circular dependency | `server.ts` imports `handlers/index.ts` which imports `handlers/session.ts`. If session.ts imported `sendPush` from server.ts, it would create a cycle. Instead, `sendPush` is passed as a function on the `HandlerContext` object. | 2026-03-23 |
| 52 | `exactOptionalPropertyTypes` requires conditional spread for optional Pi options | Can't pass `undefined` to optional PiProcessOptions fields. Use `...(value && { key: value })` pattern to only include defined values. | 2026-03-23 |
| 53 | All 17 WS methods have handlers registered in `handlers/session.ts` | Session lifecycle (start/stop/getState/getMessages/getStats), prompting (prompt/steer/followUp/abort), model (setModel/setThinking/getModels), management (new/compact/fork/setName), extension UI (extensionUiResponse). All follow thin bridge pattern. | 2026-03-23 |
| 54 | `session.start` stops existing session before creating new one | If a WS connection already has a bound session, handleSessionStart stops it first. Prevents orphaned Pi processes. |
| 55 | Web tsconfig cleaned up — no composite/declaration/references | Same fix as server (MEMORY #31). Workspace packages export `.ts` source directly, so project references are unnecessary. Removed `composite`, `declaration`, `declarationMap`, `references`. | 2026-03-23 |
| 56 | Zustand 5.0.12 installed in `apps/web` | Needed for store slices (connection, session, messages, models, pendingExtensionUi). | 2026-03-23 |
| 57 | WsTransport uses variadic args for optional params typing | `request<M>(...args: WsMethodParamsMap[M] extends undefined ? [method: M] : [method: M, params: WsMethodParamsMap[M]])` allows `request("session.stop")` with no params and `request("session.prompt", { message: "hello" })` with required params. | 2026-03-23 |
| 58 | WsTransport stores push data (not full WsPush envelope) in latestPushByChannel | Listeners receive `WsChannelDataMap[C]` (the data payload), not the full push envelope. Simpler API — subscribers don't need to unwrap. | 2026-03-23 |
| 59 | WsTransport.onStateChange() for Zustand integration | Separate from push subscriptions. Returns unsubscribe function. Used by the Zustand connection slice to sync transport state. | 2026-03-23 |
| 60 | Vite dev proxy: `/ws` → `ws://localhost:24242` | Added to vite.config.ts for development. WebSocket connections from the Vite dev server at :5173 are proxied to the PiBun server at :24242. | 2026-03-23 | 2026-03-23 |

## Architecture Notes

### Server (apps/server)

Two responsibilities:
1. **PiRpcManager** — Spawn and manage `pi --mode rpc` subprocesses. One per session. JSONL stdin/stdout.
2. **WebSocket Server** — Accept browser connections. Route requests to Pi processes. Push Pi events to clients.

No orchestration engine, no event sourcing, no projectors. Pi handles its own state.

### Web (apps/web)

React + Vite SPA. Zustand store with slices:
- `connection` — WebSocket status, reconnect state
- `session` — model, thinking level, streaming status, stats
- `messages` — ChatMessage array (unified type for user/assistant/tool/system)
- `pendingExtensionUi` — current extension dialog request (if any)
- `models` — available models list

### Desktop (apps/desktop)

Electrobun wrapper. Starts server on random port, opens native webview. Native menus map to WebSocket commands. IPC only for native-only features (file dialogs, notifications).

### Key Pi RPC Facts

| Concept | Detail |
|---------|--------|
| Command format | `{"type": "command_name", "id": "optional-correlation-id", ...params}` — uses `type`, NOT `command` |
| Spawn command | `pi --mode rpc --provider <name> --model <pattern> --thinking <level>` |
| Session resume | `pi --mode rpc --session <path>` or `pi --mode rpc -c` (continue most recent) |
| Agent lifecycle | `agent_start` → (turns) → `agent_end` |
| Turn lifecycle | `turn_start` → `message_start` → `message_update`* → `message_end` → (tool execution)* → `turn_end` |
| Message deltas | `text_delta` (streaming text), `thinking_delta` (streaming reasoning), `toolcall_start/delta/end` (tool call construction), `done`/`error` (message complete/failed) |
| Tool execution | `tool_execution_start` (name, args) → `tool_execution_update`* (accumulated output) → `tool_execution_end` (result, isError) |
| Auto-recovery | `auto_compaction_start/end`, `auto_retry_start/end` |
| Every command gets a response | `{"type": "response", "command": "...", "success": true/false, "id": "..."}` |

## Reference Repos

### Pi Mono (`reference/pi-mono/`)

**The authoritative source for Pi's RPC protocol.** `packages/coding-agent/docs/rpc.md` is the complete, up-to-date RPC reference — it documents commands, events, extension UI protocol, message types, and JSONL framing rules. When our `docs/PI_INTEGRATION.md` and pi-mono disagree, pi-mono wins.

Key discoveries from pi-mono (not in our PI_INTEGRATION.md):
- `steer` and `follow_up` are separate commands (not just `streamingBehavior` on `prompt`)
- `set_steering_mode` and `set_follow_up_mode` commands exist for queue behavior control
- `bash` command exists (execute shell and add to context, separate from LLM tool calls)
- `abort_bash` and `abort_retry` are separate commands
- `export_html` command for session export
- `get_fork_messages` command to list forkable messages
- `get_last_assistant_text` command
- `set_auto_retry` command for retry control
- `extension_ui_request` has `setWidget`, `setTitle`, `set_editor_text` fire-and-forget methods
- `extension_error` event type exists
- `get_commands` returns extension commands, prompt templates, and skills
- `cycle_thinking_level` command exists
- `new_session` supports `parentSession` tracking
- Pi has a TypeScript RPC client at `src/modes/rpc/rpc-client.ts` we can reference
- JSONL framing section confirms our LF-only splitting approach

### Pi Web UI (`reference/pi-mono/packages/web-ui/`) — DO NOT USE

Pi has its own web UI package built with mini-lit web components. **We are NOT using this.** It has caused problems before. PiBun builds its own React UI from scratch. The web-ui package is useful only as a reference for understanding Pi's agent event model and message types — never import or depend on it.

### T3 Code (`reference/t3code/`)

**Learn from:**
- `apps/web/src/wsTransport.ts` — WebSocket transport with reconnect, pending requests, push subscriptions
- `apps/web/src/store.ts` — Zustand store structure
- `apps/web/src/components/ChatView.tsx` — Chat rendering approach
- `apps/web/src/components/chat/MessagesTimeline.tsx` — Message timeline with streaming
- `apps/web/src/components/ComposerPromptEditor.tsx` — Composer input
- `apps/web/src/components/Sidebar.tsx` — Session sidebar
- `apps/web/src/components/ui/` — UI component library (buttons, inputs, dialogs, etc.)
- `packages/contracts/src/ws.ts` — WebSocket protocol types

**Don't copy:**
- Effect/Schema usage — we use plain TypeScript
- Orchestration engine (decider/projector/event sourcing) — Pi handles state
- Codex-specific protocol handling — we use Pi's simpler protocol
- Provider normalization layer — Pi's events are already normalized

### Electrobun (`reference/electrobun/`)

**Learn from:**
- `templates/hello-world/` — Minimal Electrobun app structure
- `templates/react-tailwind-vite/` — React + Vite + Tailwind in Electrobun
- `package/src/bun/core/BrowserWindow.ts` — Window management API
- `package/src/bun/core/ApplicationMenu.ts` — Native menu API

## What's Not Built Yet

- Pi RPC types fully defined in `packages/contracts/` ✅
- JSONL parser in `packages/shared/` ✅
- PiProcess class in `apps/server/src/piProcess.ts` ✅ — wraps Bun.spawn of `pi --mode rpc`, uses JsonlParser, typed listeners, command correlation
- PiRpcManager at `apps/server/src/piRpcManager.ts` ✅ — session ID → PiProcess mapping, crash handling with stderr capture, parallel stopAll for shutdown
- PiRpcManager tests at `apps/server/src/piRpcManager.test.ts` — 37 tests covering CRUD, stop, crash, events, command forwarding
- Fake Pi binary at `apps/server/test-fixtures/fake-pi.ts` — reusable for any tests needing a Pi subprocess
- Integration test at `apps/server/src/integration-test.ts` ✅ — verified full Pi RPC round-trip with real Pi process
- **Phase 1A COMPLETE** — all items done, exit criteria met
- WebSocket protocol types defined in `packages/contracts/src/wsProtocol.ts` ✅ — 17 methods, 4 push channels, type maps, wire types, typed generics
- HTTP server + WebSocket server in `apps/server/src/server.ts` ✅ — health endpoint, static file serving, WebSocket upgrade with connection tracking
- Entry point updated in `apps/server/src/index.ts` ✅ — creates PiRpcManager, starts server, graceful shutdown on SIGINT/SIGTERM
- WebSocket dispatch system in `apps/server/src/server.ts` ✅ — parse WsRequest, route via handler registry, send WsResponse/WsResponseError, type guard validation
- All 17 WS method handlers in `apps/server/src/handlers/session.ts` ✅ — thin bridge to Pi RPC commands
- Handler registry in `apps/server/src/handlers/index.ts` ✅ — method string → handler function map
- Handler types in `apps/server/src/handlers/types.ts` ✅ — HandlerContext with sendPush, WsHandler<M>, AnyWsHandler
- Pi event/response forwarding wired in session.start handler ✅ — onEvent → pi.event push, onResponse → pi.response push
- server.welcome push on WebSocket connect ✅ — sends cwd and version
- Dispatch unit tests at `apps/server/src/handlers/dispatch.test.ts` ✅ — 10 tests (welcome push, validation, error handling, handler routing, ID correlation, session.start)
- WebSocket integration test at `apps/server/src/ws-integration-test.ts` ✅ — full round-trip verified with real Pi process (12 events, text_delta streaming, session start/stop)
- **Phase 1B COMPLETE** — all items done, exit criteria met
- WsTransport class at `apps/web/src/transport.ts` ✅ — typed request/response, push subscriptions, reconnect with backoff, outbound queue, latest-push replay, state change events
- Zustand 5.0.12 added as dependency ✅
- Vite dev proxy configured for WebSocket ✅
- Next: 1C.3-1C.5 — Zustand store slices (connection, session, messages)
- Pi RPC verified with Pi 0.61.1 — `get_available_models` and `get_state` work, commands use `{"type":"..."}` format
- Electrobun's cross-platform status (Linux/Windows) needs verification before Phase 2

## Gotchas & Warnings

- **JSONL splitting**: MUST split on `\n` only. Never `readline`. Unicode line separators (U+2028, U+2029) will break things.
- **tool_execution_update is accumulated**: Don't append — replace the full output display each time.
- **Extension UI blocks**: If you don't render the dialog and respond, Pi hangs waiting.
- **Pi process tree on Windows**: Need `taskkill /T` for process tree cleanup, not just `child.kill()`.
- **View Transitions + scripts**: If using Astro-style patterns, inline scripts need `after-swap` hooks.
- **Bun WebSocket**: Bun's WebSocket API differs from Node's `ws` — use Bun's native `Bun.serve()` with `websocket` handler.
- **Pi RPC command field**: Commands sent TO Pi use `"type"` field. Responses FROM Pi have `"type": "response"` and `"command": "..."` field. Don't confuse the two.
- **Pi auto-session**: Pi creates a session file on startup even without explicit session commands. Session path encodes the CWD.

## Technical Context

- **Project dir:** `/Users/khairold/Pi/pibun/`
- **GitHub repo:** TBD
- **Build command:** `bun run build` (once workspace packages exist)
- **Typecheck:** `bun run typecheck` (via Turbo, per-package `tsc --noEmit`)
- **Lint:** `bun run lint` (Biome at root, checks all files)
- **Format:** `bun run format` (Biome auto-fix, tabs)
- **Dev server:** `bun run dev` (once implemented)
- **Installed versions:** Bun 1.2.21, Turbo 2.8.20, Biome 1.9.4, TypeScript 5.9.3, Pi 0.61.1
- **Pi default model:** claude-opus-4-6 with xhigh thinking (from `get_state`)
- **Workspace packages:** @pibun/contracts, @pibun/shared, @pibun/server, @pibun/web, @pibun/desktop
