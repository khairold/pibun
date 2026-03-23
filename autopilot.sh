#!/usr/bin/env bash
#
# autopilot.sh — Ralph Wiggum-style automated pi execution
#
# Reads autopilot.config for project-specific settings.
# See: https://ghuntley.com/ralph/
# See: https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum
#
# Usage:
#   ./autopilot.sh                    # Run until phase boundary
#   ./autopilot.sh --dry-run          # Show what would happen without executing
#   ./autopilot.sh --resume           # Resume after manual fix (same as normal)
#   ./autopilot.sh --phase 3          # Only run items in Phase 3
#   ./autopilot.sh --max 10           # Override max iterations (default: 30)
#
set -euo pipefail

# ─── Configuration defaults ───────────────────────────────────────────────────
MAX_ITERATIONS=300
STUCK_THRESHOLD=3
SLEEP_BETWEEN=5
PLAN_DIR=".plan"
PLAN_FILE="$PLAN_DIR/PLAN.md"
STATUS_FILE="$PLAN_DIR/STATUS.md"
LOG_DIR="$PLAN_DIR/autopilot-logs"
SKILL_PATH=".agents/skills/autopilot-execute"
DRY_RUN=false
CONTINUOUS=false
TARGET_PHASE=""
PI_MODEL=""  # empty = use default

# Project-specific settings (overridden by autopilot.config)
BUILD_CMD="npm run build"
PROJECT_DIR="."

# ─── Load project config ─────────────────────────────────────────────────────
CONFIG_FILE="autopilot.config"
if [[ -f "$CONFIG_FILE" ]]; then
    # Source the config file (key=value format)
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    echo "📋 Loaded config from $CONFIG_FILE"
else
    echo "⚠️  No autopilot.config found — using defaults (BUILD_CMD='$BUILD_CMD')"
    echo "   Create one with:"
    echo "     BUILD_CMD=\"npm run build\""
    echo "     PROJECT_DIR=\".\""
    echo ""
fi

# ─── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)     DRY_RUN=true; shift ;;
        --continuous)  CONTINUOUS=true; shift ;;
        --resume)      shift ;;  # no-op, same as normal (plan files track state)
        --phase)       TARGET_PHASE="$2"; shift 2 ;;
        --max)         MAX_ITERATIONS="$2"; shift 2 ;;
        --model)       PI_MODEL="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: ./autopilot.sh [--dry-run] [--continuous] [--resume] [--phase N] [--max N] [--model MODEL]"
            echo ""
            echo "Options:"
            echo "  --dry-run     Show what each iteration would do, don't execute"
            echo "  --continuous  Don't stop at phase boundaries — run through all phases"
            echo "  --resume      Resume after manual fix (reads plan state, continues)"
            echo "  --phase N     Only run items in Phase N (stop at phase boundary)"
            echo "  --max N       Max iterations (default: 30)"
            echo "  --model M     Override pi model (default: use pi's default)"
            echo ""
            echo "Configuration:"
            echo "  Create autopilot.config in project root with:"
            echo "    BUILD_CMD=\"cd my-app && npm run build\""
            echo "    PROJECT_DIR=\".\""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─── Preflight checks ────────────────────────────────────────────────────────
if [[ ! -f "$PLAN_FILE" ]]; then
    echo "❌ No plan file found at $PLAN_FILE"
    echo "   Create a phased plan first: pi \"create a phased plan for this project\""
    exit 1
fi

if ! command -v pi &>/dev/null; then
    echo "❌ pi not found in PATH"
    exit 1
fi

if [[ ! -d "$SKILL_PATH" ]]; then
    echo "❌ Skill not found at $SKILL_PATH"
    echo "   Copy it: cp -r ~/Codes/Pi/second-brain/.agents/skills/autopilot-execute .agents/skills/"
    exit 1
fi

mkdir -p "$LOG_DIR"
touch "$STATUS_FILE"

# ─── Helper functions ─────────────────────────────────────────────────────────

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

