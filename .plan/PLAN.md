# PiBun v2 — Build Plan

> **Spec:** Parking lot items from v1 plan + new ideas from usage
> **Status:** Phase 7 in progress
> **Current Phase:** Phase 7 — Plugin System
> **Last Session:** Session 94 — 2026-03-24
> **Previous plan:** `.plan/archive/PLAN-v1.md` (97 items, 51 sessions, all complete)

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
6. Run the build gate command

---

## Phase 1 — Multi-Session & Tabs

**Goal:** Run multiple Pi processes simultaneously with a tabbed interface. Each tab is an independent session with its own CWD, model, and conversation.

- [x] 1.1 — Extend `PiRpcManager` to support multiple concurrent sessions (currently supports multiple but UI is single-session)
- [x] 1.2 — Add `SessionTab` type to contracts: `{ id, name, cwd, model, isStreaming, isActive, messageCount, createdAt }`
- [x] 1.3 — Add `tabsSlice` to Zustand store: `tabs: SessionTab[]`, `activeTabId`, `addTab`, `removeTab`, `switchTab`, `updateTab`
- [x] 1.4 — Build `TabBar` component: horizontal tabs with session name, model badge, streaming indicator, close button, "+" new tab button
- [x] 1.5 — Wire tab switching: switching tab saves current messages to tab state, loads target tab's messages from Pi via `get_messages`
- [x] 1.6 — Wire new tab: creates new Pi process via `session.start`, adds tab, switches to it
- [x] 1.7 — Wire close tab: stops Pi process via `session.stop`, removes tab, switches to adjacent tab (or empty state if last tab)
- [x] 1.8 — Tab drag-to-reorder (optional polish)
- [x] 1.9 — Keyboard shortcuts: Ctrl+T new tab, Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab cycle tabs, Ctrl+1-9 jump to tab
- [x] 1.10 — Update Sidebar to show tabs grouped by CWD, or remove session list in favor of tabs
- [x] 1.11 — Desktop: update native menus with tab actions (New Tab, Close Tab, Next/Previous Tab)
- [x] 1.12 — Verify: 3 simultaneous sessions streaming, switch between them, close one, verify no orphaned processes

**Exit criteria:** Multiple Pi sessions run in parallel. Tabs show streaming state. Switch is instant (messages cached). No process leaks on close. ✅ ALL VERIFIED — 40/40 automated checks passed.

---

## Phase 2 — Project Management

**Goal:** Sidebar with project directories. Each project remembers its sessions, CWD, and model preferences.

- [x] 2.1 — Define `Project` type: `{ id, name, cwd, lastOpened, favoriteModel?, defaultThinking?, sessionCount }`
- [x] 2.2 — Add `projectsSlice` to Zustand store: `projects: Project[]`, `activeProjectId`, CRUD actions
- [x] 2.3 — Server-side project persistence: `~/.pibun/projects.json` (read/write via new WS methods `project.list`, `project.add`, `project.remove`, `project.update`)
- [x] 2.4 — Build `ProjectSidebar` section: project list with icons, last-opened date, session count badge
- [x] 2.5 — "Add Project" flow: folder picker (native dialog in desktop, text input in browser) → creates project entry
- [x] 2.6 — Project switching: click project → starts new tab with that CWD, or switches to existing tab for that CWD
- [x] 2.7 — "Open Recent" list: last 10 opened project directories, persisted across app restarts
- [x] 2.8 — Desktop: "Open Folder…" (Cmd+O) adds to project list if not already present
- [x] 2.9 — Desktop: window title shows active project name
- [x] 2.10 — Verify: add 3 projects, switch between them, close app, reopen, projects persist

**Exit criteria:** Projects sidebar works. Projects persist across restarts. Opening a project starts a session in that CWD. ✅ ALL VERIFIED — 28/28 automated checks passed + 20/20 smoke tests pass.

---

## Phase 3 — Git Integration

**Goal:** Show git status for the active project's CWD. Branch indicator, changed file count, diff viewer.

- [x] 3.1 — Server-side git module: `git status --porcelain`, `git branch --show-current`, `git diff`, `git log --oneline -10` — execute via `Bun.spawn` in the session's CWD
- [x] 3.2 — New WS methods: `git.status`, `git.branch`, `git.diff`, `git.log`
- [x] 3.3 — Add `gitSlice` to Zustand store: `branch`, `changedFiles`, `isDirty`, `lastFetched`
- [x] 3.4 — `GitStatusBar` component: branch name + changed file count in toolbar or status bar area
- [x] 3.5 — Auto-refresh git status after `agent_end` events (agent likely modified files)
- [x] 3.6 — `GitChangedFiles` panel: list of changed files with status badges (M/A/D/?), click to view diff
- [x] 3.7 — `DiffViewer` component: side-by-side or unified diff view with syntax highlighting (reuse Shiki)
- [x] 3.8 — Git status in tab bar: dirty indicator dot on tabs with uncommitted changes
- [x] 3.9 — Keyboard shortcut: Ctrl+G toggle git panel
- [x] 3.10 — Verify: make changes via Pi, see git status update, view diffs, switch branches reflected

**Exit criteria:** Branch + dirty status visible at all times. Changed files list accessible. Diffs viewable with syntax highlighting. Updates after agent actions. ✅ ALL VERIFIED — 39/39 automated checks passed.

---

## Phase 4 — Terminal Integration

