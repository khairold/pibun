# Capability Map

A quick-reference for what I can and cannot do — and how to bridge gaps.

## ✅ Can Do Now
- Read, write, edit any file in the project
- Execute any shell command (bun, npm, git, etc.)
- Read reference repos (`reference/t3code/`, `reference/electrobun/`) for patterns
- Reason deeply with extra-high thinking
- Read images (screenshots, diagrams, mockups)
- Navigate complex codebases (T3 Code is large — search, grep, read selectively)
- Run `bun run typecheck`, `bun run lint`, `bun run build`
- Run tests and interpret results
- Git operations (commit, branch, diff, etc.)
- Install Bun/npm packages, run scripts
- Create Pi extensions and skills on the fly

## ⚠️ Known Gaps (Non-Exhaustive — Always Detect New Ones)

This list is a **starting point**, not a boundary. Every task may reveal gaps not listed here.

| Known Gap | Can Pi Solve It? | How |
|-----------|-------------------|-----|
| Test Pi RPC integration | Partially | Need `pi` installed + API key configured. Can mock for unit tests. |
| Verify UI visually | Partially | Can run build, check for errors. Can't see the actual rendered UI. |
| Test Electrobun features | No | Requires macOS native build environment, manual verification |
| Test cross-platform (Linux/Windows) | No | Requires target platform |
| Web search / research | Yes | Install `brave-search` skill or build fetch extension |
| Browse web pages | Yes | Build Playwright extension |
| Access Pi source code | Partially | Pi docs + `pi --help` available. Source at github.com/badlogic/pi-mono |
| Benchmark performance | Partially | Can measure build times. Can't measure UI rendering perf. |

## 🔴 Gaps That Always Need Human Help
- **API keys & credentials** — Never guess, always ask (Anthropic key for Pi, etc.)
- **Design & UX decisions** — Propose options, let human choose (colors, spacing, layout)
- **Pi RPC behavior verification** — Live testing requires running Pi with real API keys
- **Electrobun platform support** — Verify current state of Linux/Windows before committing
- **Business decisions** — Feature priorities, release timing, naming
- **Taste** — What "feels right" in the UI, interaction patterns, animation timing
- **Ambiguous requirements** — Clarify before building

## 🧠 The Dynamic Rule

> **The lists above will never be complete. The process matters more than the list.**
>
> On every task, at every step, run the Gap Detection Protocol from AGENTS.md.
> If you discover a new gap, either solve it or ask the human. Never silently degrade.

## 🚫 Hard Limits
- Cannot access the internet without an extension/tool
- Cannot persist memory across sessions beyond what's in files (plan, agents, session)
- Token context window applies (but auto-compaction helps)
- Cannot run GUI applications or see browser rendering
- **These too may change** — Pi's extension system can push some of these boundaries

## Reference Repos — How to Use Them

### Pi Mono (`reference/pi-mono/`)

**Best for:** Understanding Pi's actual RPC protocol, event types, message structures, SDK API.

**Key files to read by task:**
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
| Session management | `packages/coding-agent/docs/session.md` |
| All docs | `packages/coding-agent/docs/` |
| Example RPC client | `packages/coding-agent/test/rpc-example.ts` |
| Example extension UI | `packages/coding-agent/examples/rpc-extension-ui.ts` |

**This is the authoritative source for Pi's protocol.** When `docs/PI_INTEGRATION.md` and `reference/pi-mono/packages/coding-agent/docs/rpc.md` disagree, the pi-mono source wins.

**⚠️ Do NOT use `packages/web-ui/`.** Pi's own web UI (mini-lit web components) has caused problems before. PiBun builds its own React UI from scratch. The web-ui package is only useful as a reference for understanding event/message types — never import or depend on it.

### T3 Code (`reference/t3code/`)

**Best for:** WebSocket patterns, React component structure, Zustand store design, UI patterns.

**Key files to read by task:**
| Task | Read |
|------|------|
| WebSocket transport | `apps/web/src/wsTransport.ts` |
| Zustand store | `apps/web/src/store.ts` |
| Chat rendering | `apps/web/src/components/ChatView.tsx`, `chat/MessagesTimeline.tsx` |
| Composer input | `apps/web/src/components/ComposerPromptEditor.tsx` |
| Sidebar | `apps/web/src/components/Sidebar.tsx` |
| UI primitives | `apps/web/src/components/ui/` (button, input, dialog, etc.) |
| WS protocol types | `packages/contracts/src/ws.ts` |
| Provider events | `packages/contracts/src/providerRuntime.ts` |
| Monorepo config | `turbo.json`, `tsconfig.base.json`, `package.json` |

**Warning:** T3 Code uses Effect, Schema, and complex orchestration. Adapt patterns to plain TypeScript.

### Electrobun (`reference/electrobun/`)

**Best for:** Native app setup, window management, menu API, build config.

**Key files to read by task:**
| Task | Read |
|------|------|
| Minimal app setup | `templates/hello-world/` |
| React + Vite + Tailwind | `templates/react-tailwind-vite/` |
| Multi-tab browser | `templates/multitab-browser/` |
| Window API | `package/src/bun/core/BrowserWindow.ts` |
| Menu API | `package/src/bun/core/ApplicationMenu.ts` |
| Tray API | `package/src/bun/core/Tray.ts` |
| Config format | `templates/*/electrobun.config.ts` |

## How to Extend — Project-First

**Everything lives in the repo. Everything is committed to git.**

### Extension
```
.pi/extensions/my-tool.ts           → single-file, auto-loaded
.pi/extensions/my-tool/index.ts     → multi-file, auto-loaded
```

### Skill
```
.pi/skills/my-skill/SKILL.md        → auto-loaded for this project
.agents/skills/my-skill/SKILL.md    → cross-agent compatible
```

### ❌ Never Global
```
~/.pi/agent/extensions/  → NO. Not portable.
~/.agents/skills/        → NO. Not portable.
```
