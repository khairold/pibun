---
name: autopilot-execute
description: Unattended execution of the next plan item(s). Reads project context and .plan/ files, executes work autonomously without human confirmation, verifies the build, updates all plan files, and exits. Designed to be invoked repeatedly by autopilot.sh wrapper.
---

# Autopilot Execute

You are running **unattended**. No human is present. Be fully autonomous.
Do not ask questions. Do not wait for confirmation. Make decisions and log them.

## Step 0 — Read Project Config

Read **`autopilot.config`** in the project root. It defines:
- `BUILD_CMD` — the command to verify the project builds (may chain multiple checks)
- `PROJECT_DIR` — the directory containing the project source (`.` for monorepos)

If `autopilot.config` does not exist, look for a `package.json` and use `bun run typecheck` as the default build command in the current directory.

## Step 1 — Orient (mandatory, fast)

Read these files **in this order**:

1. **`CLAUDE.md`** — Project identity, current state, commands, conventions
2. **`.plan/PLAN.md`** — Find current phase and next uncompleted item
3. **`.plan/MEMORY.md`** — Absorb all shared context, decisions, gotchas
4. **`.plan/DRIFT.md`** — Check for spec changes

If `CLAUDE.md` references additional files to read (AGENTS.md, CONVENTIONS.md, etc.), read those too — but be fast. Orientation should take seconds, not minutes.

Then print exactly one status line:

```
📍 Phase {N} — {Phase Name} | 📋 Next: {N.X} — {Description} | 📝 {count} items left in phase
```

## Step 2 — Scope

Look at the next unchecked item in the current phase.

**Sizing judgment:**
- If the item is **small** (create a helper function, add a config value, write a type definition) → combine it with the next 1-2 unchecked items in the same phase
- If the item is **medium** (build a module, implement a feature, create a component) → do just that item
- If the item is **large** (complex multi-file feature, integration work) → do just that item, potentially noting sub-progress
- If it's a **verification item** (e.g., "verify all endpoints work", "run full test suite") → run the checks, report results
- If it's a **CREATE TASKS item** (meta-task) → read the data source, generate the plan items, insert them, then EXIT immediately

**Announce your scope:**
```
🎯 This iteration: {N.X} — {Description} [and {N.Y} if combining]
```

**Rules:**
- NEVER pick items from the next phase. If all items in the current phase are checked, update the PLAN.md header to mark the phase complete and **EXIT immediately**. The wrapper handles phase boundaries.
- If this is the LAST item in the phase, complete it, verify exit criteria from PLAN.md, then update the plan header.

## Step 3 — Execute

Do the work. Be thorough.

**Reference material:**
- Read `CLAUDE.md` for project conventions, key file locations, and commands
- Check MEMORY.md for architectural patterns and decisions
- Check CONVENTIONS.md for build rules with ✅/❌ examples
- Always read existing source files before modifying — understand full context
- Follow patterns established in previous sessions (documented in MEMORY.md)
- When building something analogous to a reference repo pattern, read the reference first

**While executing:**
- Complete each item fully before moving to the next
- If you discover something unexpected, make a judgment call and log it in DRIFT.md
- If a file you need doesn't exist, note it and skip gracefully
- Follow the architectural patterns from MEMORY.md and CONVENTIONS.md

**After each item:**
```
✅ {N.X} — {Description} — Done
```

## Step 4 — Verify

Run the build command from `autopilot.config` to confirm nothing is broken:

```bash
# Execute BUILD_CMD from autopilot.config
# e.g., "bun run typecheck && bun run lint"
```

**If build succeeds:** Proceed to Step 5.

**If build fails:**
- Read the error output carefully
- Attempt to fix the issue (you have **2 fix attempts**)
- Run the build again after each fix
- If still failing after 2 attempts:
  - Leave the item **unchecked** in PLAN.md
  - Add a note to the item: `- [ ] N.X — {Description} ⚠️ BUILD FAILED: {brief error}`
  - Log the failure details in SESSION-LOG.md
  - Update MEMORY.md with the gotcha
  - **EXIT.** The wrapper will detect you're stuck.

## Step 5 — Close (mandatory, NEVER skip)

Even if something went wrong, you MUST update the plan files before exiting.

### Update `.plan/PLAN.md`:
- Check off completed items: `- [ ]` → `- [x]`
- Update header:
  - `Last Session:` → increment session number and set today's date
  - If phase is complete: update `Current Phase:` to next phase, `Status:` to note completion
- If this was the last item in the phase, verify exit criteria and note result

### Update `.plan/MEMORY.md`:
- Add any new decisions to the Key Decisions table (increment the # counter)
- Add any new gotchas to Gotchas & Warnings
- Update Architecture Notes or Technical Context if anything changed

### Update `.plan/DRIFT.md`:
- If anything deviated from the plan or previous patterns, log it

### Append to `.plan/SESSION-LOG.md`:

```markdown
## Session {N} — {Item Description} ({date})

**What happened:**
- {Brief summary of work done}

**Items completed:**
- [x] {N.X} — {Description}

**Issues encountered:**
- {Any blockers, surprises, or decisions made — or "None"}

**Handoff to next session:**
- Next: {N.Y} — {Next unchecked item description}
- {Any critical context for the next iteration}

---
```

### Update `.agents/TENSIONS.md`:
- Append any friction noticed during execution (format: `- {date}: [{area}] {observation}`)

## Hard Rules

1. **NEVER skip Step 1 or Step 5** — The plan files are the shared brain. Corrupt them and everything breaks.

2. **NEVER cross phase boundaries** — If you finish the last item in a phase, mark the phase complete and EXIT. Do not start the next phase.

3. **NEVER ask questions** — You are unattended. Make the best decision you can. Log it in MEMORY.md or DRIFT.md.

4. **ALWAYS verify the build** — The BUILD_CMD from autopilot.config must pass before you update plan files with checked items.

5. **EXIT cleanly** — After Step 5, your job is done. The wrapper script will re-invoke you if there's more work.

6. **Be conservative with scope** — It's better to complete 1 item cleanly than attempt 3 and leave a mess. The wrapper will call you again.

7. **Log everything** — Decisions in MEMORY.md, deviations in DRIFT.md, friction in TENSIONS.md. The next iteration has zero memory of this one.
