# Conventions

> Rules that AREN'T expressed in code or types. Read at the start of every session.
> If a rule here contradicts the TypeScript types, the types win.

---

## JSONL Parsing

✅ Use `JsonlParser` from `@pibun/shared/jsonl` — it handles buffering, `\n` splitting, and `\r` stripping.

❌ NEVER use Node's `readline` module — it splits on U+2028 and U+2029 which appear inside JSON strings.
❌ NEVER assume one `data` event = one JSON line (chunks can split mid-line).

---

## Tool Execution Updates

✅ `tool_execution_update.partialResult` is **accumulated** — replace the entire display
❌ `tool_execution_update.partialResult` is NOT a delta — don't append to previous value

```typescript
// ✅ Correct: replace
case "tool_execution_update":
  updateToolOutput(event.toolCallId, event.partialResult); // full replacement

// ❌ Wrong: append
case "tool_execution_update":
  appendToolOutput(event.toolCallId, event.partialResult); // DOUBLE OUTPUT
```

---

## Text Streaming

✅ `message_update` with `text_delta` IS a delta — append to current content
✅ `message_update` with `thinking_delta` IS a delta — append to thinking section

---

## React Components

✅ Props-driven — components receive data, don't fetch it
✅ Tailwind for all styling — utility classes via `cn()` helper
✅ Zustand selectors for state — `useStore(state => state.x)`

❌ No data fetching inside components (WebSocket subscriptions happen in the store layer)
❌ No inline styles — always Tailwind utility classes

---

## State Management

✅ Zustand for all client state
✅ Actions are functions inside the store that update state
✅ Selectors for derived state — avoid computing in components

❌ No deeply nested state — keep it flat
❌ No state duplication — single source of truth per piece of data
❌ Never return new arrays/objects from selectors — causes infinite re-renders. Use `useMemo` or `useShallow`.

---

## Imports

✅ Use workspace package names: `@pibun/contracts`, `@pibun/shared/jsonl`
✅ Group imports: external packages → workspace packages → local modules

❌ Don't use relative paths across package boundaries (use workspace names)
❌ Don't use barrel re-exports in `packages/shared` (explicit subpath exports only)

---

## Naming

✅ PascalCase for types, interfaces, React components, classes
✅ camelCase for variables, functions, methods, properties
✅ UPPER_SNAKE_CASE for constants
✅ kebab-case for file names (React component files can be PascalCase)

---

## Error Handling

✅ Catch and handle errors at boundaries (WebSocket handlers, Pi process events)
✅ Log errors with enough context to debug
✅ Surface errors to the UI (error banners, retry indicators)

❌ Don't swallow errors silently
❌ Don't let Pi process crashes take down the server

---

## File Organization

The codebase follows "deep modules" — fewer files, richer interfaces, self-contained units.

| Package | Key Files |
|---------|-----------|
| `packages/contracts/src/` | `piProtocol.ts` (Pi RPC types), `domain.ts` (app domain types), `wsProtocol.ts` (WS protocol), `index.ts` (barrel) — **4 files** |
| `apps/server/src/handlers/` | `session.ts` (Pi RPC session logic), `appHandlers.ts` (app/git/plugin/project/settings/terminal), `types.ts` (handler helpers), `index.ts` (registry) — **4 files** |
| `apps/web/src/store/` | `appSlice.ts` (connection+ui+update+notifications), `sessionSlice.ts` (session+messages+models+extensionUi), `workspaceSlice.ts` (tabs+terminal+git+plugins+projects), `types.ts`, `index.ts` — **5 files** |
| `apps/web/src/lib/` | `appActions.ts` (git+project+plugin+settings+terminal), `sessionActions.ts`, `tabActions.ts`, `themes.ts`, `highlighter.ts`, `pluginMessageBridge.ts`, `utils.ts` — **7 files** |
| `apps/web/src/components/chat/` | `ChatMessages.tsx` (User+Assistant+System), `ToolCards.tsx` (ToolCall+ToolResult+ToolExecutionCard), `ToolOutput.tsx` (Bash+Read+Edit+Write+Default) — **3 files** |

✅ When adding new functionality, extend existing deep files rather than creating new ones
✅ Keep contracts types-only (no runtime logic except `WS_METHODS`/`WS_CHANNELS` constants)
✅ Action files follow the pattern: getTransport → request → update store

❌ Don't create one-file-per-function modules — merge related functionality
❌ Don't split a domain across multiple files unless files exceed ~600 lines with distinct concerns

---

## Git

✅ Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
✅ Commit agent system files (.plan/, .agents/)

❌ Don't commit `node_modules/`, `dist/`, `.turbo/`
❌ Don't commit reference repos (they're in .gitignore)
