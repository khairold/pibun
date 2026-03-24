# Shared Memory

> Context and decisions that **every session must know**. Read at the start of every session.

---

## Key Decisions

### Carried from Single-Session Simplification (completed 2026-03-24)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Single active session, not multi-tab | One Pi process at a time. Sidebar handles session navigation. No background event routing. |
| 2 | Two session ID domains: PiBun manager ID vs Pi UUID | `sessionId` = PiBun manager ID (`session_{N}_{timestamp}`, routing). `piSessionId` = Pi internal UUID (session list matching). NEVER conflate. |
| 3 | `sessionFile` on `SessionTab` | Tabs track their Pi session file path for resume. Required for `switchSession()` when switching back to previously active sessions. |
| 4 | Empty sessions auto-removed in `switchTabAction` only | On switch, if leaving tab has 0 messages: stop process → switch → cleanup. NOT in `startSession` (avoids edge cases if start fails). |
| 5 | Session naming priority | `tab.name || tab.firstMessage || "New session"`. `tab.name` from Pi, `firstMessage` truncated to 100 chars single-line. |
| 6 | New session reuses empty active tab in same project | `handleNewSessionInProject` checks CWD match + 0 messages → no-op instead of creating another empty session. |

### New for This Plan

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 7 | Terminals scoped to project, not session | Terminals are workspaces (dev servers, file browsing, bash). They map to projects, not conversations. Multiple Pi sessions share the same terminal set. | 2026-03-24 |
| 8 | Tabbed main content area | Tab bar: [Chat] + [Terminal 1..N]. Chat tab = active session. Terminal tabs = project-scoped. Full-height terminals (no bottom panel). | 2026-03-24 |
| 9 | Minimum tabs: 1 chat + 1 terminal (when project active) | Auto-create one terminal when project first activates. Can't close the last terminal (disabled close button, or re-create immediately). Before any project: just the chat tab. | 2026-03-24 |
| 10 | Terminal tabs are renameable | Default "Terminal 1", "Terminal 2" auto-increment. Double-click label to rename (e.g., "dev server", "logs"). | 2026-03-24 |
| 11 | Terminals kept alive on project switch | `Map<projectPath, TerminalTab[]>` conceptually. Switching projects swaps which terminals are visible, doesn't kill processes. | 2026-03-24 |
| 12 | Terminal splits parked | Old `groupId`/`splitTerminalTab`/`MAX_TERMINALS_PER_GROUP` removed. Each tab = one full-size terminal. Splits can return later. | 2026-03-24 |

## Architecture Notes

### Current Terminal Infrastructure (Pre-Change)

| Field/Concept | Current | Target |
|---|---|---|
| `TerminalTab.ownerTabId` | Session tab ID | → `TerminalTab.projectPath` |
| `terminalPanelOpen` | Boolean toggle | → Removed (content tab controls visibility) |
| `TerminalPane` | Bottom panel with resize | → Deleted. Replaced by `ContentTabBar` + full-height `TerminalView` |
| `TerminalButton` (toolbar) | Opens/closes bottom panel | → Removed |
| `activeTerminalTabId` | One global active terminal | → Stays, but filtered by project |
| `groupId` / `splitTerminalTab` | Split pane grouping | → Removed (parked) |

### Content Tab State Model

```
activeContentTab: "chat" | terminalTabId    // which tab is displayed
projectContentTabs: Record<string, string>  // project path → last active content tab

On session switch (same project):
  → activeContentTab preserved
  → terminal tabs preserved
  → chat content changes (different session messages)

On session switch (different project):
  → save projectContentTabs[oldProject] = activeContentTab
  → restore activeContentTab = projectContentTabs[newProject] ?? "chat"
  → terminal tabs swap to new project's set
```

### Session Switching Flow (Implemented — from prior plan)

```
switchTabAction → snapshots leaving tab → clears store.sessionId →
  calls switchSession(targetTab.sessionFile) →
  ensureSession() starts fresh Pi process (stops old via server) →
  session.switchSession loads session file → refreshes state → loads messages
```

### Files Involved

| File | Lines | Role |
|------|-------|------|
| `store/workspaceSlice.ts` | ~614 | Tabs, terminal, git, plugins, projects state |
| `store/types.ts` | ~670 | All Zustand slice types — `TerminalTab`, `TerminalSlice` |
| `lib/tabActions.ts` | ~200 | Tab lifecycle (start session, switch, cleanup) |
| `lib/appActions.ts` | — | `createTerminal()`, `closeTerminal()` |
| `components/AppShell.tsx` | ~250 | Top-level layout (toolbar + chat + terminal panel) |
| `components/TerminalPane.tsx` | ~605 | Bottom panel terminal (TO BE REPLACED) |
| `components/TerminalInstance.tsx` | ~664 | xterm.js wrapper (KEEP — core rendering) |

## Gotchas & Warnings

- `TerminalInstance.tsx` (664 lines) is the xterm.js wrapper — keep it, adapt it for full-height rendering
- `TerminalPane.tsx` (605 lines) is the bottom panel with resize handle, tab strip, split groups — this gets DELETED and replaced by `ContentTabBar` + inline rendering
- `createTerminal()` in appActions calls `terminal.create` on the server, then `addTerminalTab` in the store. The server side doesn't need to change — only the client ownership model changes.
- `closeTerminal()` in appActions calls `terminal.close` on the server + `removeTerminalTab` in store. Same — server unchanged.
- `syncActiveTabState` must NOT overwrite terminal state on session switch within same project
- Terminal processes are server-side PTY sessions. They survive client-side state changes. "Keeping alive on project switch" means keeping the store entries and not calling `terminal.close`.

## Technical Context

```bash
bun run typecheck    # tsc --noEmit across all packages
bun run build        # full production build
bun run lint         # biome check
bun run format       # biome format (tabs, double quotes, semicolons)

# Dev mode (3 terminals):
bun run dev:server   # port 24242
bun run dev:web      # port 5173
# Desktop: cd apps/desktop && PIBUN_DEV=1 npx electrobun dev
```
