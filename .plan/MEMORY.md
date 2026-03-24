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

## Architecture Notes

### Current file counts (before refactoring)
- contracts/: 12 files, 2992 lines
- server src (non-test): 19 files, 4460 lines
- server handlers/: 8 files + types + index = 10 files
- web store/: 15 files, 1409 lines
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

## Technical Context

| Item | Value |
|------|-------|
| Build gate | `bun run typecheck && bun run lint` |
| Full verify | `bun run typecheck && bun run lint && bun run build` |
| Dev test | `bun run dev:server` + `bun run dev:web` |
| Formatting | `bun run format` (after file writes) |
