# CLAUDE.md

## Project Identity

**PiBun** — A desktop GUI for the [Pi coding agent](https://github.com/badlogic/pi-mono), built with [Electrobun](https://blackboard.sh/electrobun/docs/).

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
├── .pi/                     # Agent self-awareness (AGENTS.md, CAPABILITY-MAP.md)
├── .agents/                 # Agent identity (SOUL.md, HUMAN.md, TENSIONS.md, CONVENTIONS.md)
├── docs/                    # Reference documentation
│   ├── ARCHITECTURE.md      # System design and package roles
│   ├── DECISIONS.md         # Key decisions, gotchas, and technical context
│   ├── PI_INTEGRATION.md    # Pi RPC protocol details
│   ├── WS_PROTOCOL.md      # Browser ↔ server message contract
│   ├── WEB_UI.md            # React app design and components
│   ├── DESKTOP.md           # Electrobun integration plan
│   ├── CODE_SIGNING.md      # macOS code signing & notarization setup
│   └── ROADMAP.md           # Delivery history and parking lot
├── reference/               # Reference repos (read-only, not committed)
│   ├── pi-mono/             # Pi source — authoritative RPC protocol reference
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
| [docs/DECISIONS.md](docs/DECISIONS.md) | Before making changes — gotchas, conventions, technical context |
| [docs/PI_INTEGRATION.md](docs/PI_INTEGRATION.md) | When working on server ↔ Pi communication |
| [docs/WS_PROTOCOL.md](docs/WS_PROTOCOL.md) | When working on browser ↔ server communication |
| [docs/WEB_UI.md](docs/WEB_UI.md) | When working on the React app |
| [docs/DESKTOP.md](docs/DESKTOP.md) | When working on Electrobun integration |
| [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) | When working on macOS code signing & notarization |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What's been built and what's in the parking lot |

## Reference Repos

| Repo | What to Learn From It |
|------|----------------------|
| `reference/pi-mono/` | **Authoritative Pi source.** RPC protocol, event types, message structures, SDK API, RPC client implementation |
| `reference/t3code/` | WebSocket transport, Zustand store structure, chat rendering, tool output cards, sidebar, composer |
| `reference/electrobun/` | Electrobun config, main process setup, webview lifecycle, IPC patterns |

**Read these before building analogous features.** Don't copy code — understand the pattern, then build for pibun's simpler architecture.

**Pi RPC protocol:** The authoritative reference is `reference/pi-mono/packages/coding-agent/docs/rpc.md`. When `docs/PI_INTEGRATION.md` and pi-mono disagree, pi-mono wins.

## Commands

```bash
bun install                  # install all workspace deps
bun run build                # build all packages
bun run dev:server           # server only (port 24242)
bun run dev:web              # Vite dev server only (port 5173)
bun run dev:desktop          # Electrobun dev mode (needs server + web running separately)
bun run build:desktop        # production desktop build (unsigned)
bun run build:desktop:signed # signed + notarized macOS build
bun run typecheck            # tsc --noEmit across all packages
bun run lint                 # biome check
bun run format               # biome format

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

# Desktop dev mode:
# 1. bun run dev:server
# 2. bun run dev:web
# 3. cd apps/desktop && PIBUN_DEV=1 npx electrobun dev
```

## Multi-Session Work

Uses `.plan/` protocol with skills for phased planning and execution.

| Skill | When |
|-------|------|
| `phased-plan` | Turn a spec into a phased build plan |
| `execute-phase` | Human-attended: read plan → confirm → execute → update plan |
| `autopilot-execute` | Unattended: read plan → execute → verify → update plan → exit |
