# Conventions

> How we build. Rules with ✅/❌ examples. Read at the start of every session.
> Updated as patterns emerge during development.

---

## Architecture: The Thin Bridge Principle

The server is a **thin bridge** between the browser and Pi. Pi handles state. We pipe events through.

✅ Forward Pi events to WebSocket clients as-is
✅ Translate WebSocket method calls to Pi RPC commands
✅ Add server-level concerns (connection tracking, session mapping, health checks)

❌ Reimplement session persistence (Pi does this)
❌ Add model normalization layers (Pi's events are already normalized)
❌ Build orchestration engines, event sourcing, deciders, or projectors (Pi handles state)
❌ Cache Pi state on the server (always forward from Pi, single source of truth)

---

## JSONL Parsing

The most critical convention. Getting this wrong causes silent data corruption.

✅ Accumulate a string buffer from Pi's stdout
✅ Split on `\n` only (U+000A)
✅ Strip optional trailing `\r` from each line
✅ Parse each complete line as JSON
✅ Handle partial lines (buffer until next `\n`)

❌ NEVER use Node's `readline` module — it splits on U+2028 and U+2029 which appear inside JSON strings
❌ NEVER split on anything other than `\n`
❌ NEVER assume one `data` event = one JSON line (chunks can split mid-line)

```typescript
// ✅ Correct: manual buffer splitting
let buffer = "";
process.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop()!; // keep incomplete last line in buffer
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, "");
    if (trimmed) {
      const event = JSON.parse(trimmed);
      this.emit("event", event);
    }
  }
});

// ❌ Wrong: readline
import { createInterface } from "readline";
const rl = createInterface({ input: process.stdout }); // BROKEN
```

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

```typescript
// ✅ Correct: append text deltas
case "text_delta":
  currentMessage.content += event.delta;

// ✅ Correct: append thinking deltas
case "thinking_delta":
  currentMessage.thinking += event.delta;
```

---

## WebSocket Protocol

### Messages

✅ Use simple `method` strings: `"session.prompt"`, `"session.start"`, `"session.abort"`
✅ Correlate requests/responses via `id` field
✅ Use `push` type for server-initiated events with `channel` field

❌ Don't use tagged unions with `_tag` field (T3 Code pattern — we're simpler)
❌ Don't use Effect Schema encode/decode — plain `JSON.parse`/`JSON.stringify`

```typescript
// ✅ PiBun style
{ "id": "req-1", "method": "session.prompt", "params": { "message": "hello" } }
{ "id": "req-1", "result": { "ok": true } }
{ "type": "push", "channel": "pi.event", "data": { ... } }

// ❌ T3 Code style (don't do this)
{ "_tag": "SessionPrompt", "message": "hello" }
```

### Channels

| Channel | Purpose |
|---------|---------|
| `pi.event` | All Pi RPC events (streaming text, tool calls, lifecycle) |
| `pi.response` | Pi command acknowledgments |
| `server.welcome` | Sent on WebSocket connect (cwd, version) |
| `server.error` | Server-level errors |

---

## TypeScript & Types

### Contracts Package (packages/contracts)

✅ Pure types — `interface`, `type`, `const enum`
✅ Zero runtime code — no functions, no classes, no `import` of runtime modules
✅ Discriminated unions for Pi events (discriminate on `type` field)

