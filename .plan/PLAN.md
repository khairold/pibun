# PiBun v3 — Feature Parity & Polish Plan

> **Spec:** Audit of T3Code, Pi-mono RPC, Electrobun reference repos (2026-03-24)
> **Goal:** Bring PiBun to feature parity with T3Code, expose all Pi RPC capabilities, leverage Electrobun native features
> **Status:** Phase 3 in progress
> **Current Phase:** Phase 3 — Activity Timeline & Diff
> **Last Session:** Session 27 — 2026-03-24

---

## Session Protocol

### At the START of every session:
1. Read `.plan/PLAN.md` (this file) — know where we are
2. Read `.plan/MEMORY.md` — absorb shared context and decisions
3. Read `.plan/DRIFT.md` — check for spec changes
4. Read `.agents/CONVENTIONS.md` — build patterns
5. Identify the next uncompleted phase/item
6. State what you will do this session before starting

### At the END of every session:
1. Update item checkboxes in this file
2. Update `MEMORY.md` with anything the next session needs to know
3. Update `DRIFT.md` if any spec changes occurred
4. Log the session in `SESSION-LOG.md`
5. Write a **Handoff** note at the bottom of the session log entry
6. Run: `bun run typecheck && bun run lint`

---

## Phase 1 — Core UX Polish

**Goal:** Fix the most visible UX gaps that make PiBun feel unpolished compared to T3Code. No new server features — purely web app improvements.

### 1A — Scroll, Performance & Persistence

- [x] 1A.1 — Replace `useAutoScroll` with pointer-aware scroll system (detect mouse/touch scroll-up intent vs programmatic scroll, preserve anchor during content insertion)
- [x] 1A.2 — Audit all Zustand selectors for referential stability (no new objects/arrays from selectors — use `useShallow` or split selectors)
- [x] 1A.3 — Add debounced localStorage persistence for key UI state (sidebar open, active tab, theme preference) with `beforeunload` flush
- [x] 1A.4 — Add composer draft persistence per tab (text + images survive tab switch and page reload, stored in localStorage keyed by tab ID)
- [x] 1A.5 — Implement message copy button on assistant messages (copy markdown content to clipboard with toast confirmation)
- [x] 1A.6 — Add image preview modal (click any image attachment → full-size overlay with close on Escape/backdrop click)

**Exit criteria:** Streaming chat is smooth with no scroll jank. Tab switch preserves drafts. Users can copy messages and preview images.

### 1B — Thread Status & Activity Indicators

- [x] 1B.1 — Add thread/tab status indicators: running (blue pulse), waiting-for-input (amber pulse), error (red), idle (gray dot). Derive from session state + extension UI pending state
- [x] 1B.2 — Show auto-retry UI: inline indicator in ChatView ("Retrying… attempt 2/3") + progress during retry delay. Wire `auto_retry_start`/`auto_retry_end` events to new store fields
- [x] 1B.3 — Surface `extension_error` events as dismissible warning toasts (not just console.log)
- [x] 1B.4 — Add provider health indicator: show banner when Pi process exits unexpectedly, session start fails, or model errors occur repeatedly
- [x] 1B.5 — Add completion summary after agent finishes: "Worked for Xm Ys" divider between turns (derive from `agent_start`/`agent_end` timestamps)
- [x] 1B.6 — Improve turn boundaries: visual separator between user→assistant turns with timestamp, collapsed tool activity count

**Exit criteria:** Users can see at a glance which sessions are active, errored, or waiting. Retry and error states are visible.

### 1C — Settings & Preferences

- [x] 1C.1 — Create settings page/dialog (accessible via Ctrl/Cmd+, or menu): theme selector, default model, default thinking level, auto-compaction toggle, timestamp format
- [x] 1C.2 — Add `settings.get`/`settings.update` persistence to `~/.pibun/settings.json` on server (already have handlers — wire to UI)
- [x] 1C.3 — Wire `set_auto_compaction` toggle to Pi RPC (server handler + UI toggle in settings)
- [x] 1C.4 — Wire `set_auto_retry` toggle to Pi RPC (server handler + UI toggle in settings)
- [x] 1C.5 — Wire `set_steering_mode` and `set_follow_up_mode` to Pi RPC (server handlers + UI in settings: all vs one-at-a-time)
- [x] 1C.6 — Add timestamp format selector (relative, locale, 12-hour, 24-hour) — apply throughout UI

