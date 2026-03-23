# Reference Repositories

This folder contains cloned repositories for reference purposes. These are **read-only references** — do not edit files here. They are gitignored and not part of the pibun codebase.

## Repositories

### Electrobun
- **Path:** `reference/electrobun/`
- **Repo:** https://github.com/blackboardsh/electrobun
- **What it is:** A framework for building ultra-fast, lightweight desktop apps with TypeScript/Bun. Uses a native webview (not Electron/Chromium). Bundles Bun as the runtime.
- **Key folders:** `package/` (core framework), `templates/` (app templates), `kitchen/` (example app), `scripts/` (build scripts)
- **Useful for:** Understanding native desktop app architecture, webview integration, Bun runtime bundling, IPC patterns.

### T3 Code
- **Path:** `reference/t3code/`
- **Repo:** https://github.com/pingdotgg/t3code
- **What it is:** A minimal web GUI for coding agents (Codex, Claude). Built as a monorepo.
- **Key folders:** `apps/` (applications), `packages/` (shared packages), `docs/` (documentation), `scripts/` (build/dev scripts)
- **Useful for:** Understanding coding agent UI patterns, monorepo structure, agent integration.

## Updating

To pull latest changes:
```bash
cd reference/electrobun && git pull
cd reference/t3code && git pull
```

## Adding more references

```bash
cd reference
git clone <repo-url>
```
Then update this README.
