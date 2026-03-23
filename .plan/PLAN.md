# PiBun — Build Plan

> **Spec:** `docs/` directory (ARCHITECTURE.md, PI_INTEGRATION.md, WS_PROTOCOL.md, WEB_UI.md, DESKTOP.md)
> **Status:** Phase 0 COMPLETE — all scaffolds exist, monorepo verified, Pi RPC verified
> **Current Phase:** 1A
> **Last Session:** 3 (2026-03-23)

---

## Session Protocol

### At the START of every session:
1. Read `.plan/PLAN.md` (this file) — know where we are
2. Read `.plan/MEMORY.md` — absorb shared context and decisions
3. Read `.plan/DRIFT.md` — check for spec changes
4. Read `.agents/CONVENTIONS.md` — build patterns
5. Identify the next uncompleted phase/item
6. State what you will do this session before starting

### At the END of every session:
1. Update item checkboxes in this file
2. Update `MEMORY.md` with anything the next session needs to know
3. Update `DRIFT.md` if any spec changes occurred
4. Log the session in `SESSION-LOG.md`
5. Write a **Handoff** note at the bottom of the session log entry
6. Run the build gate command (when applicable)

---

## Phase 0 — Scaffold & Project Setup

**Goal:** Monorepo builds, lints, and all package scaffolds exist. Pi RPC verified locally.

- [x] 0.1 — Document architecture (ARCHITECTURE.md)
- [x] 0.2 — Document Pi RPC integration (PI_INTEGRATION.md)
- [x] 0.3 — Document WebSocket protocol (WS_PROTOCOL.md)
- [x] 0.4 — Document web UI design (WEB_UI.md)
- [x] 0.5 — Document desktop plan (DESKTOP.md)
- [x] 0.6 — Document roadmap (ROADMAP.md)
- [x] 0.7 — Set up agent system (.plan/, .pi/, .agents/, CLAUDE.md)
- [x] 0.8 — Initialize Bun workspace root (package.json with workspaces, bun install)
- [x] 0.9 — Set up Turbo for build orchestration (turbo.json with build/dev/typecheck/lint pipelines)
- [x] 0.10 — Set up base TypeScript config (tsconfig.base.json — strict, Bun types, path aliases)
- [x] 0.11 — Set up Biome for lint + format (biome.json)
- [x] 0.12 — Create `packages/contracts/` scaffold (package.json, tsconfig.json, empty src/index.ts)
- [x] 0.13 — Create `packages/shared/` scaffold (package.json, tsconfig.json, empty src/)
- [x] 0.14 — Create `apps/server/` scaffold (package.json, tsconfig.json, empty src/index.ts)
- [x] 0.15 — Create `apps/web/` scaffold (package.json, tsconfig.json, Vite config, empty src/)
- [x] 0.16 — Create `apps/desktop/` scaffold (package.json, tsconfig.json, empty src/)
- [x] 0.17 — Verify monorepo: `bun install` succeeds, `bun run typecheck` passes, `bun run lint` passes
- [x] 0.18 — Verify `pi --mode rpc` works locally (manual test, document any setup notes in MEMORY.md)

**Exit criteria:** All packages exist. `bun install && bun run typecheck && bun run lint` passes. Pi RPC verified.

---

## Phase 1A — Server: Pi RPC Bridge

**Goal:** The server can spawn Pi, send prompts, and receive streaming JSONL events.

- [x] 1A.1 — Define Pi RPC event types in `packages/contracts/` (agent_start/end, turn_start/end, message_start/update/end, tool_execution_start/update/end, auto_compaction, auto_retry, extension_ui_request)
- [x] 1A.2 — Define Pi RPC command types in `packages/contracts/` (prompt, steer, follow_up, abort, set_model, set_thinking_level, get_state, get_messages, compact, new_session, switch_session, fork, get_available_models, extension_ui_response)
- [x] 1A.3 — Define Pi RPC response type in `packages/contracts/` (type, command, success, error, id, data)
- [ ] 1A.4 — Implement JSONL parser in `packages/shared/` (strict LF splitting, no readline, buffer accumulation)
- [ ] 1A.5 — Write unit tests for JSONL parser (partial lines, embedded newlines in JSON strings, Unicode line separators in payloads, empty lines, rapid multi-line)
- [ ] 1A.6 — Implement `PiProcess` class in `apps/server/` (spawn with flags, stdin write, stdout read via JSONL parser, stderr capture, process lifecycle)
- [ ] 1A.7 — Implement `PiRpcManager` in `apps/server/` (create session → spawn PiProcess, get session, stop session → kill process, stop all)
- [ ] 1A.8 — Handle Pi process crash/exit (emit error event, clean up session, log stderr)
- [ ] 1A.9 — Write unit tests for PiRpcManager (mock subprocess, verify event routing)
- [ ] 1A.10 — Manual integration test: spawn Pi, send prompt, log streaming events to console

