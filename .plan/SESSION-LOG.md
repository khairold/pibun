# Session Log

> Chronological record of each build session.

---

## Session 0 — Audit & Planning (2026-03-24)

**What happened:**
- Thoroughly explored all 3 reference repos:
  - **T3Code**: ~250 source files, full UI/UX audit. Key findings: rich composer (file mentions, slash commands, terminal context), activity timeline with work groups, per-turn diff panel, native context menus, settings page, configurable keybindings, multi-select threads, project DnD reorder, PR status indicators.
  - **Pi-mono**: Full RPC protocol audit (rpc.md). Identified 12 unexposed Pi features: steering/follow-up modes, bash execution, auto-retry/compaction control, get_commands, cycle_model/thinking, extension UI fire-and-forget methods.
  - **Electrobun**: Native API audit. Identified 10 leverageable features: context menus, tray icon, full updater with bsdiff, multi-window, session storage, navigation rules, window events.
- Compared against current PiBun (31K lines, 42 WS methods, 5 Zustand slices)
- Identified ~50 feature gaps across 5 categories
- Created 5-phase build plan with 60 items

**Items completed:**
- [x] Audit T3Code reference repo
- [x] Audit Pi-mono RPC protocol
- [x] Audit Electrobun capabilities
- [x] Gap analysis (PiBun vs T3Code vs Pi features)
- [x] Created `.plan/PLAN.md` (v3)
- [x] Created `.plan/MEMORY.md` (v3)
- [x] Created `.plan/DRIFT.md` (v3)
- [x] Created `.plan/SESSION-LOG.md` (v3)

**Handoff to next session:**
- Start with Phase 1A (scroll, performance, persistence)
- Read `reference/t3code/apps/web/src/chat-scroll.ts` before implementing 1A.1
- Read `reference/t3code/apps/web/src/composerDraftStore.ts` before implementing 1A.4
- The existing `useAutoScroll` hook (MEMORY-v2 #79) will be replaced, not modified
- `react-virtuoso` is already installed and active — work with it for scroll improvements

---

## Session 1 — Pointer-aware scroll system (2026-03-24)

**What happened:**
- Read T3Code's `chat-scroll.ts` and `MessagesTimeline.tsx` for scroll patterns
- T3Code uses `@tanstack/react-virtual` with `shouldAdjustScrollPositionOnItemSizeChange`; PiBun uses `react-virtuoso` with `followOutput`/`atBottomStateChange` — different approach needed
- Discovered `useAutoScroll.ts` was dead code (defined but never imported in ChatView). ChatView already used Virtuoso's built-in scroll APIs directly
- Created new `useChatScroll` hook with pointer-aware scroll intent detection:
  - Tracks `isInteractingRef` (pointer/wheel/touch active) and `userScrolledAwayRef` (user intentionally scrolled up)
  - `followOutput` consults both flags: suppresses auto-scroll during interaction or after user scrolls away
  - `handleAtBottom` only sets "scrolled away" when user is interacting AND not at bottom (prevents content-growth from triggering false positives)
  - Interaction cooldown (150ms) prevents micro-gaps between wheel events from falsely clearing state
  - `containerProps` spread onto parent div for event delegation (no need for Virtuoso scroller ref)
- Wired hook into ChatView, replacing inline `useState`/`useCallback` scroll logic
- Deleted old unused `useAutoScroll.ts`

**Items completed:**
- [x] 1A.1 — Replace `useAutoScroll` with pointer-aware scroll system

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1A.2 — Audit all Zustand selectors for referential stability
- The `useChatScroll` hook returns `containerProps` that must be spread on the scroll container's parent — this pattern is established, follow it if adding more scroll containers

---

## Session 2 — Zustand selector stability audit (2026-03-24)

**What happened:**
- Audited all 121 `useStore()` selectors across 30+ components
- All selectors use direct property access (`s => s.field`) — no derived selectors creating new objects/arrays
- Confirmed individual scalar selectors are the optimal Zustand pattern — `useShallow` consolidation would be WORSE (more work per state change)
- Found one real issue: `ChatView.footer` callback captured `messages` array, causing callback recreation on every streaming delta (text_delta, thinking_delta, tool_execution_update)
- Fixed by extracting `anyMessageStreaming = useMemo(() => hasStreamingMessage(messages), [messages])` — a boolean that only changes when streaming starts/stops, keeping the footer callback stable during content streaming
- Verified `statuses` (Map) and `activePluginPanels` (Set) selectors are fine — references only change on actual mutation
- Verified `PluginPanel.tsx` already uses `useMemo` for derived panel lists — correct pattern

**Items completed:**
- [x] 1A.2 — Audit all Zustand selectors for referential stability

**Issues encountered:**
- None. The codebase was already well-structured — the original selector pattern was correct by design. Only the footer callback needed fixing.

**Handoff to next session:**
- Next: 1A.3 — Add debounced localStorage persistence for key UI state
- The store pattern is validated: use individual `useStore(s => s.field)` selectors for scalars, `useMemo` for derived values
- `useShallow` from `zustand/react/shallow` is available but not needed for current patterns
