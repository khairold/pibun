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
| 25 | store/index.ts already correct after Session 10 | 3 slices (app, session, workspace). types.ts unchanged — individual slice interfaces remain as named types for documentation/readability. Item 3.4 was a verification, not work. | 2026-03-24 |
| 26 | appActions.ts merges 5 action files (git + project + plugin + settings + terminal) | ~480 lines. All follow the same pattern: getTransport → request → update store. `errorMessage()` helper shared across project/git/terminal sections. Imports tabActions for `createNewTab`/`switchTabAction` (project open). Imports themes for settings. | 2026-03-24 |
| 27 | utils.ts merges 3 utility files (cn + fileUtils + shortcuts) | ~200 lines. `cn()` className helper, file extension→language maps, shortcut event bus. All small, always needed together. |
| 28 | Phase 3 complete — store/ has 5 files, lib/ has 7 files | store: appSlice, sessionSlice, workspaceSlice, types, index. lib: appActions, sessionActions, tabActions, themes, highlighter, pluginMessageBridge, utils. Down from 15 store files and 13 lib files. | 2026-03-24 |
| 29 | piPassthrough helper added to handlers/types.ts | `getProcess(ctx)`, `assertSuccess(response)`, `piPassthrough(ctx, command)` — reusable helpers for Pi RPC forwarding. Exported from handlers/index.ts. session.ts has its own local copies (could be migrated later). | 2026-03-24 |
| 30 | Non-session handlers are NOT Pi RPC pass-throughs | app/git/plugin/project/settings/terminal handlers call server-side services (gitService, pluginStore, projectStore, settingsStore, TerminalManager, desktop hooks). None call `process.sendCommand`. The `piPassthrough` helper applies only to session.ts patterns. | 2026-03-24 |
| 31 | Phase 4 complete — handlers/ has 4 non-test files | session.ts (541), appHandlers.ts (~370), types.ts (~100), index.ts (~120). Down from 10 files (8 handler + types + index). dispatch.test.ts unchanged. | 2026-03-24 |
| 32 | Phase 5 complete — chat/ has 3 files, tools/ eliminated | ChatMessages.tsx (~240 lines: User+Assistant+System), ToolCards.tsx (~450 lines: ToolCall+ToolResult+ToolExecutionCard), ToolOutput.tsx (~540 lines: dispatcher+Bash+Read+Edit+Write+Default). Down from 6+5=11 files. | 2026-03-24 |
| 33 | ToolOutput.tsx import path changed from `@/components/chat/tools/ToolOutput` to `@/components/chat/ToolOutput` | ToolExecutionCard (now in ToolCards.tsx) imports ToolOutput — path updated since tools/ subdir is gone. | 2026-03-24 |
| 34 | `.pi/` directory deleted — was empty since Session 2 | AGENTS.md and CAPABILITY-MAP.md were deleted in Session 2; dir lingered empty. Cleaned up in 6.2. | 2026-03-24 |
| 35 | CONVENTIONS.md now has File Organization section | Tables showing key files per package. Guidelines: extend deep files rather than creating new ones. Added in 6.3. | 2026-03-24 |
| 36 | ARCHITECTURE.md updated with post-refactoring structure | Reflects: 2 handler files (session + appHandlers), 3 store slices, 7 lib files, 3 chat files, 4 contracts files. | 2026-03-24 |

## Architecture Notes

### Current file counts (in progress)
- contracts/: 4 files ✅ DONE (was 12 → 9 after piProtocol merge → 4 after domain merge. index.ts: 15 lines)
- server src (non-test): 19 files, 4460 lines
- server handlers/: 4 files ✅ DONE (was 10 → 4. session + appHandlers + types + index. dispatch.test.ts separate)
- web store/: 5 files ✅ DONE (was 15 → 5. appSlice + sessionSlice + workspaceSlice + types + index)
- web lib/: 7 files ✅ DONE (was 13 → 7. appActions + sessionActions + tabActions + themes + highlighter + pluginMessageBridge + utils)
- web components/: 45 files, 9361 lines
- web components/chat/: 3 files ✅ DONE (was 6 + tools/5 = 11 → 3. ChatMessages + ToolCards + ToolOutput)
- desktop src/: 6 files, 1631 lines
- Total source: 95 files (down from ~135)

### Target file counts (after refactoring)
- contracts/: 4 files (piProtocol, wsProtocol, domain, index)
- server handlers/: 4 files (session, appHandlers, types, index)
- web store/: 5 files (appSlice, sessionSlice, workspaceSlice, types, index)
- web lib/: 7 files (sessionActions, tabActions, appActions, themes, highlighter, pluginMessageBridge, utils — wireTransport stays at src/ top level)
- web components/chat/: 3 files (ChatMessages, ToolCards, ToolOutput) ✅ DONE
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
- **tabActions.ts imports from appActions.ts** (for `fetchGitStatus`). This is a relative import `./appActions` — easy to miss when renaming action files.
- **contracts index.ts exports `WS_METHODS` and `WS_CHANNELS` as values.** Everything else is type-only. Don't accidentally make domain.ts export runtime values unless needed.
- **wsProtocol.ts now imports from `./domain.js` and `./piProtocol.js` directly.** The old barrel import via `./index.js` is gone. Item 2.4 (rewrite index.ts) should be straightforward — index.ts is already just re-exports from 3 files.

## Technical Context

| Item | Value |
|------|-------|
| Build gate | `bun run typecheck && bun run lint` |
| Full verify | `bun run typecheck && bun run lint && bun run build` |
| Dev test | `bun run dev:server` + `bun run dev:web` |
| Formatting | `bun run format` (after file writes) |
