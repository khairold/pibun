# Key Decisions & Gotchas

Architectural decisions and hard-won lessons from building PiBun. Read before making structural changes.

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Pi's RPC mode (subprocess), not SDK (in-process) | Process isolation — Pi crash ≠ server crash. Clean boundary. Language agnostic. |
| 2 | Plain TypeScript + Zustand, no Effect/Schema | Pi's RPC protocol is simple enough that raw types suffice. Can add Effect later if complexity warrants. |
| 3 | Electrobun, not Electron | Bun-native runtime. Native webview (~20MB vs ~150MB+). Designed for the Bun ecosystem. |
| 4 | Build fresh, don't fork T3 Code | ~60% of T3 Code is Codex-specific. Pi handles its own state. Starting fresh is faster. |
| 5 | Pi handles ALL state management internally | Session persistence, model registry, API keys, auto-compaction, auto-retry, tool execution — all Pi's responsibility. Server is a thin bridge. |
| 6 | One Pi process per session | PiRpcManager maps session ID → PiProcess. Each process is independent. Start/stop lifecycle per session. |
| 7 | Desktop embeds server in-process, no child process | Desktop imports `createServer` and `PiRpcManager` from `@pibun/server`. Same Bun event loop. Simpler than child process. |
| 8 | Menu actions forwarded via WebSocket push, not Electrobun IPC | Keeps web app framework-agnostic. All data flows through WebSocket. No Electrobun view-side dependency. |
| 9 | Multi-session via request-level `sessionId` on `WsRequest` | Adding `sessionId` to every method's params would break all existing call sites. Request-level + `WsTransport.setActiveSession()` is backward compatible. |
| 10 | Tab IDs are client-generated, not Pi session IDs | Tabs are a UI concept. `SessionTab.sessionId` links a tab to its Pi session. Tab can exist before session starts. |
| 11 | `packages/contracts` is types-only, zero runtime code | Pure interfaces and type aliases. No classes, no functions. Importable by any package without side effects. |
| 12 | `packages/shared` uses explicit subpath exports | e.g., `@pibun/shared/jsonl`. Prevents unintended coupling. Same for `@pibun/server` subpath exports. |

---

## Pi RPC Protocol

| Concept | Detail |
|---------|--------|
| Command format | `{"type": "command_name", "id": "optional-correlation-id", ...params}` — uses `type`, NOT `command` |
| Response format | `{"type": "response", "command": "...", "success": true/false, "id": "..."}` |
| Spawn command | `pi --mode rpc --provider <name> --model <pattern> --thinking <level>` |
| Agent lifecycle | `agent_start` → (turns) → `agent_end` |
| Turn lifecycle | `turn_start` → `message_start` → `message_update`* → `message_end` → (tool execution)* → `turn_end` |
| Text deltas | Inside `message_update.assistantMessageEvent.delta` — streaming text is a delta, NOT accumulated |
| Tool execution updates | `tool_execution_update.partialResult` is ACCUMULATED, not delta — replace display, don't append |
| Extension UI | `select`, `confirm`, `input`, `editor` dialogs BLOCK Pi until response sent |
| Authoritative reference | `reference/pi-mono/packages/coding-agent/docs/rpc.md` — when `docs/PI_INTEGRATION.md` and pi-mono disagree, pi-mono wins |

---

## Gotchas & Warnings

### JSONL Parsing
- **MUST split on `\n` only.** Never use `readline`. Unicode line separators (U+2028, U+2029) appear inside JSON string payloads and will break things.
- Use `JsonlParser` class from `@pibun/shared/jsonl` — callback-based, framework-agnostic.

### TypeScript Strict Mode
- **`exactOptionalPropertyTypes`**: Can't pass `undefined` to optional fields. Use `...(value && { key: value })` conditional spread pattern.
- **Desktop tsconfig disables `exactOptionalPropertyTypes`**: Electrobun distributes raw `.ts` files with type conflicts. `skipLibCheck` doesn't help.
- **DOM lib + ReadableStream**: Desktop has `lib: ["ESNext", "DOM"]`. DOM `ReadableStream` lacks `[Symbol.asyncIterator]()`. Use `Bun.file().slice().text()` instead of `for await...of` on ReadableStream in shared code.

### Biome Formatting
- **Tabs, double quotes, semicolons**. Run `bun run format` after creating files.
- **Import order**: `node:` builtins → `@/` path alias → `@scoped` packages → bare specifiers. `type` imports sort before value imports.
- **`process.env.KEY`** not `process.env["KEY"]` (useLiteralKeys rule).
- **Biome ignores `**/scripts/**`** — build scripts have different lint requirements.

### Bun/Electrobun
- **`bun pm trust @biomejs/biome` and `esbuild`** needed after first install (Bun blocks postinstall scripts by default).
- **`Bun.spawn` cwd must not be `undefined`** with `exactOptionalPropertyTypes`. Always provide `cwd: options.cwd ?? process.cwd()`.
- **`Subprocess<"pipe","pipe","pipe">`** type for full stdin/stdout/stderr typing.
- **`declare module "three"`** needed in desktop for Electrobun's WGPU dependency.
- **`exitOnLastWindowClosed: false`** — Electrobun's default auto-quit would abandon async shutdown cleanup.

### Native Library Bundling
- **`bun-pty` native library** must be copied into Electrobun app bundle via `electrobun.config.ts` `copy` section. Without it, the desktop app silently crashes on startup.
- Copy path: `"../../node_modules/bun-pty/rust-pty": "bun/rust-pty"`.

### Zustand
- **Never return new arrays/objects from Zustand selectors** — causes infinite re-renders. Use `useMemo` to derive computed values from raw state, or use `useShallow`.
- **Slice pattern**: `StateCreator<AppStore, [], [], SliceType>` functions, combined via spread.

### Process Management
- **PiRpcManager removes session from map BEFORE calling `process.stop()`** — prevents re-entrant cleanup race conditions.
- **JSONL parse errors are non-fatal** — process may still be running. Only actual process exit triggers session cleanup.

---

## Technical Context

| Item | Value |
|------|-------|
| Project dir | `/Users/khairold/Pi/pibun/` |
| Runtime | Bun 1.2.21 |
| Build orchestration | Turbo 2.8.20 |
| Linting/Formatting | Biome 1.9.4 |
| TypeScript | 5.9.3 |
| Pi version tested | 0.61.1 |
| Electrobun | 1.16.0 |
| React | 19 |
| Zustand | 5.0.12 |
| Default port | 24242 (server), 5173 (Vite dev) |
| Workspace packages | @pibun/contracts, @pibun/shared, @pibun/server, @pibun/web, @pibun/desktop |

---

## Reference Repos

| Repo | What to Learn From It |
|------|----------------------|
| `reference/pi-mono/` | **Authoritative Pi source.** RPC protocol, event types, message structures, SDK API. `packages/coding-agent/docs/rpc.md` is the complete RPC reference. |
| `reference/t3code/` | WebSocket transport patterns, Zustand store structure, chat rendering approach. **Don't copy** Effect/Schema usage or orchestration engine. |
| `reference/electrobun/` | Electrobun config, main process setup, webview lifecycle. Templates at `templates/`. |

**Pi Web UI (`reference/pi-mono/packages/web-ui/`)** — DO NOT USE. Pi has its own web UI built with mini-lit web components. PiBun builds its own React UI from scratch. Useful only as a reference for understanding Pi's event model.
