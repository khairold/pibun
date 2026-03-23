# Session Log

> Chronological record of each build session.

---

## Session 0 — System Setup (2026-03-23)

**What happened:**
- Explored all reference projects (khairold-com, quotecraft, three-anchors, caselaw, unifi-com-my, second-brain, webm-converter)
- Read all 8 systems articles (plan-protocol, agent-soul, work-on-the-system, autopilot, self-aware-agents, atomic-design, browser-tool, meta-tasks)
- Analyzed T3 Code and Electrobun reference repos
- Reviewed existing pibun documentation (6 doc files)
- Created full agent operating system:
  - `.plan/` — PLAN.md (8 phases, 100+ items), MEMORY.md (15 decisions), DRIFT.md, SESSION-LOG.md
  - `.pi/` — AGENTS.md (5 roles, gap detection, 4 playbooks), CAPABILITY-MAP.md
  - `.agents/` — SOUL.md, HUMAN.md, TENSIONS.md, CONVENTIONS.md
  - `CLAUDE.md` — session boot file

**Items completed:**
- [x] 0.7 — Set up agent system

**Handoff to next session:**
- **Next:** Phase 0 items 0.8–0.18 — Initialize Bun monorepo scaffold
- Start with 0.8 (workspace root package.json)
- Need to verify `pi --mode rpc` works (0.18) — requires Pi installed locally with API keys
- All docs already written — the scaffold should follow ARCHITECTURE.md structure exactly
- Reference `reference/t3code/package.json` and `reference/t3code/turbo.json` for monorepo patterns

---

## Session 1 — Root Config Scaffolding (2026-03-23)

**What happened:**
- Created root `package.json` with Bun workspaces (`apps/*`, `packages/*`), scripts for build/dev/typecheck/lint/format
- Created `turbo.json` with build/dev/typecheck/clean tasks (lint runs via Biome at root, not via Turbo)
- Created `tsconfig.base.json` with strict TypeScript settings matching t3code patterns (ES2023, Bundler resolution, verbatimModuleSyntax, exactOptionalPropertyTypes)
- Created `biome.json` with tabs, double quotes, semicolons, recommended lint rules, noUnusedImports/noUnusedVariables warnings
- Installed deps: Turbo 2.8.20, Biome 1.9.4, TypeScript 5.9.3
- Fixed: Turbo 2.8+ requires `packageManager` field — added `"packageManager": "bun@1.2.21"`
- Fixed: Biome postinstall blocked — ran `bun pm trust @biomejs/biome`
- Formatted all files with Biome (spaces → tabs)
- Verified `bun run typecheck && bun run lint` passes

**Items completed:**
- [x] 0.8 — Initialize Bun workspace root
- [x] 0.9 — Set up Turbo for build orchestration
- [x] 0.10 — Set up base TypeScript config
- [x] 0.11 — Set up Biome for lint + format

**Issues encountered:**
- Turbo 2.8+ requires `packageManager` in root package.json (not documented in t3code reference which uses an older Turbo)
- Biome postinstall needs explicit trust in Bun

**Handoff to next session:**
- Next: 0.12 — Create `packages/contracts/` scaffold
- Items 0.12–0.16 are package/app scaffolds (each small — could combine several)
- All config files use tabs (Biome formatter). Run `bun run format` after writing new files
- tsconfig.base.json does NOT include Bun types — server package must add `@types/bun` itself
- tsconfig.base.json does NOT include JSX config — web package must add `jsx: "react-jsx"` itself

---

## Session 2 — Package Scaffolds + RPC Verification (2026-03-23)

**What happened:**
- Created all 5 package/app scaffolds (0.12–0.16):
  - `packages/contracts/` — types-only package, empty `src/index.ts`
  - `packages/shared/` — runtime utils with subpath export `./jsonl`, depends on contracts
  - `apps/server/` — Bun server with `@types/bun`, depends on contracts + shared
  - `apps/web/` — React 19 + Vite 6 + Tailwind v4, with `@/` path alias, `index.html`, stub App component
  - `apps/desktop/` — Electrobun placeholder with `@types/bun`, depends on contracts
