# CLAUDE.md

## ⚠️ Session Start — Read Before Anything Else

Before answering ANY question, read these files in order:
1. `.pi/AGENTS.md` — what you can do, how you think
2. `.pi/CAPABILITY-MAP.md` — honest inventory of capabilities and gaps
3. `.agents/SOUL.md` — who you are
4. `.agents/HUMAN.md` — who you're working with
5. `.agents/TENSIONS.md` — what's breaking (append during work)
6. `.agents/CONVENTIONS.md` — how we build (✅/❌ patterns)

For multi-session work, also read:
7. `.plan/PLAN.md` — where we are in the build
8. `.plan/MEMORY.md` — every decision and why
9. `.plan/DRIFT.md` — what changed from the original plan

Do not skip this. Do not summarize from memory. Actually read them.

## Project Identity

**PiBun** — A minimal desktop GUI for the [Pi coding agent](https://github.com/badlogic/pi-mono), built with [Electrobun](https://blackboard.sh/electrobun/docs/).

- **Runtime**: Bun (monorepo with workspaces)
- **Language**: TypeScript (strict)
- **Server**: Bun HTTP + WebSocket — thin bridge to Pi's RPC mode
- **Web**: React 19 + Vite + Zustand + Tailwind CSS v4
- **Desktop**: Electrobun (Bun-native webview, no Chromium)
- **Architecture**: Server spawns `pi --mode rpc` subprocess, bridges JSONL ↔ WebSocket, React renders streaming output

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

## Monorepo Structure

```
pibun/
├── CLAUDE.md                # ← You are here
├── .plan/                   # Build plan & session management
├── .pi/                     # Agent self-awareness (AGENTS.md, CAPABILITY-MAP.md)
├── .agents/                 # Agent identity (SOUL.md, HUMAN.md, TENSIONS.md, CONVENTIONS.md)
├── docs/                    # Reference documentation
│   ├── ARCHITECTURE.md      # System design and package roles
│   ├── PI_INTEGRATION.md    # Pi RPC protocol details
│   ├── WS_PROTOCOL.md      # Browser ↔ server message contract
│   ├── WEB_UI.md            # React app design and components
│   ├── DESKTOP.md           # Electrobun integration plan
│   └── ROADMAP.md           # High-level delivery phases
├── reference/               # Reference repos (read-only, not committed)
│   ├── t3code/              # T3 Code — WebSocket patterns, UI structure
│   └── electrobun/          # Electrobun — native app patterns
├── apps/
│   ├── server/              # Bun server — Pi RPC bridge + WebSocket
│   ├── web/                 # React/Vite chat UI
│   └── desktop/             # Electrobun native wrapper
└── packages/
    ├── contracts/           # Shared TypeScript types (no runtime logic)
    └── shared/              # Shared runtime utilities
```

## Key Docs

| Document | When to Read |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Before any structural decision |
| [docs/PI_INTEGRATION.md](docs/PI_INTEGRATION.md) | When working on server ↔ Pi communication |
| [docs/WS_PROTOCOL.md](docs/WS_PROTOCOL.md) | When working on browser ↔ server communication |
| [docs/WEB_UI.md](docs/WEB_UI.md) | When working on the React app |
| [docs/DESKTOP.md](docs/DESKTOP.md) | When working on Electrobun integration |

## Reference Repos

Three repos are cloned at `reference/` for reading patterns:

| Repo | What to Learn From It |
|------|----------------------|
| `reference/pi-mono/` | **Authoritative Pi source.** RPC protocol, event types, message structures, SDK API, RPC client implementation |
| `reference/t3code/` | WebSocket transport, Zustand store structure, chat rendering, tool output cards, sidebar, composer |
| `reference/electrobun/` | Electrobun config, main process setup, webview lifecycle, IPC patterns |

**Read these before building analogous features.** Don't copy code — understand the pattern, then build for pibun's simpler architecture.

**Pi RPC protocol:** The authoritative reference is `reference/pi-mono/packages/coding-agent/docs/rpc.md`. When `docs/PI_INTEGRATION.md` and pi-mono disagree, pi-mono wins.

## Commands

```bash
# When monorepo is set up:
bun install                  # install all workspace deps
bun run build                # build all packages
bun run dev                  # dev server + web (future)
bun run dev:server           # server only
bun run dev:web              # Vite dev server only
bun run typecheck            # tsc --noEmit across all packages
bun run lint                 # biome check
bun run format               # biome format

# Testing Pi RPC manually:
pi --mode rpc --provider anthropic --model sonnet --thinking medium
# Then type JSON commands to stdin, read JSONL from stdout

# Multi-session work:
# Uses .plan/ convention with skills: phased-plan, execute-phase, autopilot-execute
```

## Multi-Session Work

Uses `.plan/` protocol. Three modes:

| Mode | When |
|------|------|
| `phased-plan` skill | Turn a spec into a phased build plan |
| `execute-phase` skill | Human-attended: read plan → confirm → execute → update plan |
| `autopilot-execute` skill | Unattended: read plan → execute → verify → update plan → exit |

**Session protocol**: Start → read PLAN.md + MEMORY.md + DRIFT.md. End → update all plan files + SESSION-LOG.md.
