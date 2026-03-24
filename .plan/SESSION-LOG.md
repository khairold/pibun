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