**Exit criteria:** A test script spawns Pi via RPC, sends "hello", and logs all streaming events. Process cleanup works on crash/exit.

---

## Phase 1B — Server: WebSocket Bridge

**Goal:** Browser can connect via WebSocket and interact with Pi through the server.

- [ ] 1B.1 — Define WebSocket protocol types in `packages/contracts/` (WsRequest, WsResponse, WsPush, method strings, push channels)
- [ ] 1B.2 — Set up Bun HTTP server with health endpoint (`/health`)
- [ ] 1B.3 — Static file serving (serve `apps/web/dist/` in production)
- [ ] 1B.4 — WebSocket upgrade handling with connection tracking
- [ ] 1B.5 — Implement request/response dispatch (method string → handler function)
- [ ] 1B.6 — Implement `session.start` → spawn Pi RPC via PiRpcManager
- [ ] 1B.7 — Implement `session.prompt` → forward to Pi process stdin
- [ ] 1B.8 — Implement `session.abort` → forward abort to Pi
- [ ] 1B.9 — Implement `session.stop` → stop Pi process
- [ ] 1B.10 — Pi event forwarding: subscribe to PiProcess events → push to all connected WebSocket clients on `pi.event` channel
- [ ] 1B.11 — Pi response forwarding: push on `pi.response` channel
- [ ] 1B.12 — `server.welcome` push on WebSocket connect (cwd, version)
- [ ] 1B.13 — Write unit tests for WebSocket message routing
- [ ] 1B.14 — Test with wscat: connect → start session → send prompt → receive streaming events → abort → stop

**Exit criteria:** Full round-trip works via wscat. Events stream in real-time. Session start/stop/abort all function.

---

## Phase 1C — Web UI: Minimal Chat

**Goal:** Usable chat interface in the browser. Type a prompt, see streaming response.

- [ ] 1C.1 — Vite + React 19 + Tailwind v4 setup in `apps/web/`
- [ ] 1C.2 — Implement `WsTransport` class (connect, disconnect, request with correlation, subscribe to push channels, reconnect with backoff)
- [ ] 1C.3 — Create Zustand store: `connection` slice (status, reconnectAttempt)
- [ ] 1C.4 — Create Zustand store: `session` slice (isStreaming, model, thinkingLevel)
- [ ] 1C.5 — Create Zustand store: `messages` slice (ChatMessage array, append, update streaming message)
- [ ] 1C.6 — Wire WsTransport → Zustand (pi.event push → state updates, see event→state mapping in WEB_UI.md)
- [ ] 1C.7 — Build AppShell layout (sidebar placeholder left, main chat area right, composer bottom)
- [ ] 1C.8 — Build Composer (multi-line input, Enter to send, Shift+Enter for newline, abort button during streaming)
- [ ] 1C.9 — Build ChatView — render user messages and assistant text blocks
- [ ] 1C.10 — Wire text_delta streaming (append to current message content in real-time)
- [ ] 1C.11 — Auto-scroll to bottom on new content, "↓ New messages" button when scrolled up
- [ ] 1C.12 — Basic tool output rendering (show tool name + raw text output, collapsible)
- [ ] 1C.13 — Loading/connecting/error state indicators
- [ ] 1C.14 — Wire Vite dev proxy to server (or configure CORS)
- [ ] 1C.15 — End-to-end test: open browser → type prompt → see streaming response with tool calls

**Exit criteria:** Working chat with Pi in the browser. Streaming text renders smoothly. Tool calls visible. Session starts automatically on page load.

---

## Phase 1D — Web UI: Full Features

**Goal:** Feature-complete web experience with all Pi capabilities exposed.

