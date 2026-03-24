# PiBun 🥧

A minimal desktop GUI for the [Pi coding agent](https://github.com/badlogic/pi-mono), built with [Electrobun](https://blackboard.sh/electrobun/docs/).

## What is this?

PiBun gives Pi a visual interface — streaming conversations, tool output, session management, model switching — all in a native desktop app powered by Electrobun's Bun-native webview.

Inspired by [T3 Code](https://github.com/pingdotgg/t3code), but purpose-built for Pi.

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐     stdio/JSONL     ┌─────────┐
│  React UI   │ ◄──────────────────►│  Bun Server  │ ◄──────────────────►│ pi --rpc│
│  (Vite)     │                     │              │                     │         │
│  Chat, Tools│                     │ piRpcManager  │                     │ LLM API │
│  Sessions   │                     │ wsServer      │                     │ Tools   │
└─────────────┘                     └──────────────┘                     └─────────┘
         ▲                                  ▲
         └──────── Electrobun webview ──────┘
```

- **Server** spawns `pi --mode rpc` as a subprocess, bridges JSONL ↔ WebSocket
- **Web** renders conversations, tool calls, and session controls
- **Desktop** wraps both in an Electrobun native app

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design and package roles |
| [Desktop](docs/DESKTOP.md) | Electrobun integration and distribution |
| [Code Signing](docs/CODE_SIGNING.md) | macOS code signing & notarization |
| [Roadmap](docs/ROADMAP.md) | Delivery history and parking lot |

## Status

🚧 Active development — functional desktop app with chat, terminal, git, plugins, themes.
