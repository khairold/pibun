# Autopilot Execute — Ralph Wiggum Technique for Pi

Unattended, iterative execution of a phased build plan. The AI agent reads the plan, does work, verifies, updates the plan, and exits — then a shell wrapper re-invokes it with a fresh context window. No human needed between iterations.

Inspired by: https://ghuntley.com/ralph/
See also: https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum

## How It Works

```
┌──────────────────────────────────────────────┐
│              autopilot.sh (loop)              │
│                                              │
│  while unchecked items remain:               │
│    ┌────────────────────────────────┐        │
│    │  pi -p (fresh context window)  │        │
│    │                                │        │
│    │  1. Read CLAUDE.md + .plan/    │        │
│    │  2. Pick next item(s)          │        │
│    │  3. Execute                    │        │
│    │  4. Verify (build gate)        │        │
│    │  5. Update .plan/ files        │        │
│    │  6. Exit                       │        │
│    └────────────────────────────────┘        │
│    git commit                                │
│    build gate (if fails → stop)              │
│    stuck detection (3x → stop)               │
│    sleep, loop                               │
└──────────────────────────────────────────────┘
```

## Prerequisites

1. A `.plan/` directory (PLAN.md, MEMORY.md, DRIFT.md, SESSION-LOG.md) — created by `phased-plan` skill
2. `CLAUDE.md` at project root — project identity and conventions
3. Pi installed and available in PATH
4. `autopilot.config` with the build command

## Usage

```bash
# Terminal 1 — Run autopilot
./autopilot.sh                        # Run until phase boundary
./autopilot.sh --phase 1              # Only Phase 1 items

# Terminal 2 — Watch progress
./autopilot-dashboard.sh              # Live dashboard with progress bars
```

### All Options

```bash
./autopilot.sh                        # Run until phase boundary
./autopilot.sh --dry-run              # Preview what would happen (no changes)
./autopilot.sh --resume               # Resume after manual fix
./autopilot.sh --phase N              # Only run items in Phase N
./autopilot.sh --max 10               # Override max iterations (default: 30)
./autopilot.sh --continuous           # Don't stop at phase boundaries
./autopilot.sh --model MODEL          # Override pi model
```

## Safety Mechanisms

| Mechanism | How |
|-----------|-----|
| **Build gate** | BUILD_CMD must pass after each iteration, or autopilot stops |
| **Stuck detection** | No new items completed for 3 consecutive iterations → stop |
| **Git checkpoints** | Pre/post commit per iteration — easy rollback with `git reset --hard` |
| **Phase boundaries** | Stops at end of each phase for human review |
| **Max iterations** | Hard cap (default 30) prevents infinite runs |
| **Notifications** | macOS TTS (`say`) + notification center alerts |

## Configuration

`autopilot.config` in project root:

```bash
BUILD_CMD="bun run typecheck && bun run lint"
PROJECT_DIR="."
```

The build command is the gate. Start simple, add more checks as the project grows.

## Three Skill Levels

| Skill | Mode | When to Use |
|-------|------|-------------|
| `phased-plan` | Planning | Turn a spec into a phased build plan |
| `execute-phase` | Human-attended | You're watching, confirming scope, reviewing |
| `autopilot-execute` | Unattended | Agent runs autonomously, you review at phase boundaries |
