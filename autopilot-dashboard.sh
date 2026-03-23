#!/usr/bin/env bash
#
# autopilot-dashboard.sh — Real-time progress viewer for autopilot.sh
#
# Usage:
#   ./autopilot-dashboard.sh          # Run in a separate terminal
#   ./autopilot-dashboard.sh --once   # Print once and exit (no watch loop)
#
set -euo pipefail

PLAN_FILE=".plan/PLAN.md"
STATUS_FILE=".plan/STATUS.md"
LOG_DIR=".plan/autopilot-logs"

# ─── Dashboard render function ────────────────────────────────────────────────

render_dashboard() {
    local RESET="\033[0m"
    local BOLD="\033[1m"
    local DIM="\033[2m"
    local GREEN="\033[32m"
    local YELLOW="\033[33m"
    local RED="\033[31m"
    local BLUE="\033[34m"
    local CYAN="\033[36m"
    local ORANGE="\033[38;5;208m"
    local BG_GREEN="\033[42m"
    local BG_DIM="\033[48;5;238m"

    # ── Header ──
    echo -e "${BOLD}"
    echo "  ╔═══════════════════════════════════════════════╗"
    echo "  ║          🤖  AUTOPILOT DASHBOARD              ║"
    echo "  ╚═══════════════════════════════════════════════╝"
    echo -e "${RESET}"

    # ── Status ──
    if [[ -f "$STATUS_FILE" ]]; then
        local last_status
        last_status=$(tail -1 "$STATUS_FILE" 2>/dev/null || echo "Unknown")
        echo -e "  ${BOLD}Status:${RESET} $last_status"
    else
        echo -e "  ${BOLD}Status:${RESET} ${DIM}Not started${RESET}"
    fi
    echo ""

    # ── Overall progress ──
    if [[ ! -f "$PLAN_FILE" ]]; then
        echo -e "  ${RED}No plan file found${RESET}"
        return
    fi

    local total_done total_items total_remaining pct
    total_done=$(grep -c '^\- \[x\]' "$PLAN_FILE" 2>/dev/null || true)
    total_done=${total_done:-0}
    total_items=$(grep -c '^\- \[' "$PLAN_FILE" 2>/dev/null || true)
    total_items=${total_items:-0}
    # Subtract parking lot items from total
    local parking_items
    parking_items=$(awk '/^## Parking Lot/,0' "$PLAN_FILE" | grep -c '^\- \[' 2>/dev/null || true)
    parking_items=${parking_items:-0}
    total_items=$((total_items - parking_items))
    total_remaining=$((total_items - total_done))

    if [[ $total_items -gt 0 ]]; then
        pct=$((total_done * 100 / total_items))
    else
        pct=0
    fi

    echo -e "  ${BOLD}Overall Progress${RESET}"
    echo ""

    # Progress bar (50 chars wide)
    local bar_width=50
    local filled=$((pct * bar_width / 100))
    local empty=$((bar_width - filled))
    local bar=""
    local i

    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty; i++)); do bar+="░"; done

    if [[ $pct -ge 80 ]]; then
        echo -e "  ${GREEN}[$bar]${RESET} ${BOLD}$total_done/$total_items${RESET} (${pct}%)"
    elif [[ $pct -ge 40 ]]; then
        echo -e "  ${YELLOW}[$bar]${RESET} ${BOLD}$total_done/$total_items${RESET} (${pct}%)"
    else
        echo -e "  ${ORANGE}[$bar]${RESET} ${BOLD}$total_done/$total_items${RESET} (${pct}%)"
    fi
    echo ""

    # ── Phase breakdown (auto-detect from PLAN.md) ──
    echo -e "  ${BOLD}Phase Breakdown${RESET}"
    echo ""

    local phase_name phase_done phase_total phase_remaining phase_status
    for p in $(seq 1 20); do
        local phase_section
        phase_section=$(awk "
            /^## Phase $p /{found=1; next}
            /^## /{if(found) exit}
            found{print}
        " "$PLAN_FILE" 2>/dev/null || true)

        phase_total=$(echo "$phase_section" | grep -c '^- \[' 2>/dev/null || true)
        phase_total=${phase_total:-0}
        [[ $phase_total -eq 0 ]] && continue

        phase_done=$(echo "$phase_section" | grep -c '^- \[x\]' 2>/dev/null || true)
        phase_done=${phase_done:-0}
        phase_remaining=$((phase_total - phase_done))

        # Extract phase name from header
        phase_name=$(grep "^## Phase $p " "$PLAN_FILE" 2>/dev/null | sed "s/^## Phase $p[^—]*— //" | sed 's/^## Phase [0-9]*//' || echo "")
        phase_name=${phase_name:0:40}

        if [[ $phase_remaining -eq 0 ]]; then
            phase_status="✅"
        elif [[ $phase_done -gt 0 ]]; then
            phase_status="🔄"
        else
            phase_status="⬜"
        fi

        printf "  %s Phase %s %-40s %2d/%2d" "$phase_status" "$p" "$phase_name" "$phase_done" "$phase_total"

        # Mini progress bar (20 chars)
        if [[ $phase_total -gt 0 ]]; then
            local mini_pct=$((phase_done * 20 / phase_total))
            local mini_bar=""
            local j
            for ((j=0; j<mini_pct; j++)); do mini_bar+="▓"; done
            for ((j=mini_pct; j<20; j++)); do mini_bar+="░"; done
            echo -e " [${mini_bar}]"
        else
            echo ""
        fi
    done

    echo ""

    # ── Current item ──
    local next_item
    next_item=$(awk '/^## Parking Lot/{ exit } /^- \[ \]/{ print; exit }' "$PLAN_FILE" | sed 's/^- \[ \] //' 2>/dev/null)
    next_item=${next_item:-None}
    if [[ -n "$next_item" && "$next_item" != "None" ]]; then
        echo -e "  ${BOLD}Next Item:${RESET} $next_item"
    else
        echo -e "  ${BOLD}Next Item:${RESET} ${GREEN}All done!${RESET}"
    fi
    echo ""

    # ── Recent status lines ──
    if [[ -f "$STATUS_FILE" ]]; then
        local status_lines
        status_lines=$(wc -l < "$STATUS_FILE" 2>/dev/null || echo 0)
        echo -e "  ${BOLD}Recent Activity${RESET} ${DIM}($STATUS_FILE — $status_lines entries)${RESET}"
        echo -e "  ${DIM}─────────────────────────────────────────────────${RESET}"
        tail -8 "$STATUS_FILE" 2>/dev/null | while IFS= read -r line; do
            # Colorize based on content
            if [[ "$line" == *"FAILED"* || "$line" == *"❌"* ]]; then
                echo -e "  ${RED}$line${RESET}"
            elif [[ "$line" == *"✅"* || "$line" == *"COMPLETE"* || "$line" == *"🎉"* ]]; then
                echo -e "  ${GREEN}$line${RESET}"
            elif [[ "$line" == *"🔄"* || "$line" == *"RUNNING"* || "$line" == *"🚀"* ]]; then
                echo -e "  ${CYAN}$line${RESET}"
            elif [[ "$line" == *"⚠️"* || "$line" == *"STUCK"* ]]; then
                echo -e "  ${YELLOW}$line${RESET}"
            else
                echo -e "  ${DIM}$line${RESET}"
            fi
        done
        echo ""
    fi

    # ── Latest iteration log (last 5 lines) ──
    local latest_log
    latest_log=$(ls -t "$LOG_DIR"/iteration-*.log 2>/dev/null | head -1)
    if [[ -n "$latest_log" ]]; then
        local log_name
        log_name=$(basename "$latest_log")
        echo -e "  ${BOLD}Latest Log${RESET} ${DIM}($log_name)${RESET}"
        echo -e "  ${DIM}─────────────────────────────────────────────────${RESET}"
        tail -5 "$latest_log" 2>/dev/null | while IFS= read -r line; do
            echo -e "  ${DIM}$line${RESET}"
        done
        echo ""
    fi

    # ── Iteration stats ──
    local iter_count build_count
    iter_count=$(ls "$LOG_DIR"/iteration-*.log 2>/dev/null | grep -cv dryrun || true)
    iter_count=${iter_count:-0}
    build_count=$(ls "$LOG_DIR"/build-*.log 2>/dev/null | wc -l | tr -d ' ' || true)
    build_count=${build_count:-0}
    local failed_builds=0
    if [[ $build_count -gt 0 ]]; then
        for bf in "$LOG_DIR"/build-*.log; do
            [[ -f "$bf" ]] || continue
            if ! tail -1 "$bf" 2>/dev/null | grep -q "Complete"; then
                failed_builds=$((failed_builds + 1))
            fi
        done
    fi
    local passed_builds=$((build_count - failed_builds))

    echo -e "  ${BOLD}Stats${RESET}"
    echo -e "  Iterations: $iter_count  |  Builds: $passed_builds passed, $failed_builds failed"

    # Disk usage of logs
    if [[ -d "$LOG_DIR" ]]; then
        local log_size
        log_size=$(du -sh "$LOG_DIR" 2>/dev/null | cut -f1 || echo "?")
        echo -e "  Log size: $log_size"
    fi
    echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--once" ]]; then
    render_dashboard
    exit 0
fi

# Export function for watch to use
export PLAN_FILE STATUS_FILE LOG_DIR
export -f render_dashboard 2>/dev/null || true

# Use watch with the script itself in --once mode
echo "Starting dashboard (Ctrl+C to exit)..."
echo ""

# watch doesn't support bash functions well, so we re-invoke ourselves
watch -n 2 -c "$0 --once"
