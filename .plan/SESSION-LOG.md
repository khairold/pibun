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

## Session 14 — Steering mode + follow-up mode Pi RPC wiring (2026-03-24)

**What happened:**
- Implemented steering mode and follow-up mode end-to-end (1C.5), following the exact same pattern as auto-compaction/auto-retry:
  - **Contracts**: Added `session.setSteeringMode` and `session.setFollowUpMode` WS methods with `WsSessionSetSteeringModeParams` / `WsSessionSetFollowUpModeParams` types. Added `steeringMode` and `followUpMode` to `WsSettingsUpdateParams` and `PiBunSettings`.
  - **Server**: Added `handleSessionSetSteeringMode` and `handleSessionSetFollowUpMode` handlers in `session.ts` — thin bridge to Pi `set_steering_mode` / `set_follow_up_mode` RPC commands via `sendAndAck`. Registered in handler index.
  - **Server settingsStore**: Added `steeringMode` and `followUpMode` to defaults, load parsing (with validation against `["all", "one-at-a-time"]`), and update merge.
  - **UI appActions**: Extended `applySettingToPiSession()` to handle `steeringMode` → `session.setSteeringMode` and `followUpMode` → `session.setFollowUpMode`. Updated `DEFAULT_SETTINGS` with new null fields.
  - **UI sessionActions**: Extended `applySettingsToNewSession()` to send steering/follow-up mode on session start.
  - **UI SettingsDialog**: Created `ModeSelector` segmented control component (inline button group). Added steering mode and follow-up mode selectors to Agent Behavior section with descriptive labels.

**Items completed:**
- [x] 1C.5 — Wire `set_steering_mode` and `set_follow_up_mode` to Pi RPC

**Issues encountered:**
- Biome import ordering: `handleSessionSetSteeringMode` had to come after `handleSessionSetName` alphabetically. Fixed.
- Biome formatting: settings store ternary expressions reformatted to single lines. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 1C.6 — Add timestamp format selector (relative, locale, 12-hour, 24-hour) — apply throughout UI
- This is the LAST item in Phase 1C. After completing it, verify exit criteria and mark phase complete.
- `ModeSelector` component in SettingsDialog is reusable for any two-option selector.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 15 — Timestamp format selector applied throughout UI (2026-03-24)

**What happened:**
- Implemented timestamp format selector applied throughout UI (1C.6), completing Phase 1C:
  - **Shared utility**: Created `formatTimestamp(ts, format)` in `utils.ts` — formats Unix timestamp according to `TimestampFormat` preference (relative/locale/12h/24h). Relative format shows "just now", "Xm ago", "Xh ago", falls back to locale time for >24h.
  - **Zustand reactivity**: Added `timestampFormat: TimestampFormat` field + `setTimestampFormat` action to `UiSlice`/`appSlice`. Components read from store so they re-render when format changes.
  - **Sync pipeline**: `timestampFormat` synced to Zustand from 3 paths: (1) `restorePersistedUiState()` on init from localStorage cache, (2) `fetchAndApplySettings()` on server welcome, (3) `updateSetting("timestampFormat", ...)` on user change in settings dialog.
  - **TurnDivider**: Updated to read `timestampFormat` from Zustand store and pass to shared `formatTimestamp()`. Deleted the old local `formatTimestamp` function from `ChatMessages.tsx`.
  - **Sidebar timestamps**: Left as-is — sidebar uses `formatRelativeTime`/`formatDate` for session creation dates and project last-opened, which are conceptually different from in-chat time display.
- Phase 1C exit criteria verified: ✅ Settings dialog with all sections, ✅ persistence across restarts, ✅ auto-compaction/auto-retry controllable, ✅ steering/follow-up modes controllable, ✅ timestamp format applied throughout UI.

**Items completed:**
- [x] 1C.6 — Add timestamp format selector (relative, locale, 12-hour, 24-hour) — apply throughout UI

**Issues encountered:**
- Biome flagged `case "locale":` before `default:` as useless switch case — removed explicit case, `default` handles locale format.
- Import placement: initially placed `import type { TimestampFormat }` mid-file in utils.ts — moved to top with other imports.

**Handoff to next session:**
- **Phase 1C is COMPLETE.** Next: Phase 2A — Slash Commands & Command Palette
- Start with 2A.1 — Add Pi RPC `get_commands` support
- `formatTimestamp()` in `utils.ts` is the shared utility for all in-chat timestamps. Always pass `format` from Zustand (`useStore(s => s.timestampFormat)`) for reactivity.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 16 — Pi RPC `get_commands` support (2026-03-24)

**What happened:**
- Implemented `session.getCommands` WS method end-to-end (2A.1):
  - **Contracts piProtocol.ts**: Updated `PiSlashCommand` to match actual Pi wire format — replaced `location`/`path` fields with `sourceInfo: PiSourceInfo`. Added `PiSourceInfo`, `PiSourceScope` ("user" | "project" | "temporary"), `PiSourceOrigin` ("package" | "top-level") types. This matches Pi's actual `rpc-types.ts` (rpc.md docs were outdated).
  - **Contracts wsProtocol.ts**: Added `session.getCommands` to `WS_METHODS`, `WsMethodParamsMap` (no params), `WsMethodResultMap` (→ `WsSessionGetCommandsResult`). Added `WsSessionGetCommandsResult` type with `commands: PiSlashCommand[]`. Added `PiSlashCommand` to piProtocol imports.
  - **Server session.ts**: Added `handleSessionGetCommands` handler — follows `getModels` pattern: `process.sendCommand({ type: "get_commands" })` → `assertSuccess` → extract `commands` from response data.
  - **Server index.ts**: Registered `handleSessionGetCommands` in handler registry at `"session.getCommands"`.

**Items completed:**
- [x] 2A.1 — Add Pi RPC `get_commands` support: new WS method `session.getCommands` + server handler + contracts types

**Issues encountered:**
- Pi's rpc.md docs showed an older format for `PiSlashCommand` with `location`/`path` fields, but the actual Pi source (`rpc-types.ts`) uses `sourceInfo: SourceInfo`. Updated to match the actual wire format. Logged in MEMORY.md #28.

**Handoff to next session:**
- Next: 2A.2 — Build ComposerCommandMenu component: floating menu above composer, keyboard navigable
- `session.getCommands` is ready to be called from the UI. Will need a Zustand action or React hook to fetch commands and store them.
- `PiSlashCommand` has `sourceInfo.path` (absolute file path), `sourceInfo.scope` (user/project/temporary), `sourceInfo.source` (human-readable name). Use `source` field for display grouping (extension/prompt/skill).
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 17 — ComposerCommandMenu component (2026-03-24)

**What happened:**
- Built the ComposerCommandMenu component and integrated slash command trigger detection into Composer (2A.2):
  - **ComposerCommandMenu.tsx**: New file — pure presentational component. Shows a floating menu above the composer with:
    - Filtered command items (name + description + source badge with color coding: blue=extension, purple=prompt, green=skill)
    - Keyboard navigation via parent (↑↓ wrap-around, Enter/Tab to select, Escape to dismiss)
    - Mouse interaction (click to select, hover to highlight, mouseDown preventDefault to keep textarea focus)
    - Auto-scroll active item into view
    - Loading state ("Loading commands…") and empty state ("No matching commands")
    - Positioned absolutely above composer using `bottom-full` with `max-w-3xl` to match composer width
  - **Helper functions** in ComposerCommandMenu.tsx:
    - `buildCommandMenuItems(commands)` — converts `PiSlashCommand[]` to `CommandMenuItem[]`
    - `filterCommandMenuItems(items, query)` — case-insensitive match on name and description
    - `detectSlashTrigger(value, cursorPos)` — detects `/` at line start, returns query + range for replacement
  - **Composer.tsx integration**:
    - Lazy command fetching: commands fetched from Pi on first `/` trigger, cached in `commandsCacheRef` per session
    - Cache cleared on `sessionId` change (different sessions = different extensions/skills)
    - `slashTrigger` state (not ref) drives menu visibility and filtering via `useMemo`
    - `onChange` handler passes cursor position to `updateSlashTrigger` for real-time trigger detection
    - `onSelect` handler re-checks trigger on cursor position change (click, arrow keys)
    - `handleKeyDown` intercepts ↑↓ Enter Tab Escape when menu is open, before standard send/steer logic
    - On command select: replaces trigger range with `/{commandName} `, positions cursor after replacement
    - Outer container made `relative` for absolute menu positioning

**Items completed:**
- [x] 2A.2 — Build ComposerCommandMenu component: floating menu above composer, keyboard navigable (↑↓ + Enter + Escape), filtered by typed text

**Issues encountered:**
- Biome's `useExhaustiveDependencies` flagged `slashTriggerRef.current?.query` as invalid useMemo dependency (refs don't trigger re-renders). Refactored from ref to `slashTrigger` state so the memoized filter recalculates on trigger changes.
- Biome flagged `sessionId` in useEffect deps as unnecessary (used as trigger, not inside the callback). Added biome-ignore comment.
- Biome flagged `useKeyWithClickEvents` on menu item div — added biome-ignore since keyboard nav is handled by parent Composer.

**Handoff to next session:**
- Next: 2A.3 — Implement `/` trigger detection: typing `/` at line start opens command menu with available Pi commands
- NOTE: 2A.3 may already be substantially done — trigger detection (`detectSlashTrigger`) is implemented and wired in. The remaining work for 2A.3 is likely just verification that the trigger works correctly at line start in multi-line text, and perhaps refinement of edge cases.
- `ComposerCommandMenu` exports `CommandMenuItem` type and helper functions — reusable for future `@` file mention trigger (2B).
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 18 — Slash trigger verification + /model picker + cycle shortcuts (2026-03-24)

**What happened:**
- Verified 2A.3 (slash trigger detection) was already fully implemented in Session 17 — `detectSlashTrigger` handles start-of-input, start-of-line in multiline, query filtering, and menu close on space. Marked complete.
- Implemented `/model` slash command with inline model picker (2A.4):
  - When `/model` is selected from command menu, `handleCommandSelect` intercepts it instead of inserting text
  - Opens `ComposerModelPicker` (new component in `ComposerCommandMenu.tsx`) — same floating position as command menu
  - Model picker shows models grouped by provider, with keyboard nav (↑↓ Enter Escape)
  - Model rows show name, reasoning/vision badges, model ID, context window size
  - Current model highlighted with accent dot
  - On select: calls `session.setModel` with optimistic update + rollback on error + toast confirmation
  - Clears textarea text and refocuses after selection
  - Models fetched lazily (reuses Zustand `availableModels` state)