❌ No Effect Schema (T3 Code uses this — we don't)
❌ No runtime validation (Zod, etc.) — types are enough for now

### Shared Package (packages/shared)

✅ Explicit subpath exports: `@pibun/shared/jsonl`
✅ Runtime utilities that both server and web need
✅ Each export has its own module file

❌ No barrel index (`index.ts` re-exporting everything)
❌ No package-specific types — those go in contracts

---

## React Components

✅ Props-driven — components receive data, don't fetch it
✅ Tailwind for all styling — utility classes via `cn()` helper
✅ Keep components focused — one responsibility per component
✅ Zustand selectors for state — `useStore(state => state.x)`

❌ No data fetching inside components (WebSocket subscriptions happen in the store layer)
❌ No inline styles — always Tailwind utility classes
❌ No CSS modules or styled-components

```typescript
// ✅ Correct: props-driven, Tailwind
function ToolCallCard({ name, args, output, isExpanded, onToggle }: ToolCallCardProps) {
  return (
    <div className={cn("rounded-lg border", isExpanded && "bg-secondary")}>
      ...
    </div>
  );
}

// ❌ Wrong: fetches its own data, inline styles
function ToolCallCard({ toolId }: { toolId: string }) {
  const tool = useQuery(toolId); // NO — data comes via props
  return <div style={{ borderRadius: 8 }}>...</div>; // NO — use Tailwind
}
```

---

## State Management

✅ Zustand for all client state
✅ Flat slices: connection, session, messages, models, pendingExtensionUi
✅ Actions are functions inside the store that update state
✅ Selectors for derived state — avoid computing in components

❌ No Redux, no MobX, no Effect
❌ No deeply nested state — keep it flat
❌ No state duplication — single source of truth per piece of data

---

## File Organization

### Server
```
apps/server/src/
  index.ts          # Entry point — start server
  server.ts         # HTTP + WebSocket server setup
  piProcess.ts      # Single Pi RPC process wrapper
  piRpcManager.ts   # Session → PiProcess mapping
  handlers/         # WebSocket method handlers (one file per domain)
```

### Web
```
apps/web/src/
  main.tsx          # Entry point
  App.tsx           # Root component
  store.ts          # Zustand store (or store/ directory if large)
  transport.ts      # WsTransport class
  components/       # React components
    ChatView.tsx
    Composer.tsx
    Sidebar.tsx
    ToolCallCard.tsx
    ...
  lib/              # Utilities
    cn.ts           # className joiner
```

### Contracts
```
packages/contracts/src/
  index.ts          # Re-exports
  piEvents.ts       # Pi RPC event types
  piCommands.ts     # Pi RPC command types
  ws.ts             # WebSocket protocol types
  session.ts        # Session and model types
```

---

## Imports

✅ Use workspace package names: `@pibun/contracts`, `@pibun/shared/jsonl`
✅ Use `~/` or `@/` path alias for within-app imports (configure per app)
✅ Group imports: external packages → workspace packages → local modules

❌ Don't use relative paths across package boundaries (use workspace names)
❌ Don't use barrel re-exports in `packages/shared` (explicit subpath exports only)

---

## Naming

✅ PascalCase for types, interfaces, React components, classes
✅ camelCase for variables, functions, methods, properties
✅ UPPER_SNAKE_CASE for constants
✅ kebab-case for file names (match convention of the framework — React files can be PascalCase)

❌ Don't abbreviate unless universally understood (ws ✅, msg ❌ → message)

---

## Error Handling

✅ Catch and handle errors at boundaries (WebSocket handlers, Pi process events)
✅ Log errors with enough context to debug
✅ Surface errors to the UI (error banners, retry indicators)

❌ Don't swallow errors silently
❌ Don't let Pi process crashes take down the server
❌ Don't send raw error objects to the browser (sanitize)

---

## Git

✅ Commit after completing each plan item (or group of small related items)
✅ Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
✅ Commit agent system files (.plan/, .agents/, .pi/) — they're part of the project

❌ Don't commit `node_modules/`, `dist/`, `.turbo/`
❌ Don't commit reference repos (they're in .gitignore)

---

## Quick Checklist (every session)

- [ ] Read PLAN.md, MEMORY.md, DRIFT.md, CONVENTIONS.md
- [ ] Know the current phase and next unchecked item
- [ ] State what you'll do before starting
- [ ] `bun run typecheck` passes before ending
- [ ] `bun run lint` passes before ending
- [ ] Update PLAN.md checkboxes
- [ ] Update MEMORY.md with new decisions
- [ ] Update DRIFT.md if spec changed
- [ ] Write SESSION-LOG.md entry with handoff
- [ ] Append any friction to TENSIONS.md
