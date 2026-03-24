# Spec Drift Log

> Track any changes, pivots, or deviations from the original audit proposal.
> When a drift is significant, update the plan and note it here.

---

## Changes

| # | Date | What Changed | Why | Plan Updated? |
|---|------|-------------|-----|---------------|
| 1 | 2026-03-24 | Recalibrated from "save context tokens" to "reduce tool calls and co-change sets" | Context window is 1M tokens, not 200K. Entire codebase fits. Bottleneck is tool call count and file fragmentation, not token pressure. | Yes — PLAN.md motivation section reflects this |
| 2 | 2026-03-24 | `piPassthrough` helper less impactful than planned | Plan assumed non-session handlers were Pi RPC pass-throughs. In reality, they call server-side services (git, plugins, projects, settings, terminals, desktop hooks). `piPassthrough` applies only to session.ts patterns. Added helper anyway for future use but item 4.5 was a no-op. | Yes — item 4.5 noted as N/A |