short_time() {
    date '+%H:%M:%S'
}

# Count total checked items in plan (excluding Parking Lot)
count_done() {
    local count
    count=$(awk '/^## Parking Lot/{ exit } /^- \[x\]/' "$PLAN_FILE" | grep -c '^- \[x\]' 2>/dev/null || true)
    echo "${count:-0}"
}

# Count total unchecked items in plan (excluding Parking Lot)
count_remaining() {
    local count
    count=$(awk '/^## Parking Lot/{ exit } /^- \[ \]/' "$PLAN_FILE" | grep -c '^- \[ \]' 2>/dev/null || true)
    echo "${count:-0}"
}

# Count unchecked items in a specific phase
count_phase_remaining() {
    local phase="$1"
    local count
    count=$(awk "
        /^## Phase $phase /{found=1; next}
        /^## /{if(found) exit}
        found{print}
    " "$PLAN_FILE" | grep -c '^- \[ \]' 2>/dev/null || true)
    echo "${count:-0}"
}

# Get current phase number from plan header
get_current_phase() {
    local phase_num
    phase_num=$(grep 'Current Phase' "$PLAN_FILE" 2>/dev/null | grep -o 'Phase [0-9]' | grep -o '[0-9]' | head -1)
    if [[ -n "$phase_num" ]]; then
        echo "$phase_num"
        return
    fi
    # Fallback: find first phase with unchecked items
    for p in 1 2 3 4 5 6 7 8 9; do
        if [[ $(count_phase_remaining "$p") -gt 0 ]]; then
            echo "$p"
            return
        fi
    done
    echo "0"
}

# Write to status file (append + print)
status() {
    local msg="$1"
    local line="$(short_time) $msg"
    echo "$line" >> "$STATUS_FILE"
    echo "$line"
}

# Send notifications
notify() {
    local msg="$1"
    status "$msg"

    # macOS text-to-speech (background, don't block)
    if command -v say &>/dev/null; then
        say "$msg" &
    fi

    # macOS notification center
    if command -v osascript &>/dev/null; then
        osascript -e "display notification \"$msg\" with title \"🤖 Autopilot\"" 2>/dev/null || true
    fi
}

# Git checkpoint
git_checkpoint() {
    local msg="$1"
    git add -A 2>/dev/null || true
    git commit -m "$msg" --allow-empty -q 2>/dev/null || true
}

# ─── Initialize ───────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🤖 AUTOPILOT — Ralph Wiggum Mode"
echo "═══════════════════════════════════════════════════"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "  ⚡ MODE: DRY RUN (no changes)"
elif [[ "$CONTINUOUS" == true ]]; then
    echo "  ⚡ MODE: CONTINUOUS (no phase boundary stops)"
else
    echo "  ⚡ MODE: LIVE EXECUTION (stops at phase boundaries)"
fi

total_done=$(count_done)
total_remaining=$(count_remaining)
total=$((total_done + total_remaining))
current_phase=$(get_current_phase)

echo "  📊 Progress: $total_done/$total items done ($total_remaining remaining)"
echo "  📍 Current phase: $current_phase"
echo "  🔄 Max iterations: $MAX_ITERATIONS"
echo "  🚨 Stuck threshold: $STUCK_THRESHOLD"
echo "  🔨 Build command: $BUILD_CMD"

if [[ -n "$TARGET_PHASE" ]]; then
    echo "  🎯 Target phase: $TARGET_PHASE only"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo ""

# Initialize status file
echo "$(timestamp) ═══ AUTOPILOT STARTED ═══" > "$STATUS_FILE"
echo "$(short_time) Mode: $(if [[ "$DRY_RUN" == true ]]; then echo "DRY RUN"; else echo "LIVE"; fi)" >> "$STATUS_FILE"
echo "$(short_time) Progress: $total_done/$total ($total_remaining remaining)" >> "$STATUS_FILE"

if [[ "$total_remaining" -eq 0 ]]; then
    notify "✅ All plan items already complete! Nothing to do."
    exit 0
fi

# ─── Main loop ────────────────────────────────────────────────────────────────

last_done_count=$total_done
stuck_counter=0
iteration=0
start_time=$(date +%s)

while [[ $iteration -lt $MAX_ITERATIONS ]]; do
    iteration=$((iteration + 1))

    # ── Check remaining work ──
    remaining=$(count_remaining)
    if [[ $remaining -eq 0 ]]; then
        notify "🎉 All plan items complete!"
        break
    fi

    # ── Check current phase ──
    current_phase=$(get_current_phase)

    # If targeting a specific phase, check if we've moved past it
    if [[ -n "$TARGET_PHASE" && "$current_phase" != "$TARGET_PHASE" ]]; then
        notify "🎯 Phase $TARGET_PHASE complete (now at Phase $current_phase). Stopping."
        break
    fi

    # ── Check phase boundary ──
    phase_remaining=$(count_phase_remaining "$current_phase")
    if [[ $phase_remaining -eq 0 ]]; then
        if [[ "$CONTINUOUS" == true ]]; then
            notify "🏁 Phase $current_phase complete! Continuing to next phase (--continuous)..."
        else
            notify "🏁 Phase $current_phase complete! Pausing at phase boundary for human review."
            echo ""
            echo "  To continue to the next phase:"
            echo "    ./autopilot.sh --resume"
            echo ""
            echo "  To continue a specific phase:"
            echo "    ./autopilot.sh --phase $((current_phase + 1))"
            echo ""
            echo "  To run through all phases without stopping:"
            echo "    ./autopilot.sh --continuous"
            echo ""
            break
        fi
    fi

    # ── Status update ──
    elapsed=$(( $(date +%s) - start_time ))
    elapsed_min=$((elapsed / 60))
    status "🔄 Iteration $iteration/$MAX_ITERATIONS — Phase $current_phase — $phase_remaining items left in phase ($remaining total) — ${elapsed_min}m elapsed"

    # ── Git pre-checkpoint ──
    if [[ "$DRY_RUN" != true ]]; then
        git_checkpoint "autopilot: pre-iteration $iteration (Phase $current_phase, $remaining remaining)"
    fi

    # ── Build pi command ──
    PI_CMD=(pi -p --no-session)

    # Add skill
    PI_CMD+=(--skill "$SKILL_PATH")

    # Add model override if specified
    if [[ -n "$PI_MODEL" ]]; then
        PI_CMD+=(--model "$PI_MODEL")
    fi

    # ── Execute pi ──
    if [[ "$DRY_RUN" == true ]]; then
        status "  🔍 DRY RUN: Asking pi what it would do..."
        "${PI_CMD[@]}" \
            "DRY RUN MODE. Read all .plan/ files (PLAN.md, MEMORY.md, DRIFT.md). Report: 1) Current phase and next unchecked item(s), 2) What you would execute, 3) Estimated scope (small/medium/large). Do NOT execute any code changes. Do NOT update plan files." \
            2>&1 | tee "$LOG_DIR/iteration-${iteration}-dryrun.log"

        echo ""
        status "  ✅ DRY RUN iteration $iteration complete"
    else
        status "  🚀 Launching pi (iteration $iteration)..."
        set +e
        "${PI_CMD[@]}" \
            "Execute the next item(s) from the plan. You are running unattended — be fully autonomous. Read all .plan/ files first, do the work, verify the build, update all plan files, then exit." \
            2>&1 | tee "$LOG_DIR/iteration-${iteration}.log"
        pi_exit=$?
        set -e

        if [[ $pi_exit -ne 0 ]]; then
            status "  ⚠️  pi exited with code $pi_exit"
        fi

        # ── Build verification gate ──
        status "  🔨 Verifying build..."
        set +e
        ( eval "$BUILD_CMD" ) > "$LOG_DIR/build-${iteration}.log" 2>&1
        build_exit=$?
        set -e

        if [[ $build_exit -ne 0 ]]; then
            notify "❌ Build FAILED at iteration $iteration! Check $LOG_DIR/build-${iteration}.log"
            echo ""
            echo "  Last 20 lines of build output:"
            tail -20 "$LOG_DIR/build-${iteration}.log"
            echo ""
            echo "  To fix and resume:"
            echo "    1. Fix the issue manually"
            echo "    2. Run: ./autopilot.sh --resume"
            echo ""
            echo "  To rollback:"
            echo "    git log --oneline | grep 'pre-iteration $iteration'"
            echo "    git reset --hard <sha>"
            echo ""
            break
        else
            build_pages=$(grep -oP 'Complete.*?(\d+) page' "$LOG_DIR/build-${iteration}.log" | grep -oP '\d+' | tail -1 || echo "?")
            build_time=$(grep -oP '\d+\.\d+s' "$LOG_DIR/build-${iteration}.log" | tail -1 || echo "?")
            status "  ✅ Build passed ($build_pages pages in $build_time)"
        fi

        # ── Stuck detection ──
        new_done_count=$(count_done)
        if [[ $new_done_count -eq $last_done_count ]]; then
            stuck_counter=$((stuck_counter + 1))
            status "  ⚠️  No new items completed (stuck counter: $stuck_counter/$STUCK_THRESHOLD)"

            if [[ $stuck_counter -ge $STUCK_THRESHOLD ]]; then
                notify "🔄 STUCK — Same item failed $STUCK_THRESHOLD times. Human intervention needed."
                echo ""
                echo "  The agent has tried $STUCK_THRESHOLD times without completing a new item."
                echo "  Check the recent logs:"
                echo "    cat $LOG_DIR/iteration-${iteration}.log"
                echo ""
                echo "  To fix and resume:"
                echo "    1. Review what's blocking the current item"
                echo "    2. Fix manually or adjust the plan"
                echo "    3. Run: ./autopilot.sh --resume"
                echo ""
                break
            fi
        else
            items_completed=$((new_done_count - last_done_count))
            status "  📦 Completed $items_completed item(s) (total: $new_done_count)"
            stuck_counter=0
            last_done_count=$new_done_count
        fi

        # ── Git post-checkpoint ──
        git_checkpoint "autopilot: iteration $iteration — $new_done_count items done (Phase $current_phase)"
    fi

    # ── Inter-iteration pause ──
    if [[ $iteration -lt $MAX_ITERATIONS ]]; then
        remaining_after=$(count_remaining)
        if [[ $remaining_after -gt 0 ]]; then
            status "  💤 Sleeping ${SLEEP_BETWEEN}s before next iteration..."
            sleep $SLEEP_BETWEEN
        fi
    fi
done

# ─── Final summary ────────────────────────────────────────────────────────────

end_time=$(date +%s)
total_elapsed=$(( end_time - start_time ))
total_min=$((total_elapsed / 60))
total_sec=$((total_elapsed % 60))
final_done=$(count_done)
final_remaining=$(count_remaining)
items_this_run=$((final_done - total_done))

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🤖 AUTOPILOT SUMMARY"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Iterations:      $iteration"
echo "  Items completed: $items_this_run (this run)"
echo "  Total progress:  $final_done/$total ($final_remaining remaining)"
echo "  Time elapsed:    ${total_min}m ${total_sec}s"
echo "  Logs:            $LOG_DIR/"
echo ""

if [[ $final_remaining -eq 0 ]]; then
    notify "🎉 ALL DONE! $total items complete in ${total_min}m ${total_sec}s"
elif [[ $iteration -ge $MAX_ITERATIONS ]]; then
    notify "⏰ Max iterations ($MAX_ITERATIONS) reached. $final_remaining items remaining."
fi

echo "$(timestamp) ═══ AUTOPILOT FINISHED — $items_this_run items in $iteration iterations (${total_min}m ${total_sec}s) ═══" >> "$STATUS_FILE"
