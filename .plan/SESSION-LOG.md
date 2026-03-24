# Session Log

> Chronological record of each build session.

---

## Session 0 — Planning (2026-03-24)

**What happened:**
- Audited session creation bug: events silently dropped due to session ID domain mismatch
- Fixed root cause: introduced `piSessionId` field to separate Pi UUID from PiBun manager ID (commit `059d862`)
- Fixed `ensureSession` to pass active tab CWD for project-scoped sessions
- Removed dead `NewSessionButton.tsx`
- Discussed UX issues: two active sessions, bad default names, orphan empty sessions
- Decided to simplify from multi-tab to single-active-session model
- Created phased plan (3 phases, ~21 items)

**Items completed:**
- [x] Root cause fix for event routing
- [x] Plan created

**Handoff to next session:**
- Start with Phase 1 — single-session enforcement
- Key risk: `session.switchSession` (Pi in-process command) vs stop/start (new process). Need to decide which approach for resuming past sessions. See Parking Lot.
- The `defaultTabName()` change to empty string was made but not committed — Phase 2.2 will finish it.
