# PiBun Refactoring — Deep Modules for AI Agent Maintenance

> **Spec:** Audit findings from 2026-03-24 session + "deep modules" principle
> **Status:** In Progress
> **Current Phase:** Phase 1 — Context Document Consolidation
> **Last Session:** Session 1 — 2026-03-24

---

## Motivation

With a 1M token context window, the entire codebase (~532K tokens) fits in one session. The bottleneck is NOT context pressure. It's:

1. **Tool call count** — 135 source files = up to 135 reads per session. Each read is latency + overhead.
2. **Co-change sets** — adding a new WS method touches 6+ files. Deep modules reduce this.
3. **Redundancy in docs** — 7 context files restate the same concepts in slightly different ways, creating incoherence (the agent hedges when it reads conflicting framings).
4. **Shallow modules** — 5 store slices are <30 lines. They exist for "organization" but add zero encapsulation. An agent reads each one separately just to confirm it's trivial.

**Principle: fewer files, richer interfaces, self-contained modules.** Each file should be a complete unit an agent can read once and understand fully. Optimize for fewer tool calls and smaller co-change sets, not for human IDE navigation.

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
6. Run: `bun run typecheck && bun run lint`

---

## Phase 1 — Context Document Consolidation

**Goal:** Reduce the 7 mandatory context files to 3. Eliminate redundancy. Single source of truth for each concept.

- [x] 1.1 — Audit all cross-references between CLAUDE.md, AGENTS.md, CAPABILITY-MAP.md, SOUL.md, HUMAN.md to map every redundant statement
- [x] 1.2 — Write new consolidated CLAUDE.md (~300 lines) that merges: project identity, agent identity/personality, human context, capabilities, reference repo guides, and playbooks — one file, one read
- [ ] 1.3 — Trim CONVENTIONS.md: remove sections that duplicate type-level knowledge (WS message format examples — the types already enforce this), keep only rules that AREN'T expressed in code
- [ ] 1.4 — Delete AGENTS.md, CAPABILITY-MAP.md, SOUL.md, HUMAN.md (content now lives in CLAUDE.md)
- [ ] 1.5 — Audit docs/ for staleness: compare WS_PROTOCOL.md method list against actual 42-method handler registry, check PI_INTEGRATION.md against current piProcess.ts
- [ ] 1.6 — Delete docs/WS_PROTOCOL.md, docs/WEB_UI.md, docs/PI_INTEGRATION.md — their useful content becomes TSDoc in the code files they describe (wsProtocol.ts, piProcess.ts, wireTransport.ts)
- [ ] 1.7 — Update docs/ARCHITECTURE.md to be the single "how this codebase works" doc (~100 lines, current state not aspirational)
- [ ] 1.8 — Verify: a fresh agent session reads only CLAUDE.md + CONVENTIONS.md + TENSIONS.md and has full context to work

**Exit criteria:** `bun run typecheck && bun run lint` passes. Only 3 context files remain mandatory. No information loss — everything is either in code (TSDoc) or in the 3 remaining files.

---

## Phase 2 — Deep Contracts Package

**Goal:** Consolidate 12 contracts files into 4. One file to read per domain.

- [ ] 2.1 — Merge piTypes.ts + piEvents.ts + piCommands.ts + piResponses.ts → `piProtocol.ts` (~1200 lines). All Pi RPC types in one file. Organize with `// ==== SECTION ====` headers.
- [ ] 2.2 — Merge sessionTab.ts + project.ts + theme.ts + settings.ts + plugin.ts + gitTypes.ts → `domain.ts` (~300 lines). All app domain types.
- [ ] 2.3 — Keep wsProtocol.ts as-is (already 933 lines, already deep). Add TSDoc from the deleted WS_PROTOCOL.md.
- [ ] 2.4 — Rewrite index.ts as a slim re-export from 3 files (piProtocol, wsProtocol, domain)
- [ ] 2.5 — Update all imports across server, web, desktop packages — run typecheck to verify
- [ ] 2.6 — Verify: `bun run typecheck && bun run lint && bun run build` all pass

**Exit criteria:** contracts/ has 4 files. All packages compile. No import breaks.

---

## Phase 3 — Deep Store + Actions

**Goal:** Consolidate 15 store files into 4, and 13 lib files into 6. Reduce the web app's file count by ~18.

