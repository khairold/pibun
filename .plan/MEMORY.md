# Shared Memory

> Context and decisions that **every session must know**. Read at the start of every session.

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Single active session, not multi-tab | UI moved to sidebar-based navigation. Multi-session adds complexity without UX benefit. Terminals stay within the single session. | 2026-03-24 |
| 2 | `SessionTab` type stays, behavior changes | The type is a fine session container (sessionId, cwd, model, etc.). We change the lifecycle, not the data structure. | 2026-03-24 |
| 3 | Two session ID domains: PiBun manager ID vs Pi UUID | `sessionId` = PiBun manager ID (routing). `piSessionId` = Pi internal UUID (session list matching). Never conflate. Fixed in commit `059d862`. | 2026-03-24 |
| 4 | Empty sessions auto-removed on switch | When user switches away from a session with 0 messages, it gets stopped and removed. Prevents orphan "New session" entries. | 2026-03-24 |
| 5 | Terminals scoped to project, not session | Terminals are workspaces (dev servers, file browsing, bash). They map to projects, not conversations. Switching sessions within a project keeps terminals. Switching projects swaps terminal set (kept alive in background). Old per-session terminal model is dead. | 2026-03-24 |
| 6 | Tabbed main content area (post-simplification) | After single-session simplification, main area gets tab bar: [Session Chat] + [Terminal 1..N]. Min 2 tabs always visible. Terminals renameable. Full-sized (no bottom panel). This is a separate plan after Phase 3. | 2026-03-24 |
| 7 | `keepExisting` removed from WsSessionStartParams | Single-session model means server always stops existing session on `session.start`. No need for a flag. Removed from contracts, server handler, and all client callers. | 2026-03-24 |
| 8 | `createNewTab` renamed to `startSession` in tabActions | Better reflects single-session semantics. All callers updated: Sidebar, TabBar, wireTransport, useKeyboardShortcuts, appActions. | 2026-03-24 |

## Architecture Notes

### Session ID Domains (CRITICAL)

Two IDs exist for every session — they are NEVER the same value:

| Field | Source | Format | Used For |
|-------|--------|--------|----------|
| `sessionId` | `PiRpcManager.createSession()` | `session_{N}_{timestamp}` | Event routing, transport routing, server lookup |
| `piSessionId` | Pi's `get_state` response | UUID v4 | Session list matching, "Running" badge, past session highlight |

`store.sessionId` and `tab.sessionId` MUST always hold the PiBun manager ID.
`store.piSessionId` and `tab.piSessionId` hold the Pi UUID.

### Event Flow (Current)

```
Pi process → JSONL events → PiProcess.onEvent → server pushes pi.event(sessionId, event) → 
WebSocket → wireTransport pi.event subscriber → 
  if event.sessionId matches active → handlePiEvent(event) → store updates
  else → background tab status update (TO BE REMOVED in Phase 1)
```

### Session Switching (Current → Target)

**Current:** Both sessions run simultaneously. Message caches swap.
**Target:** Old session stops → tab metadata updates → new session starts → messages loaded from Pi.

### Files Involved

| File | Lines | Role |
|------|-------|------|
| `store/workspaceSlice.ts` | 725 | Tabs, terminal, git, plugins, projects state |
| `lib/tabActions.ts` | 252 | Tab lifecycle coordinator (create, close, switch) |
| `lib/sessionActions.ts` | 668 | Session lifecycle (start, new, fork, switch, bash) |
| `wireTransport.ts` | 1002 | Event routing, menu handling, push subscriptions |
| `components/Sidebar.tsx` | 1583 | Project tree, session list, context menus |
| `store/types.ts` | ~600 | All Zustand slice types |

## Gotchas & Warnings

- `syncActiveTabState` must NOT overwrite `tab.sessionId` — fixed in commit `059d862`
- `switchTab` in workspaceSlice saves leaving tab state — this save/restore goes away in Phase 1
- Terminal tabs use `ownerTabId` to scope to a session tab — this still works
- `startNewSession()` in sessionActions calls `session.new` (in-process) not `session.start` (new process). These are different Pi commands.
- `session.switchSession` is a Pi command that switches session files within the same process. Different from stopping one process and starting another.
- Keyboard shortcuts `Ctrl+N` calls `startNewSession()`, `Ctrl+T` calls `createNewTab()` — both need updating

## Technical Context

```bash
bun run typecheck    # tsc --noEmit across all packages
bun run build        # full production build
bun run lint         # biome check
bun run format       # biome format

# Dev mode (3 terminals):
bun run dev:server   # port 24242
bun run dev:web      # port 5173
# Desktop: cd apps/desktop && PIBUN_DEV=1 npx electrobun dev
```