- [ ] 1D.1 — Thinking blocks (collapsible section, streaming via thinking_delta)
- [ ] 1D.2 — Tool call cards (tool name + args header, expandable output body)
- [ ] 1D.3 — Syntax highlighting for code blocks (Shiki, lazy-loaded per language)
- [ ] 1D.4 — Markdown rendering for assistant text (react-markdown or similar)
- [ ] 1D.5 — Tool-specific output rendering: `bash` as terminal, `read` as highlighted code with path, `edit` as diff view, `write` as file preview
- [ ] 1D.6 — Model selector UI (list from `get_available_models`, grouped by provider)
- [ ] 1D.7 — Thinking level selector (off → xhigh)
- [ ] 1D.8 — Wire model/thinking commands (session.setModel, session.setThinking)
- [ ] 1D.9 — Session management: new session, switch session, fork from message
- [ ] 1D.10 — Session stats display (tokens, cost from get_session_stats)
- [ ] 1D.11 — Compaction controls (manual compact button, auto-compaction start/end indicators)
- [ ] 1D.12 — Extension UI dialogs (select list, confirm yes/no, text input, multi-line editor)
- [ ] 1D.13 — Extension notifications (toast) and status (persistent indicator)
- [ ] 1D.14 — Message steering (Enter during streaming → steer) and follow-up support
- [ ] 1D.15 — Image paste in composer (Ctrl+V, convert to base64, attach to prompt)
- [ ] 1D.16 — Keyboard shortcuts (Ctrl+C abort, Ctrl+L model selector, Ctrl+N new session)
- [ ] 1D.17 — Sidebar: session list with switch, current session info, new session button
- [ ] 1D.18 — Error handling: retry indicators (auto_retry events), error banners
- [ ] 1D.19 — Message virtualization for long conversations (only render visible messages)
- [ ] 1D.20 — Responsive layout (collapsible sidebar on narrow viewports)

**Exit criteria:** All Pi features accessible through the UI. Extension dialogs work. Keyboard shortcuts function. Performance acceptable for 100+ message conversations.

---

## Phase 2A — Desktop: Electrobun Scaffold

**Goal:** Desktop app opens and loads the web app in a native webview.

- [ ] 2A.1 — Electrobun project setup (`electrobun.config.ts`, source structure)
- [ ] 2A.2 — Main process: find available port, start PiBun server
- [ ] 2A.3 — Wait for server health check, then open native webview at localhost URL
- [ ] 2A.4 — Window lifecycle (open, close, remember size/position via localStorage or config)
- [ ] 2A.5 — Shutdown: close webview → stop server → stop all Pi processes → exit
- [ ] 2A.6 — Dev mode: point webview at Vite dev server URL for hot reload

**Exit criteria:** `bun run dev:desktop` opens a native window with the working web app inside.

---

## Phase 2B — Desktop: Native Integration

**Goal:** Desktop app feels native with menus, shortcuts, and OS integration.

- [ ] 2B.1 — Native menu bar (PiBun, File, Edit, View, Session menus per DESKTOP.md spec)
- [ ] 2B.2 — Menu actions → WebSocket commands (New Session, Abort, Compact, Switch Model)
- [ ] 2B.3 — IPC: forward native menu events to React app
- [ ] 2B.4 — File dialogs for project/folder selection
- [ ] 2B.5 — System notifications for long-running operations
- [ ] 2B.6 — Keyboard shortcuts mapped to native accelerators
- [ ] 2B.7 — App icon and branding

**Exit criteria:** Menus work. Keyboard shortcuts trigger correct actions. Feels like a native app.

---

## Phase 2C — Desktop: Distribution

**Goal:** Users can download and install PiBun.

- [ ] 2C.1 — macOS .dmg build
- [ ] 2C.2 — Code signing + notarization (macOS)
- [ ] 2C.3 — Linux AppImage build
- [ ] 2C.4 — Windows NSIS installer
- [ ] 2C.5 — Auto-update mechanism
- [ ] 2C.6 — GitHub Releases CI pipeline
- [ ] 2C.7 — Smoke tests for each platform

**Exit criteria:** Downloadable installers on GitHub Releases. Auto-update works.

---

## Parking Lot

Ideas discussed but not scheduled:

- [ ] Multi-session — multiple Pi processes, tabbed interface
- [ ] Project management — sidebar with multiple project directories
- [ ] Git integration — branch status, diff view
- [ ] Terminal integration — embedded terminal pane
- [ ] Pi extension marketplace — browse and install from UI
- [ ] Session export — HTML export of conversations
- [ ] Collaborative sessions — multiple users watching same Pi session
- [ ] Custom themes — beyond light/dark
- [ ] Plugin system — extend PiBun's UI with custom panels
