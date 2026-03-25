# CLAUDE.md

## Project Identity

**PiBun** — A desktop GUI for the [Pi coding agent](https://github.com/badlogic/pi-mono), built with [Electrobun](https://blackboard.sh/electrobun/docs/).

- **Runtime**: Bun (monorepo with workspaces)
- **Language**: TypeScript (strict)
- **Server**: Bun HTTP + WebSocket — thin bridge to Pi's RPC mode
- **Web**: React 19 + Vite + Zustand + Tailwind CSS v4
- **Desktop**: Electrobun (Bun-native webview, no Chromium)
- **No Effect, no Schema** — plain TypeScript + Zustand everywhere

## Architecture

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

**Core principle: Pi handles state. The server is a thin bridge. Don't reimplement what Pi already does.**

Pi manages: session persistence, model registry, API keys, auto-compaction, auto-retry, tool execution, extensions, skills, prompt templates. The server spawns `pi --mode rpc` subprocesses, pipes JSONL events to WebSocket clients, and translates WebSocket requests into Pi RPC commands. That's it.

## Agent-First Architecture

**The system that builds the thing should shape the thing.**

This codebase is maintained by AI coding agents, not humans with IDEs. Every structural decision optimizes for how agents work: tool calls to read files, exact-text edits to change them, and context windows to reason about them.

### Deep Modules Over Small Files

Humans navigate with Cmd+P and jump-to-definition — file granularity is free. Agents navigate with tool calls — every file read costs time, every cross-file edit is a failure point. So we use **deep modules**: fewer files, richer interfaces, self-contained units.

**Rules:**
- Merge files that always change together (e.g., 5 related store slices → 1 slice per domain)
- Merge files that are always read together (e.g., Pi types + events + commands → one `piProtocol.ts`)
- Merge files that add no abstraction (a 20-line slice with 3 setters is organizational, not architectural)
- Leave files that are already deep (570-line subprocess manager = don't touch)
- Don't create one-file-per-function modules
- Don't split a domain across files unless a file exceeds ~600 lines with distinct concerns

**Metrics that matter:**
- **Tool call count** — how many reads to understand one feature? (target: 3-4, not 7-8)
- **Co-change set size** — how many files must be edited for one new feature? (target: 3-4)
- **Self-containment** — can an agent read one file and fully understand that domain?

### Context Documents

Only 3 mandatory files at session start — not 7, not 12:
- **CLAUDE.md** (this file) — everything an agent needs to orient
- **CONVENTIONS.md** — build rules not expressed in code
- **TENSIONS.md** — living friction log

All decisions, gotchas, reference guides, personality, and human context live HERE, in one file. No cross-referencing web of agent identity files. One read, full context.

### Documentation Lives in Code

Protocol specs live as TSDoc in the type files, not in separate markdown docs. When `wsProtocol.ts` has comprehensive TSDoc, a separate `WS_PROTOCOL.md` becomes stale. The types ARE the spec.

Docs that remain are for things code can't express: high-level architecture (`ARCHITECTURE.md`), operational procedures (`CODE_SIGNING.md`), desktop integration details (`DESKTOP.md`).

## Monorepo Structure

```
pibun/
├── CLAUDE.md                # ← You are here
├── .agents/                 # CONVENTIONS.md, TENSIONS.md
├── .plan/                   # PLAN.md, MEMORY.md, DRIFT.md, SESSION-LOG.md
├── docs/                    # ARCHITECTURE.md, DESKTOP.md, CODE_SIGNING.md, ROADMAP.md
├── reference/               # Read-only reference repos (not committed)
│   ├── pi-mono/             # Authoritative Pi source
│   ├── t3code/              # WebSocket patterns, UI structure
│   └── electrobun/          # Native app patterns
├── apps/
│   ├── server/              # Bun server — Pi RPC bridge + WebSocket
│   ├── web/                 # React/Vite chat UI
│   └── desktop/             # Electrobun native wrapper
└── packages/
    ├── contracts/           # Shared TypeScript types (no runtime logic)
    └── shared/              # Shared runtime utilities
```

## Commands

```bash
bun install                  # install all workspace deps
bun run build                # build all packages
bun run dev:server           # server only (port 24242)
bun run dev:web              # Vite dev server only (port 24269)
bun run dev:desktop          # Electrobun dev mode
bun run build:desktop        # production desktop build (unsigned)
bun run build:desktop:signed # signed + notarized macOS build
bun run typecheck            # tsc --noEmit across all packages
bun run lint                 # biome check
bun run format               # biome format (tabs, double quotes, semicolons)

# Smoke tests:
bun run test:smoke           # server smoke test
bun run test:smoke:artifacts # desktop build artifact validation
bun run test:smoke:multi-session
bun run test:smoke:git
bun run test:smoke:projects
bun run test:smoke:terminal
bun run test:smoke:export
bun run test:smoke:themes
bun run test:smoke:plugins

# Desktop dev mode (3 terminals):
# 1. bun run dev:server
# 2. bun run dev:web
# 3. cd apps/desktop && PIBUN_DEV=1 npx electrobun dev
```

## Technical Context

| Item | Value |
|------|-------|
| Bun | 1.2.21 |
| TypeScript | 5.9.3 |
| Turbo | 2.8.20 |
| Biome | 1.9.4 |
| React | 19 |
| Zustand | 5.0.12 |
| Pi version tested | 0.61.1 |
| Electrobun | 1.16.0 |
| Default ports | 24242 (server), 24269 (Vite dev) |
| Workspace packages | @pibun/contracts, @pibun/shared, @pibun/server, @pibun/web, @pibun/desktop |

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | RPC mode (subprocess), not SDK (in-process) | Process isolation — Pi crash ≠ server crash. Clean boundary. |
| 2 | Build fresh, don't fork T3 Code | ~60% of T3 Code is Codex-specific. Pi handles its own state. |
| 3 | Desktop embeds server in-process | `createServer` and `PiRpcManager` imported directly. Same Bun event loop. |
| 4 | Menu actions forwarded via WebSocket push | Keeps web app framework-agnostic. No Electrobun view-side dependency. |
| 5 | Multiple concurrent sessions, `sessionId` on `WsRequest` for routing | One Pi process per tab — background sessions keep running. `sessionId` on WsRequest routes to the correct process. Tabs reuse their process on switch-back (no restart). Empty/closed tabs stop their process. |
| 6 | Two session ID domains: PiBun manager ID vs Pi UUID | `sessionId` = PiBun manager ID (`session_{N}_{timestamp}`, routing). `piSessionId` = Pi UUID (session list matching). NEVER conflate. |
| 7 | `packages/contracts` is types-only, zero runtime | No functions, no classes. Importable without side effects. |
| 8 | `packages/shared` uses explicit subpath exports | `@pibun/shared/jsonl` not `@pibun/shared`. Prevents unintended coupling. |
| 9 | Terminals scoped to project, not session | Terminals are workspaces (dev servers, file browsing). Keyed by project path. Switching sessions within same project keeps terminals. Switching projects swaps terminal set (kept alive in background). |
| 10 | Tabbed main content area | Tab bar: [Chat] + [Terminal 1..N]. Chat = active session. Terminals = project-scoped, full-height, renameable. `activeContentTab` + `projectContentTabs` state. |
| 11 | Content area uses `hidden` for tab switching | Absolute-positioned layers with `display:none` toggling. Preserves xterm.js instances and screen buffers across tab switches. |
| 12 | `Session` type (renamed from `SessionTab`) | Client-side session container in `@pibun/contracts`. Holds `sessionId`, `piSessionId`, `cwd`, `model`, `sessionFile`, etc. |

## Gotchas

- **JSONL parsing**: Use `JsonlParser` from `@pibun/shared/jsonl`. Never use Node's `readline` — it splits on U+2028/U+2029 which appear inside JSON strings.
- **`tool_execution_update.partialResult`** is ACCUMULATED (replace display), not delta (don't append).
- **`text_delta` and `thinking_delta`** ARE deltas — append to current content.
- **`exactOptionalPropertyTypes`**: Can't pass `undefined` to optional fields. Use conditional spread: `...(value && { key: value })`.
- **Desktop tsconfig** disables `exactOptionalPropertyTypes` because Electrobun distributes raw `.ts` files with type conflicts.
- **Biome format after every file write** — the `write` tool outputs spaces; Biome expects tabs.
- **`bun pm trust @biomejs/biome` and `esbuild`** needed after first install.
- **`bun-pty` native library** must be copied into Electrobun app bundle via `electrobun.config.ts`.
- **Zustand selectors**: Never return new arrays/objects — causes infinite re-renders. Use `useMemo` or `useShallow`.
- **PiRpcManager**: Removes session from map BEFORE calling `process.stop()` to prevent re-entrant cleanup races.
- **Session ID domains**: `sessionId` (PiBun manager ID) and `piSessionId` (Pi UUID) are NEVER the same value. `store.sessionId` and `tab.sessionId` must always hold the PiBun manager ID.
- **Terminal project matching**: `getActiveTab()?.cwd ?? ""` is canonical. In React selectors, use `s.tabs.find(t => t.id === s.activeTabId)?.cwd ?? ""` — don't call store methods inside selectors.
- **`removeTab` doesn't delete project terminals**: Terminals survive session tab removal. `cleanupEmptyTab` doesn't call `terminal.close`. Terminals belong to the project, not the session.

## Reference Repos

Read these before building analogous features. Don't copy code — understand the pattern, then build for PiBun's simpler architecture.

### Pi Mono (`reference/pi-mono/`) — Authoritative Pi source

| Task | Read |
|------|------|
| RPC protocol (authoritative) | `packages/coding-agent/docs/rpc.md` |
| RPC types (source of truth) | `packages/coding-agent/src/modes/rpc/rpc-types.ts` |
| RPC client implementation | `packages/coding-agent/src/modes/rpc/rpc-client.ts` |
| Agent session API (SDK) | `packages/coding-agent/src/core/agent-session.ts` |
| Agent events/types | `packages/agent/src/types.ts` |
| LLM types (Model, messages) | `packages/ai/src/types.ts` |
| Extensions API | `packages/coding-agent/docs/extensions.md` |
| SDK usage | `packages/coding-agent/docs/sdk.md` |
| All docs | `packages/coding-agent/docs/` |

**When in doubt about Pi RPC behavior, pi-mono source wins.**

**⚠️ Do NOT use `packages/web-ui/`** — Pi's own web UI (mini-lit) is NOT a reference for PiBun. We build our own React UI.

### T3 Code (`reference/t3code/`) — WebSocket & UI patterns

| Task | Read |
|------|------|
| WebSocket transport | `apps/web/src/wsTransport.ts` |
| Zustand store | `apps/web/src/store.ts` |
| Chat rendering | `apps/web/src/components/ChatView.tsx`, `chat/MessagesTimeline.tsx` |
| Composer input | `apps/web/src/components/ComposerPromptEditor.tsx` |
| Sidebar | `apps/web/src/components/Sidebar.tsx` |
| WS protocol types | `packages/contracts/src/ws.ts` |

**Warning:** T3 Code uses Effect + Schema. Adapt patterns to plain TypeScript.

### Electrobun (`reference/electrobun/`) — Native app patterns

| Task | Read |
|------|------|
| Minimal app | `templates/hello-world/` |
| React + Vite + Tailwind | `templates/react-tailwind-vite/` |
| Window API | `package/src/bun/core/BrowserWindow.ts` |
| Menu API | `package/src/bun/core/ApplicationMenu.ts` |
| Config format | `templates/*/electrobun.config.ts` |

## Docs

| Document | When to Read |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the codebase works — package roles, design decisions |
| [docs/DESKTOP.md](docs/DESKTOP.md) | Electrobun integration, distribution, native features |
| [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) | macOS code signing & notarization setup |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Delivery history and parking lot |

## Playbooks

### Adding a New WebSocket Method

1. Define method type in `packages/contracts/` — add to WsRequest method union, define params/result
2. Add handler in `apps/server/src/handlers/` — method string → handler function
3. Wire to Pi if applicable — translate WS request to Pi RPC command
4. Add client helper in `apps/web/` — typed function using WsTransport
5. Wire to UI — Zustand action or React hook that calls the helper

### Handling a New Pi RPC Event

1. Define event type in `packages/contracts/` — add to Pi event discriminated union
2. Verify PiProcess forwards it (usually automatic — all JSONL events forward)
3. Verify server pushes to `pi.event` channel (usually automatic)
4. Map to Zustand state in the store's event handler
5. Render in UI — add/update React component

### Adding a UI Component

1. Check `reference/t3code/` for analogous patterns
2. Props-driven, no data fetching inside, Tailwind for styling
3. Create in `apps/web/src/components/`
4. Wire to Zustand — read from store, dispatch actions
5. Verify: `bun run typecheck`

## Agent Working Style

**Be direct.** No filler. Just do the work.
**Have opinions.** If something looks wrong, say so. Propose alternatives.
**Be resourceful.** Read docs, reference repos, MEMORY.md before asking.
**Ship increments.** Smallest working version, verify, then extend.
**Follow the plan.** Read `.plan/PLAN.md` at session start. Don't jump ahead.
**Log decisions.** Anything future sessions need → MEMORY.md.
**Log friction.** Anything that feels off → TENSIONS.md.

### Human Context

Working with **Khairold** (Kuala Lumpur, GMT+8). Values directness, systems thinking, opinionated agents. Prefers investing in infrastructure that compounds over one-off implementations. When he says "what do you think?" — give a real opinion.

Anti-patterns: over-engineering before complexity exists, copying T3 Code wholesale, vague status updates, asking permission for obviously correct actions.

## Multi-Session Work

Uses `.plan/` protocol with skills for phased planning and execution.

| Skill | When |
|-------|------|
| `phased-plan` | Turn a spec into a phased build plan |
| `execute-phase` | Human-attended: read plan → confirm → execute → update plan |
| `autopilot-execute` | Unattended: read plan → execute → verify → update plan → exit |
