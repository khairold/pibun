# Roadmap

## Philosophy

Ship incrementally. Each phase produces a usable artifact. Don't build the desktop wrapper until the web app works in a browser.

---

## Phase 0 — Scaffold ✍️ (current)

**Goal:** Documentation and project setup.

- [x] Pick a name
- [x] Document architecture
- [x] Document Pi RPC integration
- [x] Document WebSocket protocol
- [x] Document web UI design
- [x] Document desktop plan
- [x] Document roadmap
- [ ] Initialize Bun monorepo with Turbo
- [ ] Set up TypeScript configs
- [ ] Set up linting (Biome or oxlint)
- [ ] Set up formatting
- [ ] Create package scaffolds (empty src/ dirs with package.json)
- [ ] Verify `pi --mode rpc` works locally (manual test)

**Deliverable:** Empty monorepo that builds and lints.

---

## Phase 1A — Server + Pi RPC Bridge

**Goal:** The server can spawn Pi, send prompts, and receive streaming events.

- [ ] Implement `PiRpcManager` — spawn, send, receive, stop
- [ ] JSONL parser with strict LF splitting
- [ ] Unit tests for JSONL parsing edge cases
- [ ] Manual test: spawn Pi, send a prompt, log events to console
- [ ] Handle Pi process crash/exit gracefully

**Deliverable:** A script that talks to Pi via RPC and prints streaming output.

---

## Phase 1B — WebSocket Server

**Goal:** Browser can connect and interact with Pi through the server.

- [ ] HTTP server (serves static files in prod, redirects to Vite in dev)
- [ ] WebSocket upgrade handling
- [ ] Request routing (method dispatch)
- [ ] `session.start` → spawns Pi RPC
- [ ] `session.prompt` → forwards to Pi
- [ ] `session.abort` → forwards abort
- [ ] Pi events → WebSocket push on `pi.event` channel
- [ ] Pi responses → WebSocket push on `pi.response` channel
- [ ] Connection auth (optional token)
- [ ] Welcome message on connect

**Deliverable:** A WebSocket server you can test with `wscat` or a simple HTML page.

---

## Phase 1C — Web UI (Minimal)

**Goal:** Usable chat interface in the browser.

- [ ] Vite + React + Tailwind setup
- [ ] `WsTransport` class (connect, request, subscribe, reconnect)
- [ ] Zustand store with session + messages state
- [ ] Composer — text input, send on Enter, abort button
- [ ] Chat view — render user messages and assistant text
- [ ] Streaming text — append `text_delta` events in real-time
- [ ] Auto-scroll with "new messages" button
- [ ] Basic tool output rendering (bash output, file reads)
- [ ] Loading/connecting state indicators

**Deliverable:** Working chat with Pi in the browser.

---

## Phase 1D — Web UI (Full)

**Goal:** Feature-complete web experience.

- [ ] Thinking blocks (collapsible, streaming)
- [ ] Tool call cards (name, args, expandable output)
- [ ] Syntax highlighting for code blocks (Shiki)
- [ ] Markdown rendering for assistant output
- [ ] Model selector (list from `get_available_models`)
- [ ] Thinking level selector
- [ ] Session management (new, switch, fork)
- [ ] Session stats display (tokens, cost)
- [ ] Compaction control (manual trigger, auto-compaction indicator)
- [ ] Extension UI dialogs (select, confirm, input)
- [ ] Extension notifications and status
- [ ] Message steering and follow-up support
- [ ] Image paste in composer
- [ ] Keyboard shortcuts
- [ ] Sidebar with session list
- [ ] Error handling and retry indicators
- [ ] Responsive layout

**Deliverable:** Complete web app, ready for desktop wrapping.

---

## Phase 2A — Electrobun Scaffold

**Goal:** Desktop app opens and loads the web app.

- [ ] Electrobun project setup
- [ ] Main process starts PiBun server
- [ ] Native webview loads localhost URL
- [ ] Window lifecycle (open, close, remember size/position)
- [ ] Dev mode with Vite hot reload

**Deliverable:** Desktop app that works, even if it's just a webview wrapper.

---

## Phase 2B — Native Integration

**Goal:** Desktop app feels native.

- [ ] Native menu bar (File, Edit, View, Session menus)
- [ ] Menu actions → WebSocket commands
- [ ] Native file dialogs for project folder selection
- [ ] System notifications for long-running operations
- [ ] Keyboard shortcuts mapped to native accelerators
- [ ] App icon and branding

**Deliverable:** Desktop app that feels like a real app, not a wrapped webpage.

---

## Phase 2C — Distribution

**Goal:** Users can install PiBun.

- [ ] macOS: .dmg build with code signing
- [ ] Linux: AppImage build
- [ ] Windows: NSIS installer
- [ ] Auto-update mechanism
- [ ] GitHub Releases pipeline
- [ ] Smoke tests for each platform

**Deliverable:** Downloadable installers on GitHub Releases.

---

## Future (Unscheduled)

These are ideas, not commitments:

- [ ] Multi-session — multiple Pi processes, tabbed interface
- [ ] Project management — sidebar with multiple project directories
- [ ] Git integration — branch status, diff view
- [ ] Terminal integration — embedded terminal pane
- [ ] Pi extension marketplace — browse and install extensions from the UI
- [ ] Session export — HTML export of conversations
- [ ] Collaborative sessions — multiple users watching the same Pi session
- [ ] Custom themes — light/dark mode, custom colors
- [ ] Plugin system — extend PiBun's UI with custom panels