- [ ] 3.1 — Merge store slices: connection + ui + update + notifications → `appSlice.ts`. These are app-level state, always orthogonal to chat.
- [ ] 3.2 — Merge store slices: session + messages + models + extensionUi → `sessionSlice.ts`. These co-change during conversation flow.
- [ ] 3.3 — Merge store slices: tabs + terminal + git + plugins + projects → `workspaceSlice.ts`. Workspace-level features.
- [ ] 3.4 — Rewrite store/index.ts to combine 3 slices. Update store/types.ts if slice interfaces change.
- [ ] 3.5 — Merge lib actions: gitActions + projectActions + pluginActions + settingsActions + terminalActions → `appActions.ts`. All follow the identical try/catch/getTransport/updateStore pattern.
- [ ] 3.6 — Merge lib utilities: cn.ts + fileUtils.ts + shortcuts.ts → `utils.ts`. Small utilities always needed together.
- [ ] 3.7 — Keep as-is: sessionActions.ts (533 lines, complex), tabActions.ts (246 lines, coordination logic), themes.ts (527 lines, self-contained), highlighter.ts (208 lines, shiki setup), pluginMessageBridge.ts (323 lines, different concern)
- [ ] 3.8 — Update all component imports. Run typecheck.
- [ ] 3.9 — Verify: `bun run typecheck && bun run lint && bun run build` all pass

**Exit criteria:** store/ has 5 files (3 slices + types + index). lib/ has 8 files (down from 13). All components compile.

---

## Phase 4 — Deep Server Handlers

**Goal:** Consolidate 8 handler files into 3. Add piPassthrough helper to eliminate boilerplate.

- [ ] 4.1 — Add `piPassthrough` helper to types.ts (or a new helpers.ts): generic function that handles the getProcess → sendCommand → assertSuccess → extract pattern
- [ ] 4.2 — Keep session.ts as-is (541 lines, has real logic beyond passthrough)
- [ ] 4.3 — Merge app.ts + git.ts + plugin.ts + project.ts + settings.ts + terminal.ts → `appHandlers.ts`. Most are 5-20 line pass-throughs.
- [ ] 4.4 — Rewrite handlers/index.ts to import from 2 handler files instead of 8
- [ ] 4.5 — Convert trivial handlers to use piPassthrough where applicable
- [ ] 4.6 — Verify: `bun run typecheck && bun run lint && bun run build` all pass

**Exit criteria:** handlers/ has 4 files (session + appHandlers + types + index). piPassthrough eliminates repeated boilerplate.

---

## Phase 5 — Deep Chat Components

**Goal:** Consolidate 10 chat component files into 3. These are stable, rarely change, and are always rendered together.

- [ ] 5.1 — Merge UserMessage.tsx + AssistantMessage.tsx + SystemMessage.tsx → `ChatMessages.tsx`. Simple renderers for the 3 non-tool message types.
- [ ] 5.2 — Merge ToolCallMessage.tsx + ToolResultMessage.tsx + ToolExecutionCard.tsx → `ToolCards.tsx`. Tool rendering pipeline.
- [ ] 5.3 — Merge BashOutput.tsx + ReadOutput.tsx + EditOutput.tsx + WriteOutput.tsx + ToolOutput.tsx dispatcher → `ToolOutput.tsx`. Each tool output renderer is ~60 lines; keep them as named exports in one file.
- [ ] 5.4 — Update ChatView.tsx imports to use the 3 new files
- [ ] 5.5 — Verify: `bun run typecheck && bun run lint && bun run build` all pass

**Exit criteria:** components/chat/ has 3 files (down from 6). components/chat/tools/ eliminated (merged into ToolOutput.tsx). ChatView renders correctly.

---

## Phase 6 — Cleanup and Verification

**Goal:** Final pass. Remove dead code, verify everything, update conventions.

- [ ] 6.1 — Run full build: `bun run typecheck && bun run lint && bun run build`
- [ ] 6.2 — Delete any empty directories left from consolidation
- [ ] 6.3 — Update CONVENTIONS.md file organization section to reflect new structure
- [ ] 6.4 — Update docs/ARCHITECTURE.md monorepo structure section to reflect new file counts
- [ ] 6.5 — Run `bun run dev:server` and `bun run dev:web` — smoke test that the app still works
- [ ] 6.6 — Git commit with summary of what was consolidated and file count reduction
- [ ] 6.7 — Final count: document before/after file counts in MEMORY.md

**Exit criteria:** App runs. Types check. Lint passes. Conventions and architecture docs reflect reality. Git history is clean.

---

## Parking Lot

Items considered but deferred:

- [ ] Consolidate top-level components (Sidebar at 1053 lines may need splitting, not merging)
- [ ] Extract a `requestWithStore` helper in web lib to abstract the getTransport/useStore.getState pattern
- [ ] Consider code-generating the handler registry from contracts types (single definition → handler stubs)
- [ ] Evaluate whether wireTransport.ts (728 lines) should be split — it's deep but does event mapping + singleton management + multiple concerns
- [ ] Desktop scripts consolidation (5 build scripts in apps/desktop/scripts/)
- [ ] Test file consolidation (13 test/verify files in server, 6549 lines — significant but separate concern)
