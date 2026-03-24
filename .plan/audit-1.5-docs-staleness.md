# Audit 1.5 — docs/ Staleness Report

> Audited: 2026-03-24
> Files examined: 8 docs, handler registry (42 methods), wsProtocol.ts (7 channels), piProcess.ts (570 lines)

---

## Summary

| Doc File | Lines | Verdict | Action |
|----------|-------|---------|--------|
| WS_PROTOCOL.md | 128 | **SEVERELY STALE** — lists 17/42 methods, 4/7 channels | Delete. Content → TSDoc in wsProtocol.ts |
| PI_INTEGRATION.md | 176 | **REDUNDANT** — restates pi-mono's rpc.md. piProcess.ts already has full TSDoc. | Delete. Useful bits → TSDoc in piProcess.ts |
| WEB_UI.md | 173 | **ASPIRATIONAL/STALE** — describes early plan, not current reality (no tabs, terminal, git, plugins, themes) | Delete. Current architecture in ARCHITECTURE.md |
| ARCHITECTURE.md | 109 | **MOSTLY CURRENT** — accurate overview, needs update for new file counts after refactoring | Keep. Update in Phase 6 (item 6.4) |
| DECISIONS.md | 106 | **REDUNDANT** — 100% duplicated in CLAUDE.md (Key Decisions + Gotchas sections) | Candidate for deletion, but out of scope for 1.5 |
| DESKTOP.md | 183 | **CURRENT** — Electrobun specifics not covered elsewhere | Keep |
| CODE_SIGNING.md | 228 | **CURRENT** — operational runbook, not duplicated | Keep |
| ROADMAP.md | 48 | **CURRENT** — delivery history + parking lot | Keep |

---

## WS_PROTOCOL.md — Detailed Findings

### Missing Methods (25 of 42 not documented)

**Session methods missing:**
- `session.exportHtml`
- `session.listSessions`
- `session.switchSession`
- `session.getForkMessages`

**Entire domains missing:**
- `project.*` (list, add, remove, update) — 4 methods
- `terminal.*` (create, write, resize, close) — 4 methods
- `git.*` (status, branch, diff, log) — 4 methods
- `app.*` (applyUpdate, checkForUpdates, openFolderDialog, setWindowTitle, saveExportFile) — 5 methods
- `settings.*` (get, update) — 2 methods
- `plugin.*` (list, install, uninstall, setEnabled) — 4 methods

### Missing Push Channels (3 of 7 not documented)
- `menu.action` — desktop menu forwarding
- `terminal.data` — PTY output streaming
- `terminal.exit` — terminal process exit

### Why delete instead of update?
The types in `packages/contracts/src/wsProtocol.ts` (933 lines) are the single source of truth. They include:
- `WS_METHODS` const object with all 42 method strings
- `WS_CHANNELS` const object with all 7 channel strings
- `WsMethodParams` mapped type linking method → params
- `WsMethodResults` mapped type linking method → result
- Full type definitions for every param and result

A separate doc file will always drift. The types cannot drift — they're enforced by the compiler.

---

## PI_INTEGRATION.md — Detailed Findings

### Accurate content:
- JSONL framing warnings (correct — don't use readline)
- Process lifecycle (spawn, shutdown)
- Command list (mostly correct, some commands may have been added in newer Pi versions)
- Event taxonomy (agent lifecycle, turn lifecycle, message streaming, tool execution)
- "What Pi handles internally" section (accurate)

### Problems:
1. **Redundant with pi-mono's rpc.md** — the authoritative reference. CLAUDE.md already says "when PI_INTEGRATION.md and pi-mono disagree, pi-mono wins"
2. **piProcess.ts has comprehensive TSDoc** — 570 lines with full documentation of lifecycle, commands, events, listeners
3. **Will drift** — every time Pi adds a new command/event, someone has to update both PI_INTEGRATION.md AND pi-mono. Nobody will.

### Useful content to preserve as TSDoc:
- The "What Pi Handles Internally" list → already in CLAUDE.md's architecture section
- JSONL framing warnings → already in CLAUDE.md's Gotchas section AND in piProcess.ts TSDoc

---

## WEB_UI.md — Detailed Findings

### Describes an early plan, not current state:
- Store shape shows 5 fields — actual store has 15 slices
- No mention of: tabs, terminal, git, plugins, themes, export, projects, notifications, updates
- Keyboard shortcuts listed don't match actual shortcuts.ts
- Component list is aspirational — actual has 27 top-level components + 6 chat + tools subdirectory
- "TanStack Router — file-based routing (optional, evaluate need)" — never adopted

### Why delete:
This is a v1 design doc. The codebase IS the documentation now. ARCHITECTURE.md covers the high-level structure.

---

## DECISIONS.md — Note

All 12 decisions + all gotchas are now in CLAUDE.md (merged in Session 1, item 1.2). DECISIONS.md is 100% redundant. However, deletion is not in the Phase 1 plan scope — could be added as a sub-item to 1.6 or deferred to Phase 6.

**Recommendation:** Delete in item 1.6 alongside the other three docs. It's pure redundancy.
