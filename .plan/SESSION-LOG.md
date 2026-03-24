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

---

## Session 3 — UI state persistence (2026-03-24)

**What happened:**
- Added debounced localStorage persistence for key UI state to `appActions.ts`
- Persists `sidebarOpen` and `activeTabId` under `pibun-ui-state` localStorage key
- Theme was already persisted via `pibun-theme` key (no changes needed)
- Implementation:
  - `getPersistedUiState()` — reads from localStorage
  - `restorePersistedUiState()` — applies saved state to Zustand store on init
  - `initUiPersistence()` — subscribes to store changes, writes with 500ms debounce, flushes on `beforeunload`
  - `consumeDeferredActiveTabId()` — deferred tab restoration (tabs don't exist at init time, exposed for future use when session list loads and recreates tabs)
- Wired into `wireTransport.ts`:
  - `restorePersistedUiState()` called before subscriptions (restores sidebar state immediately)
  - `initUiPersistence()` cleanup registered alongside other cleanups

**Items completed:**
- [x] 1A.3 — Add debounced localStorage persistence for key UI state

**Issues encountered:**
- None. Theme persistence was already complete — only sidebar and activeTabId needed adding.
- `activeTabId` restoration is deferred because tabs are created asynchronously after session list loads. The `consumeDeferredActiveTabId()` function is exported but not yet consumed — it will be wired when tab restoration from session list is implemented.

**Handoff to next session:**
- Next: 1A.4 — Add composer draft persistence per tab
- `consumeDeferredActiveTabId()` is available in `appActions.ts` but not yet consumed. When session list loads and recreates tabs, call it to switch to the previously active tab.
- Persistence pattern is established: subscribe to store → debounce → localStorage. Follow same pattern for composer drafts.

---

## Session 4 — Composer draft persistence per tab (2026-03-24)

**What happened:**
- Read T3Code's `composerDraftStore.ts` for reference — it's 1800+ lines with Effect/Schema, far too complex for PiBun. Adopted the core idea (per-thread drafts in localStorage) but with a much simpler architecture.
- Implemented composer draft persistence as a module-level `Map<tabId, Draft>` in `appActions.ts` (not in Zustand — avoids re-render noise during typing):
  - `getComposerDraft(tabId)` — read from in-memory map
  - `saveComposerDraft(tabId, draft)` — write to map + schedule debounced localStorage write (300ms)
  - `clearComposerDraft(tabId)` — remove draft (on send)
  - `deleteComposerDraft(tabId)` — remove draft (on tab close)
  - `restoreComposerDrafts()` — hydrate map from localStorage on init
  - `initComposerDraftPersistence()` — init + beforeunload flush, returns cleanup
- Modified `Composer.tsx`:
  - Added `activeTabId` selector for tab-switch detection
  - Added `valueRef`/`imagesRef` refs to capture current state for tab-switch save without exhaustive-deps issues
  - Tab-switch effect: saves draft for leaving tab (from refs), restores draft for arriving tab
  - Change effect: saves draft on every text/image change (reactive, calls `saveComposerDraft` which debounces to localStorage)
  - `clearInput()` now also calls `clearComposerDraft(activeTabId)`
- Wired into `wireTransport.ts`: `initComposerDraftPersistence()` called during transport init
- Wired into `tabActions.ts`: `deleteComposerDraft(tabId)` called on tab close (before `removeTab`)
- Images persist as `{ id, data, mimeType, previewUrl }` — same shape Composer uses internally, so restore is zero-transform

**Items completed:**
- [x] 1A.4 — Add composer draft persistence per tab

**Issues encountered:**
- Biome's `useExhaustiveDependencies` flagged the tab-switch effect for depending on `value`/`images.map`. Fixed by using refs (`valueRef`/`imagesRef`) for the save path, keeping the effect dep list clean (`[activeTabId, resizeTextarea]`).

**Handoff to next session:**
- Next: 1A.5 — Implement message copy button on assistant messages
- Composer draft pattern is established. Draft data lives in `appActions.ts` module scope (not Zustand). If future features need to read drafts outside Composer (e.g., tab badge showing "has draft"), expose a `hasDraft(tabId)` function.
- `consumeDeferredActiveTabId()` still not consumed — will be needed when session list loads and recreates tabs.

---

## Session 5 — Copy button + Image preview modal (2026-03-24)

**What happened:**
- Implemented copy button on assistant messages (1A.5):
  - Added `group/assistant` named Tailwind group to AssistantMessage wrapper div
  - Copy button appears on hover (opacity transition), hidden during streaming
  - Uses `navigator.clipboard.writeText(message.content)` to copy markdown source
  - Shows toast confirmation ("Copied to clipboard") + visual check icon for 2s
  - Button only renders when message has content and is not streaming
- Implemented image preview modal (1A.6):
  - Added `imagePreviewUrl` and `imagePreviewAlt` to UiSlice + `setImagePreview` action
  - Created `ImagePreviewModal` component — fixed overlay with backdrop blur, closes on Escape/backdrop click
  - Modified Markdown `img` component to be clickable: refactored module-level `components` constant into `createComponents(onImageClick)` factory function, memoized per-render in `MarkdownContent`
  - Made Composer image thumbnails clickable — calls `setImagePreview` on click
  - Added `ImagePreviewModal` to AppShell alongside other overlays (ExtensionDialog, ToastContainer)
- Phase 1A is now complete (all 6 items checked off)

**Items completed:**
- [x] 1A.5 — Implement message copy button on assistant messages
- [x] 1A.6 — Add image preview modal

**Issues encountered:**
- Biome lint flagged `role="dialog"` on a div (wants `<dialog>` element). Removed the role attribute entirely since native `<dialog>` doesn't work well for click-outside-to-close overlay pattern. Other dialogs in codebase use biome-ignore comments but that requires the role to be on the same line as the opening tag.
- Markdown `components` object was a module-level constant — couldn't access React hooks. Refactored to factory function `createComponents(onImageClick)` with `useMemo` in the component.

**Handoff to next session:**
- Phase 1A is COMPLETE. Next phase: 1B — Thread Status & Activity Indicators
- Start with 1B.1 — Add thread/tab status indicators
- The `group/assistant` hover pattern is established for showing contextual actions on messages
- Image preview modal state lives in UiSlice — any future image-click needs just call `setImagePreview(url, alt)`
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 6 — Tab status indicators (2026-03-24)

**What happened:**
- Implemented thread/tab status indicators (1B.1):
  - Added `TabStatus` type (`"idle" | "running" | "waiting" | "error"`) to `@pibun/contracts` domain.ts
  - Added `status: TabStatus` field to `SessionTab` interface (default: `"idle"`)
  - Created `deriveTabStatus()` helper in workspaceSlice — derives status from `isStreaming` + `pendingExtensionUi`, preserves `error` status until new activity starts
  - Updated `syncActiveTabState` and `switchTab` to compute and set `status` via `deriveTabStatus()`
  - Updated background tab event handling in `wireTransport.ts` — now handles `agent_start` (→ running), `agent_end` (→ idle), `extension_ui_request` dialog types (→ waiting), and `auto_retry_end` failure (→ error) for background tabs
  - Active tab `error` status set explicitly on `auto_retry_end` failure via `store.updateTab()`
  - Removed `updateTabStreamingBySessionId()` from tabActions.ts — replaced by inline handler in wireTransport.ts that updates `isStreaming` and `status` together
  - Created `TabStatusDot` component in Sidebar.tsx — running (blue pulse), waiting (amber pulse), error (red), idle (accent/gray)
  - Created `TabBarStatusDot` component in TabBar.tsx — compact variant, shows git dirty indicator when idle, omits dot for idle+clean tabs
  - Both Sidebar and TabBar now use `tab.status` instead of `tab.isStreaming` for visual indicators

**Items completed:**
- [x] 1B.1 — Add thread/tab status indicators

**Issues encountered:**
- Biome flagged `case "idle":` before `default:` as useless switch case. Removed the explicit `case "idle":` — `default` handles it.
- `error` status preservation needed special handling: `deriveTabStatus` takes optional `currentStatus` param and preserves `error` unless new activity (running/waiting) overrides it. This prevents `syncActiveTabState` from clearing error status back to idle.

**Handoff to next session:**
- Next: 1B.2 — Show auto-retry UI (inline indicator in ChatView + progress during retry delay)
- `TabStatus` and `TabStatusDot`/`TabBarStatusDot` patterns are established — reuse them for any new status states
- `deriveTabStatus()` preserves `error` status — if you need to clear error explicitly, set `status: "idle"` directly via `store.updateTab()`
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 7 — Auto-retry UI with countdown progress (2026-03-24)

**What happened:**
- Implemented auto-retry UI with countdown progress bar (1B.2):
  - Added `retryDelayMs` and `retryStartedAt` fields to store types and session slice
  - Updated `setRetrying` to accept `delayMs` parameter, captures `Date.now()` as `retryStartedAt` when retrying with delay
  - Updated `wireTransport.ts` to pass `event.delayMs` from `auto_retry_start` to `setRetrying`
  - Updated workspace slice tab-switch reset to include new retry fields
  - Created `RetryIndicator` component in ChatView.tsx — shows attempt count + animated countdown progress bar
  - Progress bar uses `requestAnimationFrame` loop to smoothly drain over the retry delay period
  - Shows seconds remaining as countdown text (e.g., "— 5s")
  - Replaced the simple text-only retry indicator in ChatView footer with the new component
- Discovery: the basic retry plumbing already existed (store fields `isRetrying`/`retryAttempt`/`retryMaxAttempts`, event handling, simple text indicator). The key gap was `delayMs` not being captured and no visual progress.

**Items completed:**
- [x] 1B.2 — Show auto-retry UI: inline indicator + countdown progress during retry delay

**Issues encountered:**
- None. The existing retry infrastructure made this a clean enhancement rather than a new feature.

**Handoff to next session:**
- Next: 1B.3 — Surface `extension_error` events as dismissible warning toasts
- `RetryIndicator` lives in `ChatView.tsx` — if retry UI needs to appear elsewhere (e.g., status bar), extract to its own file
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 8 — Extension error toasts (2026-03-24)

**What happened:**
- Surfaced `extension_error` Pi events as dismissible warning toasts (1B.3)
- Changed `wireTransport.ts` handler from `store.setLastError()` to `store.addToast(message, "warning")`
- Toast message includes extension name (basename of `extensionPath`) + error text
- Used `warning` level (not `error`) because extension errors are non-fatal — the session continues working
- Console.error preserved for debugging
- No new components needed — existing `ToastContainer` + `addToast` infrastructure handles everything

**Items completed:**
- [x] 1B.3 — Surface `extension_error` events as dismissible warning toasts

**Issues encountered:**
- None. This was a one-line change — the toast system was already fully built.

**Handoff to next session:**
- Next: 1B.4 — Add provider health indicator (banner when Pi process exits unexpectedly, session start fails, or model errors occur repeatedly)
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 9 — Provider health indicator (2026-03-24)

**What happened:**
- Implemented provider health indicator across all layers (1B.4):
  - **Contracts**: Added `session.status` push channel with `WsSessionStatusData` type (sessionId, status, message, exitCode). Updated `WS_CHANNELS`, `WsChannelDataMap`.
  - **Server**: Wired `PiRpcManager.onSessionEvent()` crash events → `session.status` push to owning WS connection. Includes last 200 chars of stderr in crash message. Cleans up session from connection tracking after crash.
  - **Store**: Added `ProviderHealthIssue` type with 3 kinds: `process_crashed`, `session_start_failed`, `repeated_model_errors`. Added `providerHealth` field + `setProviderHealth` action to ConnectionSlice.
  - **wireTransport**: Subscribes to `session.status` push → sets `providerHealth` for crashes (also clears streaming state, nullifies crashed session on tab). Enhanced `auto_retry_end` failure → sets `providerHealth` with `repeated_model_errors` instead of just `setLastError`. Auto-clears health on `agent_start` (successful activity).
  - **sessionActions**: `ensureSession()` and `startSessionInFolder()` now set `providerHealth` on failure + clear it on success. `startNewSession()` clears health on success.
  - **HealthBanner component**: Persistent amber/red banner in `ErrorBanner.tsx`. Shows kind label + message. "New Session" button for crash/start failures. Dismiss button. Does NOT auto-dismiss (unlike ErrorBanner's 10s timeout). Added to AppShell above ErrorBanner.

**Items completed:**
- [x] 1B.4 — Add provider health indicator

**Issues encountered:**
- `exactOptionalPropertyTypes` prevented using `sessionId: undefined` in `updateTab()` — used `null` instead (SessionTab.sessionId is `string | null`, not optional).
- Biome formatter wanted ternary expressions on one line — ran `bun run format` to fix.

**Handoff to next session:**
- Next: 1B.5 — Add completion summary after agent finishes
- `HealthBanner` is in `ErrorBanner.tsx` — if it grows further, consider extracting to its own file
- Health auto-clears on `agent_start` — this means any successful prompt clears prior health issues
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 10 — Completion summary after agent finishes (2026-03-24)

**What happened:**
- Implemented completion summary divider between turns (1B.5):
  - Added `agentStartedAt: number` field to `SessionSlice` (0 when idle)
  - Added `setAgentStartedAt` action to store
  - `agent_start` handler in wireTransport.ts now sets `agentStartedAt = Date.now()`
  - `agent_end` handler computes elapsed time from `agentStartedAt`, inserts a system message: `"✓ Worked for Xm Ys"`
  - Added `formatDuration()` helper in wireTransport.ts: `<1s` for under 1s, `Xs` for under 60s, `Xm Ys` for 60s+
  - Added `"completion"` category to SystemMessage — uses `text-text-muted` + `bg-border-secondary` divider lines for subtle, non-attention-grabbing appearance
  - `agentStartedAt` properly reset: on `agent_end` (→ 0), in `resetSession`, and in `switchTab` state restoration
- Minimal change set: 5 files modified (types.ts, sessionSlice.ts, workspaceSlice.ts, wireTransport.ts, ChatMessages.tsx)

**Items completed:**
- [x] 1B.5 — Add completion summary after agent finishes: "Worked for Xm Ys" divider

**Issues encountered:**
- None. Clean implementation — the system message + category pattern was already well-established.

**Handoff to next session:**
- Next: 1B.6 — Improve turn boundaries: visual separator between user→assistant turns with timestamp, collapsed tool activity count
- This is the LAST item in Phase 1B. After completing it, verify exit criteria and mark phase complete.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 11 — Turn boundaries with timestamp and tool count (2026-03-24)

**What happened:**
- Implemented turn boundary visual separators (1B.6):
  - Extended `ChatItem` union type with `turn_divider` kind carrying `id`, `timestamp`, and `toolCount`
  - Modified `groupMessages()` to track tool call count per turn and insert `turn_divider` items before each user message (except the first)
  - Created `TurnDivider` component in `ChatMessages.tsx` — subtle divider line with:
    - Locale-aware timestamp via `formatTimestamp()` using `toLocaleTimeString()`
    - Tool call count badge with wrench icon (only shown when `toolCount > 0`)
    - Low-contrast `bg-border-primary/30` divider lines that don't compete with completion summary
  - Updated `ChatItemRenderer` to handle `turn_divider` kind
  - Updated `chatItemKey` to return divider's unique ID
- Phase 1B is now COMPLETE — all 6 items checked off
- Exit criteria verified: ✅ Users can see at a glance which sessions are active, errored, or waiting. ✅ Retry and error states are visible. ✅ Turn boundaries are clearly marked.

**Items completed:**
- [x] 1B.6 — Improve turn boundaries: visual separator between user→assistant turns with timestamp, collapsed tool activity count

**Issues encountered:**
- Biome formatting: initial `return ( <TurnDivider ... /> )` was reformatted to single-line `return <TurnDivider ... />;`. Fixed with `bun run format`.

**Handoff to next session:**
- Phase 1B is COMPLETE. Next phase: 1C — Settings & Preferences
- Start with 1C.1 — Create settings page/dialog
- `TurnDivider` lives in `ChatMessages.tsx` alongside other message renderers
- `formatTimestamp()` is a module-level helper in `ChatMessages.tsx` — if timestamp formatting is needed elsewhere (e.g., settings timestamp format selector from 1C.6), extract to `utils.ts`
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 12 — Settings dialog (2026-03-24)

**What happened:**
- Created the settings dialog with 4 sections (1C.1):
  - **Contracts**: Extended `PiBunSettings` with `autoCompaction: boolean | null`, `autoRetry: boolean | null`, `timestampFormat: TimestampFormat`. Added `TimestampFormat` type (`"relative" | "locale" | "12h" | "24h"`). Extended `WsSettingsUpdateParams` with new fields.
  - **Server**: Updated `settingsStore.ts` — new default settings, parsing for new fields in `loadSettings()`, merge logic in `updateSettings()`.
  - **Store**: Added `settingsOpen: boolean` + `setSettingsOpen` action to `UiSlice` and `appSlice`.
  - **Settings actions**: Replaced simple `fetchAndApplySettings`/`persistThemeToServer` with comprehensive settings system in `appActions.ts`:
    - `getSettings()` — returns cached settings (hydrated from localStorage on first access)
    - `updateSetting(key, value)` — updates cache + localStorage + server fire-and-forget
    - `getTimestampFormat()` — convenience accessor for components
    - `persistThemeToServer()` now delegates to `updateSetting("themeId", ...)`
  - **SettingsDialog component**: Modal overlay with:
    - **Appearance section**: Theme selector with compact swatches + System option
    - **Agent Behavior section**: Auto-compaction + auto-retry toggle switches
    - **Display section**: Timestamp format picker (relative/locale/12h/24h with live examples)
    - **Keyboard Shortcuts section**: Reference table of all shortcuts
  - **Keyboard shortcut**: Ctrl/Cmd+, toggles settings dialog (added to `useKeyboardShortcuts`)
  - **Gear icon**: Settings button added to toolbar (after ThemeSelector)
  - All a11y lint issues fixed: `aria-label`+`role="img"` on SVGs, `<span>` instead of `<label>` for non-form elements, `biome-ignore` for backdrop click handler

**Items completed:**
- [x] 1C.1 — Create settings page/dialog

**Issues encountered:**
- `PiBunSettings` cast to `Record<string, unknown>` needed double cast via `unknown` due to `exactOptionalPropertyTypes`
- Biome lint: SVGs needed `aria-label`/`role="img"`, `<label>` without associated control changed to `<span>`, backdrop click div needed `biome-ignore` for `useKeyWithClickEvents`
- Import ordering: `SettingsDialog` import had to be alphabetically sorted with other component imports

**Handoff to next session:**
- Next: 1C.2 — Add `settings.get`/`settings.update` persistence to `~/.pibun/settings.json` on server (already have handlers — wire to UI)
- Note: `settings.get`/`settings.update` server handlers already exist and already support the new fields. The "wire to UI" part is about making the SettingsDialog fetch current settings on open and display server-side values. Currently, the dialog reads from the cached `getSettings()` which is synced on `server.welcome`. This may be sufficient — 1C.2 might already be done.
- Default model and default thinking level UI were omitted from the settings dialog — they need Pi RPC methods (`set_auto_compaction`, `set_auto_retry`) to be wired first (1C.3, 1C.4)
- `formatTimestamp()` in `ChatMessages.tsx` does not yet read from `getTimestampFormat()` — will be wired in 1C.6
- `consumeDeferredActiveTabId()` still not consumed

## Session 13 — Settings persistence + auto-compaction/auto-retry Pi RPC wiring (2026-03-24)

**What happened:**
- Verified 1C.2 (settings persistence) was already fully wired end-to-end: UI → `updateSetting()` → cache + localStorage + server (`~/.pibun/settings.json`). No code changes needed — marked complete.
- Implemented 1C.3 and 1C.4 (auto-compaction and auto-retry Pi RPC wiring):
  - **Contracts**: Added `session.setAutoCompaction` and `session.setAutoRetry` WS methods with `WsSessionSetAutoCompactionParams` / `WsSessionSetAutoRetryParams` types. Updated `WS_METHODS`, `WsMethodParamsMap`, `WsMethodResultMap`.
  - **Server**: Added `handleSessionSetAutoCompaction` and `handleSessionSetAutoRetry` handlers in `session.ts` — thin bridge to Pi `set_auto_compaction` / `set_auto_retry` RPC commands via `sendAndAck`. Registered in handler index.
  - **UI → Pi RPC on toggle**: Extended `updateSetting()` in `appActions.ts` with `applySettingToPiSession()` — when `autoCompaction` or `autoRetry` changes, sends Pi RPC to active session (fire-and-forget).
  - **Apply on session start**: Added `applySettingsToNewSession()` in `sessionActions.ts` — sends saved non-null settings to newly started Pi processes. Called after `ensureSession()` and `startSessionInFolder()`.

**Items completed:**
- [x] 1C.2 — Settings persistence to `~/.pibun/settings.json` (already wired, verified)
- [x] 1C.3 — Wire `set_auto_compaction` toggle to Pi RPC
- [x] 1C.4 — Wire `set_auto_retry` toggle to Pi RPC

**Issues encountered:**
- None. The existing settings infrastructure made this straightforward. All Pi RPC command types were already defined in contracts.

**Handoff to next session:**
- Next: 1C.5 — Wire `set_steering_mode` and `set_follow_up_mode` to Pi RPC (server handlers + UI in settings)
- Pattern established: WS method in contracts → server handler using `sendAndAck` → `applySettingToPiSession()` for live toggle → `applySettingsToNewSession()` for session start
- `PiSteeringMode` ("all" | "one-at-a-time") and `PiFollowUpMode` ("all" | "one-at-a-time") types already exist in `piProtocol.ts`
- 1C.5 will need UI additions to SettingsDialog (steering mode and follow-up mode dropdowns/toggles in Agent Behavior section)
- `consumeDeferredActiveTabId()` still not consumed

---
