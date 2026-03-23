# Session Log

> Chronological record of each build session.
> Previous sessions (1–51): `.plan/archive/SESSION-LOG-v1.md`

---

## Session 65 — "Add Project" flow (2026-03-23)

**What happened:**
- Added `app.openFolderDialog` WS method to contracts (`WsAppOpenFolderDialogResult` type, method in `WS_METHODS`, params/result maps).
- Added `onOpenFolderDialog` hook to `ServerHooks` in `apps/server/src/server.ts`.
- Implemented `handleAppOpenFolderDialog` handler in `apps/server/src/handlers/app.ts` — calls hook or throws error for browser mode.
- Registered handler in `apps/server/src/handlers/index.ts`.
- Extracted `openFolderDialogAsync()` from existing `openFolderDialog()` in desktop `index.ts` — returns `Promise<string | null>`, reused by both the menu action handler and the new server hook.
- Registered `onOpenFolderDialog: () => openFolderDialogAsync()` hook in desktop server creation.
- Added `AddProjectInput` component in `Sidebar.tsx` — inline text input with Enter to submit, Escape to cancel, Add/Cancel buttons.
- Added `handleAddProject` flow: tries `app.openFolderDialog` first (native dialog in desktop), catches error and shows `AddProjectInput` as fallback (browser mode).
- Projects section now always visible in sidebar (even when empty) with "No projects yet" + "Add a project" button prompt.
- "+" button added to Projects section header for quick access.
- Exported `WsAppOpenFolderDialogResult` from contracts index.
- Ran formatter for Biome auto-formatting.

**Items completed:**
- [x] 2.5 — "Add Project" flow: folder picker (native dialog in desktop, text input in browser) → creates project entry

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 2.6 — Project switching: click project → starts new tab with that CWD, or switches to existing tab for that CWD
- The `handleOpenProject` callback in Sidebar already creates a new tab via `createNewTab({ cwd: project.cwd })`. Item 2.6 should add logic to check for existing tabs in that CWD and switch to them instead of always creating new ones.
- Key files: `apps/web/src/components/Sidebar.tsx`, `apps/web/src/lib/tabActions.ts`, `apps/web/src/lib/projectActions.ts`

---

## Session 64 — ProjectSidebar section (2026-03-23)

**What happened:**
- Created `apps/web/src/lib/projectActions.ts` — 4 async functions for project CRUD: `fetchProjects()`, `addProject()`, `removeProject()`, `updateProject()`. All coordinate transport WS calls with Zustand store updates. Same pattern as `sessionActions.ts`.
- Built `ProjectItem` component in `Sidebar.tsx` — memoized, shows folder icon (blue when active project), project name, session count badge (rounded pill), relative last-opened time, hover-reveal remove button. Uses `<div role="tab">` pattern to allow nested `<button>` (same as `SidebarTabItem`).
- Added `formatRelativeTime()` helper for unix timestamp display (separate from `formatDate()` which takes ISO strings).
- Added Projects section to Sidebar between Active Tabs and Past Sessions — collapsible with chevron, expanded by default, shows project count, has refresh button.
- Wired `fetchProjects()` into `wireTransport.ts` `server.welcome` handler — projects loaded automatically on connect alongside session list.
- Clicking a project calls `createNewTab({ cwd: project.cwd })` to open a new tab in the project's directory, and sets it as the active project.
- Fixed Biome lint issues: removed unused `startSessionInFolder` import, used `role="tab"` instead of `role="button"` for a11y compliance, ran formatter.

**Items completed:**
- [x] 2.4 — Build `ProjectSidebar` section: project list with icons, last-opened date, session count badge

