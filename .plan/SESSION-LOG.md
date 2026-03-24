# Session Log

> Chronological record of each build session.
> Previous sessions (1–51): `.plan/archive/SESSION-LOG-v1.md`

---

## Session 92 — Plugin ↔ PiBun messaging: postMessage bridge (2026-03-24)

**What happened:**
- Implemented the full plugin message bridge (7.5) — bidirectional postMessage communication between PiBun and plugin iframes
- **New file: `apps/web/src/lib/pluginMessageBridge.ts`**
  - Registry (`Map<string, PluginFrameEntry>`) tracks active plugin iframes by panelKey
  - 5 inbound message handlers: `plugin:ready` (log + send current theme), `plugin:getSessionState` (read Zustand → respond), `plugin:sendPrompt` (send via transport OR insert into Composer), `plugin:subscribeEvents` (store per-plugin event filter), `plugin:unsubscribeEvents` (clear subscriptions)
  - Outbound: `sendToPlugin()`, `broadcastToPlugins()`, `forwardPiEventToPlugins()`
  - `initPluginMessageBridge()` sets up `window.addEventListener("message")`, validates `plugin:` prefix, matches source to registry
- **Updated `store/types.ts` + `store/uiSlice.ts`**: Added `pendingComposerText: string | null` + `setPendingComposerText()` to `UiSlice` for plugin prompt insertion
- **Updated `PluginPanel.tsx`**: `PluginPanelFrame` now registers/unregisters iframe with the bridge via `useEffect`
- **Updated `wireTransport.ts`**: Bridge initialized in `initTransport()` alongside other subscriptions; `forwardPiEventToPlugins(data.event)` called in `pi.event` handler for active tab events
- **Updated `themes.ts`**: `applyTheme()` now broadcasts `pibun:themeChanged` to all plugin iframes via dynamic import
- **Updated `Composer.tsx`**: Watches `pendingComposerText` via `useEffect` — picks up plugin-inserted text, focuses textarea, auto-resizes

**Items completed:**
- [x] 7.5 — Plugin ↔ PiBun messaging: `postMessage` bridge for reading session state, sending prompts, subscribing to events

**Issues encountered:**
- Biome formatting: new file needed `bun run format` for tab indentation consistency
- TS error: `resizeTextarea` used before declaration in Composer — moved `useEffect` after the callback definition

**Handoff to next session:**
- Next: 7.6 — Plugin manager UI: list installed plugins, enable/disable, install from URL/path
- The message bridge is fully wired. A plugin iframe can now:
  1. Send `plugin:ready` → receives current theme
  2. Send `plugin:getSessionState` → receives session info
  3. Send `plugin:sendPrompt` → text inserted in Composer or sent directly
  4. Send `plugin:subscribeEvents` → receives Pi events as they happen
- 7.6 needs a `PluginManager` component (dialog or panel) that lists all installed plugins, shows enable/disable toggles, and has an "Install" button for URL or path input. Should use existing `plugin.list`, `plugin.install`, `plugin.uninstall`, `plugin.setEnabled` WS methods.

---

## Session 91 — Plugin panel rendering: sandboxed iframes + store + layout (2026-03-24)

**What happened:**
- Implemented full plugin panel rendering pipeline (7.4)
- **Server side:**
  - Added `getPluginDir(pluginId)` export to `pluginStore.ts` for resolving plugin directory paths
  - Added `/plugin/{id}/{path}` HTTP route to `server.ts` for serving plugin assets from `~/.pibun/plugins/` — includes directory traversal prevention and resolved-path verification
  - Added `/plugin` proxy to Vite dev config for development
- **Web side:**
  - Created `PluginsSlice` in Zustand store (`pluginsSlice.ts`): tracks `plugins`, `pluginsLoading`, `activePluginPanels` Set, with `getActivePluginPanelsByPosition()` getter for layout integration
  - Added `PluginsSlice` + `ActivePluginPanel` types to `store/types.ts`, registered in combined `AppStore`
  - Created `pluginActions.ts`: `fetchPlugins()` (called on `server.welcome`), `resolvePluginComponentUrl()` (absolute URLs pass through, relative paths → `/plugin/{id}/{path}`)
  - Created `PluginPanel.tsx` with 4 exports:
    - `PluginPanelFrame` — sandboxed iframe (`allow-scripts allow-same-origin allow-forms`) with loading spinner, error state, puzzle-piece header
    - `PluginBottomPanels` — renders bottom-position panels below terminal
    - `PluginSidebarPanels` — renders sidebar-position panels below projects/sessions
    - `PluginRightPanels` — renders right-position panels as a right panel
  - Integrated into `AppShell.tsx`: wrapped main area in flex container for right panels, added bottom panels below terminal
  - Integrated into `Sidebar.tsx`: added sidebar panels at bottom of sidebar content
  - Wired `fetchPlugins()` into `wireTransport.ts` on `server.welcome`

**Items completed:**
- [x] 7.4 — Plugin panel rendering: sandboxed iframe (web) or Electrobun BrowserView (desktop) loading plugin URL

**Issues encountered:**
- Biome import ordering: `PiThinkingLevel` must sort before `Plugin`/`PluginPanelPosition` (alphabetical within scoped imports)
- Biome formatting fixed via `bun run format` (indentation depth change from adding wrapper `<div>` in AppShell)

**Handoff to next session:**
- Next: 7.5 — Plugin ↔ PiBun messaging: `postMessage` bridge for reading session state, sending prompts, subscribing to events
- The iframe rendering is complete but there's no communication yet. 7.5 needs:
  - A `usePluginMessageBridge` hook (or module) that listens for `window.addEventListener("message")` events from plugin iframes
  - Validate message origin against plugin iframe sources
  - Handle `PluginToPiBunMessage` variants: `plugin:ready`, `plugin:getSessionState` (read Zustand), `plugin:sendPrompt` (call transport), `plugin:subscribeEvents` (forward Pi events), `plugin:unsubscribeEvents`
  - Send `PiBunToPluginMessage` variants back to iframes: `pibun:sessionState`, `pibun:event`, `pibun:themeChanged`
  - `PluginPanelFrame` needs a ref to its iframe's `contentWindow` for outbound `postMessage`
  - Consider: track per-iframe event subscriptions in a Map keyed by iframe origin or plugin ID

---

## Session 90 — Plugin loading: pluginStore + handlers (2026-03-24)

**What happened:**
- Created `apps/server/src/pluginStore.ts` — server-side plugin directory scanner and persistence:
  - `loadPlugins()` — scans `~/.pibun/plugins/` for subdirs with `plugin.json`, validates manifests, merges enabled/disabled state from `~/.pibun/plugins-state.json`
  - `getPlugin(id)` — load single plugin by ID
  - `installPlugin(source)` — validates manifest at source path, copies directory to plugins dir (recursive copy via `Bun.file`/`Bun.write`), supports upgrades (removes existing before copy)
  - `uninstallPlugin(id)` — removes plugin directory + persisted state
  - `setPluginEnabled(id, enabled)` — persists to `plugins-state.json`
  - `validateManifest()` — validates all required fields + panel shape (id, title, icon, position, component, defaultSize)
  - Manifest ID must match directory name — returns error otherwise
  - New plugins default to enabled; malformed manifests returned with `error` field (not silently dropped)
- Created `apps/server/src/handlers/plugin.ts` — 4 WS handlers:
  - `handlePluginList` — scans directory, returns all plugins
  - `handlePluginInstall` — validates source + copies
  - `handlePluginUninstall` — removes directory + state
  - `handlePluginSetEnabled` — persists enabled/disabled
- Registered all 4 plugin handlers in `handlers/index.ts`
- Added `./pluginStore` subpath export to server's `package.json`

**Items completed:**
- [x] 7.3 — Plugin loading: read `~/.pibun/plugins/` directory, load manifests

