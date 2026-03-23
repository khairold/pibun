# Session Log

> Chronological record of each build session.
> Previous sessions (1–51): `.plan/archive/SESSION-LOG-v1.md`

---

## Session 57 — Wire close tab (2026-03-23)

**What happened:**
- Added `closeTab()` async function to `apps/web/src/lib/tabActions.ts` — coordinates Pi session stop with tab removal
- Flow: find tab → temporarily route transport to its session → abort streaming if active → `session.stop` → determine next tab + check cache → `removeTab` from store → route transport to new active tab → fetch messages if cache empty → refresh session state
- Key design decisions: session stop failures don't block tab removal (no orphan UI), transport routing is temporarily swapped for background tab closes then restored, last-tab close clears transport active session (→ empty state)
- Updated `TabBar.tsx` `handleCloseTab` to use `closeTab()` instead of raw `removeTab()` — close button now properly stops the Pi process before removing the tab
- Removed unused `removeTab` selector from TabBar component

**Items completed:**
- [x] 1.7 — Wire close tab: stops Pi process via `session.stop`, removes tab, switches to adjacent tab (or empty state if last tab)

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1.8 — Tab drag-to-reorder (optional polish)
- `closeTab()` handles all edge cases: active tab close (switches to adjacent), background tab close (no switch needed), last tab close (empty state), streaming tabs (aborts first), session-less tabs (no stop needed)
- Key files: `apps/web/src/lib/tabActions.ts` (close/create/switch), `apps/web/src/components/TabBar.tsx` (UI), `apps/web/src/store/tabsSlice.ts` (store-level removal + adjacent switching)

---

## Session 56 — Wire new tab creation (2026-03-23)

