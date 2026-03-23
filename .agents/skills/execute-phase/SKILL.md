---
name: execute-phase
description: Human-attended execution of the next plan phase. Reads .plan/ files to orient, proposes scope for confirmation, executes items, verifies the build, and updates all plan files. Use when resuming work on a multi-session project with the human present.
---

# Execute Phase

Resume a multi-session project by reading the plan state, executing the next phase, and maintaining context continuity. The human is present — confirm scope before executing, ask when blocked.

## Step 1 — Orient (Read Plan State)

Read these files in order:

1. **`CLAUDE.md`** — Project identity, current state, key files, commands
2. **`.plan/PLAN.md`** — Find the current phase and next uncompleted item
3. **`.plan/MEMORY.md`** — Absorb all shared context, decisions, gotchas
4. **`.plan/DRIFT.md`** — Check for any spec changes since last session
5. **`.agents/CONVENTIONS.md`** — Build patterns and rules (if exists)

Then state clearly:
```
📍 Current Phase: {N} — {Name}
📋 Next Item: {N.X} — {Description}
📝 Items remaining in phase: {count}
⚠️  Gotchas to watch: {any relevant from MEMORY.md}
```

## Step 2 — Plan the Session

Before writing any code, state:
- What items you will tackle this session
- Any open questions that need resolving first
- Any risks or dependencies

**Wait for user confirmation before proceeding.**

## Step 3 — Execute

Work through items sequentially:
- Complete each item fully before moving to the next
- Test as you go — don't batch all testing to the end
- If you hit a blocker, note it and **ask the user**
- If something doesn't match the spec, **flag it** — don't silently diverge
- Follow patterns from MEMORY.md and CONVENTIONS.md

After completing each item, note it:
```
✅ {N.X} — {Description} — Done
```

### Build Gate

After completing items, run the project's build/verify command:

```bash
# Read BUILD_CMD from autopilot.config, or use project defaults
# e.g., bun run typecheck && bun run lint
```

If the build fails:
- Read the error output
- Fix the issue
- Re-run until it passes
- If stuck, ask the user for help

## Step 4 — Check Exit Criteria

When all items in the phase are complete, verify the **exit criteria** from PLAN.md:
- Run any tests or build commands
- Demonstrate the working functionality
- Confirm with the user

## Step 5 — Close Session (Update Plan Files)

This step is **mandatory**. Do not skip.

#### Update `.plan/PLAN.md`:
- Check off completed items: `- [ ]` → `- [x]`
- Update header metadata:
  - `Status:` → "In Progress" or "Phase N Complete"
  - `Current Phase:` → Current or next phase number
  - `Last Session:` → Session number and today's date

#### Update `.plan/MEMORY.md`:
- Add any new decisions to the Key Decisions table (increment the # counter)
- Add any new gotchas to Gotchas & Warnings
- Update Architecture Notes if anything structural changed
- Update Technical Context with new paths, commands, etc.

#### Update `.plan/DRIFT.md`:
- If anything deviated from the spec or plan, log it
- If the spec itself was updated, note that too

#### Append to `.plan/SESSION-LOG.md`:

```markdown
## Session {N} — Phase {X}: {Phase Name} ({date})

**What happened:**
- {Summary of work done}

**Items completed:**
- [x] {N.X} — {Description}
- [x] {N.Y} — {Description}

**Issues encountered:**
- {Any blockers, surprises, or decisions made — or "None"}

**Handoff to next session:**
- Next: {next unchecked item or next phase}
- {Critical context the next session needs immediately}
- {Any open questions to resolve}

---
```

#### Update `.agents/TENSIONS.md`:
- Append any friction noticed during the session

## Rules

1. **Never skip the orient step** — Even if you think you remember, read the files. Context from a previous session is unreliable.

2. **Never skip the close step** — The next session depends on accurate plan files. This is the shared memory.

3. **Flag drift, don't hide it** — If you need to change something from the spec, say so explicitly and log it.

4. **One phase per session** — Don't start the next phase in the same session. Close cleanly and let the next session start fresh.

5. **Ask before big decisions** — If you discover something that changes the approach, stop and discuss with the user before proceeding.

6. **Test at phase boundaries** — Every phase should end with working, verified functionality.

7. **Build gate is mandatory** — The build/typecheck command must pass before you mark items complete.