**Exit criteria:** Users can configure app behavior. Settings persist across restarts. Pi auto-compaction and auto-retry are controllable.

---

## Phase 2 — Composer Power Features

**Goal:** Transform the composer from a plain textarea into an intelligent input with file references, slash commands, and terminal context.

### 2A — Slash Commands & Command Palette

- [x] 2A.1 — Add Pi RPC `get_commands` support: new WS method `session.getCommands` + server handler + contracts types
- [x] 2A.2 — Build ComposerCommandMenu component: floating menu above composer, keyboard navigable (↑↓ + Enter + Escape), filtered by typed text
- [x] 2A.3 — Implement `/` trigger detection: typing `/` at line start opens command menu with available Pi commands (extensions, skills, prompts)
- [x] 2A.4 — Implement `/model` slash command: opens inline model picker, selecting a model calls `session.setModel`
- [x] 2A.5 — Implement `cycle_model` and `cycle_thinking_level` as keyboard shortcuts (Ctrl/Cmd+M to cycle model, Ctrl/Cmd+Shift+M to cycle thinking)

**Exit criteria:** Users can type `/` to see available commands. `/model` switches models inline. Keyboard shortcuts for quick model/thinking cycling.

### 2B — File Mentions

- [x] 2B.1 — Add workspace file search API: new WS method `project.searchFiles` → server-side `fd`/`find` with gitignore respect, debounced query, returns `{ path, kind }[]`
- [x] 2B.2 — Implement `@` trigger detection in composer: typing `@` opens file search menu, debounced query (120ms), fuzzy matched
- [x] 2B.3 — Render file mentions as inline chips in composer (visual pill with filename, removable)
- [x] 2B.4 — On send, expand file mention chips into `@path/to/file` text in the prompt message (Pi understands this as file reference)

**Exit criteria:** Users can type `@` to search and reference project files in prompts. Mentions show as removable chips.

### 2C — Terminal Context & Image Improvements

- [x] 2C.1 — Add terminal content selection API: select text in terminal → "Add to composer" button → attaches terminal output as context
- [x] 2C.2 — Render terminal context attachments as inline chips in composer (like file mentions but for terminal output)
- [x] 2C.3 — On send, append terminal context content to prompt text with formatting
- [x] 2C.4 — Add drag-and-drop image support to composer (currently only clipboard paste)
- [x] 2C.5 — Improve image preview strip: larger thumbnails, file size indicator, click to expand

**Exit criteria:** Users can attach terminal output and drag images into composer.

---

## Phase 3 — Activity Timeline & Diff

**Goal:** Transform the flat message list into a rich activity timeline with per-turn diffs and work grouping.