- Ran `bun install` — 90 packages installed, trusted `esbuild` postinstall
- Fixed Biome import ordering in `vite.config.ts` (`node:` builtins must come first)
- Verified `bun run typecheck` passes (all 5 packages)
- Verified `bun run lint` passes (22 files, no issues)
- Verified Pi RPC mode with Pi 0.61.1:
  - `get_available_models` returns 23 Anthropic models
  - `get_state` returns model info, session details, streaming status
  - Discovered: commands use `"type"` field (not `"command"`), Pi auto-creates sessions

**Items completed:**
- [x] 0.12 — Create `packages/contracts/` scaffold
- [x] 0.13 — Create `packages/shared/` scaffold
- [x] 0.14 — Create `apps/server/` scaffold
- [x] 0.15 — Create `apps/web/` scaffold
- [x] 0.16 — Create `apps/desktop/` scaffold
- [x] 0.17 — Verify monorepo: `bun install` + `bun run typecheck` + `bun run lint` all pass
- [x] 0.18 — Verify Pi RPC works locally

**Issues encountered:**
- Biome organizeImports requires `node:` builtins before `@scoped` packages — fixed immediately
- esbuild (Vite dep) needs `bun pm trust` — already in trustedDependencies from Session 1

**Handoff to next session:**
- **Phase 0 is COMPLETE** — all exit criteria met
- Next: Phase 1A.1 — Define Pi RPC event types in `packages/contracts/`
- Read `reference/pi-mono/packages/coding-agent/docs/rpc.md` for authoritative event type definitions
- Key: Pi RPC commands use `{"type": "command_name"}` format, responses use `{"type": "response", "command": "..."}`
- All source files are stubs — real implementation starts in Phase 1A

---

## Session 3 — Pi RPC Contract Types (2026-03-23)

**What happened:**
- Defined complete Pi RPC type system in `packages/contracts/` across 4 files:
  - `piTypes.ts` — Base types: content blocks (text, thinking, image, toolCall), messages (user, assistant, toolResult, bashExecution), model, usage, session state, compaction/bash/session stats results, slash commands, thinking levels, stop reasons
  - `piEvents.ts` — 16 event types: agent lifecycle, turn lifecycle, message lifecycle, tool execution, auto-compaction, auto-retry, extension error, extension UI requests (9 methods: select, confirm, input, editor, notify, setStatus, setWidget, setTitle, set_editor_text)
  - `piCommands.ts` — 24 command types: prompting, state, model, thinking, queue modes, compaction, retry, bash, session management, slash commands. Plus 3 extension UI response types (value, confirm, cancel)
  - `piResponses.ts` — Per-command success responses + generic error response. `PiStdoutLine` union covers all possible JSONL from Pi stdout
  - `index.ts` — Re-exports all types (~80 type exports)
- All types are pure TypeScript interfaces/types — zero runtime code (Decision 12)
- Types modeled from authoritative Pi source (`reference/pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts` and `rpc.md`)
- Verified: `bun run typecheck` passes, `bun run lint` passes, types importable from `@pibun/contracts`

**Items completed:**
- [x] 1A.1 — Define Pi RPC event types in `packages/contracts/`
- [x] 1A.2 — Define Pi RPC command types in `packages/contracts/`
- [x] 1A.3 — Define Pi RPC response type in `packages/contracts/`

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1A.4 — Implement JSONL parser in `packages/shared/`
- The parser must split on `\n` only — see CONVENTIONS.md for the exact pattern
- `packages/shared/src/jsonl.ts` already exists as a stub with the correct export path (`@pibun/shared/jsonl`)
- After JSONL parser: 1A.5 (unit tests), then 1A.6 (PiProcess class in server)
