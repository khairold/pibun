# Spec Drift Log

> Track any changes, pivots, or deviations from the spec.
> When a drift is significant, update the spec itself and note it here.

---

## Changes

| # | Date | What Changed | Why | Spec Updated? |
|---|------|-------------|-----|---------------|
| 1 | 2026-03-23 | Linux distribution format is self-extracting installer archive, not AppImage | Electrobun explicitly removed AppImage support to avoid `libfuse2` dependency. The self-extracting installer provides the same UX (download, run, done) without the FUSE requirement. Plan item 2C.3 title says "AppImage" but actual implementation uses Electrobun's native format. | Yes — `docs/DESKTOP.md` updated |
