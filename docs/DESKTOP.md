# Desktop (Electrobun)

## Overview

Electrobun wraps PiBun's server + web app into a native desktop application. It uses Bun as the runtime and the OS native webview (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) instead of bundling Chromium.

**Reference:** https://blackboard.sh/electrobun/docs/

## Why Electrobun

| | Electron | Electrobun |
|---|---|---|
| Runtime | Node.js + Chromium | Bun + native webview |
| Binary size | ~150MB+ | ~20MB (estimated) |
| Memory | High (Chromium overhead) | Low (native webview) |
| Ecosystem maturity | Very mature | Early but actively developed |
| Bun compatibility | Needs adaptation | Native |

PiBun already uses Bun. Electrobun is the natural fit.

## Architecture

```
Electrobun App
├── Main process (Bun)
│   ├── Start PiBun server on random available port
│   ├── Window management
│   ├── Native menus
│   ├── System tray (optional)
│   └── Auto-updater (future)
│
└── Webview (native)
    └── Loads http://localhost:<port>
        └── PiBun React app
```

### Startup Sequence

1. Electrobun main process starts
2. Find an available port
3. Start the PiBun server (embedded, same Bun process or child process)
4. Wait for server to be ready (health check endpoint)
5. Open native webview pointing at `http://localhost:<port>`
6. Webview connects via WebSocket, app is live

### Shutdown Sequence

1. User closes window or quits
2. Signal PiBun server to stop
3. Server stops all Pi RPC subprocesses (`piRpcManager.stopAll()`)
4. Clean exit

## Electrobun Integration Points

### Window Management

- Single main window (resizable, remembers position/size)
- Minimum size constraints
- Title bar shows current session name or "PiBun"
- Native window controls (close, minimize, maximize)

### Native Menus

```
PiBun
├── About PiBun
├── Check for Updates...
├── Preferences... → opens settings view in webview
├── ─────────
└── Quit PiBun

File
├── New Session          Cmd+N
├── Open Session...      Cmd+O
├── ─────────
└── Close Window         Cmd+W

Edit
├── Undo                 Cmd+Z
├── Redo                 Cmd+Shift+Z
├── ─────────
├── Cut                  Cmd+X
├── Copy                 Cmd+C
├── Paste                Cmd+V
└── Select All           Cmd+A

View
├── Toggle Sidebar       Cmd+B
├── Toggle Thinking      Cmd+T
├── ─────────
├── Zoom In              Cmd+=
├── Zoom Out             Cmd+-
└── Actual Size          Cmd+0

Session
├── Abort                Cmd+.
├── Compact Context      Cmd+Shift+K
├── Switch Model...      Cmd+L
└── Set Thinking Level   Cmd+Shift+T
```

### IPC (Main ↔ Webview)

Electrobun provides IPC between the main Bun process and the webview. We may use this for:

- Forwarding native menu actions to the React app
- File dialogs (open folder for project selection)
- System notifications
- Clipboard access for images
- Deep link handling

For most data flow, we still use WebSocket (same as browser mode). IPC is reserved for native-only capabilities.

### File Associations (Future)

- Register as handler for `.pi` session files
- Double-click a session file → opens PiBun and loads that session

## Distribution

### macOS

- `.dmg` installer
- Code signing + notarization
- Universal binary (arm64 + x64) if Electrobun supports it

### Linux

- Self-extracting installer archive (`.tar.gz`) — Electrobun's native format
  - Contains a self-extracting binary that installs to `~/.local/share/`
  - Creates a `.desktop` entry with the app's icon for launcher integration
  - No `libfuse2` dependency (unlike AppImage)
  - Supports the Electrobun auto-update mechanism (bsdiff patches)
- Build prerequisites: WebKitGTK 4.1 dev headers (for native webview)
  - Ubuntu/Debian: `apt install libwebkit2gtk-4.1-dev`
  - Fedora: `dnf install webkit2gtk4.1-devel`
  - Arch: `pacman -S webkit2gtk-4.1`
- Build command: `bun run build:desktop:linux` (must run on Linux)
- `.deb` package (future)

### Windows

- NSIS installer or `.msi`
- Code signing (future)

## Development Mode

In development:

1. Run PiBun server in dev mode (`bun run dev:server`)
2. Run Vite dev server (`bun run dev:web`)
3. Run Electrobun in dev mode, pointing webview at Vite's URL
4. Hot reload works for the React app
5. Server restarts on file changes

## Phase 2 Scope

Desktop is Phase 2. The app must work fully in the browser first (Phase 1). Electrobun integration starts only after the server + web app are stable.

### Phase 2 Milestones

1. Basic Electrobun scaffold — window opens, loads web app
2. Native menus wired to WebSocket commands
3. Server lifecycle management (start/stop with app)
4. Build pipeline for distributable binaries
5. Auto-updater integration

## Open Questions

- [ ] Electrobun's current state of Windows/Linux support — verify before committing
- [ ] IPC API surface — study Electrobun's docs for what's available
- [ ] Webview security — CSP headers, localhost-only binding
- [ ] Multi-window support — one window per project? Or single window with tabs?
- [ ] Tray icon — useful for background agent sessions?