**Goal:** Embedded terminal pane for running commands alongside Pi conversations.

- [x] 4.1 — Research PTY options for Bun (node-pty, Bun's native PTY if available, or xterm.js with WebSocket bridge)
- [x] 4.2 — Server-side terminal manager: spawn shell, pipe stdin/stdout via WebSocket
- [x] 4.3 — New WS methods: `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.close`
- [x] 4.4 — New WS push channel: `terminal.data` (stdout chunks from shell)
- [x] 4.5 — Install `@xterm/xterm` + `@xterm/addon-fit` in apps/web
- [x] 4.6 — Build `TerminalPane` component: xterm.js instance, resizable, theme-matched
- [x] 4.7 — Layout: terminal as bottom panel (resizable splitter between chat and terminal)
- [x] 4.8 — Multiple terminal tabs (like VS Code)
- [x] 4.9 — Terminal inherits CWD from active session/project
- [x] 4.10 — Keyboard shortcut: Ctrl+` toggle terminal panel
- [x] 4.11 — Desktop: native menu "View → Toggle Terminal"
- [x] 4.12 — Verify: open terminal, run commands, resize, multiple terminals, CWD matches project

**Exit criteria:** Embedded terminal works alongside chat. Multiple terminal tabs. Resizable. CWD-aware. ✅ ALL VERIFIED — 43/43 automated checks passed.

---

## Phase 5 — Session Export & Sharing

**Goal:** Export conversations as HTML, Markdown, or JSON for sharing and archival.

- [x] 5.1 — Pi's `export_html` RPC command already exists — wire it through: `session.exportHtml` WS method
- [x] 5.2 — Build `ExportDialog` component: format picker (HTML, Markdown, JSON), filename, download button
- [x] 5.3 — Markdown export: render messages to markdown (user blocks, assistant blocks, tool calls as code blocks)
- [x] 5.4 — JSON export: raw message array dump with metadata (model, tokens, timestamps)
- [x] 5.5 — Desktop: native "Save As…" dialog for export destination
- [x] 5.6 — Browser: trigger download via blob URL
- [x] 5.7 — Keyboard shortcut: Ctrl+Shift+E export dialog
- [x] 5.8 — Verify: export a conversation in all 3 formats, verify content is complete and readable

**Exit criteria:** All 3 export formats work. HTML is self-contained and styled. Markdown is clean. JSON is complete. ✅ ALL VERIFIED — 89/89 automated checks passed.

---

## Phase 6 — Custom Themes

**Goal:** Light/dark mode plus custom color themes. Theme persists across sessions.

- [x] 6.1 — Define `Theme` type: `{ id, name, isDark, colors: Record<string, string> }` with semantic color tokens
- [x] 6.2 — Built-in themes: light (default), dark, dimmed, high-contrast dark, high-contrast light
- [x] 6.3 — Theme CSS: convert hardcoded Tailwind colors to CSS custom properties, apply via `data-theme` attribute on `<html>`
- [x] 6.4 — Build `ThemeSelector` component: grid of theme previews, click to apply
- [x] 6.5 — Persist theme choice: `localStorage` in browser, `~/.pibun/settings.json` in desktop
- [x] 6.6 — System preference detection: `prefers-color-scheme` → auto-select light/dark
- [x] 6.7 — Desktop: respect macOS appearance changes (light → dark mode switch)
- [x] 6.8 — Shiki theme matching: switch code highlighting theme to match app theme
- [x] 6.9 — Verify: switch themes, code blocks re-highlight, persists across restart, system preference respected

**Exit criteria:** 5 built-in themes work. Code highlighting matches. Persists. System preference followed. ✅ ALL VERIFIED — 104/104 automated checks passed.

---

## Phase 7 — Plugin System

**Goal:** Extend PiBun's UI with custom panels via a plugin API.

- [x] 7.1 — Define plugin manifest: `{ id, name, version, description, panels: PanelConfig[] }`
- [x] 7.2 — Define `PanelConfig`: `{ id, title, icon, position: "sidebar" | "bottom" | "right", component: string (URL or path) }`
- [x] 7.3 — Plugin loading: read `~/.pibun/plugins/` directory, load manifests
- [x] 7.4 — Plugin panel rendering: sandboxed iframe (web) or Electrobun BrowserView (desktop) loading plugin URL
- [x] 7.5 — Plugin ↔ PiBun messaging: `postMessage` bridge for reading session state, sending prompts, subscribing to events
- [x] 7.6 — Plugin manager UI: list installed plugins, enable/disable, install from URL/path
- [x] 7.7 — Example plugin: "Prompt Library" — panel that shows saved prompts, click to insert into composer
- [ ] 7.8 — Verify: install example plugin, see it in sidebar, interact with it, disable it

**Exit criteria:** Plugins can add panels to the UI. Sandboxed. Can interact with session state via message bridge. Example plugin works.

---

## Parking Lot

Ideas for future consideration:

- [ ] Pi extension marketplace — browse and install Pi extensions from the UI (depends on Pi having a registry)
- [ ] Collaborative sessions — multiple users watching the same Pi session (WebSocket fan-out already exists, needs auth + multi-user state)
- [ ] Voice input — microphone → STT → prompt
- [ ] Session search — full-text search across all conversations
- [ ] Prompt templates UI — browse and use Pi's prompt templates from a panel
- [ ] Diff review mode — after agent makes changes, show all diffs in a review panel before committing
- [ ] Split view — two conversations side by side
