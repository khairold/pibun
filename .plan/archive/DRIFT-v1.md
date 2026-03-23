# Spec Drift Log

> Track any changes, pivots, or deviations from the spec.
> When a drift is significant, update the spec itself and note it here.

---

## Changes

| # | Date | What Changed | Why | Spec Updated? |
|---|------|-------------|-----|---------------|
| 1 | 2026-03-23 | Linux distribution format is self-extracting installer archive, not AppImage | Electrobun explicitly removed AppImage support to avoid `libfuse2` dependency. The self-extracting installer provides the same UX (download, run, done) without the FUSE requirement. Plan item 2C.3 title says "AppImage" but actual implementation uses Electrobun's native format. | Yes — `docs/DESKTOP.md` updated |
| 2 | 2026-03-23 | Windows distribution uses self-extracting exe, not NSIS installer | Electrobun uses its own self-extracting exe format for all platforms. Plan item 2C.4 says "NSIS installer" but actual implementation uses Electrobun's native installer (exe with embedded icon via rcedit, metadata JSON, tar.zst archive, wrapped in zip). Same pattern as Linux drift #1. | Yes — `docs/DESKTOP.md` updated |
