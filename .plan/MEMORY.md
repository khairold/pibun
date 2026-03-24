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
| 9 | Background event routing removed from `wireTransport.ts` | Single-session model: only one Pi process runs, so all events go to `handlePiEvent`. Stale events from old session during switch are silently skipped with `console.debug`. The `bgTab` branch with `hasUnread`, `setBackgroundTabStatus`, `setBackgroundTabWidget` calls is gone. | 2026-03-24 |
| 10 | Per-tab message/status/widget caches removed | `tabMessages`, `tabStatuses`, `tabWidgets` removed from state. `saveActiveTabMessages` removed. `switchTab` now clears messages and relies on async action layer to load from Pi via `session.getMessages`. `setBackgroundTabStatus`/`setBackgroundTabWidget` are no-ops pending removal in 1.6. | 2026-03-24 |
| 11 | `sessionFile` added to `SessionTab` | Tabs now track their Pi session file path. Saved during `switchTab` snapshot and `syncActiveTabState`. Required for session resume when switching back to a previously active tab. | 2026-03-24 |
| 12 | `switchTabAction` uses `switchSession()` for resume | When switching to a tab with a `sessionFile`, clears `store.sessionId` (so `ensureSession` starts a fresh Pi process), then calls `switchSession(sessionFile)` which handles: start process → switch to file → load messages → refresh state. No manual stop/start orchestration. | 2026-03-24 |
| 13 | `tabTerminalActiveIds` removed — terminal selection uses first-match | Was a per-tab cache for active terminal ID. Removed because terminals are going project-scoped (DRIFT #1). Now `switchTab`/`removeTab` select the first terminal owned by the target tab via `terminalTabs.find(t => t.ownerTabId === tabId)`. | 2026-03-24 |
| 14 | `reorderTabs`, `setBackgroundTabStatus`, `setBackgroundTabWidget` removed | Dead code. `reorderTabs` was only used by `TabBar` (not imported anywhere). Background tab methods were no-ops since 1.3. All removed from type + implementation. | 2026-03-24 |
| 15 | `TabBar` component is dead code | Not imported or rendered anywhere. Sidebar handles session navigation. Drag-to-reorder stripped out. Full removal deferred to Phase 3. | 2026-03-24 |
| 16 | Empty sessions auto-removed in `switchTabAction` only | Auto-remove on switch is in `switchTabAction`. `startSession` does NOT auto-remove the leaving tab — `session.start` on the server handles stopping the old process, and the old empty tab stays in the list until the user switches away from it. Keeps `startSession` simple and avoids edge cases if `session.start` fails (no orphan removal). | 2026-03-24 |
| 17 | `cleanupEmptyTab` helper in tabActions | Shared helper for post-switch cleanup of empty tabs: closes terminals, deletes composer draft, removes tab from store. Pi process stop must happen BEFORE the switch (while transport still routes to it). The helper only handles UI cleanup. |
| 18 | Session naming priority: Pi name > firstMessage > "New session" | `unifiedSessionName()` in Sidebar.tsx uses `tab.name \|\| tab.firstMessage \|\| "New session"`. `tab.name` is synced from `store.sessionName` (Pi-set name) via `syncActiveTabState`. `firstMessage` is auto-extracted from first user message (truncated to 100 chars, single-line). `defaultTabName()` returns `""` so it falls through. Past sessions use same priority with `formatSessionId` as last resort. | 2026-03-24 |
| 19 | `firstMessage` truncated to 100 chars, single-line | `getFirstUserMessage()` collapses whitespace/newlines to single spaces and caps at 100 chars with `…` suffix. Prevents storing huge strings in tab state for sidebar display. CSS `truncate` also handles visual overflow. | 2026-03-24 | 2026-03-24 |

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
  if event.sessionId matches active (or no session context) → handlePiEvent(event) → store updates
  else → skip stale event with console.debug log (single-session: no background routing)
```

### Session Switching (Implemented)

**Flow:** `switchTab()` snapshots leaving tab → clears messages → sets target metadata →
`switchTabAction` clears `store.sessionId` → calls `switchSession(targetTab.sessionFile)` →
`ensureSession()` starts a fresh Pi process (stops old via server) →
`session.switchSession` loads the session file → refreshes state → loads messages.

Tabs without a `sessionFile` (never started) just route transport to null. User starts by typing (triggers `ensureSession`).

**Key detail:** `ensureSession()` uses `getActiveTab().cwd` for the new process CWD, so switching to a tab with a different project CWD starts the process in the right directory.

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
- `switchTab` no longer saves/restores messages — clears them and async layer loads from Pi
- Terminal tabs use `ownerTabId` to scope to a session tab — this still works
- `startNewSession()` in sessionActions calls `session.new` (in-process) not `session.start` (new process). These are different Pi commands.
- `session.switchSession` is a Pi command that switches session files within the same process. Different from stopping one process and starting another.
- Keyboard shortcuts `Ctrl+N` calls `startNewSession()`, `Ctrl+T` calls `createNewTab()` — both need updating
- `closeTab` in tabActions still targets dead sessions (loads messages from stopped process). Needs update in Phase 3 or removal (3.6).
- `switchSession()` from sessionActions must have `store.sessionId` cleared to null BEFORE calling — otherwise `ensureSession()` thinks a session exists and skips starting a new process

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
