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
| 13 | `removeTab` + `cleanupEmptyTab` no longer delete project terminals | Fixed in 1.4. `removeTab` keeps all `terminalTabs` intact, only updates `activeTerminalTabId` and `terminalPanelOpen` based on the new active tab's project. `cleanupEmptyTab` no longer calls `terminal.close` on the server. | 2026-03-24 |
| 14 | `switchTab` uses same-project vs cross-project logic | Same project → preserve `activeTerminalTabId` and `activeContentTab`. Cross-project → save/restore via `projectContentTabs`, select first terminal for target project. Both use `leavingTab.cwd === targetTab.cwd` check with empty-string guard. | 2026-03-24 |
| 15 | `activeContentTab` + `projectContentTabs` added to TerminalSlice | `activeContentTab: string` ("chat" or terminal tab ID). `projectContentTabs: Record<string, string>` maps project path → last content tab. `setActiveContentTab` also persists to the map for the current project. | 2026-03-24 |
| 16 | `removeTerminalTab` falls back `activeContentTab` to "chat" | If the removed terminal was the `activeContentTab`, resets to "chat". Prevents stale terminal tab ID in content display. | 2026-03-24 |
| 17 | Content area uses absolute positioning + `hidden` for tab switching | Chat content and each terminal instance are `absolute inset-0` inside a `relative flex-1 min-h-0` container. Inactive layers use Tailwind `hidden` (display:none). This preserves xterm.js instances and their screen buffers across tab switches. ResizeObserver fires when hidden→visible transition occurs, so fitAddon re-fits correctly. | 2026-03-25 |
| 18 | No separate `TerminalView` component — TerminalInstance is sufficient | TerminalInstance already renders full-height without resize handles or panel chrome. AppShell wraps each in an absolute-positioned div with `hidden` toggling. Creating a thin `TerminalView` wrapper would violate deep modules convention with no added value. | 2026-03-25 |
| 19 | Auto-create terminal uses `pendingAutoCreateRef` guard | `useEffect` in AppShell watches `activeProjectPath` + `connectionStatus` + `projectTerminals.length`. Guard ref prevents double-creation during React strict mode. After creation, `setActiveContentTab("chat")` restores chat (since `createTerminal` now auto-switches). | 2026-03-25 |
| 20 | `createTerminal` auto-switches `activeContentTab` | After server-side terminal creation, `createTerminal()` calls `setActiveContentTab(tabId)` to switch the content area to the new terminal. Auto-create in AppShell overrides this back to "chat" since the user didn't request it. | 2026-03-25 |
| 21 | `removeTerminalTab` selects adjacent terminal, not always "chat" | When the removed terminal was `activeContentTab`, the new `activeContentTab` is set to the next `activeTerminalTabId` (adjacent terminal in same project). Only falls back to "chat" when no project terminals remain. | 2026-03-25 |

## Architecture Notes

### Current Terminal Infrastructure (Post 1.1-1.3)

| Field/Concept | Current | Target |
|---|---|---|
| `TerminalTab.projectPath` | Active tab CWD (was `ownerTabId`) | ✅ Done |
| `terminalPanelOpen` | Boolean toggle | → Removed (content tab controls visibility) |
| `TerminalPane` | Bottom panel with resize | → Deleted. Replaced by `ContentTabBar` + full-height `TerminalView` |
| `TerminalButton` (toolbar) | Opens/closes bottom panel | → Removed |
| `activeTerminalTabId` | One global active terminal | → Stays, but filtered by project |
| `groupId` / `splitTerminalTab` | Split pane grouping | → Removed (parked) |

### Content Tab State Model (Implemented — items 1.5–1.7)

```
// State fields in TerminalSlice:
activeContentTab: string            // "chat" | terminalTabId — which tab is displayed
projectContentTabs: Record<string, string>  // project path → last active content tab

// setActiveContentTab(tab) also persists: projectContentTabs[currentProject] = tab

On session switch (same project — leavingTab.cwd === targetTab.cwd):
  → activeContentTab preserved (no save/restore)
  → activeTerminalTabId preserved
  → chat content changes (messages cleared, reloaded from Pi)

On session switch (different project):
  → save projectContentTabs[leavingProject] = activeContentTab
  → restore activeContentTab = projectContentTabs[targetProject] ?? "chat"
  → validate restored content tab — if terminal no longer exists, fall back to "chat"
  → activeTerminalTabId = first terminal in target project (or null)

On removeTab (active tab removed, switching to next):
  → same project: preserve activeContentTab + activeTerminalTabId
  → different project: save/restore via projectContentTabs (same as switchTab)
  → no tabs left: activeContentTab = "chat"

On removeTerminalTab:
  → if removed terminal was activeContentTab → fall back to "chat"
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
| `store/types.ts` | ~670 | All Zustand slice types — `TerminalTab` (now has `projectPath`), `TerminalSlice` |
| `lib/tabActions.ts` | ~200 | Tab lifecycle (start session, switch, cleanup) |
| `lib/appActions.ts` | — | `createTerminal()`, `closeTerminal()` |
| `components/AppShell.tsx` | ~250 | Top-level layout (toolbar + chat + terminal panel) |
| `components/ContentTabBar.tsx` | ~240 | Content tab bar: Chat + project terminals + [+] button |
| `components/AppShell.tsx` | ~290 | Top-level layout — now includes ContentTabBar + content switcher (absolute-positioned layers for chat vs terminal) |
| `components/TerminalPane.tsx` | ~605 | Bottom panel terminal (legacy — still rendered inside chat layer, removed in 2.6) |
| `components/TerminalInstance.tsx` | ~664 | xterm.js wrapper (KEEP — used both by TerminalPane and by AppShell's full-height terminal layers) |

## Gotchas & Warnings

- `TerminalInstance.tsx` (664 lines) is the xterm.js wrapper — keep it, adapt it for full-height rendering
- `TerminalPane.tsx` (605 lines) is the bottom panel with resize handle, tab strip, split groups — this gets DELETED and replaced by `ContentTabBar` + inline rendering
- `createTerminal()` in appActions calls `terminal.create` on the server, then `addTerminalTab` in the store. The server side doesn't need to change — only the client ownership model changes.
- `closeTerminal()` in appActions calls `terminal.close` on the server + `removeTerminalTab` in store. Same — server unchanged.
- `syncActiveTabState` must NOT overwrite terminal state on session switch within same project
- `getActiveTab()?.cwd ?? ""` is the canonical way to get the active project path for terminal matching. In React selectors, use `s.tabs.find(t => t.id === s.activeTabId)?.cwd ?? ""` to avoid function calls inside selectors.
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
