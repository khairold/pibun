# Project-Scoped Tabbed UI — Build Plan

> **Spec:** Main content area with tab bar: session chat + project-scoped terminals
> **Status:** Not Started
> **Current Phase:** —
> **Last Session:** —

---

## Context

The single-session simplification is complete. One Pi session runs at a time,
sidebar handles session navigation, empty sessions auto-cleanup.

Currently, terminals are scoped to sessions (`ownerTabId`) and render in a
resizable bottom panel (VS Code-style). This plan changes both:

1. **Terminals scoped to project** — keyed by project path, not session tab.
   Switching sessions within the same project keeps terminal tabs intact.
   Switching projects swaps to that project's terminal set (kept alive in background).

2. **Tabbed main content** — tab bar above content area. First tab is always
   the session chat. Remaining tabs are terminals. Full-height rendering
   (no bottom panel, no resize handle). Minimum: 1 chat tab + 1 terminal tab
   when a project is active.

**Mental model:** Sessions are conversations. Terminals are workspaces.
Workspaces map to projects.

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
6. Run: `bun run typecheck && bun run build`

---

## Phase 1 — Rekey Terminal State (Session → Project)

**Goal:** Terminals owned by project path, not session tab. Terminal set survives session switches within the same project.

- [ ] 1.1 — Change `TerminalTab.ownerTabId` to `TerminalTab.projectPath` in contracts type and all references. Use normalized project path (the `cwd` from the active session tab).
- [ ] 1.2 — Update `addTerminalTab` in workspaceSlice: assign `projectPath` from active tab's CWD instead of `ownerTabId` from `activeTabId`.
- [ ] 1.3 — Update all terminal filtering: replace `t.ownerTabId === activeTabId` with `t.projectPath === activeProjectPath` throughout workspaceSlice, TerminalPane, AppShell, and any other consumers.
- [ ] 1.4 — Update `removeTab` in workspaceSlice: don't delete terminals when a session tab is removed (terminals belong to the project, not the tab). Only clean up terminal selection if the active terminal belongs to a different project.
- [ ] 1.5 — Update `switchTab` in workspaceSlice: when switching to a session in the same project, preserve active terminal selection. When switching to a different project, select that project's first terminal (or null).
- [ ] 1.6 — Add `activeContentTab` state to workspaceSlice: `"chat" | string` (string = terminal tab ID). Defaults to `"chat"`. This tracks which content tab is displayed in the main area.
- [ ] 1.7 — Add `projectContentTabs: Record<string, string>` to workspaceSlice: maps project path → last active content tab. On project switch, save current, restore target's. On session switch within same project, preserve.
- [ ] 1.8 — Verify: `bun run typecheck && bun run build`. Existing terminal functionality still works (bottom panel, same project filtering).

**Exit criteria:** Terminals keyed by project path. Switching sessions within same project keeps terminals. Switching projects swaps terminal set. Type checks pass.

---

## Phase 2 — Content Tab Bar + Full-Size Terminals

**Goal:** Tab bar in main area. Chat and terminals are peer tabs. Terminals are full-height.

- [ ] 2.1 — Create `ContentTabBar` component: renders `[Chat] [Terminal 1] ... [+]`. Chat tab always first, terminal tabs from current project, plus button at end. Active tab highlighted. Close button on terminal tabs (disabled when last terminal for project).
- [ ] 2.2 — Restructure `AppShell`: insert `ContentTabBar` between toolbar and content. Content area conditionally renders ChatView+Composer (when `activeContentTab === "chat"`) or full-height terminal (when active content tab is a terminal ID).
- [ ] 2.3 — Create `TerminalView` component (or adapt `TerminalInstance`): full-height terminal rendering without resize handles or panel chrome. Takes a terminal tab ID, renders the xterm instance at 100% height.
- [ ] 2.4 — Auto-create default terminal: when a project becomes active (session started or switched to) and no terminals exist for that project path, auto-create one. This ensures the minimum "chat + 1 terminal" constraint.
- [ ] 2.5 — Wire [+] button: clicking adds a new terminal for the current project, switches to it. Wire close button: removes terminal tab (server-side `terminal.close` + store removal), selects adjacent tab, falls back to chat if last terminal closed and re-creates one.
- [ ] 2.6 — Remove `terminalPanelOpen` state, `toggleTerminalPanel`, `setTerminalPanelOpen` from TerminalSlice. Remove `TerminalButton` from AppShell toolbar. Terminal visibility is now controlled by `activeContentTab`, not a panel toggle.
- [ ] 2.7 — Update `createTerminal` in appActions: after creating server-side terminal, set `activeContentTab` to the new terminal tab ID (auto-switch to it).
- [ ] 2.8 — Verify: `bun run typecheck && bun run build`. Tab bar visible, chat and terminal tabs switch correctly, terminals are full-height.

**Exit criteria:** Tab bar renders above content. Chat tab shows session. Terminal tabs show full-height terminals. [+] adds terminals, close removes them. No bottom panel. Auto-created default terminal per project.

---

## Phase 3 — Polish & Cleanup

**Goal:** Renameable terminal tabs, keyboard shortcuts, dead code removal.

- [ ] 3.1 — Rename terminal tabs: double-click tab label → inline edit input. Update `TerminalTab.name` in store. Default name: "Terminal 1", "Terminal 2", auto-incrementing per project.
- [ ] 3.2 — Keyboard shortcuts: `Ctrl+1` = chat tab, `Ctrl+2-9` = terminal tabs by position. `Ctrl+J` = toggle between chat and last active terminal (replaces old terminal panel toggle). Add to `useKeyboardShortcuts`, `KeybindingCommand` type, default bindings.
- [ ] 3.3 — Context menu on terminal tabs: Rename, Close. Reuse existing context menu patterns from Sidebar.
- [ ] 3.4 — Delete dead `TerminalPane.tsx` (bottom panel with resize handle, tab strip, split groups — all replaced by ContentTabBar + TerminalView). Remove all imports.
- [ ] 3.5 — Clean up terminal split infrastructure: remove `groupId` from `TerminalTab`, remove `splitTerminalTab` from TerminalSlice, remove `MAX_TERMINALS_PER_GROUP`. Splits are parked — each tab is one terminal.
- [ ] 3.6 — Desktop menu updates: add content tab navigation commands. Remove old terminal panel toggle menu item if present.
- [ ] 3.7 — Final verify: `bun run typecheck && bun run build && bun run lint`.

**Exit criteria:** Terminals renameable. Keyboard navigation works. No dead terminal panel code. Clean build.

---

## Parking Lot

Carried from previous plan + new items:

- [ ] Session resume from sidebar "past sessions" — `switchSession()` approach works but may need refinement for edge cases (session file not found, CWD moved).
- [ ] Desktop menu rebuild — `file.new-tab` etc. should become `file.new-session`. Electrobun menu config is in `apps/desktop/`.
- [ ] Consider renaming `SessionTab` to `Session` or `SessionInstance`.
- [ ] Terminal splits within a tab — currently parked (removed in 3.5). Could return as a feature: split a terminal tab into side-by-side panes. But tabs-first is the right default.
- [ ] Terminal drag-to-reorder — reorder terminal tabs in the tab bar. Low priority.
- [ ] Terminal persistence across app restarts — save project→terminal mapping, reconnect on restart.