**Issues encountered:**
- `exactOptionalPropertyTypes` required using `PiThinkingLevel` type instead of `string` for `defaultThinking` param in `updateProject()` — quick fix, documented pattern (MEMORY #52).

**Handoff to next session:**
- Next: 2.5 — "Add Project" flow: folder picker (native dialog in desktop, text input in browser) → creates project entry
- The `addProject()` function is ready in `projectActions.ts`. Next step is the UI: a button/input in the sidebar projects section that triggers adding a project. Desktop should use native folder picker via menu action, browser needs a text input fallback.
- Key files: `apps/web/src/components/Sidebar.tsx`, `apps/web/src/lib/projectActions.ts`, `apps/desktop/src/bun/menu.ts`

---

## Session 63 — Server-side project persistence (2026-03-23)

**What happened:**
- Created `apps/server/src/projectStore.ts` — file persistence module for `~/.pibun/projects.json`. Exports 5 functions: `loadProjects()`, `saveProjects()`, `addProject()`, `removeProject()`, `updateProject()`. Uses `Bun.file()` + `Bun.write()`, creates `~/.pibun/` directory on first write. `addProject` deduplicates by CWD (returns existing project with updated `lastOpened` if same path). Projects always sorted by `lastOpened` descending.
- Created `apps/server/src/handlers/project.ts` — 4 WS method handlers: `handleProjectList`, `handleProjectAdd`, `handleProjectRemove`, `handleProjectUpdate`. All async (file I/O). `handleProjectUpdate` uses conditional spread pattern for `exactOptionalPropertyTypes` compat (MEMORY #52).
- Updated `apps/server/src/handlers/index.ts` — imported and registered all 4 project handlers in the handler registry.
- Fixed two type errors: (1) `??` and `||` mixed operators needed parentheses in `projectStore.ts`, (2) `exactOptionalPropertyTypes` required conditional spread in `handleProjectUpdate` to avoid passing `undefined` to optional properties.
- Ran `bun run format` for Biome auto-formatting of import grouping.

**Items completed:**
- [x] 2.3 — Server-side project persistence: `~/.pibun/projects.json` (read/write via new WS methods `project.list`, `project.add`, `project.remove`, `project.update`)

**Issues encountered:**
- None (both type errors were expected patterns already documented in MEMORY)

**Handoff to next session:**
- Next: 2.4 — Build `ProjectSidebar` section: project list with icons, last-opened date, session count badge
- Server-side persistence is complete. The 4 WS methods are registered and ready. The web app's `ProjectsSlice` (item 2.2) already has CRUD actions. Next step connects the UI to the server via the transport layer.
- Key files: `apps/server/src/projectStore.ts`, `apps/server/src/handlers/project.ts`, `apps/web/src/store/projectsSlice.ts`, `apps/web/src/components/Sidebar.tsx`

---

## Session 62 — Project type + projectsSlice (2026-03-23)

**What happened:**
- Created `packages/contracts/src/project.ts` with `Project` and `ProjectModelPreference` types. `Project` has `id`, `name`, `cwd`, `lastOpened`, `favoriteModel`, `defaultThinking`, `sessionCount` — all non-optional (uses `null` for absent values per conventions).
- Added 4 WS method types to `wsProtocol.ts`: `project.list`, `project.add`, `project.remove`, `project.update` with corresponding params/result interfaces and map entries. Server handlers deferred to item 2.3.
- Updated `packages/contracts/src/index.ts` with new type re-exports.
- Added `ProjectsSlice` interface to `apps/web/src/store/types.ts` with sorted-by-lastOpened invariant, CRUD actions, `activeProjectId`, and `projectsLoading` state.
- Created `apps/web/src/store/projectsSlice.ts` with `createProjectsSlice` — follows existing `StateCreator` pattern. All mutations re-sort by `lastOpened` descending. `removeProject` auto-clears `activeProjectId` if the removed project was active.
- Wired slice into combined store in `apps/web/src/store/index.ts`.
- Typecheck + lint pass across all 5 packages.

**Items completed:**
- [x] 2.1 — Define `Project` type
- [x] 2.2 — Add `projectsSlice` to Zustand store

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 2.3 — Server-side project persistence (`~/.pibun/projects.json`)
- WS method types already defined in contracts — server needs: `projectStore.ts` (read/write JSON file), `handlers/project.ts` (4 handlers), register in handler index, wire in server.ts
- Follow thin bridge pattern: `project.list` reads file, `project.add` generates UUID + defaults + writes, `project.remove` filters + writes, `project.update` merges + writes

---

## Session 61 — Multi-session verification (Phase 1 complete) (2026-03-23)

**What happened:**
- Created `fake-pi-streaming.ts` test fixture — enhanced version of `fake-pi.ts` that emits the full Pi agent lifecycle (agent_start → message_start → text_delta streaming → message_end → agent_end) when receiving a `prompt` command. Configurable via env vars.
- Added `PiRpcManagerOptions` with `defaultPiCommand` to `PiRpcManager` constructor — allows injecting a custom Pi binary for all sessions created by the manager. No breaking change (optional arg).
- Wrote `multi-session-test.ts` with **40 automated checks** covering all Phase 1 exit criteria:
  - 3 simultaneous sessions created and running
  - Parallel streaming from all 3 with events correctly tagged per sessionId
  - Per-session state retrieval (simulates tab switching)
  - Event routing isolation (no cross-session event leaks)
  - Close one session — removed from RPC manager, remaining sessions unaffected
  - Remaining sessions still respond to prompts after close
  - WebSocket disconnect cleanup — all sessions stopped, no orphaned processes
- Added `test:smoke:multi-session` root script
- All 40 checks pass. All Phase 1 exit criteria verified.

**Items completed:**
- [x] 1.12 — Verify: 3 simultaneous sessions streaming, switch between them, close one, verify no orphaned processes

**Issues encountered:**
- None

**Handoff to next session:**
- **Phase 1 is COMPLETE.** All 12 items done, exit criteria verified.
- Next: Phase 2 — Project Management (item 2.1: Define `Project` type)
- Phase 2 goal: Sidebar with project directories, persistence across restarts, per-project session/CWD/model preferences

---

## Session 60 — Desktop native menus with tab actions (2026-03-23)

**What happened:**
- Added 4 new `MENU_ACTIONS` constants: `newTab` (`file.new-tab`), `closeTab` (`file.close-tab`), `nextTab` (`view.next-tab`), `prevTab` (`view.prev-tab`)
- File menu updated: added "New Tab" (Cmd+T) and "Close Tab" (Cmd+W). "Close Window" accelerator changed from Cmd+W → Cmd+Shift+W to match tabbed app conventions (Cmd+W closes the active tab, Cmd+Shift+W closes the window)
- View menu updated: added "Next Tab" (Ctrl+Tab) and "Previous Tab" (Ctrl+Shift+Tab) between Toggle Sidebar and Zoom controls
- `wireTransport.ts` `handleMenuAction()` extended with 4 new action cases: `file.new-tab` → `createNewTab()`, `file.close-tab` → `closeTab(activeTabId)` (only when >1 tab), `view.next-tab` → `switchTabAction()` with next index (wraps), `view.prev-tab` → `switchTabAction()` with previous index (wraps)
- All 4 new actions forwarded via WS push (fall through to `default` case in desktop `handleMenuAction` in `index.ts`) — no native-only handling needed

**Items completed:**
- [x] 1.11 — Desktop: update native menus with tab actions (New Tab, Close Tab, Next/Previous Tab)

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1.12 — Verify: 3 simultaneous sessions streaming, switch between them, close one, verify no orphaned processes
- This is a verification item — run 3 tabs simultaneously, confirm streaming events route correctly, close tabs, verify Pi processes are properly terminated
- Phase 1 exit criteria: "Multiple Pi sessions run in parallel. Tabs show streaming state. Switch is instant (messages cached). No process leaks on close."

---

## Session 58 — Tab drag-to-reorder + keyboard shortcuts (2026-03-23)

**What happened:**
- Added `reorderTabs(fromIndex, toIndex)` action to `TabsSlice` interface and implementation — splices array to move tab between positions with bounds checking
- Added HTML5 drag-and-drop to `TabBar`: `TabItem` is `draggable`, `TabBar` tracks `dragIndexRef` (source) and `dragOverIndex` (target) state. Drop indicator is a blue left-border on the target tab via conditional `border-l-2 border-l-blue-500` class
- Extended `ShortcutAction` type with `newTab`, `closeTab`, `nextTab`, `prevTab` actions
- Added 5 new keyboard shortcut groups to `useKeyboardShortcuts`:
  - Ctrl/Cmd+T → `createNewTab()` (new tab with Pi process)
  - Ctrl/Cmd+W → `closeTab(activeTabId)` (only when >1 tab)
  - Ctrl/Cmd+Tab → next tab (wraps around)
  - Ctrl/Cmd+Shift+Tab → previous tab (wraps around)
  - Ctrl/Cmd+1-9 → jump to tab by position (only when target exists and differs from active)

**Items completed:**
- [x] 1.8 — Tab drag-to-reorder (optional polish)
- [x] 1.9 — Keyboard shortcuts: Ctrl+T new tab, Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab cycle tabs, Ctrl+1-9 jump to tab

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 1.10 — Update Sidebar to show tabs grouped by CWD, or remove session list in favor of tabs
- Key files: `apps/web/src/components/Sidebar.tsx` (needs tab-aware update), `apps/web/src/store/tabsSlice.ts` (tab data), `apps/web/src/components/TabBar.tsx` (tab UI)
- Decision needed for 1.10: sidebar can either (a) show tabs grouped by CWD directory, or (b) replace the session list entirely with tabs. Tabs are already visible in TabBar — sidebar could show per-CWD grouping for project context.

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

## Session 59 — Sidebar tabs + CWD grouping (2026-03-23)

**What happened:**
- Rewrote `Sidebar.tsx` to show active tabs as primary content instead of session list
- Active tabs grouped by CWD when multiple directories are in use (flat list when all same CWD)
- Each `SidebarTabItem` shows: streaming indicator (pulsing blue dot), tab name, model badge, message count, close button
- `CwdGroup` component renders folder icon + shortened path header above grouped tabs
- Past sessions (from Pi's `~/.pi/agent/sessions/`) shown as collapsible secondary section
- Past sessions filtered to exclude sessions already open as tabs (matched by sessionId)
- "New" button now creates a new tab via `createNewTab()` instead of `startNewSession()`
- Removed redundant "Current session info" section — tab display covers this
- Fixed Biome a11y errors: `SidebarTabItem` uses `<div role="tab">` (not `<button>`) to allow nested close `<button>`, past sessions refresh button restructured to avoid nesting

**Items completed:**
- [x] 1.10 — Update Sidebar to show tabs grouped by CWD, or remove session list in favor of tabs

**Issues encountered:**
- Biome flagged `<span role="button">` in two places — restructured to use proper semantic elements (div+role for tab container, separate buttons for refresh)

**Handoff to next session:**
- Next: 1.11 — Desktop: update native menus with tab actions (New Tab, Close Tab, Next/Previous Tab)
- The sidebar now shows tabs as primary content. TabBar (horizontal strip) still provides the compact tab view at the top when ≥2 tabs.
- Key file: `apps/web/src/components/Sidebar.tsx`

---
