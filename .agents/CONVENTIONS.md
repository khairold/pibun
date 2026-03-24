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

## Git

✅ Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
✅ Commit agent system files (.plan/, .agents/)

❌ Don't commit `node_modules/`, `dist/`, `.turbo/`
❌ Don't commit reference repos (they're in .gitignore)
