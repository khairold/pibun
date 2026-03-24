# Single-Session Simplification — Build Plan

> **Spec:** Simplify from multi-tab-session to single-active-session model
> **Status:** Not Started
> **Current Phase:** —
> **Last Session:** —

---

## Context

The UI moved to a sidebar-based session navigator (sessions listed under projects),
but the internal data model still treats every session as a "tab" with full
multi-session machinery — separate Pi processes, message caching, tab switching
with save/restore, background event routing. This complexity causes UX gaps:
two sessions appearing "active", empty session cleanup confusion, naming issues.

**Target model:**
- ONE Pi session active at a time
- Sidebar lists sessions under projects; clicking switches
- Switching away from an empty session auto-removes it
- Switching to a past session stops the current one, starts the new one
- Terminal tabs exist WITHIN a session (kept, but scoped to the single session)
- No background tab event routing — events always go to the active session

**What stays:** `SessionTab` as a data type (it's a fine session container).
`tabActions.ts` as the coordinator. Terminal tabs within a session.

**What goes:** Multi-session message caching (`tabMessages`), background tab
status tracking (`tabStatuses`, `tabWidgets`), `keepExisting` flag,
`bgTab` event routing branch, tab reorder, tab close (replaced by session switch).

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

## Phase 1 — Single-Session Enforcement

**Goal:** Only one Pi process runs at a time. Switching sessions stops the old, starts the new.

- [ ] 1.1 — `createNewTab` → `startSession`: stop any existing session before starting a new one. Remove `keepExisting` param. The server's `session.start` handler already supports this (it stops old session when `keepExisting` is false).
- [ ] 1.2 — Remove background event routing in `wireTransport.ts`: delete the `else` branch in the `pi.event` handler that routes to `bgTab`. All events go to `handlePiEvent` (single session = always active).
- [ ] 1.3 — Remove `tabMessages`, `tabStatuses`, `tabWidgets` caches from `workspaceSlice`. No save/restore on switch — messages live in the store directly. On switch, clear messages and load from Pi via `session.getMessages`.
- [ ] 1.4 — Simplify `switchTab` in workspaceSlice: no message save/restore. Just update `activeTabId`, set session metadata. The async load happens in the action layer.
- [ ] 1.5 — Simplify `switchTabAction` in tabActions: stop current session → switch tab → start new session (or resume existing) → load messages + refresh state.
- [ ] 1.6 — Remove `reorderTabs`, `setBackgroundTabStatus`, `setBackgroundTabWidget`, `tabTerminalActiveIds` — all multi-session-only features.
- [ ] 1.7 — Verify: `bun run typecheck && bun run build`. Fix any broken references.

**Exit criteria:** Only one Pi process runs. Switching sessions stops the old one. No background event routing. All type checks pass.

---

## Phase 2 — Session Lifecycle UX

**Goal:** Empty sessions auto-cleanup, proper naming, clean sidebar states.

- [ ] 2.1 — Auto-remove empty sessions: when switching away from a session with zero messages, stop its Pi process and remove the tab. Implement in `switchTabAction` before switching.
- [ ] 2.2 — Default name empty string, sidebar shows "New session" as fallback (already partially done — finish wiring).
- [ ] 2.3 — Auto-name from first user message: `syncActiveTabState` already syncs `firstMessage`. Verify display priority: Pi session name > first message > "New session".
- [ ] 2.4 — Single active highlight: only the `activeTabId` tab gets the accent border/bg. Running indicator removed (only one session runs, and it's always the active one).
- [ ] 2.5 — "New session" button on project: if active tab is same project and empty (0 messages), reuse it instead of creating another empty session.
- [ ] 2.6 — Session count badge on projects: count should only include sessions with messages (exclude the empty "new session" placeholder).

**Exit criteria:** No orphan empty sessions. Names update automatically. One visual "active" state. Clean UX flow for new session → type → switch → return.

---

## Phase 3 — Cleanup & Simplify Types

**Goal:** Remove dead code paths, simplify types, reduce surface area.

- [ ] 3.1 — Remove `TabsSlice` fields that are now unused: `tabMessages`, `tabStatuses`, `tabWidgets`, `tabTerminalActiveIds`, `reorderTabs`, `setBackgroundTabStatus`, `setBackgroundTabWidget`, `saveActiveTabMessages`.
- [ ] 3.2 — Simplify `SessionTab` type: remove `hasUnread` (no background tabs to go unread). Keep `piSessionId`, `sessionId`, `cwd`, `model`, `thinkingLevel`, `status`, `name`, `firstMessage`, `messageCount`, `createdAt`.
- [ ] 3.3 — Clean up `wireTransport.ts`: remove `bgTab` references, simplify `pi.event` handler. Remove `hasUnread` update logic.
- [ ] 3.4 — Clean up `useKeyboardShortcuts`: remove `newTab`/`closeTab`/`nextTab`/`prevTab`/`jumpToTab` shortcuts — these are multi-tab concepts. Keep `newSession` (creates session in active project).
- [ ] 3.5 — Clean up menu handler in `wireTransport.ts`: remove `file.new-tab`, `file.close-tab`, `file.next-tab`, `file.prev-tab` menu actions.
- [ ] 3.6 — Remove `closeTab` from `tabActions.ts` — replaced by session switching (old session auto-stops). Keep the function if terminal close needs it, or inline the cleanup.
- [ ] 3.7 — Delete dead keybinding commands from `domain.ts` `KeybindingCommand` type: `closeTab`, `newTab`, `nextTab`, `prevTab`, `jumpToTab1-9`.
- [ ] 3.8 — Final verify: `bun run typecheck && bun run build && bun run lint`.

**Exit criteria:** No dead tab-switching code. Types reflect single-session model. Clean build with no warnings from our code.

---

## Parking Lot

- [ ] Terminal tabs should eventually be scoped to the session (when session stops, terminals close). Currently they use `ownerTabId` — this still works since "tab" = session container.
- [ ] Session resume from sidebar "past sessions" — currently uses `session.switchSession` which is an in-process Pi command. With single-session (stop old, start new), this may need to become: stop old process → start new process with CWD → switch to session file. Assess during Phase 1.5.
- [ ] Desktop menu rebuild — `file.new-tab` etc. should become `file.new-session`. Electrobun menu config is in `apps/desktop/`.
- [ ] Consider renaming `SessionTab` to `Session` or `SessionInstance` after the refactor stabilizes.
