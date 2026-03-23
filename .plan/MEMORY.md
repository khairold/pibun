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

- No code exists yet — Phase 0 scaffold is the first coding work
- Pi's `--mode rpc` needs to be verified with current Pi version
- Electrobun's cross-platform status (Linux/Windows) needs verification before Phase 2

## Gotchas & Warnings

- **JSONL splitting**: MUST split on `\n` only. Never `readline`. Unicode line separators (U+2028, U+2029) will break things.
- **tool_execution_update is accumulated**: Don't append — replace the full output display each time.
- **Extension UI blocks**: If you don't render the dialog and respond, Pi hangs waiting.
- **Pi process tree on Windows**: Need `taskkill /T` for process tree cleanup, not just `child.kill()`.
- **View Transitions + scripts**: If using Astro-style patterns, inline scripts need `after-swap` hooks.
- **Bun WebSocket**: Bun's WebSocket API differs from Node's `ws` — use Bun's native `Bun.serve()` with `websocket` handler.

## Technical Context

- **Project dir:** `/Users/khairold/Pi/pibun/`
- **GitHub repo:** TBD
- **Build command:** `bun run build` (once workspace packages exist)
- **Typecheck:** `bun run typecheck` (via Turbo, per-package `tsc --noEmit`)
- **Lint:** `bun run lint` (Biome at root, checks all files)
- **Format:** `bun run format` (Biome auto-fix, tabs)
- **Dev server:** `bun run dev` (once implemented)
- **Installed versions:** Bun 1.2.21, Turbo 2.8.20, Biome 1.9.4, TypeScript 5.9.3
