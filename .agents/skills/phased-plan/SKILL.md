---
name: phased-plan
description: Turn a project specification into a phased build plan with session management. Creates a .plan/ directory with PLAN.md, MEMORY.md, DRIFT.md, and SESSION-LOG.md. Use when starting a new project that needs to be built across multiple sessions.
---

# Phased Plan

Create a phased build plan from a project specification. This skill establishes a file system convention for managing multi-session builds with shared memory and context continuity.

## When to Use

- A project spec exists but needs to be broken into buildable phases
- Work will span multiple sessions and needs context continuity
- You need to prevent context rot across sessions

## Process

### 1. Read the Spec

Read the project specification file (usually `SPEC.md`, `docs/`, or similar) and understand the full scope.

Also read existing project context if present:
- `CLAUDE.md` — project identity and conventions
- `.pi/AGENTS.md` — agent capabilities and playbooks
- `.agents/CONVENTIONS.md` — build rules and patterns

### 2. Decompose into Phases

Break the spec into **3-8 phases** following these rules:

- Each phase is **self-contained and testable** — it delivers working functionality
- Each phase **builds on the previous** — no forward dependencies
- Each phase is **completable in 1-3 sessions** — if too large, split further
- Each phase has **clear exit criteria** — how do you know it's done?
- Order by **dependency** first, then value

**Sub-phases** (e.g., `1A`, `1B`, `1C`) are useful when a major phase has distinct sub-deliverables that should be reviewed independently. Use when:
- A phase has 15+ items that naturally group into 2-3 sub-deliverables
- You want autopilot to pause between sub-deliverables for review
- Different sub-phases need different expertise or context

### 3. Create .plan/ Directory

Create the following files:

#### `.plan/PLAN.md` — Master Plan

```markdown
# {Project Name} — Build Plan

> **Spec:** {path to spec or description}
> **Status:** Not Started
> **Current Phase:** —
> **Last Session:** —

---

## Session Protocol

### At the START of every session:
1. Read `.plan/PLAN.md` (this file) — know where we are
2. Read `.plan/MEMORY.md` — absorb shared context and decisions
3. Read `.plan/DRIFT.md` — check for spec changes
4. Read `.agents/CONVENTIONS.md` — build patterns (if exists)
5. Identify the next uncompleted phase/item
6. State what you will do this session before starting

### At the END of every session:
1. Update item checkboxes in this file
2. Update `MEMORY.md` with anything the next session needs to know
3. Update `DRIFT.md` if any spec changes occurred
4. Log the session in `SESSION-LOG.md`
5. Write a **Handoff** note at the bottom of the session log entry
6. Run the build gate command (when applicable)

---

## Phase N — {Name}

**Goal:** {One sentence describing what this phase delivers}

- [ ] N.1 — {Item description}
- [ ] N.2 — {Item description}
- ...

**Exit criteria:** {How you know this phase is done}

---

## Parking Lot

Items discussed but deferred.

- [ ] {Future item}
```

#### `.plan/MEMORY.md` — Shared Context

```markdown
# Shared Memory

> Context and decisions that **every session must know**. Read this at the start of every session.

---

## Key Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | {Decision} | {Why} | {Date} |

## Architecture Notes

{Key technical context — stack, patterns, directory structure}

## Gotchas & Warnings

{Things that tripped us up or will trip up future sessions}

## Technical Context

{Paths, commands, dependencies, environment info}
```

#### `.plan/DRIFT.md` — Spec Changes

```markdown
# Spec Drift Log

> Track any changes, pivots, or deviations from the spec.
> When a drift is significant, update the spec itself and note it here.

---

## Changes

| # | Date | What Changed | Why | Spec Updated? |
|---|------|-------------|-----|---------------|
| — | — | No changes yet | — | — |
```

#### `.plan/SESSION-LOG.md` — Session History

```markdown
# Session Log

> Chronological record of each build session.

---

## Session 0 — Planning ({date})

**What happened:**
- {Summary of planning session}

**Items completed:**
- [x] Spec reviewed
- [x] .plan/ created

**Handoff to next session:**
- Start with Phase 1
- {Key question or context for next session}

---
```

### 4. Decomposition Guidelines

**Good phase boundaries:**
- After this phase, something new works end-to-end
- The phase touches a cohesive set of concerns
- Testing/verification is possible without future phases
- A human can review and confirm before the next phase starts

**Bad phase boundaries:**
- "Set up half the database" (not testable alone)
- Phase depends on something not yet built
- Too many unrelated items lumped together
- No way to verify the phase works

**Item granularity:**
- Each item is **one task** (5-30 minutes of agent work)
- If you can't describe it in one line, split it
- Items within a phase can depend on each other (sequential)
- **5-10 items per phase** is the sweet spot — fewer than 5 means the phase is too thin, more than 15 means it should be split

**Item numbering:**
- Simple phases: `1.1`, `1.2`, `1.3`, ...
- Sub-phased: `1A.1`, `1A.2`, ... `1B.1`, `1B.2`, ...
- Generated items (from meta-tasks): `3.4a`, `3.4b`, `3.4c`, ...

### 5. Populate Memory

Extract from the planning conversation and existing project docs:
- All key decisions and their rationale (the "why" matters more than the "what")
- Architecture choices and directory structure
- Technical context (paths, build commands, versions)
- Any known risks, open questions, or gotchas
- Reference material locations (docs, example code, related projects)

### 6. Advanced: Meta-Tasks

For data-dependent pipelines where you can't write all items upfront, use **CREATE TASKS** items:

```markdown
- [ ] 3.4 — CREATE TASKS: Read output from Phase 2,
      generate per-entity extraction items below.
      Then EXIT — autopilot will execute the new items.

*(Items will be inserted here by 3.4)*
```

The agent reads data, generates concrete executable items, inserts them into the plan, and exits. Autopilot picks up the generated items in subsequent iterations.

Use this when:
- Task count depends on data the agent hasn't processed yet
- Each generated task follows the same template but with different inputs
- Writing all items upfront would be speculative

### 7. Create autopilot.config

If the project will use autopilot for unattended execution:

```bash
# autopilot.config
BUILD_CMD="bun run typecheck && bun run lint"
PROJECT_DIR="."
```

The build command is the **gate** — autopilot stops if it fails. Start simple (typecheck), add more checks as the project grows (lint, test, build).
