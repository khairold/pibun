# Shared Memory

> Context and decisions that **every session must know**. Read this at the start of every session.

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Optimize for AI agent maintenance, not human IDE navigation | Human devs use tree views and cmd+click. AI agents use tool calls. Fewer files = fewer calls = faster. | 2026-03-24 |
| 2 | Context window is 1M tokens — entire codebase fits (~53%) | The bottleneck is NOT context pressure. It's tool call count (135 files = 135 reads), co-change sets, and doc redundancy/incoherence. | 2026-03-24 |
| 3 | "Deep modules" means: fewer files, richer interfaces, self-contained units | Not about saving tokens. About: (a) fewer tool calls per task, (b) smaller co-change sets per feature, (c) each file is a complete, self-documenting unit. | 2026-03-24 |
| 4 | Consolidate context docs before code | Context docs are read EVERY session. Reducing 7 mandatory files to 3 saves tool calls on every single future session. Highest ROI. | 2026-03-24 |
| 5 | Don't touch files that are already deep | piProcess.ts (570), wireTransport.ts (728), transport.ts (463), server.ts (560), piRpcManager.ts (319) — these are already good deep modules. Leave them alone. | 2026-03-24 |
| 6 | Keep types.ts in store/ as-is | At 463 lines it holds ALL slice type definitions. It's the single source of truth for store shape. Deep and correct. | 2026-03-24 |
| 7 | Not merging top-level components | Sidebar (1053), Composer (575), ChatView (417) are feature-specific. Merging them would create unfocused God components. They're deep enough. | 2026-03-24 |
| 8 | Consolidated CLAUDE.md absorbs AGENTS.md, CAPABILITY-MAP.md, SOUL.md, HUMAN.md | Audit found 25 unique concepts restated 50+ times across 12 files. "Thin bridge" alone appeared in 7 files. Single CLAUDE.md eliminates all redundancy. | 2026-03-24 |
| 9 | Audit artifact at `.plan/audit-1.1-redundancy-map.md` | Detailed redundancy map showing every cross-reference. Use as reference for items 1.3-1.4 to know what's been consolidated and what remains. | 2026-03-24 |
| 10 | CONVENTIONS.md trimmed from ~200 to ~95 lines | Removed: Thin Bridge section (in CLAUDE.md), WebSocket Protocol section (in types), File Organization (stale after refactoring), Quick Checklist (skills handle), TypeScript contracts section (in CLAUDE.md). Kept only rules not expressed in code. | 2026-03-24 |
| 11 | `.pi/` directory is now empty — AGENTS.md and CAPABILITY-MAP.md deleted | Content merged into CLAUDE.md. `.pi/` dir remains but has no files. `.agents/` has CONVENTIONS.md, TENSIONS.md, and skills/. | 2026-03-24 |
| 12 | Mandatory context files reduced from 7 to 3 | CLAUDE.md + CONVENTIONS.md + TENSIONS.md. Down from CLAUDE.md + AGENTS.md + CAPABILITY-MAP.md + SOUL.md + HUMAN.md + CONVENTIONS.md + TENSIONS.md. | 2026-03-24 |
| 13 | Audit artifact at `.plan/audit-1.5-docs-staleness.md` | Detailed staleness report: WS_PROTOCOL.md lists 17/42 methods (severely stale), PI_INTEGRATION.md is redundant with pi-mono rpc.md, WEB_UI.md is aspirational v1 plan. All three marked for deletion in 1.6. | 2026-03-24 |
| 14 | DECISIONS.md is 100% redundant with CLAUDE.md | All 12 decisions + all gotchas already merged into CLAUDE.md in Session 1. Recommend deleting in 1.6 alongside the other three stale docs. | 2026-03-24 |
| 15 | Phase 1 complete — docs/ reduced from 8 to 4 files | Deleted: WS_PROTOCOL.md, PI_INTEGRATION.md, WEB_UI.md, DECISIONS.md. Kept: ARCHITECTURE.md (rewritten), DESKTOP.md, CODE_SIGNING.md, ROADMAP.md. TSDoc updated in wsProtocol.ts, piProcess.ts, piRpcManager.ts, server.ts, wireTransport.ts. | 2026-03-24 |
| 16 | ARCHITECTURE.md rewritten as current-state doc | ~85 lines. Covers: overview diagram, monorepo layout, package roles (with key files), data flow, multi-session model. No aspirational content, no redundancy with CLAUDE.md decisions/gotchas. | 2026-03-24 |
| 17 | piProtocol.ts created (1182 lines) — merged from piTypes + piEvents + piCommands + piResponses | All Pi RPC types in one file. No cross-imports needed. Organized with `// ==== SECTION ====` headers: Content Blocks → Messages → Model → Events → Commands → Responses → StdoutLine. | 2026-03-24 |
| 18 | domain.ts created (497 lines) — merged from sessionTab + project + theme + settings + plugin + gitTypes | All app domain types in one file. Only import is PiModel/PiThinkingLevel from piProtocol.ts. settings→theme cross-reference resolved internally. | 2026-03-24 |
| 19 | wsProtocol.ts now imports from domain.js and piProtocol.js directly | Previously imported from index.js (barrel) and 4 domain files. Updated to import from 2 canonical files. No more circular barrel import. | 2026-03-24 |
| 20 | Phase 2 complete — contracts/ has exactly 4 files | piProtocol.ts (1182 lines), domain.ts (497 lines), wsProtocol.ts (953 lines), index.ts (15 lines). Down from 12 files. All external consumers use `@pibun/contracts` barrel — zero import changes needed. | 2026-03-24 |
| 21 | index.ts uses `export type *` for type-only files | piProtocol.ts and domain.ts are pure types (interfaces + type aliases). `export type * from` used for them. wsProtocol.ts has runtime values (WS_METHODS, WS_CHANNELS) so uses plain `export * from`. | 2026-03-24 |
| 22 | appSlice.ts combines ConnectionSlice + UiSlice + UpdateSlice + NotificationsSlice | Combined type `AppSlice` defined locally in appSlice.ts. Slice types in types.ts unchanged — they're still individually named interfaces. store/index.ts spreads one `createAppSlice` call instead of 4 separate ones. | 2026-03-24 |
| 23 | sessionSlice.ts combines SessionSlice + MessagesSlice + ModelsSlice + ExtensionUiSlice | Combined type `SessionSlice` defined locally (imported `SessionSlice as SessionSliceType` from types to avoid naming conflict). Includes message helper functions `findMessageIndex` and `updateAtIndex` inline. store/index.ts spreads one `createSessionSlice` call instead of 4. | 2026-03-24 |
| 24 | workspaceSlice.ts combines TabsSlice + TerminalSlice + GitSlice + PluginsSlice + ProjectsSlice | Combined type `WorkspaceSlice` defined locally. Largest merge — 5 slices into 1 (~350 lines). Includes all helpers inline (nextTabId, sortByLastOpened, terminalTabCounter). store/index.ts now spreads 3 slice creators total (app, session, workspace). | 2026-03-24 |