**What happened:**
- Added `createNewTab()` async function to `apps/web/src/lib/tabActions.ts` — coordinates tab creation with Pi process spawning
- Flow: creates tab → switches to it (saves current tab's messages) → clears messages → starts Pi session with `keepExisting: true` → associates session with tab → routes transport → refreshes session state → syncs tab metadata
- On failure (session start error), removes the orphan tab and shows error via `setLastError`
- Accepts optional `{ cwd }` parameter for folder-specific sessions (can be used by "Open Folder" flow later)
- Updated `TabBar.tsx` "+" button to use `createNewTab()` instead of raw `addTab() + switchTabAction()` — the "+" button now spawns a real Pi process for the new tab

**Items completed:**
- [x] 1.6 — Wire new tab: creates new Pi process via `session.start`, adds tab, switches to it

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1.7 — Wire close tab: stops Pi process via `session.stop`, removes tab, switches to adjacent tab (or empty state if last tab)
- The `removeTab` in `tabsSlice.ts` already handles UI-level tab removal + adjacent tab switching. 1.7 needs to add the Pi process cleanup (`session.stop`) before removing the tab.
- `TabBar.tsx` `handleCloseTab` currently calls raw `removeTab(tabId)` without stopping the Pi session — needs a `closeTab()` action in `tabActions.ts`.

---

## Session 55 — Wire tab switching (2026-03-23)

**What happened:**
- Created `apps/web/src/lib/tabActions.ts` — async tab switching action that coordinates store, transport, and Pi message loading
- `switchTabAction(tabId)`: (1) calls `tabsSlice.switchTab` to save/restore messages, (2) calls `transport.setActiveSession()` to route WS requests to correct Pi process, (3) fetches messages from Pi via `get_messages` when cache is empty, (4) refreshes session state (model, thinking, etc.) from Pi
- Updated `wireTransport.ts` pi.event routing: events are now filtered by sessionId — only active tab's session events dispatch to the messages store. Background tab events only update tab streaming indicator.
- Updated `TabBar.tsx` to use `switchTabAction` instead of raw `tabsSlice.switchTab` for full async coordination
- Added tab creation hooks into session start flow: `sessionActions.ts` has inline `ensureTabExists()` + `linkSessionToActiveTab()` helpers, `Composer.tsx` also creates/associates tabs on first session start
- Exported `loadSessionMessages()` and `refreshSessionState()` from sessionActions (previously internal)
- Avoided circular dependency: tabActions → sessionActions (one-way), tab creation in sessionActions is inlined (no import from tabActions)

**Items completed:**
- [x] 1.5 — Wire tab switching: switching tab saves current messages to tab state, loads target tab's messages from Pi via `get_messages`

**Issues encountered:**
- Circular dependency between tabActions.ts ↔ sessionActions.ts detected early and resolved by inlining tab creation helpers in sessionActions.ts
- Zustand `getState()` snapshot stale after mutations — Composer re-reads state after tab creation mutations

**Handoff to next session:**
- Next: 1.6 — Wire new tab: creates new Pi process via `session.start`, adds tab, switches to it
- The TabBar "+" button currently creates a tab and switches to it, but doesn't start a Pi session. Item 1.6 needs to: (1) create a new tab, (2) call `session.start` with `keepExisting: true`, (3) associate the new session with the tab, (4) switch to it. May also need to update Composer's `ensureSession` to handle the case where a tab exists but has no sessionId.
- Key files: `apps/web/src/lib/tabActions.ts`, `apps/web/src/lib/sessionActions.ts`, `apps/web/src/components/TabBar.tsx`, `apps/web/src/wireTransport.ts`

---

## Session 54 — TabBar component (2026-03-23)

**What happened:**
- Built `TabBar` component at `apps/web/src/components/TabBar.tsx` — horizontal tab strip for multi-session UI
- `TabItem` (memoized) renders each tab with: session name (truncated), model badge (shortened provider prefix), streaming indicator (pulsing blue dot), close button (visible on hover for inactive, always for active)
- TabBar auto-hides when ≤1 tab, shows "+" new tab button, scrollable overflow
- Outer tab element uses `<div role="tab">` (not `<button>`) to allow nested close `<button>` — valid HTML
- `shortModelName()` strips `claude-`/`gpt-`/`gemini-` prefixes, truncates at 12 chars
- Integrated TabBar into AppShell at top of main area (above ConnectionBanner/ErrorBanner)
- Fixed Biome lint: `useSemanticElements` required `<button>` instead of `<span role="button">` for close button
- Ran `bun run format` for Biome auto-formatting

**Items completed:**
- [x] 1.4 — Build `TabBar` component

**Issues encountered:**
- Nested `<button>` inside `<button>` is invalid HTML — restructured to `<div role="tab">` with keyboard handling as outer container

**Handoff to next session:**
- Next: 1.5 — Wire tab switching: switching tab saves current messages to tab state, loads target tab's messages from Pi via `get_messages`
- TabBar is purely visual right now. `addTab` and `switchTab` call the tabsSlice actions directly, but they don't create Pi sessions or call `setActiveSession()` on the transport. Item 1.5 needs to wire: (1) `switchTab` → `transport.setActiveSession(tab.sessionId)` to route WS requests, (2) fetch messages from Pi via `get_messages` for tabs that were never cached locally
- Key files: `apps/web/src/components/TabBar.tsx`, `apps/web/src/components/AppShell.tsx`

---

## Session 53 — SessionTab type + tabsSlice (2026-03-23)

**What happened:**
- Added `SessionTab` interface to `packages/contracts/src/sessionTab.ts` — per-tab state type with id, name, sessionId, cwd, model, thinkingLevel, isStreaming, messageCount, createdAt
- Added `TabsSlice` interface to `apps/web/src/store/types.ts` — tabs array, activeTabId, tabMessages cache, and 7 actions (addTab, removeTab, switchTab, updateTab, getActiveTab, saveActiveTabMessages, syncActiveTabState)
- Created `apps/web/src/store/tabsSlice.ts` — full implementation with tab ID generation, default naming, per-tab message caching, tab switching (saves current state + restores target), adjacent-tab fallback on remove, active tab state sync
- Wired tabsSlice into AppStore (store/index.ts) and re-exported types
- Re-exported `SessionTab` from contracts package index

**Items completed:**
- [x] 1.2 — Add `SessionTab` type to contracts
- [x] 1.3 — Add `tabsSlice` to Zustand store

**Issues encountered:**
- Biome `noNonNullAssertion` flagged `s.activeTabId!` in `saveActiveTabMessages` — fixed by extracting to a const checked earlier (MEMORY #30 pattern)

**Handoff to next session:**
- Next: 1.4 — Build `TabBar` component
- The tabsSlice stores per-tab state and message caches. `switchTab` saves current messages and session state to the departing tab and restores the target tab's cached state. But tab switching doesn't yet call `setActiveSession()` on the transport or fetch messages from Pi — that's item 1.5 (wire tab switching).
- Key files: `packages/contracts/src/sessionTab.ts`, `apps/web/src/store/tabsSlice.ts`, `apps/web/src/store/types.ts`

---

## Session 52 — Multi-session WS plumbing (2026-03-23)

**What happened:**
- Implemented multi-session support across contracts, server, and web transport
- Added `sessionId?: string` to `WsRequest` wire type for request-level session targeting
- Added `WsPiEventData` / `WsPiResponseData` wrapper types to tag push events with source session
- Updated `WsChannelDataMap` so `pi.event` and `pi.response` carry session context
- Added `keepExisting?: boolean` to `WsSessionStartParams` for concurrent tab sessions
- Extended `WsConnectionData` with `sessionIds: Set<string>` for multi-session tracking per connection
- Added `targetSessionId` to `HandlerContext`, resolved from request `sessionId` → connection primary fallback
- Updated all session handlers (`getProcess`, `handleSessionStart`, `handleSessionStop`, `wireEventForwarding`, `handleSessionNew`, `handleSessionFork`) to use `targetSessionId`
- Added WS close handler cleanup: stops all owned sessions on disconnect
- Added `WsTransport.setActiveSession()` method — auto-includes sessionId in all outgoing request envelopes
- Updated `wireTransport.ts` to unwrap `WsPiEventData` envelope for current single-session behavior
- Updated `sessionActions.ts` to call `setActiveSession()` after session start
- All 10 dispatch tests + 37 RPC manager tests pass

**Items completed:**
- [x] 1.1 — Extend PiRpcManager to support multiple concurrent sessions

**Issues encountered:**
- Biome import organizer flagged `PiImageContent` alphabetical order in sessionActions.ts (pre-existing, fixed)
- Biome formatter flagged formatting changes from edits (fixed with `bun run format`)

**Handoff to next session:**
- Next: 1.2 — Add `SessionTab` type to contracts
- The multi-session plumbing is in place. The server can now manage multiple sessions per WS connection. Next step is defining the `SessionTab` UI type and building the Zustand store slice for tabs.
- Key files touched: `packages/contracts/src/wsProtocol.ts`, `apps/server/src/server.ts`, `apps/server/src/handlers/session.ts`, `apps/server/src/handlers/types.ts`, `apps/web/src/transport.ts`, `apps/web/src/wireTransport.ts`, `apps/web/src/lib/sessionActions.ts`

---