**Issues encountered:**
- Biome `noDelete` suppression comment was unused (Biome doesn't flag `delete` on `Record<string, ...>` types) — removed it

**Handoff to next session:**
- Next: 7.4 — Plugin panel rendering: sandboxed iframe (web) or Electrobun BrowserView (desktop) loading plugin URL
- The server-side plugin store is complete. 7.4 needs web-side work: a `PluginsSlice` in Zustand store, `pluginActions.ts` for fetching plugin list, and `PluginPanel` component that renders plugin content in sandboxed iframes. Follow `wireTransport.ts` pattern for fetching on `server.welcome`.
- Plugin content URLs: relative paths in manifest should be resolved to `http://localhost:{port}/plugin/{pluginId}/{path}` — the server will need a static file serving route for plugin assets.
- Consider: the server needs to serve plugin panel HTML/JS files. Either add a `/plugin/:id/*` route to the HTTP server, or pass the absolute `file://` path to the iframe. HTTP route is safer (no file:// access).

---

## Session 89 — Plugin manifest + PanelConfig types (2026-03-24)

**What happened:**
- Created `packages/contracts/src/plugin.ts` with complete plugin type system:
  - `PluginPanelPosition` type: `"sidebar" | "bottom" | "right"`
  - `PluginPanelConfig` interface: id, title, icon, position, component (URL or path), defaultSize
  - `PluginManifest` interface: id, name, version, description, author, panels array — with JSDoc example of a `plugin.json` file
  - `Plugin` runtime state: manifest + enabled + error + directory path
  - `PluginToPiBunMessage` union (5 variants): ready, getSessionState, sendPrompt, subscribeEvents, unsubscribeEvents
  - `PiBunToPluginMessage` union (3 variants): sessionState, event, themeChanged
- All types exported from `packages/contracts/src/index.ts`
- Added 4 plugin WS methods to `wsProtocol.ts`: `plugin.list`, `plugin.install`, `plugin.uninstall`, `plugin.setEnabled`
  - Params types: `WsPluginInstallParams`, `WsPluginUninstallParams`, `WsPluginSetEnabledParams`
  - Result types: `WsPluginListResult`, `WsPluginInstallResult`
  - All registered in `WsMethodParamsMap` and `WsMethodResultMap`
- Exported all new WS types from contracts index

**Items completed:**
- [x] 7.1 — Define plugin manifest: `{ id, name, version, description, panels: PanelConfig[] }`
- [x] 7.2 — Define `PanelConfig`: `{ id, title, icon, position: "sidebar" | "bottom" | "right", component: string (URL or path) }`

**Issues encountered:**
- None — clean type definitions, all typecheck + lint pass

**Handoff to next session:**
- Next: 7.3 — Plugin loading: read `~/.pibun/plugins/` directory, load manifests
- The WS method types are ready (`plugin.list/install/uninstall/setEnabled`). 7.3 needs a server-side `pluginStore.ts` or `pluginManager.ts` module that scans the plugins directory, reads `plugin.json` manifests, validates them, and tracks enabled/disabled state.
- Follow the pattern of `projectStore.ts` and `settingsStore.ts` for file I/O.
- Consider: plugin enabled/disabled state could be stored in `~/.pibun/settings.json` (adding a `disabledPlugins: string[]` field to `PiBunSettings`) or in a separate `~/.pibun/plugins.json` file.
- The `Plugin.directory` field stores the absolute path — plugin content (HTML/JS) is served from there.

---

## Session 88 — Phase 6 Verification (2026-03-24)

**What happened:**
- Completed 6.9 — verification of the entire theme system
- Created `apps/server/src/theme-verify-test.ts` with 104 automated checks across 9 test suites
- Test suites: Theme Contracts (17 checks), Theme Definitions (17), Theme CSS Integration (10), Settings Persistence (7), Settings WS Methods (10), Shiki Theme Mapping (10), System Preference (9), Dual Persistence (9), Web Build (4)
- Added `test:smoke:themes` script to root `package.json`
- Fixed one false negative in CSS integration check — `UserMessage.tsx` uses `bg-user-bubble-bg`/`text-user-bubble-text` (valid theme tokens, just not in original check pattern)
- Verified Phase 6 exit criteria: all 5 built-in themes work, code highlighting matches, persists across restart, system preference followed

**Items completed:**
- [x] 6.9 — Verify: switch themes, code blocks re-highlight, persists across restart, system preference respected

**Issues encountered:**
- None — all 104/104 checks passed after fixing the `UserMessage.tsx` token pattern detection

**Handoff to next session:**
- **Phase 6 is COMPLETE.** Next phase: Phase 7 — Plugin System
- Phase 7 starts with 7.1 — Define plugin manifest: `{ id, name, version, description, panels: PanelConfig[] }`
- This is a new feature area — read ARCHITECTURE.md and CONVENTIONS.md before starting
- TerminalInstance.tsx still has hardcoded `TERMINAL_THEME` (xterm.js theme object, not Tailwind) — could be a future improvement

---

## Session 87 — Phase 6 System preference + Shiki theme matching (2026-03-24)

**What happened:**
- Implemented system preference detection (6.6 + 6.7) and Shiki theme matching (6.8)
- Added `ThemePreference` type to contracts: `ThemeId | "system"` — "system" follows OS dark/light mode
- Updated `PiBunSettings.themeId` from `ThemeId | null` to `ThemePreference | null`
- Added "System" option to ThemeSelector with split light/dark swatch preview, positioned at top of dropdown
- Added `watchSystemPreference()` to `themes.ts` — uses `matchMedia("prefers-color-scheme: light")` change listener
- ThemeSelector watches system preference when "system" is active, auto-switches theme on OS change
- Desktop (macOS): native WebKit webview fires `matchMedia` events on System Settings → Appearance changes automatically — no Electrobun-specific code needed
- Made Shiki highlighter theme dynamic: `setShikiTheme()` loads themes on demand, updates module state, notifies listeners
- Added `subscribeShikiTheme()` + `getShikiTheme()` for `useSyncExternalStore` compatibility
- Created `useShikiTheme()` hook in `hooks/useShikiTheme.ts`
- `applyTheme()` now calls `setShikiTheme(theme.shikiTheme)` via dynamic import (fire-and-forget)
- CodeBlock and DiffViewer include `shikiTheme` as `useEffect` trigger dependency — code re-highlights on theme switch
- Added helper functions to `themes.ts`: `resolveTheme()`, `getSavedPreference()`, `THEME_STORAGE_KEY` export
- Updated `main.tsx` to default to "system" preference on first visit
- Updated `settingsActions.ts` to handle `ThemePreference` type

**Items completed:**
- [x] 6.6 — System preference detection: `prefers-color-scheme` → auto-select light/dark
- [x] 6.7 — Desktop: respect macOS appearance changes (light → dark mode switch)
- [x] 6.8 — Shiki theme matching: switch code highlighting theme to match app theme

**Issues encountered:**
- Biome `useExhaustiveDependencies` flagged `shikiTheme` as unnecessary in CodeBlock/DiffViewer effects — it's an intentional trigger dep (the functions read module-level state internally). Suppressed with `biome-ignore` comments.

**Handoff to next session:**
- Next: 6.9 — Verify: switch themes, code blocks re-highlight, persists across restart, system preference respected
- This is a verification item — write automated checks confirming: (1) all 5 themes apply correctly, (2) "system" follows OS preference, (3) code blocks use matching Shiki theme, (4) theme persists in localStorage + server settings, (5) system preference changes trigger live theme switch
- TerminalInstance.tsx still has hardcoded `TERMINAL_THEME` — not part of 6.8 (xterm.js, not Shiki) but could be improved later

---

## Session 86 — Phase 6 Persist theme choice (2026-03-24)

**What happened:**
- Implemented dual-persistence for theme choice: `localStorage` (browser) + `~/.pibun/settings.json` (server/desktop)
- Added `PiBunSettings` type to `packages/contracts/src/settings.ts` with `themeId: ThemeId | null`
- Created `apps/server/src/settingsStore.ts` — reads/writes `~/.pibun/settings.json`, follows same pattern as `projectStore.ts` (load/save/update, ensureConfigDir, default fallbacks)
- Added 2 WS methods to contracts: `settings.get` (load) and `settings.update` (merge + save)
- Added `WsSettingsUpdateParams`, `WsSettingsGetResult`, `WsSettingsUpdateResult` types to `wsProtocol.ts`
- Created `apps/server/src/handlers/settings.ts` with `handleSettingsGet` and `handleSettingsUpdate` handlers
- Registered both handlers in `handlers/index.ts`
- Added `./settingsStore` subpath export to `@pibun/server`
- Created `apps/web/src/lib/settingsActions.ts` with `fetchAndApplySettings()` (fetches from server on connect, applies if different) and `persistThemeToServer()` (fire-and-forget save)
- Wired `fetchAndApplySettings()` to `server.welcome` subscription in `wireTransport.ts`
- Updated `ThemeSelector` to call `persistThemeToServer()` after local apply
- Fixed `exactOptionalPropertyTypes` compat in settings handler using explicit `Partial<PiBunSettings>` construction with type assertion

**Items completed:**
- [x] 6.5 — Persist theme choice: `localStorage` in browser, `~/.pibun/settings.json` in desktop

**Issues encountered:**
- `exactOptionalPropertyTypes` type error in settings handler: conditional spread `{ themeId: params.themeId }` where `params.themeId` is `string | null` isn't assignable to `ThemeId | null`. Fixed by building `Partial<PiBunSettings>` explicitly with type assertion (same pattern as MEMORY #52).

**Handoff to next session:**
- Next: 6.6 — System preference detection: `prefers-color-scheme` → auto-select light/dark
- `getSystemPreferredThemeId()` already exists in `themes.ts` — used in `main.tsx` fallback
- Need: `matchMedia` listener for live system preference changes, auto-switch when "system" is selected, possible "Auto" option in ThemeSelector
- Consider: should `PiBunSettings.themeId = null` mean "follow system"? Currently it means "no preference saved". The `main.tsx` already falls back to system preference when no saved theme exists. May just need a `matchMedia` change listener + ThemeSelector "System" option.

---

## Session 83 — Phase 6 Theme type + built-in themes (2026-03-24)

**What happened:**
- Defined `Theme`, `ThemeColors`, and `ThemeId` types in `packages/contracts/src/theme.ts`:
  - `ThemeColors` interface with 40 semantic color tokens organized by role (surface, text, border, accent, status-error, status-success, status-warning, status-info, thinking, code, user-bubble, scrollbar)
  - Each token maps to a `--color-{token}` CSS custom property
  - `Theme` includes `id`, `name`, `isDark`, `colors: ThemeColors`, `shikiTheme: string`
  - `ThemeId` is a union type of the 5 built-in theme IDs
  - Exported from `packages/contracts/src/index.ts`
- Created 5 built-in theme definitions in `apps/web/src/lib/themes.ts`:
  - **Dark** (default): matches current hardcoded neutral palette exactly — `github-dark-default` Shiki theme
  - **Light**: clean white/gray palette — `github-light-default` Shiki theme
  - **Dimmed**: softer blue-gray dark theme (GitHub Dimmed palette) — `github-dark-dimmed` Shiki theme
  - **High Contrast Dark**: pure black base, vivid colors, strong borders — `github-dark-high-contrast` Shiki theme
  - **High Contrast Light**: pure white base, deep colors, strong borders — `github-light-high-contrast` Shiki theme
- All 5 Shiki themes verified to exist in the `shiki/bundle/web` package
- Utility functions: `BUILTIN_THEMES` (Map), `THEME_LIST` (ordered array), `getThemeById()`, `getSystemPreferredThemeId()`, `applyTheme()` (sets CSS custom properties + data-theme attribute)
- Audited all existing color usage across 45 component files to ensure token coverage

**Items completed:**
- [x] 6.1 — Define `Theme` type: `{ id, name, isDark, colors: Record<string, string> }` with semantic color tokens
- [x] 6.2 — Built-in themes: light (default), dark, dimmed, high-contrast dark, high-contrast light

**Issues encountered:**
- None — straightforward type definition and theme creation. Dark theme colors matched 1:1 to existing hardcoded palette.

**Handoff to next session:**
- Next: 6.3 — Theme CSS: convert hardcoded Tailwind colors to CSS custom properties, apply via `data-theme` attribute on `<html>`
- This is the big migration item — ~45 component files need hardcoded `bg-neutral-800`, `text-neutral-300`, etc. replaced with `bg-[var(--color-surface-secondary)]`, `text-[var(--color-text-secondary)]`, etc.
- Theme type and all 5 themes are ready. `applyTheme()` utility injects CSS custom properties.
- Consider: Tailwind v4 `@theme` directive could define custom property references more cleanly, or use arbitrary value syntax `bg-[var(--color-X)]`.
- Also consider: xterm.js terminal theme (`TERMINAL_THEME` in TerminalInstance.tsx) needs to switch with app theme too.

---

## Session 82 — Phase 5 export verification (2026-03-24)

**What happened:**
- Created comprehensive export verification test at `apps/server/src/export-verify-test.ts` with 89 automated checks:
  - **HTML export (17 checks):** `session.exportHtml` → Pi's `export_html` RPC → file written → content returned. Verified: valid HTML with DOCTYPE, self-contained styles, session content, assistant responses, file exists on disk.
  - **Messages retrieval (10 checks):** `session.getMessages` returns actual conversation messages. Verified: non-empty array, user + assistant messages present, content matches prompt, streamed chunks present.
  - **Stats retrieval (7 checks):** `session.getStats` returns token/cost data. Verified: totalTokens/inputTokens/outputTokens/cost/userMessages/assistantMessages all present and correct types.
  - **Markdown generation (18 checks):** Tested `messagesToMarkdown()` logic with all message types: user, assistant (with thinking), tool_call (with args), tool_result (success + error), system. Verified: title, model info, token stats, cost, separator, emoji headings, thinking details/summary, code blocks for tool args/results, error flags, blockquotes for system messages, null metadata handling.
  - **JSON generation (15 checks):** Tested `messagesToJson()` with real messages + stats. Verified: valid JSON, all top-level fields (exportedAt, sessionName, model, stats, messageCount, messages), model details, message structure (role, content, timestamp), null metadata handling.
  - **Save file fallback (2 checks):** `app.saveExportFile` correctly errors in browser mode (no desktop hooks), error message mentions browser/not available.
  - **Multi-turn export (7 checks):** Sent 2 prompts, verified messages contain both turns (2 user + 2 assistant), content matches, HTML export reflects full conversation.
- Enhanced `test-fixtures/fake-pi-streaming.ts`:
  - Added `conversationMessages[]` array — tracks user + assistant messages from prompts
  - `get_messages` now returns actual conversation history (was returning empty array)
  - Added `export_html` handler: writes self-contained HTML file to tmpdir with session content, returns path
- Added `test:smoke:export` root script

**Items completed:**
- [x] 5.8 — Verify: export a conversation in all 3 formats, verify content is complete and readable

**Phase 5 Exit Criteria Verified:**
- ✅ All 3 export formats work (HTML via Pi RPC, Markdown from local messages, JSON from Pi messages + stats)
- ✅ HTML is self-contained and styled (DOCTYPE, `<style>` tag, semantic HTML classes)
- ✅ Markdown is clean (headings, code blocks, details tags, emoji prefixes, metadata header)
- ✅ JSON is complete (exportedAt, sessionName, model details, stats breakdown, full message array)

**Issues encountered:**
- None — clean verification run. Enhanced fake-pi-streaming fixture for better test coverage.

**Handoff to next session:**
- **Phase 5 COMPLETE — 89/89 automated checks passed**
- Next phase: Phase 6 — Custom Themes
- Next item: 6.1 — Define `Theme` type: `{ id, name, isDark, colors: Record<string, string> }` with semantic color tokens
- Phase 6 is a UI polish phase — convert hardcoded Tailwind colors to CSS custom properties, build theme selector, persist choice, match Shiki code highlighting to theme

---

## Session 80 — Phase 5 session.exportHtml WS method + ExportDialog component (2026-03-23)

**What happened:**
- Wired Pi's `export_html` RPC command through the full stack:
  - Added `session.exportHtml` to `WS_METHODS` const in contracts
  - Added `WsSessionExportHtmlParams` (optional `outputPath`) and `WsSessionExportHtmlResult` (path + html content) types to `wsProtocol.ts`
  - Added params map and result map entries
  - Exported new types from `packages/contracts/src/index.ts`
  - Implemented `handleSessionExportHtml` in `apps/server/src/handlers/session.ts` — calls Pi's `export_html` RPC, reads the exported file via `Bun.file()`, returns both path and HTML content
  - Registered handler in `handlers/index.ts`
- Built `ExportDialog` component (`apps/web/src/components/ExportDialog.tsx`):
  - Dropdown with 3 format options: HTML (.html), Markdown (.md), JSON (.json)
  - HTML export: calls `session.exportHtml` → receives content → `downloadBlob()`
  - Markdown export: converts local `ChatMessage[]` to clean markdown (headings, code blocks, details for thinking)
  - JSON export: fetches raw Pi messages via `session.getMessages` → serializes with metadata (model, session name, timestamp)
  - `downloadBlob()` helper: creates Blob → temporary blob URL → click hidden `<a>` → revokeObjectURL
  - Same dropdown pattern as ForkDialog (click-outside, Escape, disabled states)
  - Toast on success, ErrorBanner on failure
- Added ExportDialog to AppShell toolbar, next to CompactButton and ForkDialog
- Fixed two type errors: `ChatToolResult.content` (not `.output`) and `PiModel` (not `string`) for model metadata

**Items completed:**
- [x] 5.1 — Pi's `export_html` RPC command already exists — wire it through: `session.exportHtml` WS method
- [x] 5.2 — Build `ExportDialog` component: format picker (HTML, Markdown, JSON), filename, download button

**Issues encountered:**
- None significant — two minor type mismatches caught by typecheck and fixed immediately.

**Handoff to next session:**
- Next: 5.3 — Markdown export: render messages to markdown (user blocks, assistant blocks, tool calls as code blocks)
- Note: Markdown export is already implemented in `ExportDialog.tsx` (`messagesToMarkdown()` function). 5.3 may just need verification that the output is clean and readable. Could potentially combine with 5.4 (JSON export) which is also already implemented.
- Both browser download (5.6) and keyboard shortcut (5.7) are remaining items.
- Desktop native "Save As…" dialog (5.5) will need a server hook similar to `openFolderDialog`.

---

## Session 78 — Terminal layout, shortcuts, native menu (2026-03-23)

**What happened:**
- Verified 4.7 (layout): TerminalPane already positioned as bottom panel with ResizeHandle in AppShell. Added `min-h-0` to ChatView's outer div for proper flex shrinking when terminal takes space. TerminalPane's `MAX_HEIGHT_RATIO=0.7` prevents ChatView from disappearing.
- Verified 4.8 (multiple tabs): Already fully implemented in session 77 — TerminalPane has tab bar with create/close per tab, TerminalInstance per tab with show/hide.
- Verified 4.9 (CWD inheritance): `createTerminal()` already resolves CWD from active tab → server default.
- Built 4.10 (Ctrl+` shortcut): Added `"toggleTerminal"` to `ShortcutAction` union. Added backtick handler in `useKeyboardShortcuts` with three behaviors: open → close, closed with terminals → reopen, closed without terminals → create one. Imported `createTerminal` from `terminalActions`.
- Built 4.11 (native menu): Added `toggleTerminal: "view.toggle-terminal"` to `MENU_ACTIONS`. Added "Toggle Terminal" item with `CommandOrControl+`` accelerator to View menu after Toggle Git Panel. Added `view.toggle-terminal` handler in `wireTransport.ts` `handleMenuAction` with same toggle logic. Imported `createTerminal` in `wireTransport.ts`.

**Items completed:**
- [x] 4.7 — Layout: terminal as bottom panel (resizable splitter between chat and terminal)
- [x] 4.8 — Multiple terminal tabs (like VS Code)
- [x] 4.9 — Terminal inherits CWD from active session/project
- [x] 4.10 — Keyboard shortcut: Ctrl+` toggle terminal panel
- [x] 4.11 — Desktop: native menu "View → Toggle Terminal"

**Issues encountered:**
- None — items 4.7, 4.8, 4.9 were largely already built in session 77. Only layout fix (min-h-0) and new shortcut/menu code needed.

**Handoff to next session:**
- Next: 4.12 — Verify: open terminal, run commands, resize, multiple terminals, CWD matches project
- This is the last item in Phase 4. It's a verification/testing item.
- All Phase 4 exit criteria to verify: embedded terminal works alongside chat, multiple terminal tabs, resizable, CWD-aware.
- Create an automated verification test similar to `multi-session-test.ts` and `git-integration-test.ts`.
- Key test areas: terminal.create (returns terminalId), terminal.write/data flow (echo test), terminal.resize, terminal.close, multiple terminals, CWD from session, terminal.exit event.

---

## Session 77 — Phase 4 xterm.js install + TerminalPane component (2026-03-23)

**What happened:**
- Installed `@xterm/xterm@6.0.0` + `@xterm/addon-fit@0.11.0` in `apps/web`
- Created `TerminalSlice` in Zustand store (`store/terminalSlice.ts`, `store/types.ts`):
  - `TerminalTab` type with client tab ID, server terminal ID, name, CWD, isRunning
  - `terminalPanelOpen`, `terminalTabs`, `activeTerminalTabId` state
  - CRUD actions: `addTerminalTab`, `removeTerminalTab`, `updateTerminalTab`
  - Lookup: `getActiveTerminalTab`, `getTerminalTabByTerminalId`
  - Panel auto-closes when last terminal removed
- Created `terminalActions.ts` for coordinated terminal operations:
  - `createTerminal(cwd?)` — spawns PTY, adds tab, opens panel
  - `closeTerminal(tabId)` — removes tab first (MEMORY #35 pattern), stops PTY
  - `writeTerminal(id, data)` and `resizeTerminal(id, cols, rows)` — fire-and-forget
  - CWD resolution: explicit → active tab CWD → default
- Created `TerminalInstance.tsx` — core xterm.js wrapper:
  - Creates `Terminal` + `FitAddon`, mounts to container div
  - Theme-matched dark palette (neutral-950 background, Tailwind color scale)
  - Font: JetBrains Mono → Fira Code → Cascadia Code → Menlo fallback
  - Subscribes to `terminal.data`/`terminal.exit` push channels per terminalId
  - `onData` → `writeTerminal` (stdin), push → `xterm.write` (stdout)
  - `ResizeObserver` auto-fits and sends resize to server
  - Auto-focuses when tab becomes active
  - Full cleanup on unmount (dispose terminal, observer, subscriptions)
- Created `TerminalPane.tsx` — bottom panel with terminal tabs:
  - Resizable via drag handle (min 120px, max 70% viewport, default 280px)
  - Multiple terminal tabs with running/exited indicators
  - New terminal (+) and close (×) buttons per tab
  - Empty state with "Create a terminal" button
  - Hidden when `terminalPanelOpen` is false
- Wired `terminal.exit` push in `wireTransport.ts` → marks tab `isRunning: false`
- Updated `AppShell.tsx` to include `<TerminalPane />` between ChatView and StatusBar
- Registered `createTerminalSlice` in store index

**Items completed:**
- [x] 4.5 — Install `@xterm/xterm` + `@xterm/addon-fit` in apps/web
- [x] 4.6 — Build `TerminalPane` component: xterm.js instance, resizable, theme-matched

**Issues encountered:**
- Biome formatter required line break in long fontFamily string — auto-fixed with `bun run format`

**Handoff to next session:**
- Next: 4.7 — Layout: terminal as bottom panel (resizable splitter between chat and terminal)
- TerminalPane is already positioned as a bottom panel with a drag-to-resize handle — 4.7 may be partially done. Verify the splitter interaction between ChatView and TerminalPane works correctly, and ensure ChatView flexes properly.
- Items 4.8 (multiple terminal tabs) is also partially done — `TerminalPane` already has tab bar with +/close. Need to verify multiple terminals work end-to-end.
- Remaining: 4.9 (CWD inheritance), 4.10 (Ctrl+` shortcut), 4.11 (native menu), 4.12 (verification)

---

## Session 76 — Phase 4 Terminal PTY research + server-side plumbing (2026-03-23)

**What happened:**
- Researched PTY options for Bun runtime:
  - `node-pty@1.1.0`: Native `.node` prebuild loads fine in Bun, but `posix_spawnp` fails with ENXIO (FD handling incompatibility between Bun and Node N-API)
  - `bun-pty@0.4.8`: Rust shared library via `bun:ffi`, works perfectly. Ships prebuilt binaries for macOS (arm64+x64), Linux (arm64+x64), Windows (x64). API matches node-pty.
  - Bun FFI direct `openpty`/`forkpty` access: possible but too much low-level work
  - **Decision: use `bun-pty`** — purpose-built for Bun, cross-platform, correct API
- Added `bun-pty` dependency to `apps/server`
- Created `TerminalManager` class at `apps/server/src/terminalManager.ts`:
  - Maps terminal ID → PTY instance + owner connection ID
  - Callback-based data/exit event routing
  - `create()`, `write()`, `resize()`, `close()`, `closeByConnection()`, `closeAll()`
  - Default shell detection ($SHELL on Unix, %COMSPEC% on Windows)
- Added 4 terminal WS methods to contracts (`terminal.create/write/resize/close`):
  - `WsTerminalCreateParams/Result`, `WsTerminalWriteParams`, `WsTerminalResizeParams`, `WsTerminalCloseParams`
  - All registered in `WsMethodParamsMap` and `WsMethodResultMap`
- Added 2 terminal push channels to contracts (`terminal.data`, `terminal.exit`):
  - `WsTerminalDataPush` (terminalId + data string)
  - `WsTerminalExitPush` (terminalId + exitCode + optional signal)
- Created handlers in `apps/server/src/handlers/terminal.ts`:
  - `handleTerminalCreate`, `handleTerminalWrite`, `handleTerminalResize`, `handleTerminalClose`
  - CWD resolution: explicit param → Pi session CWD → process.cwd()
- Updated `server.ts`:
  - `TerminalManager` created in `resolveConfig()`, stored on `ServerConfig`
  - Data/exit callbacks wired to `sendPush` targeting owning connection
  - Terminal cleanup on WS disconnect (`closeByConnection`) and server stop (`closeAll`)
  - `terminalManager` passed through `handleWsMessage` → `HandlerContext`
- Updated `HandlerContext` with `terminalManager: TerminalManager | null`
- Added `@pibun/server/terminalManager` subpath export
- Verified TerminalManager works with manual test: create, write, resize, close — all OK

**Items completed:**
- [x] 4.1 — Research PTY options for Bun
- [x] 4.2 — Server-side terminal manager: spawn shell, pipe stdin/stdout via WebSocket
- [x] 4.3 — New WS methods: `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.close`
- [x] 4.4 — New WS push channel: `terminal.data` (stdout chunks from shell)

**Issues encountered:**
- `exactOptionalPropertyTypes` required conditional spread for optional `cols`/`rows` in `handleTerminalCreate` (MEMORY #52 pattern)
- Biome import ordering: `./terminal.js` must come after `./session.js` alphabetically

**Handoff to next session:**
- Next: 4.5 — Install `@xterm/xterm` + `@xterm/addon-fit` in apps/web
- Server-side terminal plumbing is complete — all 4 WS methods + 2 push channels ready
- Web side needs: xterm.js install, TerminalPane component, layout integration, multiple terminal tabs, CWD inheritance, keyboard shortcuts, native menu
- Items 4.5–4.11 are all web/desktop side
- `bun-pty` confirmed working: spawns shell, receives data, resize works, clean exit

---

## Session 75 — Phase 3 Git Integration Verification (2026-03-23)

**What happened:**
- Created comprehensive git integration verification test at `apps/server/src/git-integration-test.ts`
- Test creates a temporary git repository, starts the PiBun server, and validates all 4 WS methods (`git.status`, `git.branch`, `git.diff`, `git.log`) end-to-end through WebSocket
- 12 test groups covering: clean repo status, branch detection, log history, file modification detection (modified + untracked), unified diffs (staged + unstaged), non-git directory handling (isRepo: false, graceful errors), branch switching detection, commit + log update, file deletion detection, log count parameter
- Added `test:smoke:git` script to root package.json
- Verified all Phase 3 exit criteria met

**Items completed:**
- [x] 3.10 — Verify: make changes via Pi, see git status update, view diffs, switch branches reflected

**Phase 3 Exit Criteria Verified:**
- ✅ Branch + dirty status visible at all times (GitStatusBar in toolbar, always shows for git repos)
- ✅ Changed files list accessible (GitPanel with status badges M/A/D/R/C/?)
- ✅ Diffs viewable with syntax highlighting (DiffViewer with Shiki tokenization)
- ✅ Updates after agent actions (auto-refresh on agent_end events + tab dirty dot)
- ✅ Ctrl+G toggle (keyboard shortcut + native menu accelerator + WS push forwarding)
- ✅ Tab dirty indicator (amber dot, hidden during streaming)

**Issues encountered:**
- None — clean verification run

**Handoff to next session:**
- **Phase 3 COMPLETE — 39/39 automated checks passed**
- Next phase: Phase 4 — Terminal Integration
- Next item: 4.1 — Research PTY options for Bun
- Phase 4 is a large feature (embedded terminal with xterm.js, PTY, WebSocket bridge)
- Item 4.1 is a research task — need to evaluate: node-pty (C++ addon, may need Bun compat work), Bun's native PTY if available, or shell → WebSocket bridge via Bun.spawn with pipe

---

## Session 74 — Git dirty dot in tab bar + Ctrl+G shortcut (2026-03-23)

**What happened:**
- Added amber dot indicator in `TabBar.tsx` `TabItem` component. Shows `bg-amber-500` 2×2 dot before session name when `tab.gitDirty` is true. Hidden during streaming (blue pulsing dot takes visual priority). Uses title="Uncommitted changes" for tooltip.
- Added `"toggleGitPanel"` to `ShortcutAction` union in `shortcuts.ts`.
- Added `Ctrl/Cmd+G` handler in `useKeyboardShortcuts.ts` — calls `emitShortcut("toggleGitPanel")` + `toggleGitPanel()` on the store.
- Added `toggleGitPanel: "view.toggle-git-panel"` to desktop `MENU_ACTIONS` in `menu.ts`.
- Added "Toggle Git Panel" menu item with `CommandOrControl+G` accelerator in the View menu, positioned after Toggle Sidebar.
- Added `view.toggle-git-panel` case in `wireTransport.ts` `handleMenuAction` to dispatch the toggle from native menu.

**Items completed:**
- [x] 3.8 — Git status in tab bar: dirty indicator dot on tabs with uncommitted changes
- [x] 3.9 — Keyboard shortcut: Ctrl+G toggle git panel

**Issues encountered:**
- Biome formatting: `<span>` with className + title on separate lines was reformatted to single line — fixed via `bun run format`

**Handoff to next session:**
- Next: 3.10 — Verify: make changes via Pi, see git status update, view diffs, switch branches reflected
- This is the last item in Phase 3. It's a verification/testing item. Need to confirm all Phase 3 exit criteria:
  - Branch + dirty status visible at all times ✅ (GitStatusBar in toolbar)
  - Changed files list accessible ✅ (GitPanel with file list)
  - Diffs viewable with syntax highlighting ✅ (DiffViewer with Shiki)
  - Updates after agent actions ✅ (auto-refresh on agent_end + git dirty dot on tabs)
  - Ctrl+G toggle ✅ (just added)
  - Tab dirty indicator ✅ (just added)
- The verification should test: (1) make a code change via Pi prompt, (2) see git status update in toolbar and tab bar, (3) view diff in git panel, (4) switch tabs and see dirty state preserved, (5) switch branches and see branch name update

---

## Session 73 — DiffViewer with Shiki syntax highlighting (2026-03-23)

**What happened:**
- Added `tokenizeCode()` to `apps/web/src/lib/highlighter.ts` — returns `ThemedToken[][]` via Shiki's `codeToTokens()` API for per-line rendering. Extracted shared `ensureLanguage()` helper to avoid duplication with `highlightCode()`. Re-exported `ThemedToken` type so consumers don't need a direct shiki import.
- Created `apps/web/src/components/DiffViewer.tsx` — standalone unified diff viewer with:
  - Diff parser: extracts file path from headers, parses hunks with line numbers (old/new columns)
  - Old/new file reconstruction: context+removals → "old" file, context+additions → "new" file. Both tokenized separately for proper syntax context across multi-line constructs
  - Hunk sections with @@ headers showing function context
  - Color-coded lines: green background for additions, red for removals, neutral for context
  - Syntax-highlighted code via Shiki tokenization (language inferred from file path)
  - Plain text fallback while Shiki loads, or for unknown languages / diffs > 2000 lines
  - Stats bar showing +additions / −deletions / language, with copy button
  - All sub-components memoized (`HunkSection`, `DiffLineRow`, `TokenizedLine`)
- Updated `GitPanel.tsx`: replaced `DiffPreview` with `DiffDisplay` wrapper that delegates to `<DiffViewer>` with loading/empty state handling. Now passes `filePath` for language inference.

**Items completed:**
- [x] 3.7 — `DiffViewer` component: side-by-side or unified diff view with syntax highlighting (reuse Shiki)

**Issues encountered:**
- `exactOptionalPropertyTypes` required `filePath?: string | undefined` (not `filePath?: string`) on DiffViewerProps
- Biome `useExhaustiveDependencies`: `parsed.hunks` derived from `diff` — fixed by memoizing `parsed` with `useMemo(() => parseDiff(diff), [diff])`
- Biome formatting: long if-chain needed line breaks, ternaries condensed — fixed with `bun run format`

**Handoff to next session:**
- Next: 3.8 — Git status in tab bar: dirty indicator dot on tabs with uncommitted changes
- The DiffViewer is feature-complete and standalone. It could be reused for the parking lot "Diff review mode" feature.
- `GitSlice` already has `gitIsDirty` boolean — 3.8 needs to wire this to `TabBar.tsx` / `TabItem` as a visual dot indicator on tabs. The challenge: git status is fetched per-session CWD, and different tabs may have different CWDs. May need per-tab dirty tracking in `tabsSlice` or a per-CWD cache.

---

## Session 72 — GitChangedFiles panel + diff preview (2026-03-23)

**What happened:**
- Extended `GitSlice` in Zustand store with panel + diff state: `gitPanelOpen`, `selectedDiffPath`, `selectedDiffContent`, `diffLoading`, plus actions `toggleGitPanel()`, `setGitPanelOpen()`, `setSelectedDiff()`, `setDiffLoading()`. `resetGit()` also clears panel/diff state.
- Added `fetchGitDiff(filePath)` to `gitActions.ts` — fetches diff for a specific file via `git.diff` WS method. Supports toggle behavior (clicking same file deselects it). Silent on failure.
- Created `GitPanel.tsx` — collapsible panel between toolbar and ChatView in AppShell:
  - Header: git icon, "Changed Files" label with count badge, refresh button, close button
  - Left: 256px file list with status badges (M/A/D/R/C/?/!) — color-coded, memoized `FileItem` components using `<button>` elements for a11y
  - Right: inline diff preview with color-coded lines (+green, -red, @@blue), loading spinner, empty states
  - Capped at `max-h-[40vh]` to not overwhelm the chat area
- Updated `GitStatusBar` — branch indicator and changed files badge now toggle the git panel instead of just refreshing. Active state highlighted.
- Wired `GitPanel` into `AppShell` between toolbar `<div>` and `<ChatView>`.

**Items completed:**
- [x] 3.6 — `GitChangedFiles` panel: list of changed files with status badges (M/A/D/?), click to view diff

**Issues encountered:**
- `WsGitDiffResult` wraps `GitDiffResult`, so result is `result.diff.diff` not `result.diff` — fixed after first typecheck
- Biome a11y: `div role="listbox/option"` flagged — switched to `<nav>` + `<button aria-pressed>` pattern
- Biome style: string concatenation flagged — switched to template literal

**Handoff to next session:**
- Next: 3.7 — `DiffViewer` component: side-by-side or unified diff view with syntax highlighting (reuse Shiki)
- The current `DiffPreview` in `GitPanel.tsx` renders raw colored text — 3.7 should replace it with Shiki-based syntax highlighting. The `DiffPreview` function is self-contained and easy to swap out.
- The `selectedDiffContent` in the store contains raw unified diff text from `git diff`
- Shiki is already available via `lib/highlighter.ts` (MEMORY #89-90) — reuse the singleton
- Consider: unified view (simpler, one column) vs side-by-side (more complex but more useful). Unified is likely sufficient for v1.
- The `DiffViewer` component can either be a direct replacement for `DiffPreview` inside `GitPanel`, or extracted as a standalone component for reuse in the parking lot "Diff review mode" feature

---

## Session 71 — GitStatusBar + auto-refresh (2026-03-23)

**What happened:**
- Created `apps/web/src/lib/gitActions.ts` — `fetchGitStatus()` function that calls `git.status` WS method and dispatches to Zustand `setGitStatus()`. Silent on failure (resets git state, no error banner — git is non-critical). Same pattern as `sessionActions.ts` / `projectActions.ts`.
- Created `apps/web/src/components/GitStatusBar.tsx` — toolbar component showing:
  - Git branch icon + branch name (truncated to 120px max-width)
  - Changed files count badge (amber color, dot icon + count) — clickable for manual refresh
  - Clean indicator (small green dot) when working tree is clean
  - Only renders when connected, has session, and CWD is a git repo
- Added `GitStatusBar` to `AppShell.tsx` toolbar, positioned right-aligned between spacer and SessionStats, with a divider
- Wired auto-refresh in `wireTransport.ts`:
  - `fetchGitStatus()` called after every `agent_end` event (agent likely modified files)
  - `fetchGitStatus()` called on `server.welcome` (initial connection / reconnect)

**Items completed:**
- [x] 3.4 — `GitStatusBar` component: branch name + changed file count in toolbar or status bar area
- [x] 3.5 — Auto-refresh git status after `agent_end` events (agent likely modified files)

**Issues encountered:**
- Biome formatting issue with multi-line div attributes — fixed via `bun run format`

**Handoff to next session:**
- Next: 3.6 — `GitChangedFiles` panel: list of changed files with status badges (M/A/D/?), click to view diff
- The `gitActions.ts` module has only `fetchGitStatus()` for now — 3.6/3.7 will need `fetchGitDiff(path?)` and possibly other actions
- The changed files badge is clickable (calls refresh) — 3.9 will wire Ctrl+G to toggle a git panel, and the badge click could be changed to open the panel instead
- The `gitChangedFiles` array is already in the store from 3.3 — the panel just needs to render it
- Consider whether the `GitChangedFiles` panel should be a sidebar section, a bottom panel, or a dropdown from the toolbar

---

## Session 70 — Git WS methods + GitSlice (2026-03-23)

**What happened:**
- Added 4 git WS methods to `packages/contracts/src/wsProtocol.ts`:
  - `git.status` — branch + changed files (wraps `GitStatusResult`)
  - `git.branch` — current branch name only
  - `git.diff` — unified diff with `staged` and `path` options
  - `git.log` — recent commits with configurable `count`
  - All params include optional `cwd` override
- Added param types (`WsGitStatusParams`, `WsGitBranchParams`, `WsGitDiffParams`, `WsGitLogParams`) and result types (`WsGitStatusResult`, `WsGitBranchResult`, `WsGitDiffResult`, `WsGitLogResult`) — all re-exported from `index.ts`
- Created `apps/server/src/handlers/git.ts` with 4 handler functions:
  - Shared `resolveCwd()` helper: params.cwd → session process CWD → process.cwd()
  - Each handler calls corresponding `gitService.ts` function
  - Uses `?.` for optional params (git methods have all-optional params)
  - Uses conditional spread for `exactOptionalPropertyTypes` compat (MEMORY #52)
- Registered all 4 handlers in `apps/server/src/handlers/index.ts`
- Created `apps/web/src/store/gitSlice.ts` — `GitSlice` with:
  - State: `gitBranch`, `gitChangedFiles`, `gitIsDirty`, `gitIsRepo`, `gitLastFetched`, `gitLoading`
  - Actions: `setGitStatus()` (atomic update), `setGitLoading()`, `resetGit()`
- Added `GitSlice` interface to `store/types.ts`, wired into `AppStore` union
- Registered `createGitSlice` in `store/index.ts`

**Items completed:**
- [x] 3.2 — New WS methods: `git.status`, `git.branch`, `git.diff`, `git.log`
- [x] 3.3 — Add `gitSlice` to Zustand store: `branch`, `changedFiles`, `isDirty`, `lastFetched`

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 3.4 — `GitStatusBar` component: branch name + changed file count in toolbar or status bar area
- The gitSlice is wired but has no data flow yet — 3.5 will wire auto-refresh after `agent_end` events
- To fetch git status from a component: `getTransport().request("git.status", {})` → store `setGitStatus()`
- Consider creating a `gitActions.ts` (like `sessionActions.ts` / `projectActions.ts`) to encapsulate the fetch + store update pattern
- The `resolveCwd()` in handlers falls back gracefully — works even without an active session

---

## Session 69 — Server-side git module (2026-03-23)

**What happened:**
- Created `packages/contracts/src/gitTypes.ts` with 5 types: `GitChangedFile`, `GitStatusResult`, `GitLogEntry`, `GitLogResult`, `GitDiffResult`
- Re-exported all git types from `packages/contracts/src/index.ts`
- Created `apps/server/src/gitService.ts` with 5 exported functions:
  - `isGitRepo(cwd)` — checks via `git rev-parse --is-inside-work-tree`
  - `gitStatus(cwd)` — combines branch + porcelain status, returns `{ isRepo: false }` for non-repos
  - `gitBranch(cwd)` — returns branch name or null (detached HEAD, non-repo)
  - `gitDiff(cwd, opts?)` — unified diff with `staged` and `path` filter options
  - `gitLog(cwd, count?)` — last N commits as oneline entries
- All functions use `Bun.spawn` with `GIT_PAGER=""` and `LC_ALL=C` env overrides
- `parsePorcelainStatus()` handles standard files and renames/copies with `->` separator
- `parseOnelineLog()` splits `hash message` lines
- Smoke tested against the pibun repo itself: all functions return correct data, error cases throw appropriately, non-git dirs handled gracefully

**Items completed:**
- [x] 3.1 — Server-side git module

**Issues encountered:**
- Biome formatter adjustments needed (line wrapping style) — fixed via `bun run format`

**Handoff to next session:**
- Next: 3.2 — New WS methods: `git.status`, `git.branch`, `git.diff`, `git.log`
- Follow the same pattern as project handlers: add types to `wsProtocol.ts` (method names, params, results, maps), create `handlers/git.ts`, register in `handlers/index.ts`
- Key files: `packages/contracts/src/wsProtocol.ts`, `apps/server/src/handlers/index.ts`, `apps/server/src/gitService.ts`
- The git service takes `cwd` as input. The WS handler needs to resolve CWD from the session's process (via `rpcManager`) or from request params.

---

---

## Session 68 — Window title + Phase 2 verification (2026-03-23)

**What happened:**
- Implemented desktop window title sync (2.9):
  - Added `app.setWindowTitle` WS method to contracts (`WsAppSetWindowTitleParams` with `title: string`)
  - Added `onSetWindowTitle` hook to `ServerHooks` in server
  - Added `handleAppSetWindowTitle` handler in `apps/server/src/handlers/app.ts` — calls hook if registered, silently succeeds otherwise (browser mode)
  - Registered handler in handler index
  - Desktop registers hook using module-level `mainWindowRef` set in `bootstrap()` after BrowserWindow creation
  - Created `useWindowTitle` React hook in `apps/web/src/hooks/useWindowTitle.ts` — watches `activeProjectId`, `projects`, `activeTabId`, `tabs`, `connectionStatus`. Computes title: `{ProjectName} — PiBun` or `{cwdBasename} — PiBun` or just `PiBun`. Sets both `document.title` and calls `app.setWindowTitle` when WS is open.
  - Wired `useWindowTitle()` into `AppShell.tsx`
- Phase 2 verification (2.10):
  - Created `apps/server/src/project-verify-test.ts` — 28 checks: add 3 projects, CRUD operations, CWD deduplication, window title method, persistence across server restart
  - Added `test:smoke:projects` root script
  - All 28/28 checks pass, existing 20/20 smoke tests still pass

**Items completed:**
- [x] 2.9 — Desktop: window title shows active project name
- [x] 2.10 — Verify: add 3 projects, switch between them, close app, reopen, projects persist

**Issues encountered:**
- TransportState uses `"open"` not `"connected"` — caught by typecheck, fixed immediately

**Handoff to next session:**
- **Phase 2 COMPLETE** — all 10 items done. Moving to Phase 3 — Git Integration.
- Next: 3.1 — Server-side git module: `git status --porcelain`, `git branch --show-current`, `git diff`, `git log --oneline -10`
- Key pattern: same as project handlers — server-side module + WS methods. Git commands run via `Bun.spawn` in the session's CWD. No Pi RPC involved.

---

## Session 67 — Open Recent + Cmd+O adds project (2026-03-23)

**What happened:**
- Implemented "Open Recent" list (2.7) across three layers:
  - **Web ChatView empty state**: Added `EmptyState` component with `RecentProjectItem` list showing top 10 projects sorted by `lastOpened`. Each project shows name + CWD path, click opens via `openProject()`.
  - **Desktop native menu**: Added "Open Recent" submenu to File menu with dynamic project entries. `buildMenuConfig()` accepts optional `RecentProject[]` parameter. Each menu item uses indexed action (`file.open-recent:N`). `createMenuClickHandler` updated to pass through dynamic prefix actions.
  - **Desktop menu refresh**: `refreshRecentMenu()` loads projects from `projectStore`, rebuilds full native menu via `ApplicationMenu.setApplicationMenu()`. Called on startup and whenever projects change via `onProjectsChanged` server hook.
- Implemented Cmd+O adds to project list (2.8):
  - `file.open-folder` handler in `wireTransport.ts` now calls `addProject(folderPath)` before `openProject()`, ensuring every opened folder is tracked as a project. Server deduplicates by CWD.
- Added `onProjectsChanged` hook to `ServerHooks` — project handlers call it after add/remove/update.
- Added `./projectStore` subpath export to `@pibun/server` package.
- Added `file.open-recent` action handler in `wireTransport.ts` with fallback for stale menu entries.
- Extracted `openFolderAsProject()` and `openRecentProject()` async helpers to keep handler code clean.

**Items completed:**
- [x] 2.7 — "Open Recent" list: last 10 opened project directories, persisted across app restarts
- [x] 2.8 — Desktop: "Open Folder…" (Cmd+O) adds to project list if not already present

**Issues encountered:**
- Type error: `openProject()` returns `"switched"|"created"|null` vs `startSessionInFolder()` returns `boolean`. Mixed return types in `.then()` chains caused TS error. Fixed by extracting separate async helper functions instead of chaining incompatible promises.

**Handoff to next session:**
- Next: 2.9 — Desktop: window title shows active project name
- The window title currently shows "PiBun" (set in `bootstrap()`). Need to update it when project/tab changes. Electrobun's `BrowserWindow.setTitle()` should work. May need a `menu.action` push or a new WS channel to communicate title changes from web→desktop. Or the desktop can derive it from the active session's CWD.
- Key files: `apps/desktop/src/bun/index.ts`, `apps/web/src/wireTransport.ts`

---

## Session 66 — Project switching (2026-03-23)

**What happened:**
- Added `openProject()` function to `apps/web/src/lib/projectActions.ts` — encapsulates the full project open flow: check for existing tab with matching CWD, switch to it if found, or create new tab if not.
- Added `findTabForCwd()` helper — scans tabs array for matching CWD with trailing slash normalization. Returns the last matching tab (most recently created).
- `openProject()` sets `activeProjectId` immediately for visual feedback, updates `lastOpened` timestamp on the server fire-and-forget (doesn't block the tab switch).
- Updated `handleOpenProject` in `Sidebar.tsx` to use `openProject()` instead of directly calling `createNewTab()` + `setActiveProjectId()`.
- Removed unused `setActiveProjectId` store selector from Sidebar component (now handled inside `openProject()`).
- Import of `openProject` added to Sidebar alongside existing project action imports.
- Ran formatter, typecheck, and lint — all pass.

**Items completed:**
- [x] 2.6 — Project switching: click project → starts new tab with that CWD, or switches to existing tab for that CWD

**Issues encountered:**
- None

**Handoff to next session:**
- Next: 2.7 — "Open Recent" list: last 10 opened project directories, persisted across app restarts
- The project list is already sorted by `lastOpened` descending (MEMORY #231). "Open Recent" could be implemented as a filtered view of the top 10 projects, or as a separate recent-directories list for non-project paths.
- Key files: `apps/web/src/lib/projectActions.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/server/src/projectStore.ts`

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

## Session 79 — Terminal verification + Phase 4 completion (2026-03-23)

**What happened:**
- Created comprehensive terminal integration verification test at `apps/server/src/terminal-verify-test.ts`
- Test covers 43 checks across 11 test categories:
  1. terminal.create — spawns PTY, returns terminalId + pid
  2. terminal.write + terminal.data push — stdin/stdout echo test with unique markers
  3. terminal.resize — resizes PTY dimensions, shell stays responsive
  4. Multiple terminals — 3 concurrent terminals with independent data routing
  5. CWD matches project — terminal CWD matches create param, verified via `pwd`
  6. terminal.close + terminal.exit — kill shell triggers exit push with exitCode
  7. Error handling — write/resize/close on closed/invalid terminals return errors
  8. Natural shell exit — `exit` command triggers terminal.exit push with exitCode 0
  9. Cleanup on WS disconnect — orphaned PTY processes killed, verified via cross-connection write failure
  10. Remaining terminals unaffected — terminals from ws1 still work after ws2 terminals cleaned up
  11. Default CWD — terminal.create with no CWD param inherits server process CWD
- Added `test:smoke:terminal` root script to package.json
- All 43/43 checks passed
- Verified Phase 4 exit criteria:
  - ✅ Embedded terminal works alongside chat (PTY spawn + data flow)
  - ✅ Multiple terminal tabs (3 concurrent, independent routing)
  - ✅ Resizable (terminal.resize accepted, shell responsive)
  - ✅ CWD-aware (inherits from create param, defaults correctly)
- Marked Phase 4 complete, updated plan header to Phase 5

**Items completed:**
- [x] 4.12 — Verify: open terminal, run commands, resize, multiple terminals, CWD matches project

**Issues encountered:**
- None — all terminal infrastructure from sessions 76-78 worked correctly on first test run

**Handoff to next session:**
- Phase 4 is COMPLETE. Next phase: Phase 5 — Session Export & Sharing
- Next item: 5.1 — Pi's `export_html` RPC command already exists — wire it through: `session.exportHtml` WS method
- Phase 5 is about export capabilities: HTML (via Pi), Markdown, and JSON export formats
- Read `reference/pi-mono/packages/coding-agent/docs/rpc.md` for `export_html` command details

---

## Session 81 — Phase 5 items 5.3–5.7: Markdown/JSON enhancements + Desktop Save As + Keyboard shortcut (2026-03-23)

**What happened:**
- Enhanced `messagesToMarkdown()` with session metadata header: model name/provider, token stats, cost, message breakdown. Thinking blocks use 💭 emoji. Error tool results flagged with ❌.
- Enhanced `messagesToJson()` with full stats (tokens, cost, message counts) and expanded model info (reasoning, contextWindow). Now fetches fresh stats from Pi before export.
- Added `app.saveExportFile` WS method end-to-end: contracts types (`WsAppSaveExportFileParams/Result`) → server handler (`handleAppSaveExportFile`) → server hook (`onSaveExportFile`) → desktop implementation (`saveExportFileAsync` — folder picker + `Bun.write()`).
- Updated ExportDialog to try native save first, fall back to blob download in browser mode.
- Added `toggleExportDialog` to `ShortcutAction`, wired Ctrl+Shift+E in `useKeyboardShortcuts`.
- ExportDialog subscribes to shortcut event via `onShortcut()`.
- Added "Export Session…" menu item to desktop File menu with Cmd+Shift+E accelerator.
- Added `session.export` menu action handling in `wireTransport.ts`.
- Browser blob download already existed from session 80 (`downloadBlob()` function) — verified still works as fallback.

**Items completed:**
- [x] 5.3 — Markdown export: render messages to markdown (user blocks, assistant blocks, tool calls as code blocks)
- [x] 5.4 — JSON export: raw message array dump with metadata (model, tokens, timestamps)
- [x] 5.5 — Desktop: native "Save As…" dialog for export destination
- [x] 5.6 — Browser: trigger download via blob URL
- [x] 5.7 — Keyboard shortcut: Ctrl+Shift+E export dialog

**Issues encountered:**
- Electrobun has no native "Save As" dialog — only `openFileDialog`. Used folder picker + `Bun.write()` as workaround. User picks destination folder, file is written with generated filename.
- `session.getStats` returns `{ stats: PiSessionStats }`, not `PiSessionStats` directly — needed to unwrap in ExportDialog.

**Handoff to next session:**
- Next: 5.8 — Verify: export a conversation in all 3 formats, verify content is complete and readable
- This is the last item in Phase 5. Complete it, verify exit criteria, then mark phase complete.
- Key files: `apps/web/src/components/ExportDialog.tsx`, `apps/server/src/handlers/app.ts`, `apps/desktop/src/bun/index.ts`

---

## Session 84 — Phase 6 Theme CSS migration (2026-03-24)

**What happened:**
- Converted all ~40 component files from hardcoded Tailwind color classes to semantic theme tokens
- Updated `apps/web/src/index.css` with Tailwind v4 `@theme` block defining all 40 semantic color tokens with dark theme defaults
- Added initial theme application in `main.tsx` — reads `localStorage("pibun-theme")` or `prefers-color-scheme`, calls `applyTheme()` before React renders (prevents FOUC)
- Added custom scrollbar styling using theme tokens (`::-webkit-scrollbar-*`)
- Systematic migration across all component categories:
  - **Surface**: neutral-950→surface-base, neutral-900→surface-primary, neutral-800→surface-secondary, neutral-700→surface-tertiary
  - **Text**: neutral-100/200→text-primary, neutral-300→text-secondary, neutral-400→text-secondary (contextual), neutral-500→text-tertiary, neutral-600→text-muted
  - **Border**: neutral-700→border-primary, neutral-800→border-secondary, neutral-800/50→border-muted
  - **Accent**: blue-500/600→accent-primary, blue-400→accent-text, blue-600/30→accent-soft
  - **Status**: red→status-error, green→status-success, amber/orange→status-warning, blue→status-info
  - **Special**: indigo→thinking-*, code-bg/code-inline-bg for code blocks, user-bubble-bg/text for user messages
- Components migrated: AppShell, ChatView, Composer, Sidebar, ModelSelector, ThinkingSelector, CodeBlock, Markdown, TabBar, SessionStats, CompactButton, ForkDialog, ExportDialog, ConnectionBanner, ErrorBanner, UpdateBanner, ToastContainer, StatusBar, GitPanel, GitStatusBar, DiffViewer, TerminalPane, NewSessionButton, all chat sub-components (AssistantMessage, UserMessage, SystemMessage, ToolCallMessage, ToolResultMessage, ToolExecutionCard), all tool outputs (BashOutput, ReadOutput, EditOutput, WriteOutput, ToolOutput), all extension dialogs (ConfirmDialog, EditorDialog, InputDialog, SelectDialog, ExtensionDialog)
- UserMessage switched from gray (`bg-neutral-800`) to themed user-bubble tokens (`bg-user-bubble-bg`) — default is blue-500 for visual distinction
- TerminalInstance.tsx xterm theme intentionally left as hardcoded JS — will be addressed in 6.8

**Items completed:**
- [x] 6.3 — Theme CSS: convert hardcoded Tailwind colors to CSS custom properties, apply via `data-theme` attribute on `<html>`

**Issues encountered:**
- None — clean migration. Biome format auto-fixed 7 files after class name changes affected line lengths.

**Handoff to next session:**
- Next: 6.4 — Build `ThemeSelector` component: grid of theme previews, click to apply
- All infrastructure is ready: `@theme` tokens in CSS, `applyTheme()` utility, 5 built-in themes, `localStorage` key `pibun-theme` for persistence
- ThemeSelector should follow same dropdown pattern as ModelSelector/ThinkingSelector (click-outside, Escape, disabled states)
- `THEME_LIST` provides ordered theme array, each theme has `isDark`, `name`, `id`, `colors`
- Terminal theme (xterm.js TERMINAL_THEME in TerminalInstance.tsx) needs separate handling in 6.8

---

## Session 85 — Phase 6 ThemeSelector component (2026-03-24)

**What happened:**
- Built `ThemeSelector` component at `apps/web/src/components/ThemeSelector.tsx`:
  - Trigger button with palette icon + chevron, follows same border/bg/hover pattern as ModelSelector
  - Dropdown panel with 5 theme preview cards in a vertical list
  - `ThemePreview` sub-component renders mini color swatch strip (5 segments: surface-primary, surface-secondary, accent-primary, text-primary Aa sample, user-bubble-bg) giving instant visual impression
  - Active theme highlighted with accent border + ring-1 + checkmark icon
  - Each card shows theme name + "Light"/"Dark" badge
  - Click applies immediately: `applyTheme(theme)` → `setActiveThemeId()` → `localStorage.setItem("pibun-theme")`
  - Same dropdown interaction pattern: click-outside close, Escape close, focus return to trigger
  - Cross-tab sync via `storage` event listener — changing theme in one tab updates all tabs
  - No Zustand store needed — theme is CSS-level (custom properties on `<html>`) + localStorage
- Added ThemeSelector to AppShell toolbar in session management controls section (after ExportDialog)
- Ran `bun run format` to fix Biome formatting (short JSX props collapsed to single line)
- Build gate passed: `bun run typecheck && bun run lint` clean

**Items completed:**
- [x] 6.4 — Build `ThemeSelector` component: grid of theme previews, click to apply

**Issues encountered:**
- None — straightforward component following established dropdown patterns.

**Handoff to next session:**
- Next: 6.5 — Persist theme choice: `localStorage` in browser, `~/.pibun/settings.json` in desktop
- Note: `localStorage` persistence is already implemented in ThemeSelector (reads on init, writes on select, listens for cross-tab sync). Browser-side persistence is done.
- Desktop side needs: `~/.pibun/settings.json` for persistence across sessions — could use a WS method to read/write settings, or just rely on localStorage in the webview (which Electrobun's native webview may or may not persist).
- After 6.5: 6.6 (system preference detection — `prefers-color-scheme`), 6.7 (macOS appearance changes), 6.8 (Shiki + xterm theme matching), 6.9 (verification)

---

## Session 93 — Plugin manager UI (2026-03-24)

**What happened:**
- Implemented the full Plugin Manager UI component (7.6) — toolbar dropdown for listing, enabling/disabling, installing, and uninstalling plugins
- **Updated `apps/web/src/lib/pluginActions.ts`**: Added 3 new actions: `installPlugin(source)` (calls `plugin.install` WS method + refreshes list), `uninstallPlugin(pluginId)` (closes panels first, removes via WS, refreshes), `setPluginEnabled(pluginId, enabled)` (optimistic panel toggle, persists via WS, refreshes)
- **New file: `apps/web/src/components/PluginManager.tsx`**: Toolbar dropdown component with:
  - Trigger button: puzzle piece icon + "Plugins" text + active count badge (accent colored)
  - Header: installed count + active count, refresh button
  - Scrollable plugin list: `PluginItem` (memoized) with enable/disable toggle switch (`role="switch"`), version badge, description, author, panel count, uninstall button
  - Visual states: enabled (full color), disabled (muted), error (red tint with ⚠ indicator)
  - Install form: `InstallForm` (memoized) with text input for URL/path + Install button
  - Loading states for install/toggle/uninstall operations
  - Standard dropdown behavior: click-outside close, Escape close, z-50 positioning
  - Refreshes plugin list on open
- **Updated `apps/web/src/lib/shortcuts.ts`**: Added `"togglePluginManager"` to `ShortcutAction` union
- **Updated `apps/web/src/hooks/useKeyboardShortcuts.ts`**: Added Ctrl/Cmd+Shift+P binding for plugin manager toggle
- **Updated `apps/web/src/components/AppShell.tsx`**: Added `PluginManager` to toolbar session management controls (between ExportDialog and ThemeSelector)

**Items completed:**
- [x] 7.6 — Plugin manager UI: list installed plugins, enable/disable, install from URL/path

**Issues encountered:**
- Biome formatting: new file needed `bun run format` for tab indentation and line wrapping consistency

**Handoff to next session:**
- Next: 7.7 — Example plugin: "Prompt Library" — panel that shows saved prompts, click to insert into composer
- The Plugin Manager is fully wired. Users can now:
  1. Click "Plugins" in toolbar → see all installed plugins
  2. Toggle enable/disable via switch → panels appear/disappear immediately
  3. Install from local path or URL via the install form
  4. Uninstall plugins (panels closed first, then directory removed)
  5. Ctrl+Shift+P keyboard shortcut to toggle
- 7.7 needs: Create an actual example plugin at `~/.pibun/plugins/prompt-library/` with `plugin.json` manifest + `panel.html` (self-contained HTML page with JS that uses the postMessage bridge to insert prompts into Composer). The plugin should demonstrate the full lifecycle: manifest → rendering → bridge communication.

---