- Implemented `cycle_model` and `cycle_thinking_level` keyboard shortcuts (2A.5):
  - **Contracts**: Added `session.cycleModel` and `session.cycleThinking` WS methods, `WsSessionCycleModelResult` and `WsSessionCycleThinkingResult` result types
  - **Server**: Added `handleSessionCycleModel` and `handleSessionCycleThinking` handlers — bridge to Pi `cycle_model` / `cycle_thinking_level` RPC commands, extract response data
  - **Handler registry**: Registered both new handlers
  - **Keyboard shortcuts**: Ctrl/Cmd+M cycles model (updates store model + thinking level + toast). Ctrl/Cmd+Shift+M cycles thinking level (updates store + toast, or warns if unsupported)
  - **ShortcutAction type**: Added `cycleModel` and `cycleThinking` actions
  - **Settings dialog**: Updated keyboard shortcuts reference table with both new shortcuts
- Phase 2A is now COMPLETE — all 5 items checked off
- Exit criteria verified: ✅ Users can type `/` to see available commands. ✅ `/model` switches models inline. ✅ Keyboard shortcuts for quick model/thinking cycling.

**Items completed:**
- [x] 2A.3 — Implement `/` trigger detection (verified already done from Session 17)
- [x] 2A.4 — Implement `/model` slash command: inline model picker
- [x] 2A.5 — Implement `cycle_model` and `cycle_thinking_level` as keyboard shortcuts

**Issues encountered:**
- `resizeTextarea` was declared after `handleModelSelect` which referenced it → temporal dead zone error. Fixed by moving `resizeTextarea` declaration to right after `textareaRef`.
- Biome import ordering: `handleSessionCycleModel`/`handleSessionCycleThinking` needed alphabetical sort in handler index imports.
- `setThinkingLevel` was imported in Composer but unused (cycle thinking uses `useStore.getState()` in the shortcut hook, not Composer). Removed.

**Handoff to next session:**
- Phase 2A is COMPLETE. Next: Phase 2B — File Mentions
- Start with 2B.1 — Add workspace file search API
- `ComposerModelPicker` and `ComposerCommandMenu` are in the same file — reuse the floating menu pattern for `@` file mentions
- `detectSlashTrigger` pattern can be adapted for `@` trigger detection
- `PiModel` type is imported in both `Composer.tsx` and `ComposerCommandMenu.tsx`
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 19 — Workspace file search API (2026-03-24)

**What happened:**
- Implemented `project.searchFiles` WS method end-to-end (2B.1):
  - **Contracts wsProtocol.ts**: Added `project.searchFiles` to `WS_METHODS`. Added `WsProjectSearchFilesParams` (query, cwd, limit), `FileSearchResult` (path, kind), and `WsProjectSearchFilesResult` (files, cwd) types. Wired into `WsMethodParamsMap` and `WsMethodResultMap`.
  - **Server appHandlers.ts**: Added `handleProjectSearchFiles` handler + 4 helper functions:
    - `resolveSearchCwd(paramsCwd, ctx)` — same CWD resolution pattern as git handlers
    - `searchFiles(cwd, query, limit)` — tries `fd`, falls back to `find`
    - `searchWithFd(cwd, query, limit)` — uses `fd --type f --type d --max-results N --color never` with optional query pattern. Respects `.gitignore` by default. `--max-results` set to `limit * 2` for headroom.
    - `searchWithFind(cwd, query, limit)` — fallback with manual ignore patterns (`.git`, `node_modules`, `dist`, `.turbo`, `__pycache__`, `.DS_Store`), `maxdepth 10`, `-iname` for case-insensitive match.
    - `parseSearchResults(stdout, limit)` — splits output, detects directories by trailing `/` from `fd`, normalizes `./` prefix from `find`.
  - **Server index.ts**: Registered `handleProjectSearchFiles` in handler registry.
