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
| 61 | Zustand store uses slice pattern with `StateCreator` generics | Each slice is a `StateCreator<AppStore, [], [], SliceType>` function. Combined via spread in `create<AppStore>()((...a) => ({ ...slice1(...a), ...slice2(...a), ... }))`. Slices in `store/` directory: `connectionSlice.ts`, `sessionSlice.ts`, `messagesSlice.ts`. | 2026-03-23 |
| 62 | ChatMessage uses non-optional fields (no `undefined`) for `exactOptionalPropertyTypes` compat | All fields have default values: `content: ""`, `thinking: ""`, `toolCall: null`, `toolResult: null`, `streaming: false`. Avoids `undefined` assignment issues. | 2026-03-23 |
| 63 | Messages slice uses reverse-scan `findMessageIndex` for O(1)-ish streaming updates | Streaming messages are always at the tail. Scanning from the end finds them in 1-2 iterations. Tool results use `result-{toolCallId}` ID convention. | 2026-03-23 |
| 64 | Biome sorts `@/` path alias imports BEFORE `@pibun/` scoped packages | Alphabetical: `@/` < `@p`. Always put `@/` imports first in web app files. | 2026-03-23 |
| 65 | WsTransport `inferUrl()` appends `/ws` path for Vite proxy compatibility | Vite proxy at `/ws` → `ws://localhost:24242`. Transport connects to `ws://host:port/ws`. Works in both dev (via proxy) and production (server upgrades any path). | 2026-03-23 |
| 66 | Event wiring uses module-level state for streaming message tracking | `currentAssistantMessageId` tracks the currently streaming assistant message for routing `text_delta`/`thinking_delta` deltas. Reset on `agent_end`. `messageIdCounter` generates unique IDs like `user-1`, `assistant-2`. | 2026-03-23 |
| 67 | Tool call messages created at `tool_execution_start`, not `toolcall_end` | `toolcall_end` is the LLM finishing tool call construction. `tool_execution_start` is when execution begins (and has the same info: toolCallId, toolName, args). Creating at execution_start gives better UX timing. | 2026-03-23 |
| 68 | `makeMessage()` helper provides ChatMessage defaults for `exactOptionalPropertyTypes` compat | Takes required fields (id, type, content) + optional overrides. Defaults: `timestamp: Date.now()`, `thinking: ""`, `toolCall: null`, `toolResult: null`, `streaming: false`. Spread-based — caller overrides only what's needed. | 2026-03-23 |
| 69 | `done`/`error` assistant message events set streaming=false as safety net | `message_end` is the definitive "done" event, but `done`/`error` in `assistantMessageEvent` also mark streaming=false. Redundant but safe — prevents stale streaming state if `message_end` is missed. | 2026-03-23 |
| 70 | `initTransport()` called from `main.tsx` before `createRoot().render()` | Ensures transport is connected and subscriptions are active before any React component mounts. Returns cleanup function (unused in production but available for testing). | 2026-03-23 |
| 71 | Composer auto-starts session on first prompt | `ensureSession()` checks `sessionId` from store. If null, calls `session.start` before `session.prompt`. Avoids separate "start session" step for the user. | 2026-03-23 |
| 72 | SVG icons use `aria-label` + `role="img"` for Biome a11y compliance | Biome's `noSvgWithoutTitle` rule requires accessible labeling on all `<svg>` elements. Using `aria-label` + `role="img"` instead of nested `<title>` for simpler markup. | 2026-03-23 |
| 73 | Biome sorts `type` imports before value imports in named groups | `import { type KeyboardEvent, useCallback }` — type-prefixed members sort first alphabetically within the import group. Enforced by Biome's `organizeImports`. | 2026-03-23 |
| 74 | Sidebar hidden on mobile (`hidden md:flex`), 256px on md+ | Responsive layout: sidebar collapses below `md` breakpoint. Main chat area always fills available width. | 2026-03-23 |
| 75 | ChatView uses dedicated sub-components in `components/chat/` directory | `UserMessage`, `AssistantMessage`, `ToolCallMessage`, `ToolResultMessage`, `SystemMessage` — each memoized with `React.memo()`. `MessageItem` switch renders the correct component by `message.type`. | 2026-03-23 |
| 76 | AssistantMessage has collapsible thinking section with toggle | Thinking content shown as expandable section above main content. Shows streaming cursor in thinking section while thinking (before content arrives), then in main content section during text streaming. | 2026-03-23 |
| 77 | ToolResultMessage collapses output longer than 8 lines | `COLLAPSE_THRESHOLD = 8` lines. Shows "Show all N lines" button with fade gradient. Long tool outputs don't dominate the chat. | 2026-03-23 |
| 78 | `hasStreamingMessage()` reverse-scans for streaming indicator | When agent is working but no individual message has `streaming: true` (gap between agent_start and first message_start), ChatView shows a "Pi is thinking…" indicator with pulsing dot. | 2026-03-23 |
| 79 | `useAutoScroll` hook uses `useLayoutEffect` for flicker-free scroll | Passive scroll listener tracks position (isAtBottomRef). `useLayoutEffect` with content dep scrolls before paint. Shows floating "↓ New messages" button when scrolled up. SCROLL_THRESHOLD = 50px. | 2026-03-23 |
| 80 | ErrorBanner auto-dismisses after 10 seconds | `lastError` field on ConnectionSlice. Set by `server.error` push and Composer error catches. `clearLastError()` action. ErrorBanner renders dismissible red banner with auto-clear timer. | 2026-03-23 |
| 81 | Items 1C.10, 1C.12, 1C.14 were already implemented in prior sessions | text_delta wiring (wireTransport.ts), tool rendering (ToolCallMessage/ToolResultMessage), Vite proxy (vite.config.ts) — all built during 1C.6–1C.9 sessions. Formally verified and checked off in session 17. | 2026-03-23 |
| 82 | E2E test at `apps/server/src/e2e-test.ts` validates entire browser-to-Pi chain | 44 checks: web build (dist exists, index.html, JS bundle), static serving (GET /, /health, SPA fallback, 404 for missing), WebSocket (connect, welcome, session start/stop), streaming (agent lifecycle, message events, text_delta, tool execution), wireTransport.ts compatibility (all events have correct structure). | 2026-03-23 |
| 83 | `tool_execution_update` events are optional — fast tools skip them | Pi's `read` tool completes instantly, so it goes `tool_execution_start` → `tool_execution_end` with no `tool_execution_update` events in between. Only longer-running tools (like `bash`) emit intermediate updates. UI code must handle both paths. | 2026-03-23 |
| 84 | Phase 1C COMPLETE — all 15 items done, exit criteria verified | Working chat (server + WS + streaming), text_delta accumulation correct, tool calls visible (start/end events), session auto-starts, web app builds and serves via HTTP with SPA routing. | 2026-03-23 |
| 85 | AssistantMessage thinking auto-expands while streaming, auto-collapses when content starts | Uses `useEffect` + `userToggledRef` pattern: auto-expand when `isThinkingActive` (streaming + has thinking + no content), auto-collapse when content arrives, but user's explicit toggle overrides auto-behavior. Brain icon with pulse animation while thinking, character count shown when collapsed. Indigo tint for active thinking section. | 2026-03-23 |
| 86 | ToolExecutionCard unifies tool_call + tool_result into single card | ChatView `groupMessages()` scans message array and pairs adjacent tool_call + tool_result into `tool_group` items. ToolExecutionCard renders as one card with header (icon + name + args summary + status badge) and expandable body (args + output). Three states: running (blue border, pulse), success (green check), error (red border, X icon). Collapsed view shows first output line preview or running indicator. | 2026-03-23 |
| 87 | Tool-specific arg summaries in ToolExecutionCard header | `bash` shows command, `read/edit/write` show path, `glob/grep` show pattern. Falls back to generic first-arg display. Makes collapsed tool cards immediately informative. | 2026-03-23 |
| 88 | ChatView uses `ChatItem` union type for grouped rendering | `ChatItem = { kind: "message" } \| { kind: "tool_group" }`. `groupMessages()` produces the list, memoized with `useMemo`. `ChatItemRenderer` dispatches to MessageItem or ToolExecutionCard. Original ToolCallMessage/ToolResultMessage kept as fallback for orphan messages. | 2026-03-23 |

