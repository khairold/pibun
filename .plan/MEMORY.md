# Shared Memory

> Context and decisions that **every session must know**. Read this at the start of every session.
> This is v3 memory — builds on top of v2 (archived at `.plan/archive/MEMORY-v2.md`, 200+ decisions).

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | v3 plan focuses on feature parity with T3Code, Pi RPC completeness, and Electrobun leverage | Audit of 3 reference repos identified ~50 feature gaps across UI/UX, Pi features, and native desktop | 2026-03-24 |
| 2 | Phase order: polish → composer → timeline → desktop → advanced | High-impact visible UX first. Server-side features deferred until UI patterns are established. Desktop native features after web UX is solid. | 2026-03-24 |
| 3 | T3Code's orchestration layer (event sourcing, decider/projector, SQLite persistence) is NOT adopted | T3Code's server is 10x more complex because it manages state server-side. PiBun's thin bridge is correct — Pi handles state. Don't replicate T3Code's architecture. | 2026-03-24 |
| 4 | Composer command menu pattern from T3Code, not shadcn Command | T3Code uses a custom floating menu with trigger detection. This is simpler and more appropriate than a full command palette (cmdk). Menu appears inline above composer. | 2026-03-24 |
| 5 | File mentions expand to `@path/to/file` text on send | Pi's prompt handler understands `@` references natively (from its TUI). No special protocol needed — just include the text. | 2026-03-24 |
| 6 | Terminal context = selected text from terminal, attached as prompt prefix | T3Code serializes terminal selections as inline placeholders in the prompt. We follow the same pattern — terminal output becomes part of the prompt text. | 2026-03-24 |
| 7 | Settings persist to `~/.pibun/settings.json` via existing server handlers | `settings.get`/`settings.update` WS methods and handlers already exist in the codebase. Just need UI. | 2026-03-24 |
| 8 | Context menus forwarded via WS push, same as menu actions | Desktop shows native context menu → user clicks → desktop sends WS push with action. Web app handles. Same pattern as native menu bar (MEMORY-v2 #163). | 2026-03-24 |
| 9 | Thread renaming uses Pi's `set_session_name` RPC | Already have `session.setName` WS method and handler. Just needs sidebar inline edit UI. | 2026-03-24 |
| 10 | Electrobun's `showContextMenu()` + `ContextMenu.on("context-menu-clicked")` for native menus | Returns selected item action. Desktop forwards via WS push. Web app subscribes. | 2026-03-24 |
| 11 | Pointer-aware scroll via `useChatScroll` hook, not distance-only detection | Tracks pointer/wheel/touch interaction state to distinguish user scroll intent from content-growth shifts. Uses `isInteractingRef` + `userScrolledAwayRef` dual-flag approach. Old `useAutoScroll` hook deleted (was dead code). | 2026-03-24 |
| 12 | Individual scalar selectors are the optimal Zustand pattern — don't consolidate with `useShallow` | All 121 selectors use direct property access (`s => s.field`). `useShallow` is only needed for selectors returning new arrays/objects. Individual scalar selectors with `Object.is` comparison are cheaper than `useShallow` multi-field objects. | 2026-03-24 |
| 13 | `ChatView.footer` uses `anyMessageStreaming` boolean instead of `messages` array | The footer callback's stability matters because it's passed as `components.Footer` to Virtuoso. Using a derived boolean prevents footer recreation on every streaming delta — it only changes when streaming starts/stops. | 2026-03-24 |
| 14 | UI state persistence via `pibun-ui-state` localStorage key with debounced writes | Persists `sidebarOpen` and `activeTabId`. Theme already persisted via `pibun-theme` key. 500ms debounce + `beforeunload` flush. `restorePersistedUiState()` called during `initTransport()`. `activeTabId` uses deferred restoration pattern (`consumeDeferredActiveTabId()`) since tabs don't exist yet at init time. | 2026-03-24 |
| 15 | Composer draft persistence via module-level `Map<tabId, Draft>` + `pibun-composer-drafts` localStorage key | Drafts stored outside Zustand store to avoid re-render noise during typing. In-memory map for fast reads, 300ms debounced localStorage writes + `beforeunload` flush. Composer uses refs (`valueRef`, `imagesRef`) for tab-switch save to avoid exhaustive-deps issues. Separate reactive effect saves on every text/image change. Drafts cleared on send, deleted on tab close. Images persisted as base64 data URLs (same format used for preview rendering). | 2026-03-24 |
| 16 | Copy button on assistant messages via `group/assistant` hover pattern | Uses Tailwind `group/assistant` named group to show copy button on hover. Button only shown when message has content and is not streaming. Uses `navigator.clipboard.writeText()` + toast confirmation. `copied` state resets after 2s timeout. | 2026-03-24 |
| 17 | Image preview modal via `imagePreviewUrl` / `imagePreviewAlt` in UiSlice | Global overlay managed by Zustand — set URL to open, null to close. Closes on Escape (keydown listener) or backdrop click. Markdown `img` component override uses `createComponents(onImageClick)` factory + `useMemo` to keep components reference stable per render. Composer thumbnails also clickable. | 2026-03-24 |
| 18 | Tab status via `TabStatus` type on `SessionTab` — `"idle" \| "running" \| "waiting" \| "error"` | Single field replaces deriving from multiple booleans. `running` set on `agent_start`, `idle` on `agent_end`, `waiting` on extension UI dialog requests (select/confirm/input/editor), `error` on `auto_retry_end` failure. `error` is preserved by `deriveTabStatus()` until new activity starts (running/waiting override it). Background tabs get status updates inline in `wireTransport.ts` pi.event handler. `updateTabStreamingBySessionId()` removed — replaced by inline handler that updates both `isStreaming` and `status` together. | 2026-03-24 |
| 19 | RetryIndicator with countdown progress bar via `retryDelayMs` + `retryStartedAt` store fields | `auto_retry_start` event provides `delayMs` — now captured in store. `RetryIndicator` component uses `requestAnimationFrame` loop to animate a progress bar that drains over the delay period, showing seconds remaining. Replaces the simple text-only retry line in the ChatView footer. Component lives in `ChatView.tsx` (tightly coupled to footer rendering). | 2026-03-24 |
| 20 | Extension errors surfaced as warning toasts, not error banner | `extension_error` events now call `store.addToast(message, "warning")` instead of `store.setLastError()`. Warning level (not error) because extension errors are non-fatal — the session continues. Toast shows extension name (basename of path) + error message. Console.error preserved for debugging. | 2026-03-24 |
| 21 | Provider health via `ProviderHealthIssue` in ConnectionSlice — persistent banner, not auto-dismissing | Three kinds: `process_crashed` (Pi exits unexpectedly), `session_start_failed` (session.start throws), `repeated_model_errors` (auto_retry_end with failure). Uses new `session.status` WS push channel for crash forwarding from server. Banner shows in AppShell above ErrorBanner. Has "New Session" retry button for crash/start failures. Auto-clears on `agent_start` (successful activity) and successful session starts. `HealthBanner` component lives in `ErrorBanner.tsx` (same file — they're related banners). | 2026-03-24 |
| 22 | Completion summary via `agentStartedAt` timestamp + system message on `agent_end` | `agentStartedAt` field added to SessionSlice — set on `agent_start` (Date.now()), cleared on `agent_end`. On `agent_end`, a `"✓ Worked for Xm Ys"` system message is appended. Duration formatted by `formatDuration()` in wireTransport.ts: `<1s`, `Xs`, or `Xm Ys`. New `"completion"` category in SystemMessage uses muted text + border-secondary divider lines for a subtle turn boundary feel. `agentStartedAt` reset on tab switch and session reset. | 2026-03-24 |
| 23 | Turn dividers via `turn_divider` ChatItem kind — inserted by `groupMessages()` | `groupMessages()` now tracks tool call count per turn and inserts `turn_divider` items before each user message (except the first). `TurnDivider` component shows: locale-aware timestamp + tool count badge with wrench icon (only when toolCount > 0). Uses `bg-border-primary/30` for subtle divider lines that don't compete with the completion summary above. `formatTimestamp()` helper uses `toLocaleTimeString()` with `hour: "numeric", minute: "2-digit"` for short time format. Component lives in `ChatMessages.tsx` alongside other message renderers. | 2026-03-24 |
| 24 | Settings dialog via `SettingsDialog.tsx` — modal overlay with 4 sections | Accessible via Ctrl/Cmd+, keyboard shortcut or gear icon in toolbar. Sections: Appearance (theme selector with swatches), Agent Behavior (auto-compaction + auto-retry toggles), Display (timestamp format picker: relative/locale/12h/24h), Keyboard Shortcuts (reference table). `settingsOpen` state added to `UiSlice`. Settings persist via `updateSetting()` in `appActions.ts` — writes to in-memory cache + localStorage + server fire-and-forget. `PiBunSettings` extended with `autoCompaction`, `autoRetry`, `timestampFormat` fields. `WsSettingsUpdateParams` extended to match. Server `settingsStore.ts` updated to load/save new fields. Default model and thinking level UI deferred to 1C.3-1C.5 (require Pi RPC wiring). | 2026-03-24 |
| 25 | Auto-compaction and auto-retry wired end-to-end: UI toggle → `updateSetting()` → server persistence + Pi RPC | `session.setAutoCompaction` and `session.setAutoRetry` WS methods added (contracts + server handlers + handler registry). `updateSetting()` in `appActions.ts` now calls `applySettingToPiSession()` which sends Pi RPC to active session (fire-and-forget). `applySettingsToNewSession()` in `sessionActions.ts` sends saved settings to newly started Pi processes (called after `ensureSession()` and `startSessionInFolder()`). Settings with `null` value mean "use Pi default" and are not sent. | 2026-03-24 |
| 26 | Steering mode and follow-up mode wired end-to-end, same pattern as auto-compaction/retry | `session.setSteeringMode` and `session.setFollowUpMode` WS methods added (contracts + server handlers). `PiBunSettings` extended with `steeringMode: PiSteeringMode \| null` and `followUpMode: PiFollowUpMode \| null`. Server `settingsStore.ts` handles load/save with validation. `applySettingToPiSession()` sends Pi RPC on live toggle. `applySettingsToNewSession()` sends on session start. UI uses `ModeSelector` segmented control component in SettingsDialog Agent section. Default is `null` (Pi default = "one-at-a-time"). | 2026-03-24 |
| 27 | Timestamp format applied via shared `formatTimestamp()` in `utils.ts` + `timestampFormat` in Zustand UiSlice | Shared function accepts `(ts, format)` — format comes from Zustand store so components re-render when user changes setting. `timestampFormat` field added to `UiSlice` + `setTimestampFormat` action. Synced from settings cache on: init (`restorePersistedUiState`), server fetch (`fetchAndApplySettings`), and user change (`updateSetting`). TurnDivider reads from store via `useStore(s => s.timestampFormat)`. Old local `formatTimestamp` in ChatMessages.tsx deleted. | 2026-03-24 |
| 28 | `PiSlashCommand` updated to use `sourceInfo: PiSourceInfo` matching actual Pi wire format | Pi's rpc.md docs show older `location`/`path` fields, but the actual Pi source (rpc-types.ts) uses `sourceInfo: SourceInfo` with `{ path, source, scope, origin, baseDir }`. Updated PiBun contracts to match actual wire format. Added `PiSourceInfo`, `PiSourceScope`, `PiSourceOrigin` types. | 2026-03-24 |
| 29 | `session.getCommands` WS method follows `getModels` handler pattern (sendCommand → assertSuccess → extract data) | Returns `{ commands: PiSlashCommand[] }`. No params needed. Handler uses `process.sendCommand({ type: "get_commands" })`. Result type is `WsSessionGetCommandsResult`. | 2026-03-24 |
| 30 | ComposerCommandMenu is a separate file (`ComposerCommandMenu.tsx`), trigger logic lives in `Composer.tsx` | Menu is a pure presentational component (items, active, onSelect, onHighlight). Composer manages: trigger detection (`detectSlashTrigger`), keyboard interception (↑↓ Enter Escape Tab), command fetching (lazy, cached per session), item filtering. Separate file because the menu component is reusable for future `@` mentions. | 2026-03-24 |
| 31 | Slash commands cached in `commandsCacheRef` (module-level ref), not Zustand store | Commands are only used by Composer — no other component needs them. Cache cleared on `sessionId` change (different sessions may have different extensions/skills). Fetched lazily on first `/` trigger. | 2026-03-24 |
| 32 | Slash trigger detection uses `slashTrigger` state (not ref) for `useMemo` reactivity | Refs don't trigger re-renders, so `slashTriggerRef.current?.query` can't be a useMemo dep. `slashTrigger` as state drives: `commandMenuOpen` (derived boolean), `filteredCommandItems` (memoized filter). Updated on every `onChange` and `onSelect` (cursor position change). | 2026-03-24 |
| 33 | `/model` slash command opens inline model picker, not text insertion | When `/model` is selected from command menu, `handleCommandSelect` intercepts it, clears the trigger text, and opens `ComposerModelPicker` (same floating position). Picker shows models grouped by provider with keyboard nav. On select, calls `session.setModel` with optimistic update + rollback. `ComposerModelPicker` lives in `ComposerCommandMenu.tsx` (same file — part of the floating menu system). | 2026-03-24 |
| 34 | `session.cycleModel` and `session.cycleThinking` WS methods for keyboard shortcuts | Thin bridge to Pi `cycle_model` / `cycle_thinking_level` RPC. `cycle_model` returns `{ model, thinkingLevel }` (both null if only one model). `cycle_thinking` returns `{ level }` (null if model doesn't support thinking). Keyboard: Ctrl/Cmd+M cycles model, Ctrl/Cmd+Shift+M cycles thinking. Both update store + show toast. | 2026-03-24 |
| 35 | `resizeTextarea` must be declared before callbacks that reference it | Moved `resizeTextarea` to right after `textareaRef` declaration in Composer to avoid TDZ errors. Was previously after model/command state, causing `handleModelSelect` to reference it before declaration. | 2026-03-24 |
| 36 | `project.searchFiles` uses `fd` with `find` fallback for server-side file search | `fd` respects `.gitignore` by default, is fast, and case-insensitive. Falls back to `find` with manually excluded patterns (`.git`, `node_modules`, `dist`, `.turbo`, `__pycache__`). `fd` outputs directories with trailing `/` — used to distinguish file vs directory kind. CWD resolution follows same pattern as git handlers: explicit param → session CWD → server CWD. Limit defaults to 50 results. `--max-results` set to `limit * 2` to allow for filtering. | 2026-03-24 |
| 37 | `@` trigger detection uses word-boundary scanning, not line-start like `/` | `detectAtTrigger` walks backwards from cursor to find token start (whitespace boundary), then checks if token starts with `@`. Unlike `/` (must be at line start), `@` can appear anywhere in text. Query = everything after `@` in the current token. File search debounced at 120ms with sequence counter to discard stale results. | 2026-03-24 |
| 38 | `FileMentionMenu` + `FileMentionMenuItem` live in `ComposerCommandMenu.tsx` alongside slash command menu | Same file because they share the floating menu pattern, positioning, and keyboard nav approach. `FileMentionMenu` is a pure presentational component — Composer manages trigger detection, debounced search, keyboard interception, and item selection. On select, mention is added as a chip (not plain text). |
| 39 | File mentions rendered as removable chips above textarea, not inline in text | PiBun uses a plain `<textarea>` which can't render inline HTML. T3Code uses Lexical (rich text editor) with custom `ComposerMentionNode` for inline chips. PiBun renders chips as a strip above the textarea (same pattern as image preview strip). Chips show file/directory icon + truncated filename + hover title with full path + × remove button using `group/chip` named group. |
| 40 | File mentions tracked as separate `FileMention[]` state, expanded to `@path` on send | `mentions` state array is separate from textarea `value`. On `handleFileMentionSelect`, the `@query` trigger text is removed from textarea and a `FileMention` chip is added. On send, `buildPromptMessage()` prepends `@path` references joined by spaces before the user's text. Pi's prompt handler understands `@` references natively. Duplicates prevented by path check in `setMentions`. |
| 41 | `ComposerDraft` extended with `mentions: PersistedFileMention[]` for draft persistence | File mention chips survive tab switch and page reload. `PersistedFileMention` shape: `{ id, path, kind }`. Backward compatible — `restoreComposerDrafts` uses `draft.mentions ?? []` for old drafts without mentions field. `mentionsRef` added alongside `valueRef`/`imagesRef` for tab-switch save. | 2026-03-24 |
| 42 | Terminal context selection via xterm.js `hasSelection()`/`getSelection()`/`getSelectionPosition()` | Floating "Add to composer" button appears near mouse pointer after text selection in terminal (250ms delay to avoid interfering with double/triple-click). Uses `onSelectionChange` to detect selection clearing. `pointerdown` on container clears action, `mouseup` on window starts delayed show. `onMouseDown` on button uses `preventDefault` to keep xterm selection alive during click. | 2026-03-24 |
| 43 | `TerminalContext` type + `pendingTerminalContexts` array in UiSlice (Zustand) | `TerminalContext`: `{ id, terminalLabel, terminalId, lineStart, lineEnd, text }`. Dedup by `terminalId + lineStart + lineEnd`. `addTerminalContext`, `removeTerminalContext`, `clearTerminalContexts` actions. Stored in Zustand (not module-level like composer drafts) because terminal contexts are a UI-level concern shared across components (terminal adds, composer displays/sends). | 2026-03-24 |
| 44 | `TerminalInstance` now receives `terminalLabel` prop from `TerminalPane` (`tab.name`) | Needed for human-readable labels on terminal context chips (e.g., "Terminal 1 lines 5-12"). | 2026-03-24 |
| 45 | Terminal context chips rendered as strip above textarea, same pattern as file mention chips | Uses `group/chip` named group for hover-reveal remove button. Shows terminal icon + label (e.g., "Terminal 1 lines 5-12") + hover tooltip with text preview (truncated to 200 chars). `pendingTerminalContexts` read from Zustand store. Chips cleared on send via `clearTerminalContexts()`. | 2026-03-24 |
| 46 | Terminal context appended to prompt as `<terminal_context>` block following T3Code's format | `buildTerminalContextBlock()` in Composer.tsx formats each context as `- {label}:` header + line-numbered body (`  {lineNum} \| {text}`). Block appended after user text + file mentions with `\n\n` separator. Pi receives terminal output as structured context in the prompt. | 2026-03-24 |
| 47 | Drag-and-drop image support was already implemented — just never checked off | Composer already had `handleDragOver`, `handleDragLeave`, `handleDrop` handlers calling `addImagesFromFiles`, with `isDragOver` state driving a visual drop overlay. Implemented alongside clipboard paste in an earlier session. | 2026-03-24 |
| 48 | Image preview strip improved: 80px thumbnails (was 64px), file size badge overlay | `ImageAttachment` and `PersistedImageAttachment` extended with `fileSize: number`. File size captured from `File.size` during `addImagesFromFiles`. `formatFileSize()` helper formats bytes to human-readable (B/KB/MB). Badge rendered as semi-transparent black overlay at bottom-left of thumbnail. Backward compatible — `fileSize ?? 0` for old persisted drafts. | 2026-03-24 |
| 49 | `ChatItem` renamed to `TimelineEntry` — exported union type with 4 kinds | `"message" \| "tool-group" \| "turn-divider" \| "completion-summary"`. Hyphenated kind names (not underscored) for consistency. `ChatItemRenderer` → `TimelineEntryRenderer`, `chatItemKey` → `timelineEntryKey`. Completion summaries promoted from string-matched system messages to first-class `"completion-summary"` entries — detected by `COMPLETION_PREFIX = "✓ Worked for"` in `groupMessages()`. `CompletionSummary` component in `ChatMessages.tsx` replaces the old `"completion"` case in `SystemMessage`'s `getCategory()`. `SystemCategory` type simplified (no more `"completion"` variant). `TimelineEntry` is exported from `ChatView.tsx` for use by future items (3.2-3.4). | 2026-03-24 |

## Architecture Notes

### Current Codebase (31K lines)
```
packages/contracts/   — 4 files: piProtocol.ts, domain.ts, wsProtocol.ts, index.ts
packages/shared/      — jsonl.ts parser
apps/server/          — server.ts, piProcess.ts, piRpcManager.ts, handlers/{session,appHandlers,types,index}
apps/web/             — React 19, Zustand (5 slices), 30+ components, wireTransport.ts
apps/desktop/         — Electrobun main process, menu, notifications, updater, window state
```

### Key Missing Server Methods (for v3)
- ~~`session.getCommands` → Pi `get_commands` (for command palette)~~ ✅ Done (Session 16)
- `session.bash` → Pi `bash` + `abort_bash` (server-side execution)
- ~~`session.setAutoCompaction` → Pi `set_auto_compaction`~~ ✅ Done (Session 13)
- ~~`session.setAutoRetry` → Pi `set_auto_retry`~~ ✅ Done (Session 13)
- ~~`session.setSteeringMode` → Pi `set_steering_mode`~~ ✅ Done (Session 14)
- ~~`session.setFollowUpMode` → Pi `set_follow_up_mode`~~ ✅ Done (Session 14)
- ~~`session.cycleModel` → Pi `cycle_model`~~ ✅ Done (Session 18)
- ~~`session.cycleThinking` → Pi `cycle_thinking_level`~~ ✅ Done (Session 18)
- `session.getLastAssistantText` → Pi `get_last_assistant_text`
- ~~`project.searchFiles` → server-side file search (fd/find)~~ ✅ Done (Session 19)
- `session.getTurnDiff` → server-side git diff between turns

### Key Missing UI Components (for v3)
- ~~ComposerCommandMenu — floating autocomplete menu~~ ✅ Done (Session 17)
- ComposerMentionChip — inline file/terminal reference pill
- SettingsPage — full settings panel
- DiffPanel — side panel with per-turn diffs
- ~~TurnDivider — visual separator between conversation turns~~ ✅ Done (Session 11)
- ~~TimelineEntry union type~~ ✅ Done (Session 25): `"message" | "tool-group" | "turn-divider" | "completion-summary"`
- ThreadContextMenu — right-click actions for sidebar items

### T3Code Patterns to Study (read before implementing)
| Feature | T3Code File | Pattern |
|---------|-------------|---------|
| Scroll anchoring | `chat-scroll.ts` | Pointer-aware, interaction anchor ref |
| Composer triggers | `composer-logic.ts` | Cursor position → trigger detection → menu |
| Command menu | `ComposerCommandMenu.tsx` | Floating, keyboard nav, filtered items |
| Terminal drawer | `ThreadTerminalDrawer.tsx` | Resizable, splits, theme sync |
| Sidebar DnD | `Sidebar.tsx` | `@dnd-kit/core` for project reorder |
| Settings | `appSettings.ts` | Schema + localStorage + useLocalStorage hook |
| Timeline | `MessagesTimeline.tsx` | TimelineEntry union with work groups |
| Diff panel | `DiffPanel.tsx` | `@pierre/diffs` for rendering |

## Gotchas & Warnings

- **Don't copy T3Code's orchestration layer** — it's Codex-specific (event sourcing, SQLite projections, thread/session lifecycle). PiBun's thin bridge is correct.
- **T3Code uses TanStack Query** — we use Zustand. Don't add react-query; translate data-fetching patterns to Zustand actions.
- **T3Code uses TanStack Router** — we don't have routing. Keep single-page with tab-based navigation.
- **T3Code uses Effect/Schema** — we use plain TypeScript. Don't add Effect.
- **Electrobun `showContextMenu` is only available in bun process** — must forward results to webview via WS, same as menu actions.
- **`react-virtuoso` is already installed** but currently active (MEMORY-v2 #139-140). Consider whether timeline refactor needs different virtualization.
- **Pi `get_commands` returns extensions, prompts, and skills** — not just built-in commands. Command palette should show all three.
- **Selector stability**: returning `state.messages.filter(...)` creates new array every render → infinite re-render. Use `useShallow` or memoize.
- **Zustand selector pattern**: Individual `useStore(s => s.field)` selectors are OPTIMAL. Don't consolidate into `useShallow(s => ({ a: s.a, b: s.b }))` — the multi-field object creates more work per state change than individual `Object.is` checks. `useShallow` is only for selectors returning NEW arrays/objects.
- **Virtuoso `components.Footer`**: Must be a stable function reference. If it captures arrays/objects that change on every render (like `messages`), derive a primitive (boolean/number) first via `useMemo`, then use the primitive in the callback deps.

## Technical Context

### Commands
```bash
bun install                  # install all workspace deps
bun run build                # build all packages (turbo)
bun run dev:server           # server at :24242
bun run dev:web              # Vite at :5173
bun run typecheck            # tsc --noEmit across all packages
bun run lint                 # biome check .
bun run format               # biome format --write .
```

### Key Paths
- Pi sessions: `~/.pi/agent/sessions/`
- PiBun settings: `~/.pibun/settings.json`
- PiBun projects: `~/.pibun/projects.json`
- PiBun window state: `~/.pibun/window-state.json`
- Electrobun config: `apps/desktop/electrobun.config.ts`
- Biome config: `biome.json` (root)

### Reference Repos (read-only at `reference/`)
- `reference/t3code/` — UI/UX patterns, component structure
- `reference/pi-mono/` — Pi RPC protocol, event types, SDK
- `reference/electrobun/` — Desktop native APIs, kitchen sink examples
