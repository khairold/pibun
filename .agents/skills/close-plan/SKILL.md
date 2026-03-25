---
name: close-plan
description: Close a completed .plan/ and persist valuable information into the project's own documentation. Discovers repo structure, extracts decisions/gotchas/parked items, proposes routing, gets human confirmation, writes updates, and removes .plan/. Use when a phased plan is fully complete.
---

# Close Plan

Close a completed `.plan/` directory by persisting valuable information into the project's permanent documentation, then cleaning up. This skill is project-agnostic — it discovers where things should go rather than assuming a fixed structure.

## Prerequisites

- A `.plan/` directory exists with completed plan files
- The plan is fully complete (all phases done) or the human has decided to close it early

## Step 1 — Read Plan Files

Read all `.plan/` files:

1. `.plan/PLAN.md` — completed items, parking lot
2. `.plan/MEMORY.md` — decisions, gotchas, architecture notes, technical context
3. `.plan/DRIFT.md` — spec deviations that were accepted
4. `.plan/SESSION-LOG.md` — skim for any context not captured elsewhere

## Step 2 — Extract Persistable Information

Sort everything from the plan files into these categories:

### A. Key Decisions
Decisions and their rationale that affect future work on this project. Skip decisions that were phase-specific and no longer relevant.

### B. Gotchas & Warnings
Permanent gotchas that will trip up future sessions. Skip phase-specific workarounds that no longer apply.

### C. Architecture Changes
Structural changes to the codebase — new packages, changed patterns, new conventions. Only include if the project's architecture docs don't already reflect them.

### D. Parked Items
Unchecked items from the Parking Lot section of PLAN.md. These are future work candidates.

### E. Accepted Drift
Spec changes from DRIFT.md that were accepted. The project's source of truth (spec, README, architecture docs) should reflect these if it doesn't already.

### F. Tensions
Any entries added to `.agents/TENSIONS.md` during the plan. These already live outside `.plan/` — just verify they're present.

### Discard (do not persist)
- Session log entries (ephemeral — they served their purpose)
- Completed item checklists (the work is done, the code is the record)
- Phase-specific context that's no longer relevant
- Anything already captured in the repo's permanent docs

## Step 3 — Discover Destination Candidates

Scan the repo for files that could receive persistent information. Look for:

```bash
# Common documentation files (check root, docs/, .agents/, .pi/)
find . -maxdepth 3 -type f \( \
  -name "CLAUDE.md" -o \
  -name "AGENTS.md" -o \
  -name "README.md" -o \
  -name "ARCHITECTURE.md" -o \
  -name "ROADMAP.md" -o \
  -name "CONVENTIONS.md" -o \
  -name "TENSIONS.md" -o \
  -name "ADR.md" -o \
  -name "CHANGELOG.md" -o \
  -name "TODO.md" \
\) | head -30
```

Also check for directories like `docs/`, `docs/adr/`, `.agents/`.

Read the top of each candidate file to understand its purpose and structure.

## Step 4 — Propose Routing

Present the extracted information and proposed destinations to the human in this format:

```
📋 Plan Close-Out: {plan name from PLAN.md header}

## Extracted Information

### Key Decisions ({count})
{List each decision with a one-line summary}

→ Proposed destination: {file} — {section or location within file}
  (or: ⚠️ No obvious destination found — will skip unless you specify one)

### Gotchas & Warnings ({count})
{List each gotcha}

→ Proposed destination: {file} — {section}

### Architecture Changes ({count})
{List each change}

→ Proposed destination: {file} — {section}

### Parked Items ({count})
{List each item}

→ Proposed destination: {file} — {section}
  (or: → No roadmap/TODO file found — create one? Skip?)

### Accepted Drift ({count})
{List each drift entry}

→ Proposed destination: {file} — {section}
  (or: → Already reflected in source of truth — no action needed)

### Discarding
- {count} session log entries
- {count} completed checklist items
- {other ephemeral items}

Confirm this routing, or tell me what to change.
```

**Wait for human confirmation before proceeding.**

If the human redirects items (e.g., "put parked items in TODO.md instead"), adjust accordingly. If the human says to skip a category, skip it.

## Step 5 — Execute Writes

For each confirmed routing:

1. Read the destination file fully to understand its current structure
2. Add the new information in a style consistent with the existing content — match heading levels, table formats, list styles, voice
3. Don't duplicate information already present in the destination
4. If adding to a table, continue the existing numbering
5. If a destination file doesn't exist and the human approved creating it, create it with minimal structure

**Important:** Integrate, don't append a dump. The destination file should read naturally — as if the information was always there. No "Persisted from .plan/" headers or metadata.

## Step 6 — Verify & Clean Up

1. Confirm all writes landed correctly — read back each modified file and verify the new content is present and well-integrated
2. Check that `.agents/TENSIONS.md` has any tension entries from the plan (these already live outside `.plan/`)
3. Remove the `.plan/` directory:

```bash
rm -rf .plan/
```

4. Report what was done:

```
✅ Plan closed: {plan name}

Persisted:
- {count} decisions → {file}
- {count} gotchas → {file}
- {count} parked items → {file}
- ...

Discarded:
- {count} session log entries
- {count} completed items

Cleaned up:
- .plan/ removed
```

## Rules

1. **Never persist without confirmation** — Always show the routing proposal and wait for the human to confirm. This is the critical gate.

2. **Never lose parked items silently** — Parked items are future work the human explicitly deferred. They must either be routed to a destination or the human must explicitly say to discard them.

3. **Integrate, don't dump** — Destination files should read naturally after the update. Match existing style, structure, and voice.

4. **When in doubt, ask** — If you're unsure whether something is worth persisting or where it should go, ask. Don't guess.

5. **No partial cleanup** — Either complete the full close-out (all writes confirmed and executed) then delete `.plan/`, or abort and leave everything intact. No half-states.

6. **Idempotent discovery** — If a decision or gotcha already exists in the destination file, skip it. Don't create duplicates.
