# Roadmap

## Philosophy

Ship incrementally. Each phase produces a usable artifact. Don't build the desktop wrapper until the web app works in a browser.

---

## Completed

### v1 Plan — Core Application (97 items, 51 sessions)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Scaffold — monorepo, TypeScript, Biome, package scaffolds | ✅ Complete |
| Phase 1A | Server + Pi RPC Bridge — PiRpcManager, JSONL parser, process lifecycle | ✅ Complete |
| Phase 1B | WebSocket Server — HTTP/WS server, request routing, Pi event forwarding | ✅ Complete |
| Phase 1C | Web UI (Minimal) — chat, streaming text, tool output, auto-scroll | ✅ Complete |
| Phase 1D | Web UI (Full) — thinking blocks, syntax highlighting, model/thinking selectors, session management, extension UI, image paste, sidebar, responsive layout | ✅ Complete |
| Phase 2A | Electrobun Scaffold — desktop app, embedded server, window persistence | ✅ Complete |
| Phase 2B | Native Integration — menus, file dialogs, notifications, keyboard shortcuts, app icon | ✅ Complete |
| Phase 2C | Distribution — macOS/Linux/Windows builds, code signing, auto-update, CI/CD | ✅ Complete |

### v2 Plan — Extended Features (69 items, 44 sessions)

| Phase | Description | Verification |
|-------|-------------|-------------|
| Phase 1 | Multi-Session & Tabs — concurrent Pi processes, tabbed UI, drag-to-reorder | 40/40 checks ✅ |
| Phase 2 | Project Management — sidebar, CRUD, persistence, Open Recent, Cmd+O | 28/28 + 20/20 checks ✅ |
| Phase 3 | Git Integration — status, branch, changed files, diff viewer with Shiki | 39/39 checks ✅ |
| Phase 4 | Terminal Integration — PTY via bun-pty, xterm.js, multiple tabs, resizable | 43/43 checks ✅ |
| Phase 5 | Session Export — HTML/Markdown/JSON export, native Save As dialog | 89/89 checks ✅ |
| Phase 6 | Custom Themes — 5 built-in themes, CSS custom properties, system preference | 104/104 checks ✅ |
| Phase 7 | Plugin System — manifest, sandboxed iframes, postMessage bridge, example plugin | 116/116 checks ✅ |

### Single-Session Simplification (21 items, 10 sessions)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Single-Session Enforcement — one Pi process at a time, remove background routing | ✅ Complete |
| Phase 2 | Session Lifecycle UX — empty session cleanup, auto-naming, active highlight | ✅ Complete |
| Phase 3 | Cleanup & Simplify Types — remove dead multi-tab code, simplify `Session` type | ✅ Complete |

### Project-Scoped Tabbed UI (23 items, 15 sessions)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Rekey Terminal State — `ownerTabId` → `projectPath`, content tab state model | ✅ Complete |
| Phase 2 | Content Tab Bar + Full-Size Terminals — `ContentTabBar`, AppShell restructure, auto-create | ✅ Complete |
| Phase 3 | Polish & Cleanup — rename tabs, keyboard shortcuts, context menu, dead code removal | ✅ Complete |

---

## Parking Lot

Ideas for future consideration:

- **Pi extension marketplace** — browse and install Pi extensions from the UI (depends on Pi having a registry)
- **Collaborative sessions** — multiple users watching the same Pi session (WebSocket fan-out already exists, needs auth + multi-user state)
- **Voice input** — microphone → STT → prompt
- **Session search** — full-text search across all conversations
- **Prompt templates UI** — browse and use Pi's prompt templates from a panel
- **Diff review mode** — after agent makes changes, show all diffs in a review panel before committing
- **Split view** — two conversations side by side