## Architecture Notes

### Current file counts (in progress)
- contracts/: 4 files ✅ DONE (was 12 → 9 after piProtocol merge → 4 after domain merge. index.ts: 15 lines)
- server src (non-test): 19 files, 4460 lines
- server handlers/: 8 files + types + index = 10 files
- web store/: 5 files ✅ DONE (was 15 → 12 after appSlice → 9 after sessionSlice → 5 after workspaceSlice merge)
- web lib/: 13 files, 2604 lines
- web components/: 45 files, 9361 lines
- web components/chat/: 6 files + tools/5 files = 11 files
- desktop src/: 6 files, 1631 lines
- Total source: ~135 files, ~33K lines

### Target file counts (after refactoring)
- contracts/: 4 files (piProtocol, wsProtocol, domain, index)
- server handlers/: 4 files (session, appHandlers, types, index)
- web store/: 5 files (appSlice, sessionSlice, workspaceSlice, types, index)
- web lib/: 8 files (sessionActions, tabActions, appActions, themes, highlighter, pluginMessageBridge, utils, wireTransport stays at top level)
- web components/chat/: 3 files (ChatMessages, ToolCards, ToolOutput)
- Context docs: 3 mandatory (CLAUDE.md, CONVENTIONS.md, TENSIONS.md)

### What stays untouched
- piProcess.ts, piRpcManager.ts, server.ts — already deep
- wireTransport.ts, transport.ts — already deep
- Top-level components (Sidebar, Composer, ChatView, etc.)
- Desktop app (6 files, already well-structured)
- Test files (separate concern, not in scope)
- packages/shared (2 files, minimal)

## Gotchas & Warnings

- **Import paths will break massively in Phases 2-5.** After each merge, run typecheck immediately. Fix all imports before moving to next merge.
- **Biome format after every file write.** The write tool outputs spaces; Biome expects tabs.
- **Don't lose TSDoc.** When merging files, keep the best comment from each. Don't concatenate all headers.
- **Store slice merging changes the `StateCreator` generic.** Each slice uses `StateCreator<AppStore, [], [], SliceType>`. When merging slices, the combined slice type changes.
- **Handler registry in index.ts maps string literals.** When moving handlers between files, the string keys don't change — only the import paths.
- **contracts index.ts exports `WS_METHODS` and `WS_CHANNELS` as values.** Everything else is type-only. Don't accidentally make domain.ts export runtime values unless needed.
- **wsProtocol.ts now imports from `./domain.js` and `./piProtocol.js` directly.** The old barrel import via `./index.js` is gone. Item 2.4 (rewrite index.ts) should be straightforward — index.ts is already just re-exports from 3 files.

## Technical Context

| Item | Value |
|------|-------|
| Build gate | `bun run typecheck && bun run lint` |
| Full verify | `bun run typecheck && bun run lint && bun run build` |
| Dev test | `bun run dev:server` + `bun run dev:web` |
| Formatting | `bun run format` (after file writes) |
