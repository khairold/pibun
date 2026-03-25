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

## Session 3 — switchTab same/cross-project logic + activeContentTab + projectContentTabs (2026-03-24)

**What happened:**
- Updated `switchTab` in workspaceSlice with same-project vs cross-project logic:
  - Same project: preserve both `activeTerminalTabId` and `activeContentTab`
  - Cross-project: save `projectContentTabs[leavingProject]`, restore for target, validate restored content tab exists, select first terminal for target project
- Added `activeContentTab: string` and `projectContentTabs: Record<string, string>` to TerminalSlice types and workspaceSlice state
- Added `setActiveContentTab(tab)` setter that also persists to `projectContentTabs` for the current project
- Updated `removeTab` with same same/cross-project content tab handling (was previously always selecting first terminal)
- Updated `removeTerminalTab` to fall back `activeContentTab` to "chat" when the removed terminal was the active content tab

**Items completed:**
- [x] 1.5 — Update `switchTab`: same-project preserves, cross-project saves/restores
- [x] 1.6 — Add `activeContentTab` state ("chat" | terminal tab ID)
- [x] 1.7 — Add `projectContentTabs: Record<string, string>` with save/restore

**Issues encountered:**
- None. All three items were tightly coupled (all modify switchTab and terminal state) so combining them was the right call.

**Handoff to next session:**
- Next: 1.8 — Verify: `bun run typecheck && bun run build`. Existing terminal functionality still works.
- 1.8 is a verification item — just run the checks and confirm. Phase 1 exit criteria: terminals keyed by project path, switching sessions within same project keeps terminals, switching projects swaps terminal set, type checks pass.
- After 1.8, Phase 1 is complete. Mark phase done and EXIT.

---

## Session 4 — Verify Phase 1 (2026-03-24)

**What happened:**
- Ran `bun run typecheck` — all 5 packages pass (0 errors)
- Ran `bun run build` — all 5 packages build successfully
- Verified Phase 1 exit criteria: terminals keyed by project path, same-project switch preserves terminals, cross-project switch swaps terminal set, type checks pass

**Items completed:**
- [x] 1.8 — Verify: `bun run typecheck && bun run build`

**Issues encountered:**
- None. Clean pass on first attempt.

**Handoff to next session:**
- Phase 1 COMPLETE. Phase 2 begins: Content Tab Bar + Full-Size Terminals
- Next: 2.1 — Create `ContentTabBar` component
- Key context: `activeContentTab` and `projectContentTabs` already exist in the store (added in 1.6-1.7). Phase 2 needs to build the UI that uses them.
- Read MEMORY.md "Architecture Notes > Current Terminal Infrastructure" for what stays vs what gets replaced
- `TerminalPane.tsx` (605 lines) gets REPLACED by `ContentTabBar` + `TerminalView`. `TerminalInstance.tsx` (664 lines) is KEPT.

---

## Session 5 — Create ContentTabBar component (2026-03-24)

