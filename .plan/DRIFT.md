# Spec Drift Log

> Track any changes, pivots, or deviations from the spec.
> When a drift is significant, update the spec itself and note it here.

---

## Changes

| # | Date | What Changed | Why | Spec Updated? |
|---|------|-------------|-----|---------------|
| 1 | 2026-03-23 | Multi-session via `WsRequest.sessionId` instead of per-method params | Adding `sessionId` to every method's params would break all existing web app call sites. Request-level `sessionId` + `WsTransport.setActiveSession()` is backward compatible and simpler. | N/A — v2 plan didn't specify implementation approach |

## Historical Drift (from v1 plan)

See `.plan/archive/DRIFT-v1.md` for drift from the original build plan.
