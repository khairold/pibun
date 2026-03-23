# Tensions

> Living friction log. Append observations during work. Don't solve them here — just capture the signal.
> Format: `- {date}: [{area}] {observation}`

---

- 2026-03-23: [tooling] Biome writes JSON files with tabs but the `write` tool outputs spaces — every new file needs a `bun run format` pass afterward. Minor friction but consistent.
- 2026-03-23: [tooling] Turbo 2.8+ broke backward compat with `packageManager` requirement — t3code reference was slightly stale here.
- 2026-03-23: [tooling] Biome organizeImports has opinions about `node:` builtin ordering that differ from typical convention — need to remember `node:` first when writing imports.
- 2026-03-23: [docs] Pi RPC docs in our PI_INTEGRATION.md show command format with `"command"` field, but actual Pi 0.61.1 uses `"type"` field for commands. Our docs may need correction in Phase 1A.
- 2026-03-23: [tooling] `noUncheckedIndexedAccess` + Biome `noNonNullAssertion` creates friction in test files — can't use `arr[0]` (TS error) or `arr[0]!` (Biome error). Need a `lineAt()` helper pattern.
- 2026-03-23: [tooling] TS project references + `composite: true` conflict with Bun's direct `.ts` exports pattern. Packages export source `.ts` files, but project references expect compiled `.d.ts` in dist/. Solution: don't use project references in app tsconfigs — let Bun's module resolution handle it.
- 2026-03-23: [tooling] Biome `useLiteralKeys` + `organizeImports` add small friction when writing code — bracket notation for env vars and import ordering of `type` vs value imports are unintuitive at first.
- 2026-03-23: [plan] Several items in Phase 1C (1C.10, 1C.12, 1C.14) were already implemented by the time they came up for execution. Plan granularity may need adjustment — or items should be checked off as side-effects of earlier work when they're clearly done.
- 2026-03-23: [deps] react-markdown v10 changed export format (default vs named) — documentation/examples online still show v9 patterns. Version-specific API checks needed.
- 2026-03-23: [tooling] Biome's static analysis for a11y can't track `alt` attribute through prop spreading — had to restructure img component to not spread `...props`.
- 2026-03-23: [architecture] Pi RPC has no `list_sessions` command, which limits session switching UX. Need server-side session directory scanning or Pi protocol extension for proper session management.
- 2026-03-23: [architecture] Server-side session listing reads Pi's internal file structure (`~/.pi/agent/sessions/`). This is a coupling to Pi's implementation details — if Pi changes its session storage format, our listing breaks. Acceptable for now but fragile long-term.
- 2026-03-23: [deps] Electrobun distributes raw `.ts` source files instead of compiled `.d.ts` — this means `skipLibCheck` is ineffective for suppressing type errors in Electrobun code. Had to disable `exactOptionalPropertyTypes` in the desktop package. Third-party TS types leak into our strict checking.
- 2026-03-23: [types] Desktop importing server `.ts` source files means server code is typechecked under desktop's tsconfig (different `lib`, different strictness). DOM lib overrides Bun-specific type augmentations (e.g., `ReadableStream[Symbol.asyncIterator]`). Cross-package `.ts` imports are convenient but create hidden type environment conflicts.