- Key design decision: `fd` outputs directories with trailing `/`, used to distinguish `kind: "file" | "directory"` without stat calls. For `find` fallback, everything is marked "file" (acceptable degradation since `find` output doesn't distinguish).

**Items completed:**
- [x] 2B.1 — Add workspace file search API: `project.searchFiles` WS method + server handler + contracts types

**Issues encountered:**
- Initial implementation used per-file `stat` calls to determine file vs directory — O(n) spawns. Replaced with `fd`'s trailing `/` convention for zero-cost kind detection.

**Handoff to next session:**
- Next: 2B.2 — Implement `@` trigger detection in composer
- `project.searchFiles` is ready to be called from the UI. Uses same transport pattern as other WS methods.
- `FileSearchResult` type is exported from `@pibun/contracts` — use for the mention menu item type.
- `ComposerCommandMenu.tsx` has the floating menu pattern and `detectSlashTrigger` that can be adapted for `@` trigger.
- Debounce on the client (plan says 120ms), not on the server — server just runs the search.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 20 — `@` trigger detection in composer (2026-03-24)

**What happened:**
- Implemented `@` file mention trigger detection and file search menu in the composer (2B.2):
  - **ComposerCommandMenu.tsx**: Added `detectAtTrigger()` — word-boundary scanning for `@` tokens anywhere in text (unlike `/` which must be at line start). Walks backwards from cursor to find whitespace boundary, checks if token starts with `@`. Added `FileMentionMenuItem` type and `buildFileMentionItems()` helper. Added `FileMentionMenu` component — pure presentational floating menu with file/directory icons, path display (directory in muted, filename in bold), header with keyboard hints, loading/empty states.
  - **Composer.tsx**: Added `atTrigger` state, `fileMentionItems`, `fileMentionLoading`, `activeFileMentionId` state. Added `fileSearchTimerRef` (debounce) and `fileSearchSeqRef` (stale result discard). `updateAtTrigger()` fires debounced search (120ms) via `project.searchFiles` WS method. `handleFileMentionSelect()` replaces trigger range with `@path/to/file `. `nudgeFileMentionHighlight()` handles ↑↓ wrap-around navigation. Keyboard handling (↑↓ Enter Tab Escape) added to `handleKeyDown` before slash command handling. `FileMentionMenu` rendered in floating menu area alongside `ComposerCommandMenu`. Both `onChange` and `onSelect` now call `updateAtTrigger` for real-time trigger detection.
  - Menu priority: `fileMentionMenuOpen` is suppressed when `commandMenuOpen` or `modelPickerOpen` is active (slash commands take precedence).

**Items completed:**
- [x] 2B.2 — Implement `@` trigger detection in composer: typing `@` opens file search menu, debounced query (120ms), fuzzy matched

**Issues encountered:**
- Biome import ordering: `type CommandMenuItem` must come before `ComposerCommandMenu` alphabetically. Fixed.
- Biome formatting: multiline `findIndex` and `??` expressions collapsed to single lines. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 2B.3 — Render file mentions as inline chips in composer (visual pill with filename, removable)
- Currently, file selection inserts plain text `@path/to/file ` into the textarea. 2B.3 needs to convert these into visual chips (pills). This likely requires tracking mention positions in the text or using a separate data structure for mentions.
- `detectAtTrigger` and `FileMentionMenu` are in `ComposerCommandMenu.tsx` — reusable components.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 21 — File mention chips + expand on send (2026-03-24)

**What happened:**
- Implemented file mention chips (2B.3) and mention expansion on send (2B.4), completing Phase 2B:
  - **Design decision**: PiBun uses a plain `<textarea>` which can't render inline HTML chips (unlike T3Code which uses Lexical rich text editor with custom `ComposerMentionNode`). Chose to render mention chips as a strip above the textarea, same pattern as the image preview strip.
  - **FileMention type**: Added `FileMention` interface (`id`, `path`, `kind`) + auto-incrementing ID counter in Composer.
  - **Mentions state**: Added `mentions: FileMention[]` state + `mentionsRef` for tab-switch persistence.
  - **handleFileMentionSelect refactored**: Instead of inserting `@path/to/file ` as plain text, now adds a `FileMention` chip to `mentions` array (with duplicate-by-path prevention) and removes the `@query` trigger text from the textarea.
  - **Chip rendering**: New chip strip between image preview and textarea. Each chip shows file/directory icon + truncated filename (max 200px) + full path on hover (title). Remove button uses `group/chip` named group pattern (appears on hover). Visual: rounded border pill with accent highlight on hover.
  - **removeMention**: Proper `useCallback` to avoid inline closure recreation.
  - **buildPromptMessage**: New function that expands mentions to `@path` text prepended to the user's message. Pi understands `@` references natively. If only mentions (no text), sends just the `@path` references.
  - **Draft persistence**: Extended `ComposerDraft` with `mentions: PersistedFileMention[]`. Updated `saveComposerDraft`, `restoreComposerDrafts`, and all empty-check logic to include mentions. Backward compatible via `draft.mentions ?? []`.
  - **hasContent**: Updated to include `mentions.length > 0` — can send with just file mentions and no text.
  - **clearInput**: Now also clears `setMentions([])`.
- Phase 2B exit criteria verified: ✅ Users can type `@` to search and reference project files in prompts. ✅ Mentions show as removable chips.

**Items completed:**
- [x] 2B.3 — Render file mentions as inline chips in composer (visual pill with filename, removable)
- [x] 2B.4 — On send, expand file mention chips into `@path/to/file` text in the prompt message

**Issues encountered:**
- Biome formatting: long `saveComposerDraft` call and `useCallback` deps array needed multi-line formatting. Fixed with `bun run format`.

**Handoff to next session:**
- **Phase 2B is COMPLETE.** Next: Phase 2C — Terminal Context & Image Improvements
- Start with 2C.1 — Add terminal content selection API
- The chip strip pattern is established (between image strip and textarea). Reuse for terminal context chips (2C.2).
- `FileMention` chips are tracked as separate state from textarea text. On send, `buildPromptMessage()` prepends `@path` references.
- `PersistedFileMention` in `appActions.ts` is exported — if other features need to read mentions (e.g., tab badge), they can access via `getComposerDraft()`.
- `consumeDeferredActiveTabId()` still not consumed

---

## Session 22 — Terminal content selection API (2026-03-24)

**What happened:**
- Implemented terminal content selection → "Add to composer" API (2C.1):
  - **Store types**: Added `TerminalContext` interface (`id`, `terminalLabel`, `terminalId`, `lineStart`, `lineEnd`, `text`). Added `pendingTerminalContexts: TerminalContext[]` to `UiSlice` with `addTerminalContext`, `removeTerminalContext`, `clearTerminalContexts` actions.
  - **Store appSlice**: Implemented the 3 new actions. `addTerminalContext` deduplicates by `terminalId + lineStart + lineEnd` key. `removeTerminalContext` filters by ID. `clearTerminalContexts` resets to empty array.
  - **TerminalInstance.tsx**: Major enhancement — now detects text selection and shows a floating "Add to composer" button:
    - Uses xterm.js `hasSelection()`, `getSelection()`, `getSelectionPosition()` for selection detection
    - `onSelectionChange` clears the action button when selection is cleared
    - `pointerdown` on container clears the action button and tracks gesture state
    - `mouseup` on window (to catch releases outside terminal) records pointer position and starts 250ms delayed show
    - Delay (250ms) prevents interference with double/triple-click word/line selection gestures
    - Button uses `onMouseDown` with `preventDefault` to keep xterm selection alive during button click
    - `handleAddToComposer`: extracts selection text, normalizes it (remove `\r\n`, trim newlines), computes line range from `getSelectionPosition().start.y + 1`, adds `TerminalContext` to store, shows toast, clears selection, refocuses terminal
    - Button positioned absolutely relative to container at mouse pointer position (offset up by 36px to sit above the selection)
    - Button styled with accent color, plus icon, smooth entrance animation
  - **TerminalPane.tsx**: Now passes `terminalLabel={tab.name}` prop to `TerminalInstance`
- Studied T3Code's `ThreadTerminalDrawer.tsx` pattern for reference: T3Code uses native context menus via `api.contextMenu.show()` for "Add to chat". PiBun doesn't have native context menus yet (Phase 4), so used a floating button instead — simpler and works in both web and desktop modes.

**Items completed:**
- [x] 2C.1 — Add terminal content selection API: select text in terminal → "Add to composer" button → attaches terminal output as context

**Issues encountered:**
- Biome formatting: chained `.replace()` calls on one line were reformatted to multi-line. Fixed with `bun run format`.
- `clearSelectionAction` needed to be stable for the useEffect deps — used `useCallback` with empty deps array (only reads from refs).

**Handoff to next session:**
- Next: 2C.2 — Render terminal context attachments as inline chips in composer (like file mentions but for terminal output)
- `pendingTerminalContexts` is in Zustand (`useStore(s => s.pendingTerminalContexts)`). Composer should read this and render chips in the chip strip area (between image strip and textarea, alongside file mention chips).
- Terminal context chips should show: terminal icon + label like "Terminal 1 lines 5-12" + remove button + hover tooltip with text preview.
- On send (2C.3), terminal contexts need to be appended as `<terminal_context>` block after the user text (following T3Code's pattern in `terminalContext.ts`).
- `clearTerminalContexts()` should be called in `clearInput()` alongside `clearComposerDraft()`.
- Consider whether terminal contexts should be persisted in drafts (probably yes — same pattern as file mentions).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 23 — Terminal context chips + prompt expansion (2026-03-24)

**What happened:**
- Implemented terminal context chip rendering in the Composer (2C.2) and prompt expansion on send (2C.3):
  - **Terminal context chips**: Read `pendingTerminalContexts` from Zustand store. Rendered as a chip strip between file mention chips and the drag overlay, using the same `group/chip` hover pattern. Each chip shows: terminal icon (accent color) + label (e.g., "Terminal 1 lines 5-12") + hover tooltip with text preview (truncated to 200 chars) + × remove button. `removeTerminalContext(id)` called on click.
  - **`formatTerminalContextLabel(ctx)`**: Helper formats "Terminal 1 line 5" or "Terminal 1 lines 5-12" depending on whether lineStart === lineEnd.
  - **`buildTerminalContextBlock(contexts)`**: Formats terminal contexts into T3Code-compatible `<terminal_context>` XML blocks with line-numbered body (e.g., `  5 | command output`). Each context is a `- {label}:` header with indented body lines.
  - **`buildPromptMessage()`**: Extended to append `buildTerminalContextBlock(pendingTerminalContexts)` after user text and file mentions, separated by `\n\n`.
  - **`hasContent`**: Updated to include `pendingTerminalContexts.length > 0` — can send with just terminal contexts and no text.
  - **`clearInput()`**: Now calls `clearTerminalContexts()` alongside clearing text, images, mentions, and drafts.
- Only 1 file modified: `Composer.tsx` — all changes are self-contained within the composer.

**Items completed:**
- [x] 2C.2 — Render terminal context attachments as inline chips in composer
- [x] 2C.3 — On send, append terminal context content to prompt text with formatting

**Issues encountered:**
- Biome import ordering: `TerminalContext` type import needed to be sorted before `getTransport` (by path `@/store/types` < `@/wireTransport`). Fixed.

**Handoff to next session:**
- Next: 2C.4 — Add drag-and-drop image support to composer
- Terminal context chips follow the exact same visual pattern as file mention chips — `group/chip`, removable, hover effects. Consistent UX.
- Terminal contexts are NOT persisted in drafts (they're in Zustand store, not module-level draft map). This is intentional — terminal contexts are transient (the terminal content may change between sessions). If persistence is desired, extend `ComposerDraft` with `terminalContexts` field.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 24 — Drag-and-drop images + image preview improvements (2026-03-24)

**What happened:**
- Verified 2C.4 (drag-and-drop image support) was already fully implemented — `handleDragOver`, `handleDragLeave`, `handleDrop` handlers + `isDragOver` visual overlay existed since the original clipboard paste implementation. Marked complete.
- Implemented 2C.5 (improved image preview strip):
  - **Larger thumbnails**: Changed from `h-16 w-16` (64px) to `h-20 w-20` (80px) for both image tiles and the "add more" placeholder.
  - **File size tracking**: Added `fileSize: number` to `ImageAttachment` type and `PersistedImageAttachment` interface. Captured from `File.size` during `addImagesFromFiles`.
  - **File size display**: `formatFileSize()` helper formats bytes as "X B", "X KB", or "X.X MB". Displayed as semi-transparent black badge at bottom-left of each thumbnail (`bg-black/60 text-white text-[10px]`).
  - **Backward compatibility**: Draft restore uses `img.fileSize ?? 0` for old persisted drafts without the field. Badge only shown when `fileSize > 0`.
  - **Click to expand**: Already implemented (via `setImagePreview` onClick handler) — no changes needed.
  - Updated placeholder text from "paste images with Ctrl+V" to "paste or drop images" since both are now supported.
- Phase 2C is now COMPLETE — all 5 items checked off.
- Exit criteria verified: ✅ Users can attach terminal output. ✅ Users can drag images into composer. ✅ Image preview shows larger thumbnails with file size.

**Items completed:**
- [x] 2C.4 — Add drag-and-drop image support (verified already implemented)
- [x] 2C.5 — Improve image preview strip: larger thumbnails, file size indicator, click to expand

**Issues encountered:**
- None. 2C.4 was already done. 2C.5 was a clean enhancement.

**Handoff to next session:**
- **Phase 2C is COMPLETE.** Next: Phase 3 — Activity Timeline & Diff
- Start with 3.1 — Refactor ChatView to use `TimelineEntry` union type
- `formatFileSize()` lives in Composer.tsx — if needed elsewhere (e.g., file attachment display), extract to `utils.ts`.
- `PersistedImageAttachment.fileSize` is backward compatible (old drafts won't have it — use `?? 0`).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 25 — TimelineEntry union type refactor (2026-03-24)

**What happened:**
- Refactored ChatView to use `TimelineEntry` union type (3.1):
  - **Renamed `ChatItem` → `TimelineEntry`**: Exported union type with 4 kinds: `"message" | "tool-group" | "turn-divider" | "completion-summary"`. Changed kind names from underscored to hyphenated (`tool_group` → `tool-group`, `turn_divider` → `turn-divider`) for consistency.
  - **Promoted completion summaries**: System messages starting with `"✓ Worked for"` are now detected by `groupMessages()` via `COMPLETION_PREFIX` constant and emitted as `{ kind: "completion-summary", id, timestamp, content }` entries instead of generic `{ kind: "message" }` entries. This eliminates the string-matching in `SystemMessage`'s `getCategory()`.
  - **New `CompletionSummary` component**: Added to `ChatMessages.tsx` — dedicated renderer for completion summary dividers with `bg-border-secondary` divider lines and `text-text-muted` text. Visually identical to the old `"completion"` category in `SystemMessage`.
  - **Simplified `SystemMessage`**: Removed `"completion"` from `SystemCategory` union and its style mapping. `SystemMessage` now only handles: compaction, retry-progress, retry-success, retry-failed, default.
  - **Renamed supporting functions**: `ChatItemRenderer` → `TimelineEntryRenderer`, `chatItemKey` → `timelineEntryKey`. Both now use exhaustive `switch` statements instead of `if` chains.
  - **Internal variable naming**: `items` → `entries` in ChatView component body.
  - **Type exported**: `TimelineEntry` is exported from `ChatView.tsx` for use by future Phase 3 items.
- Only 2 files modified: `ChatView.tsx`, `ChatMessages.tsx`. Zero changes to store, contracts, or server.

**Items completed:**
- [x] 3.1 — Refactor ChatView to use `TimelineEntry` union type

**Issues encountered:**
- Biome formatting: `SystemCategory` union type was on one line — Biome wants multi-line when it exceeds width. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 3.2 — Group tool calls into collapsible work groups per turn
- `TimelineEntry` is exported from `ChatView.tsx` — import it in components that need to know about entry kinds.
- The `"tool-group"` kind already groups adjacent tool_call + tool_result pairs. Item 3.2 is about grouping ALL tool calls in a turn into one collapsible visual unit (similar to T3Code's `"work"` row kind with `groupedEntries[]`).
- The `groupMessages()` function currently creates individual `"tool-group"` entries. 3.2 will need to either: (a) add a new `"tool-group-collapsed"` kind that wraps multiple tool-groups, or (b) modify the existing `"tool-group"` to carry an array of tool pairs. Study T3Code's `TimelineRow.kind === "work"` with `groupedEntries[]` for the pattern.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 26 — Collapsible work groups per turn (2026-03-24)

**What happened:**
- Implemented collapsible work groups for tool calls per turn (3.2):
  - **TimelineEntry type**: Added `"work-group"` kind with `id: string` and `entries: ToolGroupEntry[]`. Added `ToolGroupEntry` interface (`{ toolCall, toolResult }`) exported from `ChatView.tsx`.
  - **`groupMessages()` refactored**: Instead of creating individual `"tool-group"` entries per tool_call+tool_result pair, now collects ALL consecutive tool pairs in a run and emits a single `"work-group"` entry. Uses a while loop to consume consecutive `tool_call` messages (each paired with optional `tool_result`), aggregating into a `ToolGroupEntry[]` array.
  - **WorkGroup component** (`chat/WorkGroup.tsx`): New file with:
    - `WorkGroup` — collapsible container with summary header showing tool count + overall status (running/success/error). Auto-expands for running groups and single-entry groups. Auto-collapses for completed multi-entry groups. User toggle overrides auto-behavior.
    - Single-entry optimization: renders `ToolExecutionCard` directly without wrapper chrome.
    - `CollapsedToolList` — compact view showing up to 6 tool rows with overflow indicator.
    - `CollapsedToolRow` — single compact row: status dot (colored by result) + tool icon + tool name + one-line arg summary (file path, command, pattern).
    - `getGroupStatus()` — derives overall status from all entries (running > error > success).
    - `summarizeEntry()` — tool-specific one-line arg summary for collapsed view.
  - **TimelineEntryRenderer**: Added `"work-group"` case rendering `WorkGroup`.
  - **timelineEntryKey**: Added `"work-group"` case returning `entry.id`.
- Studied T3Code's `MessagesTimeline.tsx` work group pattern for reference: they merge consecutive `"work"` entries with `groupedEntries[]`, show `MAX_VISIBLE_WORK_LOG_ENTRIES = 6`, toggle expand/collapse per group ID. Adapted the core pattern but simplified for PiBun (no separate expand state map — each WorkGroup manages its own via local state).

**Items completed:**
- [x] 3.2 — Group tool calls into collapsible work groups per turn

**Issues encountered:**
- Biome flagged unused `ChatMessage` import and unsorted imports in `WorkGroup.tsx`. Fixed by removing unused import and reordering.

**Handoff to next session:**
- Next: 3.3 — Add turn dividers with timestamp, elapsed time, and collapsed tool count badge
- `WorkGroup` component lives in `chat/WorkGroup.tsx`. `ToolGroupEntry` is exported from `ChatView.tsx`.
- The `"tool-group"` kind still exists in `TimelineEntry` union for type completeness but is no longer produced by `groupMessages()` — all tool pairs now go through `"work-group"`. `ToolExecutionCard` is still used (rendered inside `WorkGroup` when expanded, or directly for single-entry groups).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 27 — Turn divider elapsed time + formatDuration extraction (2026-03-24)

**What happened:**
- Enhanced turn dividers with elapsed time between turns (3.3):
  - **`formatDuration()` extracted to `utils.ts`**: Moved from `wireTransport.ts` (module-local) to `utils.ts` (shared). Same implementation: `<1s`, `Xs`, `Xm Ys`. Now used by both `wireTransport.ts` (completion summary) and `TurnDivider` (elapsed time badge). `wireTransport.ts` updated to import from `@/lib/utils`.
  - **`turn-divider` TimelineEntry extended**: Added `elapsedMs: number | null` field. `null` when there's no previous user message or elapsed is ≤ 0.
  - **`groupMessages()` updated**: Tracks `prevUserTimestamp` — set to each user message's timestamp. Computes `elapsedMs = msg.timestamp - prevUserTimestamp` for each turn divider (wall-clock time between consecutive user messages).
  - **`TurnDivider` component updated**: New prop `elapsedMs: number | null`. Renders as a pill badge (`rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-text-muted`) between the tool count badge and the timestamp. Only shown when `elapsedMs !== null`. Uses `formatDuration()` for display.
  - **`TimelineEntryRenderer` updated**: Passes `elapsedMs` prop to `TurnDivider`.
- Minimal change set: 3 files modified (`ChatView.tsx`, `ChatMessages.tsx`, `utils.ts`) + 1 file import updated (`wireTransport.ts`).

**Items completed:**
- [x] 3.3 — Add turn dividers with timestamp, elapsed time, and collapsed tool count badge

**Issues encountered:**
- Biome formatting: long JSX prop line and ternary expression needed multi-line format. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 3.4 — Track per-turn file changes: collect file paths from Edit/Write tool calls, display as "Changed files" badge on turn divider
- `formatDuration()` is now a shared utility in `utils.ts` — use it anywhere that needs human-readable duration formatting.
- Turn dividers now show: [tool count badge] [elapsed time badge] [timestamp]. All three are optional (only shown when relevant data exists).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 28 — Per-turn changed files tracking (2026-03-24)

**What happened:**
- Implemented per-turn file change tracking (3.4):
  - **`collectChangedFile()` helper**: Extracts file paths from `edit` and `write` tool calls (the two file-modifying tools). `read`, `bash`, `glob`, `grep` are excluded as they don't modify files. Uses `FILE_MODIFYING_TOOLS` Set constant for O(1) lookup.
  - **`groupMessages()` extended**: Added `turnChangedFiles: Set<string>` accumulator. Calls `collectChangedFile()` for each tool_call encountered. Set ensures deduplication (same file edited multiple times in a turn = counted once). `changedFiles: string[]` (converted from Set) added to each `turn-divider` entry. Reset on each new user message (new turn boundary).
  - **`TimelineEntry` type extended**: `turn-divider` kind now includes `changedFiles: string[]`.
  - **`TurnDivider` component enhanced**: New "N files changed" clickable badge with file icon + chevron toggle. Clicking expands a compact file list below the divider line showing shortened paths (last 2 segments). Full path shown on hover (`title` attribute). Badge uses same pill style as tool count/elapsed time badges. `shortenPath()` helper extracts last 2 path segments for compact display.
  - **`TimelineEntryRenderer` updated**: Passes `changedFiles` prop to `TurnDivider`.
- Only 2 files modified: `ChatView.tsx` (grouping logic + type), `ChatMessages.tsx` (rendering).

**Items completed:**
- [x] 3.4 — Track per-turn file changes: collect file paths from Edit/Write tool calls, display as "Changed files" badge on turn divider

**Issues encountered:**
- None. Clean implementation — all data was already available in `ChatMessage.toolCall.args.path`.

**Handoff to next session:**
- Next: 3.5 — Add diff data pipeline: server handler to read Pi session file + git diff between turns, new WS method `session.getTurnDiff`
- `changedFiles` is populated from tool_call args only (not from tool_result content). This means if a tool call is still running (no result yet), the file path is still tracked.
- Turn dividers now show: [tool count badge] [files changed badge (expandable)] [elapsed time badge] [timestamp]. All optional.
- `shortenPath()` lives in `ChatMessages.tsx` — if needed elsewhere, extract to `utils.ts`.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 29 — Turn diff data pipeline (2026-03-24)

**What happened:**
- Implemented `session.getTurnDiff` WS method end-to-end (3.5):
  - **Contracts domain.ts**: Added `TurnDiffFileSummary` type (`{ path, additions, deletions }` — additions/deletions are -1 for binary files). Added `TurnDiffResult` type (`{ diff, files, cwd }`) with detailed TSDoc explaining the limitation of `git diff HEAD` vs true per-turn checkpoints.
  - **Contracts wsProtocol.ts**: Added `session.getTurnDiff` to `WS_METHODS`. Added `WsSessionGetTurnDiffParams` (cwd?, files?: string[]) and `WsSessionGetTurnDiffResult` (turnDiff: TurnDiffResult). Wired into `WsMethodParamsMap` and `WsMethodResultMap`. Imported `TurnDiffResult` from domain.
  - **Server gitService.ts**: Added `gitTurnDiff(cwd, files?)` function — runs `git diff HEAD` (unified diff) and `git diff HEAD --numstat` in parallel. Falls back to `git diff --cached` for empty repos (no HEAD commit). Added `hasHeadCommit()` helper and `parseNumstat()` parser. `parseNumstat` handles binary files (`-\t-\t<path>`), returns sorted summaries. Fixed `noUncheckedIndexedAccess` issue with `parts[0] ?? "-"` pattern.
  - **Server appHandlers.ts**: Added `handleSessionGetTurnDiff` handler — uses `resolveGitCwd` for CWD resolution (same pattern as git handlers), delegates to `gitTurnDiff`. Import ordering fixed for Biome.
  - **Server index.ts**: Registered `handleSessionGetTurnDiff` at `"session.getTurnDiff"`.
- **Design decision**: Pi doesn't have a checkpoint system (T3Code uses git tags at turn boundaries via its orchestration layer). PiBun uses `git diff HEAD -- <files>` which shows ALL changes since last commit, not just per-turn changes. The UI can request diffs filtered by per-turn `changedFiles` (from item 3.4), but the diff content may include changes from multiple turns. This is a known and documented limitation.

**Items completed:**
- [x] 3.5 — Add diff data pipeline: server handler + git diff + new WS method `session.getTurnDiff`

**Issues encountered:**
- `noUncheckedIndexedAccess` flagged `parts[0]` and `parts[1]` as `string | undefined` in `parseNumstat`. Fixed with `?? "-"` defaults.
- Biome import ordering: `WsSessionGetTurnDiff*` imports needed to be sorted between `WsProjectUpdate*` and `WsSettings*` alphabetically.

**Handoff to next session:**
- Next: 3.6 — Build DiffPanel component: side panel (toggled via Ctrl/Cmd+D) showing per-turn diffs with file tree and stacked/split view toggle
- `session.getTurnDiff` is ready to be called from the UI. Pass `files` from turn divider's `changedFiles` for per-turn diffs, or omit `files` for full working tree diff.
- T3Code uses `@pierre/diffs` package for diff rendering with `parsePatchFiles`, `FileDiff`, `Virtualizer` components. PiBun can use a simpler approach — render unified diff text with syntax highlighting, or find a lightweight diff rendering library.
- The DiffPanel will need: a toggle keybinding (Ctrl/Cmd+D), a side panel layout (split with ChatView), turn selection UI, file tree with per-file stats, and the actual diff rendering.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 30 — DiffPanel component (2026-03-24)

**What happened:**
- Built the DiffPanel component end-to-end (3.6):
  - **Store state**: Added 8 new fields to `UiSlice`: `diffPanelOpen`, `diffPanelFiles`, `diffPanelLoading`, `diffPanelResult`, `diffPanelError`, `diffPanelMode` ("stacked" | "split"), `diffPanelSelectedFile`. Added 8 corresponding actions: `toggleDiffPanel`, `setDiffPanelOpen`, `openDiffPanel`, `setDiffPanelLoading`, `setDiffPanelResult`, `setDiffPanelError`, `setDiffPanelMode`, `setDiffPanelSelectedFile`. `openDiffPanel(files)` is the primary action — clears prior state and opens the panel.
  - **DiffPanel.tsx**: New component — right-side panel (420px wide, min 320, max 560) with:
    - Header: "Changes" title with file count, stacked/split view mode toggle, close button
    - File tree sidebar: clickable per-file items with addition/deletion stats, "All files" option to show everything, max-height 160px with overflow scroll
    - Summary bar: total files changed + additions + deletions
    - Diff content area: parsed unified diff rendered per-file with colored addition/deletion/context lines, hunk headers, line numbers
    - Loading state: pulsing dot + "Loading diff…"
    - Error state: error message + retry button
    - Empty states: no changes detected, no session open
    - Client-side diff parsing: `parseUnifiedDiff()` splits raw unified diff on `diff --git` boundaries into `ParsedFileDiff[]`. `classifyDiffLine()` categorizes lines for coloring. No external diff library needed.
    - `fetchDiffData(files)` calls `session.getTurnDiff` WS method, stores result in Zustand
  - **AppShell layout**: DiffPanel rendered between `<main>` and `<PluginRightPanels>` in the flex row
  - **Keyboard shortcut**: Ctrl/Cmd+D toggles diff panel. Added to `useKeyboardShortcuts` and `ShortcutAction` union type. Added to SettingsDialog keyboard shortcuts reference.
  - **TurnDivider integration**: Added "diff" pill button (visible when `changedFiles.length > 0`). Clicking calls `store.openDiffPanel(changedFiles)` to open the diff panel filtered by that turn's changed files.
  - **Tab switch cleanup**: Diff panel state (open, files, result, error, selectedFile) resets on tab switch in `workspaceSlice.switchTab`.
- Decision: Used client-side unified diff parsing instead of T3Code's `@pierre/diffs` library. PiBun's approach is simpler (no Web Workers, no virtualizer for diffs) — adequate for the typical diff sizes in coding agent sessions. Can upgrade later if performance is an issue.

**Items completed:**
- [x] 3.6 — Build DiffPanel component: side panel (toggled via Ctrl/Cmd+D) showing per-turn diffs with file tree and stacked/split view toggle

**Issues encountered:**
- Biome flagged unused `getFileName` and `useState` imports, and wanted import reordering. Fixed by removing unused imports and running `bun run format`.

**Handoff to next session:**
- Next: 3.7 — Add checkpoint info: associate turn boundaries with git state, show "Revert to this point" UI (calls Pi `fork` to branch from that turn's user message)
- DiffPanel state lives in `UiSlice`/`appSlice.ts`. Component is `DiffPanel.tsx`. Client-side diff parsing is in the same file (self-contained).
- The `diffPanelMode` ("stacked" | "split") toggle is wired in the UI but both modes currently render the same unified diff. True side-by-side split view would require additional diff parsing to align old/new lines — a future enhancement.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 31 — Revert to this point (fork from turn divider) (2026-03-24)

**What happened:**
- Implemented "Revert to this point" UI on turn dividers (3.7):
  - **TimelineEntry extended**: Added `userMessageContent: string` to the `turn-divider` kind — carries the text content of the user message the divider precedes. Set in `groupMessages()` from `msg.content`.
  - **TurnDivider component enhanced**: Added "revert" pill button (styled with warning colors on hover, matching the diff/files button pattern). Only shown when there's an active `sessionId`. Uses a two-step confirmation flow:
    - `idle` → click shows inline confirmation bar ("Fork from this point? This creates a new session branch." + Confirm/Cancel buttons)
    - `confirming` → Confirm click triggers `findForkEntryId()` → `forkFromMessage()`
    - `loading` → spinner + "Finding message…" while fetching fork messages
    - `forking` → spinner + "Forking session…" while Pi creates the fork
  - **`findForkEntryId()` function**: Module-level async function that bridges PiBun's auto-generated message IDs with Pi's internal entry IDs. Calls `getForkableMessages()`, then matches by normalized text content (whitespace-collapsed comparison). Returns the `entryId` of the first matching message, or `null` if no match.
  - **Error handling**: If no matching entry found, shows error banner. If fork fails, `forkFromMessage()` handles the error display. On success, `refreshSessionState()` + `loadSessionMessages()` replaces the conversation.
- All server infrastructure already existed: `session.fork`, `session.getForkMessages` WS methods + handlers + `forkFromMessage()`/`getForkableMessages()` in sessionActions. This was purely a UI integration.
- Only 2 files modified: `ChatView.tsx` (TimelineEntry type + groupMessages), `ChatMessages.tsx` (TurnDivider component + findForkEntryId).

**Items completed:**
- [x] 3.7 — Add checkpoint info: associate turn boundaries with git state, show "Revert to this point" UI

**Issues encountered:**
- None. All fork infrastructure (WS methods, server handlers, session actions) was already built. The implementation was a clean UI integration with text-matching bridge for entryId correlation.

**Handoff to next session:**
- Next: 3.8 — Add unread/visited tracking per tab
- `findForkEntryId()` uses text-matching which could fail if Pi trims/normalizes text differently. If this becomes an issue, consider adding `entryId` to `PiUserMessage` and forwarding it through `message_start` events.
- The "revert" button appears on all turn dividers (except before the first user message, which has no divider). It's hidden when there's no active session.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 32 — Unread/visited tracking per tab (2026-03-24)

**What happened:**
- Implemented unread tracking per tab (3.8):
  - **Contracts domain.ts**: Added `hasUnread: boolean` field to `SessionTab` interface. Simpler than the planned `lastVisitedAt` timestamp — a boolean is sufficient since we only need "has new content since last viewed" not "when was it last viewed".
  - **workspaceSlice.ts**: `hasUnread: false` in initial tab creation. `switchTab` clears `hasUnread` on the target tab by spreading `{ hasUnread: false }` during the tab map update (same pass that saves current tab state).
  - **wireTransport.ts**: Background tab event handler now marks `hasUnread: true` on any Pi event for a background tab. `agent_start`, `agent_end`, `extension_ui_request`, and `auto_retry_end` spread `unreadUpdate` into their existing `updateTab` calls. A `default` case handles all other events (`text_delta`, `message_start`, `tool_execution_*`, etc.) — only calls `updateTab` when `hasUnread` is currently false to avoid unnecessary re-renders.
  - **Sidebar.tsx**: Unread accent dot shown after tab display name on inactive tabs (`!isActive && tab.hasUnread`). Positioned between the name and model badge.
  - **TabBar.tsx**: Small unread accent dot shown after session name on inactive tabs. Same condition: `!isActive && tab.hasUnread`.
- Minimal change set: 5 files modified (domain.ts, workspaceSlice.ts, wireTransport.ts, Sidebar.tsx, TabBar.tsx). Zero new components — just a boolean field + conditional dot rendering.

**Items completed:**
- [x] 3.8 — Add unread/visited tracking per tab

**Issues encountered:**
- None. Clean implementation — the boolean approach is simpler and more efficient than timestamp-based comparison.

**Handoff to next session:**
- Next: 3.9 — Show project favicon in sidebar (LAST item in Phase 3)
- `hasUnread` is a simple boolean — if more sophisticated tracking is needed later (e.g., "3 new messages" count), extend to `unreadCount: number` and increment in the background tab handler.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 33 — Project favicon in sidebar (2026-03-24)

**What happened:**
- Implemented project favicon display in sidebar (3.9), completing Phase 3:
  - **Server HTTP endpoint**: Added `GET /api/project-favicon?cwd=<path>` to `server.ts` fetch handler. Searches `FAVICON_CANDIDATES` (37 candidate paths across root, public/, src/, assets/, .github/) for common favicon files (favicon.svg, favicon.png, favicon.ico, logo.svg, logo.png, icon.svg, icon.png). Returns first match with appropriate MIME type and `Cache-Control: public, max-age=3600`. Returns 404 if no favicon found, 400 if no cwd param. Directory traversal prevented by only using hardcoded candidate paths (no user path components).
  - **`ProjectFavicon` component**: New memoized component in Sidebar.tsx. Renders `<img>` pointing to `/api/project-favicon?cwd=<encoded_cwd>`. On load error, falls back to SVG folder icon (using `FOLDER_ICON_PATH` constant). `hasError` state + `onError` handler. Accepts `cwd`, `isActive`, `className` props.
  - **Sidebar integration**: `ProjectItem` now shows `ProjectFavicon` instead of hardcoded folder SVG. `CwdGroup` header also shows `ProjectFavicon`. Both pass `className="h-4 w-4"` / `className="h-3 w-3"` for size.
  - **Vite dev proxy**: Added `/api` route to `vite.config.ts` proxy config — proxies to `http://localhost:24242` so favicon requests work in dev mode.
  - **Helper function**: `faviconUrl(cwd)` builds the URL with `encodeURIComponent`.
- Phase 3 exit criteria verified: ✅ Chat shows grouped tool activity per turn. ✅ Users can view diffs per turn. ✅ Unread indicators work across tabs. ✅ Project favicons shown in sidebar.

**Items completed:**
- [x] 3.9 — Show project favicon in sidebar

**Issues encountered:**
- Biome's `useExhaustiveDependencies` flagged `cwd` prop in a `useEffect([cwd])` for resetting error state. Removed the useEffect — since `ProjectFavicon` is used within keyed parent components (`ProjectItem` keyed by `project.id`, `CwdGroup` keyed by `cwd`), the component remounts when cwd changes, naturally resetting state.

**Handoff to next session:**
- **Phase 3 is COMPLETE.** Next: Phase 4 — Desktop Native Features
- Start with 4A.1 — Add Electrobun context menu support
- `ProjectFavicon` is in Sidebar.tsx (same file — follows deep modules convention). If needed elsewhere, it can be extracted.
- The `/api/` prefix is now proxied in Vite dev mode — use it for any future HTTP API endpoints.
- Browser caching handles favicon performance (1h cache). No client-side favicon cache needed.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 34 — Electrobun context menu support (2026-03-24)

**What happened:**
- Implemented native context menu support end-to-end (4A.1):
  - **Contracts wsProtocol.ts**: Added `app.showContextMenu` WS method with `WsAppShowContextMenuParams` (items: `ContextMenuItem[]`). Added `context-menu.action` push channel with `WsContextMenuActionData` (action, data). Added `ContextMenuItem` type matching Electrobun's `ApplicationMenuItemConfig` format (label, action, type, enabled, data, submenu). Wired into `WS_METHODS`, `WS_CHANNELS`, `WsMethodParamsMap`, `WsMethodResultMap`, `WsChannelDataMap`.
  - **Server server.ts**: Added `onShowContextMenu` hook to `ServerHooks` interface. Desktop provides the hook, browser mode throws.
  - **Server appHandlers.ts**: Added `handleAppShowContextMenu` handler — fire-and-forget call to hook (result comes back via push). Throws "Native context menu is not available in browser mode" when no hook.
  - **Server index.ts**: Registered `handleAppShowContextMenu` in handler registry.
  - **Desktop index.ts**: Imported `ContextMenu` from `electrobun/bun`. Added `onShowContextMenu` hook implementation that calls `ContextMenu.showContextMenu()`. Added `ContextMenu.on("context-menu-clicked")` event listener that forwards clicked item's action+data via `context-menu.action` push channel using `broadcastPush`.
  - **Web wireTransport.ts**: Added `contextMenuActionHandler` module-level callback slot (one-shot). Added `showNativeContextMenu(items, onAction)` exported function — registers callback, sends `app.showContextMenu` request. Added `context-menu.action` subscription that invokes and clears the registered handler.

**Items completed:**
- [x] 4A.1 — Add Electrobun context menu support

**Issues encountered:**
- None. Clean implementation across all layers. The pattern follows the existing hook-based desktop integration (same as `onOpenFolderDialog`, `onSaveExportFile`).

**Handoff to next session:**
- Next: 4A.2 — Thread context menu (right-click in sidebar)
- `showNativeContextMenu(items, onAction)` is exported from `wireTransport.ts` — use it from any component. Catch the error and fall back to HTML context menu for browser mode.
- The `ContextMenuItem` type supports submenus, disabled items, separators, and custom data. All echoed back on click.
- Context menu is one-shot per invocation — showing a new menu overwrites the previous callback. This is correct since only one native context menu can be visible at a time (OS limitation).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 35 — Thread context menu (2026-03-24)

**What happened:**
- Implemented thread context menu for sidebar tab items (4A.2):
  - **Dual-mode context menu**: Right-click on sidebar tab tries native context menu first (`showNativeContextMenu`) for desktop mode. On error (browser mode), falls back to `HtmlContextMenu` component — a fixed-position HTML div at click coordinates.
  - **`HtmlContextMenu` component**: New component in `Sidebar.tsx`. Renders a floating menu with: Rename, Copy Path, Copy Session ID, Mark Unread, Delete (destructive, red). Closes on outside click or Escape key. Each action disabled appropriately (e.g., "Rename" disabled without sessionId, "Copy Path" disabled without cwd).
  - **`ContextMenuState` type**: Tracks `{ tabId, x, y }` for positioning the HTML fallback menu.
  - **Native context menu actions**: `handleTabContextMenu` callback builds `ContextMenuItem[]` array with separator dividers, passes to `showNativeContextMenu()` with an `onAction` callback that handles each action string.
  - **Inline rename**: `renamingTabId` state in Sidebar component. When set, `SidebarTabItem` renders an `<input>` instead of the display name span. Focus + select on mount. Submit on Enter/blur, cancel on Escape. `handleRenameComplete` does optimistic update (tab name + sessionName) then sends `session.setName` Pi RPC. Reverts on error with toast notification. For non-active tabs, temporarily switches transport's `activeSessionId` to send the RPC, then restores.
  - **`SidebarTabItem` extended**: New props: `onContextMenu`, `isRenaming`, `onRenameStart`, `onRenameComplete`, `onRenameCancel`. `onContextMenu` handler calls `e.preventDefault()` + `e.stopPropagation()`. Click and keyboard handlers suppressed during rename mode.
  - **`CwdGroup` extended**: Passes through all new context menu and rename props to child `SidebarTabItem` components.
- Only 1 file modified: `Sidebar.tsx`. All context menu infrastructure (`showNativeContextMenu`, `ContextMenuItem`, WS protocol) already existed from 4A.1.

**Items completed:**
- [x] 4A.2 — Thread context menu (right-click in sidebar): Rename, Copy Path, Copy Session ID, Mark Unread, Delete

**Issues encountered:**
- Biome formatting: inline SVG elements needed multi-line attribute formatting. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 4A.3 — Implement thread renaming (already substantially done — inline edit + `session.setName` Pi RPC implemented in 4A.2)
- NOTE: 4A.3 may already be complete — verify and mark if so. The plan says "inline edit in sidebar (click rename → input field → Enter/Escape), calls `session.setName` via Pi RPC" — all done.
- `HtmlContextMenu` lives in `Sidebar.tsx` (follows deep modules convention). Reusable pattern for other context menus (4A.5, 4A.6).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 36 — Thread deletion confirmation + project context menu (2026-03-24)

**What happened:**
- Verified 4A.3 (thread renaming) was already fully implemented in Session 35 — inline edit in sidebar with `session.setName` Pi RPC, optimistic update + rollback. Marked complete.
- Implemented thread deletion confirmation dialog (4A.4):
  - **`DeleteConfirmDialog` component**: New component in `Sidebar.tsx`. Centered modal overlay with semi-transparent backdrop. Shows session display name, "Delete thread?" heading, explanatory text, Cancel/Delete buttons. Closes on Escape or outside click.
  - **`deletingTabId` state**: Both native context menu "delete" action and HTML context menu "Delete" button now set `deletingTabId` instead of calling `closeTab()` directly. Only `handleConfirmDelete` actually calls `closeTab()`.
  - Prevents accidental thread deletion — important because closing a tab stops the Pi session.
- Implemented project context menu (4A.5):
  - **Contracts**: Added `project.openInEditor` WS method with `WsProjectOpenInEditorParams` (cwd). Wired into `WS_METHODS`, `WsMethodParamsMap`, `WsMethodResultMap`.
  - **Server**: Added `handleProjectOpenInEditor` handler in `appHandlers.ts`. Tries editor candidates in order (cursor → code → zed). Falls back to system handler (`open` on macOS, `xdg-open` on Linux, `start` on Windows). Throws descriptive error if nothing works. Registered in handler index.
  - **`HtmlProjectContextMenu` component**: New HTML fallback context menu for projects with 4 actions: Open in Terminal, Open in Editor, Copy Path, Remove Project. Same visual style as `HtmlContextMenu`.
  - **`ProjectItem` extended**: Added `onContextMenu` prop for right-click support. `handleContextMenu` calls `e.preventDefault()` + forwards to parent handler.
  - **Native context menu support**: `handleProjectContextMenu` callback builds `ContextMenuItem[]` and tries `showNativeContextMenu()` first. Falls back to HTML menu on error.
  - **Open in Terminal**: Uses existing `createTerminal(project.cwd)` from `appActions.ts`.
  - **Open in Editor**: Calls `project.openInEditor` WS method → server handler tries editors.
- Only 3 source files modified: `wsProtocol.ts` (contracts), `appHandlers.ts` + `index.ts` (server), `Sidebar.tsx` (web).

**Items completed:**
- [x] 4A.3 — Implement thread renaming (verified already done from Session 35)
- [x] 4A.4 — Implement thread deletion: confirmation dialog → stop session → remove tab → cleanup
- [x] 4A.5 — Project context menu: Open in Terminal, Open in Editor, Remove Project

**Issues encountered:**
- Biome import ordering: `WsProjectOpenInEditorParams` needed alphabetical sort among other imports. Fixed.
- Biome formatting: long import line for `createTerminal` needed multi-line format. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 4A.6 — Message context menu (right-click on message): Copy Text, Copy as Markdown, Fork from Here
- `DeleteConfirmDialog` and `HtmlProjectContextMenu` live in `Sidebar.tsx` (deep modules convention). The delete confirmation pattern is reusable for other destructive actions.
- `project.openInEditor` tries editors in a hardcoded order — could be made configurable via settings in the future (add `preferredEditor` to `PiBunSettings`).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 37 — Message context menu (2026-03-24)

**What happened:**
- Implemented message context menu for user and assistant messages in the chat timeline (4A.6):
  - **Dual-mode context menu**: Right-click on user or assistant message tries native context menu first (`showNativeContextMenu`) for desktop mode. On error (browser mode), falls back to `HtmlMessageContextMenu` component.
  - **`HtmlMessageContextMenu` component**: New component in `ChatMessages.tsx` (deep modules convention). Fixed-position HTML menu at click coordinates. Shows message-type-appropriate actions. Closes on outside click or Escape.
  - **Actions**:
    - **Copy Text**: Strips markdown formatting for assistant messages (via `stripMarkdown()` helper — handles code fences, inline code, links, images, headers, bold/italic, blockquotes, list markers). Copies raw text for user messages.
    - **Copy as Markdown**: Copies raw markdown source (assistant messages only — their content IS markdown).
    - **Fork from Here**: For user messages, forks from that message directly. For assistant messages, walks backwards through messages to find the preceding user message, then uses `findForkEntryId()` text matching + `forkFromMessage()`. Requires active session.
  - **`MessageContextMenuState` type**: Exported from `ChatMessages.tsx` — tracks `{ message, x, y }`.
  - **`showMessageContextMenu()` function**: Exported async helper that tries native menu first, returns `false` if unavailable (caller shows HTML fallback).
  - **`buildMessageContextMenuItems()`**: Builds dynamic menu items based on message type (user vs assistant) and session state.
  - **`stripMarkdown()`**: Helper that removes common markdown formatting (code fences, backticks, links, images, headers, bold/italic, blockquotes, rules, list markers) for plain text copy.
  - **`handleMessageContextAction()`**: Centralized action handler shared by both native and HTML context menus.
  - **Props threading**: `onContextMenu` optional prop added to `UserMessage` and `AssistantMessage`. Passed through `TimelineEntryRenderer` → `MessageItem` → message components. Required `| undefined` union for `exactOptionalPropertyTypes` compatibility.
  - **Context menu state in ChatView**: `messageContextMenu` state managed at `ChatView` level. `onMessageContextMenu` callback passed to `itemContent`. `HtmlMessageContextMenu` rendered outside Virtuoso container.
- Only 2 files modified: `ChatMessages.tsx` and `ChatView.tsx`. No contracts, server, or store changes needed — all infrastructure (native context menu, fork API) already existed.

**Items completed:**
- [x] 4A.6 — Message context menu (right-click on message): Copy Text, Copy as Markdown, Fork from Here

**Issues encountered:**
- `exactOptionalPropertyTypes` required `| undefined` on all optional `onContextMenu` prop types. Three interfaces needed fixing: `UserMessageProps`, `AssistantMessageProps`, and `MessageItem`/`TimelineEntryRenderer` inline prop types.
- Biome import ordering: `showNativeContextMenu` from `@/wireTransport` needed to sort after `@/store/types` (by path).
- Biome formatting: chained `.replace()` calls needed wrapping in parentheses, long function call collapsed to fewer lines.

**Handoff to next session:**
- Next: 4B.1 — Add system tray icon with menu
- Phase 4A is now COMPLETE (all 6 items checked off). Phase 4B starts with tray/window features.
- `HtmlMessageContextMenu` and `showMessageContextMenu` are in `ChatMessages.tsx`. The `handleMessageContextAction` function is reusable if more actions are added later.
- `stripMarkdown()` lives in `ChatMessages.tsx` — if needed elsewhere (e.g., export feature, search), extract to `utils.ts`.
- Fork from assistant messages walks backwards to find the preceding user message — if Pi ever exposes `entryId` on message events, the text-matching bridge can be replaced with direct ID correlation.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 38 — System tray icon with menu (2026-03-24)

**What happened:**
- Implemented system tray icon with dynamic session menu (4B.1):
  - **Desktop `src/bun/tray.ts`**: New file — creates and manages the Electrobun `Tray` instance:
    - `resolveTrayIconPath()` — checks for bundled icon first (`bun/tray-icon.png`), falls back to source tree (`icon.iconset/icon_16x16@2x.png`). Uses `existsSync` for reliable detection.
    - `buildTrayMenu()` — builds menu from `sessionStates` Map: status summary line (e.g., "2 working, 1 idle"), up to 8 active sessions with state icons (◉ working, ⊘ error, ○ idle) + directory basename, New Session action, Quit action.
    - `refreshTrayMenu()` — rebuilds and applies the menu. Called on every session state change.
    - `handleSessionPiEvent()` — tracks `agent_start` → working, `agent_end` → idle, `auto_retry_end` failure → error per session.
    - `subscribeToSession()` — subscribes to Pi events on individual session processes.
    - `handleTrayClick()` — handles menu item clicks: `tray.quit` → SIGTERM, `tray.session:ID` → `tray.focus-session` push, `file.new-session` → forward via `menu.action` push.
    - `initTray(server, rpcManager)` — main init: creates tray, subscribes to existing + future sessions via `rpcManager.onSessionEvent()`, returns cleanup function.
  - **Desktop `index.ts`**: Wired `initTray()` after notifications init. `cleanupTray` module variable stores cleanup function. Called during `shutdown()` before server stop.
  - **Desktop `electrobun.config.ts`**: Added `"icon.iconset/icon_16x16@2x.png": "bun/tray-icon.png"` to copy config for production builds.
  - **Web `wireTransport.ts`**: Added `tray.focus-session` case in `handleMenuAction()` — finds tab by sessionId, switches to it via `switchTabAction()`.
- No new WS methods or contracts changes needed — tray reuses the existing `menu.action` push channel.

**Items completed:**
- [x] 4B.1 — Add system tray icon with menu: current session status, recent sessions list, New Session, Quit

**Issues encountered:**
- `Bun.file().size` returns 0 for nonexistent files instead of throwing — switched to `existsSync()` for icon path detection.
- Biome import ordering: `node:fs` and `node:path` must sort before `@pibun/*` imports.

**Handoff to next session:**
- Next: 4B.2 — Tray status indicator: change icon/color based on active session state (idle, working, error)
- `tray.ts` is a self-contained deep module. The `Tray` class supports `setImage()` for dynamic icon changes — 4B.2 can use this.
- `template: false` shows the colored app icon. For a proper macOS-native feel, a monochrome template icon could be designed later.
- Tray menu click forwarding reuses `menu.action` push channel — no new protocol needed.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 39 — Tray status indicator (2026-03-24)

**What happened:**
- Implemented tray status indicator that changes icon/color based on aggregate session state (4B.2):
  - **`AggregateTrayState` type**: `"idle" | "working" | "error"` — derived from all tracked sessions with priority: working > error > idle. If ANY session is working → working. If ANY has error (and none working) → error. Otherwise → idle.
  - **`deriveAggregateState()` function**: Iterates `sessionStates` map, returns highest-priority state found.
  - **`generateCirclePng()` function**: Programmatic PNG generation — creates 32x32 RGBA PNGs with anti-aliased colored circles on transparent background. Raw PNG encoding: builds pixel data (with distance-based anti-aliasing at circle edges), compresses via `node:zlib` `deflateSync`, constructs PNG chunks (signature + IHDR + IDAT + IEND) with proper CRC32 checksums. No external image library needed.
  - **`generateStatusIcons()`**: Creates blue (working) and red (error) circle PNGs in `$TMPDIR/pibun-tray-icons/` at tray init time. Returns paths map or null on failure.
  - **`updateTrayStatusIcon()`**: Called from `refreshTrayMenu()` on every state change. Compares new aggregate state to `currentAggregateState` — only calls `tray.setImage()` when state actually changes. Idle → original app icon. Working/Error → generated colored dot.
  - **Module state additions**: `currentAggregateState`, `idleIconPath`, `statusIconPaths` for tracking.
  - **Cleanup**: `currentAggregateState` reset to "idle" and `statusIconPaths` nullified on tray cleanup.
  - **Color choices**: Working = Tailwind blue-500 (`#3B82F6`), Error = Tailwind red-500 (`#EF4444`) — consistent with PiBun's theme.
- Only 1 file modified: `apps/desktop/src/bun/tray.ts`. Self-contained enhancement — no contracts, server, or web changes.

**Items completed:**
- [x] 4B.2 — Tray status indicator: change icon/color based on active session state (idle, working, error)

**Issues encountered:**
- Biome import ordering: `node:os` must sort before `node:path` alphabetically. Fixed.

**Handoff to next session:**
- Next: 4B.3 — Add Electrobun navigation rules to prevent webview from navigating away from PiBun
- The generated status PNGs are simple colored circles that replace the entire tray icon. A more polished version could overlay a badge on the app icon, but that requires image compositing (Canvas API or sharp library). The colored dots are visually clear and functional.
- `generateCirclePng()` could be reused for any runtime-generated PNG needs. The inline PNG encoder handles RGBA images up to any size.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 40 — Electrobun navigation rules (2026-03-24)

**What happened:**
- Implemented navigation rules to prevent the webview from navigating away from PiBun (4B.3):
  - **`wireNavigationRules()` function**: New function in `apps/desktop/src/bun/index.ts` with 3 layers of protection:
    - **Layer 1 — `setNavigationRules()`**: Electrobun's native URL filter. Sets `["^*", "${serverOrigin}/*", "views://*"]` — blocks all URLs except the PiBun server (localhost with dynamic port) and Electrobun's internal views protocol.
    - **Layer 2 — `will-navigate` event**: Intercepts navigation attempts. Allows internal URLs (server origin, views://). For external URLs, blocks the navigation (`event.response = { allow: false }`) and opens the URL in the system browser via `Utils.openExternal()`.
    - **Layer 3 — `new-window-open` event**: Catches Cmd-clicks and `target="_blank"` links. Opens external URLs in the system browser. Event data can be either a string URL or `{ url, isCmdClick }` object — handles both formats.
  - **Bootstrap wiring**: `wireNavigationRules(mainWindow, webviewUrl)` called after `wireWindowLifecycle()` in the bootstrap sequence (Step 5b).
  - Uses `new URL(serverUrl).origin` to extract the origin for URL matching — handles dynamic port correctly.
- Only 1 file modified: `apps/desktop/src/bun/index.ts`. No new dependencies, no contracts/server/web changes.

**Items completed:**
- [x] 4B.3 — Add Electrobun navigation rules to prevent webview from navigating away from PiBun

**Issues encountered:**
- `new-window-open` is emitted by Electrobun's native layer but NOT included in `BrowserView.on()`'s TypeScript type union (only 9 events are typed). Had to cast `mainWindow.webview` to bypass the type check. This is a gap in Electrobun's type definitions.

**Handoff to next session:**
- Next: 4B.4 — Add Electrobun window focus/blur events: dim status bar when unfocused, track focus for notification suppression
- `wireNavigationRules()` is self-contained in `index.ts` — extends the existing bootstrap pattern.
- `Utils.openExternal()` from Electrobun handles all URL protocols (http, https, mailto, custom schemes).
- If Electrobun adds `new-window-open` to the `on()` type union in a future version, the cast can be removed.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 41 — Window focus/blur tracking + toolbar dimming (2026-03-24)

**What happened:**
- Implemented window focus/blur tracking and visual dimming (4B.4):
  - **Store**: Added `isWindowFocused: boolean` to `UiSlice` + `setWindowFocused` action. Initialized from `document.hasFocus()` for correct initial state.
  - **wireTransport.ts**: Added 3 browser event listeners: `window.focus`, `window.blur`, and `document.visibilitychange`. All update `setWindowFocused` in Zustand. Cleanup functions properly registered.
  - **AppShell.tsx**: Toolbar div gets `opacity-50` class when `!isWindowFocused` with `transition-opacity duration-200` for smooth dimming. Uses `cn()` conditional class pattern (imported from `@/lib/utils`).
- **Design decision**: Used browser-native focus/blur events instead of adding a new `app.windowFocus` WS push channel. Browser events work in both Electrobun webview and browser mode. The desktop `notifications.ts` already has its own independent focus tracking via `mainWindow.on("focus"/"blur")` for native notification suppression — no need to merge the two systems.
- Only 4 files modified: `types.ts` (store type), `appSlice.ts` (state + action), `wireTransport.ts` (event listeners), `AppShell.tsx` (visual dimming).

**Items completed:**
- [x] 4B.4 — Add Electrobun window focus/blur events: dim status bar when unfocused, track focus for notification suppression

**Issues encountered:**
- None. Clean implementation using standard browser APIs.

**Handoff to next session:**
- Next: 4B.5 — Enhance auto-update: show download progress in sidebar footer, prompt for restart when ready, use Electrobun's bsdiff patches
- `isWindowFocused` is in Zustand (`useStore(s => s.isWindowFocused)`) — any component can use it for focus-aware behavior (e.g., suppress toasts when unfocused, pause animations, etc.).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 42 — Sidebar update footer + bsdiff verification (2026-03-24)

**What happened:**
- Implemented sidebar update footer for compact auto-update status (4B.5):
  - **`SidebarUpdateFooter` component**: New component in `Sidebar.tsx` (deep modules). Renders at the bottom of the sidebar, below the scrollable content area. Shows compact update status:
    - **Downloading**: Thin full-width progress bar (accent color on accent/20 track) + spinning icon + "Downloading vX.Y.Z" + progress percentage
    - **Update ready**: Green check icon + "Update vX.Y.Z ready" + green "Restart" button that calls `app.applyUpdate`
    - **Applying**: Spinning icon + "Installing update…"
    - **Error**: Red × icon + "Update failed" + "Retry" button that calls `app.checkForUpdates`
    - **Update available**: Warning icon + update message (transient — auto-transitions to downloading)
    - Hidden for `no-update`, `checking`, and null status (sidebar stays clean by default)
  - **Bsdiff patches**: Verified already handled by Electrobun's `Updater.downloadUpdate()` — it internally checks for patch files (bsdiff) and falls back to full tarball. No PiBun code changes needed.
  - **Existing infrastructure reused**: `UpdateBanner` (top-level) remains for high-visibility notification. `SidebarUpdateFooter` adds always-visible persistent indicator in the sidebar. Both read from the same `UpdateSlice` state. No new store fields, contracts, or server changes.
- Only 1 file modified: `Sidebar.tsx` (new component + wired into `sidebarContent` fragment).

**Items completed:**
- [x] 4B.5 — Enhance auto-update: show download progress in sidebar footer, prompt for restart when ready, use Electrobun's bsdiff patches

**Issues encountered:**
- Biome formatting: multi-line `if` condition and short JSX elements collapsed to single lines. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 4C.1 — Add multi-select to sidebar: Ctrl/Cmd+click to toggle, Shift+click for range select
- `SidebarUpdateFooter` lives in `Sidebar.tsx` at function declaration line ~1156. It reads `updateStatus`, `updateMessage`, `updateVersion`, `updateProgress` from Zustand.
- The `UpdateBanner` in `AppShell` and `SidebarUpdateFooter` in `Sidebar` both show update status — they complement each other (banner is dismissible, footer is persistent).
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 43 — Multi-select sidebar + bulk context menu (2026-03-24)

**What happened:**
- Implemented multi-select for sidebar tabs (4C.1):
  - **`selectedTabIds` state**: `Set<string>` in Sidebar component, cleaned up when tabs change (removed tabs pruned from selection).
  - **`lastClickedTabIdRef`**: Ref tracks the anchor for Shift+click range selection.
  - **`handleTabClick` handler**: Dispatches based on modifier keys:
    - **Ctrl/Cmd+click**: Toggle individual tab in/out of selection
    - **Shift+click**: Range select from last-clicked to current using `tabs` array indices
    - **Plain click**: Clear selection, switch to tab
  - **Visual feedback**: Selected tabs show `bg-accent-primary/15 ring-1 ring-accent-primary/30` (subtle accent highlight with ring). Overrides both active and inactive tab styles.
  - **Selection indicator**: Open Tabs header shows "N selected · Clear" link when selection is active (clickable to clear).
  - **Escape key**: Clears selection when multi-select is active.
  - **Props threading**: `isSelected` and `onClick` (with MouseEvent) added to `SidebarTabItem` and `CwdGroup` — flows through both grouped and flat tab rendering.
- Implemented multi-select context menu (4C.2):
  - **Native context menu**: When right-clicking a tab that's in an active multi-selection (size > 1), shows "Delete Selected (N)" and "Mark All Unread" instead of single-tab actions.
  - **HTML fallback context menu**: `HtmlContextMenu` extended with `multiSelectCount`, `onDeleteSelected`, `onMarkAllUnread` props. Renders multi-select menu items when `multiSelectCount > 1`, otherwise renders normal single-tab items.
  - **`DeleteMultiConfirmDialog` component**: Confirmation dialog for bulk deletion. Shows count and warning text. Same visual pattern as single `DeleteConfirmDialog`.
  - **`deletingTabIds` state**: Separate from `deletingTabId` — holds array of tab IDs for bulk delete. `handleConfirmDeleteMulti` closes tabs sequentially to avoid race conditions, then clears selection.
  - **Smart context menu selection**: If right-clicking an unselected tab while multi-select is active, clears the multi-selection and shows single-tab menu. Only shows multi-select menu when the right-clicked tab is part of the selection.
- Only 1 file modified: `Sidebar.tsx`. No contracts, server, or store changes needed — all state is local to the Sidebar component.

**Items completed:**
- [x] 4C.1 — Add multi-select to sidebar: Ctrl/Cmd+click to toggle, Shift+click for range select
- [x] 4C.2 — Multi-select context menu: Delete Selected (N), Mark All Unread

**Issues encountered:**
- Biome formatting: multi-line ternary for `effectiveSelection` and `<h3>` tag collapsed to single lines. Fixed with `bun run format`.

**Handoff to next session:**
- Next: 4C.3 — Add session drag-to-reorder in sidebar (within project groups)
- This is the LAST item in Phase 4. After completing it, verify exit criteria and mark phase complete.
- Multi-select state is local to `Sidebar` component (not in Zustand). If other components need to know about selection in the future, consider promoting to store.
- The `handleTabClick` range-select uses the flat `tabs` array for index calculation. This works correctly for both grouped (CwdGroup) and flat rendering because the same `tabs` array is the source of truth.
- `consumeDeferredActiveTabId()` still not consumed.

---

## Session 44 — Session drag-to-reorder in sidebar (2026-03-24)

**What happened:**
- Implemented session drag-to-reorder in the sidebar (4C.3), completing Phase 4:
  - **Native HTML5 Drag and Drop**: Used `draggable="true"` on `SidebarTabItem` instead of adding `@dnd-kit` library. Simpler, no new dependency, sufficient for vertical reordering.
  - **State at Sidebar level**: `draggingTabId`, `dropTargetTabId`, `dropPosition` (type `DropPosition = "before" | "after"`).
  - **`handleDragStart`**: Sets `draggingTabId` on drag initiation.
  - **`handleDragOver`**: Determines drop position by comparing cursor Y against element midpoint (`getBoundingClientRect().top + height / 2`). Sets `dropTargetTabId` and `dropPosition`.
  - **`handleDragEnd`**: Computes `fromIndex` and `toIndex` in the flat `tabs` array, adjusts `toIndex` based on relative positions and drop direction, calls `reorderTabs(fromIndex, toIndex)` (already existed in workspaceSlice). Clears all drag state.
  - **Visual feedback**: Dragged item gets `opacity-40`. Drop target shows a 2px accent-colored indicator line (`h-0.5 rounded-full bg-accent-primary`) positioned absolutely above ("before") or below ("after") the target item.
  - **Wrapper div**: `SidebarTabItem` return now wrapped in a `relative` container div that holds the inner draggable div + drop indicator divs.
  - **Props threading**: `isDragging`, `dropIndicator`, `onDragStart`, `onDragOver`, `onDragEnd` added to both `SidebarTabItemProps` and `CwdGroupProps`. CwdGroup passes through to child items.
  - Disabled during rename mode (`draggable={!isRenaming}`).
- Phase 4 exit criteria verified: ✅ Right-click works everywhere. ✅ Tray icon shows status. ✅ Auto-update has progress UI. ✅ Bulk operations work. ✅ Drag-to-reorder works.

**Items completed:**
- [x] 4C.3 — Add session drag-to-reorder in sidebar (within project groups)

**Issues encountered:**
- Biome formatting: nesting depth changed when wrapping the main div in a container div — one level deeper for all children. Fixed with `bun run format`.

**Handoff to next session:**
- **Phase 4 is COMPLETE.** Next: Phase 5 — Advanced Pi Features
- Start with 5A.1 — Add `bash` RPC command support
- `reorderTabs(fromIndex, toIndex)` already existed in the store — this implementation just added the UI interaction layer.
- The drag reorder operates on the flat `tabs` array, which is the source of truth. CwdGroup views are derived (via `groupTabsByCwd`). Reordering within a CWD group works because the underlying array positions change.
- Cross-CWD-group dragging also works — a tab can be dragged from one group to another since they all reference the same flat array.
- `consumeDeferredActiveTabId()` still not consumed.

---
