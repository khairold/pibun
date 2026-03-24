# Session Log

> Chronological record of each build session.

---

## Session 0 — Planning (2026-03-24)

**What happened:**
- Completed single-session simplification plan (3 phases, 21 items, 10 sessions)
- Brainstormed project-scoped tabbed UI design
- Created new plan: 3 phases (~23 items)
  - Phase 1: Rekey terminal state (session → project)
  - Phase 2: Content tab bar + full-size terminals
  - Phase 3: Polish & cleanup (rename, shortcuts, dead code)

**Carried forward from prior plan:**
- Session ID domains (PiBun manager ID vs Pi UUID)
- Session switching flow (switchTabAction → switchSession)
- Empty session auto-removal
- Session naming priority
- Parking lot: session resume edge cases, desktop menu rebuild, SessionTab rename

**Items completed:**
- [x] Prior plan cleared
- [x] New plan created

**Handoff to next session:**
- Start with Phase 1.1 — change `TerminalTab.ownerTabId` to `TerminalTab.projectPath`
- Key files: `packages/contracts/src/` (types), `apps/web/src/store/types.ts`, `apps/web/src/store/workspaceSlice.ts`
- Grep for `ownerTabId` to find all references
- `TerminalPane.tsx` filters terminals by `ownerTabId === activeTabId` — this is a critical reference to update

---

## Session 1 — Rekey Terminal State: ownerTabId → projectPath (2026-03-24)

**What happened:**
- Changed `TerminalTab.ownerTabId` to `TerminalTab.projectPath` in `store/types.ts`
- Updated `addTerminalTab` and `splitTerminalTab` to derive `projectPath` from `getActiveTab()?.cwd` instead of `activeTabId`
- Updated all terminal filtering across 6 files to use `projectPath` matching instead of `ownerTabId` matching:
  - `store/workspaceSlice.ts` — `removeTab`, `switchTab`, `addTerminalTab`, `removeTerminalTab`, `splitTerminalTab`
  - `components/AppShell.tsx` — `TerminalButton` has-terminals check
  - `components/TerminalPane.tsx` — terminal tab filtering (current project vs other projects)
  - `wireTransport.ts` — menu action terminal toggle
  - `hooks/useKeyboardShortcuts.ts` — split terminal and toggle terminal shortcuts
  - `lib/tabActions.ts` — `cleanupEmptyTab` terminal cleanup

**Items completed:**
- [x] 1.1 — Change `TerminalTab.ownerTabId` to `TerminalTab.projectPath`
- [x] 1.2 — Update `addTerminalTab` to assign `projectPath` from active tab's CWD
- [x] 1.3 — Update all terminal filtering to use `projectPath === activeProjectPath`

**Issues encountered:**
- Items 1.1-1.3 had to be done atomically — changing the type without updating assignment and filtering would leave uncompilable code. Combined all three in one iteration.
- `removeTab` and `cleanupEmptyTab` still delete terminals by project path (not by tab ID). This means if two sessions share a project, removing one session's tab deletes ALL project terminals. Acceptable for now since the app is single-session, but 1.4 must fix this.

**Handoff to next session:**
- Next: 1.4 — Update `removeTab` in workspaceSlice: don't delete terminals when a session tab is removed
- Key insight: `removeTab` currently filters `t.projectPath !== removedCwd` which removes ALL terminals for that project. 1.4 should simply stop removing terminals entirely (they belong to the project).
- `cleanupEmptyTab` in `tabActions.ts` also closes terminals by project — same fix needed there.

---

## Session 2 — removeTab: don't delete terminals on tab removal (2026-03-24)

**What happened:**
- Updated `removeTab` in `workspaceSlice.ts` to stop deleting terminals when a session tab is removed
  - Removed `terminalTabs` filtering by `projectPath` — terminals stay in the store
  - Removed `activeTerminalOwned` clearing logic (was tied to deleted terminals)
  - Updated `terminalPanelOpen` check: now looks at the NEW active tab's project terminals, not the global terminal count
  - When switching to next tab (after active tab removal), still correctly selects first terminal from next tab's project
- Updated `cleanupEmptyTab` in `tabActions.ts` to stop closing terminals on the server
  - Removed the loop that called `terminal.close` for all project-matching terminals
  - Terminals now survive empty session cleanup

**Items completed:**
- [x] 1.4 — Update `removeTab`: don't delete terminals on session tab removal

**Issues encountered:**
- None. Clean change — the terminal panel open/close logic needed adjustment since it previously checked `newTerminalTabs.length === 0` (which was the filtered list). Now it checks terminals matching the new active tab's project path.

**Handoff to next session:**
- Next: 1.5 — Update `switchTab` in workspaceSlice: preserve terminal selection on same-project switch, swap on different-project switch
- Key insight: `switchTab` currently always selects "first terminal in target tab's project" — this is correct for cross-project switches but wrong for same-project switches (should preserve current `activeTerminalTabId`)

---
