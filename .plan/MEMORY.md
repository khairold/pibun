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
- `session.getCommands` → Pi `get_commands` (for command palette)
- `session.bash` → Pi `bash` + `abort_bash` (server-side execution)
- `session.setAutoCompaction` → Pi `set_auto_compaction`
- `session.setAutoRetry` → Pi `set_auto_retry`
- `session.setSteeringMode` → Pi `set_steering_mode`
- `session.setFollowUpMode` → Pi `set_follow_up_mode`
- `session.cycleModel` → Pi `cycle_model`
- `session.cycleThinking` → Pi `cycle_thinking_level`
- `session.getLastAssistantText` → Pi `get_last_assistant_text`
- `project.searchFiles` → server-side file search (fd/find)
- `session.getTurnDiff` → server-side git diff between turns

### Key Missing UI Components (for v3)
- ComposerCommandMenu — floating autocomplete menu
- ComposerMentionChip — inline file/terminal reference pill
- SettingsPage — full settings panel
- DiffPanel — side panel with per-turn diffs
- TurnDivider — visual separator between conversation turns
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