| 89 | Shiki singleton via `lib/highlighter.ts` with lazy language loading | `createHighlighter` called once with zero langs, then `loadLanguage()` on demand per language. Languages cached in `loadedLanguages` Set. Available languages checked against `bundledLanguagesBase` keys. Uses `shiki/bundle/web` for smaller bundle. Theme: `github-dark-default`. | 2026-03-23 |
| 90 | CodeBlock shows plain text fallback while Shiki loads | `useEffect` calls `highlightCode()` async, sets `html` state when ready. Until then renders `<pre><code>{code}</code></pre>`. Effect cancelled on unmount to prevent stale updates. | 2026-03-23 |
| 91 | react-markdown v10 default export, not named export | `import ReactMarkdown from "react-markdown"`, not `import { Markdown }`. v10 changed the export. | 2026-03-23 |
| 92 | Markdown `pre` component returns bare Fragment, not `<div>` | react-markdown wraps code blocks in `<pre><code>`. We intercept `<pre>` and discard its props (ref type `HTMLPreElement` ≠ `HTMLDivElement` causes TS error). CodeBlock handles its own wrapper. | 2026-03-23 |
| 93 | Fenced code detection: `className` presence OR content contains `\n` | react-markdown sets `className="language-xxx"` on `<code>` inside `<pre>`. Single-line code without language falls through to inline `<code>` styling. Multi-line always treated as block. | 2026-03-23 |
| 94 | Markdown component named `MarkdownContent` to avoid collision with react-markdown's `Markdown` | Avoids confusion with the library's own export. Used in AssistantMessage for rendering assistant text. | 2026-03-23 |
| 95 | Shiki web bundle code-splits all grammars and themes as separate Vite chunks | Build produces ~130 separate `.js` chunks for languages/themes, loaded on demand. Core engine ~120KB gzipped, WASM ~230KB gzipped. Only loaded when first code block appears. | 2026-03-23 |
| 96 | Dependencies added: `shiki@4.0.2`, `react-markdown@10.1.0`, `remark-gfm@4.0.1` | All in `apps/web/dependencies`. remark-gfm enables GFM tables, strikethrough, task lists, autolinks. | 2026-03-23 |
| 97 | Tool-specific output renderers in `components/chat/tools/` directory | `ToolOutput` dispatcher routes to `BashOutput` (terminal style), `ReadOutput` (syntax-highlighted with file path), `EditOutput` (diff view with −/+ lines), `WriteOutput` (file preview with CodeBlock). Non-specialized tools fall through to `DefaultOutput` (raw pre). `fileUtils.ts` infers Shiki language from file extension. | 2026-03-23 |
| 98 | `ToolExecutionCard` uses `SPECIALIZED_TOOLS` Set to switch rendering paths | For `bash/read/edit/write`, the expanded body renders `<ToolOutput>` which handles its own layout including args display. For all other tools, `<DefaultExpandedBody>` renders the legacy raw args JSON + raw output. Collapsed preview and header are shared. | 2026-03-23 |
| 99 | `fileUtils.ts` maps 70+ file extensions to Shiki language IDs + filename matches | Extension map covers JS/TS, web, data/config, scripting, systems languages, docs, and misc. Filename map handles extensionless files like Dockerfile, Makefile, .gitignore. `inferLanguageFromPath()`, `getFileName()`, `getFileExtension()`, `shortPath()` exported. | 2026-03-23 |
| 100 | `ModelsSlice` added to Zustand store for available models list | Stores `availableModels: PiModel[]` + `modelsLoading: boolean`. Separate from `SessionSlice.model` (current model). `modelsSlice.ts` follows same `StateCreator` pattern. | 2026-03-23 |
| 101 | `ModelSelector` component: dropdown with provider-grouped models, lazy fetch, click-outside close | Trigger button shows current model name + chevron. Opens dropdown on click — fetches models via `session.getModels` on first open. Groups by `provider` field. Shows reasoning/vision badges per model. Optimistic model selection with rollback on error. Escape and click-outside to close. | 2026-03-23 |
| 102 | Toolbar bar added to AppShell between ErrorBanner and ChatView | `<div>` with border-b, holds ModelSelector (and later ThinkingSelector). Separates session controls from the chat area. |
| 103 | `ThinkingSelector` component with static level list and intensity bar | Dropdown with 6 levels (off→xhigh), each with label + description + visual intensity bar (6 small rectangles). Optimistic selection with rollback on error. Same dropdown pattern as ModelSelector (click-outside, Escape, disabled when not connected). No server fetch needed — level list is static. | 2026-03-23 |
| 104 | 1D.8 model/thinking wiring already complete via selector components | `ModelSelector` calls `session.setModel` (since session 22), `ThinkingSelector` calls `session.setThinking`. Both use optimistic updates with rollback. Server handlers (`handleSessionSetModel`, `handleSessionSetThinking`) were built in session 11. | 2026-03-23 | 2026-03-23 |
| 105 | Session management uses `sessionActions.ts` module for coordinated store+transport operations | `startNewSession()`, `getForkableMessages()`, `forkFromMessage(entryId)` — async functions that call transport, clear messages, refresh state. Extracted from components to avoid duplication. Components (`NewSessionButton`, `ForkDialog`) are thin UI wrappers. | 2026-03-23 |
| 106 | `session.getForkMessages` WS method added for fork dialog | New WS method wraps Pi's `get_fork_messages` command. Returns `WsForkableMessage[]` with `entryId` + `text`. Server handler `handleSessionGetForkMessages` in session.ts. Contracts types: `WsForkableMessage`, `WsSessionGetForkMessagesResult`. | 2026-03-23 |
| 107 | Fork uses toolbar button with dropdown picker, not per-message buttons | Pi's fork messages use internal `entryId`s that don't map 1:1 to our ChatMessage IDs. The ForkDialog fetches the forkable list from Pi and lets the user pick. Avoids needing to track Pi entry IDs in our message store. Per-message fork buttons can be added later when entry ID tracking is implemented. | 2026-03-23 |
| 108 | Session switch (`switch_session`) deferred to 1D.17 sidebar | Pi's `switch_session` takes a `sessionPath` but Pi has no `list_sessions` RPC command. Full session switching needs a session list UI in the sidebar, which is 1D.17. The Pi command type `PiSwitchSessionCommand` is already in contracts. The WS method/handler can be added when the sidebar is built. | 2026-03-23 |
| 109 | New session aborts streaming before creating new session | `startNewSession()` calls `session.abort` if `isStreaming` is true before calling `session.new`. Same pattern for `forkFromMessage()`. Prevents orphaned streaming state. | 2026-03-23 |
| 110 | Session stats fetched after every `agent_end` event | `wireTransport.ts` calls `fetchSessionStats()` (from `sessionActions.ts`) when `agent_end` fires. Stats update in Zustand store `stats` field. `SessionStats` component in toolbar displays tokens + cost with expandable detail panel. | 2026-03-23 |
| 111 | `SessionStats` shows compact tokens + cost, expandable to full breakdown | Trigger button shows `formatTokens(total)` + `formatCost(cost)`. Panel shows input/output/cache read/cache write token breakdown, user/assistant/tool message counts, and total cost. Has refresh button. Same dropdown pattern (click-outside, Escape) as ModelSelector. | 2026-03-23 |
| 112 | `isCompacting` state in SessionSlice tracks compaction progress | Set true by `auto_compaction_start` event and `compactSession()` action. Set false by `auto_compaction_end` event (and finally-block fallback in `compactSession()`). Used by CompactButton and ChatView compaction indicator. | 2026-03-23 |
| 113 | `CompactButton` component in toolbar with `compactSession()` action | Disabled when not connected, no session, already compacting, or streaming. Shows "Compacting…" with spin animation when active. Only renders when session is active. Placed in toolbar between stats and session management controls. | 2026-03-23 |
| 114 | System messages use emoji prefixes and color-coded styling for compaction/retry | `⚙️` for compaction start, `✅` for compaction complete, `⚠️` for compaction aborted. `SystemMessage` component detects category from content and applies amber (compaction) or orange (retry) tint to dividers and text. | 2026-03-23 |
| 115 | ChatView has inline compaction indicator similar to streaming indicator | Amber pulsing dot + "Compacting context…" text shown when `isCompacting` is true. Appears below messages list, same position pattern as "Pi is thinking…" indicator. | 2026-03-23 |
| 116 | `ExtensionUiSlice` added to Zustand store for pending extension dialog state | `pendingExtensionUi: PiExtensionDialogRequest \| null`. Set by `extension_ui_request` events (dialog types only), cleared after response sent. Fire-and-forget types (notify, setStatus, etc.) logged to console, not stored. | 2026-03-23 |
| 117 | Extension dialog components in `components/extension/` directory | 4 dialog components: `SelectDialog` (list with arrow-key nav), `ConfirmDialog` (Yes/No buttons), `InputDialog` (single-line text with Enter submit), `EditorDialog` (textarea with Ctrl+Enter submit, prefill support). `ExtensionDialog` is the modal overlay container that dispatches by method. `useExtensionResponse` hook handles sending responses via `session.extensionUiResponse` WS method. | 2026-03-23 |
| 118 | Extension UI modal uses fixed overlay with backdrop blur at z-50 | `ExtensionDialog` renders `fixed inset-0 z-50` overlay with `bg-black/60 backdrop-blur-sm`. Centers dialog card. Shows "Extension Dialog" label with puzzle piece icon. All dialogs support Escape to cancel. | 2026-03-23 |
| 119 | `extension_error` events surfaced as error banner | `handlePiEvent` now logs extension errors to console and sets `lastError` on the store for the ErrorBanner to display. Previously was a no-op. | 2026-03-23 |
| 120 | `NotificationsSlice` added for toasts and persistent statuses | Toasts: auto-dismiss after 5s, support info/warning/error levels. Statuses: keyed by `statusKey`, removed when text is empty/undefined. Separate from `ExtensionUiSlice` (dialogs) — these are fire-and-forget. | 2026-03-23 |
| 121 | `ToastContainer` renders stacked toasts at fixed bottom-right (z-50) | Uses `flex-col-reverse` for newest-on-top stacking. Each toast has severity icon, message text, and dismiss button. Color-coded: blue (info), amber (warning), red (error). `pointer-events-none` on container, `pointer-events-auto` on individual toasts. | 2026-03-23 |
| 122 | `StatusBar` renders above Composer, hidden when no statuses active | Thin bar with puzzle-piece extension icon, pulsing blue dots per status entry, dot-separated. Uses `Map<string, string>` in store — extensions can set/remove by key. | 2026-03-23 |
| 123 | Extension `notify` → `addToast()`, `setStatus` → `setExtensionStatus()` in wireTransport | Fire-and-forget events now dispatch to store actions instead of just logging. `setWidget`, `setTitle`, `set_editor_text` still log-only (no UI for these). | 2026-03-23 |
| 124 | Composer steer/follow-up: Enter during streaming → steer, Ctrl+Enter → follow-up | During streaming, Composer shows textarea + steer button + abort button. Enter sends `session.steer` (redirect Pi immediately after current tool calls). Ctrl+Enter/Cmd+Enter sends `session.followUp` (queued for after agent finishes). Both show toast confirmation. Textarea border turns blue during streaming to indicate steer mode. Hint text below textarea shows available shortcuts. | 2026-03-23 |
| 125 | No optimistic user messages for steer/follow-up — relies on Pi event stream | Steer/follow-up messages will appear in the chat when Pi processes them and emits `message_start` (user) events. Toast confirms the action was sent. This avoids duplicate message logic. | 2026-03-23 |
| 126 | `WsSessionPromptParams.images` is `WsImageAttachment[]` with data + mimeType | Changed from `string[]` to carry proper MIME types. Server handler now passes mimeType through to Pi's `PiImageContent` instead of hardcoding `image/png`. | 2026-03-23 |
| 127 | Composer image paste: clipboard + drag-and-drop, preview strip, max 10 images | `handlePaste` extracts image files from `ClipboardEvent.clipboardData.items`. `handleDrop` handles drag-and-drop. Images stored as `ImageAttachment[]` state with base64 data + preview URL. Preview strip shows 64x64 thumbnails with hover-remove buttons. Images sent as `{ data, mimeType }` with prompt. | 2026-03-23 |
| 128 | `canSend` now checks `hasContent` (text OR images) instead of just text | Allows sending images with empty text (sends `" "` as message placeholder). Both text and images can be combined in one prompt. | 2026-03-23 |

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
- Zustand store at `apps/web/src/store/` ✅ — 3 slices (connection, session, messages), ChatMessage type, combined AppStore, reverse-scan find for streaming perf
- Event wiring at `apps/web/src/wireTransport.ts` ✅ — singleton WsTransport, pi.event dispatch to store, transport state sync to connection slice
- `initTransport()` called from `main.tsx` before React renders
- `getTransport()` provides singleton access for sending requests (e.g., from Composer)
- Pi RPC verified with Pi 0.61.1 — `get_available_models` and `get_state` work, commands use `{"type":"..."}` format
- AppShell layout at `apps/web/src/components/AppShell.tsx` ✅ — sidebar placeholder (hidden on mobile, 256px on md+), main chat column (ChatView + Composer)
- Composer at `apps/web/src/components/Composer.tsx` ✅ — multi-line textarea with auto-resize, Enter to send, Shift+Enter for newline, abort button during streaming, auto-starts session on first prompt
- ConnectionBanner at `apps/web/src/components/ConnectionBanner.tsx` ✅ — shows connecting/reconnecting/disconnected state
- ChatView at `apps/web/src/components/ChatView.tsx` ✅ (placeholder) — basic message rendering, empty state prompt, will be fully built in 1C.9
- `cn()` utility at `apps/web/src/lib/cn.ts` ✅ — simple className joiner, filters falsy values
- ChatView at `apps/web/src/components/ChatView.tsx` ✅ — scrollable message list with empty state, streaming indicator, message sub-components in `components/chat/`
- Message sub-components in `apps/web/src/components/chat/` ✅ — UserMessage (right-aligned bubble), AssistantMessage (streaming cursor + collapsible thinking), ToolCallMessage (collapsible args), ToolResultMessage (collapsible long output), SystemMessage (centered divider)
- Auto-scroll hook at `apps/web/src/hooks/useAutoScroll.ts` ✅ — passive scroll tracking, useLayoutEffect auto-scroll, floating "New messages" button
- ErrorBanner at `apps/web/src/components/ErrorBanner.tsx` ✅ — dismissible error display, auto-clear after 10s, wired to server.error and Composer errors
- `lastError`/`setLastError`/`clearLastError` added to ConnectionSlice ✅
- E2E test at `apps/server/src/e2e-test.ts` — 44 checks verifying full browser-to-Pi chain
- **Phase 1C COMPLETE** — all items done, exit criteria met
- Phase 1D in progress — thinking blocks (1D.1), tool call cards (1D.2), syntax highlighting (1D.3), markdown rendering (1D.4), tool-specific output rendering (1D.5), model selector (1D.6), thinking selector (1D.7), model/thinking wiring (1D.8), session management (1D.9) complete
- Session management: `NewSessionButton` in toolbar, `ForkDialog` with message picker, `sessionActions.ts` module for coordinated operations. `session.getForkMessages` WS method added end-to-end.
- Extension UI dialogs (1D.12) complete — SelectDialog, ConfirmDialog, InputDialog, EditorDialog, ExtensionDialog modal, useExtensionResponse hook, wireTransport wiring, ExtensionUiSlice in store
- Composer steer/follow-up support (1D.14) complete — Enter to steer, Ctrl+Enter for follow-up, toast feedback, streaming-mode UI with blue border + hint text
- Image paste in composer (1D.15) complete — clipboard paste, drag-and-drop, preview strip, base64 encoding, mimeType forwarding
- Next: 1D.16 — Keyboard shortcuts
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