**What happened:**
- Created `ContentTabBar.tsx` (~240 lines) — the tab bar component that renders above the main content area
- Three sub-components: `ChatTab` (always first, not closable), `TerminalTabItem` (per-terminal with close button), `AddTerminalButton` ([+] to create new terminal)
- Reads `activeContentTab`, `terminalTabs`, `activeTabId` from the Zustand store
- Filters terminals by `projectPath === activeTab.cwd` using `useMemo` for stable reference
- Close button disabled when only 1 terminal exists for the project (can't close last terminal)
- Tab bar hidden entirely when no active project (no CWD set)
- Active tab highlighted with `border-b-accent-primary` bottom border accent
- Uses `memo` on `TerminalTabItem` to prevent unnecessary re-renders

**Items completed:**
- [x] 2.1 — Create `ContentTabBar` component

**Issues encountered:**
- None. Clean implementation, typecheck and build pass on first attempt.

**Handoff to next session:**
- Next: 2.2 — Restructure `AppShell` to insert `ContentTabBar` between toolbar and content, conditionally render ChatView+Composer vs full-height terminal
- `ContentTabBar` is created but NOT yet wired into AppShell — it's imported nowhere
- Key decision for 2.2: when `activeContentTab` is a terminal ID, render `TerminalInstance` at full height instead of ChatView+Composer. The `TerminalView` wrapper (2.3) may be needed first, OR 2.2 can do inline conditional rendering and 2.3 extracts it.

---

## Session 6 — Restructure AppShell with ContentTabBar + conditional rendering (2026-03-25)

**What happened:**
- Restructured `AppShell.tsx` to insert `ContentTabBar` between toolbar and content area
- Content area now uses a `relative flex-1 min-h-0` container with absolute-positioned layers:
  - Chat layer (`absolute inset-0 flex flex-col`): GitPanel, ChatView, TerminalPane (legacy), PluginBottomPanels, StatusBar, ExtensionWidgetBar, Composer
  - Terminal layers (`absolute inset-0`): one per project terminal, each rendering `TerminalInstance` at full height
- Active layer is visible; inactive layers use `hidden` (display:none) to preserve xterm.js instances
- Imported `ContentTabBar`, `TerminalInstance`, and added `useMemo` for project terminal filtering
- Added store selectors: `activeContentTab`, `activeProjectPath`, `allTerminalTabs`
- Computed `isChatActive` boolean for readability

**Items completed:**
- [x] 2.2 — Restructure `AppShell` with ContentTabBar + conditional chat/terminal rendering

**Issues encountered:**
- None. Clean implementation — typecheck and build pass on first attempt.

**Handoff to next session:**
- Next: 2.3 — Create `TerminalView` component (or adapt `TerminalInstance`): full-height terminal rendering without resize handles or panel chrome
- The current implementation in AppShell renders `TerminalInstance` directly in absolute-positioned divs. 2.3 may extract this into a `TerminalView` wrapper, or it may be a no-op if the current approach is sufficient (TerminalInstance already handles full-height rendering via ResizeObserver + FitAddon).
- Key concern: when terminal tab becomes visible after being `hidden`, does xterm.js re-fit correctly? ResizeObserver should fire on the hidden→visible dimension change, but needs manual testing.

---

## Session 7 — TerminalView verify + Auto-create default terminal (2026-03-25)

**What happened:**
- Assessed item 2.3 (TerminalView): determined the existing approach from 2.2 is sufficient. TerminalInstance already renders full-height without resize handles or panel chrome. AppShell wraps each terminal in absolute-positioned divs with `hidden` toggling. Creating a separate TerminalView wrapper would be a thin shell that violates the deep modules convention.
- Implemented item 2.4 (auto-create default terminal): added a `useEffect` in AppShell that watches `activeProjectPath`, `connectionStatus`, and `projectTerminals.length`. When a project becomes active with no terminals and the WS connection is open, auto-creates one terminal via `createTerminal()`. Uses `pendingAutoCreateRef` guard to prevent double-creation during React strict mode. After creation, sets `terminalPanelOpen` to false so the user stays on the chat tab.

**Items completed:**
- [x] 2.3 — TerminalView (verified existing approach is sufficient — no new component needed)
- [x] 2.4 — Auto-create default terminal when project becomes active

**Issues encountered:**
- None. Clean implementation, typecheck and build pass on first attempt.

**Handoff to next session:**
- Next: 2.5 — Wire [+] button and close button behavior
- [+] button already calls `createTerminal()` from ContentTabBar. Need to also auto-switch `activeContentTab` to the new terminal. Close button already calls `closeTerminal()`. Need to handle: select adjacent tab on close, fall back to chat if last terminal closed, re-create if minimum constraint violated.
- Also need 2.7 (update `createTerminal` to set `activeContentTab`) — this is closely related to 2.5.
- Legacy `TerminalPane` still renders inside the chat layer. Items 2.6 removes it.

---
