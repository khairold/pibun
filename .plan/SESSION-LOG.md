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