- [x] 3.1 — Refactor ChatView to use `TimelineEntry` union type: `{ kind: "message" } | { kind: "tool-group" } | { kind: "turn-divider" } | { kind: "completion-summary" }`
- [x] 3.2 — Group tool calls into collapsible work groups per turn (tool-execution-start through tool-execution-end as one visual unit with summary header)
- [x] 3.3 — Add turn dividers with timestamp, elapsed time, and collapsed tool count badge
- [ ] 3.4 — Track per-turn file changes: collect file paths from Edit/Write tool calls, display as "Changed files" badge on turn divider
- [ ] 3.5 — Add diff data pipeline: server handler to read Pi session file + git diff between turns, new WS method `session.getTurnDiff`
- [ ] 3.6 — Build DiffPanel component: side panel (toggled via Ctrl/Cmd+D) showing per-turn diffs with file tree and stacked/split view toggle
- [ ] 3.7 — Add checkpoint info: associate turn boundaries with git state, show "Revert to this point" UI (calls Pi `fork` to branch from that turn's user message)
- [ ] 3.8 — Add unread/visited tracking per tab: store `lastVisitedAt` timestamp, show unread dot in sidebar/tab bar when new content arrives while tab is inactive
- [ ] 3.9 — Show project favicon in sidebar: server endpoint `GET /api/project-favicon?cwd=<path>` resolves nearest favicon/icon from project directory

**Exit criteria:** Chat shows grouped tool activity per turn. Users can view diffs per turn. Unread indicators work across tabs.

---

## Phase 4 — Desktop Native Features

**Goal:** Make the desktop app feel native using Electrobun's capabilities — context menus, tray, enhanced menus, multi-window.

### 4A — Context Menus & Thread Management

- [ ] 4A.1 — Add Electrobun context menu support: `showContextMenu(items)` in desktop main process, forwarded via WS push on selection
- [ ] 4A.2 — Thread context menu (right-click in sidebar): Rename, Copy Path, Copy Session ID, Mark Unread, Delete
- [ ] 4A.3 — Implement thread renaming: inline edit in sidebar (click rename → input field → Enter/Escape), calls `session.setName` via Pi RPC
- [ ] 4A.4 — Implement thread deletion: confirmation dialog → stop session → remove tab → cleanup
- [ ] 4A.5 — Project context menu: Open in Terminal, Open in Editor, Remove Project
- [ ] 4A.6 — Message context menu (right-click on message): Copy Text, Copy as Markdown, Fork from Here

### 4B — Tray & Window Features

- [ ] 4B.1 — Add system tray icon with menu: current session status, recent sessions list, New Session, Quit
- [ ] 4B.2 — Tray status indicator: change icon/color based on active session state (idle, working, error)
- [ ] 4B.3 — Add Electrobun navigation rules to prevent webview from navigating away from PiBun
- [ ] 4B.4 — Add Electrobun window focus/blur events: dim status bar when unfocused, track focus for notification suppression
- [ ] 4B.5 — Enhance auto-update: show download progress in sidebar footer, prompt for restart when ready, use Electrobun's bsdiff patches

### 4C — Multi-Select & Bulk Operations

- [ ] 4C.1 — Add multi-select to sidebar: Ctrl/Cmd+click to toggle, Shift+click for range select
- [ ] 4C.2 — Multi-select context menu: Delete Selected (N), Mark All Unread
- [ ] 4C.3 — Add session drag-to-reorder in sidebar (within project groups)

**Exit criteria:** Right-click works everywhere. Tray icon shows status. Auto-update has progress UI. Bulk operations work.

---

## Phase 5 — Advanced Pi Features

**Goal:** Expose the remaining Pi RPC capabilities and add power-user features.

### 5A — Pi RPC Completeness

- [ ] 5A.1 — Add `bash` RPC command support: new WS method `session.bash` → execute command, add output to Pi context. UI: terminal-like input in composer or dedicated panel
- [ ] 5A.2 — Add `abort_bash` support for cancelling running bash commands
- [ ] 5A.3 — Wire `get_last_assistant_text` to "Copy Last Response" action (keyboard shortcut + menu item)
- [ ] 5A.4 — Add `extension_ui_request` `setStatus` rendering: persistent status entries in status bar (keyed, updateable)
- [ ] 5A.5 — Add `extension_ui_request` `setWidget` rendering: widget blocks above/below composer
- [ ] 5A.6 — Add `extension_ui_request` `setTitle` handling: update window title from extension
- [ ] 5A.7 — Add `extension_ui_request` `set_editor_text` handling: prefill composer text from extension

### 5B — Terminal Enhancements

- [ ] 5B.1 — Terminal split panes: split current terminal horizontally, independent resize handles
- [ ] 5B.2 — Terminal groups per tab: each tab has its own terminal group (preserved across tab switches)
- [ ] 5B.3 — Terminal link detection: parse file paths in terminal output, make clickable (open in editor)
- [ ] 5B.4 — Terminal theme sync: derive xterm.js theme from current PiBun theme tokens

### 5C — Configurable Keybindings

- [ ] 5C.1 — Design keybinding schema: `{ key, command, when? }` rules loaded from `~/.pibun/keybindings.json`
- [ ] 5C.2 — Build keybinding resolver: parse key strings, evaluate `when` conditions (terminalFocus, etc.), match rules in order
- [ ] 5C.3 — Replace hardcoded `useKeyboardShortcuts` with configurable keybinding system
- [ ] 5C.4 — Add keybinding display in settings (show current bindings, link to edit config file)

**Exit criteria:** All Pi RPC commands exposed. Terminal has splits and link detection. Keybindings are configurable.

---

## Parking Lot

Items discussed but deferred past Phase 5.

- [ ] Plan mode (Pi `/plan` command with sidebar)
- [ ] PR status indicators in sidebar
- [ ] Pull request dialog (checkout PR into thread)
- [ ] Project scripts (configurable build/test/lint scripts per project)
- [ ] Git worktree creation per thread
- [ ] Virtual scroll for 100+ message conversations (react-virtuoso already installed)
- [ ] Multi-window support (detached terminal, settings window)
- [ ] Markdown link handling (open file in editor vs browser)
- [ ] Concurrent file search via Web Workers
