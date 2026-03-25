# PiBun — Future Work

> Items deferred from the v3 feature parity plan. Assessed 2026-03-24.

## Recommended

Small items with clear value. Worth doing.

- [ ] **Project scripts** — Configurable build/test/lint scripts per project, runnable from sidebar or shortcut. T3Code has this as `ProjectScriptsControl`. Moderate effort, useful for power users who want one-click test/build.

## Low Priority

Terminal enhancements and larger features. Assess when needed.

- [ ] **Terminal splits within a tab** — Re-add `groupId`, split rendering, keybindings for side-by-side panes within a single terminal tab. Each tab = one terminal is the right default for now.
- [ ] **Terminal drag-to-reorder** — Drag handlers on content tab bar, reorder state, visual feedback.
- [ ] **Terminal persistence across app restarts** — Serialize project→terminal mapping to storage, reconnect PTY sessions on restart.

- [ ] **PR status indicators in sidebar** — Show open/closed/merged PR badges per thread. Requires GitHub API polling per branch. Complex, GitHub-specific.
- [ ] **Pull request dialog** — Checkout a PR into a new thread. Depends on PR indicators + git worktrees.
- [ ] **Git worktree creation per thread** — Each thread gets its own git worktree for isolation. Complex git operations, deeply tied to T3Code's orchestration layer.
- [ ] **Multi-window support** — Detached terminal window, standalone settings window via Electrobun's multi-window API. Nice UX but adds complexity.

## Not Needed

Assessed and dropped.

- ~~Plan mode~~ — Not a Pi core feature. It's an [example extension](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/plan-mode) that uses `setStatus`, `setWidget`, `select`, and `editor` — all of which PiBun already renders. Users install the extension; PiBun shows its UI automatically.
- ~~Virtual scroll optimization~~ — `react-virtuoso` is already active since v2 (MEMORY-v2 #139). Already done.
- ~~Markdown link handling~~ — Implemented. File paths open in editor, URLs open in browser.
- ~~Concurrent file search via Web Workers~~ — Server-side `fd`/`find` is already fast. Client-side workers add complexity for no measurable gain.

---

## Build History

| Plan | Items | Sessions | Duration | Date |
|------|-------|----------|----------|------|
| v1 | 97 | — | — | 2026-03-23 |
| v2 | 69 | — | — | 2026-03-23 |
| v3 | 70 | 52 autopilot + 1 manual | ~5.5 hours (autopilot) | 2026-03-24 |
| post-v3 | 1 (markdown links) | 1 manual | ~15 min | 2026-03-24 |
| single-session | 21 | 10 autopilot | — | 2026-03-24 |
| tabbed-ui | 23 | 15 autopilot | — | 2026-03-25 |

Full plan archives at `.plan/archive/`.
